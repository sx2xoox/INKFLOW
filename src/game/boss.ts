/**
 * 대숲의 주인 — 묵호(墨虎).
 * 담장 위에서 내려다보다 뛰어내려 포효하고, 앞발 할퀴기·덮치기·내달리기로 싸운다.
 * 기력이 2/3, 1/3로 줄 때마다 다시 포효하며 상생의 차례(木→火→土→金→水)로 먹을 갈아입고,
 * 새 먹을 이기는 먹귀들을 불러낸다. 불려 온 먹귀는 반드시 제 먹을 떨군다 — 주워서 먹을 바꾸라는 뜻이다.
 * 모든 공격은 바닥에 붉은 붓선으로 먼저 그려 보인다.
 */
import { TAU, clamp, easeInOutSine, lerp, rand } from '../core/math';
import { randomSeed } from '../core/rng';
import { GENERATES, INKS, counterOf, inkColor } from '../ink';
import { DAMMUK, INK } from '../render/color';
import type { Game } from './game';
import { hpScale } from './rooms';
import { type Banner, type BossMove, type BossState, type Enemy, type EnemyKind, type Trace, WALL, WORLD_H, WORLD_W } from './types';

/** 할퀴기가 닿는 거리(몸 가운데부터)와 반각 */
export const SWIPE_REACH = 128;
export const SWIPE_HALF = 1.1;
/** 덮치기가 떨어지는 자리의 둘레 */
export const LAND_R = 104;
const DASH_SPEED = 780;
const DASH_MAX = 620;
/** 이 높이보다 뜨면 붓이 닿지 않는다 */
const AIR = 22;
/** 바닥에 닿은 몸의 가로·세로 반지름 — 붓잡이를 밀어낸다 */
export const TIGER_BODY = { rx: 78, ry: 26 };
/** 담장 기와 위에 앉은 자리 */
export const PERCH_Y = 64;

export function makeBossState(): BossState {
  return {
    species: 'tiger',
    move: 'perch',
    t: 0,
    dur: 1.5,
    phase: 1,
    roared: 0,
    ax: 0,
    ay: 1,
    sx: 0,
    sy: 0,
    tx: 0,
    ty: 0,
    z: 0,
    hit: false,
    chain: 0,
    wind: 0,
    side: 1,
    pounceCd: 1.5,
    dashCd: 2,
    blocked: false,
    spine: [],
    under: 0,
    heading: 0,
  };
}

/** 붓이 닿지 않는 때 — 담장 위, 뛰어내리는 중, 쓰러지는 중, 높이 뜬 때. 이무기는 먹 속에 잠겼을 때 */
export function untouchable(e: Enemy): boolean {
  const b = e.boss;
  if (!b) return false;
  if (b.species === 'imugi') return b.move === 'die' || b.move === 'rise' || b.under > 0.5;
  return b.move === 'perch' || b.move === 'descend' || b.move === 'die' || b.z > AIR;
}

/** 몸이 길어서 판정 원을 셋 둔다: 가슴, 엉덩이, 머리 */
export function tigerHitCircles(e: Enemy): { x: number; y: number; r: number }[] {
  const f = Math.cos(e.face) >= 0 ? 1 : -1;
  const z = e.boss?.z ?? 0;
  return [
    { x: e.x, y: e.y - 30 - z, r: 38 },
    { x: e.x - f * 50, y: e.y - 28 - z, r: 30 },
    { x: e.x + f * 62, y: e.y - 46 - z, r: 30 },
  ];
}

/** 체력에 따른 사나움 */
export const phaseOf = (e: Enemy): number => (e.hp > e.maxHp * (2 / 3) ? 1 : e.hp > e.maxHp / 3 ? 2 : 3);

export function setMove(b: BossState, move: BossMove, dur: number): void {
  b.move = move;
  b.t = 0;
  b.dur = dur;
  b.hit = false;
}

/** 지난 프레임에서 이번 프레임 사이에 시각 at을 지났는지 */
export const crossed = (b: BossState, prev: number, at: number): boolean => prev < at && b.t >= at;

export function updateTiger(g: Game, e: Enemy, dt: number): void {
  const b = e.boss!;
  const pl = g.player;
  // 굳히기와 묶기는 오래 버티지 못하고, 동작을 끊지 않고 늦출 뿐이다. 불도 세 겹까지만 붙는다
  e.stunT = Math.min(e.stunT, 0.6);
  e.rootT = Math.min(e.rootT, 0.9);
  e.burnStacks = Math.min(e.burnStacks, 3);
  const held = e.stunT > 0 || e.rootT > 0;
  const rate = b.move === 'die' ? 1 : held ? 0.45 : e.slowT > 0 || e.inPool ? 0.72 : 1;
  const step = dt * rate;
  const prev = b.t;
  b.t += step;
  b.pounceCd -= step;
  b.dashCd -= step;
  e.vx = 0;
  e.vy = 0;

  const dx = pl.x - e.x;
  const dy = pl.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const fierce = 1 + 0.12 * (b.phase - 1);

  // 기력이 꺾이면 하던 일을 마치고 포효한다
  const ph = phaseOf(e);
  if (ph > b.phase) b.phase = ph;
  const busy = b.move === 'leap' || b.move === 'dash' || b.move === 'die' || b.move === 'perch' || b.move === 'descend' || b.move === 'roar';
  // 마디를 한꺼번에 넘어도 마디마다 한 번씩 포효해 먹을 갈아입는다
  if (b.phase > b.roared && !busy) {
    b.roared++;
    setMove(b, 'roar', 1.7);
  }

  switch (b.move) {
    case 'perch': {
      e.x = WORLD_W / 2;
      e.y = PERCH_Y;
      b.ax = ux;
      b.ay = uy;
      if (b.t >= b.dur) {
        b.sx = e.x;
        b.sy = e.y;
        b.tx = WORLD_W / 2;
        b.ty = 420;
        setMove(b, 'descend', 0.75);
        g.sounds.push({ type: 'dash' });
      }
      break;
    }
    case 'descend': {
      const k = clamp(b.t / b.dur, 0, 1);
      e.x = lerp(b.sx, b.tx, easeInOutSine(k));
      e.y = lerp(b.sy, b.ty, easeInOutSine(k));
      b.z = Math.sin(Math.PI * k) * 90;
      if (b.t >= b.dur) {
        b.z = 0;
        land(g, e, false);
        b.roared = 1;
        setMove(b, 'roar', 1.9);
      }
      break;
    }
    case 'roar': {
      b.ax = ux;
      b.ay = uy;
      const intro = b.roared <= 1;
      if (crossed(b, prev, 0.3)) roar(g, e, intro ? { title: '묵호', sub: '墨虎 · 대숲의 주인이 내려온다', t: 0, dur: 2.8, color: INK, low: true } : null);
      if (crossed(b, prev, 0.55)) {
        if (!intro) changeInk(g, e, '묵호', (i) => (i % 2 === 0 ? 'drop' : 'swallow'));
        g.addRing('enso', e.x, e.y - 50, 60, 420, 1.1, 7, inkColor(e.el));
      }
      if (b.t >= b.dur) startStalk(b, intro ? 0.8 : 0.5);
      break;
    }
    case 'stalk': {
      // 거리를 재며 비스듬히 돈다
      const want = b.phase === 3 ? 130 : 155;
      const radial = clamp((d - want) / 70, -1, 1);
      let mx = ux * radial - uy * b.side * 0.65;
      let my = uy * radial + ux * b.side * 0.65;
      const ml = Math.hypot(mx, my) || 1;
      mx /= ml;
      my /= ml;
      const spd = e.speed * fierce * rate * (d > 360 ? 1.35 : 1);
      e.vx = mx * spd;
      e.vy = my * spd;
      b.ax = ux;
      b.ay = uy;
      if (b.t >= b.dur || (d < 118 && b.t > 0.3)) decide(g, e, d);
      break;
    }
    case 'swipe': {
      const strike = b.wind;
      const lunge = 0.13;
      if (b.t < strike * 0.7) {
        b.ax = ux;
        b.ay = uy;
        if (d > 105) {
          e.vx = ux * 55 * rate;
          e.vy = uy * 55 * rate;
        }
      } else if (b.t >= strike && b.t < strike + lunge) {
        e.vx = b.ax * 270 * rate;
        e.vy = b.ay * 270 * rate;
      }
      if (crossed(b, prev, strike)) claw(g, e);
      if (b.t >= b.dur) {
        b.chain--;
        if (b.chain > 0) startSwipe(b, false);
        else startStalk(b, rand(0.55, 0.9));
      }
      break;
    }
    case 'crouch': {
      // 노리는 자리는 처음 얼마 동안 붓잡이를 따라가다 굳는다
      if (b.t < b.dur * 0.62) {
        const p = g.freeSpot(pl.x + pl.vx * 0.18, pl.y + pl.vy * 0.18, e.r);
        b.tx = p.x;
        b.ty = p.y;
      }
      const ax = b.tx - e.x;
      const ay = b.ty - e.y;
      const al = Math.hypot(ax, ay) || 1;
      b.ax = ax / al;
      b.ay = ay / al;
      if (b.t >= b.dur) {
        b.sx = e.x;
        b.sy = e.y;
        setMove(b, 'leap', clamp(al / 720, 0.42, 0.78));
        g.sounds.push({ type: 'dash' });
      }
      break;
    }
    case 'leap': {
      const k = clamp(b.t / b.dur, 0, 1);
      e.x = lerp(b.sx, b.tx, easeInOutSine(k));
      e.y = lerp(b.sy, b.ty, easeInOutSine(k));
      b.z = Math.sin(Math.PI * k) * (44 + Math.hypot(b.tx - b.sx, b.ty - b.sy) * 0.11);
      if (b.t >= b.dur) {
        b.z = 0;
        land(g, e, true);
        b.chain--;
        b.pounceCd = [3.6, 3.0, 2.3][b.phase - 1];
        setMove(b, 'rest', [1.0, 0.8, 0.55][b.phase - 1]);
      }
      break;
    }
    case 'rest': {
      if (b.t >= b.dur) {
        if (b.chain > 0) setMove(b, 'crouch', 0.5);
        else startStalk(b, rand(0.5, 0.9));
      }
      break;
    }
    case 'aim': {
      if (b.t < b.dur * 0.7) {
        b.ax = ux;
        b.ay = uy;
        dashPath(g, e);
      }
      if (b.t >= b.dur) {
        b.sx = e.x;
        b.sy = e.y;
        const len = Math.hypot(b.tx - e.x, b.ty - e.y);
        setMove(b, 'dash', Math.max(0.12, len / DASH_SPEED));
        g.sounds.push({ type: 'roar', big: false });
        g.traces.push(trace('rake', e, e.x, e.y - 6, Math.atan2(b.ay, b.ax), { length: len, width: 30, draw: b.dur, fade: 1.3 }));
      }
      break;
    }
    case 'dash': {
      const k = clamp(b.t / b.dur, 0, 1);
      e.x = lerp(b.sx, b.tx, k);
      e.y = lerp(b.sy, b.ty, k);
      if (Math.random() < 0.6) g.addParticle(e.x - b.ax * 40 + rand(-14, 14), e.y + rand(-4, 4), -b.ax * rand(40, 120), rand(-30, -5), rand(2, 4), DAMMUK, 0.6, rand(0.3, 0.5), true);
      if (!b.hit && Math.hypot((pl.x - e.x) / (TIGER_BODY.rx * 0.7 + pl.r), (pl.y - e.y) / (TIGER_BODY.ry + pl.r + 8)) < 1) {
        b.hit = true;
        // 길 옆으로 튕겨 낸다
        const side = (pl.x - e.x) * -b.ay + (pl.y - e.y) * b.ax >= 0 ? 1 : -1;
        if (g.hurtPlayer(16, e.el)) g.knockPlayer(-b.ay * side + b.ax * 0.4, b.ax * side + b.ay * 0.4, 560);
      }
      if (b.t >= b.dur) {
        b.dashCd = b.phase === 3 ? 3.4 : 4.6;
        if (b.blocked) {
          // 대숲이나 담에 머리를 박았다
          g.sounds.push({ type: 'quake' });
          g.shake = Math.max(g.shake, 12);
          g.addRing('crack', e.x + b.ax * 50, e.y + b.ay * 20, 10, 70, 0.6, 4, INK);
          g.splash(e.x + b.ax * 50, e.y - 20, 22, DAMMUK, 10);
          setMove(b, 'stagger', 1.15);
        } else {
          setMove(b, 'rest', 0.45);
        }
      }
      break;
    }
    case 'stagger': {
      if (b.t >= b.dur) startStalk(b, 0.4);
      break;
    }
    case 'die': {
      // 몸에서 먹이 터져 나오며 스러진다
      if (Math.floor(prev / 0.2) !== Math.floor(b.t / 0.2)) {
        const a = Math.random() * TAU;
        const r = rand(10, 60);
        const x = e.x + Math.cos(a) * r * 1.4;
        const y = e.y - 30 + Math.sin(a) * r * 0.6;
        const col = inkColor(e.el);
        g.addRing('burst', x, y, 8, rand(40, 70), 0.4, 8, col);
        g.splash(x, y, rand(14, 24), col, 8);
        g.sounds.push({ type: 'hit', strong: true, crit: false });
        g.shake = Math.max(g.shake, 5);
      }
      if (b.t >= b.dur) g.finishBoss(e);
      break;
    }
  }

  // 바라보는 쪽 — 좌우가 너무 자주 뒤집히지 않게
  const fx = b.move === 'leap' || b.move === 'dash' || b.move === 'descend' ? b.tx - b.sx : b.ax;
  if (Math.abs(fx) > 0.25) e.face = fx > 0 ? 0 : Math.PI;
}

/** 할퀴기, 덮치기, 내달리기 중에서 고른다 */
function decide(g: Game, e: Enemy, d: number): void {
  const b = e.boss!;
  if (d < 200) {
    b.chain = b.phase;
    startSwipe(b, true);
  } else if (b.phase >= 2 && b.dashCd <= 0 && d > 250) {
    setMove(b, 'aim', b.phase === 3 ? 0.58 : 0.72);
    dashPath(g, e);
  } else if (b.pounceCd <= 0) {
    b.chain = b.phase === 3 ? 2 : 1;
    setMove(b, 'crouch', [0.85, 0.72, 0.62][b.phase - 1]);
  } else {
    startStalk(b, 0.45);
  }
}

function startStalk(b: BossState, dur: number): void {
  b.side = Math.random() < 0.5 ? 1 : -1;
  setMove(b, 'stalk', dur * [1.6, 1.15, 0.8][b.phase - 1]);
}

function startSwipe(b: BossState, first: boolean): void {
  b.wind = first ? (b.phase === 3 ? 0.46 : 0.6) : 0.38;
  setMove(b, 'swipe', b.wind + 0.13 + (b.phase === 3 ? 0.3 : 0.42));
}

/** 내달릴 길 — 담이나 바위에 닿기 전까지 */
function dashPath(g: Game, e: Enemy): void {
  const b = e.boss!;
  let x = e.x;
  let y = e.y;
  b.blocked = false;
  for (let s = 0; s < DASH_MAX; s += 12) {
    const nx = x + b.ax * 12;
    const ny = y + b.ay * 12;
    if (nx < WALL + 60 || nx > WORLD_W - WALL - 60 || ny < 210 || ny > WORLD_H - WALL - 30 || g.insideObstacle(nx, ny, e.r * 0.6)) {
      b.blocked = true;
      break;
    }
    x = nx;
    y = ny;
  }
  b.tx = x;
  b.ty = y;
}

function trace(
  visual: 'claw' | 'rake',
  e: Enemy,
  x: number,
  y: number,
  aim: number,
  o: { length?: number; width: number; draw: number; fade: number; dir?: 1 | -1 },
): Trace {
  return {
    visual,
    ink: e.el,
    step: 0,
    x,
    y,
    aim,
    dir: o.dir ?? 1,
    reach: SWIPE_REACH,
    arc: SWIPE_HALF * 2,
    length: o.length ?? 0,
    radius: 0,
    width: o.width,
    dryness: 0.55,
    potency: 1,
    t: 0,
    draw: o.draw,
    fade: o.fade,
    seed: randomSeed() % 100000,
  };
}

/** 앞발 할퀴기 — 부채꼴 안의 붓잡이를 친다 */
function claw(g: Game, e: Enemy): void {
  const b = e.boss!;
  const pl = g.player;
  const aim = Math.atan2(b.ay, b.ax);
  const dir: 1 | -1 = b.chain % 2 === 0 ? -1 : 1;
  g.traces.push(trace('claw', e, e.x, e.y - 24, aim, { width: 7, draw: 0.12, fade: 0.95, dir }));
  g.sounds.push({ type: 'claw' });
  const dx = pl.x - e.x;
  const dy = pl.y - (e.y - 10);
  const dd = Math.hypot(dx, dy);
  let da = Math.atan2(dy, dx) - aim;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  if (dd < SWIPE_REACH + pl.r && Math.abs(da) < SWIPE_HALF) {
    if (g.hurtPlayer(14, e.el)) g.knockPlayer(dx / (dd || 1), dy / (dd || 1), 420);
  }
}

/** 땅에 내려앉는다 — 둘레에 충격이 퍼진다 */
function land(g: Game, e: Enemy, harm: boolean): void {
  const pl = g.player;
  const col = inkColor(e.el);
  g.sounds.push({ type: 'quake' });
  g.shake = Math.max(g.shake, 13);
  g.hitstop = Math.max(g.hitstop, 0.05);
  g.addRing('shock', e.x, e.y, 30, LAND_R * 1.25, 0.55, 9, col);
  g.addRing('crack', e.x, e.y, 16, LAND_R * 0.9, 0.9, 4, INK);
  g.stamps.push({ kind: 'splat', x: e.x, y: e.y + 4, r: 64, color: col, alpha: 0.32, seed: randomSeed() % 100000, rot: Math.random() * TAU, wet: 1 });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + rand(-0.1, 0.1);
    const sp = rand(160, 340);
    g.addParticle(e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 12, Math.cos(a) * sp, Math.sin(a) * sp * 0.5, rand(2.5, 5), i % 3 ? DAMMUK : col, 0.8, rand(0.35, 0.6), true);
  }
  if (!harm) return;
  const dx = pl.x - e.x;
  const dy = (pl.y - e.y) / 0.7;
  const dd = Math.hypot(dx, dy);
  if (dd < LAND_R + pl.r && g.hurtPlayer(18, e.el)) g.knockPlayer(dx / (dd || 1), dy / (dd || 1), 520);
}

/** 포효 — 붓잡이를 밀어내고 화면이 떨린다. 등장 때는 이름을 걸고 밀어내지 않는다 */
export function roar(g: Game, e: Enemy, intro: Banner | null, headY = e.y - 50): void {
  const pl = g.player;
  g.sounds.push({ type: 'roar', big: true });
  g.shake = Math.max(g.shake, 16);
  g.addRing('enso', e.x, headY, 30, 300, 0.9, 12, INK);
  for (let i = 0; i < 26; i++) {
    const a = rand(-Math.PI, 0);
    const sp = rand(200, 460);
    g.addParticle(e.x + Math.cos(a) * 40, headY + Math.sin(a) * 20, Math.cos(a) * sp, Math.sin(a) * sp * 0.6, rand(2, 4.5), i % 2 ? INK : inkColor(e.el), 0.75, rand(0.4, 0.8), true);
  }
  if (intro) {
    g.banner = intro;
    return;
  }
  const dx = pl.x - e.x;
  const dy = pl.y - e.y;
  const dd = Math.hypot(dx, dy) || 1;
  if (dd < 300) {
    g.hurtPlayer(5, e.el);
    g.knockPlayer(dx / dd, dy / dd, 620 * (1 - dd / 400));
  }
}

/**
 * 먹을 갈아입는다 — 상생의 차례로 다음 먹.
 * 새 먹을 이기는 먹귀들이 대숲에서 뛰어나오고, 쓰러지면 반드시 제 먹을 떨군다.
 */
export function changeInk(g: Game, e: Enemy, name: string, minion: (i: number) => EnemyKind): void {
  const b = e.boss!;
  const next = GENERATES[e.el];
  e.el = next;
  const col = inkColor(next);
  const counter = counterOf(next);
  g.sounds.push({ type: 'switch', ink: next });
  g.stamps.push({ kind: 'splat', x: e.x, y: e.y, r: 90, color: col, alpha: 0.4, seed: randomSeed() % 100000, rot: Math.random() * TAU, wet: 1 });
  g.addRing('burst', e.x, e.y - 40, 30, 160, 0.6, 14, col);
  g.banner = {
    title: `${INKS[next].name}을 두르다`,
    sub: `${name}가 ${INKS[next].hanja} 먹으로 갈아입는다 — ${INKS[counter].hanja} 먹이 이긴다`,
    t: 0,
    dur: 2.6,
    color: INKS[next].edge,
  };
  const n = b.phase === 2 ? 3 : 4;
  for (let i = 0; i < n; i++) {
    const c = g.findSpawn(320);
    const m = g.addEnemy(minion(i), counter, c.x, c.y, hpScale(g.room));
    m.loot = 6;
  }
}
