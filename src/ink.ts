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
/** 태과의 상승(相乘) — 넘치는 기운은 이기던 상대를 더 세게 누른다 */
export const EXCESS_STRONG_MULT = 1.8;

/**
 * 공격 먹이 대상의 속성에 대해 갖는 배율.
 * 태과(excess)면 상승으로 더 세게 누르고, 상모(相侮)로 나를 이기던 상대를 거꾸로 업신여겨 약점이 사라진다.
 */
export function affinity(attack: InkId | null, target: InkId, excess = false): number {
  if (!attack) return 1;
  if (OVERCOMES[attack] === target) return excess ? EXCESS_STRONG_MULT : STRONG_MULT;
  if (OVERCOMES[target] === attack) return excess ? 1 : WEAK_MULT;
  return 1;
}

export const INK_MAX = 100;
/** 먹이 이만큼 차면 태과(太過) — 그 먹을 쥐면 강해지지만, 지니고 있는 동안 넘친 먹이 나를 해친다 */
export const EXCESS_AT = 80;
/** 이만큼 있는 먹은 붓에 묻혀 쓸 수 있다(쥘 수 있다) */
export const HOLD_MIN = 10;

/** 태과의 대가 — 먹마다 넘친 기운이 붓잡이를 해치는 방식이 다르다 */
export const EXCESS_COST: Record<InkId, { title: string; cost: string }> = {
  cheong: { title: '덩굴이 웃자라다', cost: '휘두르는 속도 −15%' },
  jeok: { title: '불길이 손을 태우다', cost: '셋째 획마다 기력 −3' },
  hwang: { title: '땅이 발을 붙잡다', cost: '비켜 서기 재사용 +40%' },
  baek: { title: '쇠가 부러지기 쉽다', cost: '받는 피해 +25%' },
  heuk: { title: '물이 몸을 무겁게 하다', cost: '걸음 −15%' },
};

export type InkValues = Record<InkId, number>;
export type InkDeltas = Partial<Record<InkId, number>>;
export type InkFlags = Record<InkId, boolean>;

export const emptyInk = (): InkValues => ({ cheong: 0, jeok: 0, hwang: 0, baek: 0, heuk: 0 });
const noFlags = (): InkFlags => ({ cheong: false, jeok: false, hwang: false, baek: false, heuk: false });

/** 가장 강한, 쥘 수 있는 먹 */
export function strongestHeld(values: InkValues): InkId | null {
  let best: InkId | null = null;
  let bv = HOLD_MIN - 0.001;
  for (const id of INK_ORDER) {
    if (values[id] > bv) {
      bv = values[id];
      best = id;
    }
  }
  return best;
}

/**
 * 붓에 묻힌 먹은 붓잡이가 고른다. 저절로 바뀌는 때는 하나뿐 —
 * 쥔 먹이 말라 쥘 수 없게 되면(또는 아직 아무 먹도 쥐지 않았으면) 가장 강한 먹으로 넘어간다.
 */
export function resolveActive(values: InkValues, current: InkId | null): InkId | null {
  if (current && values[current] >= HOLD_MIN - 0.001) return current;
  return strongestHeld(values);
}

/** 젖은 먹에 더하고 뺀다 — 굳은 먹과 합쳐 INK_MAX를 넘지 않는다 */
function applyWet(wet: InkValues, locked: InkValues, deltas: InkDeltas): InkValues {
  const out = { ...wet };
  for (const id of INK_ORDER) {
    const d = deltas[id];
    if (d) out[id] = clamp(out[id] + d, 0, INK_MAX - locked[id]);
  }
  return out;
}

const sum = (a: InkValues, b: InkValues): InkValues => {
  const out = emptyInk();
  for (const id of INK_ORDER) out[id] = a[id] + b[id];
  return out;
};

/** 젖은 먹이 마르는 빠르기 — 많을수록 빨리 마른다. 방 하나를 싸우면 3분의 1쯤 */
const DRY_RATE = 0.0115;
const DRY_BASE = 0.03;

/**
 * 먹의 기운은 두 겹이다.
 *  - 젖은 먹(wet): 먹방울과 보상 카드로 얻는다. 싸우는 동안 조금씩 마른다.
 *  - 굳은 먹(locked): 지닌 물건이 붙잡고 있어 마르지도 씻기지도 않는다.
 * 둘을 합친 것이 그 먹의 기운(values)이다. HOLD_MIN 넘게 있는 먹은 쥘 수 있고,
 * 붓잡이가 그 가운데 하나를 골라 붓에 묻힌다(active).
 */
export class InkState {
  wet: InkValues = emptyInk();
  locked: InkValues = emptyInk();
  values: InkValues = emptyInk();
  /** 붓에 묻힌 먹 — 3타 콤보와 상극, 세기가 이 먹을 따른다 */
  active: InkId | null = null;
  /** 넘친(태과에 든) 먹들 — 지니고 있는 동안 대가를 치른다 */
  over: InkFlags = noFlags();
  /** 붓의 먹이 바뀐 순간. manual이면 붓잡이가 골라 바꾼 것 */
  onSwitch: ((from: InkId | null, to: InkId | null, manual: boolean) => void) | null = null;
  /** 어느 먹이 태과에 들거나 벗어난 순간 */
  onOverflow: ((ink: InkId, on: boolean) => void) | null = null;

  reset(): void {
    this.wet = emptyInk();
    this.locked = emptyInk();
    this.values = emptyInk();
    this.active = null;
    this.over = noFlags();
  }

  /** 붓에 묻힌 먹의 기운 0..1 — 공격의 세기를 정한다 */
  get potency(): number {
    return this.active ? this.values[this.active] / INK_MAX : 0;
  }

  /** 쥐고 있는 먹이 태과면 그 먹 — 상승(相乘)과 상모(相侮)를 얻는다 */
  get excess(): InkId | null {
    return this.active && this.over[this.active] ? this.active : null;
  }

  /** 쥘 수 있는 먹인지 */
  held(id: InkId): boolean {
    return this.values[id] >= HOLD_MIN - 0.001;
  }

  /** 붓에 이 먹을 묻힌다 — 쥘 수 없거나 이미 쥐고 있으면 false */
  wield(id: InkId): boolean {
    if (id === this.active || !this.held(id)) return false;
    const prev = this.active;
    this.active = id;
    this.onSwitch?.(prev, id, true);
    return true;
  }

  /** 쥘 수 있는 먹을 차례로 돌려 가며 바꾼다 (dir: 1 다음, −1 앞) */
  cycle(dir: 1 | -1): InkId | null {
    const start = this.active ? INK_ORDER.indexOf(this.active) : dir > 0 ? -1 : 0;
    for (let k = 1; k <= INK_ORDER.length; k++) {
      const id = INK_ORDER[(start + dir * k + INK_ORDER.length * 2) % INK_ORDER.length];
      if (id !== this.active && this.held(id)) {
        this.wield(id);
        return id;
      }
    }
    return null;
  }

  apply(deltas: InkDeltas): void {
    this.wet = applyWet(this.wet, this.locked, deltas);
    this.sync();
  }

  /** 물건이 먹을 붙잡는다 — 그만큼은 마르지 않는다 */
  lock(id: InkId, amount: number): void {
    this.locked[id] = clamp(this.locked[id] + amount, 0, INK_MAX);
    this.wet[id] = Math.min(this.wet[id], INK_MAX - this.locked[id]);
    this.sync();
  }

  /**
   * 젖은 먹이 마른다. mul은 마르는 빠르기 배율, flow는 마른 먹 가운데
   * 상생의 다음 먹으로 스며드는 몫(오행도).
   * 태과에 든 먹은 넘쳐서 두 배로 빨리 마른다.
   */
  dry(dt: number, mul = 1, flow = 0): void {
    if (dt <= 0) return;
    const gain = emptyInk();
    let changed = false;
    for (const id of INK_ORDER) {
      const w = this.wet[id];
      if (w <= 0) continue;
      const rate = (DRY_RATE * w + DRY_BASE) * mul * (this.over[id] ? 2 : 1);
      const lost = Math.min(w, rate * dt);
      this.wet[id] = w - lost < 0.02 ? 0 : w - lost;
      if (flow > 0) gain[GENERATES[id]] += lost * flow;
      changed = true;
    }
    if (!changed) return;
    if (flow > 0) this.wet = applyWet(this.wet, this.locked, gain);
    this.sync();
  }

  preview(deltas: InkDeltas, lock?: { id: InkId; amount: number }): { values: InkValues; active: InkId | null } {
    const locked = { ...this.locked };
    if (lock) locked[lock.id] = clamp(locked[lock.id] + lock.amount, 0, INK_MAX);
    const wet = applyWet(this.wet, locked, deltas);
    for (const id of INK_ORDER) wet[id] = Math.min(wet[id], INK_MAX - locked[id]);
    const values = sum(locked, wet);
    return { values, active: resolveActive(values, this.active) };
  }

  private sync(): void {
    this.values = sum(this.locked, this.wet);
    const next = resolveActive(this.values, this.active);
    if (next !== this.active) {
      const prev = this.active;
      this.active = next;
      this.onSwitch?.(prev, next, false);
    }
    // 문턱 언저리에서 들락날락하지 않게, 한번 들면 조금 더 내려가야 벗어난다
    for (const id of INK_ORDER) {
      const v = this.values[id];
      const on = v >= EXCESS_AT || (this.over[id] && v >= EXCESS_AT - 4);
      if (on !== this.over[id]) {
        this.over[id] = on;
        this.onOverflow?.(id, on);
      }
    }
  }
}
