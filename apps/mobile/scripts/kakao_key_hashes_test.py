"""Exercise actual X.509 extraction, not placeholder hash strings."""
import base64
import hashlib
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("hashes", Path(__file__).with_name("kakao-key-hashes.py"))
assert spec is not None and spec.loader is not None
hashes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hashes)


class CertificateTests(unittest.TestCase):
    def test_actual_certificate_and_keystore(self):
        with tempfile.TemporaryDirectory() as folder:
            store = Path(folder) / "test.p12"
            os.environ["TEST_STORE_PASSWORD"] = "test-only-password"
            subprocess.run(["keytool", "-genkeypair", "-alias", "test", "-keyalg", "RSA",
                            "-keystore", str(store), "-storepass:env", "TEST_STORE_PASSWORD",
                            "-dname", "CN=Disposable test", "-validity", "1"],
                           check=True, capture_output=True)
            der = hashes.keystore_certificate(store, "test", "TEST_STORE_PASSWORD")
            actual = hashes.certificate_hashes(der)
            self.assertEqual(actual["certificateSha256"], hashlib.sha256(der).hexdigest())
            sha1 = subprocess.run(["openssl", "dgst", "-sha1", "-binary"], input=der,
                                  check=True, capture_output=True).stdout
            self.assertEqual(actual["kakaoKeyHash"], base64.b64encode(sha1).decode())
            with self.assertRaises(ValueError):
                hashes.keystore_certificate(store, "missing", "TEST_STORE_PASSWORD")

    def test_reject_non_certificate(self):
        with self.assertRaises(ValueError):
            hashes.certificate_hashes(b"not a certificate")


if __name__ == "__main__":
    unittest.main()
