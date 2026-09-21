import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('direct-play-release.py'))
assert spec is not None and spec.loader is not None
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

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
        import tempfile
        import json
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, 'app-release.aab').write_bytes(b'changed fixture')
            Path(directory, 'validated-build.json').write_text(json.dumps({'sha256': '0' * 64}))
            with patch.dict(os.environ, {'GITHUB_RUN_ATTEMPT': '1', 'SUBMIT_TO_PLAY': 'true', 'PLAY_TRACK': 'production', 'PLAY_STATUS': 'draft', 'EVIDENCE_DIR': directory}, clear=True):
                with patch.object(r, 'Play') as play:
                    with self.assertRaisesRegex(ValueError, 'changed'):
                        r.main('upload')
                    play.assert_not_called()

    def test_actual_manifest_identity_consent_and_permissions(self):
        xml = b'''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.toris.seniorclub" android:versionCode="99" android:versionName="0.1.0"><uses-sdk android:targetSdkVersion="36"/><application android:allowBackup="false"><meta-data android:name="com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT" android:value="true"/></application></manifest>'''
        r.validate_manifest(xml, 99, '0.1.0')
        for old, new in [(b'seniorclub', b'wrong'), (b'versionCode="99"', b'versionCode="1"'), (b'targetSdkVersion="36"', b'targetSdkVersion="35"'), (b'allowBackup="false"', b'allowBackup="true"'), (b'android:value="true"', b'android:value="false"'), (b'<uses-sdk', b'<uses-permission android:name="android.permission.CAMERA"/><uses-sdk')]:
            with self.assertRaises(ValueError):
                r.validate_manifest(xml.replace(old, new), 99, '0.1.0')

if __name__ == '__main__':
    unittest.main()
