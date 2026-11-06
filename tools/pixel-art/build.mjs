#!/usr/bin/env node
/**
 * build.mjs — 픽셀 아트 에셋 파이프라인 전체를 순서대로 다시 굽습니다.
 *
 *   node build.mjs
 *
 *   1) pixelize   원본 일러스트 → 픽셀 그리드 + 팔레트 양자화 + 3x 최근접 업스케일
 *   2) tiles      잔디·물·소나무 절차 생성 (텍스처 노이즈가 많은 타일만)
 *   3) tiers      sprite-gen recolor 로 급수별 복장 변형
 *   4) fx         pixelfx 이펙트 → 스프라이트시트 + 타입드 매니페스트
 *   5) preview    검증용 합성 이미지
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);

const steps = [
  ['pixelize', 'pixelize.mjs'],
  ['tiles', 'tiles.mjs'],
  ['tiers', 'build-player-tiers.mjs'],
  ['fx', 'render-fx.mjs'],
  ['preview', 'preview.mjs'],
];

for (const [name, script] of steps) {
  process.stdout.write(`\n▶ ${name}\n`);
  execFileSync(process.execPath, [path.join(HERE, script)], { stdio: 'inherit' });
}
console.log('\n완료: apps/mobile/assets/game/rpg/pixel · fx · src/fx/fx-manifest.ts');
