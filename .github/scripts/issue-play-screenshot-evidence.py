"""Verify human-uploaded, hash-pinned Release input before issuing evidence.

No network writes, URL inputs, APK builds or approval generation. The workflow
uploads only the validated original files using the official artifact action.
"""
from dataclasses import dataclass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

SPEC = importlib.util.spec_from_file_location(
    "play_screenshot_transport", Path(__file__).with_name("download-play-screenshot-evidence.py"))
evidence = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = evidence
SPEC.loader.exec_module(evidence)
require = evidence.require
TAG_PREFIX = "android-play-screenshot-input-"
ASSET_PREFIX = "reviewed-screenshots-"


@dataclass(frozen=True)
class IssueContext:
    repository_id: int
    sha: str
    run_id: int
    actor_id: int
    actor_login: str
    release_id: int
    asset_id: int
    zip_sha256: str
    review_input: str

    @classmethod
    def from_environment(cls, env, event):
        require(env.get("GITHUB_REPOSITORY") == evidence.REPOSITORY
                and env.get("GITHUB_REF") == "refs/heads/main"
                and env.get("GITHUB_EVENT_NAME") == "workflow_dispatch"
                and env.get("GITHUB_RUN_ATTEMPT") == "1", "Untrusted issuer repository/ref/event/attempt")
        sha = env.get("SOURCE_SHA", "")
        require(re.fullmatch(r"[0-9a-f]{40}", sha) and sha == env.get("GITHUB_SHA")
                and sha == env.get("GITHUB_WORKFLOW_SHA"), "Frozen source/workflow SHA mismatch")
        require(env.get("GITHUB_WORKFLOW_REF") ==
                f"{evidence.REPOSITORY}/{evidence.ISSUER_WORKFLOW}@refs/heads/main",
                "Untrusted issuer workflow ref")
        require(env.get("MANUAL_REVIEW") == "true", "Explicit human manual review input is required")
        digest = env.get("ZIP_SHA256", "")
        require(re.fullmatch(r"[0-9a-f]{64}", digest), "Human-pinned ZIP SHA-256 is required")
        login = env.get("GITHUB_ACTOR", "")
        require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,38}", login), "Invalid human login")
        context = cls(evidence.identifier(env.get("GITHUB_REPOSITORY_ID", "")), sha,
                      evidence.identifier(env.get("GITHUB_RUN_ID", "")),
                      evidence.identifier(env.get("GITHUB_ACTOR_ID", "")), login,
                      evidence.identifier(env.get("RELEASE_ID", "")),
                      evidence.identifier(env.get("RELEASE_ASSET_ID", "")), digest,
                      env["MANUAL_REVIEW"])
        expected_inputs = {"source_sha": sha, "release_id": env["RELEASE_ID"],
                           "release_asset_id": env["RELEASE_ASSET_ID"],
                           "zip_sha256": digest, "manual_review": context.review_input}
        require(event.get("inputs") == expected_inputs,
                "Manual review and immutable input must originate in the dispatch event")
        repo, sender = event.get("repository") or {}, event.get("sender") or {}
        require(repo.get("id") == context.repository_id
                and repo.get("full_name") == evidence.REPOSITORY and repo.get("fork") is False,
                "Dispatch repository mismatch")
        require(sender.get("id") == context.actor_id and sender.get("login") == login
                and sender.get("type") == "User", "Dispatch review must originate from the same human")
        return context


class GitHub(evidence.GitHub):
    def download_release_asset(self, asset_id):
        request = self.request(f"/repos/{evidence.REPOSITORY}/releases/assets/{asset_id}")
        request.add_header("Accept", "application/octet-stream")
        try:
            with self.opener.open(request, timeout=60) as response:
                raw = response.read(evidence.MAX_ARCHIVE + 1)
        except urllib.error.HTTPError as error:
            location, code = error.headers.get("Location", ""), error.code
            error.close()
            require(code == 302, "Pinned Release asset download unavailable")
            target = urllib.parse.urlsplit(location)
            require(target.scheme == "https" and target.port in (None, 443)
                    and target.username is None and target.password is None and not target.fragment
                    and target.hostname in ("release-assets.githubusercontent.com", "objects.githubusercontent.com"),
                    "Unexpected Release asset storage redirect")
            try:
                # No Authorization header and no further redirects on storage.
                with self.opener.open(urllib.request.Request(location, method="GET"), timeout=60) as response:
                    raw = response.read(evidence.MAX_ARCHIVE + 1)
            except (urllib.error.HTTPError, urllib.error.URLError):
                raise evidence.EvidenceError("Release asset storage unavailable") from None
        except urllib.error.URLError:
            raise evidence.EvidenceError("Pinned Release asset download unavailable") from None
        require(0 < len(raw) <= evidence.MAX_ARCHIVE, "Release input exceeds archive size limit")
        return raw


def same_human(value, context):
    require(value.get("type") == "User" and value.get("id") == context.actor_id
            and value.get("login") == context.actor_login,
            "Release author, uploader and reviewer must be the same human")


def validate_issuer(run, context):
    evidence.validate_run_identity(run, evidence.Context(
        context.repository_id, context.sha, 0, context.run_id))
    require(run.get("status") == "in_progress" and run.get("conclusion") is None,
            "Issuer must be the current initial workflow execution")
    same_human(run.get("actor") or {}, context)
    same_human(run.get("triggering_actor") or {}, context)


def validate_release(release, tag, context):
    require(release.get("id") == context.release_id
            and release.get("tag_name") == TAG_PREFIX + context.sha
            and release.get("target_commitish") == context.sha
            and release.get("draft") is False and release.get("prerelease") is True
            and isinstance(release.get("published_at"), str) and release["published_at"],
            "Exact published evidence prerelease at frozen source SHA is required")
    same_human(release.get("author") or {}, context)
    require(tag.get("ref") == "refs/tags/" + TAG_PREFIX + context.sha
            and (tag.get("object") or {}).get("type") == "commit"
            and tag["object"].get("sha") == context.sha, "Evidence tag must directly resolve to frozen commit")
    # Ignore mutable unrelated description/asset counters, never source identity.
    return {key: release.get(key) for key in
            ("id", "tag_name", "target_commitish", "draft", "prerelease", "published_at", "author")}


def validate_asset(asset, context):
    require(asset.get("id") == context.asset_id
            and asset.get("name") == ASSET_PREFIX + context.sha + ".zip"
            and asset.get("url") ==
            f"{evidence.API}/repos/{evidence.REPOSITORY}/releases/assets/{context.asset_id}"
            and asset.get("state") == "uploaded"
            and asset.get("content_type") in ("application/zip", "application/octet-stream")
            and type(asset.get("size")) is int and 0 < asset["size"] <= evidence.MAX_ARCHIVE
            and asset.get("digest") == "sha256:" + context.zip_sha256,
            "Release asset ID/name/repository/state/size or pinned digest mismatch")
    same_human(asset.get("uploader") or {}, context)
    # Downloads legitimately increment download_count; all content identity stays pinned.
    return {key: asset.get(key) for key in
            ("id", "url", "name", "state", "content_type", "size", "digest",
             "created_at", "updated_at", "uploader")}


def asset_in_release(client, release_url, context):
    assets = []
    for page in range(1, 11):
        batch = client.get_json(f"{release_url}/assets?per_page=100&page={page}")
        require(isinstance(batch, list) and len(batch) <= 100, "Invalid Release asset listing")
        assets.extend(batch)
        if len(batch) < 100:
            break
    else:
        raise evidence.EvidenceError("Release asset listing exceeds bound")
    matches = [item for item in assets if item.get("name") == ASSET_PREFIX + context.sha + ".zip"]
    require(len(matches) == 1, "Exactly one pinned Release input is required")
    return validate_asset(matches[0], context)


def produce(context, client, runner_temp, workspace=evidence.WORKSPACE):
    require(context.review_input == "true", "Explicit human manual review input is required")
    base = f"/repos/{evidence.REPOSITORY}"
    repo = client.get_json(base)
    require(repo.get("id") == context.repository_id and repo.get("full_name") == evidence.REPOSITORY
            and repo.get("fork") is False, "Issuer repository identity mismatch")
    run_url = f"{base}/actions/runs/{context.run_id}"
    run = client.get_json(run_url)
    validate_issuer(run, context)
    workflow_id = run.get("workflow_id")
    require(type(workflow_id) is int and workflow_id > 0, "Invalid issuer workflow identifier")
    workflow = client.get_json(f"{base}/actions/workflows/{workflow_id}")
    require(workflow.get("id") == workflow_id and workflow.get("path") == evidence.ISSUER_WORKFLOW
            and workflow.get("state") == "active", "Issuer workflow identity mismatch")
    release_url = f"{base}/releases/{context.release_id}"
    tag_url = f"{base}/git/ref/tags/{TAG_PREFIX}{context.sha}"
    release = validate_release(client.get_json(release_url), client.get_json(tag_url), context)
    asset = asset_in_release(client, release_url, context)
    asset_url = f"{base}/releases/assets/{context.asset_id}"
    require(validate_asset(client.get_json(asset_url), context) == asset,
            "Release input metadata changed after listing")
    raw = client.download_release_asset(context.asset_id)
    require(len(raw) == asset["size"] and hashlib.sha256(raw).hexdigest() == context.zip_sha256,
            "Human-pinned Release ZIP bytes do not match")
    require(validate_release(client.get_json(release_url), client.get_json(tag_url), context) == release,
            "Release source identity changed during download")
    require(validate_asset(client.get_json(asset_url), context) == asset
            and asset_in_release(client, release_url, context) == asset,
            "Release input changed during download")
    validate_issuer(client.get_json(run_url), context)
    version = evidence.read_json((workspace / "apps/mobile/app.json").read_bytes())["expo"]["version"]
    files = evidence.inspect_archive(raw, context, version)
    destination = Path(tempfile.mkdtemp(prefix="play-screenshot-issuer-", dir=runner_temp))
    try:
        manifest = evidence.materialize(files, destination, workspace)
        receipt = destination / "review.json"
        # Record the original human input and digest; do not manufacture a boolean approval.
        with receipt.open("x") as output:
            os.chmod(receipt, 0o600)
            json.dump({"repository": evidence.REPOSITORY, "repositoryId": context.repository_id,
                "headSha": context.sha, "issuerRunId": context.run_id,
                "issuerWorkflow": evidence.ISSUER_WORKFLOW, "reviewerId": context.actor_id,
                "reviewerLogin": context.actor_login,
                "manualReviewInput": context.review_input, "approvalSource": "workflow_dispatch.inputs.manual_review",
                "releaseId": context.release_id, "releaseTag": TAG_PREFIX + context.sha,
                "assetId": context.asset_id, "zipSha256": context.zip_sha256,
                "manifestSha256": hashlib.sha256(files["manifest.json"]).hexdigest()}, output, indent=2)
            output.write("\n")
        return manifest.parent, receipt
    except Exception:
        shutil.rmtree(destination)
        raise


def main():
    raw = Path(os.environ["GITHUB_EVENT_PATH"]).read_bytes()
    require(len(raw) <= evidence.MAX_MANIFEST, "Dispatch event exceeds size limit")
    context = IssueContext.from_environment(os.environ, evidence.read_json(raw))
    evidence.verify_checkout(context.sha)
    directory, receipt = produce(context, GitHub(os.environ.get("GITHUB_TOKEN")),
                                 Path(os.environ["RUNNER_TEMP"]).resolve())
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"directory={directory}\nreceipt={receipt}\n")
    print("PASS human dispatch review, same-repository frozen source and pinned input; original evidence preserved")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("FAIL " + (str(error) if isinstance(error, evidence.EvidenceError)
                         else "Screenshot evidence could not be issued"))
        raise SystemExit(1)
