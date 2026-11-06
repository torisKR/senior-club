#!/usr/bin/env node
/**
 * build-player-tiers.mjs — 주인공 24프레임을 한 장의 아틀라스로 묶고,
 * sprite-gen(aldegad/sprite-gen)의 `recolor`로 급수별 복장 변형을 굽습니다.
 *
 *   18급 입문  = 기본(베이지 셔츠 · 청록 바지)
 *   9급 유단자 = 청자빛 셔츠 · 솔잎색 바지
 *   클럽 명인  = 상아빛 셔츠 · 먹색 바지
 *
 * 결과는 프레임별 PNG로 다시 풀어 `apps/mobile/assets/game/rpg/pixel/player_tier{n}/`
 * 에 두고, 런타임은 급수에 따라 다른 세트를 씁니다.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
const SRC = path.join(ROOT, 'apps/mobile/assets/game/rpg/pixel/player');
const OUT = path.join(ROOT, 'apps/mobile/assets/game/rpg/pixel');
const WORK = path.join(HERE, '.player-tiers');

const SPRITE_GEN =
  process.env.SPRITE_GEN ??
  path.join(os.homedir(), 'tools/sprite-gen/.venv/bin/sprite-gen');

const DIRECTIONS = ['down', 'side', 'up'];
const STATES = ['idle', 'walk'];
const FRAMES = [0, 1, 2, 3];
const COLUMNS = 4;

/** 프레임 순서: 6행 x 4열 */
function frameKeys() {
  const keys = [];
  for (const direction of DIRECTIONS) {
    for (const state of STATES) {
      for (const frame of FRAMES) keys.push(`${direction}_${state}_${frame}`);
    }
  }
  return keys;
}

function composeAtlas() {
  const keys = frameKeys();
  const first = PNG.sync.read(fs.readFileSync(path.join(SRC, `player_${keys[0]}.png`)));
  const cellW = first.width;
  const cellH = first.height;
  const rows = Math.ceil(keys.length / COLUMNS);
  const atlas = new PNG({ width: cellW * COLUMNS, height: cellH * rows });
  keys.forEach((key, index) => {
    const png = PNG.sync.read(fs.readFileSync(path.join(SRC, `player_${key}.png`)));
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        const i = (y * png.width + x) * 4;
        const o = ((row * cellH + y) * atlas.width + (col * cellW + x)) * 4;
        atlas.data[o] = png.data[i];
        atlas.data[o + 1] = png.data[i + 1];
        atlas.data[o + 2] = png.data[i + 2];
        atlas.data[o + 3] = png.data[i + 3];
      }
    }
  });
  fs.mkdirSync(WORK, { recursive: true });
  const file = path.join(WORK, 'player-atlas.png');
  fs.writeFileSync(file, PNG.sync.write(atlas, { colorType: 6 }));
  return { file, keys, cellW, cellH, rows };
}

/** 픽셀 아트 팔레트 스왑 스펙. 정확히 일치하는 색만 바꿉니다. */
const SPEC = {
  version: 1,
  kind: 'sprite-gen-recolor',
  match: 'exact',
  variants: [
    {
      name: 'tier2',
      map: {
        // 셔츠: 베이지 → 청자
        '#f5d5a0': '#CFE6DD',
        '#cd854f': '#8FBDB0',
        // 바지: 청록 → 솔잎색
        '#235752': '#0E5142',
        '#356761': '#1A6B58',
        '#435147': '#0E5142',
      },
    },
    {
      name: 'tier3',
      map: {
        // 셔츠: 베이지 → 상아
        '#f5d5a0': '#FCF9F2',
        '#cd854f': '#D8B384',
        // 바지: 청록 → 먹색
        '#235752': '#2C3138',
        '#356761': '#3D444C',
        '#435147': '#2C3138',
      },
    },
  ],
};

function bake() {
  const atlas = composeAtlas();
  const specFile = path.join(WORK, 'recolor.spec.json');
  fs.writeFileSync(specFile, JSON.stringify(SPEC, null, 2));
  execFileSync(SPRITE_GEN, [
    'recolor',
    '--base',
    atlas.file,
    '--spec',
    specFile,
    '--out-dir',
    WORK,
  ], { stdio: 'pipe' });
  return atlas;
}

/** 변형 아틀라스를 다시 프레임별 PNG로 풉니다. */
function slice(variant, atlas) {
  const sheet = PNG.sync.read(fs.readFileSync(path.join(WORK, `${variant}.png`)));
  const dir = path.join(OUT, `player_${variant}`);
  fs.mkdirSync(dir, { recursive: true });
  atlas.keys.forEach((key, index) => {
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const out = new PNG({ width: atlas.cellW, height: atlas.cellH });
    for (let y = 0; y < atlas.cellH; y++) {
      for (let x = 0; x < atlas.cellW; x++) {
        const i = ((row * atlas.cellH + y) * sheet.width + (col * atlas.cellW + x)) * 4;
        const o = (y * atlas.cellW + x) * 4;
        out.data[o] = sheet.data[i];
        out.data[o + 1] = sheet.data[i + 1];
        out.data[o + 2] = sheet.data[i + 2];
        out.data[o + 3] = sheet.data[i + 3];
      }
    }
    fs.writeFileSync(path.join(dir, `player_${key}.png`), PNG.sync.write(out, { colorType: 6 }));
  });
  return dir;
}

export function buildPlayerTiers() {
  if (!fs.existsSync(SPRITE_GEN)) {
    throw new Error(`sprite-gen을 찾을 수 없습니다: ${SPRITE_GEN} (SPRITE_GEN 환경변수로 지정)`);
  }
  const atlas = bake();
  const report = JSON.parse(fs.readFileSync(path.join(WORK, 'recolor.report.json'), 'utf8'));
  const made = [];
  for (const variant of SPEC.variants) {
    made.push({ variant: variant.name, dir: slice(variant.name, atlas) });
  }
  return { made, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const { made, report } = buildPlayerTiers();
  for (const item of made) {
    const stats = report.variants?.find((v) => v.name === item.variant);
    console.log(
      `${item.variant}: ${path.relative(ROOT, item.dir)} · 치환 픽셀 ${stats?.substituted_pixels ?? '?'} · 미사용 소스 ${stats?.unused_sources?.length ?? 0}`,
    );
  }
}
