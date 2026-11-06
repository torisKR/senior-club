"""Public certificate evidence only; never export private signing material."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


def run(command, data=None):
    result = subprocess.run(command, input=data, capture_output=True, check=False)
    if result.returncode:
        raise ValueError("Certificate command failed (details suppressed to protect credentials)")
    return result.stdout


def certificate_hashes(der):
    # Parse and canonicalize X.509 before hashing, rejecting arbitrary bytes.
    der = run(["openssl", "x509", "-inform", "DER", "-outform", "DER"], der)
    return {"kakaoKeyHash": base64.b64encode(hashlib.sha1(der).digest()).decode(),
            "certificateSha256": hashlib.sha256(der).hexdigest()}


def keystore_certificate(path, alias, password_env):
    return run(["keytool", "-exportcert", "-keystore", str(path), "-alias", alias,
                "-storepass:env", password_env])


def main():
    upload = certificate_hashes(keystore_certificate(
        os.environ["ANDROID_UPLOAD_KEYSTORE_PATH"], os.environ["ANDROID_KEY_ALIAS"],
        "ANDROID_KEYSTORE_PASSWORD"))
    expected = os.environ["ANDROID_UPLOAD_CERT_SHA256"].replace(":", "").lower()
    if upload["certificateSha256"] != expected:
        raise ValueError("Upload certificate does not match the pinned SHA-256")
    os.environ["KAKAO_DEBUG_STORE_PASSWORD"] = "android"
    debug = certificate_hashes(keystore_certificate(
        "android/app/debug.keystore", "androiddebugkey", "KAKAO_DEBUG_STORE_PASSWORD"))
    report = {"package": "com.toris.seniorclub", "sourceCommit": os.environ.get("GITHUB_SHA"),
              "upload": upload, "generatedProjectDebug": debug,
              "playAppSigning": None, "consoleRegistration": "not verified"}
    public_cert = os.environ.get("PLAY_APP_SIGNING_CERTIFICATE_BASE64", "")
    if public_cert:
        report["playAppSigning"] = certificate_hashes(base64.b64decode(public_cert, validate=True))
    evidence = Path(os.environ["EVIDENCE_DIR"])
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "kakao-key-hashes.json").write_text(json.dumps(report, indent=2) + "\n")
    summary = "## Android Kakao public certificate hashes\n\n"
    for label in ("upload", "generatedProjectDebug", "playAppSigning"):
        entry = report[label]
        summary += f"- {label}: `{entry['kakaoKeyHash']}`\n" if entry else f"- {label}: not supplied; registration remains unverified\n"
    summary += ("\nUpload signing is NOT Google Play app signing. Play-installed apps require the "
                "Play app-signing certificate hash. Debug evidence applies only to this generated "
                "project's debug.keystore, not every developer machine. Console registration is not verified.\n")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as stream:
            stream.write(summary)
    print(summary)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError):
        print("Kakao certificate verification failed; check signing configuration/public certificate input.", file=sys.stderr)
        sys.exit(1)
