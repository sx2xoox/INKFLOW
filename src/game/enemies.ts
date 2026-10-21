/** 먹귀(墨鬼) — 먹에서 태어난 요괴들. */
import { clamp, rand } from '../core/math';
import { randomSeed } from '../core/rng';
import type { InkId } from '../ink';
import type { Game } from './game';
import { type Enemy, type EnemyKind, WALL, WORLD_H, WORLD_W } from './types';

export interface EnemyKindDef {
  name: string;
  r: number;
  hp: number;
  speed: number;
  dmg: number;
  mass: number;
  dropChance: number;
  dropAmount: number;
}

export const ENEMY_KINDS: Record<EnemyKind, EnemyKindDef> = {
  drop: { name: '먹방울', r: 13, hp: 20, speed: 82, dmg: 8, mass: 1, dropChance: 0.32, dropAmount: 4 },
  swallow: { name: '먹제비', r: 11, hp: 15, speed: 118, dmg: 9, mass: 0.7, dropChance: 0.35, dropAmount: 4 },
  toad: { name: '먹두꺼비', r: 17, hp: 32, speed: 70, dmg: 7, mass: 1.6, dropChance: 0.5, dropAmount: 5 },
  brute: { name: '묵괴', r: 29, hp: 120, speed: 50, dmg: 16, mass: 4, dropChance: 1, dropAmount: 10 },
};

let nextId = 1;

export function makeEnemy(kind: EnemyKind, el: InkId, x: number, y: number, hpMul: number): Enemy {
  const d = ENEMY_KINDS[kind];
  return {
    id: nextId++,
    kind,
    el,
    x,
    y,
    vx: 0,
    vy: 0,
    kx: 0,
    ky: 0,
    r: d.r,
    hp: d.hp * hpMul,
    maxHp: d.hp * hpMul,
    speed: d.speed * rand(0.9, 1.1),
    dmg: d.dmg,
    mass: d.mass,
    seed: randomSeed() % 100000,
    anim: Math.random() * 10,
    face: 0,
    hitT: 0,
    spawnT: 0.6,
    dead: false,
    burnStacks: 0,
    burnT: 0,
    burnTick: 0,
    burnPower: 0,
    slowT: 0,
    rootT: 0,
    stunT: 0,
    inPool: false,
    ai: 0,
    aiT: rand(0.5, 2),
    tx: 0,
    ty: 0,
    charge: 0,
  };
}

const SWALLOW_WINDUP = 0.42;
const SWALLOW_DASH = 0.5;
const SWALLOW_DASH_SPEED = 440;
const TOAD_CHARGE = 0.55;

/** 이동 의도(vx, vy)를 정한다. 실제 이동과 충돌은 Game이 처리한다. */
export function thinkEnemy(g: Game, e: Enemy, dt: number): void {
  const p = g.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const held = e.rootT > 0 || e.stunT > 0;
  const slow = e.slowT > 0 || e.inPool ? 0.45 : 1;
  const spd = held ? 0 : e.speed * slow;
  e.aiT -= dt;

  switch (e.kind) {
    case 'drop':
    case 'brute': {
      // 살짝 흔들리며 다가온다
      const wob = Math.sin(e.anim * 1.7 + e.seed) * 0.35;
      e.vx = (ux - uy * wob) * spd;
      e.vy = (uy + ux * wob) * spd;
      break;
    }
    case 'swallow': {
      if (e.ai === 0) {
        // 비스듬히 원을 그리며 접근
        const side = e.seed % 2 ? 1 : -1;
        const curl = d > 300 ? 0.55 : 0.9;
        e.vx = (ux * (1 - curl) - uy * curl * side) * spd + ux * spd * 0.6;
        e.vy = (uy * (1 - curl) + ux * curl * side) * spd + uy * spd * 0.6;
        if (d < 270 && e.aiT <= 0 && !held) {
          e.ai = 1;
          e.aiT = SWALLOW_WINDUP;
        }
      } else if (e.ai === 1) {
        e.vx *= 0.8;
        e.vy *= 0.8;
        e.tx = ux;
        e.ty = uy;
        if (e.aiT <= 0) {
          e.ai = 2;
          e.aiT = SWALLOW_DASH;
        }
      } else if (e.ai === 2) {
        const s = held ? 0 : SWALLOW_DASH_SPEED * slow;
        e.vx = e.tx * s;
        e.vy = e.ty * s;
        if (e.aiT <= 0) {
          e.ai = 3;
          e.aiT = 0.7;
        }
      } else {
        e.vx *= 0.9;
        e.vy *= 0.9;
        if (e.aiT <= 0) {
          e.ai = 0;
          e.aiT = rand(0.8, 1.6);
        }
      }
      const sp = Math.hypot(e.vx, e.vy);
      if (sp > 5) e.face = Math.atan2(e.vy, e.vx);
      else e.face = Math.atan2(uy, ux);
      break;
    }
    case 'toad': {
      if (e.ai === 1) {
        // 볼을 부풀리는 중
        e.vx *= 0.8;
        e.vy *= 0.8;
        e.charge = clamp(1 - e.aiT / TOAD_CHARGE, 0, 1);
        if (e.aiT <= 0) {
          if (!held) g.enemySpit(e);
          e.ai = 0;
          e.charge = 0;
          e.aiT = rand(2.0, 3.0);
        }
        break;
      }
      let mx = 0;
      let my = 0;
      if (d < 230) {
        mx = -ux;
        my = -uy;
      } else if (d > 360) {
        mx = ux;
        my = uy;
      } else {
        const side = e.seed % 2 ? 1 : -1;
        mx = -uy * side * 0.7;
        my = ux * side * 0.7;
      }
      // 두꺼비답게 뛰듯이
      const hop = 0.4 + 0.6 * Math.max(0, Math.sin(e.anim * 5));
      e.vx = mx * spd * hop;
      e.vy = my * spd * hop;
      if (e.aiT <= 0 && d < 520 && !held) {
        e.ai = 1;
        e.aiT = TOAD_CHARGE;
      }
      break;
    }
  }
}

/** 화면 밖 그림 가장자리 쪽에서 나타난다. */
export function spawnPoint(px: number, py: number): { x: number; y: number } {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(480, 680);
    const x = px + Math.cos(a) * r;
    const y = py + Math.sin(a) * r;
    if (x > WALL + 30 && x < WORLD_W - WALL - 30 && y > WALL + 30 && y < WORLD_H - WALL - 30) return { x, y };
  }
  return {
    x: clamp(px + rand(-600, 600), WALL + 30, WORLD_W - WALL - 30),
    y: clamp(py + rand(-500, 500), WALL + 30, WORLD_H - WALL - 30),
  };
}
