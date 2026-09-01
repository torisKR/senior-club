import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').trim();
}

function checkText(relativePath, maxCharacters) {
  const value = readText(relativePath);
  const count = [...value].length;
  if (count === 0 || count > maxCharacters) {
    fail(`${relativePath}: ${count}/${maxCharacters}자`);
  } else {
    pass(`${relativePath}: ${count}/${maxCharacters}자`);
  }
}

function pngInfo(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const data = fs.readFileSync(absolutePath);
  const signature = data.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error(`${relativePath} is not a PNG`);
  }
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25],
    bytes: data.length,
  };
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const data = fs.readFileSync(absolutePath);
  if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${relativePath} is not a PNG`);
  }

  let offset = 8;
  let header;
  const compressed = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString('ascii');
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: chunk.readUInt32BE(0),
        height: chunk.readUInt32BE(4),
        bitDepth: chunk[8],
        colorType: chunk[9],
        interlace: chunk[12],
      };
    } else if (type === 'IDAT') {
      compressed.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  if (!header || header.bitDepth !== 8 || header.interlace !== 0 || ![2, 6].includes(header.colorType)) {
    throw new Error(`${relativePath} must be a non-interlaced 8-bit RGB/RGBA PNG`);
  }

  const bytesPerPixel = header.colorType === 6 ? 4 : 3;
  const stride = header.width * bytesPerPixel;
  const inflated = zlib.inflateSync(Buffer.concat(compressed));
  const pixels = Buffer.alloc(header.height * stride);
  let sourceOffset = 0;

  for (let y = 0; y < header.height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[rowOffset - stride + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[rowOffset - stride + x - bytesPerPixel] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paethPredictor(left, above, upperLeft);
      else if (filter !== 0) throw new Error(`${relativePath} uses unsupported PNG filter ${filter}`);
      pixels[rowOffset + x] = (raw + predictor) & 0xff;
    }
    sourceOffset += stride;
  }

  return { ...header, bytesPerPixel, pixels };
}

function analyzeRgba(relativePath) {
  const image = decodePng(relativePath);
  if (image.colorType !== 6) throw new Error(`${relativePath} must be RGBA`);
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  let transparent = 0;
  let visible = 0;
  let visibleMagenta = 0;
  let ochre = 0;
  const visibleColors = new Set();

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const red = image.pixels[offset];
      const green = image.pixels[offset + 1];
      const blue = image.pixels[offset + 2];
      const alpha = image.pixels[offset + 3];
      if (alpha === 0) transparent += 1;
      if (alpha > 0) {
        visible += 1;
        visibleColors.add((red << 16) | (green << 8) | blue);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if (alpha > 2) {
        if (red === 255 && green === 0 && blue === 255) visibleMagenta += 1;
        if (red === 183 && green === 121 && blue === 31) ochre += 1;
      }
    }
  }

  return {
    ...image,
    bbox: maxX >= minX ? [minX, minY, maxX + 1, maxY + 1] : null,
    transparent,
    visible,
    visibleColors,
    visibleMagenta,
    ochre,
  };
}

function checkRgbaAsset(
  relativePath,
  {
    width,
    height,
    maxBytes,
    requireTransparency = true,
    requireMonochrome = false,
    expectedVisibleColor,
    maximumVisibleWidth,
    maximumVisibleHeight,
  },
) {
  try {
    const file = pngInfo(relativePath);
    const info = analyzeRgba(relativePath);
    const problems = [];

    if (info.width !== width || info.height !== height || file.bytes > maxBytes) {
      problems.push(`${info.width}x${info.height}, ${file.bytes}B`);
    }
    if (!info.bbox || info.visible === 0) {
      problems.push('visible bbox is empty');
    }
    if (requireTransparency && info.transparent === 0) {
      problems.push('transparent background is required');
    }
    if (requireMonochrome && info.visibleColors.size !== 1) {
      problems.push(`visible RGB colors=${info.visibleColors.size}, expected 1`);
    }
    if (
      expectedVisibleColor !== undefined &&
      (info.visibleColors.size !== 1 || !info.visibleColors.has(expectedVisibleColor))
    ) {
      const expectedHex = expectedVisibleColor.toString(16).padStart(6, '0').toUpperCase();
      problems.push(`visible pixels must be #${expectedHex}`);
    }

    let bboxLabel = 'empty';
    if (info.bbox) {
      const [left, top, right, bottom] = info.bbox;
      const visibleWidth = right - left;
      const visibleHeight = bottom - top;
      bboxLabel = `${visibleWidth}x${visibleHeight}`;
      if (
        (maximumVisibleWidth !== undefined && visibleWidth > maximumVisibleWidth) ||
        (maximumVisibleHeight !== undefined && visibleHeight > maximumVisibleHeight)
      ) {
        problems.push(`visible bbox ${bboxLabel} exceeds safe area`);
      }
    }

    if (problems.length > 0) {
      fail(`${relativePath}: ${problems.join('; ')}`);
    } else {
      pass(`${relativePath}: ${width}x${height} RGBA, visible bbox ${bboxLabel}`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function resolveAppAssetReference(reference, label) {
  if (typeof reference !== 'string' || reference.trim() !== reference || reference.length === 0) {
    fail(`${label} asset reference is missing or invalid: ${String(reference)}`);
    return null;
  }

  const absolutePath = path.resolve(root, reference);
  const relativePath = path.relative(root, absolutePath);
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    fail(`${label} asset reference must stay inside the mobile project: ${reference}`);
    return null;
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    fail(`${label} asset reference is missing: ${reference}`);
    return null;
  }

  const normalizedPath = relativePath.split(path.sep).join('/');
  pass(`${label} asset reference: ${reference}`);
  return normalizedPath;
}

function referencedTabIconPaths() {
  const layoutPath = path.join(root, 'src/app/(tabs)/_layout.tsx');
  const source = fs.readFileSync(layoutPath, 'utf8');
  const matcher = /require\(\s*['"]@\/assets\/images\/(tab-icons-v2\/[^'"]+\.png)['"]\s*\)/g;
  return [...source.matchAll(matcher)].map((match) => `assets/images/${match[1]}`);
}

function checkAdaptiveIcon() {
  const relativePath = 'assets/images/senior-club-adaptive-foreground-v2.png';
  try {
    const info = analyzeRgba(relativePath);
    if (!info.bbox) throw new Error(`${relativePath} has no visible pixels`);
    const [left, top, right, bottom] = info.bbox;
    const width = right - left;
    const height = bottom - top;
    if (width > 626 || height > 626) {
      fail(`${relativePath}: visible bbox ${width}x${height} exceeds adaptive safe area 626x626`);
    } else if (info.visibleMagenta > 0 || info.ochre < 100) {
      fail(`${relativePath}: magenta=${info.visibleMagenta}, ochre=${info.ochre}`);
    } else {
      pass(`${relativePath}: safe bbox ${width}x${height}, four-color mark retained`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function checkOpacity(relativePath, shouldBeOpaque) {
  try {
    const info = analyzeRgba(relativePath);
    const isOpaque = info.transparent === 0;
    if (isOpaque !== shouldBeOpaque) {
      fail(`${relativePath}: expected ${shouldBeOpaque ? 'opaque' : 'transparent'} output`);
    } else {
      pass(`${relativePath}: ${shouldBeOpaque ? 'opaque' : 'transparent'} alpha behavior`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function checkPng(relativePath, width, height, colorType, maxBytes) {
  try {
    const info = pngInfo(relativePath);
    if (
      info.width !== width ||
      info.height !== height ||
      info.colorType !== colorType ||
      info.bytes > maxBytes
    ) {
      fail(
        `${relativePath}: ${info.width}x${info.height}, colorType ${info.colorType}, ${info.bytes}B`,
      );
      return;
    }
    pass(`${relativePath}: ${width}x${height}, ${info.bytes}B`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

checkText('store-listing/ko-KR/title.txt', 30);
checkText('store-listing/ko-KR/short-description.txt', 80);
checkText('store-listing/ko-KR/full-description.txt', 4000);

// PNG color types: 2 = RGB, 6 = RGBA.
checkPng('store-listing/icon-512-v2.png', 512, 512, 6, 1_048_576);
checkPng('store-listing/feature-graphic-1024x500-v2.png', 1024, 500, 2, 1_048_576);
checkPng('assets/images/senior-club-icon-v2.png', 1024, 1024, 6, 1_048_576);
checkPng('assets/images/senior-club-adaptive-foreground-v2.png', 1024, 1024, 6, 1_048_576);
checkPng('assets/images/senior-club-splash-v3.png', 1024, 1024, 6, 1_048_576);
checkAdaptiveIcon();
checkOpacity('store-listing/icon-512-v2.png', true);
checkOpacity('assets/images/senior-club-splash-v3.png', false);

for (const stalePath of ['store-listing/icon-512.png', 'store-listing/screenshots/phone-login.png']) {
  if (fs.existsSync(path.join(root, stalePath))) fail(`stale Play asset must be archived: ${stalePath}`);
  else pass(`stale Play asset absent: ${stalePath}`);
}

const app = readJson('app.json').expo;
const eas = readJson('eas.json');
const notificationPlugin = app.plugins?.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications',
)?.[1];
const splashPlugin = app.plugins?.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
)?.[1];
const appAssetReferences = [
  ['app icon', app.icon],
  ['adaptive foreground', app.android?.adaptiveIcon?.foregroundImage],
  ['adaptive monochrome', app.android?.adaptiveIcon?.monochromeImage],
  ['notification icon', notificationPlugin?.icon],
  ['splash', splashPlugin?.image],
  ['web favicon', app.web?.favicon],
];
const resolvedAppAssets = new Map();

for (const [label, reference] of appAssetReferences) {
  const resolved = resolveAppAssetReference(reference, label);
  if (resolved) resolvedAppAssets.set(label, resolved);
}

const monochromePath = resolvedAppAssets.get('adaptive monochrome');
if (monochromePath) {
  checkRgbaAsset(monochromePath, {
    width: 1024,
    height: 1024,
    maxBytes: 1_048_576,
    requireMonochrome: true,
    maximumVisibleWidth: 626,
    maximumVisibleHeight: 626,
  });
}

const notificationPath = resolvedAppAssets.get('notification icon');
if (notificationPath) {
  checkRgbaAsset(notificationPath, {
    width: 96,
    height: 96,
    maxBytes: 65_536,
    requireMonochrome: true,
    expectedVisibleColor: 0xffffff,
  });
}

const faviconPath = resolvedAppAssets.get('web favicon');
if (faviconPath) {
  checkRgbaAsset(faviconPath, {
    width: 96,
    height: 96,
    maxBytes: 131_072,
  });
}

const uiLogoPath = 'assets/images/senior-club-logo-ui-v3.png';
try {
  const loginScreen = fs.readFileSync(path.join(root, 'src/screens/auth/login-screen.tsx'), 'utf8');
  if (!loginScreen.includes('senior-club-logo-ui-v3.png')) {
    fail('login screen must reference senior-club-logo-ui-v3.png');
  } else {
    pass('login screen references senior-club-logo-ui-v3.png');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
checkRgbaAsset(uiLogoPath, {
  width: 256,
  height: 256,
  maxBytes: 262_144,
});

try {
  const tabIconPaths = referencedTabIconPaths();
  if (tabIconPaths.length === 0) {
    fail('tab layout has no statically verifiable tab icon references');
  } else if (new Set(tabIconPaths).size !== tabIconPaths.length) {
    fail('tab layout contains duplicate tab icon references');
  } else {
    pass(`tab layout references ${tabIconPaths.length} unique icons`);
  }

  for (const tabIconPath of new Set(tabIconPaths)) {
    const resolved = resolveAppAssetReference(`./${tabIconPath}`, 'tab icon');
    if (!resolved) continue;
    checkRgbaAsset(resolved, {
      width: 96,
      height: 96,
      maxBytes: 65_536,
      requireMonochrome: true,
    });
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (app.android?.allowBackup === false) {
  pass('android.allowBackup=false');
} else {
  fail('android.allowBackup must be false');
}

if (eas.build?.playInternal?.android?.buildType === 'app-bundle') {
  pass('playInternal builds an AAB');
} else {
  fail('playInternal must build an AAB');
}

if (eas.build?.production?.android?.buildType === 'app-bundle') {
  pass('production builds an AAB');
} else {
  fail('production must build an AAB');
}

if (process.exitCode) {
  console.error('\nGoogle Play local asset validation failed.');
} else {
  console.log('\nGoogle Play local asset validation passed.');
  console.log('Production submission blockers remain in docs/RELEASE_READINESS.md.');
}
