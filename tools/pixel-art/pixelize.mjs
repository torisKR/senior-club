#!/usr/bin/env node
/**
 * pixelize — 부드러운 일러스트 원본을 실제 픽셀 아트 그리드로 재가공합니다.
 *
 * 처리 순서
 *   1. 프리멀티플라이드 알파로 박스 다운샘플 (가장자리 검은 테두리 방지)
 *   2. 스프라이트는 알파 임계값으로 계단형 실루엣 확정 (안티에일리어싱 제거)
 *   3. 그룹 단위 median-cut 팔레트 양자화 (프레임 간 색 튐 방지)
 *   4. 정수배 최근접 이웃 업스케일 (기기에서 다시 부드러워지지 않도록)
 *
 * 사용: node pixelize.mjs [--only player,portrait] [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
export const ROOT = path.resolve(HERE, '../..');
const ASSET_ROOT = path.join(ROOT, 'apps/mobile/assets/game');
const OUT_ROOT = path.join(ASSET_ROOT, 'rpg/pixel');

/** 1 아트픽셀 = 1dp. 업스케일 3배 → 3x 기기에서 1:1. */
export const ART_SCALE = 3;

/**
 * 그룹: 같은 팔레트를 공유하는 에셋 묶음.
 * grid = [가로, 세로] 아트픽셀 수.
 */
export const GROUPS = {
  tiles: {
    grid: [48, 48],
    colors: 14,
    alpha: false,
    files: {
      grass: 'rpg/tiles/grass_01.png',
      path: 'rpg/tiles/path_01.png',
      water: 'rpg/tiles/water_01.png',
      fence: 'rpg/tiles/fence_01.png',
      pine: 'rpg/tiles/pine_01.png',
      cherry: 'rpg/tiles/cherry_01.png',
      lantern: 'rpg/tiles/lantern_01.png',
      flower: 'rpg/tiles/flower_01.png',
    },
  },
  buildings: {
    grid: [144, 96],
    colors: 20,
    alpha: true,
    files: {
      club_hall: 'rpg/buildings/club_hall.png',
      parkgolf: 'rpg/buildings/parkgolf.png',
      alkkagi: 'rpg/buildings/alkkagi.png',
      sacheonseong: 'rpg/buildings/sacheonseong.png',
      herbal: 'rpg/buildings/herbal.png',
    },
  },
  player: {
    grid: [48, 88],
    colors: 18,
    alpha: true,
    fit: true,
    files: Object.fromEntries(
      ['down', 'side', 'up'].flatMap((dir) =>
        ['idle', 'walk'].flatMap((state) =>
          [0, 1, 2, 3].map((i) => [
            `player_${dir}_${state}_${i}`,
            `rpg/sprites/player_${dir}_${state}_${i}.png`,
          ]),
        ),
      ),
    ),
  },
  npc: {
    grid: [44, 80],
    colors: 18,
    alpha: true,
    fit: true,
    files: {
      npc_chief: 'rpg/sprites/npc_chief.png',
      npc_captain: 'rpg/sprites/npc_captain.png',
      npc_choi: 'rpg/sprites/npc_choi.png',
      npc_tea: 'rpg/sprites/npc_tea.png',
      npc_herbalist: 'rpg/sprites/npc_herbalist.png',
    },
  },
  portraits: {
    grid: [88, 88],
    colors: 20,
    alpha: true,
    fit: true,
    files: {
      chief: 'rpg/portraits/chief.png',
      captain: 'rpg/portraits/captain.png',
      choi: 'rpg/portraits/choi.png',
      tea: 'rpg/portraits/tea.png',
      herbalist: 'rpg/portraits/herbalist.png',
    },
  },
  props: {
    grid: [48, 48],
    colors: 16,
    alpha: true,
    fit: true,
    files: {
      'spr_parkgolf_gate_01': 'rpg/sprites/spr_parkgolf_gate_01.png',
      'spr_parkgolf_log_bumper_01': 'rpg/sprites/spr_parkgolf_log_bumper_01.png',
      'spr_alkkagi_celadon_cup_01': 'rpg/sprites/spr_alkkagi_celadon_cup_01.png',
      'spr_alkkagi_paperweight_01': 'rpg/sprites/spr_alkkagi_paperweight_01.png',
    },
  },
  /** 아케이드 보드·기물 — 화면 크기에 맞춰 파일별 그리드를 따로 지정합니다. */
  arcade: {
    grid: [128, 128],
    colors: 24,
    alpha: true,
    files: {
      board_parkgolf: { path: 'env_parkgolf_green_board_01.png', grid: [220, 330] },
      board_alkkagi: { path: 'env_alkkagi_wood_board_01.png', grid: [220, 220] },
      board_sacheonseong: { path: 'rpg/env/env_sacheonseong_mat_board_01.png', grid: [220, 147] },
      stone_black: { path: 'stones/stone_black.png', grid: [40, 40] },
      stone_white: { path: 'stones/stone_white.png', grid: [40, 40] },
      equip_putter: { path: 'equip/pg_putter_head.png', grid: [44, 40] },
      equip_ball: { path: 'equip/pg_ball_white.png', grid: [24, 24] },
      equip_flag: { path: 'equip/pg_hole_flag.png', grid: [44, 40] },
      equip_club_ball_set: { path: 'spr_parkgolf_club_ball_set_01.png', grid: [72, 72] },
      sacheonseong_tile_set: { path: 'spr_sacheonseong_tile_set_01.png', grid: [128, 64] },
    },
  },
  /** 클럽 UI 배너·배지·모드 아이콘 */
  ui: {
    grid: [64, 64],
    colors: 24,
    alpha: true,
    files: {
      banner_lounge: { path: 'ui_club_lounge_banner_01.png', grid: [200, 112], fit: true },
      badge_master: { path: 'ui_rank_badge_master_01.png', grid: [104, 104], fit: true },
      mode_parkgolf: { path: 'rpg/ui/ui_mode_icon_parkgolf_01.png', grid: [64, 64], fit: true },
      mode_alkkagi: { path: 'rpg/ui/ui_mode_icon_alkkagi_01.png', grid: [64, 64], fit: true },
      mode_sacheonseong: { path: 'rpg/ui/ui_mode_icon_sacheonseong_01.png', grid: [64, 64], fit: true },
    },
  },

  /** 사천성 패 8종 */
  tileset: {
    grid: [36, 36],
    colors: 20,
    alpha: true,
    files: {
      tile_crane: { path: 'tiles/tile_crane.png', grid: [36, 36] },
      tile_plum: { path: 'tiles/tile_plum.png', grid: [36, 36] },
      tile_maple: { path: 'tiles/tile_maple.png', grid: [36, 36] },
      tile_moon: { path: 'tiles/tile_moon.png', grid: [36, 36] },
      tile_celadon: { path: 'tiles/tile_celadon.png', grid: [36, 36] },
      tile_turtle: { path: 'tiles/tile_turtle.png', grid: [36, 36] },
      tile_peony: { path: 'tiles/tile_peony.png', grid: [36, 36] },
      tile_bamboo: { path: 'tiles/tile_bamboo.png', grid: [36, 36] },
    },
  },
};

/* ------------------------------------------------------------------ */
/* 이미지 유틸                                                          */
/* ------------------------------------------------------------------ */

/** 투명 여백을 잘라 실제 그림 영역을 구합니다. */
export function contentBounds(png, threshold = 20) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: png.width, h: png.height };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** 지정 영역만 잘라냅니다. */
export function cropPng(png, rect) {
  const out = new PNG({ width: rect.w, height: rect.h });
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const i = ((y + rect.y) * png.width + (x + rect.x)) * 4;
      const o = (y * rect.w + x) * 4;
      out.data[o] = png.data[i];
      out.data[o + 1] = png.data[i + 1];
      out.data[o + 2] = png.data[i + 2];
      out.data[o + 3] = png.data[i + 3];
    }
  }
  return out;
}

/**
 * 그림 영역을 잘라 목표 캔버스에 비율을 유지한 채 채웁니다.
 * 발밑 정렬(하단 고정)이라 맵 위에 세웠을 때 접지가 맞습니다.
 */
export function fitToCanvas(png, gw, gh, margin = 1) {
  const bounds = contentBounds(png);
  const cut = cropPng(png, bounds);
  const maxW = gw - margin * 2;
  const maxH = gh - margin * 2;
  const ratio = Math.min(maxW / cut.width, maxH / cut.height);
  const w = Math.max(1, Math.round(cut.width * ratio));
  const h = Math.max(1, Math.round(cut.height * ratio));
  const small = downsample(cut, w, h);
  const canvas = new PNG({ width: gw, height: gh });
  const ox = Math.floor((gw - w) / 2);
  const oy = gh - h - margin;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = ((y + oy) * gw + (x + ox)) * 4;
      canvas.data[o] = small.data[i];
      canvas.data[o + 1] = small.data[i + 1];
      canvas.data[o + 2] = small.data[i + 2];
      canvas.data[o + 3] = small.data[i + 3];
    }
  }
  return canvas;
}

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function writePng(file, png) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png, { colorType: 6 }));
}

/** 프리멀티플라이드 박스 다운샘플. 알파 경계의 검은 테두리를 막습니다. */
export function downsample(src, gw, gh) {
  const out = new PNG({ width: gw, height: gh });
  const sx = src.width / gw;
  const sy = src.height / gh;
  for (let y = 0; y < gh; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < gw; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          const al = src.data[i + 3] / 255;
          r += src.data[i] * al;
          g += src.data[i + 1] * al;
          b += src.data[i + 2] * al;
          a += al;
          n++;
        }
      }
      const o = (y * gw + x) * 4;
      if (a <= 0.0001) {
        out.data[o] = out.data[o + 1] = out.data[o + 2] = out.data[o + 3] = 0;
        continue;
      }
      out.data[o] = Math.round(r / a);
      out.data[o + 1] = Math.round(g / a);
      out.data[o + 2] = Math.round(b / a);
      out.data[o + 3] = Math.round((a / n) * 255);
    }
  }
  return out;
}

/** 알파를 0/255로 확정해 계단형 실루엣을 만듭니다. */
export function hardenAlpha(png, threshold = 110) {
  for (let i = 3; i < png.data.length; i += 4) {
    png.data[i] = png.data[i] >= threshold ? 255 : 0;
  }
  return png;
}

/* ------------------------------------------------------------------ */
/* 팔레트 (median cut)                                                  */
/* ------------------------------------------------------------------ */

function samplePixels(pngs, step = 1) {
  const px = [];
  for (const png of pngs) {
    for (let i = 0; i < png.data.length; i += 4 * step) {
      if (png.data[i + 3] < 128) continue;
      px.push([png.data[i], png.data[i + 1], png.data[i + 2]]);
    }
  }
  return px;
}

function medianCut(pixels, count) {
  if (pixels.length === 0) return [[0, 0, 0]];
  let boxes = [pixels];
  while (boxes.length < count) {
    // 가장 넓은(분산 큰) 박스를 고른다.
    let best = -1;
    let bestRange = -1;
    let bestChannel = 0;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.length < 2) continue;
      for (let c = 0; c < 3; c++) {
        let min = 255;
        let max = 0;
        for (const p of box) {
          if (p[c] < min) min = p[c];
          if (p[c] > max) max = p[c];
        }
        if (max - min > bestRange) {
          bestRange = max - min;
          best = i;
          bestChannel = c;
        }
      }
    }
    if (best === -1 || bestRange <= 0) break;
    const box = boxes[best];
    box.sort((p, q) => p[bestChannel] - q[bestChannel]);
    const mid = Math.floor(box.length / 2);
    boxes.splice(best, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes
    .filter((box) => box.length > 0)
    .map((box) => {
      let r = 0, g = 0, b = 0;
      for (const p of box) {
        r += p[0];
        g += p[1];
        b += p[2];
      }
      return [
        Math.round(r / box.length),
        Math.round(g / box.length),
        Math.round(b / box.length),
      ];
    });
}

function nearestColor(palette, r, g, b) {
  let best = palette[0];
  let bestDist = Infinity;
  for (const c of palette) {
    const dr = c[0] - r;
    const dg = c[1] - g;
    const db = c[2] - b;
    // 밝기 차이에 가중치를 조금 더 둬 어두운 테두리가 뭉개지지 않게 합니다.
    const dist = dr * dr * 0.3 + dg * dg * 0.5 + db * db * 0.2;
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

export function quantize(png, palette) {
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] === 0) continue;
    const [r, g, b] = nearestColor(palette, png.data[i], png.data[i + 1], png.data[i + 2]);
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
  }
  return png;
}

/** 정수배 최근접 이웃 업스케일. */
export function upscaleNearest(png, scale) {
  if (scale === 1) return png;
  const out = new PNG({ width: png.width * scale, height: png.height * scale });
  for (let y = 0; y < out.height; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < out.width; x++) {
      const sx = Math.floor(x / scale);
      const i = (sy * png.width + sx) * 4;
      const o = (y * out.width + x) * 4;
      out.data[o] = png.data[i];
      out.data[o + 1] = png.data[i + 1];
      out.data[o + 2] = png.data[i + 2];
      out.data[o + 3] = png.data[i + 3];
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 파이프라인                                                           */
/* ------------------------------------------------------------------ */

/**
 * 한 그룹을 변환합니다. 같은 팔레트를 그룹 전체가 공유합니다.
 * @returns {{name:string, out:string, colors:number}[]}
 */
export function pixelizeGroup(name, only) {
  const group = GROUPS[name];
  if (!group) throw new Error(`unknown group: ${name}`);
  const entries = Object.entries(group.files)
    .map(([key, value]) => {
      const spec = typeof value === 'string' ? { path: value } : value;
      return { key, path: spec.path, grid: spec.grid ?? group.grid, fit: spec.fit ?? group.fit };
    })
    .filter((entry) => !only || only.includes(entry.key));

  // 같은 그리드를 쓰는 파일끼리 팔레트를 공유합니다 (프레임 간 색 튈 방지).
  const buckets = new Map();
  for (const entry of entries) {
    const bucketKey = entry.grid.join('x');
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey).push(entry);
  }

  const results = [];
  for (const bucket of buckets.values()) {
    const [gw, gh] = bucket[0].grid;
    const downsampled = bucket.map((entry) => {
      const src = readPng(path.join(ASSET_ROOT, entry.path));
      const small = entry.fit ? fitToCanvas(src, gw, gh) : downsample(src, gw, gh);
      if (group.alpha) hardenAlpha(small);
      return { key: entry.key, small };
    });

    const palette = medianCut(samplePixels(downsampled.map((d) => d.small)), group.colors);

    for (const { key, small } of downsampled) {
      quantize(small, palette);
      const big = upscaleNearest(small, ART_SCALE);
      const out = path.join(OUT_ROOT, name, `${key}.png`);
      writePng(out, big);
      results.push({ name: key, out, colors: palette.length });
    }
  }
  return results;
}

export function pixelizeAll(onlyKeys) {
  const results = [];
  for (const name of Object.keys(GROUPS)) {
    const only = onlyKeys ? onlyKeys.filter((k) => GROUPS[name].files[k]) : null;
    if (onlyKeys && only.length === 0) continue;
    results.push(...pixelizeGroup(name, only || undefined));
  }
  return results;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2);
  const onlyArg = args.find((a) => a.startsWith('--only'));
  const only = onlyArg ? (onlyArg.split('=')[1] ?? '').split(',').filter(Boolean) : null;
  const started = Date.now();
  const results = pixelizeAll(only);
  for (const r of results) console.log(`${r.name}  ${r.colors}색  -> ${path.relative(ROOT, r.out)}`);
  console.log(`${results.length}개 에셋 · ${Date.now() - started}ms`);
}
