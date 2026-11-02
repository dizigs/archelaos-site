#!/usr/bin/env python3
"""Private, repeatable intake for contribution envelopes (Gmail, Drive, admin).

This is an OFFLINE adapter: a trusted collector must fetch and place the actual
envelope and attachment under .archive-intake/incoming/ first. No Gmail/Drive
credentials, network activity, publication, or upload to CI is implemented here.

Usage:
  python rebuild/tools/intake_contributions.py .archive-intake/incoming/item.json
Envelope: {"source":"gmail|drive|admin", "source_id":"stable opaque ID",
           "revision":"stable version", "payload_relpath":"incoming/file.txt"}
Everything generated remains under the gitignored .archive-intake directory.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import zipfile
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[2]
PRIVATE_DIR = ROOT / ".archive-intake"
MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_TEXT_CHARS = 120_000
MAX_DOCX_XML_BYTES = 5 * 1024 * 1024
TEXT_SUFFIXES = {".txt", ".md", ".csv", ".json", ".ics"}
ALLOWED_SUFFIXES = TEXT_SUFFIXES | {".docx", ".pdf"}
ALLOWED_SOURCES = {"gmail", "drive", "admin"}


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def read_json(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("The envelope must be a JSON object")
    return data


def inside_private(workspace: Path, relative: str) -> Path:
    if not isinstance(relative, str) or not relative or Path(relative).is_absolute():
        raise ValueError("Expected a relative private path")
    candidate = (workspace / relative).resolve()
    if not candidate.is_relative_to(workspace.resolve()):
        raise ValueError("Path escapes private workspace")
    return candidate


def _docx_text(payload: bytes) -> str:
    # Reject zip bombs and unusual DOCX packages before reading their XML.
    import io
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            members = archive.infolist()
            if len(members) > 300:
                raise ValueError("Too many DOCX members")
            if any(x.file_size > MAX_DOCX_XML_BYTES for x in members):
                raise ValueError("Oversized DOCX member")
            total = sum(x.file_size for x in members)
            if total > MAX_DOCX_XML_BYTES:
                raise ValueError("Oversized DOCX archive")
            if "word/document.xml" not in archive.namelist():
                raise ValueError("Missing DOCX document")
            xml_bytes = archive.read("word/document.xml")
    except (zipfile.BadZipFile, RuntimeError) as error:
        raise ValueError("Invalid DOCX package") from error
    if b"<!DOCTYPE" in xml_bytes.upper() or b"<!ENTITY" in xml_bytes.upper():
        raise ValueError("Unsupported DOCX XML entities")
    try:
        root = ElementTree.fromstring(xml_bytes)
    except ElementTree.ParseError as error:
        raise ValueError("Invalid DOCX XML") from error
    namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    paragraphs = []
    for paragraph in root.iter(namespace + "p"):
        line = "".join((part.text or "") for part in paragraph.iter(namespace + "t"))
        if line.strip():
            paragraphs.append(line)
    return "\n\n".join(paragraphs)


def extract(payload: bytes, extension: str):
    """Return (text, extraction_status). Unparsed PDFs are explicitly deferred."""
    if extension in TEXT_SUFFIXES:
        if b"\x00" in payload:
            raise ValueError("Binary payload disguised as text")
        try:
            text = payload.decode("utf-8-sig")
        except UnicodeDecodeError as error:
            raise ValueError("Only UTF-8 plaintext is supported") from error
    elif extension == ".docx":
        text = _docx_text(payload)
    elif extension == ".pdf":
        if not payload.lstrip().startswith(b"%PDF-"):
            raise ValueError("Invalid PDF header")
        return None, "needs_pdf_extraction"
    else:
        raise ValueError("Unsupported file type")
    if len(text) > MAX_TEXT_CHARS:
        return None, "needs_large_text_review"
    return text, "extracted"


def _atomic_private_write(path: Path, data: bytes):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=".pending-", dir=str(path.parent))
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as writer:
            writer.write(data)
            writer.flush()
            os.fsync(writer.fileno())
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


@contextmanager
def intake_lock(workspace: Path):
    """Single-writer advisory lock for a shared local private workspace (Linux)."""
    import fcntl
    workspace.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock = workspace / ".lock"
    fd = os.open(lock, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        with os.fdopen(fd, "rb") as handle:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    finally:
        pass


def _receipts(workspace: Path):
    for path in (workspace / "receipts").glob("*.json"):
        item = read_json(path)
        if item.get("privacy") == "internal_only":
            yield item


def ingest(envelope: dict, workspace: Path):
    """Ingest one already-local file. Returns a sanitized receipt, no raw IDs."""
    source = envelope.get("source")
    source_id = envelope.get("source_id")
    revision = envelope.get("revision")
    relative = envelope.get("payload_relpath")
    if source not in ALLOWED_SOURCES:
        raise ValueError("Invalid source")
    if not all(isinstance(x, str) and 0 < len(x) <= 512 for x in (source_id, revision)):
        raise ValueError("Missing or invalid stable source identifier/revision")
    workspace = workspace.resolve()
    path = inside_private(workspace, relative)
    extension = path.suffix.casefold()
    if extension not in ALLOWED_SUFFIXES:
        raise ValueError("Unsupported file extension")
    if not path.is_file() or path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("Missing or oversized private input file")
    payload = path.read_bytes()
    if len(payload) > MAX_FILE_BYTES:
        raise ValueError("Input too large")
    content_hash = digest(payload)
    identity_hash = digest((source + "\0" + source_id).encode())
    source_key = digest((source + "\0" + source_id + "\0" + revision).encode())
    with intake_lock(workspace):
        recorded = list(_receipts(workspace))
        matches = [r for r in recorded if r.get("source_key") == source_key]
        if matches:
            if matches[0].get("content_sha256") != content_hash:
                raise ValueError("Source revision changed bytes: provide a new revision")
            return {"outcome": "already_ingested", "receipt_id": source_key,
                    "privacy": "internal_only", "publishable": False}
        same_content = next((r for r in recorded if r.get("content_sha256") == content_hash), None)
        history = [r for r in recorded if r.get("identity_hash") == identity_hash]
        previous_record = max(history, key=lambda r: int(r.get("source_sequence", 0))) if history else None
        previous = previous_record["receipt_id"] if previous_record else None
        sequence = int(previous_record.get("source_sequence", 0)) + 1 if previous_record else 1
        status = "duplicate_content" if same_content else "queued"
        text, extraction = (None, "duplicate_content") if same_content else extract(payload, extension)
        if text is not None:
            _atomic_private_write(workspace / "text" / (source_key + ".txt"),
                                  text.encode("utf-8"))
            # The analyzer's output contains excerpts, so keep it PRIVATE as well.
            from contribution_research import analyze
            leads = analyze(text)
            _atomic_private_write(workspace / "research" / (source_key + ".json"),
                                  (json.dumps(leads, ensure_ascii=False, indent=2) + "\n").encode())
        receipt = {
            "schema_version": 1,
            "receipt_id": source_key,
            "identity_hash": identity_hash,
            "source_key": source_key,
            "source": source,
            "revision_sha256": digest(revision.encode()),
            "source_sequence": sequence,
            "content_sha256": content_hash,
            "size_bytes": len(payload),
            "file_type": extension,
            "supersedes": previous,
            "duplicates_receipt": same_content["receipt_id"] if same_content else None,
            "ingestion_status": status,
            "extraction_status": extraction,
            "verification_status": "pending",
            "privacy": "internal_only",
            "publishable": False,
        }
        _atomic_private_write(workspace / "receipts" / (source_key + ".json"),
                              (json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode())
        return {"outcome": status, "receipt_id": source_key,
                "extraction_status": extraction, "privacy": "internal_only",
                "publishable": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("envelope", type=Path, help="Envelope JSON located inside .archive-intake/")
    args = parser.parse_args()
    if not args.envelope.resolve().is_relative_to(PRIVATE_DIR.resolve()):
        parser.error("Envelope must live inside private .archive-intake/")
    result = ingest(read_json(args.envelope), PRIVATE_DIR)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
