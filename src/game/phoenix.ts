/**
 * 산사의 주인 — 봉황(鳳). 오색 깃을 꼬리에 단 새.
 * 담장 용마루에 앉아 내려다보다 울며 날개를 펴고, 마당으로 내려앉는다.
 *  - 맴돌기: 낮게 떠서 붓잡이 둘레를 돈다. 이때 붓이 닿는다.
 *  - 깃털 부채: 날개를 뒤로 젖혔다가 부채꼴로 깃털을 날린다. 붓으로 쳐낼 수 있다.
 *  - 내리꽂기: 하늘 높이 올라(붓이 닿지 않는다) 그림자로 붓잡이를 쫓다가 붉은 원에 내리꽂힌다. 뒤에 땅에서 숨을 고른다(틈).
 *  - 활공: 마당 끝으로 날아가 붉은 띠를 따라 낮게 가로지른다.
 *  - 날개 바람(기력 2/3 아래): 날개를 크게 세 번 쳐 붓잡이를 밀어낸다. 다치지는 않는다.
 * 범종이 울리면 낮게 떠 있던 봉황이 떨어져 버둥거린다 — 가장 큰 틈.
 * 기력이 2/3, 1/3로 꺾이면 울며 상생의 차례로 먹을 갈아입고, 새 먹을 이기는 제비와 여우를 불러낸다.
 */
import { type Vec, TAU, clamp, easeInOutSine, lerp, rand } from '../core/math';
import { randomSeed } from '../core/rng';
import { INK_ORDER, inkColor } from '../ink';
import { DAMMUK, INK } from '../render/color';
import { PERCH_Y, changeInk, crossed, phaseOf, roar, setMove } from './boss';
import type { Game } from './game';
import { WALL_TOP } from './rooms';
import { type BirdMove, type BossState, type Enemy, WALL, WORLD_H, WORLD_W } from './types';

/** 낮게 떠서 맴도는 높이 */
export const HOVER_Z = 58;
/** 땅을 디딘 발에서 몸 가운데까지 */
export const BODY_LIFT = 26;
/** 하늘 높이 — 그림자만 남는다 */
const SKY_Z = 360;
/** 활공 직전에 떠 있는 높이 */
const SWEEP_Z = 96;
/** 내리꽂히는 자리의 둘레 */
export const PLUNGE_R = 112;
/** 활공 띠의 반폭 */
export const SWEEP_HALF = 58;
export const VOLLEY_SPREAD = 1.15;
export const volleyCount = (b: BossState): number => [5, 7, 9][b.phase - 1];
/** 꼬리의 마디 */
export const TAIL_N = 14;
const TAIL_SEG = 13;
/** 내리꽂기를 노리는 시간 — 이 동안 붉은 원이 그려진다 */
export const PLUNGE_WIND = 0.62;
const PLUNGE_DROP = 0.2;

export function makePhoenixState(): BossState {
  const spine: Vec[] = [];
  // 용마루 너머로 꼬리를 늘어뜨리고 앉아 있다
  for (let i = 0; i < TAIL_N; i++) spine.push({ x: WORLD_W / 2 - 30 - i * 9, y: PERCH_Y + 4 + i * 4 });
  return {
    species: 'phoenix',
    move: 'perch',
    t: 0,
    dur: 2.8,
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
    pounceCd: 2.5,
    dashCd: 5,
    blocked: false,
    spine,
    under: 0,
    heading: 0,
    flap: 0,
    guard: 0,
  };
}

/** 몸통과 머리가 맞는 자리 */
export function phoenixHitCircles(e: Enemy): { x: number; y: number; r: number }[] {
  const b = e.boss!;
  const f = Math.cos(e.face) >= 0 ? 1 : -1;
  const cy = e.y - b.z - BODY_LIFT;
  return [
    { x: e.x - f * 6, y: cy, r: 36 },
    { x: e.x + f * 36, y: cy - 30, r: 22 },
    { x: e.x - f * 44, y: cy + 6, r: 24 },
  ];
}

const inRoom = (x: number, y: number, pad = 60): Vec => ({
  x: clamp(x, WALL + pad, WORLD_W - WALL - pad),
  y: clamp(y, WALL_TOP + pad * 0.6, WORLD_H - WALL - pad * 0.6),
});

/** 꼬리가 몸을 따라온다 — 멈춰 있으면 천천히 뒤로 늘어진다 */
function follow(b: BossState, x: number, y: number, f: number, dt: number): void {
  const s = b.spine;
  // 돌아서면 꼬리를 몸 건너편으로 뒤집는다 — 머리 앞으로 꼬리가 접혀 넘어오지 않게
  const mid = s[Math.floor(s.length / 2)];
  const body = x + f * 40;
  if (mid && (mid.x - x) * f > 20) for (const q of s) q.x = 2 * body - q.x;
  s[0] = { x, y };
  const k = Math.min(1, dt * 1.6);
  for (let i = 1; i < s.length; i++) {
    const p = s[i - 1];
    const q = s[i];
    q.x += (p.x - f * TAIL_SEG * 0.9 - q.x) * k;
    q.y += (p.y + TAIL_SEG * 0.25 - q.y) * k;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > TAIL_SEG) {
      q.x = p.x + (dx / d) * TAIL_SEG;
      q.y = p.y + (dy / d) * TAIL_SEG;
    }
  }
}

/** 날갯짓 빠르기(초당 몇 번) */
function flapRate(b: BossState): number {
  switch (b.move as BirdMove) {
    case 'perch':
      return b.t > 1.1 ? 1.1 : 0;
    case 'glide':
      return 0.9;
    case 'hover':
      return 1.7;
    case 'volley':
      return b.t < b.wind ? 0.5 : 2.6;
    case 'soar':
      return 2.4;
    case 'climb':
      return 2.6;
    case 'cry':
      return 1.2;
    case 'fall':
      return 3.6;
    case 'rest':
      return 0.35;
    default:
      return 0;
  }
}

export function updatePhoenix(g: Game, e: Enemy, dt: number): void {
  const b = e.boss!;
  const pl = g.player;
  // 굳히기와 묶기는 오래 버티지 못하고 동작을 늦출 뿐이다. 불도 세 겹까지만 붙는다
  e.stunT = Math.min(e.stunT, 0.5);
  e.rootT = Math.min(e.rootT, 0.6);
  e.burnStacks = Math.min(e.burnStacks, 3);
  const held = e.stunT > 0 || e.rootT > 0;
  const rate = b.move === 'die' ? 1 : held ? 0.45 : e.slowT > 0 || e.inPool ? 0.72 : 1;
  const step = dt * rate;
  const prev = b.t;
  b.t += step;
  b.pounceCd -= step;
  b.dashCd -= step;
  b.guard -= dt;
  e.vx = 0;
  e.vy = 0;
  e.kx *= 0.5;
  e.ky *= 0.5;
  const dx = pl.x - e.x;
  const dy = pl.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const fierce = 1 + 0.12 * (b.phase - 1);
  const toward = (v: number, target: number, k: number): number => v + (target - v) * Math.min(1, k * dt);
  const faceTo = (x: number): void => {
    if (Math.abs(x - e.x) > 4) e.face = x >= e.x ? 0 : Math.PI;
  };

  // 기력이 꺾이면 하던 일을 마치고 운다
  const ph = phaseOf(e);
  if (ph > b.phase) b.phase = ph;
  const busy = ['perch', 'glide', 'cry', 'die', 'plunge', 'sweep', 'fall', 'soar', 'climb'].includes(b.move);
  if (b.phase > b.roared && !busy) {
    b.roared++;
    setMove(b, 'cry', 1.7);
  }

  switch (b.move as BirdMove) {
    case 'perch': {
      // 용마루에 앉아 내려다본다 — 날개를 펴고 울면 이름이 걸린다
      e.x = WORLD_W / 2;
      e.y = PERCH_Y + 6;
      b.z = 0;
      faceTo(pl.x);
      if (crossed(b, prev, 1.25)) {
        b.roared = 1;
        roar(g, e, { title: '봉황', sub: '鳳 · 산사의 주인이 날개를 편다', t: 0, dur: 2.8, color: INK, low: true }, e.y - BODY_LIFT - 40, { type: 'cry', big: true });
      }
      if (b.t >= b.dur) {
        b.sx = e.x;
        b.sy = e.y;
        b.tx = WORLD_W / 2;
        b.ty = 430;
        setMove(b, 'glide', 1.1);
        g.sounds.push({ type: 'dash' });
      }
      break;
    }
    case 'glide': {
      const k = easeInOutSine(clamp(b.t / b.dur, 0, 1));
      e.x = lerp(b.sx, b.tx, k);
      e.y = lerp(b.sy, b.ty, k);
      b.z = lerp(0, HOVER_Z, k) + Math.sin(Math.PI * k) * 70;
      if (b.t >= b.dur) startHover(b);
      break;
    }
    case 'hover': {
      // 붓잡이 둘레를 비스듬히 돈다
      b.z = toward(b.z, HOVER_Z + Math.sin(b.t * 3.2) * 6, 3);
      const around = Math.atan2(e.y - pl.y, e.x - pl.x) + b.side * 0.75;
      const goal = inRoom(pl.x + Math.cos(around) * 200, pl.y + Math.sin(around) * 150);
      const gx = goal.x - e.x;
      const gy = goal.y - e.y;
      const gl = Math.hypot(gx, gy);
      const sp = Math.min(gl / Math.max(dt, 0.001), 165 * fierce * rate);
      if (gl > 1) {
        e.vx = (gx / gl) * sp;
        e.vy = (gy / gl) * sp;
      }
      faceTo(pl.x);
      if (b.t >= b.dur) chooseAttack(g, e, d);
      break;
    }
    case 'volley': {
      b.z = toward(b.z, HOVER_Z + 14, 3);
      if (b.t < b.wind * 0.8) {
        b.ax = dx / d;
        b.ay = dy / d;
        faceTo(pl.x);
      }
      if (crossed(b, prev, b.wind)) volley(g, e);
      if (b.t >= b.dur) {
        b.chain--;
        if (b.chain > 0) startVolley(b, false);
        else startHover(b);
      }
      break;
    }
    case 'gust': {
      // 날개를 크게 세 번 친다 — 바람이 붓잡이를 밀어낸다
      b.z = toward(b.z, HOVER_Z + 10, 3);
      faceTo(pl.x);
      for (const at of GUST_BEATS) if (crossed(b, prev, at)) gust(g, e);
      if (b.t >= b.dur) {
        if (b.phase === 3) startVolley(b, true);
        else startHover(b);
      }
      break;
    }
    case 'soar': {
      // 하늘 높이 올라 그림자로 붓잡이를 쫓는다
      const up = clamp(b.t / 0.6, 0, 1);
      b.z = lerp(b.z, SKY_Z, up * up);
      if (b.t > 0.45) {
        const chase = 300 * fierce * rate;
        const l = Math.min(d, chase * dt);
        e.x += (dx / d) * l;
        e.y += (dy / d) * l;
      }
      if (b.t >= b.dur) {
        const p = g.freeSpot(pl.x + pl.vx * 0.2, pl.y + pl.vy * 0.2, 30);
        b.tx = p.x;
        b.ty = p.y;
        b.sx = e.x;
        b.sy = e.y;
        setMove(b, 'plunge', PLUNGE_WIND + PLUNGE_DROP);
      }
      break;
    }
    case 'plunge': {
      if (b.t < PLUNGE_WIND) {
        // 노린 자리 위로 미끄러져 간다
        const k = easeInOutSine(clamp(b.t / PLUNGE_WIND, 0, 1));
        e.x = lerp(b.sx, b.tx, k);
        e.y = lerp(b.sy, b.ty, k);
        b.z = SKY_Z;
      } else {
        const k = clamp((b.t - PLUNGE_WIND) / PLUNGE_DROP, 0, 1);
        e.x = b.tx;
        e.y = b.ty;
        b.z = SKY_Z * (1 - k * k);
      }
      if (crossed(b, prev, PLUNGE_WIND + PLUNGE_DROP)) {
        b.z = 0;
        plungeImpact(g, e);
        setMove(b, 'rest', [1.6, 1.35, 1.15][b.phase - 1]);
      }
      break;
    }
    case 'rest': {
      // 땅에 내려앉아 숨을 고른다 — 붓이 크게 들어간다
      b.z = toward(b.z, 0, 8);
      faceTo(pl.x);
      if (b.t >= b.dur) startHover(b);
      break;
    }
    case 'climb': {
      // 활공을 시작할 마당 끝으로 날아간다 — 높이 떠서 붓이 닿지 않는다
      b.z = toward(b.z, 150, 4);
      const gx = b.sx - e.x;
      const gy = b.sy - e.y;
      const gl = Math.hypot(gx, gy);
      const l = Math.min(gl, 680 * rate * dt);
      if (gl > 1) {
        e.x += (gx / gl) * l;
        e.y += (gy / gl) * l;
      }
      faceTo(b.tx);
      if (gl < 8 || b.t >= b.dur) {
        b.wind = b.phase === 3 ? 0.62 : 0.78;
        setMove(b, 'sweep', b.wind + 0.62);
        g.sounds.push({ type: 'cry', big: false });
      }
      break;
    }
    case 'sweep': {
      if (b.t < b.wind) {
        b.z = toward(b.z, SWEEP_Z, 5);
        faceTo(b.tx);
      } else {
        // 붉은 띠를 따라 낮게 가로지른다
        const k = clamp((b.t - b.wind) / (b.dur - b.wind), 0, 1);
        const q = k * k * (3 - 2 * k);
        e.x = lerp(b.sx, b.tx, q);
        e.y = lerp(b.sy, b.ty, q);
        b.z = lerp(SWEEP_Z, 30, Math.min(1, k * 3)) + Math.max(0, k - 0.75) * 120;
        if (crossed(b, prev, b.wind)) g.sounds.push({ type: 'dash' });
        const near = Math.hypot(pl.x - e.x, (pl.y - e.y) / 0.8);
        if (!b.hit && near < SWEEP_HALF + pl.r) {
          b.hit = true;
          const len = Math.hypot(b.tx - b.sx, b.ty - b.sy) || 1;
          if (g.hurtPlayer(16, e.el)) g.knockPlayer((b.tx - b.sx) / len + (pl.x - e.x) / (near || 1), (b.ty - b.sy) / len + (pl.y - e.y) / (near || 1), 460);
        }
        // 지나간 자리에 깃털이 흩날린다
        if (Math.floor(prev / 0.05) !== Math.floor(b.t / 0.05)) {
          const col = Math.random() < 0.5 ? inkColor(e.el) : inkColor(INK_ORDER[Math.floor(Math.random() * 5)]);
          g.addParticle(e.x + rand(-30, 30), e.y - b.z - rand(10, 40), rand(-60, 60), rand(20, 90), rand(2.5, 4.5), col, 0.85, rand(0.5, 0.9), true);
        }
      }
      if (b.t >= b.dur) startHover(b);
      break;
    }
    case 'cry': {
      b.z = toward(b.z, HOVER_Z + 30, 3);
      faceTo(pl.x);
      if (crossed(b, prev, 0.3)) roar(g, e, null, e.y - b.z - BODY_LIFT - 30, { type: 'cry', big: true });
      if (crossed(b, prev, 0.55)) {
        changeInk(g, e, '봉황', (i) => (i % 2 ? 'fox' : 'swallow'));
        g.addRing('enso', e.x, e.y - b.z - BODY_LIFT, 60, 420, 1.1, 7, inkColor(e.el));
      }
      if (b.t >= b.dur) startHover(b);
      break;
    }
    case 'fall': {
      // 종소리에 떨어져 버둥거린다
      b.z = toward(b.z, 0, 10);
      if (crossed(b, prev, 0.22)) {
        g.sounds.push({ type: 'quake' });
        g.shake = Math.max(g.shake, 8);
        g.addRing('shock', e.x, e.y, 20, 80, 0.5, 6, inkColor(e.el));
        g.splash(e.x, e.y - 6, 30, inkColor(e.el), 12);
      }
      if (b.t >= b.dur) startHover(b);
      break;
    }
    case 'die': {
      b.z = toward(b.z, 0, 4);
      if (Math.floor(prev / 0.12) !== Math.floor(b.t / 0.12)) {
        // 오색 깃이 흩어진다
        const col = inkColor(INK_ORDER[Math.floor(Math.random() * 5)]);
        const a = Math.random() * TAU;
        const sp = rand(80, 260);
        for (let i = 0; i < 3; i++) g.addParticle(e.x + rand(-40, 40), e.y - BODY_LIFT - rand(0, 40), Math.cos(a) * sp, Math.sin(a) * sp - 60, rand(3, 6), col, 0.9, rand(0.6, 1.1), true);
        if (Math.random() < 0.4) {
          g.addRing('burst', e.x + rand(-30, 30), e.y - BODY_LIFT, 8, rand(40, 70), 0.4, 8, inkColor(e.el));
          g.sounds.push({ type: 'hit', strong: true, crit: false });
          g.shake = Math.max(g.shake, 5);
        }
      }
      if (b.t >= b.dur) g.finishBoss(e);
      break;
    }
    default:
      startHover(b);
  }

  b.flap += dt * flapRate(b) * TAU;
  e.x = clamp(e.x, WALL + 30, WORLD_W - WALL - 30);
  e.y = clamp(e.y, PERCH_Y, WORLD_H - WALL);
  // 꼬리는 엉덩이에서 뒤로
  const f = Math.cos(e.face) >= 0 ? 1 : -1;
  follow(b, e.x - f * 40, e.y - 2, f, dt);
}

export const GUST_BEATS = [0.55, 1.0, 1.45];

function startHover(b: BossState): void {
  b.side = Math.random() < 0.5 ? 1 : -1;
  setMove(b, 'hover', rand(1.2, 1.8) * [1, 0.85, 0.7][b.phase - 1]);
}

function startVolley(b: BossState, first: boolean): void {
  if (first) b.chain = b.phase === 3 ? 2 : 1;
  b.wind = first ? (b.phase === 3 ? 0.52 : 0.64) : 0.42;
  setMove(b, 'volley', b.wind + 0.5);
}

function chooseAttack(g: Game, e: Enemy, d: number): void {
  const b = e.boss!;
  const r = Math.random();
  if (b.pounceCd <= 0 && r < 0.3) {
    b.pounceCd = [7, 6, 5][b.phase - 1];
    setMove(b, 'soar', 1.5);
    g.sounds.push({ type: 'dash' });
    return;
  }
  if (b.dashCd <= 0 && r < 0.55) {
    b.dashCd = [9, 8, 6.5][b.phase - 1];
    planSweep(g, e);
    return;
  }
  if (b.phase >= 2 && d < 320 && r < 0.78) {
    setMove(b, 'gust', 1.9);
    return;
  }
  startVolley(b, true);
}

/** 붓잡이를 지나가는 줄을 하나 고른다 — 마당 이쪽 끝에서 저쪽 끝까지 */
function planSweep(g: Game, e: Enemy): void {
  const b = e.boss!;
  const pl = g.player;
  const base = e.x < pl.x ? 0 : Math.PI;
  const a = base + rand(-0.45, 0.45);
  const L = 520;
  const s = inRoom(pl.x - Math.cos(a) * L, pl.y - Math.sin(a) * L * 0.75, 80);
  const t = inRoom(pl.x + Math.cos(a) * L, pl.y + Math.sin(a) * L * 0.75, 80);
  b.sx = s.x;
  b.sy = s.y;
  b.tx = t.x;
  b.ty = t.y;
  setMove(b, 'climb', 1.3);
}

/** 깃털 부채 — 사나워질수록 갈래가 늘어난다 */
function volley(g: Game, e: Enemy): void {
  const b = e.boss!;
  const n = volleyCount(b);
  const base = Math.atan2(b.ay, b.ax) + (b.chain % 2 === 0 ? 0.5 / n : 0);
  const hy = e.y - b.z - BODY_LIFT;
  g.sounds.push({ type: 'dash' });
  g.sounds.push({ type: 'cry', big: false });
  for (let i = 0; i < n; i++) {
    const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * VOLLEY_SPREAD);
    const sp = 300;
    g.fireProjectile('feather', e.x + Math.cos(a) * 30, hy + 10 + Math.sin(a) * 20, Math.cos(a) * sp, Math.sin(a) * sp, { r: 9, life: 2.6, dmg: 10, knock: 0, ink: e.el, potency: 0, hostile: true });
  }
  for (let i = 0; i < 8; i++) {
    const a = rand(0, TAU);
    g.addParticle(e.x + rand(-20, 20), hy + rand(-10, 10), Math.cos(a) * rand(60, 160), Math.sin(a) * rand(60, 160), rand(2, 4), inkColor(e.el), 0.8, rand(0.3, 0.6), true);
  }
}

/** 날개 바람 — 붓잡이를 밀어낸다 */
function gust(g: Game, e: Enemy): void {
  const b = e.boss!;
  const pl = g.player;
  const dx = pl.x - e.x;
  const dy = pl.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  g.sounds.push({ type: 'gust' });
  g.shake = Math.max(g.shake, 5);
  g.addRing('shock', e.x, e.y, 40, 360, 0.6, 5, DAMMUK);
  if (d < 420) g.knockPlayer(dx / d, dy / d, 640 * (1 - d / 520));
  // 바람에 휩쓸리는 먹가루
  for (let i = 0; i < 14; i++) {
    const a = Math.atan2(dy, dx) + rand(-0.9, 0.9);
    const sp = rand(260, 520);
    g.addParticle(e.x + Math.cos(a) * 50, e.y - b.z * 0.4 + Math.sin(a) * 30, Math.cos(a) * sp, Math.sin(a) * sp * 0.7, rand(1.5, 3), DAMMUK, 0.55, rand(0.35, 0.6), false);
  }
}

/** 내리꽂힌 자리 — 둘레를 친다 */
function plungeImpact(g: Game, e: Enemy): void {
  const pl = g.player;
  const col = inkColor(e.el);
  g.sounds.push({ type: 'quake' });
  g.shake = Math.max(g.shake, 14);
  g.hitstop = Math.max(g.hitstop, 0.05);
  g.addRing('shock', e.x, e.y, 30, PLUNGE_R * 1.3, 0.55, 9, col);
  g.addRing('crack', e.x, e.y, 14, PLUNGE_R * 0.9, 0.9, 4, INK);
  g.stamps.push({ kind: 'splat', x: e.x, y: e.y + 4, r: 64, color: col, alpha: 0.34, seed: randomSeed() % 100000, rot: Math.random() * TAU, wet: 1 });
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU + rand(-0.1, 0.1);
    const sp = rand(180, 360);
    const c = i % 4 === 0 ? inkColor(INK_ORDER[i % 5]) : i % 2 ? DAMMUK : col;
    g.addParticle(e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 12, Math.cos(a) * sp, Math.sin(a) * sp * 0.5, rand(2.5, 5), c, 0.8, rand(0.35, 0.6), true);
  }
  const dx = pl.x - e.x;
  const dy = (pl.y - e.y) / 0.7;
  const dd = Math.hypot(dx, dy);
  if (dd < PLUNGE_R + pl.r && g.hurtPlayer(18, e.el)) g.knockPlayer(dx / (dd || 1), dy / (dd || 1), 520);
}

/** 종소리 — 낮게 떠 있던 봉황이 떨어진다. 한 번 떨어진 뒤 잠시는 버틴다 */
export function phoenixHearsBell(g: Game, e: Enemy): boolean {
  const b = e.boss!;
  if (b.guard > 0 || b.z > 150 || ['die', 'perch', 'glide', 'fall', 'rest', 'plunge'].includes(b.move)) return false;
  b.guard = 9;
  setMove(b, 'fall', [2.4, 2.1, 1.8][b.phase - 1]);
  g.banner = { title: '봉황이 떨어지다', sub: '종소리에 날개가 꺾였다 — 지금이 틈', t: 0, dur: 1.8, color: INK, low: true };
  return true;
}
