import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const expoRequire = createRequire(realpathSync(path.join(root, 'node_modules/expo/bin/cli')));
const { getPrebuildConfigAsync } = expoRequire('@expo/prebuild-config');
const { compileModsAsync } = expoRequire('@expo/config-plugins');

// Expo's config CLI compiles both platforms. Android validation must not require
// an unrelated iOS Firebase plist or execute iOS mods.
process.env.NODE_ENV = 'development';
expoRequire('@expo/env').load(root, { silent: true });
console.log = () => {};
console.warn = () => {};
const config = await getPrebuildConfigAsync(root, { platforms: ['android'] });
await compileModsAsync(config.exp, {
  projectRoot: root,
  introspect: true,
  platforms: ['android'],
  assertMissingModProviders: false,
});
delete config.modRequest;
delete config.modResults;
process.stdout.write(JSON.stringify(config.exp));
