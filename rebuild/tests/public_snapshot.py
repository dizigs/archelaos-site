#!/usr/bin/env python3
"""Test reproducible public-only release inventory after building dist/."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from hashlib import sha256
import json
import unittest
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("snapshot",ROOT/"tools/public_snapshot.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
report = mod.manifest()
assert report["source"].startswith("public dist archive")
assert len(report["files"]) == 10
for row in report["files"]:
    assert row["file"] in {n+".json" for n in mod.FILES}
    data=(mod.PUB/row["file"]).read_bytes()
    assert row["sha256"] == sha256(data).hexdigest()
    assert row["bytes"] == len(data)
    assert row["bytes"] > 50
assert all(not any(s in x["file"] for s in ["private","secret","medical","credential"]) for x in report["files"])
print("PUBLIC SNAPSHOT SELF-TEST OK: 10 public JSON datasets, SHA-256 and no private files.")

# Keep CLI confinement in the existing release-integrity gate. No extra cron or
# changes to workflows currently owned by another PR are needed.
security_spec = importlib.util.spec_from_file_location("snapshot_security_checks", ROOT/"tests/public_snapshot_security_test.py")
security = importlib.util.module_from_spec(security_spec)
security_spec.loader.exec_module(security)
suite = unittest.defaultTestLoader.loadTestsFromTestCase(security.SnapshotSecurity)
assert suite.countTestCases(), "No snapshot security regressions selected"
if not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful():
    raise SystemExit(1)
