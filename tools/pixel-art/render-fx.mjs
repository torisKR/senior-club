#!/usr/bin/env node
/**
 * render-fx.mjs — pixelfx(patch-gg/pixelfx) 이펙트를 게임용 스프라이트시트로 굽습니다.
 *
 * pixelfx의 공식 익스포터(`tools/render.mjs --sheet`)를 그대로 호출해
 * PNG + Aseprite형 JSON을 얻은 뒤, 게임 팔레트/크롭만 손봐
 * `apps/mobile/assets/game/rpg/fx/` 로 복사하고 타입드 매니페스트를 만듭니다.
 *
 *   node render-fx.mjs            전체
 *   node render-fx.mjs promotion  일부
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
const TMP = path.join(HERE, '.fx-build');
const OUT = path.join(ROOT, 'apps/mobile/assets/game/rpg/fx');
const MANIFEST_TS = path.join(ROOT, 'apps/mobile/src/fx/fx-manifest.ts');

/**
 * 아트 바이블 팔레트 (어두운 순 → 밝은 순).
 * pixelfx는 팔레트를 명도 램프로 해석하므로 순서를 지켜야 합니다.
 */
const PALETTE = {
  heritage: ['#6E4228', '#C2410C', '#E07A2F', '#D8B384', '#F0BF4F', '#FCF9F2', '#FFF3C4'],
  brass: ['#6E4228', '#8A4A18', '#A85A20', '#C2410C', '#D8873A', '#F0BF4F', '#FFD873', '#FFF3C4'],
  celadon: ['#0E5142', '#1E6F94', '#7FB3A8', '#BFE3D8', '#FCF9F2', '#FFFFFF'],
  warm: ['#4A2C1A', '#C2410C', '#E07A2F', '#F0BF4F', '#FCF9F2', '#FFFFFF'],
  autumn: ['#4A2C1A', '#9C4A1E', '#C2410C', '#D8873A', '#F0BF4F', '#FCF9F2'],
  bloom: ['#4A2C1A', '#0E5142', '#356347', '#7FB3A8', '#D8873A', '#F0BF4F', '#FCF9F2'],
};

/**
 * name        게임에서 부를 이름 (PixelFx name)
 * id          pixelfx 이펙트 id
 * cropBottom  지면선을 잘라낼 픽셀 수 (오버레이로 얹을 때 바닥이 어색하지 않게)
 */
const EFFECTS = [
  { name: 'promotion', id: 'ui/confetti', fps: 12, seed: 1105, palette: 'heritage' },
  { name: 'holein', id: 'pickups/collect-burst', fps: 14, seed: 2203, palette: 'brass', cropBottom: 12 },
  { name: 'impact', id: 'impacts/crit-hit', fps: 14, seed: 3311, palette: 'warm', cropBottom: 14 },
  { name: 'match', id: 'impacts/hit-spark', fps: 14, seed: 4409, palette: 'celadon', cropBottom: 10 },
  { name: 'heal', id: 'nature/healing-bloom', fps: 12, seed: 5501, palette: 'bloom', cropBottom: 12 },
];

const PIXELFX = path.join(HERE, 'node_modules/pixelfx/tools/render.mjs');

function runRender(effect) {
  const outDir = path.join(TMP, effect.name);
  fs.rmSync(outDir, { recursive: true, force: true });
  const opts = JSON.stringify({ palette: PALETTE[effect.palette] });
  const args = [
    PIXELFX,
    effect.id,
    '--sheet',
    '--fps',
    String(effect.fps),
    '--seed',
    String(effect.seed),
    '--bg',
    'none',
    '--opts',
    opts,
    '--out',
    TMP,
  ];
  if (effect.noActor) args.push('--no-actor');
  execFileSync(process.execPath, args, { stdio: 'pipe' });
  const metaPath = path.join(TMP, effect.id, `${effect.id.split('/')[1]}.json`);
  const sheetPath = path.join(TMP, effect.id, `${effect.id.split('/')[1]}.png`);
  return {
    json: JSON.parse(fs.readFileSync(metaPath, 'utf8')),
    png: PNG.sync.read(fs.readFileSync(sheetPath)),
  };
}

/** 프레임 그리드에서 아래쪽 지면선을 잘라 새 시트를 만듭니다. */
function cropSheet(png, columns, frameW, frameH, cropBottom) {
  const h = frameH - cropBottom;
  const rows = Math.ceil(png.height / frameH);
  const out = new PNG({ width: png.width, height: rows * h });
  for (let r = 0; r < rows; r++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < png.width; x++) {
        const i = ((r * frameH + y) * png.width + x) * 4;
        const o = ((r * h + y) * png.width + x) * 4;
        out.data[o] = png.data[i];
        out.data[o + 1] = png.data[i + 1];
        out.data[o + 2] = png.data[i + 2];
        out.data[o + 3] = png.data[i + 3];
      }
    }
  }
  return { png: out, frameH: h, rows };
}

export function renderAll(onlyNames) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.dirname(MANIFEST_TS), { recursive: true });
  const metas = [];
  const effects = onlyNames?.length
    ? EFFECTS.filter((e) => onlyNames.includes(e.name))
    : EFFECTS;

  for (const effect of effects) {
    const { json, png } = runRender(effect);
    const pf = json.meta.pixelfx;
    let sheet = png;
    let frameH = pf.frameSize[1];
    let rows = Math.ceil(png.height / frameH);
    if (effect.cropBottom) {
      const cropped = cropSheet(png, pf.columns, pf.frameSize[0], frameH, effect.cropBottom);
      sheet = cropped.png;
      frameH = cropped.frameH;
      rows = cropped.rows;
    }
    const file = path.join(OUT, `${effect.name}.png`);
    fs.writeFileSync(file, PNG.sync.write(sheet, { colorType: 6 }));

    metas.push({
      name: effect.name,
      source: effect.id,
      frameWidth: pf.frameSize[0],
      frameHeight: frameH,
      columns: pf.columns,
      rows,
      frames: pf.frames,
      fps: pf.fps,
      loop: pf.loop,
      anchorX: pf.pivot[0],
      anchorY: pf.loop ? pf.pivot[1] : Math.min(pf.pivot[1], frameH),
      durationMs: Math.round((pf.frames / pf.fps) * 1000),
    });
  }

  // 기존 매니페스트에 없는 이펙트는 유지 (부분 렌더 시)
  const cacheFile = path.join(TMP, 'manifest.json');
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {
    existing = [];
  }
  const merged = new Map(existing.map((m) => [m.name, m]));
  for (const m of metas) merged.set(m.name, m);
  const all = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  fs.mkdirSync(TMP, { recursive: true });
  const tmpDirectory = fs.mkdtempSync(path.join(TMP, '.manifest-'));
  const tmpFile = path.join(tmpDirectory, 'manifest.json');
  let renamed = false;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(all, null, 2), { flag: 'wx' });
    fs.renameSync(tmpFile, cacheFile);
    renamed = true;
  } finally {
    if (!renamed) {
      try { fs.unlinkSync(tmpFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    fs.rmdirSync(tmpDirectory);
  }

  const body = all.map((m) => `  ${m.name}: ${JSON.stringify(m, null, 2).replace(/\n/g, '\n  ')},`).join('\n');
  const ts = `/**
 * 자동 생성 파일 — \`node tools/pixel-art/render-fx.mjs\` 로 다시 만드세요.
 * 원본 이펙트: pixelfx (patch-gg/pixelfx, MIT) · 팔레트는 design/art/art-bible.md 준수.
 */
export interface FxMeta {
  /** 게임에서 쓰는 이름 */
  name: string;
  /** pixelfx 원본 id */
  source: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  frames: number;
  fps: number;
  loop: boolean;
  anchorX: number;
  anchorY: number;
  durationMs: number;
}

export const FX_MANIFEST = {
${body}
} as const;

export type FxName = keyof typeof FX_MANIFEST;
`;
  fs.writeFileSync(MANIFEST_TS, ts);
  return metas;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const metas = renderAll(only);
  for (const m of metas) {
    console.log(
      `${m.name.padEnd(10)} ${m.frames}프레임 ${m.frameWidth}x${m.frameHeight} @${m.fps}fps ${m.loop ? 'loop' : 'once'} (${m.durationMs}ms)`,
    );
  }
}
