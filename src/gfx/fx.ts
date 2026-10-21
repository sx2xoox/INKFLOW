/**
 * 움직이는 획들. 콤보의 궤적, 고리, 바닥 효과, 투사체, 상태 표시를
 * 매 프레임 붓질 묶음(StrokeBatch)에 써 넣는다.
 */
import { type Vec, TAU, clamp, easeOutCubic, lerp } from '../core/math';
import { mulberry32 } from '../core/rng';
import { INKS, inkColor } from '../ink';
import type { Enemy, Player, Projectile, Ring, Trace, Zone } from '../game/types';
import { arcPoints } from '../render/brush';
import { type RGB, DAMMUK, INK, mix } from '../render/color';
import { ROBE } from '../render/sprites';
import type { StrokeBatch } from './strokes';

type SB = StrokeBatch;

const BAMBOO: RGB = [132, 102, 58];

/* ───────── 콤보 궤적 ───────── */

type StrokeStyle = Parameters<SB['stroke']>[1];

/**
 * 획 하나. 흰 먹(호분)은 종이 위에서 안 보이니, 둘레에 옅은 담묵을 먼저 깔아
 * 흰 획이 여백처럼 떠오르게 한다.
 */
function inkStroke(sb: SB, pts: Vec[], st: StrokeStyle, ink: Trace['ink']): void {
  if (ink === 'baek') {
    sb.stroke(pts, { ...st, width: st.width * 1.7 + 4, color: DAMMUK, alpha: (st.alpha ?? 1) * 0.42, dryness: 0.55, wet: 0.6, seed: (st.seed ?? 1) + 999 });
  }
  sb.stroke(pts, st);
}

export function drawTrace(sb: SB, tr: Trace): void {
  const q = clamp(tr.t / tr.draw, 0, 1);
  const f = clamp((tr.t - tr.draw) / tr.fade, 0, 1);
  const alpha = 1 - Math.pow(f, 1.6);
  if (alpha <= 0.01) return;
  const e = easeOutCubic(q);
  const col = inkColor(tr.ink);
  const rng = mulberry32(tr.seed);
  const W = tr.width;

  switch (tr.visual) {
    case 'sweep': {
      const start = tr.aim - (tr.dir * tr.arc) / 2;
      const sweep = tr.dir * tr.arc * e;
      if (Math.abs(sweep) < 0.05) return;
      const r0 = tr.reach * 0.6;
      const r1 = tr.reach * 0.9;
      const main = arcPoints(tr.x, tr.y, r0, start, sweep, 18, lerp(r0, r1, e));
      inkStroke(sb, main, { width: W, color: col, alpha, dryness: tr.dryness, wet: tr.ink === 'heuk' ? 1 : 0.4, taperIn: 0.18, taperOut: 0.45, seed: tr.seed }, tr.ink);
      // 안쪽의 가는 메아리 획
      sb.stroke(arcPoints(tr.x, tr.y, r0 * 0.72, start + tr.dir * 0.15, sweep * 0.8, 12, r0 * 0.82), {
        width: W * 0.3,
        color: col,
        alpha: alpha * 0.55,
        dryness: 0.6,
        taperIn: 0.3,
        taperOut: 0.5,
        seed: tr.seed + 1,
      });
      decorateArc(sb, tr, start, sweep, lerp(r0, r1, 0.7), alpha, rng);
      break;
    }
    case 'spin': {
      const start = tr.aim + Math.PI;
      const sweep = tr.dir * TAU * e;
      if (Math.abs(sweep) < 0.05) return;
      sb.stroke(arcPoints(tr.x, tr.y, tr.reach * 0.55, start, sweep, 34, tr.reach * 0.92), {
        width: W,
        color: col,
        alpha,
        dryness: tr.dryness,
        wet: 1,
        taperIn: 0.1,
        taperOut: 0.35,
        seed: tr.seed,
      });
      sb.stroke(arcPoints(tr.x, tr.y + 6, tr.reach * 0.3, start + 1, sweep * 0.85, 26, tr.reach * 0.62), {
        width: W * 0.45,
        color: col,
        alpha: alpha * 0.6,
        dryness: 0.2,
        wet: 0.8,
        taperIn: 0.2,
        taperOut: 0.5,
        seed: tr.seed + 2,
      });
      if (tr.ink === 'heuk') drips(sb, tr, start, sweep, tr.reach * 0.85, alpha, rng);
      break;
    }
    case 'thrust': {
      const ux = Math.cos(tr.aim);
      const uy = Math.sin(tr.aim);
      const len = tr.length * e;
      if (len < 4) return;
      const pts: Vec[] = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        const wob = Math.sin(t * Math.PI) * 4 * tr.dir;
        pts.push({ x: tr.x + ux * len * t - uy * wob, y: tr.y + uy * len * t + ux * wob });
      }
      sb.stroke(pts, { width: W, color: col, alpha, dryness: tr.dryness, taperIn: 0.04, taperOut: 0.8, seed: tr.seed, wet: 0.5 });
      if (tr.ink === 'jeok') {
        // 찌른 자리를 따라 불꽃이 피어오른다
        for (let i = 0; i < 4; i++) {
          const t = 0.25 + i * 0.22;
          if (t > e) continue;
          const bx = tr.x + ux * len * t + (rng() - 0.5) * 6;
          const by = tr.y + uy * len * t + (rng() - 0.5) * 6;
          flame(sb, bx, by, 14 + rng() * 12, 7, (rng() - 0.5) * 10, alpha * 0.95, tr.seed + 10 + i, (rng() - 0.5) * 4);
        }
      }
      break;
    }
    case 'whip': {
      const ux = Math.cos(tr.aim);
      const uy = Math.sin(tr.aim);
      const len = tr.length * e;
      if (len < 4) return;
      const pts: Vec[] = [];
      const n = 10;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const wave = Math.sin(t * Math.PI * 2.2 - q * 5) * 14 * Math.sin(t * Math.PI) * tr.dir;
        pts.push({ x: tr.x + ux * len * t - uy * wave, y: tr.y + uy * len * t + ux * wave });
      }
      sb.stroke(pts, { width: W, color: col, alpha, dryness: tr.dryness, taperIn: 0.05, taperOut: 0.6, seed: tr.seed, wet: 0.3 });
      for (let i = 2; i < n; i += 2) leaf(sb, pts[i], tr.aim + (i % 4 ? 1.1 : -1.1), 11, col, alpha * 0.9, tr.seed + i);
      break;
    }
    case 'slam': {
      // 붓을 내리눌러 찍는 점획(點劃) — 머리는 가늘고 끝에서 눌러 퍼진다
      const top = { x: tr.x - tr.dir * 16, y: tr.y - tr.radius * 1.1 };
      const bottom = { x: tr.x + tr.dir * 6, y: tr.y + tr.radius * 0.12 };
      const pts = [top, { x: lerp(top.x, bottom.x, 0.6) + tr.dir * 5, y: lerp(top.y, bottom.y, 0.6) }, bottom];
      inkStroke(sb, pts, { width: W * 1.35, color: col, alpha, dryness: tr.dryness, taperIn: 0.6, taperOut: 0.12, seed: tr.seed, progress: Math.max(0.05, e), wet: 0.7 }, tr.ink);
      if (q >= 1) impact(sb, tr, tr.radius, alpha, col, rng);
      break;
    }
    case 'burst': {
      // 붉은 먹이 터져 번지고, 그 위로 불길이 솟는다
      const R = tr.radius;
      for (let i = 0; i < 12; i++) {
        const a = rng() * TAU;
        const d = R * (0.45 + rng() * 0.5) * e;
        const x0 = tr.x + Math.cos(a) * d;
        const y0 = tr.y + Math.sin(a) * d * 0.6;
        const l = 3 + rng() * 7;
        sb.stroke([{ x: x0, y: y0 }, { x: x0 + Math.cos(a) * l, y: y0 + Math.sin(a) * l * 0.6 }], { width: 3 + rng() * 4, color: col, alpha: alpha * 0.85, dryness: 0.1, taperIn: 0.4, taperOut: 0.6, seed: tr.seed + i, wet: 0.4 });
      }
      ring(sb, tr.x, tr.y, R * 0.3 * e + 8, W * 1.2, col, alpha * 0.8, tr.seed + 50, 0.1, 0.6);
      const fh = R * 0.95 * e;
      if (fh > 6) {
        flameCluster(sb, tr.x, tr.y + 4, fh, alpha, tr.seed + 60, tr.t);
        flame(sb, tr.x - R * 0.5, tr.y + R * 0.1, fh * 0.45, fh * 0.16, -fh * 0.12, alpha * 0.85, tr.seed + 70, 0);
        flame(sb, tr.x + R * 0.52, tr.y + R * 0.05, fh * 0.5, fh * 0.16, fh * 0.12, alpha * 0.85, tr.seed + 80, 0);
      }
      break;
    }
    case 'quake': {
      // 땅이 갈라진 금, 흙먼지, 튀어 오른 돌
      const gy = tr.y + 12;
      const crackCol = mix(col, INK, 0.6);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + rng() * 0.6;
        const l = tr.radius * (0.55 + rng() * 0.5) * e;
        const pts: Vec[] = [{ x: tr.x, y: gy }];
        let ang = a;
        for (let k = 1; k <= 6; k++) {
          ang += (rng() - 0.5) * 0.9;
          pts.push({ x: tr.x + Math.cos(ang) * l * (k / 6), y: gy + Math.sin(ang) * l * (k / 6) * 0.5 });
        }
        sb.stroke(pts, { width: 3 + rng() * 2.5, color: crackCol, alpha, dryness: 0.75, taperIn: 0.02, taperOut: 0.85, seed: tr.seed + i, wet: 0 });
        // 곁가지 금
        const m = pts[3];
        const ba = a + (rng() < 0.5 ? 0.7 : -0.7);
        sb.stroke([m, { x: m.x + Math.cos(ba) * l * 0.25, y: m.y + Math.sin(ba) * l * 0.12 }], { width: 2, color: crackCol, alpha: alpha * 0.8, dryness: 0.6, taperOut: 0.9, seed: tr.seed + 20 + i });
      }
      // 흙먼지 고리
      ring(sb, tr.x, gy, tr.radius * (0.35 + 0.75 * e), W * 0.9, col, alpha * 0.35 * (1 - e * 0.5), tr.seed + 60, 0.7, 0.5);
      ring(sb, tr.x, gy, tr.radius * (0.2 + 0.6 * e), W * 0.25, crackCol, alpha * 0.6, tr.seed + 61, 0.8, 0.5);
      // 튀어 오른 돌 조각
      for (let i = 0; i < 9; i++) {
        const a = rng() * TAU;
        const d = tr.radius * (0.3 + rng() * 0.7) * e;
        const lift = Math.sin(q * Math.PI) * (10 + rng() * 22);
        const x = tr.x + Math.cos(a) * d;
        const y = gy + Math.sin(a) * d * 0.5 - lift;
        sb.stroke([{ x, y }, { x: x + 2 + rng() * 3, y: y + 1 }], { width: 4 + rng() * 4, color: mix(col, INK, 0.45), alpha, dryness: 0.4, taperIn: 0.3, taperOut: 0.3, seed: tr.seed + 40 + i });
      }
      break;
    }
    case 'vortex': {
      const R = tr.radius;
      for (let k = 0; k < 4; k++) {
        const a0 = (k / 4) * TAU + rng() * 0.5;
        const pts: Vec[] = [];
        const turns = 0.9;
        const n = 14;
        for (let i = 0; i <= n; i++) {
          const t = (i / n) * e;
          const rr = R * (1 - t * 0.92);
          const a = a0 + tr.dir * turns * TAU * t;
          pts.push({ x: tr.x + Math.cos(a) * rr, y: tr.y + Math.sin(a) * rr * 0.8 });
        }
        if (pts.length >= 2) {
          sb.stroke(pts, { width: W * 0.8, color: mix(col, INK, 0.15), alpha, dryness: tr.dryness, taperIn: 0.05, taperOut: 0.55, seed: tr.seed + k, wet: 0.3 });
          for (const at of [0.25, 0.55, 0.8]) {
            const idx = Math.floor((pts.length - 1) * at);
            if (idx > 0) leaf(sb, pts[idx], a0 + tr.dir * (1.5 + at * 3), 13, col, alpha, tr.seed + 20 + k * 3 + Math.floor(at * 10));
          }
        }
      }
      ring(sb, tr.x, tr.y, R, 5, col, alpha * 0.5 * (1 - e), tr.seed + 40, 0.5, 0.8);
      break;
    }
    case 'xslash': {
      for (let k = 0; k < 2; k++) {
        const local = clamp((q - k * 0.45) / 0.55, 0, 1);
        if (local <= 0) continue;
        const ang = tr.aim + (k === 0 ? 0.55 : -0.55) * tr.dir;
        const cx = tr.x + Math.cos(tr.aim) * tr.reach * 0.55;
        const cy = tr.y + Math.sin(tr.aim) * tr.reach * 0.55;
        const half = tr.reach * 0.62;
        const nx = Math.cos(ang + Math.PI / 2);
        const ny = Math.sin(ang + Math.PI / 2);
        const a = { x: cx - nx * half, y: cy - ny * half };
        const b = { x: cx + nx * half, y: cy + ny * half };
        const le = easeOutCubic(local);
        const mid = { x: lerp(a.x, b.x, 0.5) + Math.cos(tr.aim) * 10, y: lerp(a.y, b.y, 0.5) + Math.sin(tr.aim) * 10 };
        const pts = [a, mid, b];
        inkStroke(sb, pts, { width: W, color: col, alpha, dryness: 0.15, taperIn: 0.3, taperOut: 0.5, seed: tr.seed + k * 9 + 1, progress: le }, tr.ink);
      }
      break;
    }
    case 'cast': {
      // 해일을 일으키는 큰 물마루
      const start = tr.aim - tr.dir * 1.2;
      const sweep = tr.dir * 2.4 * e;
      sb.stroke(arcPoints(tr.x, tr.y, 30, start, sweep, 16, 58), { width: W, color: col, alpha, dryness: 0.05, wet: 1, taperIn: 0.25, taperOut: 0.5, seed: tr.seed });
      break;
    }
  }
}

function decorateArc(sb: SB, tr: Trace, start: number, sweep: number, r: number, alpha: number, rng: () => number): void {
  const col = inkColor(tr.ink);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5 + (rng() - 0.5) * 0.6) / n;
    const a = start + sweep * t;
    const px = tr.x + Math.cos(a) * r;
    const py = tr.y + Math.sin(a) * r;
    const out = a;
    switch (tr.ink) {
      case 'jeok':
        if (i % 2 === 0) flame(sb, px, py, 16 + rng() * 14, 7 + rng() * 3, (rng() - 0.5) * 12, alpha * 0.95, tr.seed + 30 + i, (rng() - 0.5) * 4);
        break;
      case 'cheong':
        if (tr.step === 1) {
          // 가시
          sb.stroke([{ x: px, y: py }, { x: px + Math.cos(out) * 16, y: py + Math.sin(out) * 16 }], { width: 5, color: mix(col, INK, 0.3), alpha, dryness: 0.2, taperIn: 0, taperOut: 0.95, seed: tr.seed + 30 + i });
        } else leaf(sb, { x: px, y: py }, out + tr.dir * 0.8, 11, col, alpha, tr.seed + 30 + i);
        break;
      case 'hwang':
        sb.stroke([{ x: px + Math.cos(out) * 4, y: py + Math.sin(out) * 4 }, { x: px + Math.cos(out) * 9, y: py + Math.sin(out) * 9 }], {
          width: 5 + rng() * 4,
          color: mix(col, INK, 0.4),
          alpha,
          dryness: 0.7,
          taperIn: 0.3,
          taperOut: 0.3,
          seed: tr.seed + 30 + i,
        });
        break;
      case 'baek':
        if (i === 0) {
          // 칼날 끝에서 번뜩이는 선
          const tan = a + (tr.dir * Math.PI) / 2;
          const ex = tr.x + Math.cos(start + sweep) * r;
          const ey = tr.y + Math.sin(start + sweep) * r;
          sb.stroke([{ x: ex - Math.cos(tan) * 26, y: ey - Math.sin(tan) * 26 }, { x: ex + Math.cos(tan) * 26, y: ey + Math.sin(tan) * 26 }], {
            width: 3,
            color: mix(col, INK, 0.6),
            alpha: alpha * 0.6,
            dryness: 0.1,
            taperIn: 0.5,
            taperOut: 0.5,
            seed: tr.seed + 40,
          });
        }
        break;
      case 'heuk':
        if (i % 2 === 0) drip(sb, px, py, 8 + rng() * 10, col, alpha, tr.seed + 30 + i);
        break;
      default:
        break;
    }
  }
}

function drips(sb: SB, tr: Trace, start: number, sweep: number, r: number, alpha: number, rng: () => number): void {
  for (let i = 0; i < 6; i++) {
    const a = start + sweep * ((i + 0.5) / 6);
    drip(sb, tr.x + Math.cos(a) * r, tr.y + Math.sin(a) * r, 8 + rng() * 10, inkColor(tr.ink), alpha, tr.seed + 70 + i);
  }
}

function drip(sb: SB, x: number, y: number, l: number, col: RGB, alpha: number, seed: number): void {
  sb.stroke([{ x, y }, { x: x + 1, y: y + l * 0.6 }, { x, y: y + l }], { width: 4, color: col, alpha: alpha * 0.8, dryness: 0.05, wet: 0.8, taperIn: 0.1, taperOut: 0.4, seed });
}

const LEAF: RGB = [74, 128, 104];

/** 잎 하나 — 몰골법(沒骨法)처럼 한 번 눌러 그린다 */
function leaf(sb: SB, p: Vec, a: number, l: number, col: RGB, alpha: number, seed: number): void {
  const tip = { x: p.x + Math.cos(a) * l, y: p.y + Math.sin(a) * l };
  const mid = { x: p.x + Math.cos(a + 0.3) * l * 0.55, y: p.y + Math.sin(a + 0.3) * l * 0.55 };
  sb.stroke([p, mid, tip], { width: l * 0.62, color: mix(col, LEAF, 0.6), alpha, dryness: 0.1, taperIn: 0.3, taperOut: 0.75, seed, wet: 0.35, edgeInk: 0.5 });
}

const FLAME_IN: RGB = [232, 150, 62];

/**
 * 화염문(火焰紋) 한 갈래 — 밑동이 넓고 위로 갈수록 S자로 휘며 끝이 말린다.
 * lean은 끝이 기우는 쪽, sway는 바람에 흔들리는 정도.
 */
export function flame(sb: SB, x: number, y: number, h: number, w: number, lean: number, alpha: number, seed: number, sway = 0): void {
  const col = INKS.jeok.color;
  const pts = [
    { x, y },
    { x: x + lean * 0.15 + sway, y: y - h * 0.35 },
    { x: x - lean * 0.25 - sway * 0.6, y: y - h * 0.68 },
    { x: x + lean, y: y - h },
  ];
  sb.stroke(pts, { width: w, color: col, alpha, dryness: 0.3, wet: 0.25, taperIn: 0.04, taperOut: 0.8, seed });
  const inner = [
    { x: x + lean * 0.05, y: y - h * 0.05 },
    { x: x + lean * 0.1 + sway * 0.8, y: y - h * 0.32 },
    { x: x - lean * 0.15 - sway * 0.5, y: y - h * 0.55 },
  ];
  sb.stroke(inner, { width: w * 0.5, color: FLAME_IN, alpha: alpha * 0.9, dryness: 0.15, wet: 0, taperIn: 0.1, taperOut: 0.85, seed: seed + 1, edgeInk: 0.1 });
}

/** 가운데 큰 불꽃과 양옆의 작은 불꽃 */
export function flameCluster(sb: SB, x: number, y: number, h: number, alpha: number, seed: number, time: number): void {
  const f = (k: number): number => Math.sin(time * 9 + seed * 0.7 + k * 2.1);
  flame(sb, x - h * 0.28, y + 1, h * (0.55 + 0.08 * f(1)), h * 0.28, -h * 0.18, alpha * 0.9, seed + 10, f(2) * h * 0.05);
  flame(sb, x + h * 0.28, y + 1, h * (0.6 + 0.08 * f(3)), h * 0.28, h * 0.2, alpha * 0.9, seed + 20, f(4) * h * 0.05);
  flame(sb, x, y, h * (1 + 0.1 * f(5)), h * 0.4, h * 0.12 * f(6), alpha, seed + 30, f(7) * h * 0.06);
}

function impact(sb: SB, tr: Trace, r: number, alpha: number, col: RGB, rng: () => number): void {
  const gy = tr.y + r * 0.12;
  const crack = tr.ink === 'hwang' ? mix(col, INK, 0.55) : col;
  // 땅에 낮게 퍼지는 금
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const a = (side > 0 ? 0 : Math.PI) + (rng() - 0.5) * 1.1;
    const l = r * (0.5 + rng() * 0.5);
    const pts: Vec[] = [{ x: tr.x, y: gy }];
    let ang = a;
    for (let k = 1; k <= 3; k++) {
      ang += (rng() - 0.5) * 0.6;
      pts.push({ x: tr.x + Math.cos(ang) * l * (k / 3), y: gy + Math.sin(ang) * l * (k / 3) * 0.4 });
    }
    sb.stroke(pts, { width: 2.5 + rng() * 2, color: crack, alpha: alpha * 0.85, dryness: 0.7, taperIn: 0.02, taperOut: 0.85, seed: tr.seed + 80 + i });
  }
  // 튄 먹 또는 돌 조각
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI * (0.1 + rng() * 0.8);
    const d = r * (0.5 + rng() * 0.6);
    const x = tr.x + Math.cos(a) * d;
    const y = gy + Math.sin(a) * d * 0.55;
    sb.stroke([{ x, y }, { x: x + Math.cos(a) * 3, y: y + Math.sin(a) * 3 }], { width: 3 + rng() * 3, color: crack, alpha: alpha * 0.9, dryness: 0.3, taperIn: 0.3, taperOut: 0.4, seed: tr.seed + 90 + i });
  }
}

/** 원상(圓相) — 붓으로 한 번에 그린 고리 */
function ring(sb: SB, x: number, y: number, r: number, w: number, col: RGB, alpha: number, seed: number, dryness = 0.4, squash = 1, progress = 1): void {
  if (r < 2 || alpha < 0.01) return;
  const start = (seed % 628) / 100;
  sb.stroke(arcPoints(x, y, r, start, TAU * 0.94, 30, r * 1.02, squash), { width: w, color: col, alpha, dryness, taperIn: 0.08, taperOut: 0.3, seed, progress, wet: 0.3 });
}

/* ───────── 고리 ───────── */

export function drawRing(sb: SB, r: Ring): void {
  const t = 1 - r.life / r.maxLife;
  const e = easeOutCubic(t);
  const rad = lerp(r.r0, r.r1, e);
  switch (r.kind) {
    case 'enso':
      ring(sb, r.x, r.y, rad, r.width * (1 - t * 0.6), r.color, 1 - t * t, r.seed, 0.35, 0.85, Math.min(1, t * 3));
      break;
    case 'spawn':
      ring(sb, r.x, r.y + 4, rad, r.width, r.color, (1 - t) * 0.7, r.seed, 0.2, 0.6);
      break;
    case 'shock':
      ring(sb, r.x, r.y, rad, r.width * (1 - t * 0.5), mix(r.color, INK, 0.25), (1 - t) * 0.9, r.seed, 0.8, 0.7);
      break;
    case 'burst': {
      const rng = mulberry32(r.seed);
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rng() * 0.5;
        const l0 = rad * 0.7;
        const l1 = rad * (1 + rng() * 0.3);
        sb.stroke([{ x: r.x + Math.cos(a) * l0, y: r.y + Math.sin(a) * l0 }, { x: r.x + Math.cos(a) * l1, y: r.y + Math.sin(a) * l1 }], {
          width: r.width * (1 - t * 0.5),
          color: r.color,
          alpha: (1 - t) * 0.85,
          dryness: 0.3,
          taperIn: 0.1,
          taperOut: 0.9,
          seed: r.seed + i,
        });
      }
      break;
    }
    case 'crack': {
      const rng = mulberry32(r.seed);
      for (let i = 0; i < 6; i++) {
        const a = rng() * TAU;
        const pts: Vec[] = [{ x: r.x, y: r.y }];
        let ang = a;
        for (let k = 1; k <= 3; k++) {
          ang += (rng() - 0.5) * 0.8;
          pts.push({ x: r.x + Math.cos(ang) * rad * (k / 3), y: r.y + Math.sin(ang) * rad * (k / 3) * 0.75 });
        }
        sb.stroke(pts, { width: r.width, color: mix(INKS.hwang.color, INK, 0.4), alpha: 1 - t, dryness: 0.85, taperOut: 0.9, seed: r.seed + i });
      }
      break;
    }
  }
}

/* ───────── 바닥 ───────── */

export function drawZone(sb: SB, z: Zone, time: number): void {
  const life = z.life / z.maxLife;
  const fadeIn = clamp((z.maxLife - z.life) / 0.25, 0, 1);
  const a = Math.min(fadeIn, clamp(z.life / 0.6, 0, 1));
  switch (z.kind) {
    case 'pool': {
      // 잔물결
      for (let k = 0; k < 2; k++) {
        const ph = (time * 0.7 + k * 0.5 + (z.seed % 10) * 0.1) % 1;
        ring(sb, z.x, z.y, z.r * (0.35 + ph * 0.7), 2.2, DAMMUK, a * (1 - ph) * 0.55, z.seed + k, 0.4, 0.55);
      }
      break;
    }
    case 'thorns': {
      // 가시덤불 — 가는 줄기에 가시와 잎
      const rng = mulberry32(z.seed);
      const col = mix(INKS.cheong.color, INK, 0.2);
      const grow = Math.min(1, fadeIn * 1.5);
      for (let i = 0; i < 6; i++) {
        const ang = rng() * TAU;
        const rr = Math.sqrt(rng()) * z.r * 0.8;
        const x = z.x + Math.cos(ang) * rr;
        const y = z.y + Math.sin(ang) * rr * 0.55;
        const h = (16 + rng() * 16) * grow;
        const lean = (rng() - 0.5) * 18 + Math.sin(time * 1.5 + i) * 1.5;
        const stem = [{ x, y }, { x: x + lean * 0.3, y: y - h * 0.5 }, { x: x + lean, y: y - h }];
        sb.stroke(stem, { width: 2.6, color: col, alpha: a, dryness: 0.35, taperIn: 0.02, taperOut: 0.6, seed: z.seed + i });
        for (let k = 1; k <= 3; k++) {
          const t = k / 4;
          const px = x + lean * t * t;
          const py = y - h * t;
          const side = k % 2 ? 1 : -1;
          sb.stroke([{ x: px, y: py }, { x: px + side * 4, y: py - 2.5 }], { width: 1.8, color: INK, alpha: a * 0.9, taperIn: 0, taperOut: 0.95, seed: z.seed + 10 + i * 3 + k });
        }
        if (i % 2 === 0) leaf(sb, { x: x + lean * 0.4, y: y - h * 0.55 }, -Math.PI / 2 + (lean > 0 ? 1 : -1), 9, INKS.cheong.color, a * 0.95, z.seed + 30 + i);
      }
      break;
    }
    case 'embers': {
      const rng = mulberry32(z.seed);
      for (let i = 0; i < 6; i++) {
        const ang = rng() * TAU;
        const rr = Math.sqrt(rng()) * z.r * 0.75;
        const x = z.x + Math.cos(ang) * rr;
        const y = z.y + Math.sin(ang) * rr * 0.6;
        const flick = 0.75 + 0.25 * Math.sin(time * 9 + i * 1.7);
        const h = (12 + rng() * 14) * flick * Math.min(1, life * 2);
        flame(sb, x, y, h, h * 0.42, (rng() - 0.5) * h * 0.5, a * 0.9, z.seed + i * 3, Math.sin(time * 6 + i) * 2);
      }
      break;
    }
  }
}

/* ───────── 투사체 ───────── */

export function drawProjectile(sb: SB, p: Projectile): void {
  const ang = Math.atan2(p.vy, p.vx);
  const life = p.life / p.maxLife;
  switch (p.kind) {
    case 'blade': {
      const col = INKS.baek.color;
      const a = Math.min(1, life * 3);
      const cx = p.x - Math.cos(ang) * 14;
      const cy = p.y - Math.sin(ang) * 14;
      const pts = arcPoints(cx, cy, p.r * 1.2, ang - 1.15, 2.3, 12);
      if (p.trail.length > 2) sb.stroke(p.trail, { width: 9, color: DAMMUK, alpha: a * 0.3, dryness: 0.7, taperIn: 0.9, taperOut: 0.05, seed: p.seed + 2 });
      inkStroke(sb, pts, { width: 8, color: col, alpha: a, dryness: 0.1, taperIn: 0.45, taperOut: 0.45, seed: p.seed + 1 }, 'baek');
      break;
    }
    case 'wave': {
      const col = INKS.heuk.color;
      const a = Math.min(1, life * 2.5);
      const pts = arcPoints(p.x - Math.cos(ang) * p.r * 0.6, p.y - Math.sin(ang) * p.r * 0.6, p.r, ang - 1.1, 2.2, 16);
      sb.stroke(pts, { width: 26, color: col, alpha: a, dryness: 0.05, wet: 1, taperIn: 0.3, taperOut: 0.3, seed: p.seed });
      // 물보라
      const rng = mulberry32(p.seed + Math.floor(p.life * 20));
      for (let i = 0; i < 5; i++) {
        const t = 0.15 + rng() * 0.7;
        const q = pts[Math.floor(t * (pts.length - 1))];
        const l = 8 + rng() * 10;
        sb.stroke([q, { x: q.x + Math.cos(ang) * l, y: q.y + Math.sin(ang) * l - 6 }], { width: 4, color: col, alpha: a * 0.7, dryness: 0.1, taperOut: 0.9, seed: p.seed + 10 + i });
      }
      if (p.trail.length > 2) sb.stroke(p.trail, { width: p.r * 0.9, color: col, alpha: a * 0.18, dryness: 0.4, wet: 1, taperIn: 0.9, taperOut: 0.1, seed: p.seed + 3 });
      break;
    }
    case 'glob': {
      if (p.trail.length > 2) sb.stroke(p.trail, { width: p.r * 1.2, color: inkColor(p.ink), alpha: 0.35, dryness: 0.3, wet: 0.6, taperIn: 0.9, taperOut: 0.05, seed: p.seed });
      break;
    }
  }
}

/* ───────── 상태 ───────── */

export function drawStatus(sb: SB, e: Enemy, time: number): void {
  const top = e.y - e.r * (e.kind === 'brute' ? 2.4 : e.kind === 'drop' ? 2.2 : 1.6);
  if (e.burnStacks > 0) {
    const h = (e.r * 0.9 + 6) * (0.8 + 0.12 * Math.min(4, e.burnStacks));
    const bodyTop = e.y - e.r * (e.kind === 'brute' ? 1.7 : e.kind === 'drop' ? 1.5 : 1.1);
    flameCluster(sb, e.x, bodyTop + e.r * 0.5, h, 0.9, e.seed, time);
  }
  if (e.rootT > 0) {
    const col = mix(INKS.cheong.color, INK, 0.15);
    const a = Math.min(1, e.rootT * 3);
    const grow = Math.min(1, (e.rootT > 0 ? 1 : 0) * a);
    for (let k = 0; k < 2; k++) {
      const pts: Vec[] = [];
      const a0 = k * Math.PI + (e.seed % 7);
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * grow;
        const ang = a0 + t * TAU * 1.35;
        const rx = e.r * (1.15 - t * 0.25);
        pts.push({ x: e.x + Math.cos(ang) * rx, y: e.y - 2 - t * e.r * 1.1 + Math.sin(ang) * rx * 0.38 });
      }
      sb.stroke(pts, { width: 3.6, color: col, alpha: a, dryness: 0.3, taperIn: 0.02, taperOut: 0.6, seed: e.seed + 50 + k });
      leaf(sb, pts[6], -Math.PI / 2 + (k ? 0.9 : -0.9), 9, INKS.cheong.color, a, e.seed + 60 + k);
      leaf(sb, pts[12], -Math.PI / 2 + (k ? -0.7 : 0.7), 7, INKS.cheong.color, a, e.seed + 70 + k);
    }
  }
  if (e.stunT > 0) {
    const col = mix(INKS.hwang.color, INK, 0.2);
    for (let i = 0; i < 3; i++) {
      const ang = time * 5 + (i / 3) * TAU;
      const x = e.x + Math.cos(ang) * e.r * 0.8;
      const y = top - 4 + Math.sin(ang) * e.r * 0.25;
      sb.stroke([{ x: x - 3, y: y - 2 }, { x: x + 3, y: y + 2 }], { width: 5, color: col, alpha: 0.95, dryness: 0.2, taperIn: 0.3, taperOut: 0.3, seed: e.seed + 70 + i });
    }
  }
  if (e.slowT > 0 || e.inPool) {
    ring(sb, e.x, e.y + 2, e.r * 1.25, 2.5, INKS.heuk.color, 0.45, e.seed + 80, 0.3, 0.45);
  }
  // 큰 놈은 다친 정도를 붓 획으로
  if ((e.kind === 'brute' || e.kind === 'toad') && e.hp < e.maxHp) {
    const w = e.r * 1.6;
    const y = top - 10;
    const frac = clamp(e.hp / e.maxHp, 0, 1);
    sb.stroke([{ x: e.x - w / 2, y }, { x: e.x + w / 2, y }], { width: 4, color: DAMMUK, alpha: 0.25, dryness: 0.5, taperIn: 0.05, taperOut: 0.05, seed: e.seed + 90 });
    sb.stroke([{ x: e.x - w / 2, y }, { x: e.x - w / 2 + w * frac, y }], { width: 4, color: inkColor(e.el) === INKS.baek.color ? DAMMUK : inkColor(e.el), alpha: 0.9, dryness: 0.4, taperIn: 0.05, taperOut: 0.1, seed: e.seed + 91 });
  }
}

/* ───────── 붓잡이의 팔과 붓 ───────── */

export function brushPose(pl: Player): number {
  const a = pl.action;
  if (!a) return pl.aim + Math.sin(pl.walk * 1.3) * 0.08 + 0.25 * pl.facing;
  const m = a.move;
  const s = m.shape;
  const start = s.type === 'arc' ? a.aim - (a.dir * s.arc) / 2 : s.type === 'spin' ? a.aim + Math.PI : a.aim;
  const sweep = s.type === 'arc' ? a.dir * s.arc : s.type === 'spin' ? a.dir * TAU : 0;
  if (s.type === 'circle' || m.visual === 'slam') {
    const raised = -Math.PI / 2 - pl.facing * 0.3;
    if (a.phase === 'windup') return lerp(a.aim, raised, easeOutCubic(clamp(a.t / m.windup, 0, 1)));
    if (a.phase === 'active') return lerp(raised, a.aim + 0.5 * pl.facing, easeOutCubic(clamp(a.t / m.active, 0, 1)));
    return a.aim + 0.5 * pl.facing;
  }
  if (a.phase === 'windup') return start - a.dir * 0.5 * easeOutCubic(clamp(a.t / m.windup, 0, 1));
  if (a.phase === 'active') return start + sweep * easeOutCubic(clamp(a.t / m.active, 0, 1));
  const end = start + sweep;
  return lerp(end, pl.aim, easeOutCubic(clamp(a.t / m.recovery, 0, 1)));
}

export function drawPlayerGear(sb: SB, pl: Player, col: RGB, potency: number, bob: number, time: number): void {
  const ang = brushPose(pl);
  pl.brushAngle = ang;
  const sx = pl.x + 3 * pl.facing;
  const sy = pl.y - 31 + bob;
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const hx = sx + ux * 11;
  const hy = sy + uy * 9;
  // 흰 소매에 먹선
  const sleeve = [{ x: sx, y: sy }, { x: (sx + hx) / 2, y: (sy + hy) / 2 + 2 }, { x: hx, y: hy }];
  sb.stroke(sleeve, { width: 9.5, color: INK, alpha: 0.9, dryness: 0.3, taperIn: 0.05, taperOut: 0.15, seed: 401, wet: 0 });
  sb.stroke(sleeve, { width: 6.5, color: ROBE, alpha: 1, dryness: 0, taperIn: 0.05, taperOut: 0.2, seed: 405, wet: 0, edgeInk: 0 });
  sb.stroke([{ x: hx - ux * 1.5, y: hy - uy * 1.5 }, { x: hx + ux * 2, y: hy + uy * 2 }], { width: 4.5, color: [214, 184, 150], alpha: 1, dryness: 0, taperIn: 0, taperOut: 0, seed: 406, wet: 0, edgeInk: 0.8 });
  // 붓대
  const len = 24 + potency * 4;
  sb.stroke([{ x: hx - ux * 8, y: hy - uy * 8 }, { x: hx + ux * len, y: hy + uy * len }], { width: 3.4, color: BAMBOO, alpha: 1, dryness: 0.25, taperIn: 0, taperOut: 0.05, seed: 402, edgeInk: 0.6 });
  sb.stroke([{ x: hx + ux * (len - 1), y: hy + uy * (len - 1) }, { x: hx + ux * (len + 3), y: hy + uy * (len + 3) }], { width: 4.6, color: INK, alpha: 1, dryness: 0.1, taperIn: 0, taperOut: 0, seed: 403 });
  // 붓털 — 주속성 먹을 머금었다
  const tipLen = 15 + potency * 5;
  const wob = Math.sin(time * 3) * 0.06;
  const tx = hx + ux * (len + 2);
  const ty = hy + uy * (len + 2);
  sb.stroke(
    [
      { x: tx, y: ty },
      { x: tx + Math.cos(ang + wob) * tipLen * 0.5, y: ty + Math.sin(ang + wob) * tipLen * 0.5 },
      { x: tx + Math.cos(ang + wob * 2) * tipLen, y: ty + Math.sin(ang + wob * 2) * tipLen },
    ],
    { width: 8.5, color: col, alpha: 1, dryness: 0.15, wet: 0.6, taperIn: 0.1, taperOut: 0.85, seed: 404, edgeInk: 0.5 },
  );
}

/** 허리끈 — 주속성 먹의 색이 몸에 드러난다 */
export function drawSash(sb: SB, pl: Player, col: RGB, bob: number, time: number): void {
  const y = pl.y - 21 + bob;
  sb.stroke([{ x: pl.x - 10, y: y + 0.5 }, { x: pl.x, y: y + 1.5 }, { x: pl.x + 10, y }], { width: 4, color: col, alpha: 0.95, dryness: 0.25, taperIn: 0.05, taperOut: 0.05, seed: 410 });
  const back = -pl.facing;
  const flutter = Math.sin(time * 8 + pl.walk) * 3;
  const sp = Math.min(1, Math.hypot(pl.vx, pl.vy) / 200);
  sb.stroke(
    [
      { x: pl.x + back * 7, y: y + 1 },
      { x: pl.x + back * (13 + sp * 4), y: y + 5 + flutter * 0.5 },
      { x: pl.x + back * (18 + sp * 10), y: y + 9 - sp * 6 + flutter },
    ],
    { width: 3.2, color: col, alpha: 0.9, dryness: 0.3, taperIn: 0.05, taperOut: 0.8, seed: 411 },
  );
}

export function drawDashTrail(sb: SB, pl: Player): void {
  if (pl.trail.length < 2) return;
  const a = pl.dashT > 0 ? 0.85 : Math.min(0.85, pl.trailFade * 2);
  sb.stroke(pl.trail, { width: 20, color: DAMMUK, alpha: a, dryness: 0.92, taperIn: 0.05, taperOut: 0.5, seed: 420, wet: 0.1 });
}

