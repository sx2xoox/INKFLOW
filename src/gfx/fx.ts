/**
 * 움직이는 획들. 콤보의 궤적, 고리, 바닥 효과, 투사체, 상태 표시를
 * 매 프레임 붓질 묶음(StrokeBatch)에 써 넣는다.
 */
import { type Vec, TAU, clamp, easeOutCubic, lerp } from '../core/math';
import { mulberry32 } from '../core/rng';
import { INKS, inkColor } from '../ink';
import type { Bell, Enemy, Gate, Player, Projectile, Ring, Trace, Zone } from '../game/types';
import { LAND_R, SWIPE_HALF, SWIPE_REACH } from '../game/boss';
import { BITE_LEN, BURST_R, SPIT_SPREAD, spitCount } from '../game/imugi';
import { FOX_APPEAR, LION_AIM, lionCracked } from '../game/enemies';
import { GUST_BEATS, PLUNGE_R, PLUNGE_WIND, SWEEP_HALF, VOLLEY_SPREAD, volleyCount } from '../game/phoenix';
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
    case 'claw': {
      // 묵호의 앞발 — 나란한 발톱 자국 셋이 부채꼴을 가로지른다
      const half = tr.arc / 2;
      const start = tr.aim - tr.dir * half * 0.85;
      const sweep = tr.dir * half * 1.7 * e;
      if (Math.abs(sweep) < 0.05) return;
      for (let i = -1; i <= 1; i++) {
        const r0 = tr.reach * 0.62 + i * 13;
        const pts = arcPoints(tr.x, tr.y, r0, start + i * tr.dir * 0.08, sweep, 14, r0 + 10, 0.8);
        sb.stroke(pts, { width: W * 2.4, color: INK, alpha: alpha * 0.28, dryness: 0.7, taperIn: 0.3, taperOut: 0.5, seed: tr.seed + 10 + i, wet: 0.5 });
        inkStroke(sb, pts, { width: W * (1 - Math.abs(i) * 0.2), color: col, alpha, dryness: 0.35, taperIn: 0.35, taperOut: 0.7, seed: tr.seed + i, wet: 0.3 }, tr.ink);
      }
      break;
    }
    case 'rake': {
      // 내달린 자리 — 바닥을 긁고 지나간 마른 붓
      const len = tr.length * e;
      if (len < 6) return;
      const dx = Math.cos(tr.aim);
      const dy = Math.sin(tr.aim);
      const pts = [0, 0.33, 0.66, 1].map((k) => ({ x: tr.x + dx * len * k + (rng() - 0.5) * 6, y: tr.y + dy * len * k + (rng() - 0.5) * 6 }));
      inkStroke(sb, pts, { width: W, color: col, alpha: alpha * 0.7, dryness: 0.78, taperIn: 0.05, taperOut: 0.35, seed: tr.seed, wet: 0.2, bristles: 14 }, tr.ink);
      for (const off of [-1, 1]) {
        sb.stroke(pts.map((p) => ({ x: p.x - dy * off * W * 0.55, y: p.y + dx * off * W * 0.55 })), {
          width: 3,
          color: INK,
          alpha: alpha * 0.55,
          dryness: 0.8,
          taperIn: 0.1,
          taperOut: 0.5,
          seed: tr.seed + 5 + off,
        });
      }
      break;
    }
  }
}

/** 이무기의 다음 수 — 물어뜯을 줄, 뿜을 부채, 치솟을 자리 */
export function drawImugiTells(sb: SB, e: Enemy, t: number): void {
  const b = e.boss;
  if (!b) return;
  switch (b.move) {
    case 'bite': {
      if (b.t >= b.wind) return;
      const k = clamp(b.t / b.wind, 0, 1);
      const len = BITE_LEN;
      const pts = [
        { x: e.x, y: e.y },
        { x: e.x + b.ax * len, y: e.y + b.ay * len },
      ];
      sb.stroke(pts, { width: 10 + 40 * k * k, color: TELL, alpha: 0.1 + 0.12 * k, dryness: 0.85, taperIn: 0.05, taperOut: 0.3, seed: e.seed + 31, progress: Math.min(1, k * 2) });
      sb.stroke(pts, { width: 3, color: TELL, alpha: 0.35 + 0.45 * k, dryness: 0.55, taperIn: 0.1, taperOut: 0.3, seed: e.seed + 32, progress: Math.min(1, k * 2) });
      return;
    }
    case 'spit': {
      if (b.t >= b.wind) return;
      const k = clamp(b.t / b.wind, 0, 1);
      const n = spitCount(b);
      const base = Math.atan2(b.ay, b.ax);
      for (let i = 0; i < n; i++) {
        const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * SPIT_SPREAD);
        sb.stroke([{ x: e.x + Math.cos(a) * 30, y: e.y + Math.sin(a) * 30 }, { x: e.x + Math.cos(a) * 170, y: e.y + Math.sin(a) * 170 }], {
          width: 3,
          color: TELL,
          alpha: 0.25 + 0.45 * k,
          dryness: 0.65,
          taperIn: 0.3,
          taperOut: 0.7,
          seed: e.seed + 40 + i,
          progress: Math.min(1, k * 1.6),
        });
      }
      return;
    }
    case 'burrow': {
      const k = clamp(b.t / b.dur, 0, 1);
      const pulse = 1 + 0.04 * Math.sin(t * 16);
      ring(sb, b.tx, b.ty, BURST_R * pulse, 4.5, TELL, 0.3 + 0.5 * k, e.seed + 51, 0.55, 0.7, Math.min(1, k * 1.4));
      ring(sb, b.tx, b.ty, BURST_R * 0.5 * k, 9 * k, TELL, 0.12 + 0.14 * k, e.seed + 52, 0.85, 0.7);
      return;
    }
  }
}

/** 붉은 먹으로 미리 그려 보이는 묵호의 다음 수 */
const TELL: RGB = [172, 50, 38];

/** 산사의 먹귀 — 여우가 물 쪽, 돌사자가 내달을 줄 */
export function drawTempleTells(sb: SB, e: Enemy): void {
  if (e.kind === 'fox' && e.ai === 2) {
    const k = clamp(1 - e.aiT / FOX_APPEAR, 0, 1);
    const pts = [
      { x: e.x + e.tx * 14, y: e.y - 8 + e.ty * 14 },
      { x: e.x + e.tx * 104, y: e.y - 8 + e.ty * 104 },
    ];
    sb.stroke(pts, { width: 4 + 18 * k, color: TELL, alpha: 0.1 + 0.12 * k, dryness: 0.8, taperIn: 0.1, taperOut: 0.5, seed: e.seed + 1, progress: Math.min(1, k * 2.2) });
    sb.stroke(pts, { width: 2.6, color: TELL, alpha: 0.4 + 0.45 * k, dryness: 0.5, taperIn: 0.1, taperOut: 0.6, seed: e.seed + 2, progress: Math.min(1, k * 2.2) });
    ring(sb, e.x, e.y, 22, 2.4, TELL, 0.5 * (1 - k * 0.5), e.seed + 3, 0.5, 0.55);
  }
  if (e.kind === 'lion' && e.ai === 2) {
    const k = clamp(1 - e.aiT / LION_AIM, 0, 1);
    const len = 520;
    const pts = [
      { x: e.x, y: e.y },
      { x: e.x + Math.cos(e.face) * len, y: e.y + Math.sin(e.face) * len },
    ];
    sb.stroke(pts, { width: 6 + 30 * k * k, color: TELL, alpha: 0.1 + 0.12 * k, dryness: 0.85, taperIn: 0.05, taperOut: 0.4, seed: e.seed + 5, progress: Math.min(1, k * 2) });
    sb.stroke(pts, { width: 3, color: TELL, alpha: 0.35 + 0.45 * k, dryness: 0.55, taperIn: 0.1, taperOut: 0.5, seed: e.seed + 6, progress: Math.min(1, k * 2) });
  }
}

/** 봉황의 다음 수 — 깃털 부채, 내리꽂힐 원, 활공할 띠, 날개 바람 */
export function drawPhoenixTells(sb: SB, e: Enemy, t: number): void {
  const b = e.boss;
  if (!b) return;
  switch (b.move) {
    case 'volley': {
      if (b.t >= b.wind) return;
      const k = clamp(b.t / b.wind, 0, 1);
      const n = volleyCount(b);
      const base = Math.atan2(b.ay, b.ax) + (b.chain % 2 === 0 ? 0.5 / n : 0);
      for (let i = 0; i < n; i++) {
        const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * VOLLEY_SPREAD);
        sb.stroke([{ x: e.x + Math.cos(a) * 40, y: e.y + Math.sin(a) * 40 }, { x: e.x + Math.cos(a) * 200, y: e.y + Math.sin(a) * 200 }], {
          width: 3,
          color: TELL,
          alpha: 0.22 + 0.45 * k,
          dryness: 0.65,
          taperIn: 0.3,
          taperOut: 0.7,
          seed: e.seed + 40 + i,
          progress: Math.min(1, k * 1.6),
        });
      }
      return;
    }
    case 'soar':
    case 'plunge': {
      if (b.move === 'soar' && b.t < b.dur * 0.55) return;
      const k = b.move === 'soar' ? 0.15 * clamp((b.t - b.dur * 0.55) / (b.dur * 0.45), 0, 1) : clamp(b.t / PLUNGE_WIND, 0, 1);
      const x = b.move === 'soar' ? e.x : b.tx;
      const y = b.move === 'soar' ? e.y : b.ty;
      const pulse = 1 + 0.03 * Math.sin(t * 18);
      ring(sb, x, y, PLUNGE_R * pulse, 4.5, TELL, 0.25 + 0.5 * k, e.seed + 11, 0.55, 0.7, Math.min(1, 0.3 + k * 1.4));
      ring(sb, x, y, PLUNGE_R * 0.55 * k, 9 * k, TELL, 0.12 + 0.12 * k, e.seed + 12, 0.85, 0.7);
      return;
    }
    case 'climb':
    case 'sweep': {
      if (b.move === 'sweep' && b.t >= b.wind) return;
      const k = b.move === 'climb' ? 0.25 * clamp(b.t / b.dur, 0, 1) : 0.25 + 0.75 * clamp(b.t / b.wind, 0, 1);
      const pts = [
        { x: b.sx, y: b.sy },
        { x: b.tx, y: b.ty },
      ];
      sb.stroke(pts, { width: SWEEP_HALF * 2 * (0.6 + 0.4 * k), color: TELL, alpha: 0.08 + 0.12 * k, dryness: 0.85, wet: 0.5, taperIn: 0.05, taperOut: 0.05, seed: e.seed + 21, progress: Math.min(1, k * 1.8) });
      sb.stroke(pts, { width: 3, color: TELL, alpha: 0.25 + 0.5 * k, dryness: 0.55, taperIn: 0.1, taperOut: 0.2, seed: e.seed + 22, progress: Math.min(1, k * 1.8) });
      // 갈 쪽을 가리키는 꺾쇠
      const len = Math.hypot(b.tx - b.sx, b.ty - b.sy) || 1;
      const ux = (b.tx - b.sx) / len;
      const uy = (b.ty - b.sy) / len;
      for (let i = 1; i <= 4; i++) {
        const q = (i / 5) * Math.min(1, k * 1.8);
        const cx = b.sx + (b.tx - b.sx) * q;
        const cy = b.sy + (b.ty - b.sy) * q;
        sb.stroke(
          [
            { x: cx - ux * 14 - uy * 16, y: cy - uy * 14 + ux * 16 },
            { x: cx, y: cy },
            { x: cx - ux * 14 + uy * 16, y: cy - uy * 14 - ux * 16 },
          ],
          { width: 3, color: TELL, alpha: 0.3 + 0.4 * k, dryness: 0.5, taperIn: 0.2, taperOut: 0.2, seed: e.seed + 30 + i },
        );
      }
      return;
    }
    case 'gust': {
      // 바람 — 다치지는 않으니 붉지 않게, 담묵의 결로
      for (const at of GUST_BEATS) {
        const k = clamp(1 - Math.abs(b.t - at) / 0.35, 0, 1);
        if (k <= 0) continue;
        for (let j = 0; j < 3; j++) {
          const r = 60 + j * 50 + (b.t - at + 0.35) * 260;
          ring(sb, e.x, e.y - b.z * 0.3, r, 3, DAMMUK, 0.35 * k * (1 - j * 0.25), e.seed + 60 + j, 0.8, 0.6, 0.45);
        }
      }
      return;
    }
  }
}

/** 범종의 울림 — 종 둘레로 번지는 소리의 결, 다시 칠 수 있을 때까지 차오르는 고리 */
export function drawBell(sb: SB, b: Bell, hang: number, cd: number, t: number): void {
  const bronze: RGB = [120, 112, 80];
  if (b.hum > 0.01) {
    for (let j = 0; j < 3; j++) {
      const ph = (t * 1.4 + j / 3) % 1;
      ring(sb, b.x, b.y - hang * 0.4, 40 + ph * 170, 2.6, bronze, b.hum * (1 - ph) * 0.55, 77 + j, 0.6, 0.75);
    }
  }
  if (b.cd > 0) {
    const k = 1 - b.cd / cd;
    sb.stroke(arcPoints(b.x, b.y + 6, 62, -Math.PI / 2, TAU * k, 30, 62, 0.42), { width: 3, color: bronze, alpha: 0.45, dryness: 0.5, taperIn: 0.05, taperOut: 0.05, seed: 91 });
  } else {
    ring(sb, b.x, b.y + 6, 62 + Math.sin(t * 3) * 2, 2.4, bronze, 0.4 + 0.15 * Math.sin(t * 3), 92, 0.4, 0.42);
  }
}

export function drawTigerTells(sb: SB, e: Enemy, t: number): void {
  const b = e.boss;
  if (!b) return;
  switch (b.move) {
    case 'swipe': {
      if (b.t >= b.wind) return;
      const k = b.t / b.wind;
      const aim = Math.atan2(b.ay, b.ax);
      const a = 0.35 + 0.6 * k;
      const cy = e.y - 10;
      sb.stroke(arcPoints(e.x, cy, SWIPE_REACH, aim - SWIPE_HALF, SWIPE_HALF * 2, 24, SWIPE_REACH, 0.8), {
        width: 7,
        color: TELL,
        alpha: a,
        dryness: 0.6,
        taperIn: 0.2,
        taperOut: 0.2,
        seed: e.seed + 1,
        progress: Math.min(1, k * 1.6),
      });
      for (const s of [-1, 1]) {
        const ang = aim + s * SWIPE_HALF;
        sb.stroke([{ x: e.x + Math.cos(ang) * 46, y: cy + Math.sin(ang) * 46 * 0.8 }, { x: e.x + Math.cos(ang) * SWIPE_REACH, y: cy + Math.sin(ang) * SWIPE_REACH * 0.8 }], {
          width: 2.4,
          color: TELL,
          alpha: a * 0.7,
          dryness: 0.7,
          taperIn: 0.4,
          taperOut: 0.1,
          seed: e.seed + 3 + s,
        });
      }
      // 차오르는 기운 — 부채꼴을 안쪽부터 옅은 붉은 먹으로 메운다
      const rr = SWIPE_REACH * (0.3 + 0.38 * k);
      sb.stroke(arcPoints(e.x, cy, rr, aim - SWIPE_HALF * 0.92, SWIPE_HALF * 1.84, 20, rr, 0.8), {
        width: SWIPE_REACH * 0.62 * k,
        color: TELL,
        alpha: 0.1 + 0.12 * k,
        dryness: 0.6,
        wet: 0.6,
        taperIn: 0.2,
        taperOut: 0.2,
        seed: e.seed + 7,
      });
      return;
    }
    case 'crouch':
    case 'leap': {
      const k = b.move === 'crouch' ? clamp(b.t / b.dur, 0, 1) : 1;
      const pulse = 1 + 0.03 * Math.sin(t * 18);
      ring(sb, b.tx, b.ty, LAND_R * pulse, 4.5, TELL, 0.3 + 0.45 * k, e.seed + 11, 0.55, 0.7, Math.min(1, k * 1.5));
      ring(sb, b.tx, b.ty, LAND_R * 0.55 * k, 9 * k, TELL, 0.12 + 0.12 * k, e.seed + 12, 0.85, 0.7);
      return;
    }
    case 'aim': {
      const k = clamp(b.t / b.dur, 0, 1);
      const len = Math.hypot(b.tx - e.x, b.ty - e.y);
      if (len < 10) return;
      const pts = [{ x: e.x, y: e.y }, { x: b.tx, y: b.ty }];
      sb.stroke(pts, { width: 4 + 26 * k * k, color: TELL, alpha: 0.12 + 0.12 * k, dryness: 0.85, taperIn: 0.05, taperOut: 0.05, seed: e.seed + 21, progress: Math.min(1, k * 2) });
      sb.stroke(pts, { width: 3, color: TELL, alpha: 0.35 + 0.4 * k, dryness: 0.55, taperIn: 0.1, taperOut: 0.3, seed: e.seed + 22, progress: Math.min(1, k * 2) });
      return;
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
    case 'feather': {
      // 깃털 — 깃대를 따라 깃이 갈라진다
      const col = inkColor(p.ink);
      const a = Math.min(1, life * 4);
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
      const tip = { x: p.x + ux * 12, y: p.y + uy * 12 };
      const tail = { x: p.x - ux * 16, y: p.y - uy * 16 };
      const flutter = Math.sin(p.life * 30 + p.seed) * 2;
      if (p.trail.length > 2) sb.stroke(p.trail, { width: 5, color: col, alpha: a * 0.22, dryness: 0.6, taperIn: 0.9, taperOut: 0.1, seed: p.seed + 3 });
      inkStroke(sb, [tail, { x: p.x - uy * flutter, y: p.y + ux * flutter }, tip], { width: 10, color: col, alpha: a, dryness: 0.35, taperIn: 0.5, taperOut: 0.6, seed: p.seed + 1, edgeInk: 0.6 }, p.ink);
      sb.stroke([{ x: tail.x - ux * 5, y: tail.y - uy * 5 }, tip], { width: 1.4, color: INK, alpha: a * 0.85, dryness: 0.2, taperIn: 0.1, taperOut: 0.7, seed: p.seed + 2 });
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
  // 여우가 물고 간 먹 — 꼬리 위에 매달려 흔들린다
  if (e.carry) {
    const bob = Math.sin(time * 6 + e.seed) * 2;
    const x = e.x - e.side * 22;
    const y = e.y - 34 + bob;
    const c = inkColor(e.carry.ink);
    sb.stroke(arcPoints(x, y, 3.6, 0, TAU * 1.05, 12), { width: 8.5, color: c, alpha: 0.95, dryness: 0, wet: 0.5, taperIn: 0, taperOut: 0, edgeInk: 0.2, seed: e.seed + 77 });
    if (e.carry.ink === 'baek') ring(sb, x, y, 7.6, 1.4, DAMMUK, 0.7, e.seed + 79, 0.3, 1);
    ring(sb, x, y, 10 + Math.sin(time * 8) * 1.2, 1.6, c === INKS.baek.color ? DAMMUK : c, 0.6, e.seed + 78, 0.4, 1);
  }
  if (e.stunT > 0 || lionCracked(e)) {
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

/* ───────── 달문 ───────── */

/** 담장에 그려지는 둥근 문. near: 붓잡이가 다가온 정도 0..1 */
export function drawGate(sb: SB, g: Gate, near: number): void {
  const e = easeOutCubic(g.open);
  if (e <= 0.01) return;
  const el = g.room?.el ?? null;
  const col = el ? (el === 'baek' ? mix(INKS.baek.color, INK, 0.45) : INKS[el].color) : INK;
  const r = g.r * (1 + 0.06 * near);
  const start = -Math.PI / 2 - 0.35 + (g.seed % 10) * 0.05;
  sb.stroke(arcPoints(g.x, g.y, r, start, TAU * 0.95 * e, 34, r * 1.02), { width: 9 + 3 * near, color: col, alpha: 0.95, dryness: 0.45, taperIn: 0.1, taperOut: 0.35, seed: g.seed, wet: 0.5 });
  sb.stroke(arcPoints(g.x, g.y, r * 0.84, start + 1.2, TAU * 0.8 * e, 30, r * 0.82), { width: 2.4, color: col, alpha: 0.5, dryness: 0.6, taperIn: 0.2, taperOut: 0.4, seed: g.seed + 1 });
  // 문턱
  sb.stroke([{ x: g.x - r * 0.9, y: g.y + r * 0.98 }, { x: g.x + r * 0.9, y: g.y + r * 0.98 }], { width: 4, color: INK, alpha: 0.55 * e, dryness: 0.7, taperIn: 0.1, taperOut: 0.1, seed: g.seed + 2 });
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
  // 붓털 — 쥔 먹을 머금었다
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

/** 허리끈 — 쥔 먹의 색이 몸에 드러난다 */
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

