/**
 * 자동 생성 파일 — `node tools/pixel-art/render-fx.mjs` 로 다시 만드세요.
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
  heal: {
    "name": "heal",
    "source": "nature/healing-bloom",
    "frameWidth": 124,
    "frameHeight": 108,
    "columns": 7,
    "rows": 6,
    "frames": 41,
    "fps": 12,
    "loop": false,
    "anchorX": 62,
    "anchorY": 108,
    "durationMs": 3417
  },
  holein: {
    "name": "holein",
    "source": "pickups/collect-burst",
    "frameWidth": 112,
    "frameHeight": 96,
    "columns": 5,
    "rows": 4,
    "frames": 20,
    "fps": 14,
    "loop": false,
    "anchorX": 56,
    "anchorY": 94,
    "durationMs": 1429
  },
  impact: {
    "name": "impact",
    "source": "impacts/crit-hit",
    "frameWidth": 216,
    "frameHeight": 122,
    "columns": 3,
    "rows": 5,
    "frames": 14,
    "fps": 14,
    "loop": false,
    "anchorX": 84,
    "anchorY": 106,
    "durationMs": 1000
  },
  match: {
    "name": "match",
    "source": "impacts/hit-spark",
    "frameWidth": 136,
    "frameHeight": 70,
    "columns": 3,
    "rows": 3,
    "frames": 8,
    "fps": 14,
    "loop": false,
    "anchorX": 44,
    "anchorY": 64,
    "durationMs": 571
  },
  promotion: {
    "name": "promotion",
    "source": "ui/confetti",
    "frameWidth": 200,
    "frameHeight": 140,
    "columns": 6,
    "rows": 7,
    "frames": 42,
    "fps": 12,
    "loop": false,
    "anchorX": 100,
    "anchorY": 126,
    "durationMs": 3500
  },
} as const;

export type FxName = keyof typeof FX_MANIFEST;
