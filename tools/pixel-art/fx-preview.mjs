#!/usr/bin/env node
/**
 * fx-preview.mjs — pixelfx로 구운 5종 이펙트를 프레임별로 늘어놓은 검증 시트.
 * 어두운 배경(#182620)과 잔디 위 두 가지로 그려 가독성을 함께 봅니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
const FX = path.join(ROOT, 'apps/mobile/assets/game/rpg/fx');
const OUT = path.join(ROOT, 'design/previews');
const CACHE = path.join(HERE, '.fx-build/manifest.json');
const GRASS = path.join(ROOT, 'apps/mobile/assets/game/rpg/pixel/tiles/grass.png');

const SAMPLES = 4;

const read = (f) => PNG.sync.read(fs.readFileSync(f));

function blit(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const i = (y * src.width + x) * 4;
      const a = src.data[i + 3] / 255;
      if (a <= 0) continue;
      const o = (ty * dst.width + tx) * 4;
      dst.data[o] = Math.round(src.data[i] * a + dst.data[o] * (1 - a));
      dst.data[o + 1] = Math.round(src.data[i + 1] * a + dst.data[o + 1] * (1 - a));
      dst.data[o + 2] = Math.round(src.data[i + 2] * a + dst.data[o + 2] * (1 - a));
      dst.data[o + 3] = 255;
    }
  }
}

function extract(sheet, meta, index) {
  const col = index % meta.columns;
  const row = Math.floor(index / meta.columns);
  const out = new PNG({ width: meta.frameWidth, height: meta.frameHeight });
  for (let y = 0; y < meta.frameHeight; y++) {
    for (let x = 0; x < meta.frameWidth; x++) {
      const i = ((row * meta.frameHeight + y) * sheet.width + col * meta.frameWidth + x) * 4;
      const o = (y * meta.frameWidth + x) * 4;
      out.data[o] = sheet.data[i];
      out.data[o + 1] = sheet.data[i + 1];
      out.data[o + 2] = sheet.data[i + 2];
      out.data[o + 3] = sheet.data[i + 3];
    }
  }
  return out;
}

function main() {
  const metas = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const cellW = Math.max(...metas.map((m) => m.frameWidth)) * SAMPLES + 40;
  const cellH = Math.max(...metas.map((m) => m.frameHeight)) + 20;
  const W = cellW * 2;
  const H = cellH * metas.length;

  const canvas = new PNG({ width: W, height: H });
  for (let i = 0; i < canvas.data.length; i += 4) {
    canvas.data[i] = 0x18;
    canvas.data[i + 1] = 0x26;
    canvas.data[i + 2] = 0x20;
    canvas.data[i + 3] = 255;
  }

  const grass = read(GRASS);
  metas.forEach((meta, row) => {
    const sheet = read(path.join(FX, `${meta.name}.png`));
    const indices = Array.from({ length: SAMPLES }, (_, k) =>
      Math.min(meta.frames - 1, Math.round(((k + 0.5) / SAMPLES) * (meta.frames - 1))),
    );
    // 오른쪽 절반은 잔디를 먼저 깔아 야외 가독성을 함께 봅니다.
    for (let gy = 0; gy < cellH; gy += grass.height) {
      for (let gx = 0; gx < cellW; gx += grass.width) {
        blit(canvas, grass, cellW + gx, row * cellH + gy);
      }
    }
    indices.forEach((index, col) => {
      const frame = extract(sheet, meta, index);
      for (const side of [0, 1]) {
        const baseX = side * cellW + 20;
        const baseY = row * cellH + 10;
        blit(canvas, frame, baseX + col * meta.frameWidth, baseY);
      }
    });
  });

  const scale = 2;
  const big = new PNG({ width: W * scale, height: H * scale });
  for (let y = 0; y < big.height; y++) {
    for (let x = 0; x < big.width; x++) {
      const i = (Math.floor(y / scale) * W + Math.floor(x / scale)) * 4;
      const o = (y * big.width + x) * 4;
      big.data[o] = canvas.data[i];
      big.data[o + 1] = canvas.data[i + 1];
      big.data[o + 2] = canvas.data[i + 2];
      big.data[o + 3] = 255;
    }
  }

  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'pixel-fx-sheet.png');
  fs.writeFileSync(file, PNG.sync.write(big, { colorType: 6 }));
  return file;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  console.log(`fx preview -> ${path.relative(ROOT, main())}`);
}
