"""Bounded operator-selected inputs and descriptor-anchored staged JSON I/O.

Explicit CLI input paths remain supported, including ordinary external exports.
No URL, symlink ancestor, special file or linked input is an authorized export.
"""
from contextlib import contextmanager
import os
from pathlib import Path
import secrets
import stat

DATA_FILES = ('stories.json', 'people.json', 'moments.json', 'museum.json',
              'import-ledger.json', 'people-addenda.json')
MAX_DATA_BYTES = 16 * 1024 * 1024


@contextmanager
def held_directory(path):
    selected = Path(path)
    if '..' in selected.parts or len(os.fspath(selected)) > 4096:
        raise ValueError('Import directory traversal is not allowed')
    absolute = Path(os.path.abspath(selected))
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    descriptor = os.open(absolute.anchor, flags)
    try:
        for part in absolute.parts[1:]:
            child = os.open(part, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        yield descriptor
    finally:
        os.close(descriptor)


def regular_bytes(directory, name, maximum):
    if Path(name).name != name or name in ('.', '..') or not name:
        raise ValueError('A single import filename is required')
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    with os.fdopen(descriptor, 'rb') as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > maximum:
            raise ValueError('Import must be a bounded ordinary file with one hard link')
        body = stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
        if (len(body) > maximum or len(body) != before.st_size or
                (before.st_size, before.st_mtime_ns, before.st_ctime_ns) !=
                (after.st_size, after.st_mtime_ns, after.st_ctime_ns) or after.st_nlink != 1):
            raise ValueError('Import changed during its bounded read')
        return body


def read_export(path, suffixes, maximum):
    selected = Path(path)
    if selected.suffix.lower() not in suffixes:
        raise ValueError('Unsupported reviewed import type')
    with held_directory(selected.parent) as directory:
        return regular_bytes(directory, selected.name, maximum)


def read_data_file(directory, name):
    if name not in DATA_FILES:
        raise ValueError('Staged input filename is not allowlisted')
    return regular_bytes(directory, name, MAX_DATA_BYTES).decode('utf-8')


def replace_data_files(directory, payloads):
    # All names/targets and payload sizes are checked before staging any output.
    for name, payload in payloads.items():
        if name not in DATA_FILES or not isinstance(payload, str) or len(payload.encode('utf-8')) > MAX_DATA_BYTES:
            raise ValueError('Staged output is not allowlisted or bounded')
        try:
            info = os.stat(name, dir_fd=directory, follow_symlinks=False)
        except FileNotFoundError:
            continue
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise ValueError('Staged targets must be ordinary file with one hard links')
    temporary = []
    try:
        for name, payload in payloads.items():
            temp = '.verified-import-' + secrets.token_hex(12) + '.tmp'
            descriptor = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
            temporary.append((temp, name))
            with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
        for temp, name in temporary:
            os.replace(temp, name, src_dir_fd=directory, dst_dir_fd=directory)
        os.fsync(directory)
    finally:
        for temp, _ in temporary:
            try:
                os.unlink(temp, dir_fd=directory)
            except FileNotFoundError:
                pass
