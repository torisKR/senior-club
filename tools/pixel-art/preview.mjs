#!/usr/bin/env node
/**
 * preview.mjs — 새 픽셀 아트 에셋을 한 장면에 합성해 눈으로 검증합니다.
 *
 *   node preview.mjs
 *   -> design/previews/pixel-village-preview.png
 *
 * 타일 이음새, 캐릭터 접지, 건물 크기, pixelfx 이펙트 색감을
 * 실제 런타임과 같은 1아트픽셀=1dp 밀도로 확인하는 용도입니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
const A = path.join(ROOT, 'apps/mobile/assets/game/rpg/pixel');
const FX = path.join(ROOT, 'apps/mobile/assets/game/rpg/fx');
const OUT = path.join(ROOT, 'design/previews');

const TILE = 48;
const COLS = 12;
const ROWS = 9;
const W = TILE * COLS;
const H = TILE * ROWS;

const read = (file) => PNG.sync.read(fs.readFileSync(file));

/** 3x로 구운 에셋을 1dp 밀도로 되돌립니다. */
function to1x(src, factor = 3) {
  const w = Math.round(src.width / factor);
  const h = Math.round(src.height / factor);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y * factor) * src.width + x * factor) * 4;
      const o = (y * w + x) * 4;
      out.data[o] = src.data[i];
      out.data[o + 1] = src.data[i + 1];
      out.data[o + 2] = src.data[i + 2];
      out.data[o + 3] = src.data[i + 3];
    }
  }
  return out;
}

/** 알파 합성으로 dst 위에 src를 얹습니다. */
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

/** 타일을 화면 전체에 반복해 깝니다. */
function fillTiles(dst, tile, cols, rows, offsetX = 0, offsetY = 0) {
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      blit(dst, tile, rx * tile.width + offsetX, ry * tile.height + offsetY);
    }
  }
}

function main() {
  const canvas = new PNG({ width: W, height: H });

  const grass = to1x(read(path.join(A, 'tiles/grass.png')));
  const pathTile = to1x(read(path.join(A, 'tiles/path.png')));
  const water = to1x(read(path.join(A, 'tiles/water.png')));

  fillTiles(canvas, grass, COLS, ROWS);

  // 길: 가로 1줄 + 세로 1줄
  for (let c = 0; c < COLS; c++) blit(canvas, pathTile, c * TILE, 4 * TILE);
  for (let r = 0; r < ROWS; r++) blit(canvas, pathTile, 5 * TILE, r * TILE);

  // 연못
  for (let ry = 0; ry < 2; ry++) {
    for (let rx = 0; rx < 2; rx++) blit(canvas, water, (1 + rx) * TILE, (1 + ry) * TILE);
  }

  // 나무·꽃·등롱
  const deco = [
    ['pine', 0, 6],
    ['cherry', 10, 1],
    ['pine', 9, 6],
    ['flower', 2, 7],
    ['flower', 8, 2],
    ['lantern', 4, 5],
  ];
  for (const [name, cx, cy] of deco) {
    const img = to1x(read(path.join(A, 'tiles', `${name}.png`)));
    blit(canvas, img, cx * TILE, cy * TILE);
  }

  // 건물 (3x2 타일 풋프린트)
  const buildings = [
    ['club_hall', 6, 1],
    ['herbal', 9, 3],
    ['parkgolf', 0, 2],
  ];
  for (const [name, cx, cy] of buildings) {
    const img = to1x(read(path.join(A, 'buildings', `${name}.png`)));
    blit(canvas, img, cx * TILE, cy * TILE);
  }

  // 주인공 (48x88 캔버스, 발밑 정렬) + NPC
  const player = to1x(read(path.join(A, 'player/player_down_walk_0.png')));
  blit(canvas, player, 5 * TILE + 24, 4 * TILE - 88 + 48);

  for (const [name, cx, cy] of [
    ['npc_chief', 7, 3],
    ['npc_choi', 4, 3],
  ]) {
    const img = to1x(read(path.join(A, 'npc', `${name}.png`)));
    blit(canvas, img, cx * TILE, cy * TILE + 48 - img.height);
  }

  // 효과: 홀인(금빛 버스트)을 잔디 위에, 승급 폭죽을 상단에
  const holein = read(path.join(FX, 'holein.png'));
  const hf = { x: 0, y: 0, w: 112, h: 96 };
  const hfFrame = 4;
  const hfSheetCols = 6;
  const hfCell = new PNG({ width: hf.w, height: hf.h });
  const hx = (hfFrame % hfSheetCols) * hf.w;
  const hy = Math.floor(hfFrame / hfSheetCols) * hf.h;
  for (let y = 0; y < hf.h; y++) {
    for (let x = 0; x < hf.w; x++) {
      const i = ((hy + y) * holein.width + hx + x) * 4;
      const o = (y * hf.w + x) * 4;
      hfCell.data[o] = holein.data[i];
      hfCell.data[o + 1] = holein.data[i + 1];
      hfCell.data[o + 2] = holein.data[i + 2];
      hfCell.data[o + 3] = holein.data[i + 3];
    }
  }
  blit(canvas, hfCell, 2 * TILE, 5 * TILE - 30);

  const promo = read(path.join(FX, 'promotion.png'));
  const pCell = new PNG({ width: 200, height: 140 });
  const px = (20 % 6) * 200;
  const py = Math.floor(20 / 6) * 140;
  for (let y = 0; y < 140; y++) {
    for (let x = 0; x < 200; x++) {
      const i = ((py + y) * promo.width + px + x) * 4;
      const o = (y * 200 + x) * 4;
      pCell.data[o] = promo.data[i];
      pCell.data[o + 1] = promo.data[i + 1];
      pCell.data[o + 2] = promo.data[i + 2];
      pCell.data[o + 3] = promo.data[i + 3];
    }
  }
  blit(canvas, pCell, W - 220, 8);

  // 보기 좋게 2배 최근접 확대
  const scale = 2;
  const big = new PNG({ width: W * scale, height: H * scale });
  for (let y = 0; y < big.height; y++) {
    for (let x = 0; x < big.width; x++) {
      const i = (Math.floor(y / scale) * W + Math.floor(x / scale)) * 4;
      const o = (y * big.width + x) * 4;
      big.data[o] = canvas.data[i];
      big.data[o + 1] = canvas.data[i + 1];
      big.data[o + 2] = canvas.data[i + 2];
      big.data[o + 3] = canvas.data[i + 3];
    }
  }

  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'pixel-village-preview.png');
  fs.writeFileSync(file, PNG.sync.write(big, { colorType: 6 }));
  return file;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  console.log(`preview -> ${path.relative(ROOT, main())}`);
}
