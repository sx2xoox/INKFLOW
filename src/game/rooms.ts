/**
 * 탐험 — 한 판은 병풍 한 틀, 방 하나는 그림 한 폭이다.
 * 방을 다 그려 내면(먹귀를 모두 쓰러뜨리면) 위쪽 담장에 달문(月門)이 그려지고,
 * 문에 적힌 먹 색과 방 종류를 보고 다음 길을 고른다.
 */
import type { Vec } from '../core/math';
import { type Rng, mulberry32, randomSeed } from '../core/rng';
import { INK_ORDER, type InkId } from '../ink';
import { type EnemyKind, WALL, WORLD_H, WORLD_W } from './types';

export type RoomKind = 'battle' | 'hold' | 'elite' | 'spring';

export interface RoomDef {
  kind: RoomKind;
  /** 방을 채운 먹귀의 속성 (샘은 없음) */
  el: InkId | null;
  /** 장 안에서 몇 번째 방인지 (0부터) */
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
  hold: { name: '버티기', hanja: '守', desc: '몰려드는 먹귀를 끝까지 견딘다' },
  elite: { name: '정예', hanja: '將', desc: '묵괴가 지키는 방' },
  spring: { name: '샘', hanja: '泉', desc: '먹을 씻고 기력을 되찾는다' },
};

export const CHAPTER = {
  name: '대숲',
  hanja: '竹',
  /** 이 장의 방 개수 — 마지막 방은 정예 */
  rooms: 4,
};

/** 위쪽 담장 — 이보다 위로는 문으로만 지나간다 */
export const WALL_TOP = 178;
/** 달문이 서는 높이 */
export const GATE_Y = 116;
export const GATE_R = 46;
/** 방에 들어서는 자리 */
export const ENTRANCE: Vec = { x: WORLD_W / 2, y: WORLD_H - 130 };

export type ObstacleKind = 'rock' | 'bamboo';

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
}

const range = (rng: Rng, a: number, b: number): number => a + rng() * (b - a);

export function makeLayout(def: RoomDef): RoomLayout {
  const rng = mulberry32(def.seed);
  const obstacles: Obstacle[] = [];
  const pond = def.kind === 'spring' ? { x: WORLD_W / 2, y: WORLD_H / 2 + 40, r: 120 } : null;
  const count = def.kind === 'elite' ? 4 : def.kind === 'spring' ? 6 : 5 + Math.floor(rng() * 3);

  for (let tries = 0; obstacles.length < count && tries < 400; tries++) {
    const kind: ObstacleKind = rng() < 0.45 ? 'bamboo' : 'rock';
    const r = kind === 'rock' ? range(rng, 36, 60) : range(rng, 34, 46);
    const x = range(rng, WALL + 90, WORLD_W - WALL - 90);
    const y = range(rng, WALL_TOP + 110, WORLD_H - WALL - 90);
    if (Math.hypot(x - ENTRANCE.x, y - ENTRANCE.y) < 200) continue;
    // 한가운데는 싸울 자리로 비워 둔다
    if (Math.hypot(x - WORLD_W / 2, (y - WORLD_H / 2) * 1.4) < 210) continue;
    if (pond && Math.hypot(x - pond.x, y - pond.y) < pond.r + 170) continue;
    if (obstacles.some((o) => Math.hypot(x - o.x, (y - o.y) / OBSTACLE_SQUASH) < r + o.r + 110)) continue;
    obstacles.push({ kind, x, y, r, seed: Math.floor(rng() * 1e6) });
  }
  return { obstacles, pond };
}

/** 먹귀가 몇 무리로 나뉘어 나타나는지. 앞 무리가 trigger 마리 이하로 줄면 다음 무리가 온다. */
export interface Beat {
  groups: [EnemyKind, number][];
  trigger: number;
}

export function encounter(def: RoomDef): Beat[] {
  const d = def.depth;
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
  return [
    { groups: [['drop', 5], ['toad', 2]], trigger: 0 },
    { groups: [['swallow', 3], ['toad', 1], ['drop', 3]], trigger: 2 },
    { groups: [['brute', 1], ['drop', 4]], trigger: 1 },
  ];
}

/** 버티기 방에서 버텨야 하는 시간 */
export const holdDuration = (def: RoomDef): number => 22 + def.depth * 3;
/** 깊이 들어갈수록 먹귀가 단단해진다 */
export const hpScale = (depth: number): number => 1 + depth * 0.16;

export function firstRoom(): RoomDef {
  return { kind: 'battle', el: INK_ORDER[Math.floor(Math.random() * 5)], depth: 0, seed: randomSeed() };
}

/**
 * 다음 문들. 마지막 방(정예)을 넘기면 빈 배열 — 장이 끝난다.
 * 같은 방 종류에 같은 먹이 겹치지 않게 고른다.
 */
export function nextRooms(cleared: RoomDef): RoomDef[] {
  const depth = cleared.depth + 1;
  if (depth >= CHAPTER.rooms) return [];
  if (depth === CHAPTER.rooms - 1) {
    return [{ kind: 'elite', el: INK_ORDER[Math.floor(Math.random() * 5)], depth, seed: randomSeed() }];
  }
  const n = Math.random() < 0.35 ? 3 : 2;
  const els = [...INK_ORDER].sort(() => Math.random() - 0.5);
  const out: RoomDef[] = [];
  let springUsed = cleared.kind === 'spring';
  for (let i = 0; i < n; i++) {
    let kind: RoomKind = 'battle';
    const r = Math.random();
    if (r < 0.28) kind = 'hold';
    else if (r < 0.5 && !springUsed) {
      kind = 'spring';
      springUsed = true;
    }
    out.push({ kind, el: kind === 'spring' ? null : els[i], depth, seed: randomSeed() });
  }
  return out;
}

/** 문이 담장 위에 놓이는 가로 자리 */
export function gateXs(n: number): number[] {
  const gap = n === 3 ? 380 : 460;
  return Array.from({ length: n }, (_, i) => WORLD_W / 2 + (i - (n - 1) / 2) * gap);
}
