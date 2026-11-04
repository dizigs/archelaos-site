"""Synthetic source only; never write/export an actual private Worker module."""
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from automation_bridge_source_audit import inspect_source, MAX_SOURCE


class SourceAudit(unittest.TestCase):
    def test_literals_are_not_claimed_as_live_grants_or_actual_execution(self):
        report = inspect_source(b'// https://www.googleapis.com/auth/script.projects\nconst secret="PRIVATE_SYNTHETIC_SECRET";', 'application/javascript')
        self.assertTrue(report['scriptProjectsLiteralPresent'])
        self.assertFalse(report['grantedScopesVerified'])
        self.assertFalse(report['liveOAuthRequestVerified'])
        self.assertNotIn('PRIVATE_SYNTHETIC_SECRET', json.dumps(report))
    def test_script_api_url_requires_quoted_https_and_exact_host(self):
        valid = inspect_source(b'const url="https://script.googleapis.com/v1/projects";', 'application/javascript')
        self.assertTrue(valid['scriptApiOriginLiteralPresent'])
        for source in (
            b'const url="https://script.googleapis.com.evil.example/v1";',
            b'const url="https://evil.example/?next=https://script.googleapis.com/v1";',
            b'const url="http://script.googleapis.com/v1";',
            b'// script.googleapis.com',
        ):
            with self.subTest(source=source):
                self.assertFalse(inspect_source(source, 'application/javascript')['scriptApiOriginLiteralPresent'])

    def test_multipart_source_metadata_never_exports_names_or_bodies(self):
        payload = b'--fixture\r\nContent-Type: application/javascript\r\nContent-Disposition: form-data; name="private-name.js"\r\n\r\nconst a="PRIVATE_SYNTHETIC_BODY";\r\n--fixture--\r\n'
        report = inspect_source(payload, 'multipart/form-data; boundary=fixture')
        self.assertEqual(report['moduleCount'], 1)
        self.assertNotIn('private-name', json.dumps(report))
        self.assertNotIn('PRIVATE_SYNTHETIC_BODY', json.dumps(report))
    def test_no_module_or_oversize_body_is_refused(self):
        for payload, content_type in [(b'{}', 'application/json'), (b'x'*(MAX_SOURCE+1), 'application/javascript')]:
            with self.assertRaises(ValueError): inspect_source(payload, content_type)
    def test_fingerprint_is_not_changed_by_transport_content_type_formatting(self):
        self.assertEqual(inspect_source(b'const a=1;', 'application/javascript')['normalizedModuleSha256'], inspect_source(b'const a=1;', 'application/javascript; charset=utf-8')['normalizedModuleSha256'])


if __name__ == '__main__': unittest.main()
