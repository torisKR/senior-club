import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { buildPreflightSteps, parseArguments } from './release-android-preflight.mjs';
import { fontHasGlyph, inspectNavigationIcons, navigationGlyphs } from './validate-navigation-icons.mjs';

test('release preflight forces production and live endpoint gates before strict screenshots', () => {
  const steps = buildPreflightSteps({ screenshotManifest: 'evidence/manifest.json' });

  assert.equal(steps.length, 5);
  assert.equal(steps[1].env.EXPO_PUBLIC_APP_ENV, 'production');
  assert.match(steps[2].args[0], /validate-release-endpoints\.mjs$/);
  assert.match(steps[2].label, /endpoint/);
  assert.match(steps.at(-1).args[0], /validate-play-screenshots\.mjs$/);
  assert.equal(steps.at(-1).args[1], 'evidence/manifest.json');
  assert.match(steps.at(-1).label, /strict/);
});

test('release preflight has no skip flag and rejects missing manifest values', () => {
  assert.throws(() => parseArguments(['--skip-screenshots']), /알 수 없는 인자/);
  assert.throws(() => parseArguments(['--screenshot-manifest']), /경로가 필요/);
  assert.deepEqual(parseArguments([]), { help: false, screenshotManifest: undefined });
});

const mobileRoot = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(mobileRoot, file), 'utf8');
const navigationSources = {
  layout: read('src/app/(tabs)/_layout.tsx'),
  navigation: read('src/components/navigation/bottom-navigation.tsx'),
  destinations: read('src/components/navigation/bottom-navigation-layout.ts'),
  appIcon: read('src/components/ui/app-icon.tsx'),
};

test('release asset gate checks all five current renderer references and installed font glyphs', () => {
  const entries = inspectNavigationIcons(mobileRoot);
  assert.deepEqual(entries.map((entry) => entry.name), ['home', 'clubs', 'events', 'chat', 'me']);
  assert.equal(new Set(entries.map((entry) => entry.codePoint)).size, 5);
});

test('navigation gate rejects an unused custom bar even if its name remains in a comment', () => {
  const layout = navigationSources.layout.replace('<BottomNavigation {...props} />', '<OtherBar {...props} /> /* <BottomNavigation {...props} /> */');
  assert.throws(() => navigationGlyphs({ ...navigationSources, layout }), /shared BottomNavigation/);
});

test('navigation gate rejects a renderer disconnected from the destination icon', () => {
  const navigation = navigationSources.navigation.replace('name={destination.icon}', 'name="home"');
  assert.throws(() => navigationGlyphs({ ...navigationSources, navigation }), /destination.icon/);
});

test('navigation gate rejects duplicate destinations and missing labels', () => {
  for (const destinations of [
    navigationSources.destinations.replace("name: 'clubs'", "name: 'home'"),
    navigationSources.destinations.replace("label: '커뮤니티'", "label: ''"),
  ]) assert.throws(() => navigationGlyphs({ ...navigationSources, destinations }), /order, label or icon/);
});

test('navigation gate rejects undefined or reused glyph mappings', () => {
  for (const appIcon of [
    navigationSources.appIcon.replace('home: 59530,', ''),
    navigationSources.appIcon.replace('home: 59530,', 'home: 62003,'),
  ]) assert.throws(() => navigationGlyphs({ ...navigationSources, appIcon }), /Missing numeric|distinct/);
});

test('navigation gate rejects the wrong font or missing font loader', () => {
  for (const appIcon of [
    navigationSources.appIcon.replace('fontFamily: materialSymbols.name', "fontFamily: 'Pretendard'"),
    navigationSources.appIcon.replace('useFonts({', 'anotherLoader({'),
    navigationSources.appIcon.replace('expo-symbols/androidWeights/regular', 'expo-symbols/androidWeights/bold'),
  ]) assert.throws(() => navigationGlyphs({ ...navigationSources, appIcon }), /installed Material Symbols/);
});

test('navigation gate rejects comments in place of actual glyph rendering', () => {
  const appIcon = navigationSources.appIcon.replace('String.fromCodePoint(glyphs[name])', "'icon' /* String.fromCodePoint(glyphs[name]) */");
  assert.throws(() => navigationGlyphs({ ...navigationSources, appIcon }), /installed Material Symbols/);
});

test('font coverage rejects absent Unicode glyphs rather than accepting any nonempty font', () => {
  const require = createRequire(path.join(mobileRoot, 'package.json'));
  const symbols = require.resolve('expo-symbols/androidWeights/regular');
  const module = createRequire(symbols).resolve('@expo-google-fonts/material-symbols/400Regular');
  const font = fs.readFileSync(path.join(path.dirname(module), 'MaterialSymbols_400Regular.ttf'));
  assert.equal(fontHasGlyph(font, 59530), true);
  assert.equal(fontHasGlyph(font, 0x10ffff), false);
  assert.throws(() => fontHasGlyph(Buffer.alloc(12), 59530), /no cmap/);
});
