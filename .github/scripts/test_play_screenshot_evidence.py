"""Offline transport/security contracts; synthetic PNGs are NEVER release evidence."""
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import stat
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import zipfile
import zlib

SPEC = importlib.util.spec_from_file_location(
    "play_screenshot_evidence", Path(__file__).with_name("download-play-screenshot-evidence.py"))
evidence = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = evidence
SPEC.loader.exec_module(evidence)
SHA = "a" * 40
CONTEXT = evidence.Context(101, SHA, 202, 303)


def png(color):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    # Real RGB PNGs exercise the existing CRC/dimension validator without real UI.
    row = b"\0" + bytes((color, 50, 100)) * 1080
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1080, 1920, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(row * 1920)) + chunk(b"IEND", b""))


def fixture():
    files = {}
    manifest = {"schemaVersion": 1,
        "app": {"name": "시니어클럽", "packageName": "com.toris.seniorclub", "version": "0.1.1"},
        "capture": {"commit": SHA, "artifactFile": "synthetic-test-only.apk",
                    "artifactSha256": "c" * 64, "buildProfile": "production",
                    "capturedAt": "2026-09-30T00:00:00Z", "locale": "ko-KR",
                    "timeZone": "Asia/Seoul", "colorScheme": "light", "fontScale": 1,
                    "animationsDisabled": True},
        # These assertions belong solely to an offline fixture, never to production.
        "attestations": dict.fromkeys(evidence.ATTESTATIONS, True),
        "assetRoot": "assets", "sets": []}
    for device, prefix, count in [("phone", "phone", 5), ("tablet7", "tablet-7", 4),
                                  ("tablet10", "tablet-10", 4)]:
        group = {"deviceType": device, "orientation": "portrait", "width": 1080,
                 "height": 1920, "files": []}
        for index in range(1, count + 1):
            name = f"assets/{prefix}-{index:02}-screen-{index}.png"
            files[name] = png(index)
            group["files"].append({"order": index, "path": name, "screen": f"screen-{index}",
                "altText": "Synthetic validator fixture", "caption": None,
                "sha256": hashlib.sha256(files[name]).hexdigest()})
        manifest["sets"].append(group)
    return manifest, files


def archive(manifest, files, extra=None):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zipped:
        zipped.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False).encode())
        for name, data in files.items():
            zipped.writestr(name, data)
        if extra:
            zipped.writestr(*extra)
    return output.getvalue()


class FixtureGitHub:
    def __init__(self, raw):
        self.raw = raw
        self.repo = {"id": 101, "full_name": evidence.REPOSITORY, "fork": False}
        self.run = {"id": 303, "workflow_id": 404, "run_attempt": 1,
            "repository": self.repo.copy(), "head_repository": self.repo.copy(),
            "head_sha": SHA, "head_branch": "main", "path": evidence.ISSUER_WORKFLOW,
            "event": "workflow_dispatch", "pull_requests": [], "status": "completed",
            "conclusion": "success", "actor": {"id": 505, "type": "User"},
            "triggering_actor": {"id": 505, "type": "User"}}
        self.workflow = {"id": 404, "path": evidence.ISSUER_WORKFLOW, "state": "active"}
        self.artifact = {"id": 606, "name": evidence.ARTIFACT_PREFIX + SHA,
            "expired": False, "size_in_bytes": len(raw), "digest": "sha256:" + hashlib.sha256(raw).hexdigest(),
            "workflow_run": {"id": 303, "repository_id": 101, "head_repository_id": 101,
                             "head_sha": SHA, "head_branch": "main"}}
        self.duplicate = False
        self.absent = False
        self.race = None
        self.reads = {}
        self.downloads = 0

    def get_json(self, path):
        self.reads[path] = self.reads.get(path, 0) + 1
        root = f"/repos/{evidence.REPOSITORY}"
        if path == root:
            result = self.repo
        elif path == root + "/actions/runs/303":
            result = copy.deepcopy(self.run)
            if self.race == "run" and self.reads[path] == 2:
                result["run_attempt"] = 2
        elif path == root + "/actions/workflows/404":
            result = self.workflow
        elif path == root + "/actions/runs/303/artifacts?per_page=100&page=1":
            result = {"artifacts": [] if self.absent else [self.artifact] * (2 if self.duplicate else 1)}
        elif path == root + "/actions/artifacts/606":
            result = copy.deepcopy(self.artifact)
            if self.race == "artifact" and self.reads[path] == 2:
                result["expired"] = True
        else:
            raise AssertionError("Unexpected endpoint: " + path)
        return copy.deepcopy(result)

    def download(self, artifact_id):
        assert artifact_id == 606
        self.downloads += 1
        return self.raw


class DeliveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest, cls.files = fixture()
        cls.raw = archive(cls.manifest, cls.files)

    def rejected(self, client, pattern=None):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(evidence.EvidenceError, pattern or ".+"):
                evidence.receive(CONTEXT, client, Path(directory))
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_exact_delivery_runs_real_strict_validator_and_preserves_review(self):
        client = FixtureGitHub(self.raw)
        with tempfile.TemporaryDirectory() as directory:
            manifest, proof = evidence.receive(CONTEXT, client, Path(directory))
            self.assertEqual(json.loads(manifest.read_bytes()), self.manifest)
            self.assertEqual(json.loads(proof.read_bytes())["headSha"], SHA)
            for name, data in self.files.items():
                self.assertEqual((manifest.parent / name).read_bytes(), data)
        self.assertEqual(client.downloads, 1)

    def test_consumer_context_rejects_foreign_ref_event_sha_missing_id_and_rerun(self):
        env = {"GITHUB_REPOSITORY": evidence.REPOSITORY, "GITHUB_REPOSITORY_ID": "101",
               "GITHUB_REF": "refs/heads/main", "GITHUB_EVENT_NAME": "workflow_dispatch",
               "GITHUB_SHA": SHA, "GITHUB_RUN_ID": "202", "GITHUB_RUN_ATTEMPT": "1",
               "SCREENSHOT_EVIDENCE_RUN_ID": "303"}
        self.assertEqual(evidence.Context.from_environment(env), CONTEXT)
        for key, bad in [("GITHUB_REPOSITORY", "fork/senior-club"), ("GITHUB_REF", "refs/heads/topic"),
                         ("GITHUB_REF", "refs/tags/release"), ("GITHUB_EVENT_NAME", "pull_request_target"),
                         ("GITHUB_EVENT_NAME", "workflow_run"), ("GITHUB_SHA", "a" * 7),
                         ("GITHUB_SHA", "A" * 40), ("GITHUB_RUN_ATTEMPT", "2"),
                         ("SCREENSHOT_EVIDENCE_RUN_ID", ""), ("SCREENSHOT_EVIDENCE_RUN_ID", "303/zip"),
                         ("SCREENSHOT_EVIDENCE_RUN_ID", "202")]:
            with self.subTest(key=key, bad=bad), self.assertRaises(evidence.EvidenceError):
                evidence.Context.from_environment({**env, key: bad})

    def test_changed_checkout_is_rejected_before_any_github_client(self):
        env = {"GITHUB_REPOSITORY": evidence.REPOSITORY, "GITHUB_REPOSITORY_ID": "101",
               "GITHUB_REF": "refs/heads/main", "GITHUB_EVENT_NAME": "workflow_dispatch",
               "GITHUB_SHA": SHA, "GITHUB_RUN_ID": "202", "GITHUB_RUN_ATTEMPT": "1",
               "SCREENSHOT_EVIDENCE_RUN_ID": "303"}
        from subprocess import CompletedProcess
        for responses in ([CompletedProcess([], 0, "b" * 40)],
                          [CompletedProcess([], 0, SHA), CompletedProcess([], 1)]):
            with self.subTest(responses=len(responses)), patch.dict(os.environ, env), \
                 patch.object(evidence.subprocess, "run", side_effect=responses), \
                 patch.object(evidence, "GitHub") as github:
                with self.assertRaises(evidence.EvidenceError):
                    evidence.main()
                github.assert_not_called()

    def test_issuer_metadata_boundaries_fail_before_download(self):
        cases = [("repo", "id", 999), ("repo", "fork", True),
                 ("run", "head_sha", "b" * 40), ("run", "head_branch", "topic"),
                 ("run", "head_repository", {"id": 999, "full_name": "fork/senior-club"}),
                 ("run", "repository", {"id": 999, "full_name": "fork/senior-club"}),
                 ("run", "event", "pull_request"), ("run", "event", "pull_request_target"),
                 ("run", "event", "push"), ("run", "pull_requests", [{"number": 1}]),
                 ("run", "path", ".github/workflows/ci.yml"), ("run", "run_attempt", 2),
                 ("run", "conclusion", "failure"), ("run", "status", "in_progress"),
                 ("run", "actor", {"id": 505, "type": "Bot"}),
                 ("run", "triggering_actor", {"id": 999, "type": "User"}),
                 ("workflow", "path", ".github/workflows/other.yml"),
                 ("workflow", "id", 999), ("workflow", "state", "disabled_manually")]
        for field, key, value in cases:
            with self.subTest(field=field, key=key):
                client = FixtureGitHub(self.raw)
                getattr(client, field)[key] = value
                self.rejected(client)
                self.assertEqual(client.downloads, 0)

    def test_absent_ambiguous_expired_wrong_name_digest_and_artifact_issuer(self):
        for key, value in [("name", "arbitrary-name"), ("expired", True), ("digest", None),
                           ("workflow_run", {"id": 303, "head_sha": "b" * 40})]:
            with self.subTest(key=key):
                client = FixtureGitHub(self.raw)
                client.artifact[key] = value
                self.rejected(client)
                self.assertEqual(client.downloads, 0)
        for flag in ("absent", "duplicate"):
            with self.subTest(flag=flag):
                client = FixtureGitHub(self.raw)
                setattr(client, flag, True)
                self.rejected(client)
        client = FixtureGitHub(self.raw)
        client.artifact["digest"] = "sha256:" + "b" * 64
        self.rejected(client, "digest mismatch")

    def test_rerun_or_artifact_change_during_download_fails(self):
        for race in ("run", "artifact"):
            with self.subTest(race=race):
                client = FixtureGitHub(self.raw)
                client.race = race
                self.rejected(client)

    def test_all_manual_attestations_and_source_version_are_required(self):
        for key in evidence.ATTESTATIONS:
            with self.subTest(attestation=key):
                manifest = copy.deepcopy(self.manifest)
                manifest["attestations"][key] = False
                self.rejected(FixtureGitHub(archive(manifest, self.files)), "manual review")
        for section, key, bad in [("capture", "commit", "b" * 40), ("app", "version", "0.1.0")]:
            manifest = copy.deepcopy(self.manifest)
            manifest[section][key] = bad
            self.rejected(FixtureGitHub(archive(manifest, self.files)))

    def test_archive_traversal_links_and_undeclared_payload_are_rejected(self):
        link = zipfile.ZipInfo("assets/link.png")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        for entry in [("../outside.png", b"bad"), ("/absolute.png", b"bad"),
                      ("assets\\outside.png", b"bad"), ("assets/./alias.png", b"bad"),
                      ("assets/.hidden.png", b"hidden"),
                      ("assets/PHONE-01-SCREEN-1.PNG", b"collision"),
                      (link, b"../../outside"), ("script.py", b"untrusted")]:
            with self.subTest(entry=str(entry[0])):
                self.rejected(FixtureGitHub(archive(self.manifest, self.files, entry)))
        manifest = copy.deepcopy(self.manifest)
        manifest["assetRoot"] = "../outside"
        self.rejected(FixtureGitHub(archive(manifest, self.files)), "Unsafe evidence path")

    def test_png_hash_crc_and_required_device_sets_use_real_gates(self):
        manifest = copy.deepcopy(self.manifest)
        image = manifest["sets"][0]["files"][0]
        image["sha256"] = "d" * 64
        self.rejected(FixtureGitHub(archive(manifest, self.files)), "SHA-256")
        files = self.files.copy()
        files[image["path"]] = files[image["path"]][:-1] + b"\x01"
        image["sha256"] = hashlib.sha256(files[image["path"]]).hexdigest()
        self.rejected(FixtureGitHub(archive(manifest, files)), "Existing strict screenshot validator")
        manifest = copy.deepcopy(self.manifest)
        omitted = manifest["sets"].pop()
        files = {name: data for name, data in self.files.items()
                 if name not in {item["path"] for item in omitted["files"]}}
        self.rejected(FixtureGitHub(archive(manifest, files)), "Existing strict screenshot validator")

    def test_storage_redirect_strips_token_and_rejects_unknown_host(self):
        class Opener:
            def __init__(self, location):
                self.location, self.requests = location, []

            def open(self, request, timeout):
                self.requests.append(request)
                if len(self.requests) == 1:
                    raise urllib.error.HTTPError(request.full_url, 302, "Found",
                                                 {"Location": self.location}, io.BytesIO())
                return io.BytesIO(b"archive")
        client = evidence.GitHub("offline-test-only")
        client.opener = Opener("https://production.blob.core.windows.net/artifact?sig=offline-test")
        self.assertEqual(client.download(606), b"archive")
        self.assertEqual(client.opener.requests[0].get_method(), "GET")
        self.assertIsNotNone(client.opener.requests[0].get_header("Authorization"))
        self.assertIsNone(client.opener.requests[1].get_header("Authorization"))
        client.opener = Opener("https://untrusted.invalid/artifact")
        with self.assertRaisesRegex(evidence.EvidenceError, "storage redirect"):
            client.download(606)
        self.assertEqual(len(client.opener.requests), 1)

    def test_workflow_all_release_modes_require_delivery_and_strict_preflight(self):
        workflow = (evidence.WORKSPACE / ".github/workflows/android-play-production.yml").read_text()
        def step(name):
            match = re.search(r"      - name: " + re.escape(name) + r"\n(.*?)(?=\n      - name:|\Z)",
                              workflow, re.S)
            self.assertIsNotNone(match)
            return match[1]
        for name in ("Receive exact reviewed screenshot evidence",
                     "Run production release preflight with final screenshot evidence"):
            self.assertNotRegex(step(name), r"(?m)^        if:")
            self.assertLess(workflow.index("      - name: " + name),
                            workflow.index("      - name: Allocate versionCode from Play history"))
        self.assertIn("steps.screenshot_evidence.outputs.manifest", step(
            "Run production release preflight with final screenshot evidence"))
        self.assertNotIn("store-listing/screenshots/final/ko-KR/manifest.json", workflow)
        permissions = workflow.split("\npermissions:\n", 1)[1].split("\n\n", 1)[0]
        self.assertEqual(permissions, "  contents: read\n  actions: read")
        self.assertEqual(workflow.count("      screenshot_evidence_run_id:"), 2)
        self.assertIn("persist-credentials: false", step("Check out repository"))


if __name__ == "__main__":
    unittest.main()
