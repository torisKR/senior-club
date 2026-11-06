"""Offline human-input/issuer contracts. All approval fixtures are synthetic."""
import copy
from dataclasses import replace
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import zipfile

from test_play_screenshot_evidence import SHA, CONTEXT, FixtureGitHub, archive, fixture, evidence as receiver

SPEC = importlib.util.spec_from_file_location(
    "play_screenshot_issuer", Path(__file__).with_name("issue-play-screenshot-evidence.py"))
issuer = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = issuer
SPEC.loader.exec_module(issuer)


def human_input(raw):
    env = {"GITHUB_REPOSITORY": receiver.REPOSITORY, "GITHUB_REPOSITORY_ID": "101",
        "GITHUB_REF": "refs/heads/main", "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_SHA": SHA, "GITHUB_WORKFLOW_SHA": SHA, "GITHUB_RUN_ID": "303",
        "GITHUB_RUN_ATTEMPT": "1", "GITHUB_ACTOR": "synthetic-reviewer", "GITHUB_ACTOR_ID": "505",
        "GITHUB_WORKFLOW_REF": f"{receiver.REPOSITORY}/{receiver.ISSUER_WORKFLOW}@refs/heads/main",
        "SOURCE_SHA": SHA, "RELEASE_ID": "707", "RELEASE_ASSET_ID": "808",
        "ZIP_SHA256": hashlib.sha256(raw).hexdigest(), "MANUAL_REVIEW": "true"}
    # Represents external human dispatch input only in isolated test fixtures.
    event = {"inputs": {"source_sha": SHA, "release_id": "707", "release_asset_id": "808",
                        "zip_sha256": env["ZIP_SHA256"], "manual_review": "true"},
             "repository": {"id": 101, "full_name": receiver.REPOSITORY, "fork": False},
             "sender": {"id": 505, "login": "synthetic-reviewer", "type": "User"}}
    return env, event


class ReleaseGitHub(FixtureGitHub):
    def __init__(self, raw):
        super().__init__(raw)
        self.run.update(status="in_progress", conclusion=None)
        self.human = {"id": 505, "login": "synthetic-reviewer", "type": "User"}
        self.run["actor"] = self.human.copy()
        self.run["triggering_actor"] = self.human.copy()
        self.release = {"id": 707, "tag_name": issuer.TAG_PREFIX + SHA,
            "target_commitish": SHA, "draft": False, "prerelease": True,
            "published_at": "2026-09-30T00:00:00Z", "author": self.human.copy()}
        self.tag = {"ref": "refs/tags/" + issuer.TAG_PREFIX + SHA,
                    "object": {"type": "commit", "sha": SHA}}
        self.asset = {"id": 808, "url": f"{receiver.API}/repos/{receiver.REPOSITORY}/releases/assets/808",
            "name": issuer.ASSET_PREFIX + SHA + ".zip", "state": "uploaded",
            "content_type": "application/zip", "size": len(raw),
            "digest": "sha256:" + hashlib.sha256(raw).hexdigest(),
            "created_at": "2026-09-30T00:00:00Z", "updated_at": "2026-09-30T00:00:00Z",
            "uploader": self.human.copy(), "download_count": 0}

    def get_json(self, path):
        root = f"/repos/{receiver.REPOSITORY}"
        if path == root + "/releases/707":
            result = copy.deepcopy(self.release)
            if self.race == "release" and self.downloads:
                result["target_commitish"] = "b" * 40
        elif path == root + "/git/ref/tags/" + issuer.TAG_PREFIX + SHA:
            result = copy.deepcopy(self.tag)
            if self.race == "tag" and self.downloads:
                result["object"]["sha"] = "b" * 40
        elif path == root + "/releases/707/assets?per_page=100&page=1":
            result = [] if self.absent or (self.race == "membership" and self.downloads) else [self.asset]
            if self.duplicate:
                result *= 2
        elif path == root + "/releases/assets/808":
            result = copy.deepcopy(self.asset)
            if self.race == "asset" and self.downloads:
                result["updated_at"] = "2026-09-30T01:00:00Z"
        else:
            return super().get_json(path)
        self.reads[path] = self.reads.get(path, 0) + 1
        return copy.deepcopy(result)

    def download_release_asset(self, asset_id):
        assert asset_id == 808
        self.downloads += 1
        self.asset["download_count"] += 1  # API changes only this during a normal download.
        return self.raw


class IssuerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest, cls.files = fixture()
        cls.raw = archive(cls.manifest, cls.files)
        cls.env, cls.event = human_input(cls.raw)
        cls.context = issuer.IssueContext.from_environment(cls.env, cls.event)

    def reject(self, client, context=None, pattern=".+"):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(issuer.evidence.EvidenceError, pattern):
                issuer.produce(context or self.context, client, Path(directory))
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_real_issuer_to_receiver_roundtrip_preserves_all_original_bytes(self):
        client = ReleaseGitHub(self.raw)
        with tempfile.TemporaryDirectory() as directory:
            payload, receipt = issuer.produce(self.context, client, Path(directory))
            self.assertNotIn(receipt, payload.rglob("*"))
            audit = json.loads(receipt.read_bytes())
            self.assertEqual(audit["manualReviewInput"], self.event["inputs"]["manual_review"])
            self.assertEqual(audit["reviewerId"], self.event["sender"]["id"])
            self.assertEqual(audit["zipSha256"], hashlib.sha256(self.raw).hexdigest())
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zipped:
                for file in payload.rglob("*"):
                    if file.is_file():
                        zipped.write(file, file.relative_to(payload).as_posix())
            manifest, proof = receiver.receive(CONTEXT, FixtureGitHub(buffer.getvalue()), Path(directory))
            with zipfile.ZipFile(io.BytesIO(self.raw)) as original:
                self.assertEqual(manifest.read_bytes(), original.read("manifest.json"))
            for name, data in self.files.items():
                self.assertEqual((manifest.parent / name).read_bytes(), data)
            self.assertEqual(json.loads(proof.read_bytes())["issuerHumanId"], 505)
        self.assertEqual(client.downloads, 1)

    def test_review_must_originate_in_matching_human_dispatch_not_generated_env(self):
        for key, bad in [("MANUAL_REVIEW", "false"), ("MANUAL_REVIEW", ""),
                         ("GITHUB_REPOSITORY", "fork/senior-club"), ("GITHUB_REF", "refs/heads/topic"),
                         ("GITHUB_EVENT_NAME", "pull_request_target"), ("GITHUB_RUN_ATTEMPT", "2"),
                         ("SOURCE_SHA", "b" * 40), ("GITHUB_WORKFLOW_SHA", "b" * 40),
                         ("GITHUB_WORKFLOW_REF", "other/workflow@refs/heads/main"),
                         ("RELEASE_ID", "707/../assets"), ("RELEASE_ASSET_ID", "0"),
                         ("ZIP_SHA256", "a" * 7)]:
            with self.subTest(key=key), self.assertRaises(issuer.evidence.EvidenceError):
                issuer.IssueContext.from_environment({**self.env, key: bad}, self.event)
        for section, key, bad in [("inputs", "manual_review", "false"), ("inputs", "manual_review", True),
                                  ("inputs", "zip_sha256", "b" * 64),
                                  ("sender", "type", "Bot"), ("sender", "id", 999),
                                  ("repository", "fork", True), ("repository", "id", 999)]:
            event = copy.deepcopy(self.event)
            event[section][key] = bad
            with self.subTest(section=section, key=key), self.assertRaises(issuer.evidence.EvidenceError):
                issuer.IssueContext.from_environment(self.env, event)
        self.reject(ReleaseGitHub(self.raw), replace(self.context, review_input="false"))

    def test_main_rejects_missing_review_or_changed_checkout_before_network(self):
        from subprocess import CompletedProcess
        with tempfile.TemporaryDirectory() as directory:
            event_path = Path(directory) / "event.json"
            event_path.write_text(json.dumps(self.event))
            env = {**self.env, "GITHUB_EVENT_PATH": str(event_path)}
            for overrides, responses in [({"MANUAL_REVIEW": "false"}, []),
                ({}, [CompletedProcess([], 0, "b" * 40)]),
                ({}, [CompletedProcess([], 0, SHA), CompletedProcess([], 1)])]:
                with self.subTest(overrides=overrides, checks=len(responses)), \
                     patch.dict(os.environ, {**env, **overrides}), \
                     patch.object(issuer.evidence.subprocess, "run", side_effect=responses), \
                     patch.object(issuer, "GitHub") as client:
                    with self.assertRaises(issuer.evidence.EvidenceError):
                        issuer.main()
                    client.assert_not_called()

    def test_foreign_source_issuer_release_tag_asset_or_human_is_rejected(self):
        cases = [("repo", "fork", True), ("repo", "id", 999),
            ("run", "head_sha", "b" * 40), ("run", "head_branch", "other"),
            ("run", "event", "push"), ("run", "run_attempt", 2),
            ("run", "path", ".github/workflows/other.yml"),
            ("run", "head_repository", {"id": 999, "full_name": "fork/senior-club"}),
            ("run", "actor", {"id": 505, "type": "Bot"}),
            ("run", "triggering_actor", {"id": 999, "type": "User"}),
            ("workflow", "path", ".github/workflows/other.yml"),
            ("release", "id", 999), ("release", "target_commitish", "main"),
            ("release", "tag_name", "arbitrary-tag"), ("release", "draft", True),
            ("release", "author", {"id": 999, "login": "other-human", "type": "User"}),
            ("tag", "object", {"type": "commit", "sha": "b" * 40}),
            ("tag", "object", {"type": "tag", "sha": SHA}),
            ("asset", "id", 999), ("asset", "name", "arbitrary.zip"),
            ("asset", "url", "https://untrusted.invalid/input.zip"), ("asset", "state", "starter"),
            ("asset", "digest", None), ("asset", "digest", "sha256:" + "b" * 64),
            ("asset", "uploader", {"id": 505, "login": "synthetic-reviewer", "type": "Bot"})]
        for field, key, bad in cases:
            client = ReleaseGitHub(self.raw)
            getattr(client, field)[key] = bad
            with self.subTest(field=field, key=key):
                self.reject(client)
                self.assertEqual(client.downloads, 0)
        for flag in ("absent", "duplicate"):
            client = ReleaseGitHub(self.raw)
            setattr(client, flag, True)
            self.reject(client)

    def test_exact_pinned_bytes_and_metadata_cannot_change_during_download(self):
        client = ReleaseGitHub(self.raw)
        client.raw += b"tampered"
        self.reject(client, pattern="ZIP bytes do not match")
        for race in ("release", "tag", "asset", "membership", "run"):
            with self.subTest(race=race):
                client = ReleaseGitHub(self.raw)
                client.race = race
                self.reject(client)

    def test_producer_does_not_repair_missing_manual_review_or_invalid_payload(self):
        for key in receiver.ATTESTATIONS:
            manifest = copy.deepcopy(self.manifest)
            del manifest["attestations"][key]
            raw = archive(manifest, self.files)
            env, event = human_input(raw)
            self.reject(ReleaseGitHub(raw), issuer.IssueContext.from_environment(env, event), "manual review")
        link = zipfile.ZipInfo("assets/link.png")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        for extra in [("../escape.png", b"bad"), (link, b"../../outside"), ("review.json", b"fake")]:
            raw = archive(self.manifest, self.files, extra)
            env, event = human_input(raw)
            self.reject(ReleaseGitHub(raw), issuer.IssueContext.from_environment(env, event))
        manifest = copy.deepcopy(self.manifest)
        manifest["sets"].pop()
        files = {key: value for key, value in self.files.items() if not key.startswith("assets/tablet-10-")}
        raw = archive(manifest, files)
        env, event = human_input(raw)
        self.reject(ReleaseGitHub(raw), issuer.IssueContext.from_environment(env, event), "Existing strict")

    def test_release_download_handles_direct_and_redirect_without_leaking_auth(self):
        class Opener:
            def __init__(self, location=None):
                self.location, self.requests = location, []

            def open(self, request, timeout):
                self.requests.append(request)
                if self.location and len(self.requests) == 1:
                    raise urllib.error.HTTPError(request.full_url, 302, "Found",
                        {"Location": self.location}, io.BytesIO())
                return io.BytesIO(b"ZIP fixture")
        client = issuer.GitHub("offline-test-only")
        for location in (None, "https://release-assets.githubusercontent.com/input?sig=offline-test"):
            client.opener = Opener(location)
            self.assertEqual(client.download_release_asset(808), b"ZIP fixture")
            self.assertEqual(client.opener.requests[0].get_header("Accept"), "application/octet-stream")
            self.assertIsNotNone(client.opener.requests[0].get_header("Authorization"))
            if location:
                self.assertIsNone(client.opener.requests[1].get_header("Authorization"))
        for location in ("https://untrusted.invalid/zip", "http://release-assets.githubusercontent.com/zip",
                         "https://release-assets.githubusercontent.com.evil.invalid/zip"):
            client.opener = Opener(location)
            with self.assertRaisesRegex(issuer.evidence.EvidenceError, "storage redirect"):
                client.download_release_asset(808)
            self.assertEqual(len(client.opener.requests), 1)

    def test_real_issuer_workflow_requires_human_input_then_uploads_only_verified_files(self):
        path = receiver.WORKSPACE / receiver.ISSUER_WORKFLOW
        workflow = path.read_text()
        self.assertIn("workflow_dispatch:", workflow)
        self.assertNotRegex(workflow, r"(?m)^  (push|workflow_call|workflow_run|pull_request.*):")
        self.assertRegex(workflow, r"manual_review:\n(?:[^\n]*\n)*?        default: false")
        self.assertIn("MANUAL_REVIEW: ${{ inputs.manual_review }}", workflow)
        self.assertNotIn("MANUAL_REVIEW: true", workflow)
        self.assertEqual(workflow.split("\npermissions:\n", 1)[1].split("\n\n", 1)[0],
                         "  contents: read\n  actions: read")
        self.assertIn("persist-credentials: false", workflow)
        self.assertEqual(re.findall(r"uses: (.+)", workflow),
            ["actions/checkout@v7", "actions/setup-node@v7", "actions/upload-artifact@v7", "actions/upload-artifact@v7"])
        self.assertIn("name: " + receiver.ARTIFACT_PREFIX + "${{ github.sha }}", workflow)
        self.assertIn("path: ${{ steps.evidence.outputs.directory }}/", workflow)
        self.assertEqual(workflow.count("overwrite: false"), 2)
        self.assertEqual(workflow.count("archive: true"), 2)
        self.assertLess(workflow.index("issue-play-screenshot-evidence.py"), workflow.index("actions/upload-artifact"))
        self.assertNotRegex(workflow, r"always\(\)|continue-on-error|secrets\.|https?://")


if __name__ == "__main__":
    unittest.main()
