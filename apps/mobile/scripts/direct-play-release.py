"""Direct Android Publisher delivery. Never log credentials or API bodies."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
import zipfile

PACKAGE = 'com.toris.seniorclub'
API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PACKAGE
UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/' + PACKAGE
ANDROID = '{http://schemas.android.com/apk/res/android}'
REQUIRED = ['ANDROID_UPLOAD_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS',
            'ANDROID_KEY_PASSWORD', 'ANDROID_UPLOAD_CERT_SHA256']


def require_signing(env):
    missing = [name for name in REQUIRED if not env.get(name)]
    if missing:
        raise ValueError('Missing signing secrets: ' + ', '.join(missing))
    if len(env['ANDROID_UPLOAD_CERT_SHA256']) != 64 or any(c not in '0123456789abcdefABCDEF' for c in env['ANDROID_UPLOAD_CERT_SHA256']):
        raise ValueError('ANDROID_UPLOAD_CERT_SHA256 must be 64 hexadecimal characters')


def next_code(codes, now):
    # Seconds since 2020: monotonic across workflows, bounded below by Play history.
    code = max(int(now) - 1577836800, max([0] + [int(c) for c in codes]) + 1)
    if not 1 <= code <= 2100000000:
        raise ValueError('Android versionCode exhausted')
    return code


def policy(track, status):
    if (track, status) not in [('internal', 'draft'), ('production', 'draft'), ('production', 'completed')]:
        raise ValueError('Unsupported release policy')


def command(args):
    result = subprocess.run(args, capture_output=True)
    if result.returncode:
        raise ValueError('Release tool failed: ' + args[0])
    return result.stdout


class Play:
    def __init__(self):
        key = json.loads(Path('/tmp/senior-club-play-service-account.json').read_text())
        if key.get('type') != 'service_account' or key.get('client_email') != 'toris-play-uploader@toris-play-uploader.iam.gserviceaccount.com':
            raise ValueError('Unexpected Play service account')
        def enc(value):
            return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
        now = int(time.time())
        payload = enc({'alg': 'RS256', 'typ': 'JWT'}) + b'.' + enc({
            'iss': key['client_email'], 'scope': 'https://www.googleapis.com/auth/androidpublisher',
            'aud': 'https://oauth2.googleapis.com/token', 'iat': now, 'exp': now + 3600})
        keypath = Path(os.environ['RUNNER_TEMP']) / 'play-jwt.pem'
        try:
            keypath.write_text(key['private_key']); keypath.chmod(0o600)
            result = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', str(keypath)], input=payload, capture_output=True, check=True)
        finally:
            keypath.unlink(missing_ok=True)
        jwt = payload + b'.' + base64.urlsafe_b64encode(result.stdout).rstrip(b'=')
        body = b'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt
        self.token = ''
        self.token = self.request('POST', 'https://oauth2.googleapis.com/token', body, 'application/x-www-form-urlencoded')['access_token']

    def request(self, method, url, data=None, content_type='application/json'):
        if data is not None and not isinstance(data, bytes):
            data = json.dumps(data).encode()
        headers = {'Content-Type': content_type}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers, method=method), timeout=300) as response:
                raw = response.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            raise ValueError(f'Play API HTTP {error.code}; reconcile provider state before another upload') from None

    def codes(self, edit):
        root = API + '/edits/' + edit
        tracks = self.request('GET', root + '/tracks').get('tracks', [])
        codes = [c for t in tracks for r in t.get('releases', []) for c in r.get('versionCodes', [])]
        for endpoint, field in [('bundles', 'bundles'), ('apks', 'apks')]:
            codes.extend(x['versionCode'] for x in self.request('GET', root + '/' + endpoint).get(field, []))
        return codes


def validate_manifest(xml, code, version):
    # Input is bundletool output from our local build, not arbitrary XML; reject DTDs too.
    if b'<!DOCTYPE' in xml or b'<!ENTITY' in xml:
        raise ValueError('DTD/entity forbidden in manifest')
    root = ET.fromstring(xml)
    if root.get('package') != PACKAGE or root.get(ANDROID + 'versionCode') != str(code) or root.get(ANDROID + 'versionName') != version:
        raise ValueError('AAB package/version mismatch')
    sdk = root.find('uses-sdk')
    if sdk is None or int(sdk.get(ANDROID + 'targetSdkVersion', '0')) < 36:
        raise ValueError('AAB target SDK must be at least 36')
    app = root.find('application')
    if app is None or app.get(ANDROID + 'debuggable') == 'true' or app.get(ANDROID + 'allowBackup') != 'false' or app.get(ANDROID + 'usesCleartextTraffic') == 'true':
        raise ValueError('Unsafe merged application manifest')
    blocked = json.loads(Path('app.json').read_text())['expo']['android']['blockedPermissions']
    if any(p.get(ANDROID + 'name') in blocked for p in root.findall('uses-permission')):
        raise ValueError('Blocked permission in merged AAB')
    metadata = {m.get(ANDROID + 'name'): m.get(ANDROID + 'value') for m in app.findall('meta-data')}
    if metadata.get('com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT') != 'true':
        raise ValueError('Ad measurement consent gate missing')


def validate():
    evidence = Path(os.environ['EVIDENCE_DIR'])
    aab = evidence / 'app-release.aab'
    if not aab.is_file() or not aab.stat().st_size:
        raise ValueError('Missing exact AAB')
    jar = os.environ['BUNDLETOOL_JAR']
    command(['java', '-jar', jar, 'validate', '--bundle=' + str(aab)])
    xml = command(['java', '-jar', jar, 'dump', 'manifest', '--bundle=' + str(aab), '--module=base'])
    version = json.loads(Path('app.json').read_text())['expo']['version']
    validate_manifest(xml, os.environ['ANDROID_VERSION_CODE'], version)
    # jarsigner verifies every entry; reject unsigned entries and disabled/broken signatures.
    report = command(['jarsigner', '-verify', '-verbose', '-certs', str(aab)]).decode()
    if 'jar verified.' not in report or 'unsigned entries' in report or 'treated as unsigned' in report:
        raise ValueError('AAB signature verification failed')
    cert = command(['keytool', '-printcert', '-rfc', '-jarfile', str(aab)]).decode()
    import ssl
    der = ssl.PEM_cert_to_DER_cert(cert[cert.index('-----BEGIN CERTIFICATE-----'):cert.index('-----END CERTIFICATE-----') + len('-----END CERTIFICATE-----')])
    fingerprint = hashlib.sha256(der).hexdigest()
    if fingerprint != os.environ['ANDROID_UPLOAD_CERT_SHA256'].lower():
        raise ValueError('AAB upload signing identity mismatch')
    with zipfile.ZipFile(aab) as archive:
        bundle = archive.read('base/assets/index.android.bundle')
        for name in ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_WEB_URL']:
            if os.environ[name].encode() not in bundle:
                raise ValueError('Release endpoint absent from actual JS bundle: ' + name)
    record = {'package': PACKAGE, 'versionCode': int(os.environ['ANDROID_VERSION_CODE']), 'versionName': version,
              'sha256': hashlib.sha256(aab.read_bytes()).hexdigest(), 'certificateSha256': fingerprint,
              'commit': os.environ['GITHUB_SHA'], 'runId': os.environ['GITHUB_RUN_ID']}
    (evidence / 'validated-build.json').write_text(json.dumps(record, indent=2) + '\n')
    (evidence / 'merged-manifest.xml').write_bytes(xml)
    print('PASS exact signed AAB package, version, consent, endpoints and certificate')


def main(action):
    if os.environ.get('GITHUB_RUN_ATTEMPT') != '1':
        raise ValueError('Workflow reruns forbidden; reconcile unknown uploads and dispatch a fresh run')
    if action == 'check-signing':
        require_signing(os.environ)
        return
    if action == 'validate':
        validate()
        return
    if action == 'upload':
        if os.environ.get('SUBMIT_TO_PLAY') != 'true':
            raise ValueError('Explicit submit authorization required')
        policy(os.environ['PLAY_TRACK'], os.environ['PLAY_STATUS'])
        evidence = Path(os.environ['EVIDENCE_DIR'])
        prior = json.loads((evidence / 'validated-build.json').read_text())
        if hashlib.sha256((evidence / 'app-release.aab').read_bytes()).hexdigest() != prior['sha256']:
            raise ValueError('Validated artifact changed; refusing upload')
        validate()  # Revalidate the exact bytes immediately before network access.
    elif action != 'allocate':
        raise ValueError('Unknown action')
    play = Play()
    edit = play.request('POST', API + '/edits', {})['id']
    root = API + '/edits/' + edit
    committed = False
    try:
        codes = play.codes(edit)
        if action == 'allocate':
            code = next_code(codes, time.time())
            with open(os.environ['GITHUB_ENV'], 'a') as output:
                output.write(f'ANDROID_VERSION_CODE={code}\n')
            print(f'Allocated versionCode {code}')
            return
        evidence = Path(os.environ['EVIDENCE_DIR'])
        record = json.loads((evidence / 'validated-build.json').read_text())
        code = record['versionCode']
        if code <= max([0] + [int(c) for c in codes]):
            raise ValueError('versionCode no longer newer than Play; do not upload')
        data = (evidence / 'app-release.aab').read_bytes()
        result = play.request('POST', UPLOAD + '/edits/' + edit + '/bundles?uploadType=media', data, 'application/octet-stream')
        if int(result['versionCode']) != code or result.get('sha256') != record['sha256']:
            raise ValueError('Play returned different artifact identity')
        track, status = os.environ['PLAY_TRACK'], os.environ['PLAY_STATUS']
        play.request('PUT', root + '/tracks/' + track, {'track': track, 'releases': [{'versionCodes': [str(code)], 'status': status}]})
        play.request('POST', root + ':validate', {})
        play.request('POST', root + ':commit', {})
        committed = True
        verification = play.request('POST', API + '/edits', {})['id']
        try:
            actual = play.request('GET', API + '/edits/' + verification + '/tracks/' + track)
            if not any(r.get('versionCodes') == [str(code)] and r.get('status') == status for r in actual.get('releases', [])):
                raise ValueError('Committed release read-back mismatch')
            (evidence / 'play-release.json').write_text(json.dumps({'track': track, 'status': status, **record}, indent=2) + '\n')
        finally:
            play.request('DELETE', API + '/edits/' + verification)
        print('PASS Play committed exact artifact and release read-back verified')
    finally:
        if not committed:
            play.request('DELETE', root)


if __name__ == '__main__':
    try:
        main(sys.argv[1])
    except Exception as error:
        # Never print unexpected exception text: it can contain key material or API bodies.
        print('FAIL ' + (str(error) if isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
