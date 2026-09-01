import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const easBuildIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseBuildResult(rawJson) {
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('EAS build --json 결과가 유효한 JSON이 아닙니다.');
  }

  const builds = Array.isArray(parsed) ? parsed : [parsed];
  if (builds.length !== 1 || !isRecord(builds[0])) {
    throw new Error('Android build 결과는 정확히 한 건이어야 합니다.');
  }

  const [build] = builds;
  if (typeof build.id !== 'string' || !easBuildIdPattern.test(build.id)) {
    throw new Error('EAS build 결과의 최상위 id가 유효한 UUID가 아닙니다.');
  }
  if (typeof build.status !== 'string' || build.status.toUpperCase() !== 'FINISHED') {
    throw new Error('EAS build가 FINISHED 상태가 아니므로 제출할 수 없습니다.');
  }
  if (typeof build.platform !== 'string' || build.platform.toUpperCase() !== 'ANDROID') {
    throw new Error('EAS build 결과가 Android 플랫폼이 아닙니다.');
  }

  return {
    id: build.id,
    platform: 'ANDROID',
    status: 'FINISHED',
  };
}

export function buildEvidence(rawJson, build, environment = process.env) {
  const evidence = {
    schemaVersion: 1,
    generator: 'extract-eas-build-id.mjs',
    easCliVersion: '21.3.0',
    rawBuildJsonSha256: crypto.createHash('sha256').update(rawJson).digest('hex'),
    build,
  };

  if (/^[0-9a-f]{40}$/i.test(environment.GITHUB_SHA ?? '')) {
    evidence.sourceCommit = environment.GITHUB_SHA.toLowerCase();
  }
  if (/^\d+$/.test(environment.GITHUB_RUN_ID ?? '')) {
    evidence.githubRunId = environment.GITHUB_RUN_ID;
  }
  if (/^\d+$/.test(environment.GITHUB_RUN_ATTEMPT ?? '')) {
    evidence.githubRunAttempt = environment.GITHUB_RUN_ATTEMPT;
  }

  return evidence;
}

export function parseArguments(args) {
  if (args.includes('--help') || args.includes('-h')) {
    return { help: true, inputPath: undefined, evidencePath: undefined };
  }

  let inputPath;
  let evidencePath;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--evidence') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('--evidence 뒤에 출력 JSON 경로가 필요합니다.');
      }
      evidencePath = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) {
      throw new Error(`알 수 없는 인자입니다: ${argument}`);
    }
    if (inputPath) {
      throw new Error('EAS build JSON 입력 파일은 하나만 지정할 수 있습니다.');
    }
    inputPath = argument;
  }

  if (!inputPath) {
    throw new Error('EAS build --json 결과 파일 경로가 필요합니다.');
  }
  return { help: false, inputPath, evidencePath };
}

function printUsage() {
  console.error(
    '사용법: node scripts/extract-eas-build-id.mjs <eas-build-result.json> [--evidence <validated-build.json>]',
  );
}

export function main(args = process.argv.slice(2), environment = process.env) {
  let options;
  try {
    options = parseArguments(args);
  } catch (error) {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    printUsage();
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    printUsage();
    return;
  }

  try {
    const rawJson = fs.readFileSync(options.inputPath, 'utf8');
    const build = parseBuildResult(rawJson);
    if (options.evidencePath) {
      const evidenceDirectory = path.dirname(path.resolve(options.evidencePath));
      fs.mkdirSync(evidenceDirectory, { recursive: true });
      fs.writeFileSync(
        options.evidencePath,
        `${JSON.stringify(buildEvidence(rawJson, build, environment), null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 },
      );
    }
    process.stdout.write(`${build.id}\n`);
  } catch (error) {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) main();
