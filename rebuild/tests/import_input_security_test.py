"""Actual local import-link, expansion, size and directory-swap boundaries."""
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import secure_import_io as io_guard
import import_match_calendar as calendar
import ingest_verified as ingest

ICS = b'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'


class CalendarInputSecurity(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_ordinary_external_export_is_supported(self):
        source = self.root / 'export.ics'; source.write_bytes(ICS)
        self.assertEqual(calendar.load_sources(source), [('export.ics', ICS)])

    def test_input_symlink_and_hardlink_are_rejected(self):
        original = self.root / 'original.ics'; original.write_bytes(ICS)
        link = self.root / 'link.ics'; link.symlink_to(original)
        hard = self.root / 'hard.ics'; os.link(original, hard)
        for source in (link, hard):
            with self.assertRaises((OSError, ValueError)):
                calendar.load_sources(source)

    def test_symlinked_input_ancestor_is_rejected(self):
        directory = self.root / 'actual'; directory.mkdir()
        (directory / 'export.ics').write_bytes(ICS)
        link = self.root / 'linked'; link.symlink_to(directory, target_is_directory=True)
        with self.assertRaises((OSError, ValueError)):
            calendar.load_sources(link / 'export.ics')

    def test_zip_total_expansion_is_bounded_before_parser(self):
        source = self.root / 'export.zip'
        with ZipFile(source, 'w', ZIP_DEFLATED) as archive:
            archive.writestr('one.ics', b'A' * 3000000)
            archive.writestr('two.ics', b'B' * 3000000)
        self.assertLess(source.stat().st_size, calendar.MAX_INPUT)
        with self.assertRaises(ValueError):
            calendar.load_sources(source)

    def test_oversize_and_fifo_never_enter_reader(self):
        source = self.root / 'huge.ics'
        with source.open('wb') as stream:
            stream.truncate(calendar.MAX_INPUT + 1)
        with self.assertRaises(ValueError):
            calendar.load_sources(source)
        fifo = self.root / 'pipe.ics'; os.mkfifo(fifo)
        with self.assertRaises((OSError, ValueError)):
            calendar.load_sources(fifo)


class VerifiedInputSecurity(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = self.root / 'staged'
        self.data.mkdir()
        for name in io_guard.DATA_FILES:
            source = ROOT / 'data' / name
            if source.exists():
                shutil.copyfile(source, self.data / name)
        self.package = self.root / 'reviewed.json'
        self.package.write_text(json.dumps({'schema_version': 1, 'approval': {'status': 'approved', 'reviewed_by': 'Synthetic offline fixture'},
            'entries': [{'operation': 'append_story', 'verified': True, 'safe_for_publication': True,
                'source_label': 'Synthetic public test only', 'story': {'sport': 'Χειροσφαίριση', 'year': '1994',
                    'title': 'Synthetic review fixture that must never be published',
                    'lead': 'Synthetic fixture for a reviewed staged-data import test.',
                    'text': 'This is a synthetic offline regression fixture. It is never added to the public website or historical archive.',
                    'relatedPeople': []}}]}))

    def test_normal_dry_run_and_explicit_staged_apply(self):
        before = (self.data / 'stories.json').read_bytes()
        ingest.run(self.package, self.data, False)
        self.assertEqual((self.data / 'stories.json').read_bytes(), before)
        ingest.run(self.package, self.data, True)
        self.assertNotEqual((self.data / 'stories.json').read_bytes(), before)
        self.assertEqual(list(self.data.glob('.verified-import-*')), [])

    def test_package_symlink_is_not_a_reviewed_input(self):
        link = self.root / 'linked.json'; link.symlink_to(self.package)
        with self.assertRaises((OSError, ValueError)):
            ingest.run(link, self.data, False)

    def test_symlinked_data_root_and_data_file_are_rejected(self):
        link = self.root / 'linked-data'; link.symlink_to(self.data, target_is_directory=True)
        with self.assertRaises((OSError, ValueError)):
            ingest.run(self.package, link, True)
        original = self.root / 'outside.json'
        original.write_bytes((self.data / 'stories.json').read_bytes())
        (self.data / 'stories.json').unlink()
        (self.data / 'stories.json').symlink_to(original)
        with self.assertRaises((OSError, ValueError)):
            ingest.run(self.package, self.data, True)

    def test_parent_swap_during_validation_never_redirects_apply(self):
        outside = self.root / 'outside'; shutil.copytree(self.data, outside)
        original = {p.name: p.read_bytes() for p in outside.iterdir()}
        held = self.root / 'held-original'
        merge = ingest.merge
        def swap(package, data):
            result = merge(package, data)
            self.data.rename(held)
            self.data.symlink_to(outside, target_is_directory=True)
            return result
        with patch.object(ingest, 'merge', side_effect=swap):
            ingest.run(self.package, self.data, True)
        self.assertEqual({p.name: p.read_bytes() for p in outside.iterdir()}, original)
        self.assertNotEqual((held / 'stories.json').read_bytes(), original['stories.json'])

    def test_hardlinked_optional_ledger_is_rejected(self):
        ledger = self.data / 'import-ledger.json'
        ledger.write_text('{"hashes": []}')
        os.link(ledger, self.root / 'outside-ledger.json')
        with self.assertRaises((OSError, ValueError)):
            ingest.run(self.package, self.data, True)


class HeldDescriptorSecurity(unittest.TestCase):
    def test_unsupported_suffix_traversal_and_nonallowlisted_output(self):
        with self.assertRaises(ValueError):
            io_guard.read_export(Path('/tmp/file.txt'), {'.json'}, 100)
        with self.assertRaises(ValueError):
            with io_guard.held_directory(Path('/tmp/../private')):
                self.fail('Traversal was admitted')
        with tempfile.TemporaryDirectory() as root:
            with io_guard.held_directory(Path(root)) as fd:
                with self.assertRaises(ValueError):
                    io_guard.replace_data_files(fd, {'unreviewed.json': '{}'})


if __name__ == '__main__':
    unittest.main()
