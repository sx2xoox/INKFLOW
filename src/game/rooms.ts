/**
 * 탐험 — 한 판은 병풍 한 틀, 장(章) 하나는 병풍의 한 면, 방 하나는 그림 한 폭이다.
 * 방을 다 그려 내면(먹귀를 모두 쓰러뜨리면) 위쪽 담장에 달문(月門)이 그려지고,
 * 문에 적힌 먹 색과 방 종류를 보고 다음 길을 고른다.
 * 장의 마지막 방에는 그 장의 주인이 있고, 주인을 넘기면 정자에서 숨을 고른 뒤 다음 장으로 간다.
 */
import type { Vec } from '../core/math';
import { type Rng, mulberry32, randomSeed } from '../core/rng';
import { INK_ORDER, type InkId } from '../ink';
import { type EnemyKind, WALL, WORLD_H, WORLD_W } from './types';

export type RoomKind = 'battle' | 'hold' | 'elite' | 'spring' | 'shop' | 'boss' | 'rest';

export interface RoomDef {
  kind: RoomKind;
  /** 방을 채운 먹귀의 속성 (샘은 없음) */
  el: InkId | null;
  /** 몇 번째 장인지 (0부터) */
  chapter: number;
  /** 장 안에서 몇 번째 방인지 (0부터). 장 사이의 정자는 −1 */
  depth: number;
  seed: number;
}

export interface RoomKindInfo {
  name: string;
  hanja: string;
  desc: string;
}

export const ROOM_KINDS: Record<RoomKind, RoomKindInfo> = {
  battle: { name: '싸움', hanja: '鬪', desc: '먹귀를 모두 쓰러뜨린다' },
  hold: { name: '버티기', hanja: '守', desc: '몰려드는 먹귀를 끝까지 견디면 물건 한 장이 낀다' },
  elite: { name: '정예', hanja: '將', desc: '묵괴가 지키는 물건 셋 가운데 하나를 얻는다' },
  spring: { name: '샘', hanja: '泉', desc: '먹을 씻고 기력을 되찾는다' },
  shop: { name: '문방', hanja: '文', desc: '젖은 먹을 값으로 치르고 물건을 얻는다' },
  boss: { name: '주인', hanja: '主', desc: '이 장의 주인과 맞선다' },
  rest: { name: '정자', hanja: '亭', desc: '샘과 서안을 들르고 다음 장으로 간다' },
};

export interface ChapterDef {
  id: 'bamboo' | 'lotus';
  name: string;
  hanja: string;
  /** 방 개수 — 마지막 방은 주인, 그 앞 방에는 정예의 문이 하나 끼어 있다 */
  rooms: number;
  boss: { kind: EnemyKind; name: string; hanja: string; title: string };
}

export const CHAPTERS: readonly ChapterDef[] = [
  { id: 'bamboo', name: '대숲', hanja: '竹', rooms: 7, boss: { kind: 'tiger', name: '묵호', hanja: '虎', title: '대숲의 주인' } },
  { id: 'lotus', name: '연못', hanja: '蓮', rooms: 7, boss: { kind: 'imugi', name: '이무기', hanja: '螭', title: '연못의 주인' } },
];

/** 한 판의 방 수 (장 사이의 정자는 세지 않는다) */
export const TOTAL_ROOMS = CHAPTERS.reduce((n, c) => n + c.rooms, 0);

/** 판 전체에서 몇 번째 방인지 — 먹귀가 얼마나 단단할지 정한다 */
export function stageOf(def: RoomDef): number {
  let n = 0;
  for (let c = 0; c < def.chapter; c++) n += CHAPTERS[c].rooms;
  return n + Math.max(0, def.depth);
}

/** 문과 장막에 쓰는 글자 — 주인의 방은 그 장 주인의 글자 */
export const roomGlyph = (def: RoomDef): string => (def.kind === 'boss' ? CHAPTERS[def.chapter].boss.hanja : ROOM_KINDS[def.kind].hanja);
export const roomDesc = (def: RoomDef): string =>
  def.kind === 'boss' ? `${CHAPTERS[def.chapter].boss.title} ${CHAPTERS[def.chapter].boss.name}와 맞선다` : ROOM_KINDS[def.kind].desc;
/** 방 이름표 — 「대숲 · 셋째 방」, 정자는 「연못 어귀」 */
export const roomTitle = (def: RoomDef, numeral: (n: number) => string): string =>
  def.kind === 'rest' ? `${CHAPTERS[def.chapter].name} 어귀` : `${CHAPTERS[def.chapter].name} · ${numeral(def.depth + 1)} 방`;

/** 위쪽 담장 — 이보다 위로는 문으로만 지나간다 */
export const WALL_TOP = 178;
/** 달문이 서는 높이 */
export const GATE_Y = 116;
export const GATE_R = 46;
/** 방에 들어서는 자리 */
export const ENTRANCE: Vec = { x: WORLD_W / 2, y: WORLD_H - 130 };

export type ObstacleKind = 'rock' | 'bamboo' | 'willow';

export interface Obstacle {
  kind: ObstacleKind;
  x: number;
  y: number;
  /** 바닥에 닿은 둘레의 가로 반지름 — 세로는 OBSTACLE_SQUASH 배 */
  r: number;
  seed: number;
}

/** 위에서 비스듬히 내려다보니 바닥 둘레는 납작한 타원이다 */
export const OBSTACLE_SQUASH = 0.62;

export interface RoomLayout {
  obstacles: Obstacle[];
  pond: { x: number; y: number; r: number } | null;
  /** 문방의 서안(書案) — 다가가면 물건을 본다 */
  desk: { x: number; y: number; r: number } | null;
  /** 연못의 물 — 들어서면 걸음이 무거워지고, 잉어는 빨라진다 */
  waters: Water[];
}

export interface Water {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** 물 안에 있는지 */
export const inWater = (waters: readonly Water[], x: number, y: number): boolean => waters.some((w) => Math.hypot((x - w.x) / w.rx, (y - w.y) / w.ry) < 1);

const range = (rng: Rng, a: number, b: number): number => a + rng() * (b - a);

export function makeLayout(def: RoomDef): RoomLayout {
  const rng = mulberry32(def.seed);
  const obstacles: Obstacle[] = [];
  const lotus = CHAPTERS[def.chapter].id === 'lotus';
  if (def.kind === 'boss') return lotus ? lotusArena(rng) : { obstacles: arenaEdge(rng), pond: null, desk: null, waters: [] };
  const rest = def.kind === 'rest';
  const pond = def.kind === 'spring' ? { x: WORLD_W / 2, y: WORLD_H / 2 + 40, r: 120 } : rest ? { x: WORLD_W / 2 - 270, y: WORLD_H / 2 + 60, r: 105 } : null;
  const desk = def.kind === 'shop' ? { x: WORLD_W / 2, y: WORLD_H / 2 + 10, r: 95 } : rest ? { x: WORLD_W / 2 + 270, y: WORLD_H / 2 + 40, r: 95 } : null;
  const count = def.kind === 'elite' ? 4 : def.kind === 'spring' || def.kind === 'shop' || rest ? 5 : 5 + Math.floor(rng() * 3);
  // 연못의 방에는 물이 고인 자리가 한두 군데 — 싸우지 않는 방에는 두지 않는다
  const waters: Water[] = [];
  const fightRoom = def.kind === 'battle' || def.kind === 'hold' || def.kind === 'elite';
  if (lotus && fightRoom) {
    const n = 1 + Math.floor(rng() * 2);
    for (let tries = 0; waters.length < n && tries < 60; tries++) {
      const w = { x: range(rng, 300, WORLD_W - 300), y: range(rng, WALL_TOP + 180, WORLD_H - 260), rx: range(rng, 150, 230), ry: range(rng, 80, 120) };
      if (Math.hypot(w.x - ENTRANCE.x, (w.y - ENTRANCE.y) * 1.6) < w.rx + 120) continue;
      if (waters.some((o) => Math.hypot(w.x - o.x, w.y - o.y) < w.rx + o.rx + 60)) continue;
      waters.push(w);
    }
  }

  for (let tries = 0; obstacles.length < count && tries < 400; tries++) {
    const kind: ObstacleKind = rng() < 0.45 ? (lotus ? 'willow' : 'bamboo') : 'rock';
    const r = kind === 'rock' ? range(rng, 36, 60) : range(rng, 34, 46);
    const x = range(rng, WALL + 90, WORLD_W - WALL - 90);
    const y = range(rng, WALL_TOP + 110, WORLD_H - WALL - 90);
    if (Math.hypot(x - ENTRANCE.x, y - ENTRANCE.y) < 200) continue;
    // 한가운데는 싸울 자리로 비워 둔다
    if (Math.hypot(x - WORLD_W / 2, (y - WORLD_H / 2) * 1.4) < 210) continue;
    if (pond && Math.hypot(x - pond.x, y - pond.y) < pond.r + 150) continue;
    if (desk && Math.hypot(x - desk.x, y - desk.y) < desk.r + 150) continue;
    if (waters.some((w) => Math.hypot((x - w.x) / (w.rx + r + 40), (y - w.y) / (w.ry + r + 30)) < 1)) continue;
    if (obstacles.some((o) => Math.hypot(x - o.x, (y - o.y) / OBSTACLE_SQUASH) < r + o.r + 110)) continue;
    obstacles.push({ kind, x, y, r, seed: Math.floor(rng() * 1e6) });
  }
  return { obstacles, pond, desk, waters };
}

/** 연못의 주인의 방 — 가운데에 큰 못이 있고, 버드나무와 바위가 둘레를 두른다 */
function lotusArena(rng: Rng): RoomLayout {
  const obstacles: Obstacle[] = [];
  const spots: [number, number, ObstacleKind][] = [
    [WALL + 120, WALL_TOP + 140, 'willow'],
    [WALL + 110, WORLD_H - WALL - 160, 'rock'],
    [WORLD_W - WALL - 120, WALL_TOP + 140, 'willow'],
    [WORLD_W - WALL - 110, WORLD_H - WALL - 160, 'willow'],
  ];
  for (const [x, y, kind] of spots) {
    obstacles.push({ kind, x: x + range(rng, -20, 20), y: y + range(rng, -20, 20), r: range(rng, 38, 46), seed: Math.floor(rng() * 1e6) });
  }
  return { obstacles, pond: null, desk: null, waters: [{ x: WORLD_W / 2, y: WORLD_H / 2 + 30, rx: 330, ry: 175 }] };
}

/** 주인의 방 — 가운데를 넓게 비우고 대숲이 둘레를 두른다 */
function arenaEdge(rng: Rng): Obstacle[] {
  const out: Obstacle[] = [];
  const spots: [number, number][] = [
    [WALL + 120, WALL_TOP + 150],
    [WALL + 100, WORLD_H - WALL - 170],
    [WORLD_W - WALL - 120, WALL_TOP + 150],
    [WORLD_W - WALL - 100, WORLD_H - WALL - 170],
  ];
  for (const [x, y] of spots) {
    out.push({ kind: 'bamboo', x: x + range(rng, -25, 25), y: y + range(rng, -20, 20), r: range(rng, 38, 46), seed: Math.floor(rng() * 1e6) });
  }
  // 바위 둘 — 내달리는 범이 머리를 박을 자리
  out.push({ kind: 'rock', x: range(rng, 380, 520), y: range(rng, 560, 640), r: range(rng, 40, 50), seed: Math.floor(rng() * 1e6) });
  out.push({ kind: 'rock', x: range(rng, 1080, 1220), y: range(rng, 560, 640), r: range(rng, 40, 50), seed: Math.floor(rng() * 1e6) });
  return out;
}

/** 먹귀가 몇 무리로 나뉘어 나타나는지. 앞 무리가 trigger 마리 이하로 줄면 다음 무리가 온다. */
export interface Beat {
  groups: [EnemyKind, number][];
  trigger: number;
}

export function encounter(def: RoomDef): Beat[] {
  const d = def.depth;
  // 주인은 따로 나타난다
  if (def.kind === 'boss' || def.kind === 'shop' || def.kind === 'spring' || def.kind === 'rest') return [];
  if (CHAPTERS[def.chapter].id === 'lotus') return lotusEncounter(def);
  if (def.kind === 'elite') {
    return [
      { groups: [['brute', 1], ['toad', 2]], trigger: 0 },
      { groups: [['brute', 1], ['swallow', 3], ['drop', 4]], trigger: 1 },
      { groups: [['brute', 2], ['drop', 3]], trigger: 1 },
    ];
  }
  if (d <= 0) {
    return [
      { groups: [['drop', 5]], trigger: 0 },
      { groups: [['drop', 4], ['swallow', 2]], trigger: 1 },
    ];
  }
  if (d === 1) {
    return [
      { groups: [['drop', 4], ['swallow', 2]], trigger: 0 },
      { groups: [['toad', 2], ['drop', 4]], trigger: 2 },
      { groups: [['swallow', 3], ['drop', 3]], trigger: 1 },
    ];
  }
  if (d <= 3) {
    return [
      { groups: [['drop', 5], ['toad', 2]], trigger: 0 },
      { groups: [['swallow', 3], ['toad', 1], ['drop', 3]], trigger: 2 },
      { groups: [['brute', 1], ['drop', 4]], trigger: 1 },
    ];
  }
  return [
    { groups: [['drop', 6], ['toad', 2]], trigger: 1 },
    { groups: [['swallow', 4], ['brute', 1]], trigger: 2 },
    { groups: [['toad', 2], ['drop', 5], ['swallow', 2]], trigger: 1 },
  ];
}

/** 연못 — 먹 속을 헤엄치다 튀어 오르는 잉어와 앞을 등딱지로 막는 거북이 섞인다 */
function lotusEncounter(def: RoomDef): Beat[] {
  const d = def.depth;
  if (def.kind === 'elite') {
    return [
      { groups: [['brute', 1], ['turtle', 2]], trigger: 0 },
      { groups: [['brute', 1], ['carp', 4], ['swallow', 2]], trigger: 1 },
      { groups: [['brute', 2], ['turtle', 2]], trigger: 1 },
    ];
  }
  if (d <= 0) {
    return [
      { groups: [['carp', 3], ['drop', 3]], trigger: 0 },
      { groups: [['turtle', 1], ['drop', 4]], trigger: 1 },
    ];
  }
  if (d <= 2) {
    return [
      { groups: [['carp', 3], ['toad', 2]], trigger: 0 },
      { groups: [['turtle', 2], ['swallow', 3]], trigger: 2 },
      { groups: [['carp', 4], ['drop', 3]], trigger: 1 },
    ];
  }
  return [
    { groups: [['turtle', 2], ['carp', 3]], trigger: 1 },
    { groups: [['swallow', 4], ['toad', 2], ['carp', 2]], trigger: 2 },
    { groups: [['brute', 1], ['carp', 3], ['turtle', 1]], trigger: 1 },
  ];
}

/** 버티기 방에서 버텨야 하는 시간 */
export const holdDuration = (def: RoomDef): number => 22 + Math.min(4, def.depth) * 3 + def.chapter * 4;
/** 깊이 들어갈수록 먹귀가 단단해진다 — 판 전체의 몇 번째 방인지로 */
export const hpScale = (def: RoomDef): number => 1 + stageOf(def) * 0.11;
/** 장이 넘어갈수록 먹귀가 세게 친다 */
export const dmgScale = (def: RoomDef): number => 1 + def.chapter * 0.3;

export function firstRoom(chapter = 0): RoomDef {
  return { kind: 'battle', el: INK_ORDER[Math.floor(Math.random() * 5)], chapter, depth: 0, seed: randomSeed() };
}

/**
 * 다음 문들. 장의 마지막 방(주인)을 넘기면 정자로 가는 문 하나, 마지막 장이면 빈 배열 — 판이 끝난다.
 * 주인 앞 방에서는 정예의 문이 하나 열린다. 같은 방 종류에 같은 먹이 겹치지 않게 고른다.
 */
export function nextRooms(cleared: RoomDef): RoomDef[] {
  const chapter = cleared.chapter;
  const ch = CHAPTERS[chapter];
  const depth = cleared.depth + 1;
  if (depth >= ch.rooms) {
    if (chapter + 1 >= CHAPTERS.length) return [];
    return [{ kind: 'rest', el: null, chapter: chapter + 1, depth: -1, seed: randomSeed() }];
  }
  if (depth === ch.rooms - 1) {
    return [{ kind: 'boss', el: INK_ORDER[Math.floor(Math.random() * 5)], chapter, depth, seed: randomSeed() }];
  }
  const n = Math.random() < 0.35 ? 3 : 2;
  const els = [...INK_ORDER].sort(() => Math.random() - 0.5);
  const out: RoomDef[] = [];
  // 싸우지 않는 방(샘, 문방)은 문 하나에만, 바로 앞 방과 같은 종류는 피한다. 장의 첫 방은 싸움으로 연다
  let calmUsed = cleared.kind === 'spring' || cleared.kind === 'shop' || cleared.kind === 'rest';
  for (let i = 0; i < n; i++) {
    let kind: RoomKind = 'battle';
    const r = Math.random();
    if (depth === ch.rooms - 2 && i === 0) kind = 'elite';
    else if (r < 0.26 && depth > 0) kind = 'hold';
    else if (r < 0.52 && !calmUsed) {
      kind = Math.random() < 0.5 ? 'spring' : 'shop';
      calmUsed = true;
    }
    out.push({ kind, el: kind === 'spring' || kind === 'shop' ? null : els[i], chapter, depth, seed: randomSeed() });
  }
  return out.sort(() => Math.random() - 0.5);
}

/** 문이 담장 위에 놓이는 가로 자리 */
export function gateXs(n: number): number[] {
  const gap = n === 3 ? 380 : 460;
  return Array.from({ length: n }, (_, i) => WORLD_W / 2 + (i - (n - 1) / 2) * gap);
}
