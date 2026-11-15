/**
 * 걸어다니며 하는 힐링 생활 — 텃밭·연못 낚시·내 집 꾸미기·벤치 쉬기·하루 한 마디.
 * React/Expo 없이 순수 함수만 둡니다. 저장된 값은 신뢰하지 않고 normalizeLife 로 보정합니다.
 */

const HOUR_MS = 60 * 60 * 1000;

export type CropId = 'lettuce' | 'pepper' | 'tomato';
export const CROPS: Record<CropId, { name: string; growMs: number; acorns: number }> = {
  lettuce: { name: '상추', growMs: 2 * HOUR_MS, acorns: 20 },
  pepper: { name: '고추', growMs: 4 * HOUR_MS, acorns: 45 },
  tomato: { name: '토마토', growMs: 8 * HOUR_MS, acorns: 90 },
};
export const CROP_IDS = Object.keys(CROPS) as CropId[];
/** 하루 한 번 물을 주면 자라는 시간이 이만큼(비율) 앞당겨집니다. */
export const WATER_BONUS_RATIO = 0.25;
export const GARDEN_PLOT_COUNT = 4;

export interface GardenPlot {
  cropId: CropId | null;
  plantedAtMs: number;
  wateredDay: string | null;
  waterBonusMs: number;
}

export type FishId = 'minnow' | 'crucian' | 'carp' | 'catfish' | 'mandarin' | 'golden';
export const FISH: readonly { id: FishId; name: string; weight: number; acorns: number }[] = [
  { id: 'minnow', name: '피라미', weight: 35, acorns: 5 },
  { id: 'crucian', name: '붕어', weight: 28, acorns: 10 },
  { id: 'carp', name: '잉어', weight: 18, acorns: 20 },
  { id: 'catfish', name: '메기', weight: 10, acorns: 30 },
  { id: 'mandarin', name: '쏘가리', weight: 7, acorns: 45 },
  { id: 'golden', name: '황금 잉어', weight: 2, acorns: 150 },
];
export const FISH_BITE_MIN_MS = 2000;
export const FISH_BITE_MAX_MS = 6000;
/** 찌가 흔들린 뒤 넉넉하게 기다려 주는 시간 — 손이 느려도 놓치지 않게. */
export const FISH_CATCH_WINDOW_MS = 15_000;

export type FurnitureId = 'cabinet' | 'bedding' | 'orchid' | 'radio' | 'tea_table' | 'painting' | 'screen' | 'fishbowl';
export const FURNITURE: Record<FurnitureId, { name: string; price: number }> = {
  cabinet: { name: '자개장', price: 300 },
  bedding: { name: '꽃무늬 이불', price: 120 },
  orchid: { name: '난초 화분', price: 80 },
  radio: { name: '옛 라디오', price: 150 },
  tea_table: { name: '찻상', price: 100 },
  painting: { name: '고향 풍경화', price: 200 },
  screen: { name: '매화 병풍', price: 250 },
  fishbowl: { name: '금붕어 어항', price: 180 },
};
export const FURNITURE_IDS = Object.keys(FURNITURE) as FurnitureId[];
export const HOUSE_SLOT_COUNT = 6;

export const REST_VITALITY = 15;
export const REST_WARMTH = 5;
export const DIARY_MAX_CHARS = 80;
export const DIARY_KEEP = 30;

export interface LifeState {
  garden: GardenPlot[];
  fishLog: Partial<Record<FishId, number>>;
  ownedFurniture: FurnitureId[];
  houseSlots: (FurnitureId | null)[];
  lastRestDay: string | null;
  diary: { day: string; text: string }[];
  /** 가방: 작물·물고기·채집물 개수 */
  items: Record<string, number>;
  /** 도감에 한 번이라도 들어온 것 */
  discovered: string[];
  /** 오늘 주운 채집물 자리 (날이 바뀌면 비워짐) */
  foraged: { day: string | null; keys: string[] };
  /** 사진 앨범: 명소별 마지막으로 찍은 날 */
  photos: { spotId: string; day: string }[];
}

const emptyPlot = (): GardenPlot => ({ cropId: null, plantedAtMs: 0, wateredDay: null, waterBonusMs: 0 });

export function createLife(): LifeState {
  return {
    garden: Array.from({ length: GARDEN_PLOT_COUNT }, emptyPlot),
    fishLog: {},
    ownedFurniture: [],
    houseSlots: Array.from({ length: HOUSE_SLOT_COUNT }, () => null),
    lastRestDay: null,
    diary: [],
    items: {},
    discovered: [],
    foraged: { day: null, keys: [] },
    photos: [],
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const dayOrNull = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
const isCrop = (value: unknown): value is CropId => typeof value === 'string' && Object.prototype.hasOwnProperty.call(CROPS, value);
const isFurniture = (value: unknown): value is FurnitureId => typeof value === 'string' && Object.prototype.hasOwnProperty.call(FURNITURE, value);

/** 저장값 → 안전한 LifeState. 모르는 값은 버리고 길이를 고정합니다. */
export function normalizeLife(saved: unknown): LifeState {
  const base = createLife();
  if (!isRecord(saved)) return base;
  const plots = Array.isArray(saved.garden) ? saved.garden : [];
  const garden = base.garden.map((empty, index) => {
    const plot = plots[index];
    if (!isRecord(plot) || !isCrop(plot.cropId)) return empty;
    return {
      cropId: plot.cropId,
      plantedAtMs: finite(plot.plantedAtMs, 0),
      wateredDay: dayOrNull(plot.wateredDay),
      waterBonusMs: Math.max(0, finite(plot.waterBonusMs, 0)),
    };
  });
  const fishLog: LifeState['fishLog'] = {};
  if (isRecord(saved.fishLog)) {
    for (const fish of FISH) {
      const count = finite(saved.fishLog[fish.id], 0);
      if (count > 0) fishLog[fish.id] = Math.floor(count);
    }
  }
  const ownedFurniture = Array.isArray(saved.ownedFurniture)
    ? [...new Set(saved.ownedFurniture.filter(isFurniture))]
    : [];
  const slots = Array.isArray(saved.houseSlots) ? saved.houseSlots : [];
  const placed = new Set<FurnitureId>();
  const houseSlots = base.houseSlots.map((_, index) => {
    const id = slots[index];
    if (!isFurniture(id) || !ownedFurniture.includes(id) || placed.has(id)) return null;
    placed.add(id);
    return id;
  });
  const diary = Array.isArray(saved.diary)
    ? saved.diary
        .filter((entry): entry is { day: string; text: string } =>
          isRecord(entry) && dayOrNull(entry.day) !== null && typeof entry.text === 'string')
        .map((entry) => ({ day: entry.day, text: entry.text.slice(0, DIARY_MAX_CHARS) }))
        .slice(-DIARY_KEEP)
    : [];
  const items: Record<string, number> = {};
  if (isRecord(saved.items)) {
    for (const [id, count] of Object.entries(saved.items)) {
      const n = Math.floor(finite(count, 0));
      if (/^[a-z_]{1,24}$/.test(id) && n > 0) items[id] = Math.min(n, 9999);
    }
  }
  const discovered = Array.isArray(saved.discovered)
    ? [...new Set(saved.discovered.filter((id): id is string => typeof id === 'string' && /^[a-z_]{1,24}$/.test(id)))]
    : [];
  const foragedRaw = isRecord(saved.foraged) ? saved.foraged : {};
  const foraged = {
    day: dayOrNull(foragedRaw.day),
    keys: Array.isArray(foragedRaw.keys) ? foragedRaw.keys.filter((k): k is string => typeof k === 'string' && /^[a-z]*:?\d+,\d+$/.test(k)).slice(0, 200) : [],
  };
  const photos = Array.isArray(saved.photos)
    ? saved.photos
        .filter((p): p is { spotId: string; day: string } => isRecord(p) && typeof p.spotId === 'string' && dayOrNull(p.day) !== null)
        .map((p) => ({ spotId: p.spotId.slice(0, 24), day: p.day }))
        .slice(0, 50)
    : [];
  return { garden, fishLog, ownedFurniture, houseSlots, lastRestDay: dayOrNull(saved.lastRestDay), diary, items, discovered, foraged, photos };
}

// ── 텃밭 ──────────────────────────────────────────────

/** 0 새싹 · 1 자라는 중 · 2 수확할 때 */
export function cropStage(plot: GardenPlot, nowMs: number): 0 | 1 | 2 | null {
  if (!plot.cropId) return null;
  // 기기 시계가 뒤로 가도 음수 성장으로 멈추지 않게 경과 시간은 0 이상으로 둡니다.
  const ratio = (Math.max(0, nowMs - plot.plantedAtMs) + plot.waterBonusMs) / CROPS[plot.cropId].growMs;
  if (ratio >= 1) return 2;
  return ratio >= 0.5 ? 1 : 0;
}

/** 수확까지 남은 시간(ms). 이미 익었으면 0. */
export function cropRemainingMs(plot: GardenPlot, nowMs: number): number {
  if (!plot.cropId) return 0;
  return Math.max(0, CROPS[plot.cropId].growMs - (Math.max(0, nowMs - plot.plantedAtMs) + plot.waterBonusMs));
}

const replacePlot = (life: LifeState, index: number, plot: GardenPlot): LifeState => ({
  ...life,
  garden: life.garden.map((current, i) => (i === index ? plot : current)),
});

export function plantCrop(life: LifeState, index: number, cropId: CropId, nowMs: number): LifeState | null {
  const plot = life.garden[index];
  if (!plot || plot.cropId) return null;
  return replacePlot(life, index, { cropId, plantedAtMs: nowMs, wateredDay: null, waterBonusMs: 0 });
}

export function waterPlot(life: LifeState, index: number, today: string, nowMs: number): LifeState | null {
  const plot = life.garden[index];
  if (!plot?.cropId || plot.wateredDay === today || cropStage(plot, nowMs) === 2) return null;
  const bonus = CROPS[plot.cropId].growMs * WATER_BONUS_RATIO;
  return replacePlot(life, index, { ...plot, wateredDay: today, waterBonusMs: plot.waterBonusMs + bonus });
}

export function harvestPlot(life: LifeState, index: number, nowMs: number): { life: LifeState; cropId: CropId; acorns: number } | null {
  const plot = life.garden[index];
  if (!plot?.cropId || cropStage(plot, nowMs) !== 2) return null;
  return { life: replacePlot(life, index, emptyPlot()), cropId: plot.cropId, acorns: CROPS[plot.cropId].acorns };
}

// ── 낚시 ──────────────────────────────────────────────

/** rand ∈ [0,1) 로 무게에 따라 물고기를 고릅니다. */
export function rollFish(rand: number): (typeof FISH)[number] {
  const total = FISH.reduce((sum, fish) => sum + fish.weight, 0);
  let point = Math.min(Math.max(rand, 0), 0.999999) * total;
  for (const fish of FISH) {
    if (point < fish.weight) return fish;
    point -= fish.weight;
  }
  return FISH[0];
}

export function rollBiteDelayMs(rand: number): number {
  return Math.round(FISH_BITE_MIN_MS + Math.min(Math.max(rand, 0), 1) * (FISH_BITE_MAX_MS - FISH_BITE_MIN_MS));
}

/** 찌가 흔들린 뒤 입력 창 안에 눌렀는지 — 흔들리기 전에 누르면 아직입니다. */
export function isCatchInTime(biteAtMs: number, tapAtMs: number): boolean {
  return tapAtMs >= biteAtMs && tapAtMs - biteAtMs <= FISH_CATCH_WINDOW_MS;
}

export function recordCatch(life: LifeState, fishId: FishId): LifeState {
  return { ...life, fishLog: { ...life.fishLog, [fishId]: (life.fishLog[fishId] ?? 0) + 1 } };
}

// ── 내 집 ─────────────────────────────────────────────

export function buyFurniture(life: LifeState, id: FurnitureId, acorns: number): { life: LifeState; cost: number } | null {
  if (life.ownedFurniture.includes(id)) return null;
  const cost = FURNITURE[id].price;
  if (acorns < cost) return null;
  return { life: { ...life, ownedFurniture: [...life.ownedFurniture, id] }, cost };
}

/** 가구를 칸에 둡니다. 다른 칸에 있던 같은 가구는 옮겨 옵니다. null 이면 칸을 비웁니다. */
export function placeFurniture(life: LifeState, slot: number, id: FurnitureId | null): LifeState | null {
  if (slot < 0 || slot >= HOUSE_SLOT_COUNT) return null;
  if (id && !life.ownedFurniture.includes(id)) return null;
  const houseSlots = life.houseSlots.map((current, index) => {
    if (index === slot) return id;
    return id && current === id ? null : current;
  });
  return { ...life, houseSlots };
}

/** 놓인 가구 하나당 쉴 때 마음 온도 +1 */
export function houseComfort(life: LifeState): number {
  return life.houseSlots.filter(Boolean).length;
}

// ── 쉬기 · 하루 한 마디 ────────────────────────────────

export function canRest(life: LifeState, today: string): boolean {
  return life.lastRestDay !== today;
}

export function markRested(life: LifeState, today: string): LifeState {
  return { ...life, lastRestDay: today };
}

export function writeDiary(life: LifeState, day: string, text: string): LifeState | null {
  const trimmed = text.trim().slice(0, DIARY_MAX_CHARS);
  if (!trimmed) return null;
  const others = life.diary.filter((entry) => entry.day !== day);
  return { ...life, diary: [...others, { day, text: trimmed }].slice(-DIARY_KEEP) };
}

// ── 가방 · 도감 · 채집 · 사진 ─────────────────────────

/** 가방에 넣고 도감에 등록합니다. 처음 얻은 것이면 isNew. */
export function gainItem(life: LifeState, id: string, count = 1): { life: LifeState; isNew: boolean } {
  const isNew = !life.discovered.includes(id) && !(id in life.fishLog);
  return {
    life: {
      ...life,
      items: { ...life.items, [id]: Math.min(9999, (life.items[id] ?? 0) + count) },
      discovered: isNew ? [...life.discovered, id] : life.discovered,
    },
    isNew,
  };
}

export function hasDiscovered(life: LifeState, id: string): boolean {
  return life.discovered.includes(id) || (life.fishLog[id as FishId] ?? 0) > 0;
}

/** 오늘 이미 주운 자리인지 (날이 바뀌면 다시 주울 수 있음) */
export function isForaged(life: LifeState, day: string, key: string): boolean {
  return life.foraged.day === day && life.foraged.keys.includes(key);
}

export function markForaged(life: LifeState, day: string, key: string): LifeState | null {
  if (isForaged(life, day, key)) return null;
  const keys = life.foraged.day === day ? life.foraged.keys : [];
  return { ...life, foraged: { day, keys: [...keys, key] } };
}

/** 명소 사진을 앨범에 남깁니다(같은 명소는 날짜만 새로). 처음 찍은 명소면 isNew. */
export function takePhoto(life: LifeState, spotId: string, day: string): { life: LifeState; isNew: boolean } {
  const isNew = !life.photos.some((p) => p.spotId === spotId);
  return { life: { ...life, photos: [...life.photos.filter((p) => p.spotId !== spotId), { spotId, day }] }, isNew };
}
