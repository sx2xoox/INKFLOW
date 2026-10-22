/**
 * 연못의 주인 — 이무기(螭). 용이 되지 못한 큰 뱀.
 * 대부분의 시간을 먹 속에 잠겨 헤엄치고(붓이 닿지 않는다), 솟아오른 동안만 칠 수 있다.
 *  - 물어뜯기: 고개를 젖혔다가 붉은 줄을 따라 내지른다. 사나워지면 두 번 잇는다.
 *  - 먹물 뿜기: 고개를 쳐들고 부채꼴로 먹덩이를 뿜는다. 휘둘러 쳐낼 수 있다.
 *  - 치솟기(기력 2/3 아래): 잠긴 채 붓잡이 발밑을 붉은 원으로 노리다 치솟는다. 치솟은 뒤 몸을 사릴 때가 큰 틈.
 * 기력이 2/3, 1/3로 꺾이면 묵호처럼 포효하며 상생의 차례로 먹을 갈아입고, 새 먹을 이기는 잉어와 거북을 불러낸다.
 * 몸은 머리를 따라가는 마디들이고, 화면은 그 마디를 따라 붓으로 몸을 그린다.
 */
import { type Vec, TAU, clamp, lerp, rand } from '../core/math';
import { randomSeed } from '../core/rng';
import { inkColor } from '../ink';
import { INK } from '../render/color';
import { changeInk, crossed, phaseOf, roar, setMove } from './boss';
import type { Game } from './game';
import { type BossState, type Enemy, WALL, WORLD_H, WORLD_W } from './types';
import { WALL_TOP } from './rooms';

/** 몸의 마디 수와 마디 사이 */
export const SPINE_N = 30;
export const SPINE_SEG = 12;
const SWIM_SPEED = 175;
const TURN = 2.6;
export const BITE_LEN = 300;
const BITE_TIME = 0.32;
export const BURST_R = 92;
/** 못의 한가운데 — 처음 깨어나는 자리 */
const POND = { x: WORLD_W / 2, y: WORLD_H / 2 + 30 };

export function makeImugiState(): BossState {
  const spine: Vec[] = [];
  // 못 바닥에 똬리를 틀고 있다
  for (let i = 0; i < SPINE_N; i++) {
    const a = i * 0.42;
    const r = 30 + i * 4.2;
    spine.push({ x: POND.x + Math.cos(a) * r, y: POND.y + Math.sin(a) * r * 0.6 });
  }
  return {
    species: 'imugi',
    move: 'rise',
    t: 0,
    dur: 2.6,
    phase: 1,
    roared: 1,
    ax: 0,
    ay: 1,
    sx: 0,
    sy: 0,
    tx: POND.x,
    ty: POND.y,
    z: 0,
    hit: false,
    chain: 0,
    wind: 0,
    side: 1,
    pounceCd: 0,
    dashCd: 0,
    blocked: false,
    spine,
    under: 1,
    heading: -Math.PI / 2,
  };
}

/** 마디마다 떠 있는 높이 — 머리를 쳐들면 앞쪽 몸이 함께 들린다 */
export const segZ = (b: BossState, i: number): number => b.z * Math.max(0, 1 - i / 9) * (1 - b.under);

/** 솟아오른 머리와 앞쪽 몸이 맞는 자리 */
export function imugiHitCircles(e: Enemy): { x: number; y: number; r: number }[] {
  const b = e.boss!;
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i <= 18; i += 2) {
    const p = b.spine[i];
    if (!p) break;
    out.push({ x: p.x, y: p.y - 12 - segZ(b, i), r: 30 - i * 0.7 });
  }
  return out;
}

/** 머리를 옮기면 몸이 차례로 따라온다 */
function follow(b: BossState, x: number, y: number): void {
  const s = b.spine;
  s[0] = { x, y };
  for (let i = 1; i < s.length; i++) {
    const p = s[i - 1];
    const q = s[i];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > SPINE_SEG) {
      q.x = p.x + (dx / d) * SPINE_SEG;
      q.y = p.y + (dy / d) * SPINE_SEG;
    }
  }
}

const inRoom = (x: number, y: number): Vec => ({
  x: clamp(x, WALL + 50, WORLD_W - WALL - 50),
  y: clamp(y, WALL_TOP + 40, WORLD_H - WALL - 30),
});

/** 머리를 목표 쪽으로 천천히 틀며 나아간다 */
function steer(e: Enemy, tx: number, ty: number, speed: number, dt: number): void {
  const b = e.boss!;
  const want = Math.atan2(ty - e.y, tx - e.x);
  let da = want - b.heading;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  b.heading += clamp(da, -TURN * dt, TURN * dt);
  const p = inRoom(e.x + Math.cos(b.heading) * speed * dt, e.y + Math.sin(b.heading) * speed * dt);
  e.x = p.x;
  e.y = p.y;
}

export function updateImugi(g: Game, e: Enemy, dt: number): void {
  const b = e.boss!;
  const pl = g.player;
  e.stunT = Math.min(e.stunT, 0.5);
  e.rootT = Math.min(e.rootT, 0.7);
  e.burnStacks = Math.min(e.burnStacks, 3);
  const held = e.stunT > 0 || e.rootT > 0;
  const rate = b.move === 'die' ? 1 : held ? 0.45 : e.slowT > 0 || e.inPool ? 0.72 : 1;
  const step = dt * rate;
  const prev = b.t;
  b.t += step;
  e.vx = 0;
  e.vy = 0;
  const dx = pl.x - e.x;
  const dy = pl.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const fierce = 1 + 0.12 * (b.phase - 1);

  const ph = phaseOf(e);
  if (ph > b.phase) b.phase = ph;
  const busy = b.move === 'rise' || b.move === 'roar' || b.move === 'die' || b.move === 'burst' || (b.move === 'bite' && b.t >= b.wind);
  if (b.phase > b.roared && !busy) {
    b.roared++;
    setMove(b, 'roar', 1.8);
  }

  const toward = (v: number, target: number, k: number): number => v + (target - v) * Math.min(1, k * dt);

  switch (b.move) {
    case 'rise': {
      // 못이 끓어오르다가 머리가 솟는다
      e.x = POND.x;
      e.y = POND.y;
      if (Math.floor(prev / 0.18) !== Math.floor(b.t / 0.18) && b.t < 1.2) {
        const a = Math.random() * TAU;
        const r = rand(10, 90);
        g.addRing('spawn', POND.x + Math.cos(a) * r, POND.y + Math.sin(a) * r * 0.55, 4, rand(16, 30), 0.5, 2, inkColor(e.el));
      }
      if (b.t > 1.0) {
        b.under = toward(b.under, 0, 5);
        b.z = toward(b.z, 95, 4);
        b.heading = toward(b.heading, Math.atan2(dy, dx), 2);
      }
      if (crossed(b, prev, 1.0)) {
        g.sounds.push({ type: 'explode' });
        g.splash(POND.x, POND.y - 10, 40, inkColor(e.el), 18);
        g.shake = Math.max(g.shake, 10);
      }
      if (crossed(b, prev, 1.5)) roar(g, e, { title: '이무기', sub: '螭 · 연못의 주인이 깨어난다', t: 0, dur: 2.8, color: INK, low: true }, e.y - 100);
      if (b.t >= b.dur) setMove(b, 'sink', 0.45);
      break;
    }
    case 'swim': {
      // 붓잡이 둘레를 돌며 다가온다 — 잠긴 동안은 붓이 닿지 않는다
      b.under = toward(b.under, 1, 6);
      b.z = toward(b.z, 0, 6);
      const around = Math.atan2(e.y - pl.y, e.x - pl.x) + b.side * 0.9;
      const goal = inRoom(pl.x + Math.cos(around) * 250, pl.y + Math.sin(around) * 170);
      steer(e, goal.x, goal.y, SWIM_SPEED * fierce * rate, dt);
      // 지나가는 자리에 물결이 인다
      if (Math.floor(prev / 0.22) !== Math.floor(b.t / 0.22)) g.addRing('spawn', e.x, e.y, 6, 22, 0.5, 2, inkColor(e.el));
      if (b.t >= b.dur) {
        if (b.phase >= 2 && Math.random() < 0.45) {
          setMove(b, 'burrow', b.phase === 3 ? 1.25 : 1.45);
        } else {
          setMove(b, 'surface', 0.5);
          g.splash(e.x, e.y - 6, 22, inkColor(e.el), 10);
          g.sounds.push({ type: 'spit' });
        }
      }
      break;
    }
    case 'surface': {
      b.under = toward(b.under, 0, 7);
      b.z = toward(b.z, 40, 6);
      b.heading = toward(b.heading, Math.atan2(dy, dx), 4);
      b.ax = dx / d;
      b.ay = dy / d;
      if (b.t >= b.dur) {
        if (d < 360 && Math.random() < 0.6) startBite(b, true);
        else startSpit(b, true);
      }
      break;
    }
    case 'bite': {
      const lungeEnd = b.wind + BITE_TIME;
      if (b.t < b.wind) {
        // 고개를 젖힌다 — 처음엔 붓잡이를 따라 겨누다 굳힌다
        if (b.t < b.wind * 0.7) {
          b.ax = dx / d;
          b.ay = dy / d;
        }
        b.heading = Math.atan2(b.ay, b.ax);
        b.z = toward(b.z, 58, 5);
        const back = inRoom(e.x - b.ax * 50 * step, e.y - b.ay * 50 * step);
        e.x = back.x;
        e.y = back.y;
      } else if (b.t < lungeEnd) {
        if (crossed(b, prev, b.wind)) {
          b.sx = e.x;
          b.sy = e.y;
          const end = inRoom(e.x + b.ax * BITE_LEN, e.y + b.ay * BITE_LEN);
          b.tx = end.x;
          b.ty = end.y;
          g.sounds.push({ type: 'claw' });
        }
        const k = clamp((b.t - b.wind) / BITE_TIME, 0, 1);
        e.x = lerp(b.sx, b.tx, k);
        e.y = lerp(b.sy, b.ty, k);
        b.z = 22;
        if (!b.hit && Math.hypot(pl.x - e.x, pl.y - e.y) < 36 + pl.r) {
          b.hit = true;
          if (g.hurtPlayer(16, e.el)) g.knockPlayer(b.ax, b.ay, 480);
        }
      } else {
        b.z = toward(b.z, 32, 3);
      }
      if (b.t >= b.dur) {
        b.chain--;
        if (b.chain > 0) startBite(b, false);
        else setMove(b, 'sink', 0.45);
      }
      break;
    }
    case 'spit': {
      if (b.t < b.wind) {
        b.ax = dx / d;
        b.ay = dy / d;
        b.heading = toward(b.heading, Math.atan2(dy, dx), 6);
        b.z = toward(b.z, 86, 4);
      }
      if (crossed(b, prev, b.wind)) spitFan(g, e);
      if (b.t >= b.dur) {
        b.chain--;
        if (b.chain > 0) startSpit(b, false);
        else setMove(b, 'sink', 0.45);
      }
      break;
    }
    case 'sink': {
      b.under = toward(b.under, 1, 6);
      b.z = toward(b.z, 0, 6);
      if (b.t >= b.dur) {
        b.side = Math.random() < 0.5 ? 1 : -1;
        setMove(b, 'swim', rand(1.3, 2.1) * [1, 0.85, 0.7][b.phase - 1]);
      }
      break;
    }
    case 'burrow': {
      // 노리는 자리는 따라오다 굳는다. 머리는 그 아래로 숨어 든다
      b.under = toward(b.under, 1, 6);
      if (b.t < b.dur * 0.7) {
        const p = g.freeSpot(pl.x + pl.vx * 0.15, pl.y + pl.vy * 0.15, 20);
        b.tx = p.x;
        b.ty = p.y;
      }
      steer(e, b.tx, b.ty, 280 * rate, dt);
      if (b.t >= b.dur) {
        e.x = b.tx;
        e.y = b.ty;
        setMove(b, 'burst', 0.62);
        b.under = 0;
        b.z = 0;
      }
      break;
    }
    case 'burst': {
      // 땅을 뚫고 치솟는다
      b.z = b.t < 0.22 ? lerp(0, 120, b.t / 0.22) : toward(b.z, 50, 4);
      if (crossed(b, prev, 0.08)) burst(g, e);
      if (b.t >= b.dur) setMove(b, 'coil', [1.4, 1.2, 1.0][b.phase - 1]);
      break;
    }
    case 'coil': {
      // 치솟은 뒤 몸을 사린다 — 가장 큰 틈
      b.z = toward(b.z, 28 + Math.sin(b.t * 3) * 4, 4);
      b.heading = toward(b.heading, Math.atan2(dy, dx), 1.5);
      if (b.t >= b.dur) setMove(b, 'sink', 0.5);
      break;
    }
    case 'roar': {
      b.under = toward(b.under, 0, 6);
      b.z = toward(b.z, 90, 4);
      b.heading = toward(b.heading, Math.atan2(dy, dx), 3);
      if (crossed(b, prev, 0.3)) roar(g, e, null, e.y - 100);
      if (crossed(b, prev, 0.55)) {
        changeInk(g, e, '이무기', (i) => (i % 3 === 2 ? 'turtle' : 'carp'));
        g.addRing('enso', e.x, e.y - 60, 60, 420, 1.1, 7, inkColor(e.el));
      }
      if (b.t >= b.dur) setMove(b, 'sink', 0.45);
      break;
    }
    case 'die': {
      b.under = toward(b.under, 0, 4);
      b.z = 40 + Math.sin(b.t * 9) * 18 * (1 - b.t / b.dur);
      if (Math.floor(prev / 0.18) !== Math.floor(b.t / 0.18)) {
        const p = b.spine[Math.floor(Math.random() * b.spine.length)];
        const col = inkColor(e.el);
        g.addRing('burst', p.x, p.y - 20, 8, rand(40, 70), 0.4, 8, col);
        g.splash(p.x, p.y - 20, rand(14, 24), col, 8);
        g.sounds.push({ type: 'hit', strong: true, crit: false });
        g.shake = Math.max(g.shake, 5);
      }
      if (b.t >= b.dur) g.finishBoss(e);
      break;
    }
    default:
      setMove(b, 'swim', 1);
  }

  follow(b, e.x, e.y);
  e.face = b.heading;
}

function startBite(b: BossState, first: boolean): void {
  if (first) b.chain = b.phase >= 2 ? 2 : 1;
  b.wind = first ? (b.phase === 3 ? 0.5 : 0.62) : 0.42;
  setMove(b, 'bite', b.wind + BITE_TIME + (b.phase === 3 ? 0.55 : 0.75));
}

function startSpit(b: BossState, first: boolean): void {
  if (first) b.chain = b.phase === 3 ? 2 : 1;
  b.wind = first ? 0.62 : 0.45;
  setMove(b, 'spit', b.wind + 0.6);
}

/** 먹물 부채 — 사나워질수록 갈래가 늘어난다 */
export const spitCount = (b: BossState): number => [3, 5, 7][b.phase - 1];
export const SPIT_SPREAD = 0.95;

function spitFan(g: Game, e: Enemy): void {
  const b = e.boss!;
  const n = spitCount(b);
  const base = Math.atan2(b.ay, b.ax);
  const hy = e.y - 12 - b.z;
  g.sounds.push({ type: 'spit' });
  g.sounds.push({ type: 'roar', big: false });
  for (let i = 0; i < n; i++) {
    const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * SPIT_SPREAD);
    const sp = 240;
    g.fireProjectile('glob', e.x + Math.cos(a) * 24, hy + Math.sin(a) * 24, Math.cos(a) * sp, Math.sin(a) * sp, { r: 9, life: 2.8, dmg: 9, knock: 0, ink: e.el, potency: 0, hostile: true });
  }
  g.splash(e.x, hy, 12, inkColor(e.el), 6);
}

/** 치솟는 순간 — 둘레를 친다 */
function burst(g: Game, e: Enemy): void {
  const pl = g.player;
  const col = inkColor(e.el);
  g.sounds.push({ type: 'quake' });
  g.shake = Math.max(g.shake, 13);
  g.hitstop = Math.max(g.hitstop, 0.05);
  g.addRing('shock', e.x, e.y, 26, BURST_R * 1.3, 0.55, 9, col);
  g.addRing('crack', e.x, e.y, 14, BURST_R * 0.9, 0.9, 4, INK);
  g.stamps.push({ kind: 'splat', x: e.x, y: e.y + 4, r: 60, color: col, alpha: 0.34, seed: randomSeed() % 100000, rot: Math.random() * TAU, wet: 1 });
  g.splash(e.x, e.y - 30, 34, col, 16);
  const dx = pl.x - e.x;
  const dy = (pl.y - e.y) / 0.7;
  const dd = Math.hypot(dx, dy);
  if (dd < BURST_R + pl.r && g.hurtPlayer(18, e.el)) g.knockPlayer(dx / (dd || 1), dy / (dd || 1), 520);
}
