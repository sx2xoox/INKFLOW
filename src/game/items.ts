/**
 * 방 사이에 고르는 보상. 먹을 올리고(진묵), 씻어 내고(정화), 옮겨 담는(전환) 것으로
 * 플레이어가 주속성을 의도대로 다룰 수 있게 한다. 카드로 얻는 먹은 젖은 먹이라 싸우는 동안 마른다.
 * 물건(artifact)은 효과와 함께 한 가지 먹을 붙잡아 굳힌다.
 *
 * 물건을 얻는 길 — 문의 방 종류가 곧 보상의 종류다:
 *  - 문방(文): 젖은 먹을 값으로 치르고 산다. 어차피 마를 먹을 굳은 먹으로 바꾸는 곳.
 *  - 정예(將): 묵괴가 지키던 물건 셋 가운데 하나를 고른다.
 *  - 버티기(守): 끝까지 견디면 카드 가운데 물건이 한 장 낀다.
 *  - 싸움(鬪): 가끔 물건이 한 장 낀다.
 */
import { pick, shuffle } from '../core/math';
import { GENERATES, INKS, INK_ORDER, type InkDeltas, type InkId, type InkState } from '../ink';
import { ARTIFACTS, ARTIFACT_LIST, type Artifact, type ArtifactId, priceOf } from './artifacts';
import type { Game } from './game';

export type ItemKind = 'raise' | 'purify' | 'shift' | 'relic' | 'artifact' | 'leave';

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
  /** 물건 카드 */
  artifact?: ArtifactId;
  /** 문방에서 치를 값 — 그 먹의 젖은 기운 */
  price?: { ink: InkId; amount: number };
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

export function purifyItem(id: InkId, locked = 0): Item {
  const d = INKS[id];
  return {
    id: `purify-${id}`,
    kind: 'purify',
    name: `${d.name} 씻기`,
    glyph: '洗',
    desc: `${d.name}의 젖은 기운 −${PURIFY}`,
    deltas: { [id]: -PURIFY },
    inks: [id],
    tag: locked > 0 ? `굳은 먹 ${Math.round(locked)}은 남는다` : undefined,
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
  desc: '모든 젖은 먹 −15',
  deltas: { cheong: -15, jeok: -15, hwang: -15, baek: -15, heuk: -15 },
  inks: [],
};

const tea: Item = {
  id: 'relic-tea',
  kind: 'relic',
  name: '연잎 차',
  glyph: '茶',
  desc: '기력 45 회복',
  inks: [],
  apply: (g) => g.healPlayer(45),
};

/** 물건 한 장. price가 있으면 문방의 값이다 */
export function artifactItem(a: Artifact, priced = false): Item {
  const d = INKS[a.ink];
  return {
    id: `artifact-${a.id}`,
    kind: 'artifact',
    name: a.name,
    glyph: a.glyph,
    desc: a.desc,
    inks: [a.ink],
    artifact: a.id,
    tag: `굳은 ${d.hanja} +${a.lock}`,
    price: priced ? { ink: a.ink, amount: priceOf(a) } : undefined,
  };
}

/** 문방을 그냥 지나간다 */
export const leaveItem: Item = {
  id: 'leave',
  kind: 'leave',
  name: '그냥 지나가다',
  glyph: '去',
  desc: '먹을 아껴 두고 다음 방으로 간다',
  inks: [],
};

/**
 * 아직 지니지 않은 물건 n개. prefer 먹의 물건을 하나 꼭 넣고, 나머지는 먹이 겹치지 않게 고른다.
 */
export function pickArtifacts(n: number, owned: ReadonlySet<ArtifactId>, prefer: InkId | null = null): Artifact[] {
  const free = shuffle(ARTIFACT_LIST.filter((a) => !owned.has(a.id)));
  const out: Artifact[] = [];
  if (prefer) {
    const p = free.find((a) => a.ink === prefer);
    if (p) out.push(p);
  }
  for (const a of free) {
    if (out.length >= n) break;
    if (!out.includes(a) && !out.some((o) => o.ink === a.ink)) out.push(a);
  }
  for (const a of free) {
    if (out.length >= n) break;
    if (!out.includes(a)) out.push(a);
  }
  return out;
}

export function startingItems(): Item[] {
  return INK_ORDER.map((id) => raiseItem(id, START_RAISE));
}

export interface RewardOptions {
  /** 이 먹을 올리는 카드를 꼭 넣는다 — 방을 채웠던 먹귀의 먹 */
  guarantee?: InkId | null;
  /** 물건 카드를 몇 장 넣을지 */
  artifacts?: number;
  owned?: ReadonlySet<ArtifactId>;
}

/** 세 장: 진묵 하나, 정화나 전환 하나, 나머지는 아무거나. 물건이 끼면 그만큼 바꾼다 */
export function rollRewards(ink: InkState, o: RewardOptions = {}): Item[] {
  const out: Item[] = [];
  const add = (it: Item | undefined): void => {
    if (it && !out.some((x) => x.id === it.id)) out.push(it);
  };
  const owned = o.owned ?? new Set<ArtifactId>();
  for (const a of pickArtifacts(o.artifacts ?? 0, owned, o.guarantee ?? null)) add(artifactItem(a));

  add(raiseItem(o.guarantee ?? pick(INK_ORDER)));

  // 옮기고 씻을 수 있는 건 젖은 먹뿐이다
  const wet = INK_ORDER.filter((id) => ink.wet[id] > 0);
  const movable = INK_ORDER.filter((id) => ink.wet[id] >= SHIFT);
  const manip: Item[] = [];
  for (const from of movable) for (const to of INK_ORDER) if (to !== from) manip.push(shiftItem(from, to));
  for (const id of wet) manip.push(purifyItem(id, ink.locked[id]));
  // 지금 주속성을 상생의 다음 먹으로 옮기는 선택지가 자주 나오게
  const dom = ink.dominant;
  if (dom && ink.wet[dom] >= SHIFT) manip.push(shiftItem(dom, GENERATES[dom]), shiftItem(dom, GENERATES[dom]));
  if (dom && ink.wet[dom] > 0) manip.push(purifyItem(dom, ink.locked[dom]));
  if (wet.length >= 3) manip.push(washAll);
  if (out.length < 3) add(manip.length ? pick(manip) : raiseItem(pick(INK_ORDER)));

  const pool: Item[] = [tea, ...INK_ORDER.map((id) => raiseItem(id)), ...manip];
  for (const it of shuffle(pool)) {
    if (out.length >= 3) break;
    add(it);
  }
  return shuffle(out);
}

/** 정예 방: 묵괴가 지키던 물건 셋 가운데 하나 */
export function artifactChoice(owned: ReadonlySet<ArtifactId>, prefer: InkId | null): Item[] {
  const items = pickArtifacts(3, owned, prefer).map((a) => artifactItem(a));
  return items.length ? shuffle(items) : [tea];
}

/** 문방: 서로 다른 먹의 물건 셋을 늘어놓는다. 값은 그 먹의 젖은 기운으로 치른다 */
export function shopItems(owned: ReadonlySet<ArtifactId>, stock?: ArtifactId[]): { items: Item[]; stock: ArtifactId[] } {
  const ids = stock ?? pickArtifacts(3, owned).map((a) => a.id);
  const left = ids.filter((id) => !owned.has(id));
  return { items: [...left.map((id) => artifactItem(ARTIFACTS[id], true)), leaveItem], stock: left };
}

/** 샘: 기력을 되찾고 먹을 씻어 낸다 */
export function springItems(ink: InkState): Item[] {
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
    { ...washAll, desc: '모든 젖은 먹 −15, 기력 15 회복', apply: (g) => g.healPlayer(15) },
  ];
  const wet = INK_ORDER.filter((id) => ink.wet[id] > 0).sort((a, b) => ink.wet[b] - ink.wet[a]);
  const dom = ink.dominant;
  if (dom && ink.wet[dom] >= SHIFT) out.push(shiftItem(dom, GENERATES[dom]));
  else if (wet[0]) out.push(purifyItem(wet[0], ink.locked[wet[0]]));
  if (wet[1]) out.push(purifyItem(wet[1], ink.locked[wet[1]]));
  return out;
}
