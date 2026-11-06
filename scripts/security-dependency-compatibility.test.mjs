import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
