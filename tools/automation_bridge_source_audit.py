"""Fixed read-only existing-Worker code fingerprint; never export private source."""
import hashlib
import json
import os
import re
from email import policy
from email.parser import BytesParser
from urllib.request import Request
from urllib.parse import urlsplit

from cloudflare_pages_status import ACCOUNT, API, TOKEN, ProviderFailure, provider_open

WORKER = 'archelaos-automation-bridge'
MAX_SOURCE = 2 * 1024 * 1024



def has_exact_script_api_url_literal(source):
    """Report presence of a quoted HTTPS URL with the exact API host."""
    for literal in re.findall(r'''["'\x60](https://[^"'\x60\s<>]+)''', source):
        parsed = urlsplit(literal)
        if parsed.scheme == 'https' and parsed.netloc == 'script.googleapis.com':
            return True
    return False

def inspect_source(payload, content_type):
    if len(payload) > MAX_SOURCE:
        raise ValueError('Source exceeds read limit')
    modules = []
    if content_type.lower().startswith('multipart/'):
        message = BytesParser(policy=policy.default).parsebytes(
            ('Content-Type: ' + content_type + '\r\nMIME-Version: 1.0\r\n\r\n').encode() + payload)
        for part in message.walk():
            name = part.get_filename() or part.get_param('name', header='content-disposition') or ''
            if not part.is_multipart() and (part.get_content_type() in ('application/javascript', 'text/javascript', 'application/ecmascript') or name.endswith(('.js', '.mjs'))):
                modules.append(part.get_payload(decode=True) or b'')
    elif content_type.split(';')[0].strip().lower() in ('application/javascript', 'text/javascript', 'application/ecmascript'):
        modules.append(payload)
    if not modules or len(modules) > 100:
        raise ValueError('No bounded JavaScript module collection observed')
    source = '\n'.join(module.decode('utf-8') for module in modules)
    # Presence of literals is NOT proof of execution, effective grants or security.
    return {
        'worker': WORKER, 'status': 'PRIVATE_SOURCE_INSPECTED_METADATA_ONLY',
        'moduleCount': len(modules),
        'normalizedModuleSha256': hashlib.sha256(''.join(sorted(hashlib.sha256(m).hexdigest() for m in modules)).encode()).hexdigest(),
        'scriptProjectsLiteralPresent': 'https://www.googleapis.com/auth/script.projects' in source,
        'scriptApiOriginLiteralPresent': has_exact_script_api_url_literal(source),
        'knownRouteLiteralsObserved': {route: route in source for route in ('/health', '/auth/start', '/oauth/callback', '/auth/status', '/api/ping', '/api/apps-script/')},
        'sourceBodyExported': False, 'privateGoogleContentRead': False,
        'grantedScopesVerified': False, 'liveOAuthRequestVerified': False,
        'deploymentPerformed': False, 'fullIntegrationVerified': False,
    }


def main():
    endpoint = API + '/accounts/' + ACCOUNT + '/workers/scripts/' + WORKER + '/content/v2'
    if not TOKEN or not re.fullmatch(r'[0-9a-f]{32}', ACCOUNT):
        report = {'status': 'BLOCKED', 'reason': 'configured_read_credential_required'}
    else:
        try:
            request = Request(endpoint, headers={'Authorization': 'Bearer ' + TOKEN})
            with provider_open(request) as response:
                payload = response.read(MAX_SOURCE + 1)
                report = inspect_source(payload, response.headers.get('Content-Type', ''))
                report.update(endpoint='GET ' + endpoint, httpStatus=response.status)
        except (OSError, ValueError, ProviderFailure):
            # Never print a provider/source body, request headers or credentials.
            report = {'status': 'BLOCKED', 'endpoint': 'GET ' + endpoint,
                      'reason': 'source_read_not_verified', 'retryPerformed': False}
    encoded = json.dumps(report, sort_keys=True)
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        print('::notice title=Existing bridge source audit::' + encoded.replace('%', '%25'))
    else:
        print(encoded)
    return 0 if report['status'] == 'PRIVATE_SOURCE_INSPECTED_METADATA_ONLY' else 1


if __name__ == '__main__':
    raise SystemExit(main())
