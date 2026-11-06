import importlib.util
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('direct-play-release.py'))
assert spec is not None and spec.loader is not None
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

POLICY_URL = 'https://plume-mine-90a.notion.site/40d4269dc8c0818d9035ed4b0596d183'


def write_aab(path, bundle, entry=None):
    with zipfile.ZipFile(path, 'w') as archive:
        archive.writestr(entry or r.JS_BUNDLE_PATH, bundle)


class ReleaseTest(unittest.TestCase):
    def test_signing_missing_fails_with_names_only(self):
        with self.assertRaisesRegex(ValueError, 'ANDROID_UPLOAD_KEYSTORE_BASE64'):
            r.require_signing({})

    def test_signing_certificate_requires_exact_hex(self):
        env = {name: 'fixture-not-a-real-key' for name in r.REQUIRED}
        with self.assertRaisesRegex(ValueError, '64 hexadecimal'):
            r.require_signing(env)
        env['ANDROID_UPLOAD_CERT_SHA256'] = 'ab' * 32
        r.require_signing(env)

    def test_codes_exceed_play_and_clock_floor(self):
        self.assertEqual(r.next_code([700000000, '8'], 1700000000), 700000001)
        self.assertEqual(r.next_code([], 1700000000), 122163200)
        with self.assertRaises(ValueError):
            r.next_code([2100000000], 1700000000)

    def test_only_existing_track_status_policy(self):
        for track, status in [('internal', 'draft'), ('production', 'draft'), ('production', 'completed')]:
            r.policy(track, status)
        for track, status in [('internal', 'completed'), ('beta', 'draft'), ('production', 'inProgress')]:
            with self.assertRaises(ValueError):
                r.policy(track, status)

    def test_rerun_and_unconsented_upload_never_access_play(self):
        with patch.object(r, 'Play') as play:
            with patch.dict(os.environ, {'GITHUB_RUN_ATTEMPT': '2'}, clear=True):
                with self.assertRaises(ValueError):
                    r.main('allocate')
            with patch.dict(os.environ, {'GITHUB_RUN_ATTEMPT': '1', 'SUBMIT_TO_PLAY': 'false'}, clear=True):
                with self.assertRaises(ValueError):
                    r.main('upload')
            play.assert_not_called()

    def test_changed_artifact_is_rejected_before_network(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, 'app-release.aab').write_bytes(b'changed fixture')
            Path(directory, 'validated-build.json').write_text(json.dumps({'sha256': '0' * 64}))
            with patch.dict(os.environ, {'GITHUB_RUN_ATTEMPT': '1', 'SUBMIT_TO_PLAY': 'true', 'PLAY_TRACK': 'production', 'PLAY_STATUS': 'draft', 'EVIDENCE_DIR': directory}, clear=True):
                with patch.object(r, 'Play') as play:
                    with self.assertRaisesRegex(ValueError, 'changed'):
                        r.main('upload')
                    play.assert_not_called()

    def test_actual_aab_bundle_requires_the_exact_exported_game_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            aab = Path(directory, 'app-release.aab')
            with patch.dict(os.environ, {'EXPO_PUBLIC_API_URL': '', 'EXPO_PUBLIC_WEB_URL': ''}):
                write_aab(aab, b'game code ' + POLICY_URL.encode())
                self.assertEqual(r.validate_bundle_policy(aab), POLICY_URL)

                for bundle, entry in [
                    (b'game without a policy', r.JS_BUNDLE_PATH),
                    (b'https://plume-mine-90a.notion.site/00000000000000000000000000000000', r.JS_BUNDLE_PATH),
                    (POLICY_URL.encode(), 'base/assets/unrelated.txt'),
                ]:
                    write_aab(aab, bundle, entry)
                    with self.assertRaises(ValueError):
                        r.validate_bundle_policy(aab)

            write_aab(aab, POLICY_URL.encode())
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', UserWarning)
                with zipfile.ZipFile(aab, 'a') as archive:
                    archive.writestr(r.JS_BUNDLE_PATH, b'duplicate')
            with self.assertRaisesRegex(ValueError, 'one base JS bundle'):
                r.validate_bundle_policy(aab)

    def test_policy_source_must_be_the_public_notion_document(self):
        for url in [
            b'', b'http://plume-mine-90a.notion.site/40d4269dc8c0818d9035ed4b0596d183',
            b'https://plume-mine-90a.notion.site.evil.test/40d4269dc8c0818d9035ed4b0596d183',
            b'https://plume-mine-90a.notion.site/40d4269dc8c0818d9035ed4b0596d183?x=1',
            b'https://plume-mine-90a.notion.site/40d4269dc8c0818d9035ed4b0596d183#fragment',
            b'https://plume-mine-90a.notion.site/',
        ]:
            with self.subTest(url=url), patch.object(r, 'command', return_value=url):
                with self.assertRaisesRegex(ValueError, 'Invalid game privacy policy URL'):
                    r.validate_bundle_policy(Path('not-opened.aab'))

    def test_exact_validation_records_policy_and_hash_without_api_or_web_variables(self):
        version = json.loads(Path('app.json').read_text())['expo']['version']
        manifest = f'''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.toris.seniorclub" android:versionCode="99" android:versionName="{version}"><uses-sdk android:targetSdkVersion="36"/><application android:allowBackup="false"><meta-data android:name="com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT" android:value="true"/></application></manifest>'''.encode()
        original_command = r.command
        certificate_der = b'fixture-public-certificate-der'

        def release_tool(args):
            if args[0] == 'node':
                return original_command(args)
            if args[0] == 'java':
                return manifest if 'dump' in args else b''
            if args[0] == 'jarsigner':
                return b'jar verified.'
            if args[0] == 'keytool':
                return b'-----BEGIN CERTIFICATE-----\nZml4dHVyZQ==\n-----END CERTIFICATE-----'
            raise AssertionError(args[0])

        with tempfile.TemporaryDirectory() as directory:
            aab = Path(directory, 'app-release.aab')
            write_aab(aab, b'actual bundle bytes ' + POLICY_URL.encode())
            env = {
                'PATH': os.environ['PATH'], 'EVIDENCE_DIR': directory, 'BUNDLETOOL_JAR': 'fixture.jar',
                'ANDROID_VERSION_CODE': '99', 'ANDROID_UPLOAD_CERT_SHA256': hashlib.sha256(certificate_der).hexdigest(),
                'GITHUB_SHA': 'a' * 40, 'GITHUB_RUN_ID': '123',
            }
            with patch.dict(os.environ, env, clear=True), patch.object(r, 'command', side_effect=release_tool), \
                    patch('ssl.PEM_cert_to_DER_cert', return_value=certificate_der):
                r.validate()
                record = json.loads(Path(directory, 'validated-build.json').read_text())
                self.assertEqual(record['privacyPolicyUrl'], POLICY_URL)
                self.assertEqual(record['sha256'], hashlib.sha256(aab.read_bytes()).hexdigest())
                with patch.dict(os.environ, {'ANDROID_UPLOAD_CERT_SHA256': '0' * 64}):
                    with self.assertRaisesRegex(ValueError, 'signing identity mismatch'):
                        r.validate()
                with patch.object(r, 'command', side_effect=lambda args: (
                    b'jar verified. unsigned entries' if args[0] == 'jarsigner' else release_tool(args)
                )):
                    with self.assertRaisesRegex(ValueError, 'signature verification failed'):
                        r.validate()
                write_aab(aab, b'policy was removed from these artifact bytes')
                with self.assertRaisesRegex(ValueError, 'Privacy policy URL absent'):
                    r.validate()

    def test_actual_manifest_identity_consent_and_permissions(self):
        xml = b'''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.toris.seniorclub" android:versionCode="99" android:versionName="0.1.0"><uses-sdk android:targetSdkVersion="36"/><application android:allowBackup="false"><meta-data android:name="com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT" android:value="true"/></application></manifest>'''
        r.validate_manifest(xml, 99, '0.1.0')
        for old, new in [(b'seniorclub', b'wrong'), (b'versionCode="99"', b'versionCode="1"'), (b'targetSdkVersion="36"', b'targetSdkVersion="35"'), (b'allowBackup="false"', b'allowBackup="true"'), (b'android:value="true"', b'android:value="false"'), (b'<uses-sdk', b'<uses-permission android:name="android.permission.CAMERA"/><uses-sdk')]:
            with self.assertRaises(ValueError):
                r.validate_manifest(xml.replace(old, new), 99, '0.1.0')

if __name__ == '__main__':
    unittest.main()
