/** 먹귀(墨鬼) — 먹에서 태어난 요괴들. */
import { clamp, rand } from '../core/math';
import { randomSeed } from '../core/rng';
import type { InkId } from '../ink';
import type { Game } from './game';
import { makeBossState } from './boss';
import { makeImugiState } from './imugi';
import { makePhoenixState } from './phoenix';
import { WALL_TOP } from './rooms';
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
  carp: { name: '먹잉어', r: 14, hp: 26, speed: 105, dmg: 10, mass: 1.2, dropChance: 0.4, dropAmount: 4 },
  turtle: { name: '먹거북', r: 21, hp: 70, speed: 42, dmg: 12, mass: 3.4, dropChance: 0.75, dropAmount: 6 },
  fox: { name: '먹여우', r: 14, hp: 30, speed: 132, dmg: 10, mass: 1.1, dropChance: 0.45, dropAmount: 5 },
  lion: { name: '돌사자', r: 22, hp: 84, speed: 40, dmg: 15, mass: 5, dropChance: 0.85, dropAmount: 7 },
  tiger: { name: '묵호', r: 40, hp: 1800, speed: 112, dmg: 14, mass: 14, dropChance: 1, dropAmount: 24 },
  imugi: { name: '이무기', r: 36, hp: 2400, speed: 150, dmg: 16, mass: 20, dropChance: 1, dropAmount: 24 },
  phoenix: { name: '봉황', r: 38, hp: 3000, speed: 160, dmg: 16, mass: 18, dropChance: 1, dropAmount: 24 },
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
    loot: 0,
    ox: x,
    oy: y,
    z: 0,
    side: 1,
    turnT: 0,
    carry: null,
    boss: kind === 'tiger' ? makeBossState() : kind === 'imugi' ? makeImugiState() : kind === 'phoenix' ? makePhoenixState() : null,
  };
}

const SWALLOW_WINDUP = 0.42;
const CARP_RISE = 0.45;
const CARP_LEAP = 0.52;
const CARP_FLOP = 1.1;
const TURTLE_TUCK = 0.5;
const TURTLE_SPIN = 1.15;
const TURTLE_SPIN_SPEED = 330;
const TURTLE_DIZZY = 1.5;

/** 먹잉어 — 먹 속에 잠겨 헤엄치다(붓이 닿지 않는다) 솟아올라 붓잡이에게 뛰어든다. 떨어진 뒤엔 잠시 퍼덕인다 */
export const carpSubmerged = (e: Enemy): boolean => e.kind === 'carp' && e.ai === 0;

/** 먹거북이 등딱지로 막고 있는지 — 몸을 숨기고 도는 중이면 어디서 쳐도 막는다 */
export function turtleBlocks(e: Enemy, kx: number, ky: number): boolean {
  if (e.kind !== 'turtle') return false;
  if (e.ai === 1 || e.ai === 2) return true;
  if (e.ai === 3) return false;
  // 앞에서(바라보는 쪽에서) 친 것만 막는다 — 밀려나는 방향이 등 쪽이면 앞에서 맞은 것
  return kx * e.side < 0 && Math.abs(kx) > Math.abs(ky) * 0.5;
}
/**
 * 먹여우 — 둘레를 맴돌다 먹 연기로 사라져 붓잡이의 등 뒤(붓이 겨눈 반대쪽)에 나타나 문다.
 * 0 맴돌기 → 1 사라짐(붓이 닿지 않는다) → 2 나타남(웅크려 노린다, 붉은 줄) → 3 물기 → 4 숨 고르기
 * 물리면 젖은 먹을 빼앗기고, 여우는 5 달아난다. 쓰러뜨리면 빼앗긴 먹을 되찾는다.
 */
export const FOX_VANISH = 0.3;
export const FOX_APPEAR = 0.5;
const FOX_BITE = 0.2;
const FOX_BITE_SPEED = 540;
/** 붓잡이 등 뒤 어디쯤에 나타나는지 */
const FOX_BEHIND = 78;
export const foxHidden = (e: Enemy): boolean => e.kind === 'fox' && e.ai === 1;

/**
 * 돌사자 — 돌로 굳어 있는 동안은 붓이 통하지 않는다(石).
 * 0 돌 → 1 깨어남 → 2 겨눔(붉은 줄) → 3 내닫기 → 담·바위·종에 부딪히면 4 금이 간다(크게 들어간다)
 * 부딪히지 않고 멈추면 5 다시 굳는다. 종소리를 맞아도 금이 간다.
 */
export const LION_WAKE = 0.6;
export const LION_AIM = 0.75;
const LION_WAKE_R = 300;
const LION_CHARGE_SPEED = 560;
const LION_CHARGE_TIME = 0.95;
export const LION_CRACKED = 2.3;
export const LION_SETTLE = 0.45;
export const lionStone = (e: Enemy): boolean => e.kind === 'lion' && e.ai === 0;
export const lionCracked = (e: Enemy): boolean => e.kind === 'lion' && e.ai === 4;

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
    case 'tiger':
    case 'imugi':
    case 'phoenix':
      // 주인들은 boss.ts, imugi.ts, phoenix.ts가 움직인다
      break;
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
    case 'carp': {
      if (e.ai === 0) {
        // 먹 속을 비스듬히 헤엄쳐 다가온다
        const side = e.seed % 2 ? 1 : -1;
        const curl = d > 260 ? 0.35 : 0.8;
        const sp = spd * g.waterMul(e.x, e.y, true);
        e.vx = (ux * (1 - curl) - uy * curl * side) * sp + ux * sp * 0.5;
        e.vy = (uy * (1 - curl) + ux * curl * side) * sp + uy * sp * 0.5;
        if (d < 230 && e.aiT <= 0 && !held) {
          e.ai = 1;
          e.aiT = CARP_RISE;
          // 뛰어들 자리 — 붓잡이가 가는 쪽을 조금 앞질러
          const t = g.freeSpot(p.x + p.vx * 0.25, p.y + p.vy * 0.25, e.r);
          e.tx = t.x;
          e.ty = t.y;
          g.carpSurface(e);
        }
      } else if (e.ai === 1) {
        e.vx *= 0.7;
        e.vy *= 0.7;
        if (e.aiT <= 0) {
          e.ai = 2;
          e.aiT = CARP_LEAP;
          e.ox = e.x;
          e.oy = e.y;
        }
      } else if (e.ai === 2) {
        const k = clamp(1 - e.aiT / CARP_LEAP, 0, 1);
        e.vx = 0;
        e.vy = 0;
        e.x = e.ox + (e.tx - e.ox) * k;
        e.y = e.oy + (e.ty - e.oy) * k;
        e.z = Math.sin(Math.PI * k) * (40 + Math.hypot(e.tx - e.ox, e.ty - e.oy) * 0.18);
        if (e.aiT <= 0) {
          e.z = 0;
          e.ai = 3;
          e.aiT = CARP_FLOP;
          g.carpLand(e);
        }
      } else {
        // 퍼덕인다 — 이때가 틈이다
        e.vx *= 0.8;
        e.vy *= 0.8;
        if (e.aiT <= 0) {
          e.ai = 0;
          e.aiT = rand(1.4, 2.4);
          g.carpDive(e);
        }
      }
      if (Math.abs(e.vx) > 5) e.side = e.vx > 0 ? 1 : -1;
      if (e.ai === 1 || e.ai === 2) e.side = e.tx >= e.x ? 1 : -1;
      break;
    }
    case 'turtle': {
      if (e.ai === 0) {
        // 느릿느릿 다가오며, 붓잡이가 등 뒤로 돌면 한참 뒤에야 돌아선다
        const want: 1 | -1 = dx >= 0 ? 1 : -1;
        if (want !== e.side) {
          e.turnT += dt;
          if (e.turnT > 0.75) {
            e.side = want;
            e.turnT = 0;
          }
        } else e.turnT = 0;
        const sp = spd * g.waterMul(e.x, e.y, false);
        e.vx = ux * sp * (e.turnT > 0 ? 0.3 : 1);
        e.vy = uy * sp * (e.turnT > 0 ? 0.3 : 1);
        if (e.aiT <= 0 && d < 400 && !held) {
          e.ai = 1;
          e.aiT = TURTLE_TUCK;
        }
      } else if (e.ai === 1) {
        // 등딱지 속으로 숨는다
        e.vx *= 0.7;
        e.vy *= 0.7;
        e.tx = ux;
        e.ty = uy;
        if (e.aiT <= 0) {
          e.ai = 2;
          e.aiT = TURTLE_SPIN;
          e.charge = 0;
          g.sounds.push({ type: 'dash' });
        }
      } else if (e.ai === 2) {
        // 팽이처럼 돌며 미끄러진다 — 담이나 바위에 맞으면 튕긴다
        const s = held ? 0 : TURTLE_SPIN_SPEED * slow;
        e.vx = e.tx * s;
        e.vy = e.ty * s;
        const nx = e.x + e.vx * dt;
        const ny = e.y + e.vy * dt;
        if (nx < 70 || nx > 1530) e.tx = -e.tx;
        if (ny < 200 || ny > 940) e.ty = -e.ty;
        if (g.insideObstacle(nx, ny, e.r * 0.6)) {
          e.tx = -e.tx;
          e.ty = -e.ty;
        }
        if (e.aiT <= 0) {
          e.ai = 3;
          e.aiT = TURTLE_DIZZY;
          g.addRing('crack', e.x, e.y, 6, 30, 0.4, 2, e.el === 'baek' ? [120, 116, 108] : [60, 56, 50]);
        }
      } else {
        // 뒤집혀 버둥거린다 — 어디서 쳐도 들어간다
        e.vx *= 0.75;
        e.vy *= 0.75;
        if (e.aiT <= 0) {
          e.ai = 0;
          e.aiT = rand(3.2, 4.6);
        }
      }
      break;
    }
    case 'fox':
      thinkFox(g, e, d, ux, uy, spd, held);
      break;
    case 'lion':
      thinkLion(g, e, dt, d, held);
      break;
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

function thinkFox(g: Game, e: Enemy, d: number, ux: number, uy: number, spd: number, held: boolean): void {
  const p = g.player;
  switch (e.ai) {
    case 0: {
      // 붓잡이와 한 뼘 떨어져 비스듬히 맴돈다
      const side = e.seed % 2 ? 1 : -1;
      const want = d > 260 ? 1 : d < 190 ? -0.6 : 0;
      e.vx = (ux * want - uy * side * 0.85) * spd;
      e.vy = (uy * want + ux * side * 0.85) * spd;
      if (Math.abs(e.vx) > 5) e.side = e.vx > 0 ? 1 : -1;
      if (e.aiT <= 0 && d < 480 && !held) {
        e.ai = 1;
        e.aiT = FOX_VANISH;
        g.foxVanish(e);
      }
      break;
    }
    case 1: {
      e.vx = 0;
      e.vy = 0;
      if (e.aiT <= 0) {
        // 붓이 겨눈 반대쪽, 등 뒤에 나타난다
        const a = p.aim + Math.PI + rand(-0.55, 0.55);
        const at = g.freeSpot(p.x + Math.cos(a) * FOX_BEHIND, p.y + Math.sin(a) * FOX_BEHIND * 0.8, e.r);
        e.x = at.x;
        e.y = at.y;
        e.kx = 0;
        e.ky = 0;
        e.ai = 2;
        e.aiT = FOX_APPEAR;
        e.side = p.x >= e.x ? 1 : -1;
        g.foxAppear(e);
      }
      break;
    }
    case 2: {
      // 웅크려 노린다 — 처음엔 붓잡이를 따라 겨누다 굳힌다
      e.vx *= 0.6;
      e.vy *= 0.6;
      if (e.aiT > FOX_APPEAR * 0.3) {
        e.tx = ux;
        e.ty = uy;
        e.side = ux >= 0 ? 1 : -1;
      }
      if (e.aiT <= 0) {
        e.ai = 3;
        e.aiT = FOX_BITE;
        g.sounds.push({ type: 'claw' });
      }
      break;
    }
    case 3: {
      const s = held ? 0 : FOX_BITE_SPEED;
      e.vx = e.tx * s;
      e.vy = e.ty * s;
      if (e.aiT <= 0) {
        e.ai = 4;
        e.aiT = 0.65;
      }
      break;
    }
    case 4: {
      e.vx *= 0.85;
      e.vy *= 0.85;
      if (e.aiT <= 0) {
        e.ai = 0;
        e.aiT = rand(1.8, 3.0);
      }
      break;
    }
    default: {
      // 먹을 물고 달아난다
      e.vx = -ux * spd * 1.35;
      e.vy = -uy * spd * 1.35;
      if (Math.abs(e.vx) > 5) e.side = e.vx > 0 ? 1 : -1;
      if (e.aiT <= 0) {
        e.ai = 0;
        e.aiT = rand(1.4, 2.4);
      }
    }
  }
}

function thinkLion(g: Game, e: Enemy, dt: number, d: number, held: boolean): void {
  const p = g.player;
  // 돌로 굳은 동안은 밀리지 않는다
  e.mass = e.ai === 0 ? 60 : 5;
  switch (e.ai) {
    case 0: {
      e.vx = 0;
      e.vy = 0;
      e.kx = 0;
      e.ky = 0;
      e.charge = 0;
      e.turnT += dt;
      // 붓잡이가 다가오거나, 너무 오래 굳어 있었으면 깨어난다
      if (e.aiT <= 0 && !held && (d < LION_WAKE_R || (e.turnT > 6 && d < 720))) {
        e.ai = 1;
        e.aiT = LION_WAKE;
        e.turnT = 0;
        g.lionWake(e);
      }
      break;
    }
    case 1: {
      e.vx = 0;
      e.vy = 0;
      e.charge = clamp(1 - e.aiT / LION_WAKE, 0, 1);
      if (e.aiT <= 0) {
        e.ai = 2;
        e.aiT = LION_AIM;
      }
      break;
    }
    case 2: {
      e.vx = 0;
      e.vy = 0;
      e.charge = 1;
      // 붓잡이를 따라 겨누다 굳힌다
      if (e.aiT > LION_AIM * 0.28) {
        e.face = Math.atan2(p.y - e.y, p.x - e.x);
        e.side = Math.cos(e.face) >= 0 ? 1 : -1;
      }
      if (e.aiT <= 0) {
        e.ai = 3;
        e.aiT = LION_CHARGE_TIME;
        g.sounds.push({ type: 'dash' });
      }
      break;
    }
    case 3: {
      const s = held ? 0 : LION_CHARGE_SPEED;
      e.vx = Math.cos(e.face) * s;
      e.vy = Math.sin(e.face) * s;
      const nx = e.x + e.vx * dt * 1.5;
      const ny = e.y + e.vy * dt * 1.5;
      // 담이나 바위, 종각에 머리를 박는다
      const wall = nx < WALL + e.r || nx > WORLD_W - WALL - e.r || ny < WALL_TOP + e.r * 0.5 || ny > WORLD_H - WALL - e.r * 0.5;
      if (wall || g.insideObstacle(nx, ny, e.r * 0.7)) {
        g.lionCrash(e, nx, ny);
        break;
      }
      if (e.aiT <= 0) {
        e.ai = 5;
        e.aiT = LION_SETTLE;
      }
      break;
    }
    case 4: {
      // 금이 가 휘청인다 — 크게 들어간다
      e.vx *= 0.8;
      e.vy *= 0.8;
      e.charge = 0;
      if (e.aiT <= 0) {
        e.ai = 0;
        e.aiT = 1.2;
        g.lionSettle(e);
      }
      break;
    }
    default: {
      e.vx *= 0.75;
      e.vy *= 0.75;
      e.charge = Math.max(0, e.aiT / LION_SETTLE);
      if (e.aiT <= 0) {
        e.ai = 0;
        e.aiT = rand(1.2, 2.0);
        g.lionSettle(e);
      }
    }
  }
}
