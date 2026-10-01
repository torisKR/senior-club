import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootRequire = createRequire(resolve(root, 'package.json'));
const mobileRequire = createRequire(resolve(root, 'apps/mobile/package.json'));
const apiRequire = createRequire(resolve(root, 'apps/api/package.json'));
const owner = (parent, dependency) => createRequire(parent.resolve(dependency));

test('the patched decoder remains compatible with actual Expo route/query parsing', () => {
  const routerRoot = dirname(mobileRequire.resolve('expo-router/package.json'));
  const { getStateFromPath } = mobileRequire(resolve(routerRoot, 'build/react-navigation/core/getStateFromPath.js'));
  const state = getStateFromPath('/events?category=photo&name=%ED%99%8D%EA%B8%B8%EB%8F%99', { screens: { events: 'events' } });
  assert.equal(state.routes[0].params.category, 'photo');
  assert.equal(state.routes[0].params.name, '홍길동');
  const routerRequire = createRequire(resolve(routerRoot, 'package.json'));
  const queryString = routerRequire('query-string');
  assert.deepEqual({ ...queryString.parse('category=photo&tag=one&tag=two&q=hello+world&empty=&flag') }, {
    category: 'photo', tag: ['one', 'two'], q: 'hello world', empty: '', flag: null,
  });
});

test('actual Expo path parsing terminates on a 60KB malformed query', () => {
  const child = `
    const {createRequire}=require('node:module'),{dirname,resolve}=require('node:path');
    const req=createRequire(resolve('apps/mobile/package.json'));
    const router=dirname(req.resolve('expo-router/package.json'));
    const {getStateFromPath}=req(resolve(router,'build/react-navigation/core/getStateFromPath.js'));
    getStateFromPath('/events?q='+'%C0%AF'.repeat(10000),{screens:{events:'events'}});
  `;
  execFileSync(process.execPath, ['-e', child], { cwd: root, timeout: 5000, stdio: 'pipe' });
});

test('inspected Xcode and Google HTTP parents retain their UUID v4 APIs', () => {
  const expo = owner(mobileRequire, 'expo/package.json');
  const plugins = owner(expo, '@expo/config-plugins/package.json');
  const xcode = owner(plugins, 'xcode/package.json');
  const admin = owner(apiRequire, 'firebase-admin');
  const cloudStorage = owner(admin, '@google-cloud/storage');
  const consumers = [xcode, owner(cloudStorage, 'gaxios'), owner(cloudStorage, 'teeny-request')];
  for (const consumer of consumers) {
    assert.equal(consumer('uuid/package.json').version, '11.1.1');
    assert.match(consumer('uuid').v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  }
  const project = xcode('xcode').project('/tmp/unused-security-compat.pbxproj');
  project.hash = { project: { objects: {} } };
  assert.match(project.generateUuid(), /^[A-F0-9]{24}$/);
});

test('Prisma config retains the nested merge API used by this project', () => {
  const prisma = owner(rootRequire, 'prisma/package.json');
  const config = owner(prisma, '@prisma/config');
  const { deepmerge } = config('deepmerge-ts');
  assert.deepEqual(deepmerge({ datasource: { url: 'before', keep: true } }, { datasource: { url: 'after' } }), {
    datasource: { url: 'after', keep: true },
  });
});
