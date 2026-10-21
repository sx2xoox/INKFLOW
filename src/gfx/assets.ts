/** 게임에 쓰는 모든 그림을 아틀라스에 굽는다. */
import { INKS, INK_ORDER, type InkId } from '../ink';
import {
  ENEMY_FRAMES,
  WALK_FRAMES,
  drawBlob,
  drawBrute,
  drawDrop,
  drawGlow,
  drawInkWell,
  drawPickup,
  drawPlayer,
  drawShadow,
  drawSplat,
  drawSwallow,
  drawToad,
  drawWash,
  type SpriteDraw,
} from '../render/sprites';
import type { EnemyKind } from '../game/types';
import { TIGER_FRAMES, type TigerPoseName, drawTiger } from '../render/tiger';
import { Atlas } from './atlas';

export const BLOB_VARIANTS = 6;
export const SPLAT_VARIANTS = 6;
/** 입자용 먹 덩이의 굽는 반지름 */
export const BLOB_R = 12;
export const SPLAT_R = 22;
export const WASH_VARIANTS = 4;
export const WASH_R = 30;

interface EnemyArt {
  draw: SpriteDraw;
  w: number;
  h: number;
  ox: number;
  oy: number;
  /** 한 바퀴 애니메이션에 걸리는 시간 */
  period: number;
}

export const ENEMY_ART: Record<Exclude<EnemyKind, 'tiger'>, EnemyArt> = {
  drop: { draw: drawDrop, w: 46, h: 52, ox: 23, oy: 46, period: 1.1 },
  swallow: { draw: drawSwallow, w: 72, h: 64, ox: 38, oy: 32, period: 0.34 },
  toad: { draw: drawToad, w: 84, h: 62, ox: 42, oy: 52, period: 1.6 },
  brute: { draw: drawBrute, w: 116, h: 120, ox: 58, oy: 110, period: 1.4 },
};

/** 묵호 그림 상자 — 치켜든 앞발과 꼬리까지 들어가게 */
export const TIGER_BOX = { w: 250, h: 188, ox: 124, oy: 176 };
export const tigerFrame = (pose: TigerPoseName, f = 0, white = false): string => `tiger/${white ? 'white/' : ''}${pose}/${f}`;

/**
 * 묵호는 크고 붓질이 많아 따로 굽는다. 시작 화면이 떠 있는 동안 조금씩 굽고,
 * 그 전에 필요해지면 남은 것을 한 번에 굽는다.
 */
export function tigerAtlas(): Atlas {
  const at = new Atlas();
  const B = TIGER_BOX;
  const add = (pose: TigerPoseName, f: number): void => {
    const draw = (c: CanvasRenderingContext2D): void => drawTiger(c, pose, f, 4400);
    at.add(tigerFrame(pose, f), B.w, B.h, B.ox, B.oy, draw);
    at.add(tigerFrame(pose, f, true), B.w, B.h, B.ox, B.oy, draw, 'white');
  };
  for (let f = 0; f < TIGER_FRAMES.walk; f++) add('walk', f);
  for (const n of TIGER_FRAMES.names) add(n, 0);
  return at;
}

export const enemyFrame = (kind: keyof typeof ENEMY_ART, el: InkId, f: number): string => `enemy/${kind}/${el}/${f}`;
export const enemyWhite = (kind: keyof typeof ENEMY_ART, f: number): string => `enemy/${kind}/white/${f}`;

export function buildAtlas(): Atlas {
  const at = new Atlas();
  for (let f = 0; f < WALK_FRAMES; f++) {
    at.add(`player/${f}`, 64, 82, 32, 76, (c) => drawPlayer(c, f));
    at.add(`player/white/${f}`, 64, 82, 32, 76, (c) => drawPlayer(c, f), 'white');
  }
  for (const kind of Object.keys(ENEMY_ART) as (keyof typeof ENEMY_ART)[]) {
    const art = ENEMY_ART[kind];
    for (let f = 0; f < ENEMY_FRAMES; f++) {
      for (const el of INK_ORDER) {
        const d = INKS[el];
        at.add(enemyFrame(kind, el, f), art.w, art.h, art.ox, art.oy, (c) => art.draw(c, f, d.color, d.edge, 100 + f));
      }
      at.add(enemyWhite(kind, f), art.w, art.h, art.ox, art.oy, (c) => art.draw(c, f, INKS.heuk.color, INKS.heuk.edge, 100 + f), 'white');
    }
  }
  for (const el of INK_ORDER) {
    const d = INKS[el];
    at.add(`pickup/${el}`, 22, 26, 11, 22, (c) => drawPickup(c, d.color, d.edge));
  }
  for (let i = 0; i < BLOB_VARIANTS; i++) {
    const s = BLOB_R * 1.6;
    at.add(`blob/${i}`, s * 2, s * 2, s, s, (c) => drawBlob(c, BLOB_R, 300 + i * 17));
  }
  for (let i = 0; i < SPLAT_VARIANTS; i++) {
    const s = SPLAT_R * 2.9;
    at.add(`splat/${i}`, s * 2, s * 2, s, s, (c) => drawSplat(c, SPLAT_R, 500 + i * 31));
  }
  for (let i = 0; i < WASH_VARIANTS; i++) {
    const s = WASH_R * 1.25;
    at.add(`wash/${i}`, s * 2, s * 2, s, s, (c) => drawWash(c, WASH_R, 700 + i * 13));
  }
  at.add('shadow', 66, 26, 33, 13, (c) => drawShadow(c, 31, 11));
  at.add('glow', 100, 100, 50, 50, (c) => drawGlow(c, 48));
  at.add('well', 66, 66, 33, 33, (c) => drawInkWell(c, 28));
  at.build();
  return at;
}
