/**
 * 오방색 먹과 그 기운.
 * 먹 정의는 데이터일 뿐이라, 나중에 간색(間色)이나 금니(金泥) 같은 먹을 더할 때도
 * INKS 표와 상성 표만 늘리면 된다.
 */
import { clamp } from './core/math';
import type { RGB } from './render/color';

export type InkId = 'cheong' | 'jeok' | 'hwang' | 'baek' | 'heuk';
export const INK_ORDER: readonly InkId[] = ['cheong', 'jeok', 'hwang', 'baek', 'heuk'];

export interface InkDef {
  id: InkId;
  name: string;
  hanja: string;
  element: string;
  elementHanja: string;
  /** 이 먹을 만드는 안료 */
  pigment: string;
  color: RGB;
  /** 먹이 몰린 가장자리 색 */
  edge: RGB;
  attackName: string;
  summary: string;
}

export const INKS: Record<InkId, InkDef> = {
  cheong: {
    id: 'cheong',
    name: '청묵',
    hanja: '靑',
    element: '목',
    elementHanja: '木',
    pigment: '쪽',
    color: [52, 86, 116],
    edge: [26, 48, 70],
    attackName: '덩굴 획',
    summary: '맞은 적을 덩굴로 묶고, 벤 만큼 기력을 빨아들인다.',
  },
  jeok: {
    id: 'jeok',
    name: '적묵',
    hanja: '赤',
    element: '화',
    elementHanja: '火',
    pigment: '주사',
    color: [178, 58, 42],
    edge: [104, 26, 18],
    attackName: '불꽃 획',
    summary: '획에 불이 붙어 적을 태우고, 타던 적은 쓰러지며 터진다.',
  },
  hwang: {
    id: 'hwang',
    name: '황묵',
    hanja: '黃',
    element: '토',
    elementHanja: '土',
    pigment: '석황',
    color: [192, 146, 56],
    edge: [120, 82, 22],
    attackName: '바위 획',
    summary: '느리고 묵직한 획이 적을 밀쳐내고 기절시킨다.',
  },
  baek: {
    id: 'baek',
    name: '백묵',
    hanja: '白',
    element: '금',
    elementHanja: '金',
    pigment: '호분',
    color: [244, 240, 230],
    edge: [128, 124, 116],
    attackName: '칼날 획',
    summary: '빠르고 날카로운 획. 치명타가 잦고 꿰뚫는 검기를 날린다.',
  },
  heuk: {
    id: 'heuk',
    name: '흑묵',
    hanja: '黑',
    element: '수',
    elementHanja: '水',
    pigment: '송연',
    color: [30, 27, 25],
    edge: [6, 5, 5],
    attackName: '물결 획',
    summary: '넓게 번지는 획이 먹물 웅덩이를 남겨 적을 느리게 한다.',
  },
};

/** 아무 먹의 기운도 없을 때의 묽은 먹 */
export const PLAIN = {
  name: '담묵',
  hanja: '淡',
  color: [104, 99, 92] as RGB,
  edge: [58, 54, 50] as RGB,
  attackName: '맑은 획',
  summary: '아직 어떤 먹의 기운도 없는 담백한 획.',
};

export const inkColor = (id: InkId | null): RGB => (id ? INKS[id].color : PLAIN.color);
export const inkEdge = (id: InkId | null): RGB => (id ? INKS[id].edge : PLAIN.edge);
export const inkHanja = (id: InkId | null): string => (id ? INKS[id].hanja : PLAIN.hanja);
export const inkName = (id: InkId | null): string => (id ? INKS[id].name : PLAIN.name);

/** 상극: 키가 값을 이긴다 (목극토, 토극수, 수극화, 화극금, 금극목) */
export const OVERCOMES: Record<InkId, InkId> = {
  cheong: 'hwang',
  hwang: 'heuk',
  heuk: 'jeok',
  jeok: 'baek',
  baek: 'cheong',
};

/** 상생: 키가 값을 낳는다 (목생화, 화생토, 토생금, 금생수, 수생목) */
export const GENERATES: Record<InkId, InkId> = {
  cheong: 'jeok',
  jeok: 'hwang',
  hwang: 'baek',
  baek: 'heuk',
  heuk: 'cheong',
};

export const counterOf = (target: InkId): InkId => INK_ORDER.find((id) => OVERCOMES[id] === target)!;

export const STRONG_MULT = 1.5;
export const WEAK_MULT = 0.7;

/** 공격 먹이 대상의 속성에 대해 갖는 배율 */
export function affinity(attack: InkId | null, target: InkId): number {
  if (!attack) return 1;
  if (OVERCOMES[attack] === target) return STRONG_MULT;
  if (OVERCOMES[target] === attack) return WEAK_MULT;
  return 1;
}

export const INK_MAX = 100;
/**
 * 주속성이 바뀌려면 새 먹이 지금 먹보다 이만큼 더 강해야 한다.
 * 비슷한 수치에서 공격이 정신없이 오락가락하지 않게 하는 여유폭.
 */
export const SWITCH_MARGIN = 5;

export type InkValues = Record<InkId, number>;
export type InkDeltas = Partial<Record<InkId, number>>;

export const emptyInk = (): InkValues => ({ cheong: 0, jeok: 0, hwang: 0, baek: 0, heuk: 0 });

export function resolveDominant(values: InkValues, current: InkId | null): InkId | null {
  let best: InkId | null = null;
  let bv = 0;
  for (const id of INK_ORDER) {
    if (values[id] > bv) {
      bv = values[id];
      best = id;
    }
  }
  if (!best) return null;
  if (!current || values[current] <= 0) return best;
  if (best !== current && values[best] >= values[current] + SWITCH_MARGIN) return best;
  return current;
}

export function applyDeltas(values: InkValues, deltas: InkDeltas): InkValues {
  const out = { ...values };
  for (const id of INK_ORDER) {
    const d = deltas[id];
    if (d) out[id] = clamp(out[id] + d, 0, INK_MAX);
  }
  return out;
}

export class InkState {
  values: InkValues = emptyInk();
  dominant: InkId | null = null;
  /** 먹이 바뀐 순간 화면 연출을 위해 */
  onSwitch: ((from: InkId | null, to: InkId | null) => void) | null = null;

  reset(): void {
    this.values = emptyInk();
    this.dominant = null;
  }

  /** 주속성 먹의 기운 0..1 — 공격의 세기를 정한다 */
  get potency(): number {
    return this.dominant ? this.values[this.dominant] / INK_MAX : 0;
  }

  apply(deltas: InkDeltas): void {
    this.values = applyDeltas(this.values, deltas);
    const next = resolveDominant(this.values, this.dominant);
    if (next !== this.dominant) {
      const prev = this.dominant;
      this.dominant = next;
      this.onSwitch?.(prev, next);
    }
  }

  preview(deltas: InkDeltas): { values: InkValues; dominant: InkId | null } {
    const values = applyDeltas(this.values, deltas);
    return { values, dominant: resolveDominant(values, this.dominant) };
  }
}
