import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobileRequire = createRequire(resolve(root, 'apps/mobile/package.json'));
const owner = (parent, dependency) => createRequire(parent.resolve(dependency));
const packageManifest = (parent, dependency) => {
  let directory = dirname(parent.resolve(dependency));
  while (true) {
    const path = resolve(directory, 'package.json');
    try {
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      if (manifest.name === dependency) return { manifest, require: createRequire(path) };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const next = dirname(directory);
    assert.notEqual(next, directory, `package metadata not found for ${dependency}`);
    directory = next;
  }
};
const assertMinimumVersion = (parent, dependency, minimum) => {
  const resolved = packageManifest(parent, dependency);
  const current = resolved.manifest.version.match(/^(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);
  const required = minimum.split('.').map(Number);
  assert.ok(current, `${dependency} must use a stable version`);
  const comparison = current.findIndex((part, index) => part !== required[index]);
  assert.ok(comparison === -1 || current[comparison] > required[comparison],
    `${dependency} ${resolved.manifest.version} must be at least ${minimum}`);
  return resolved;
};

test('Expo route/query parsing decodes values, repeated parameters and flags', () => {
  const routerRoot = dirname(mobileRequire.resolve('expo-router/package.json'));
  const { getStateFromPath } = mobileRequire(resolve(routerRoot, 'build/fork/getStateFromPath.js'));
  const state = getStateFromPath('/events?category=photo&name=%ED%99%8D%EA%B8%B8%EB%8F%99', { screens: { events: 'events' } });
  assert.equal(state.routes[0].params.category, 'photo');
  assert.equal(state.routes[0].params.name, '홍길동');
  const repeated = getStateFromPath('/events?category=photo&tag=one&tag=two&q=hello+world&empty=&flag', { screens: { events: 'events' } });
  assert.deepEqual({ ...repeated.routes[0].params }, {
    category: 'photo', tag: ['one', 'two'], q: 'hello world', empty: '', flag: '',
  });
});

test('actual Expo path parsing terminates on a 60KB malformed query', () => {
  const child = `
    const {createRequire}=require('node:module'),{dirname,resolve}=require('node:path');
    const req=createRequire(resolve('apps/mobile/package.json'));
    const router=dirname(req.resolve('expo-router/package.json'));
    const {getStateFromPath}=req(resolve(router,'build/fork/getStateFromPath.js'));
    getStateFromPath('/events?q='+'%C0%AF'.repeat(10000),{screens:{events:'events'}});
  `;
  execFileSync(process.execPath, ['-e', child], { cwd: root, timeout: 5000, stdio: 'pipe' });
});

test('the obsolete query-string 7 compatibility patch cannot be bypassed by a new dependency', () => {
  const lock = readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8');
  const packages = lock.split('\npackages:\n')[1]?.split('\nsnapshots:\n')[0];
  assert.ok(packages, 'expected package and snapshot sections in the pnpm lockfile');
  assert.doesNotMatch(packages, /^ {2}['"]?query-string@7\./m,
    'query-string 7 requires the decoder override and compatibility patch to be restored');
});

test('security fixes are present in the actual Vitest and Expo dependency paths', () => {
  for (const manifest of ['package.json', 'apps/mobile/package.json']) {
    const project = createRequire(resolve(root, manifest));
    const vitest = assertMinimumVersion(project, 'vitest', '4.1.12');
    assertMinimumVersion(vitest.require, '@vitest/mocker', '4.1.12');
    assertMinimumVersion(vitest.require, 'vite', '8.1.6');
  }
  const expo = owner(mobileRequire, 'expo/package.json');
  for (const dependency of ['@expo/cli', '@expo/fingerprint']) {
    const parent = owner(expo, `${dependency}/package.json`);
    const glob = assertMinimumVersion(parent, 'glob', '14.0.2');
    assertMinimumVersion(glob.require, 'minimatch', '11.0.1');
  }
  const fingerprint = owner(expo, '@expo/fingerprint/package.json');
  assertMinimumVersion(fingerprint, 'minimatch', '11.0.1');
  const parser = owner(mobileRequire, '@typescript-eslint/parser/package.json');
  const estree = owner(parser, '@typescript-eslint/typescript-estree/package.json');
  assertMinimumVersion(estree, 'minimatch', '11.0.1');
});

test('Expo glob consumers discover routes and gitignore files and support early cancellation', async (t) => {
  const expo = owner(mobileRequire, 'expo/package.json');
  const cliRoot = dirname(expo.resolve('@expo/cli/package.json'));
  const cli = owner(expo, '@expo/cli/package.json');
  const fingerprint = owner(expo, '@expo/fingerprint/package.json');
  const { anyMatchAsync, everyMatchAsync } = mobileRequire(resolve(cliRoot, 'build/src/utils/glob.js'));
  const fixture = mkdtempSync(resolve(tmpdir(), 'senior-club-glob-test-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));

  for (const directory of ['src', '.hidden', 'ignored']) mkdirSync(resolve(fixture, directory));
  for (const file of ['src/users+api.ts', '.hidden/posts+api.tsx', 'src/screen.ts', '.gitignore', 'src/.gitignore', 'ignored/.gitignore']) {
    writeFileSync(resolve(fixture, file), '');
  }

  const options = { cwd: fixture, dot: true, ignore: ['ignored/**'] };
  const pattern = '**/*+api.@(ts|tsx|js|jsx)';
  const expectedRoutes = ['.hidden/posts+api.tsx', 'src/users+api.ts'];
  assert.deepEqual((await everyMatchAsync(pattern, options)).sort(), expectedRoutes);
  assert.deepEqual(cli('glob').sync(pattern, options).sort(), expectedRoutes);
  const firstRoute = await anyMatchAsync(pattern, options);
  assert.equal(firstRoute.length, 1);
  assert.ok(expectedRoutes.includes(firstRoute[0]));
  assert.deepEqual(await anyMatchAsync('**/*.missing', options), []);
  assert.deepEqual((await fingerprint('glob').glob('**/.gitignore', options)).sort(), ['.gitignore', 'src/.gitignore']);
});

test('TypeScript project service minimatch retains dotfile matching', () => {
  const parser = owner(mobileRequire, '@typescript-eslint/parser/package.json');
  const estree = owner(parser, '@typescript-eslint/typescript-estree/package.json');
  const { minimatch } = estree('minimatch');
  assert.equal(minimatch('.config/project.ts', '**/*.ts', { dot: true }), true);
  assert.equal(minimatch('.config/project.js', '**/*.ts', { dot: true }), false);
});

test('Expo fingerprint ignore patterns retain dotfile and negation behavior', () => {
  const expo = owner(mobileRequire, 'expo/package.json');
  const fingerprintRoot = dirname(expo.resolve('@expo/fingerprint/package.json'));
  const { isIgnoredPath } = mobileRequire(resolve(fingerprintRoot, 'build/utils/Path.js'));
  const patterns = ['**/.cache/**', '**/*.tmp', '!**/keep.tmp'];
  assert.equal(isIgnoredPath('src/.cache/item', patterns), true);
  assert.equal(isIgnoredPath('src/remove.tmp', patterns), true);
  assert.equal(isIgnoredPath('src/keep.tmp', patterns), false);
  assert.equal(isIgnoredPath('src/screen.ts', patterns), false);
});

test('ESLint import plugin retains its legacy minimatch makeRe API', () => {
  const expoLint = owner(mobileRequire, 'eslint-config-expo/package.json');
  const importPlugin = owner(expoLint, 'eslint-plugin-import/package.json');
  const minimatch = importPlugin('minimatch');
  assert.equal(typeof minimatch, 'function');
  assert.equal(typeof minimatch.makeRe, 'function');
  assert.equal(minimatch.makeRe('src/**').test('src/screen.ts'), true);
});

test('Xcode still generates valid project identifiers', () => {
  const expo = owner(mobileRequire, 'expo/package.json');
  const plugins = owner(expo, '@expo/config-plugins/package.json');
  const xcode = owner(plugins, 'xcode/package.json');
  const project = xcode('xcode').project('/tmp/unused-security-compat.pbxproj');
  project.hash = { project: { objects: {} } };
  assert.match(project.generateUuid(), /^[A-F0-9]{24}$/);
});

test('Xcode UUID dependency stays on the reviewed version', () => {
  const expo = owner(mobileRequire, 'expo/package.json');
  const plugins = owner(expo, '@expo/config-plugins/package.json');
  const xcode = packageManifest(plugins, 'xcode');
  if (xcode.manifest.dependencies?.uuid || xcode.manifest.optionalDependencies?.uuid) {
    assert.equal(xcode.require('uuid/package.json').version, '11.1.1');
    assert.match(xcode.require('uuid').v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  }
});
