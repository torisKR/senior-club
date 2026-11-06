import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootRequire = createRequire(resolve(root, 'package.json'));
const mobileRequire = createRequire(resolve(root, 'apps/mobile/package.json'));
const apiRequire = createRequire(resolve(root, 'apps/api/package.json'));
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

test('Kakao query-string decodes OAuth-style parameters correctly', async () => {
  const kakao = owner(mobileRequire, '@react-native-kakao/core/package.json');
  const { default: queryString } = await import(pathToFileURL(kakao.resolve('query-string')).href);
  assert.deepEqual({ ...queryString.parse('code=a%2Bb&state=%ED%99%8D%EA%B8%B8%EB%8F%99') }, {
    code: 'a+b',
    state: '홍길동',
  });
});

test('Xcode still generates valid project identifiers', () => {
  const expo = owner(mobileRequire, 'expo/package.json');
  const plugins = owner(expo, '@expo/config-plugins/package.json');
  const xcode = owner(plugins, 'xcode/package.json');
  const project = xcode('xcode').project('/tmp/unused-security-compat.pbxproj');
  project.hash = { project: { objects: {} } };
  assert.match(project.generateUuid(), /^[A-F0-9]{24}$/);
});

test('UUID dependencies of inspected consumers stay on the reviewed version', () => {
  const expo = owner(mobileRequire, 'expo/package.json');
  const plugins = owner(expo, '@expo/config-plugins/package.json');
  const admin = owner(apiRequire, 'firebase-admin');
  const cloudStorage = owner(admin, '@google-cloud/storage');
  for (const [parent, name] of [[plugins, 'xcode'], [cloudStorage, 'gaxios'], [cloudStorage, 'teeny-request']]) {
    const consumer = packageManifest(parent, name);
    if (consumer.manifest.dependencies?.uuid || consumer.manifest.optionalDependencies?.uuid) {
      assert.equal(consumer.require('uuid/package.json').version, '11.1.1');
      assert.match(consumer.require('uuid').v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
  }
});

test('Google HTTP clients generate UUID v4 multipart boundaries', async (t) => {
  const admin = owner(apiRequire, 'firebase-admin');
  const cloudStorage = owner(admin, '@google-cloud/storage');
  const { request } = cloudStorage('gaxios');
  const { teenyRequest } = cloudStorage('teeny-request');
  const received = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      received.push({ contentType: req.headers['content-type'], body: Buffer.concat(chunks).toString() });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())));
  const url = `http://127.0.0.1:${server.address().port}/`;

  const response = await request({
    url,
    method: 'POST',
    multipart: [
      { headers: new Headers({ 'Content-Type': 'application/json' }), content: '{"kind":"gaxios"}' },
      { headers: new Headers({ 'Content-Type': 'text/plain' }), content: 'payload' },
    ],
  });
  assert.equal(response.status, 200);
  await new Promise((resolve, reject) => {
    teenyRequest({
      url,
      method: 'POST',
      headers: {},
      multipart: [
        { 'Content-Type': 'application/json', body: '{"kind":"teeny"}' },
        { 'Content-Type': 'text/plain', body: Readable.from(['payload']) },
      ],
    }, (err, res) => err ? reject(err) : resolve(res));
  });

  assert.equal(received.length, 2);
  for (const [index, { contentType, body }] of received.entries()) {
    const match = /^multipart\/related; boundary=([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(contentType);
    assert.ok(match, `invalid multipart boundary: ${contentType}`);
    assert.ok(body.includes(`--${match[1]}--`));
    assert.ok(body.includes(index === 0 ? '"kind":"gaxios"' : '"kind":"teeny"'));
    assert.ok(body.includes('payload'));
  }
});

test('Prisma config retains the nested merge API used by this project', () => {
  const prisma = owner(rootRequire, 'prisma/package.json');
  const config = owner(prisma, '@prisma/config');
  const { deepmerge } = config('deepmerge-ts');
  assert.deepEqual(deepmerge({ datasource: { url: 'before', keep: true } }, { datasource: { url: 'after' } }), {
    datasource: { url: 'after', keep: true },
  });
});

test('Next resolves a sharp version containing the image optimizer security fix', () => {
  const next = owner(rootRequire, 'next/package.json');
  const version = next('sharp').versions.sharp;
  const [major, minor, patch] = version.split('.').map(Number);
  assert.ok(major > 0 || minor > 35 || (minor === 35 && patch >= 5), `Next resolves sharp ${version}; expected at least 0.35.5`);
});
