/**
 * 물결 사이에 고르는 보상. 먹을 올리고(진묵), 씻어 내고(정화), 옮겨 담는(전환) 것으로
 * 플레이어가 주속성을 의도대로 다룰 수 있게 한다.
 */
import { pick, shuffle } from '../core/math';
import { GENERATES, INKS, INK_ORDER, type InkDeltas, type InkId, type InkValues } from '../ink';
import type { Game } from './game';

export type ItemKind = 'raise' | 'purify' | 'shift' | 'relic';

export interface Item {
  id: string;
  kind: ItemKind;
  name: string;
  /** 카드 가운데 크게 쓰는 글자 */
  glyph: string;
  desc: string;
  deltas?: InkDeltas;
  /** 카드 그림에 쓰는 먹들 (전환이면 [뺄 먹, 더할 먹]) */
  inks: InkId[];
  tag?: string;
  apply?: (g: Game) => void;
}

const RAISE = 22;
const START_RAISE = 30;
const PURIFY = 30;
const SHIFT = 20;
const SHIFT_SANGSAENG = 28;

export function raiseItem(id: InkId, amount = RAISE): Item {
  const d = INKS[id];
  return {
    id: `raise-${id}`,
    kind: 'raise',
    name: `${d.pigment} 먹`,
    glyph: d.hanja,
    desc: `${d.name}의 기운 +${amount}`,
    deltas: { [id]: amount },
    inks: [id],
  };
}

export function purifyItem(id: InkId): Item {
  const d = INKS[id];
  return {
    id: `purify-${id}`,
    kind: 'purify',
    name: `${d.name} 씻기`,
    glyph: '洗',
    desc: `${d.name}의 기운 −${PURIFY}`,
    deltas: { [id]: -PURIFY },
    inks: [id],
  };
}

export function shiftItem(from: InkId, to: InkId): Item {
  const a = INKS[from];
  const b = INKS[to];
  const sangsaeng = GENERATES[from] === to;
  const gain = sangsaeng ? SHIFT_SANGSAENG : SHIFT;
  return {
    id: `shift-${from}-${to}`,
    kind: 'shift',
    name: `${a.hanja}${b.hanja} 먹 갈기`,
    glyph: '轉',
    desc: `${a.name} −${SHIFT}, ${b.name} +${gain}`,
    deltas: { [from]: -SHIFT, [to]: gain },
    inks: [from, to],
    tag: sangsaeng ? `상생 ${a.elementHanja}生${b.elementHanja}` : undefined,
  };
}

const washAll: Item = {
  id: 'wash-all',
  kind: 'purify',
  name: '맑은 물',
  glyph: '淨',
  desc: '모든 먹의 기운 −15',
  deltas: { cheong: -15, jeok: -15, hwang: -15, baek: -15, heuk: -15 },
  inks: [],
};

const RELICS: Item[] = [
  {
    id: 'relic-brush',
    kind: 'relic',
    name: '대나무 붓대',
    glyph: '筆',
    desc: '휘두르는 속도 +12%',
    inks: [],
    apply: (g) => {
      g.player.attackSpeed *= 1.12;
    },
  },
  {
    id: 'relic-sandal',
    kind: 'relic',
    name: '짚신',
    glyph: '履',
    desc: '이동 속도 +8%, 대시 재사용 −12%',
    inks: [],
    apply: (g) => {
      g.player.moveMul *= 1.08;
      g.player.dashCdMul *= 0.88;
    },
  },
  {
    id: 'relic-inkstone',
    kind: 'relic',
    name: '벼루',
    glyph: '硯',
    desc: '최대 기력 +20, 기력 20 회복',
    inks: [],
    apply: (g) => {
      g.player.maxHp += 20;
      g.healPlayer(20);
    },
  },
  {
    id: 'relic-tea',
    kind: 'relic',
    name: '연잎 차',
    glyph: '茶',
    desc: '기력 45 회복',
    inks: [],
    apply: (g) => g.healPlayer(45),
  },
];

export function startingItems(): Item[] {
  return INK_ORDER.map((id) => raiseItem(id, START_RAISE));
}

export interface RewardOptions {
  /** 이 먹을 올리는 카드를 꼭 넣는다 — 방을 채웠던 먹귀의 먹 */
  guarantee?: InkId | null;
  /** 유물 한 장을 꼭 넣는다 (정예 방) */
  relic?: boolean;
}

/** 세 장: 진묵 하나, 정화나 전환 하나, 나머지는 아무거나 */
export function rollRewards(values: InkValues, dominant: InkId | null, o: RewardOptions = {}): Item[] {
  const out: Item[] = [];
  const add = (it: Item | undefined): void => {
    if (it && !out.some((x) => x.id === it.id)) out.push(it);
  };
  const owned = INK_ORDER.filter((id) => values[id] > 0);

  add(raiseItem(o.guarantee ?? pick(INK_ORDER)));
  if (o.relic) add(pick(RELICS));

  const manip: Item[] = [];
  for (const from of owned) {
    for (const to of INK_ORDER) if (to !== from) manip.push(shiftItem(from, to));
    manip.push(purifyItem(from));
  }
  // 지금 주속성을 다른 먹으로 옮기는 선택지가 자주 나오게
  if (dominant) {
    manip.push(shiftItem(dominant, GENERATES[dominant]));
    manip.push(purifyItem(dominant));
  }
  if (owned.length >= 3) manip.push(washAll);
  add(manip.length ? pick(manip) : raiseItem(pick(INK_ORDER)));

  const pool: Item[] = [...RELICS, ...INK_ORDER.map((id) => raiseItem(id)), ...manip];
  const want = o.relic ? 4 : 3;
  for (const it of shuffle(pool)) {
    if (out.length >= want) break;
    add(it);
  }
  return shuffle(out);
}

/** 샘: 기력을 되찾고 먹을 씻어 낸다 */
export function springItems(values: InkValues, dominant: InkId | null): Item[] {
  const out: Item[] = [
    {
      id: 'spring-drink',
      kind: 'relic',
      name: '샘물 한 모금',
      glyph: '泉',
      desc: '기력 45 회복',
      inks: [],
      apply: (g) => g.healPlayer(45),
    },
    { ...washAll, desc: '모든 먹의 기운 −15, 기력 15 회복', apply: (g) => g.healPlayer(15) },
  ];
  const owned = INK_ORDER.filter((id) => values[id] > 0).sort((a, b) => values[b] - values[a]);
  if (dominant) out.push(shiftItem(dominant, GENERATES[dominant]));
  else if (owned[0]) out.push(purifyItem(owned[0]));
  if (owned[1]) out.push(purifyItem(owned[1]));
  return out;
}
