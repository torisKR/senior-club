#!/usr/bin/env node
/**
 * tiles.mjs — 텍스처 위주 타일(잔디·물)을 아트 바이블 팔레트로 절차 생성합니다.
 *
 * 다운샘플 방식은 잔디처럼 균일한 노이즈가 많은 원본에서 "노이즈"로 뭉개집니다.
 * 이 두 타일만은 48x48 그리드에서 직접 그려 이음새 없는 반복 타일로 만듭니다.
 * 모든 좌표는 모듈러 연산으로 감싸므로 상하좌우가 이어집니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.resolve(HERE, '../../apps/mobile/assets/game/rpg/pixel/tiles');
const SCALE = 3;
const N = 48;

/** 아트 바이블 팔레트 */
const C = {
  grassDark: '#30593D',
  grass: '#356347',
  grassLight: '#3C6C4B',
  blade: '#4F8259',
  bladeTip: '#639A66',
  ivory: '#FCF9F2',
  gold: '#F0BF4F',
  waterDeep: '#1A5F80',
  water: '#1E6F94',
  waterLight: '#2F87A8',
  waterFoam: '#A8D6E0',
  celadon: '#7FB3A8',
  pineDark: '#1B3A28',
  pine: '#234A32',
  pineLight: '#356347',
  trunk: '#6E4228',
  trunkDark: '#4A2C1A',
};

function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

class Tile {
  constructor(size, fill) {
    this.n = size;
    this.png = new PNG({ width: size, height: size });
    const [r, g, b] = hex(fill);
    for (let i = 0; i < this.png.data.length; i += 4) {
      this.png.data[i] = r;
      this.png.data[i + 1] = g;
      this.png.data[i + 2] = b;
      this.png.data[i + 3] = 255;
    }
  }
  set(x, y, color, alpha = 255) {
    const xx = ((x % this.n) + this.n) % this.n;
    const yy = ((y % this.n) + this.n) % this.n;
    const [r, g, b] = hex(color);
    const i = (yy * this.n + xx) * 4;
    this.png.data[i] = r;
    this.png.data[i + 1] = g;
    this.png.data[i + 2] = b;
    this.png.data[i + 3] = alpha;
  }
}

/** 결정론적 난수 (시드 고정) */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 이음새 없는 덩어리: 원형 얼룩을 모듈러로 그립니다. */
function blob(t, cx, cy, radius, color) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) t.set(cx + dx, cy + dy, color);
    }
  }
}

function grassTile() {
  const t = new Tile(N, C.grass);
  const r = rng(20261105);

  // 1) 큰 얼룩 없이 잔점만 — 타일 반복이 눈에 띄지 않게 합니다.
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(r() * N);
    const y = Math.floor(r() * N);
    t.set(x, y, r() > 0.5 ? C.grassDark : C.grassLight);
  }

  // 2) 풀잎 다발 — 2~3px 세로 획, 끝에 밝은 팁
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(r() * N);
    const y = Math.floor(r() * N);
    const h = 2 + Math.floor(r() * 2);
    for (let k = 0; k < h; k++) {
      t.set(x + (k === 1 && r() > 0.6 ? 1 : 0), y + k, k === h - 1 ? C.bladeTip : C.blade);
    }
  }

  // 3) 들꽃 한 송이만 — 타일마다 반복되는 흰 점을 줄입니다.
  const fx = Math.floor(r() * N);
  const fy = Math.floor(r() * N);
  t.set(fx, fy, C.ivory);
  t.set(fx + 1, fy, C.ivory);
  t.set(fx, fy + 1, C.gold);
  return t;
}

function waterTile() {
  const t = new Tile(N, C.water);
  const r = rng(771003);

  // 깊은 물 — 큰 얼룩 대신 가로로 긴 띠
  for (let i = 0; i < 7; i++) {
    const y = Math.floor(r() * N);
    const x = Math.floor(r() * N);
    const w = 8 + Math.floor(r() * 14);
    for (let k = 0; k < w; k++) t.set(x + k, y, C.waterDeep);
    if (r() > 0.5) for (let k = 2; k < w - 2; k++) t.set(x + k, y + 1, C.waterDeep);
  }
  // 물결 — 가로로 흐르는 짧은 획, 이음새를 넘어가도 이어짐
  for (let i = 0; i < 30; i++) {
    const y = Math.floor(r() * N);
    const x = Math.floor(r() * N);
    const w = 3 + Math.floor(r() * 5);
    const color = r() > 0.75 ? C.waterFoam : C.waterLight;
    for (let k = 0; k < w; k++) t.set(x + k, y, color);
  }
  // 청자빛 반사
  for (let i = 0; i < 8; i++) {
    const y = Math.floor(r() * N);
    const x = Math.floor(r() * N);
    for (let k = 0; k < 2; k++) t.set(x + k, y, C.celadon);
  }
  return t;
}

/** 소나무 — 다운샘플로는 잎이 뭉개져서 직접 그립니다. */
function pineTile() {
  const t = new Tile(N, C.grass);
  const r = rng(48211);
  // 줄기
  for (let y = 26; y < 47; y++) {
    const w = y > 40 ? 5 : 3;
    for (let x = 21; x < 21 + w; x++) t.set(x, y, x === 21 ? C.trunkDark : C.trunk);
  }
  // 3단 잎: 위로 갈수록 좁아지고, 가장자리는 1px씩 들쭉날쭉하게
  const tiers = [
    { top: 5, bottom: 19, half: 14 },
    { top: 13, bottom: 30, half: 18 },
    { top: 22, bottom: 39, half: 21 },
  ];
  for (const tier of tiers) {
    for (let y = tier.top; y <= tier.bottom; y++) {
      const k = (y - tier.top) / (tier.bottom - tier.top);
      const jag = r() > 0.72 ? (r() > 0.5 ? 1 : -1) : 0;
      const hw = Math.max(2, Math.round(2 + (tier.half - 2) * k) + jag);
      for (let x = 24 - hw; x <= 24 + hw; x++) {
        const edge = x <= 24 - hw + 1 || x >= 24 + hw - 1;
        const light = y < tier.top + 3 && x < 24;
        t.set(x, y, edge ? C.pineDark : light ? C.pineLight : C.pine);
      }
    }
    // 잎 아래 그늘 한 줄
    for (let x = 24 - Math.round(tier.half * 0.7); x <= 24 + Math.round(tier.half * 0.7); x++) {
      t.set(x, tier.bottom + 1, C.pineDark);
    }
  }
  return t;
}

function upscale(png, scale) {
  const out = new PNG({ width: png.width * scale, height: png.height * scale });
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const i = (Math.floor(y / scale) * png.width + Math.floor(x / scale)) * 4;
      const o = (y * out.width + x) * 4;
      out.data[o] = png.data[i];
      out.data[o + 1] = png.data[i + 1];
      out.data[o + 2] = png.data[i + 2];
      out.data[o + 3] = png.data[i + 3];
    }
  }
  return out;
}

export function buildTiles() {
  fs.mkdirSync(OUT, { recursive: true });
  const made = [];
  for (const [name, make] of [
    ['grass', grassTile],
    ['water', waterTile],
    ['pine', pineTile],
  ]) {
    const png = upscale(make().png, SCALE);
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, PNG.sync.write(png, { colorType: 6 }));
    made.push(file);
  }
  return made;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  for (const f of buildTiles()) console.log(`tile -> ${path.relative(process.cwd(), f)}`);
}
