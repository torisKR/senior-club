import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const MAX_FILE_BYTES = 8 * 1024 * 1024;

// These release gates intentionally use Google Play's recommendation-ready
// dimensions, not merely its two-screenshot publication minimum.
const screenshotGroups = [
  {
    label: '휴대전화',
    relativeDirectory: 'store-listing/screenshots/phone',
    minimumCount: 4,
    maximumCount: 8,
    minimumShortSide: 1080,
    maximumLongSide: 3840,
    ratios: [[9, 16]],
  },
  {
    label: '7인치 태블릿',
    relativeDirectory: 'store-listing/screenshots/tablet-7',
    minimumCount: 4,
    maximumCount: 8,
    minimumShortSide: 1080,
    maximumLongSide: 7680,
    ratios: [
      [9, 16],
      [16, 9],
    ],
  },
  {
    label: '10인치 태블릿',
    relativeDirectory: 'store-listing/screenshots/tablet-10',
    minimumCount: 4,
    maximumCount: 8,
    minimumShortSide: 1080,
    maximumLongSide: 7680,
    ratios: [
      [9, 16],
      [16, 9],
    ],
  },
];

let failureCount = 0;

function fail(message) {
  failureCount += 1;
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function isSupportedImage(filename) {
  return /\.(?:jpe?g|png)$/i.test(filename);
}

function readPngInfo(data, relativePath) {
  if (data.length < 29 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${relativePath}: PNG 확장자와 실제 파일 형식이 일치하지 않습니다.`);
  }

  return {
    format: 'PNG',
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    bitDepth: data[24],
    colorType: data[25],
  };
}

function readJpegInfo(data, relativePath) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    throw new Error(`${relativePath}: JPEG 확장자와 실제 파일 형식이 일치하지 않습니다.`);
  }

  const startOfFrameMarkers = new Set([
    0xc0,
    0xc1,
    0xc2,
    0xc3,
    0xc5,
    0xc6,
    0xc7,
    0xc9,
    0xca,
    0xcb,
    0xcd,
    0xce,
    0xcf,
  ]);
  let offset = 2;

  while (offset < data.length) {
    while (offset < data.length && data[offset] !== 0xff) offset += 1;
    while (offset < data.length && data[offset] === 0xff) offset += 1;
    if (offset >= data.length) break;

    const marker = data[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.length) break;

    const segmentLength = data.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > data.length) break;
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 8) break;
      return {
        format: 'JPEG',
        width: data.readUInt16BE(offset + 5),
        height: data.readUInt16BE(offset + 3),
        bitDepth: data[offset + 2],
      };
    }
    offset += segmentLength;
  }

  throw new Error(`${relativePath}: JPEG 크기 정보를 읽을 수 없습니다.`);
}

function readImageInfo(absolutePath, relativePath) {
  const data = fs.readFileSync(absolutePath);
  const extension = path.extname(relativePath).toLowerCase();
  const info = extension === '.png' ? readPngInfo(data, relativePath) : readJpegInfo(data, relativePath);
  return {
    ...info,
    bytes: data.length,
    digest: crypto.createHash('sha256').update(data).digest('hex'),
  };
}

function ratioLabel(ratios) {
  return ratios.map(([width, height]) => `${width}:${height}`).join(' 또는 ');
}

function hasAllowedRatio(width, height, ratios) {
  return ratios.some(
    ([expectedWidth, expectedHeight]) => width * expectedHeight === height * expectedWidth,
  );
}

function validateImage(group, relativePath, seenDigests) {
  const absolutePath = path.join(root, relativePath);
  const failuresBeforeValidation = failureCount;
  try {
    const info = readImageInfo(absolutePath, relativePath);
    const shortSide = Math.min(info.width, info.height);
    const longSide = Math.max(info.width, info.height);

    if (info.bytes > MAX_FILE_BYTES) {
      fail(`${relativePath}: ${info.bytes}B로 8MB 제한을 초과합니다.`);
    }
    if (info.format === 'PNG' && (info.bitDepth !== 8 || info.colorType !== 2)) {
      fail(`${relativePath}: 스크린샷 PNG는 알파가 없는 8-bit RGB(24-bit)여야 합니다.`);
    }
    if (info.format === 'JPEG' && info.bitDepth !== 8) {
      fail(`${relativePath}: JPEG는 채널당 8-bit여야 합니다.`);
    }
    if (shortSide < group.minimumShortSide || longSide > group.maximumLongSide) {
      fail(
        `${relativePath}: ${info.width}x${info.height}; 짧은 변은 ${group.minimumShortSide}px 이상, 긴 변은 ${group.maximumLongSide}px 이하여야 합니다.`,
      );
    }
    if (!hasAllowedRatio(info.width, info.height, group.ratios)) {
      fail(
        `${relativePath}: ${info.width}x${info.height}; 화면 비율은 ${ratioLabel(group.ratios)}여야 합니다.`,
      );
    }
    if (seenDigests.has(info.digest)) {
      fail(`${relativePath}: 같은 기기군 안에 완전히 동일한 스크린샷이 중복되어 있습니다.`);
    } else {
      seenDigests.add(info.digest);
    }

    if (failureCount === failuresBeforeValidation) {
      pass(`${relativePath}: ${info.format} ${info.width}x${info.height}, ${info.bytes}B`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

const discoveredGroups = screenshotGroups.map((group) => {
  const absoluteDirectory = path.join(root, group.relativeDirectory);
  const files = fs.existsSync(absoluteDirectory)
    ? fs
        .readdirSync(absoluteDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort()
    : [];
  return { ...group, absoluteDirectory, files };
});

if (discoveredGroups.every((group) => group.files.length === 0)) {
  fail('최종 Google Play 제출용 스크린샷이 없습니다. 임시·이전 브랜드 캡처는 통과하지 않습니다.');
  console.error('필수 디렉터리와 수량:');
  for (const group of discoveredGroups) {
    console.error(
      `  - ${group.relativeDirectory}: ${group.minimumCount}~${group.maximumCount}장, ${ratioLabel(group.ratios)}, 짧은 변 ${group.minimumShortSide}px 이상`,
    );
  }
} else {
  for (const group of discoveredGroups) {
    const unsupportedFiles = group.files.filter((filename) => !isSupportedImage(filename));
    const imageFiles = group.files.filter(isSupportedImage);

    for (const filename of unsupportedFiles) {
      fail(`${path.join(group.relativeDirectory, filename)}: PNG 또는 JPEG만 허용됩니다.`);
    }
    if (imageFiles.length < group.minimumCount || imageFiles.length > group.maximumCount) {
      fail(
        `${group.relativeDirectory}: ${imageFiles.length}장; ${group.label} 스크린샷은 ${group.minimumCount}~${group.maximumCount}장이 필요합니다.`,
      );
    } else {
      pass(`${group.relativeDirectory}: ${imageFiles.length}장`);
    }

    const seenDigests = new Set();
    for (const filename of imageFiles) {
      validateImage(group, path.join(group.relativeDirectory, filename), seenDigests);
    }
  }
}

if (failureCount > 0) {
  console.error(`\nGoogle Play 후보 스크린샷 규격 검증 실패 (${failureCount}건).`);
  process.exitCode = 1;
} else {
  console.log('\nGoogle Play 후보 스크린샷 규격 검증 통과.');
}
