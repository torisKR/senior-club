import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(import.meta.dirname, '..');

export function parseArguments(args) {
  if (args.includes('--help') || args.includes('-h')) {
    return { help: true, screenshotManifest: undefined };
  }

  let screenshotManifest;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--screenshot-manifest') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('--screenshot-manifest 뒤에 최종 manifest 경로가 필요합니다.');
      }
      screenshotManifest = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--screenshot-manifest=')) {
      screenshotManifest = argument.slice('--screenshot-manifest='.length);
      if (!screenshotManifest) {
        throw new Error('--screenshot-manifest 경로가 비어 있습니다.');
      }
      continue;
    }
    throw new Error(`알 수 없는 인자입니다: ${argument}`);
  }

  return { help: false, screenshotManifest };
}

export function buildPreflightSteps({ screenshotManifest } = {}) {
  const strictScreenshotArgs = [
    path.join(mobileRoot, 'scripts', 'validate-play-screenshots.mjs'),
  ];
  if (screenshotManifest) strictScreenshotArgs.push(screenshotManifest);

  return [
    {
      label: 'Play 등록정보와 브랜드 자산',
      args: [path.join(mobileRoot, 'scripts', 'validate-play-assets.mjs')],
    },
    {
      label: 'production Expo config와 Android manifest',
      args: [path.join(mobileRoot, 'scripts', 'validate-android-manifest.mjs')],
      env: { EXPO_PUBLIC_APP_ENV: 'production' },
    },
    {
      label: 'production API와 공개 정책 endpoint',
      args: [path.join(mobileRoot, 'scripts', 'validate-release-endpoints.mjs')],
    },
    {
      label: '후보 스토어 스크린샷 규격',
      args: [path.join(mobileRoot, 'scripts', 'validate-store-screenshots.mjs')],
    },
    {
      label: '최종 스크린샷 provenance와 수동 확인 증빙 (strict)',
      args: strictScreenshotArgs,
    },
  ];
}

function printUsage() {
  console.log(`사용법:
  pnpm release:android:preflight [--screenshot-manifest <경로>]

필수 환경:
  EXPO_PUBLIC_API_URL=https://실제-public-api-origin
  EXPO_PUBLIC_WEB_URL=https://실제-public-web-origin
  GOOGLE_SERVICES_JSON=<Android client google-services.json 경로>

EXPO_PUBLIC_APP_ENV는 우회할 수 없도록 production으로 고정됩니다. 최종 screenshot
manifest를 생략하면 store-listing/screenshots/final/ko-KR/manifest.json을 strict gate로 검사합니다.`);
}

export function main(args = process.argv.slice(2)) {
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

  const steps = buildPreflightSteps(options);
  const failedSteps = [];
  for (const [index, step] of steps.entries()) {
    console.log(`\n[${index + 1}/${steps.length}] ${step.label}`);
    const result = spawnSync(process.execPath, step.args, {
      cwd: mobileRoot,
      env: { ...process.env, ...step.env, CI: '1' },
      stdio: 'inherit',
    });

    if (result.error) {
      console.error(`FAIL 실행할 수 없습니다: ${result.error.message}`);
      failedSteps.push(step.label);
    } else if (result.status !== 0) {
      failedSteps.push(step.label);
    }
  }

  if (failedSteps.length > 0) {
    console.error(`\nAndroid release preflight 실패 (${failedSteps.length}/${steps.length} 단계).`);
    for (const label of failedSteps) console.error(`- ${label}`);
    process.exitCode = 1;
    return;
  }

  console.log('\nPASS Android pre-build/config/endpoint/store-evidence preflight.');
  console.log(
    'PENDING 실제 AAB binary 검사는 수행하지 않았습니다. EAS AAB 생성 후 Play App Bundle Explorer에서 package, versionCode, target API 36, signing, merged manifest를 별도로 확인하세요.',
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) main();
