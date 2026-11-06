"""Receive reviewed screenshots from one pinned issuer; never create approvals.

Only GitHub GET requests are made. Archive/manifest contents and tokens are never
logged. The existing Node strict validator remains the final content gate.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile
from dataclasses import dataclass
import urllib.error
import urllib.parse
import urllib.request
import zipfile


REPOSITORY = "torisKR/senior-club"
ISSUER_WORKFLOW = ".github/workflows/android-play-screenshot-evidence.yml"
ARTIFACT_PREFIX = "android-play-final-screenshots-"
API = "https://api.github.com"
MAX_ARCHIVE = 192 * 1024 * 1024
MAX_MANIFEST = 1024 * 1024
MAX_PNG = 8 * 1024 * 1024
ATTESTATIONS = (
    "capturedFromFinalUi", "noOldBrandOrDemoCopy", "noPersonalData",
    "reviewerCanReachShownFeatures", "contentRightsCleared", "statusBarSanitized",
)
WORKSPACE = Path(__file__).resolve().parents[2]


class EvidenceError(ValueError):
    """Messages must be constants, never untrusted payloads or API bodies."""


def require(condition, message):
    if not condition:
        raise EvidenceError(message)


def identifier(value):
    require(isinstance(value, str) and re.fullmatch(r"[1-9][0-9]{0,18}", value),
            "A positive decimal run/repository identifier is required")
    return int(value)


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "Duplicate JSON object keys are forbidden")
        result[key] = value
    return result


def read_json(raw):
    try:
        return json.loads(raw, object_pairs_hook=no_duplicate_keys)
    except (UnicodeError, json.JSONDecodeError):
        raise EvidenceError("Invalid evidence JSON") from None


@dataclass(frozen=True)
class Context:
    repository_id: int
    sha: str
    consumer_run_id: int
    evidence_run_id: int

    @classmethod
    def from_environment(cls, env):
        require(env.get("GITHUB_REPOSITORY") == REPOSITORY,
                "Only the pinned release repository is allowed")
        require(env.get("GITHUB_REF") == "refs/heads/main",
                "Only the main release ref is allowed")
        require(env.get("GITHUB_EVENT_NAME") in ("workflow_dispatch", "push"),
                "Untrusted release event")
        require(env.get("GITHUB_RUN_ATTEMPT") == "1", "Release reruns are forbidden")
        sha = env.get("GITHUB_SHA", "")
        require(re.fullmatch(r"[0-9a-f]{40}", sha), "Full lowercase source SHA is required")
        context = cls(identifier(env.get("GITHUB_REPOSITORY_ID", "")), sha,
                      identifier(env.get("GITHUB_RUN_ID", "")),
                      identifier(env.get("SCREENSHOT_EVIDENCE_RUN_ID", "")))
        require(context.consumer_run_id != context.evidence_run_id,
                "Evidence must come from a separate completed issuer run")
        return context


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


class GitHub:
    def __init__(self, token):
        require(bool(token), "Read-only GitHub token is required")
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, relative):
        # Callers construct only numeric IDs and pinned repository endpoints.
        require(relative == "/repos/" + REPOSITORY
                or relative.startswith("/repos/" + REPOSITORY + "/"), "Invalid GitHub endpoint")
        return urllib.request.Request(API + relative, headers={
            "Authorization": "Bearer " + self.token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }, method="GET")

    def get_json(self, relative):
        try:
            with self.opener.open(self.request(relative), timeout=30) as response:
                raw = response.read(MAX_MANIFEST + 1)
            require(len(raw) <= MAX_MANIFEST, "GitHub metadata exceeds size limit")
            return read_json(raw)
        except (urllib.error.HTTPError, urllib.error.URLError):
            raise EvidenceError("GitHub metadata unavailable; release evidence is required") from None

    def download(self, artifact_id):
        try:
            with self.opener.open(self.request(
                f"/repos/{REPOSITORY}/actions/artifacts/{artifact_id}/zip"), timeout=30):
                pass
            raise EvidenceError("Expected GitHub artifact download redirect")
        except urllib.error.HTTPError as error:
            location = error.headers.get("Location", "")
            code = error.code
            error.close()
            require(code == 302, "GitHub artifact download unavailable")
        except urllib.error.URLError:
            raise EvidenceError("GitHub artifact download unavailable") from None
        target = urllib.parse.urlsplit(location)
        host = target.hostname or ""
        require(target.scheme == "https" and target.port in (None, 443)
                and target.username is None and target.password is None and not target.fragment
                and (host.endswith(".blob.core.windows.net")
                     or host.endswith(".actions.githubusercontent.com")),
                "Unexpected artifact storage redirect")
        try:
            # The GitHub token is deliberately absent from the storage request.
            with self.opener.open(urllib.request.Request(location, method="GET"), timeout=60) as response:
                raw = response.read(MAX_ARCHIVE + 1)
            require(0 < len(raw) <= MAX_ARCHIVE, "Artifact exceeds archive size limit")
            return raw
        except (urllib.error.HTTPError, urllib.error.URLError):
            raise EvidenceError("Artifact storage unavailable") from None


def validate_run_identity(run, context):
    require(run.get("id") == context.evidence_run_id and run.get("run_attempt") == 1,
            "Issuer run identity or attempt mismatch")
    for key in ("repository", "head_repository"):
        repo = run.get(key) or {}
        require(repo.get("full_name") == REPOSITORY and repo.get("id") == context.repository_id,
                "Issuer repository/fork mismatch")
    require(run.get("head_sha") == context.sha and run.get("head_branch") == "main",
            "Issuer source SHA or ref mismatch")
    require(run.get("event") == "workflow_dispatch" and run.get("pull_requests") == [],
            "Only manually dispatched non-PR issuer runs are trusted")
    require(run.get("path") == ISSUER_WORKFLOW, "Issuer workflow path mismatch")
    actor, trigger = run.get("actor") or {}, run.get("triggering_actor") or {}
    require(actor.get("type") == "User" and trigger.get("type") == "User"
            and type(actor.get("id")) is int and actor["id"] > 0
            and trigger.get("id") == actor["id"], "A human issuer is required")


def validate_run(run, context):
    validate_run_identity(run, context)
    require(run.get("status") == "completed" and run.get("conclusion") == "success",
            "Issuer workflow must have completed successfully")


def validate_artifact(artifact, context):
    require(type(artifact.get("id")) is int and artifact["id"] > 0,
            "Invalid artifact identifier")
    require(artifact.get("name") == ARTIFACT_PREFIX + context.sha,
            "Exact screenshot artifact name is required")
    require(artifact.get("expired") is False, "Expired screenshot evidence")
    require(type(artifact.get("size_in_bytes")) is int
            and 0 < artifact["size_in_bytes"] <= MAX_ARCHIVE, "Invalid artifact size")
    require(isinstance(artifact.get("digest"), str)
            and re.fullmatch(r"sha256:[0-9a-f]{64}", artifact["digest"]),
            "GitHub SHA-256 artifact digest is required")
    run = artifact.get("workflow_run") or {}
    require(run.get("id") == context.evidence_run_id
            and run.get("repository_id") == context.repository_id
            and run.get("head_repository_id") == context.repository_id
            and run.get("head_sha") == context.sha and run.get("head_branch") == "main",
            "Artifact issuer repository, run or source mismatch")


def relative_path(value):
    require(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_./-]+", value)
            and not value.startswith("/")
            and all(part and not part.startswith(".") for part in value.split("/")),
            "Unsafe evidence path")
    return value


def inspect_archive(raw, context, version):
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            entries = archive.infolist()
            require(0 < len(entries) <= 64, "Unexpected evidence archive entry count")
            require(sum(entry.file_size for entry in entries) <= 22 * MAX_PNG + MAX_MANIFEST,
                    "Uncompressed evidence exceeds size limit")
            names = set()
            files = {}
            for entry in entries:
                name = relative_path(entry.filename[:-1] if entry.is_dir() else entry.filename)
                require(name.lower() not in names, "Duplicate/colliding archive entries")
                names.add(name.lower())
                mode = stat.S_IFMT(entry.external_attr >> 16)
                require(mode in ((0, stat.S_IFDIR) if entry.is_dir() else (0, stat.S_IFREG))
                        and not entry.flag_bits & 1, "Links, special or encrypted archive entries are forbidden")
                if entry.is_dir():
                    continue
                limit = MAX_MANIFEST if name == "manifest.json" else MAX_PNG
                require(0 < entry.file_size <= limit, "Evidence entry exceeds size limit")
                files[name] = archive.read(entry)
            require("manifest.json" in files, "Root screenshot manifest is required")
            manifest = read_json(files["manifest.json"])
            require(isinstance(manifest, dict), "Invalid screenshot manifest")
            require((manifest.get("capture") or {}).get("commit") == context.sha,
                    "Screenshot capture commit must equal release source SHA")
            require((manifest.get("app") or {}).get("version") == version,
                    "Screenshot app version must equal release app version")
            attestations = manifest.get("attestations") or {}
            require(all(attestations.get(key) is True for key in ATTESTATIONS),
                    "Every existing manual review attestation must be true")
            asset_root = relative_path(manifest.get("assetRoot"))
            expected = {"manifest.json"}
            for group in manifest.get("sets", []):
                for image in group.get("files", []):
                    name = relative_path(image.get("path"))
                    require(name.startswith(asset_root + "/") and name.endswith(".png"),
                            "Screenshot path must stay inside assetRoot")
                    require(name not in expected and name in files, "Missing or duplicate screenshot file")
                    require(isinstance(image.get("sha256"), str)
                            and re.fullmatch(r"[0-9a-f]{64}", image["sha256"])
                            and hashlib.sha256(files[name]).hexdigest() == image["sha256"],
                            "Screenshot SHA-256 is required and must match")
                    expected.add(name)
            require(set(files) == expected, "Undeclared artifact payload is forbidden")
            return files
    except (zipfile.BadZipFile, RuntimeError, KeyError, TypeError, AttributeError):
        raise EvidenceError("Invalid screenshot evidence archive or manifest") from None


def materialize(files, runner_temp, workspace=WORKSPACE):
    """Preserve reviewed bytes and run the same strict gate for issuer/receiver."""
    destination = Path(tempfile.mkdtemp(prefix="play-screenshot-evidence-", dir=runner_temp))
    try:
        for name, data in files.items():
            target = destination / name
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with target.open("xb") as output:
                os.chmod(target, 0o600)
                output.write(data)
        manifest = destination / "manifest.json"
        result = subprocess.run([
            "node", str(workspace / "apps/mobile/scripts/validate-play-screenshots.mjs"), str(manifest),
        ], capture_output=True, timeout=30)
        require(result.returncode == 0, "Existing strict screenshot validator rejected evidence")
        return manifest
    except Exception:
        shutil.rmtree(destination)
        raise


def verify_checkout(sha, workspace=WORKSPACE):
    checkout = subprocess.run(["git", "rev-parse", "HEAD"], cwd=workspace,
                              capture_output=True, text=True, check=True)
    require(checkout.stdout.strip() == sha, "Checked-out source SHA mismatch")
    unchanged = subprocess.run(["git", "diff", "--quiet", "HEAD", "--"], cwd=workspace)
    require(unchanged.returncode == 0, "Tracked release source changed after checkout")


def receive(context, client, runner_temp, workspace=WORKSPACE):
    base = f"/repos/{REPOSITORY}"
    repo = client.get_json(base)
    require(repo.get("full_name") == REPOSITORY and repo.get("id") == context.repository_id
            and repo.get("fork") is False, "Release repository identity mismatch")
    run_url = f"{base}/actions/runs/{context.evidence_run_id}"
    run = client.get_json(run_url)
    validate_run(run, context)
    workflow_id = run.get("workflow_id")
    require(type(workflow_id) is int and workflow_id > 0, "Invalid issuer workflow identifier")
    workflow = client.get_json(f"{base}/actions/workflows/{workflow_id}")
    require(workflow.get("id") == workflow_id and workflow.get("path") == ISSUER_WORKFLOW
            and workflow.get("state") == "active", "Issuer workflow identity mismatch")
    artifacts = []
    for page in range(1, 11):
        data = client.get_json(f"{run_url}/artifacts?per_page=100&page={page}")
        batch = data.get("artifacts")
        require(isinstance(batch, list) and len(batch) <= 100, "Invalid artifact listing")
        artifacts.extend(batch)
        if len(batch) < 100:
            break
    else:
        raise EvidenceError("Artifact listing exceeds bound")
    matches = [item for item in artifacts if item.get("name") == ARTIFACT_PREFIX + context.sha]
    require(len(matches) == 1, "Exactly one reviewed screenshot artifact is required")
    candidate = matches[0]
    validate_artifact(candidate, context)
    artifact_url = f"{base}/actions/artifacts/{candidate['id']}"
    artifact = client.get_json(artifact_url)
    validate_artifact(artifact, context)
    require(artifact == candidate, "Artifact metadata changed after listing")
    raw = client.download(artifact["id"])
    require(hashlib.sha256(raw).hexdigest() == artifact["digest"][7:], "Artifact digest mismatch")
    # A rerun, expiry or replacement during download must not inherit trust.
    validate_run(client.get_json(run_url), context)
    require(client.get_json(artifact_url) == artifact, "Artifact metadata changed during download")
    version = read_json((workspace / "apps/mobile/app.json").read_bytes())["expo"]["version"]
    files = inspect_archive(raw, context, version)
    manifest = materialize(files, runner_temp, workspace)
    destination = manifest.parent
    try:
        proof = destination / "verified-issuer.json"
        proof.write_text(json.dumps({"repository": REPOSITORY, "repositoryId": context.repository_id,
            "headSha": context.sha, "issuerWorkflow": ISSUER_WORKFLOW,
            "issuerRunId": context.evidence_run_id, "issuerRunAttempt": 1,
            "issuerHumanId": run["actor"]["id"], "issuerEvent": run["event"],
            "artifactId": artifact["id"], "artifactName": artifact["name"],
            "artifactDigest": artifact["digest"],
            "manifestSha256": hashlib.sha256(files["manifest.json"]).hexdigest(),
            "manualAttestations": "present; never generated by receiver"}, indent=2) + "\n")
        os.chmod(proof, 0o600)
        return manifest, proof
    except Exception:
        shutil.rmtree(destination)
        raise


def main():
    context = Context.from_environment(os.environ)
    verify_checkout(context.sha)
    manifest, proof = receive(context, GitHub(os.environ.get("GITHUB_TOKEN")),
                              Path(os.environ["RUNNER_TEMP"]).resolve())
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"manifest={manifest}\nprovenance={proof}\n")
    print("PASS exact issuer/repository/source/digest and existing strict screenshot gate")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Unexpected exception strings may contain URL tokens or payload values.
        print("FAIL " + (str(error) if isinstance(error, EvidenceError)
                         else "Screenshot evidence could not be verified"))
        raise SystemExit(1)
