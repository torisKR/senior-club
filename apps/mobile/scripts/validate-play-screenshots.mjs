import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const defaultManifestPath = path.join(
  mobileRoot,
  'store-listing',
  'screenshots',
  'final',
  'ko-KR',
  'manifest.json',
);
const maxPngBytes = 8 * 1024 * 1024;
const pngSignature = '89504e470d0a1a0a';

const setPolicies = {
  phone: {
    label: '휴대전화',
    filenamePrefix: 'phone',
    minimumCount: 5,
    maximumCount: 6,
  },
  tablet7: {
    label: '7인치 태블릿',
    filenamePrefix: 'tablet-7',
    minimumCount: 4,
    maximumCount: 8,
  },
  tablet10: {
    label: '10인치 태블릿',
    filenamePrefix: 'tablet-10',
    minimumCount: 4,
    maximumCount: 8,
  },
};

const requiredAttestations = [
  'capturedFromFinalUi',
  'noOldBrandOrDemoCopy',
  'noPersonalData',
  'reviewerCanReachShownFeatures',
  'contentRightsCleared',
  'statusBarSanitized',
];

const forbiddenManifestKey =
  /(?:api[-_]?key|credential|password|private[-_]?key|secret|service[-_]?account|token)/i;
const emailAddress = /(^|[^\w.+-])[^\s@]+@[^\s@]+\.[^\s@]+($|[^\w.-])/;

const failures = [];
const warnings = [];
let checkedFiles = 0;

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function countCharacters(value) {
  return [...value].length;
}

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function validateNoSecrets(value, pointer = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateNoSecrets(item, `${pointer}[${index}]`));
    return;
  }

  if (!isObject(value)) {
    if (typeof value === 'string') {
      if (value.includes('REPLACE_WITH_')) {
        fail(`${pointer}: REPLACE_WITH_ placeholder를 실제 비자격증명 값으로 바꾸세요.`);
      }
      if (value.includes('BEGIN PRIVATE KEY')) {
        fail(`${pointer}: manifest에 비밀 키를 넣지 마세요.`);
      }
      if (emailAddress.test(value)) {
        fail(`${pointer}: manifest에 심사용 계정이나 이메일 주소를 넣지 마세요.`);
      }
    }
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedPointer = `${pointer}.${key}`;
    if (forbiddenManifestKey.test(key)) {
      fail(`${nestedPointer}: 자격 증명 항목은 manifest에 포함할 수 없습니다.`);
    }
    validateNoSecrets(nestedValue, nestedPointer);
  }
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const crcTable = buildCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function inspectPng(filePath) {
  const data = fs.readFileSync(filePath);
  if (data.length < 33 || data.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error('PNG signature가 잘못되었습니다.');
  }

  let offset = 8;
  let ihdr;
  let hasIdat = false;
  let hasTransparencyChunk = false;
  let reachedEnd = false;

  while (offset < data.length) {
    if (offset + 12 > data.length) {
      throw new Error('PNG chunk header가 잘렸습니다.');
    }

    const length = data.readUInt32BE(offset);
    const typeStart = offset + 4;
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + length;
    const crcOffset = payloadEnd;
    const nextOffset = crcOffset + 4;

    if (payloadEnd < payloadStart || nextOffset > data.length) {
      throw new Error('PNG chunk 길이가 잘못되었습니다.');
    }

    const type = data.subarray(typeStart, payloadStart).toString('ascii');
    const expectedCrc = data.readUInt32BE(crcOffset);
    const actualCrc = crc32(data.subarray(typeStart, payloadEnd));
    if (expectedCrc !== actualCrc) {
      throw new Error(`${type} chunk CRC가 잘못되었습니다.`);
    }

    if (type === 'IHDR') {
      if (ihdr || length !== 13 || offset !== 8) {
        throw new Error('IHDR chunk가 잘못되었습니다.');
      }
      ihdr = {
        width: data.readUInt32BE(payloadStart),
        height: data.readUInt32BE(payloadStart + 4),
        bitDepth: data[payloadStart + 8],
        colorType: data[payloadStart + 9],
        compressionMethod: data[payloadStart + 10],
        filterMethod: data[payloadStart + 11],
        interlaceMethod: data[payloadStart + 12],
      };
    } else if (type === 'IDAT') {
      hasIdat = true;
    } else if (type === 'tRNS') {
      hasTransparencyChunk = true;
    } else if (type === 'IEND') {
      if (length !== 0) {
        throw new Error('IEND chunk가 잘못되었습니다.');
      }
      reachedEnd = true;
      offset = nextOffset;
      break;
    }

    offset = nextOffset;
  }

  if (!ihdr || !hasIdat || !reachedEnd) {
    throw new Error('PNG 필수 chunk가 누락됐습니다.');
  }
  if (offset !== data.length) {
    throw new Error('IEND 뒤에 예상하지 못한 데이터가 있습니다.');
  }

  return {
    ...ihdr,
    bytes: data.length,
    hasTransparencyChunk,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
  };
}

function listPngFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const result = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        fail(`${absolutePath}: 스크린샷 자산에 symbolic link를 사용할 수 없습니다.`);
      } else if (entry.isDirectory()) {
        pending.push(absolutePath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
        result.push(absolutePath);
      }
    }
  }
  return result.sort();
}

function validateManifestMetadata(manifest) {
  if (manifest.schemaVersion !== 1) {
    fail('schemaVersion은 1이어야 합니다.');
  }

  if (!isObject(manifest.app)) {
    fail('app 항목이 필요합니다.');
  } else {
    if (manifest.app.name !== '시니어클럽') {
      fail(`app.name은 "시니어클럽"이어야 합니다: ${String(manifest.app.name)}`);
    }
    if (manifest.app.packageName !== 'com.toris.seniorclub') {
      fail(`app.packageName이 다릅니다: ${String(manifest.app.packageName)}`);
    }
    if (typeof manifest.app.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.app.version)) {
      fail('app.version을 0.1.0 형식으로 입력하세요.');
    }
  }

  if (!isObject(manifest.capture)) {
    fail('capture 항목이 필요합니다.');
  } else {
    const capture = manifest.capture;
    if (typeof capture.commit !== 'string' || !/^[0-9a-f]{7,40}$/i.test(capture.commit)) {
      fail('capture.commit에 실제 Git commit SHA(7~40자)를 입력하세요.');
    }
    if (
      typeof capture.artifactSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(capture.artifactSha256)
    ) {
      fail('capture.artifactSha256에 캡처에 사용한 APK의 SHA-256을 입력하세요.');
    }
    if (
      typeof capture.artifactFile !== 'string' ||
      !/^[0-9A-Za-z._-]+\.apk$/.test(capture.artifactFile)
    ) {
      fail('capture.artifactFile에 경로가 아닌 APK 파일명만 입력하세요.');
    }
    if (!['internal', 'preview', 'playInternal', 'production'].includes(capture.buildProfile)) {
      fail('capture.buildProfile은 internal, preview, playInternal, production 중 하나여야 합니다.');
    }
    if (
      typeof capture.capturedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(capture.capturedAt) ||
      Number.isNaN(Date.parse(capture.capturedAt))
    ) {
      fail('capture.capturedAt을 timezone이 포함된 ISO 8601 형식으로 입력하세요.');
    }
    if (capture.locale !== 'ko-KR') {
      fail('capture.locale은 ko-KR이어야 합니다.');
    }
    if (capture.timeZone !== 'Asia/Seoul') {
      fail('capture.timeZone은 Asia/Seoul이어야 합니다.');
    }
    if (capture.colorScheme !== 'light') {
      fail('capture.colorScheme은 light이어야 합니다.');
    }
    if (capture.fontScale !== 1) {
      fail('capture.fontScale은 1이어야 합니다.');
    }
    if (capture.animationsDisabled !== true) {
      fail('capture.animationsDisabled를 true로 확인하세요.');
    }
  }

  if (!isObject(manifest.attestations)) {
    fail('attestations 항목이 필요합니다.');
  } else {
    for (const key of requiredAttestations) {
      if (manifest.attestations[key] !== true) {
        fail(`attestations.${key}를 사람이 검토한 뒤 true로 변경하세요.`);
      }
    }
  }
}

function validateScreenshotFile({ file, set, policy, manifestDirectory, assetRootDirectory, seenPaths }) {
  if (!isObject(file)) {
    fail(`${set.deviceType}: 파일 항목은 object여야 합니다.`);
    return;
  }

  const order = file.order;
  const relativePath = file.path;
  if (!Number.isInteger(order) || order < 1 || order > 99) {
    fail(`${set.deviceType}: order는 1~99 정수여야 합니다.`);
  }
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    fail(`${set.deviceType} ${String(order)}: path가 필요합니다.`);
    return;
  }

  const normalizedRelativePath = relativePath.split('/').join(path.sep);
  const absolutePath = path.resolve(manifestDirectory, normalizedRelativePath);
  if (!isPathInside(assetRootDirectory, absolutePath)) {
    fail(`${relativePath}: assetRoot 밖의 파일은 사용할 수 없습니다.`);
    return;
  }

  const comparablePath = path.normalize(absolutePath);
  if (seenPaths.has(comparablePath)) {
    fail(`${relativePath}: 중복된 파일 경로입니다.`);
    return;
  }
  seenPaths.add(comparablePath);

  const basename = path.basename(relativePath);
  const expectedFilename = new RegExp(
    `^${policy.filenamePrefix}-(\\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\\.png$`,
  );
  const filenameMatch = basename.match(expectedFilename);
  if (!filenameMatch) {
    fail(
      `${relativePath}: ${policy.filenamePrefix}-01-home.png 형식의 영문 소문자 파일명을 사용하세요.`,
    );
  } else if (Number(filenameMatch[1]) !== order) {
    fail(`${relativePath}: 파일명 순서와 order ${order}가 다릅니다.`);
  }

  if (typeof file.screen !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(file.screen)) {
    fail(`${relativePath}: screen을 home, event-detail 같은 slug로 입력하세요.`);
  } else if (filenameMatch && filenameMatch[2] !== file.screen) {
    fail(`${relativePath}: 파일명의 screen과 manifest screen(${file.screen})이 다릅니다.`);
  }

  if (typeof file.altText !== 'string' || countCharacters(file.altText.trim()) === 0) {
    fail(`${relativePath}: altText가 필요합니다.`);
  } else if (countCharacters(file.altText.trim()) > 140) {
    fail(`${relativePath}: altText는 140자 이하여야 합니다.`);
  }

  if (file.caption !== null && file.caption !== undefined) {
    if (typeof file.caption !== 'string' || countCharacters(file.caption.trim()) === 0) {
      fail(`${relativePath}: caption은 비어 있는 문자열이 아니라 null로 표시하세요.`);
    } else if (countCharacters(file.caption.trim()) > 80) {
      fail(`${relativePath}: caption은 80자 이하여야 합니다.`);
    }
  }

  if (!fs.existsSync(absolutePath)) {
    fail(`${relativePath}: 파일이 없습니다.`);
    return;
  }

  const stat = fs.lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(`${relativePath}: 일반 파일만 사용할 수 있습니다.`);
    return;
  }

  let info;
  try {
    info = inspectPng(absolutePath);
  } catch (error) {
    fail(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  checkedFiles += 1;
  if (info.width !== set.width || info.height !== set.height) {
    fail(`${relativePath}: ${info.width}x${info.height}, manifest는 ${set.width}x${set.height}입니다.`);
  }
  if (info.bytes > maxPngBytes) {
    fail(`${relativePath}: ${info.bytes}B로 8MiB를 초과합니다.`);
  }
  if (info.bitDepth !== 8 || info.colorType !== 2) {
    fail(`${relativePath}: 8-bit RGB PNG(colorType 2)여야 합니다. 현재 bitDepth ${info.bitDepth}, colorType ${info.colorType}입니다.`);
  }
  if (info.hasTransparencyChunk) {
    fail(`${relativePath}: tRNS 투명도 chunk를 제거하세요.`);
  }
  if (info.compressionMethod !== 0 || info.filterMethod !== 0 || ![0, 1].includes(info.interlaceMethod)) {
    fail(`${relativePath}: 표준 PNG IHDR 설정이 아닙니다.`);
  }

  if (file.sha256 !== undefined) {
    if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(file.sha256)) {
      fail(`${relativePath}: sha256은 64자 형식이어야 합니다.`);
    } else if (file.sha256.toLowerCase() !== info.sha256) {
      fail(`${relativePath}: sha256가 파일과 다릅니다. 실제 ${info.sha256}`);
    }
  } else {
    warn(`${relativePath}: 무결성 고정이 필요하면 sha256를 추가하세요 (${info.sha256}).`);
  }
}

function validateSets(manifest, manifestDirectory) {
  if (typeof manifest.assetRoot !== 'string' || manifest.assetRoot.length === 0) {
    fail('assetRoot가 필요합니다.');
    return;
  }

  const assetRootDirectory = path.resolve(
    manifestDirectory,
    manifest.assetRoot.split('/').join(path.sep),
  );
  if (!isPathInside(manifestDirectory, assetRootDirectory)) {
    fail('assetRoot는 manifest 디렉터리 안의 상대 경로여야 합니다.');
    return;
  }

  if (!Array.isArray(manifest.sets)) {
    fail('sets 배열이 필요합니다.');
    return;
  }

  const seenDeviceTypes = new Set();
  const seenPaths = new Set();

  for (const set of manifest.sets) {
    if (!isObject(set)) {
      fail('sets 항목은 object여야 합니다.');
      continue;
    }

    const policy = setPolicies[set.deviceType];
    if (!policy) {
      fail(`알 수 없는 deviceType입니다: ${String(set.deviceType)}`);
      continue;
    }
    if (seenDeviceTypes.has(set.deviceType)) {
      fail(`${set.deviceType}: 기기 세트는 하나만 정의하세요.`);
      continue;
    }
    seenDeviceTypes.add(set.deviceType);

    if (set.orientation !== 'portrait') {
      fail(`${policy.label}: 세로 고정 앱이므로 orientation은 portrait여야 합니다.`);
    }
    if (!Number.isInteger(set.width) || !Number.isInteger(set.height)) {
      fail(`${policy.label}: width와 height는 정수여야 합니다.`);
    } else {
      const shortEdge = Math.min(set.width, set.height);
      const longEdge = Math.max(set.width, set.height);
      if (set.width >= set.height || set.width * 16 !== set.height * 9) {
        fail(`${policy.label}: ${set.width}x${set.height}는 세로 9:16 비율이 아닙니다.`);
      }
      if (shortEdge < 1080 || longEdge > 3840 || longEdge > shortEdge * 2) {
        fail(`${policy.label}: 짧은 변 1080px 이상, 긴 변 3840px 이하여야 합니다.`);
      }
    }

    if (!Array.isArray(set.files)) {
      fail(`${policy.label}: files 배열이 필요합니다.`);
      continue;
    }
    if (set.files.length < policy.minimumCount || set.files.length > policy.maximumCount) {
      fail(`${policy.label}: ${policy.minimumCount}~${policy.maximumCount}장이 필요합니다. 현재 ${set.files.length}장입니다.`);
    }

    const orders = set.files.map((file) => (isObject(file) ? file.order : undefined));
    for (let index = 0; index < set.files.length; index += 1) {
      if (orders[index] !== index + 1) {
        fail(`${policy.label}: files는 order 1부터 빠짐없이 정렬하세요.`);
        break;
      }
    }

    for (const file of set.files) {
      validateScreenshotFile({
        file,
        set,
        policy,
        manifestDirectory,
        assetRootDirectory,
        seenPaths,
      });
    }
  }

  for (const [deviceType, policy] of Object.entries(setPolicies)) {
    if (!seenDeviceTypes.has(deviceType)) {
      fail(`${policy.label}(${deviceType}) 세트가 누락됐습니다.`);
    }
  }

  const diskPngPaths = new Set(listPngFiles(assetRootDirectory).map((filePath) => path.normalize(filePath)));
  for (const filePath of diskPngPaths) {
    if (!seenPaths.has(filePath)) {
      fail(`${path.relative(manifestDirectory, filePath)}: manifest에 없는 PNG 파일입니다.`);
    }
  }
}

function printUsage() {
  console.log(`사용법:
  node scripts/validate-play-screenshots.mjs [manifest 경로]

기본 manifest:
  ${path.relative(mobileRoot, defaultManifestPath)}

예시 manifest를 manifest.json으로 복사한 뒤 실제 캡처 정보와 파일로 교체하세요.`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }
  if (args.length > 1 || args.some((argument) => argument.startsWith('-'))) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const manifestPath = path.resolve(args[0] ?? defaultManifestPath);
  if (!fs.existsSync(manifestPath)) {
    console.error(`FAIL manifest가 없습니다: ${manifestPath}`);
    console.error('manifest.example.json을 manifest.json으로 복사한 뒤 실제 값을 입력하세요.');
    process.exitCode = 1;
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    console.error(`FAIL manifest JSON을 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  if (!isObject(manifest)) {
    fail('manifest 최상위 값은 object여야 합니다.');
  } else {
    validateNoSecrets(manifest);
    validateManifestMetadata(manifest);
    validateSets(manifest, path.dirname(manifestPath));
  }

  for (const message of warnings) {
    console.warn(`WARN ${message}`);
  }
  for (const message of failures) {
    console.error(`FAIL ${message}`);
  }

  if (failures.length > 0) {
    console.error(`\nPlay screenshot 검증 실패: ${failures.length}개 오류, ${warnings.length}개 경고, ${checkedFiles}개 PNG 검사.`);
    process.exitCode = 1;
    return;
  }

  console.log(`PASS Play screenshot 검증: ${checkedFiles}개 PNG, ${warnings.length}개 경고.`);
}

main();
