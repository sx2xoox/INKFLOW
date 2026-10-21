/**
 * 수묵 표현의 기본 도구들.
 * 모든 그림은 이 파일의 붓질(brushStroke), 먹 덩이(inkBlob), 먹 튐(splatter)으로 그린다.
 */
import { type Vec, TAU, clamp, dist, easeOutSine } from '../core/math';
import { mulberry32 } from '../core/rng';
import { type RGB, BLACK, WHITE, mix, rgba } from './color';

type Ctx = CanvasRenderingContext2D;

function catmull(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

/** 조절점을 부드러운 곡선으로 잇고 일정한 간격으로 다시 찍는다. */
export function smoothPath(pts: readonly Vec[], spacing: number): Vec[] {
  if (pts.length < 2) return pts.slice();
  const dense: Vec[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < 10; s++) dense.push(catmull(p0, p1, p2, p3, s / 10));
  }
  dense.push(pts[pts.length - 1]);

  const out: Vec[] = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    let a = dense[i - 1];
    const b = dense[i];
    let seg = dist(a, b);
    while (acc + seg >= spacing && seg > 0) {
      const t = (spacing - acc) / seg;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(p);
      a = p;
      seg = dist(a, b);
      acc = 0;
    }
    acc += seg;
  }
  const last = dense[dense.length - 1];
  if (dist(out[out.length - 1], last) > spacing * 0.3) out.push(last);
  return out;
}

export interface StrokeStyle {
  width: number;
  color: RGB;
  alpha?: number;
  /** 획 머리가 굵어지는 구간(전체 길이 비율) */
  taperIn?: number;
  /** 획 꼬리가 가늘어지는 구간 */
  taperOut?: number;
  /** 0 = 촉촉한 붓, 1 = 바싹 마른 붓(비백) */
  dryness?: number;
  /** 획 가장자리로 먹이 번지는 정도 */
  wet?: number;
  roughness?: number;
  bristles?: number;
  seed?: number;
  /** 0..1, 획의 앞부분만 그린다(붓이 지나가는 중인 연출) */
  progress?: number;
  edgeColor?: RGB;
  minWidth?: number;
}

/**
 * 붓 한 획. 가운데 먹(몸통) 위에 붓털 하나하나의 결을 겹쳐 그리고,
 * 마른 붓일수록 붓털이 먼저 말라 비백(飛白)이 생긴다.
 */
export function brushStroke(ctx: Ctx, pts: readonly Vec[], s: StrokeStyle): void {
  const width = s.width;
  if (width <= 0) return;
  const alpha = s.alpha ?? 1;
  const dry = s.dryness ?? 0.25;
  const rng = mulberry32(s.seed ?? 7);
  const path = smoothPath(pts, Math.max(1.2, width * 0.2));
  const total = path.length;
  if (total < 2) return;
  const n = s.progress === undefined ? total : Math.max(2, Math.ceil(total * clamp(s.progress, 0, 1)));

  const tin = s.taperIn ?? 0.12;
  const tout = s.taperOut ?? 0.3;
  const rough = s.roughness ?? 0.5;
  const ph1 = rng() * TAU;
  const ph2 = rng() * TAU;
  const W = new Float32Array(n);
  const NX = new Float32Array(n);
  const NY = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (total - 1);
    let pr = 1;
    if (tin > 0 && t < tin) pr *= 0.2 + 0.8 * easeOutSine(t / tin);
    if (tout > 0 && t > 1 - tout) pr *= 0.04 + 0.96 * Math.pow((1 - t) / tout, 0.85);
    const wob = 1 + rough * 0.13 * (Math.sin(i * 0.7 + ph1) + 0.6 * Math.sin(i * 1.9 + ph2));
    W[i] = Math.max(s.minWidth ?? 0.5, width * pr * wob);
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(total - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    NX[i] = -dy / l;
    NY[i] = dx / l;
  }

  const outline = (scale: number): void => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = path[i];
      const h = W[i] * 0.5 * scale;
      if (i === 0) ctx.moveTo(p.x + NX[i] * h, p.y + NY[i] * h);
      else ctx.lineTo(p.x + NX[i] * h, p.y + NY[i] * h);
    }
    for (let i = n - 1; i >= 0; i--) {
      const p = path[i];
      const h = W[i] * 0.5 * scale;
      ctx.lineTo(p.x - NX[i] * h, p.y - NY[i] * h);
    }
    ctx.closePath();
  };

  // 번짐: 획 둘레로 묽은 먹이 스민다
  const wet = s.wet ?? 0.35;
  if (wet > 0) {
    outline(1 + 0.55 * wet);
    ctx.fillStyle = rgba(s.color, alpha * 0.11 * wet);
    ctx.fill();
  }

  // 몸통
  const coreA = alpha * (0.5 + 0.32 * (1 - dry));
  const p0 = path[0];
  const p1 = path[n - 1];
  if (dry > 0.05 && dist(p0, p1) > 4) {
    const g = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    g.addColorStop(0, rgba(s.color, coreA));
    g.addColorStop(0.5, rgba(s.color, coreA * (1 - dry * 0.4)));
    g.addColorStop(1, rgba(s.color, coreA * (1 - dry * 0.92)));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = rgba(s.color, coreA);
  }
  outline(0.84);
  ctx.fill();

  // 붓털 결
  const B = s.bristles ?? Math.max(4, Math.min(18, Math.round(width / 2.2)));
  const edgeC = s.edgeColor ?? mix(s.color, BLACK, 0.28);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let k = 0; k < B; k++) {
    const u = (B === 1 ? 0 : (k / (B - 1)) * 2 - 1) * 0.93 + (rng() - 0.5) * 0.12;
    const edge = Math.abs(u);
    const endT = 1 - dry * (0.12 + 0.8 * rng()) * (0.45 + edge * 0.55);
    const startT = rng() < dry * 0.5 ? rng() * 0.12 : 0;
    const iEnd = Math.min(n, Math.floor(endT * (total - 1)) + 1);
    const iStart = Math.floor(startT * (total - 1));
    if (iEnd - iStart < 2) continue;
    const ba = alpha * (0.16 + 0.4 * rng()) * (edge > 0.72 ? 1.35 : 1);
    ctx.strokeStyle = rgba(edge > 0.7 ? edgeC : s.color, ba);
    ctx.lineWidth = Math.max(0.45, (width / B) * (0.7 + rng() * 0.9));
    let gapS = -1;
    let gapE = -1;
    if (dry > 0.2 && rng() < dry * 0.9) {
      gapS = iStart + Math.floor(rng() * (iEnd - iStart));
      gapE = gapS + Math.floor(2 + rng() * 7 * dry);
    }
    ctx.beginPath();
    let pen = false;
    for (let i = iStart; i < iEnd; i++) {
      if (i >= gapS && i < gapE) {
        pen = false;
        continue;
      }
      const p = path[i];
      const h = W[i] * 0.5 * u;
      const x = p.x + NX[i] * h;
      const y = p.y + NY[i] * h;
      if (!pen) {
        ctx.moveTo(x, y);
        pen = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/** 호(arc)를 따라가는 조절점 — 원상(圓相)이나 휘두르기 궤적에 쓴다. */
export function arcPoints(
  cx: number,
  cy: number,
  r: number,
  start: number,
  sweep: number,
  n = 16,
  rEnd = r,
  squash = 1,
): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = start + sweep * t;
    const rr = r + (rEnd - r) * t;
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * squash });
  }
  return pts;
}

/** 출렁이는 먹 덩이의 외곽선을 만든다. time은 위상(0..2π)이라 2π마다 같은 모양으로 돌아온다. */
export function blobPath(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  seed: number,
  wobble = 0.14,
  time = 0,
  squash = 1,
): void {
  const rng = mulberry32(seed);
  const k0 = rng() * TAU;
  const k1 = rng() * TAU;
  const k2 = rng() * TAU;
  const k3 = rng() * TAU;
  const a0 = 0.5 + rng() * 0.5;
  const a1 = 0.3 + rng() * 0.5;
  const a2 = 0.2 + rng() * 0.4;
  const a3 = 0.1 + rng() * 0.3;
  const pts = Math.max(18, Math.min(64, Math.round(r * 1.1)));
  ctx.beginPath();
  for (let i = 0; i <= pts; i++) {
    const th = (i / pts) * TAU;
    const w =
      (a0 * Math.sin(2 * th + k0 + time) +
        a1 * Math.sin(3 * th + k1 - time) +
        a2 * Math.sin(5 * th + k2 + time * 2) +
        a3 * Math.sin(8 * th + k3)) /
      1.6;
    const rr = r * (1 + wobble * w);
    const px = x + Math.cos(th) * rr;
    const py = y + Math.sin(th) * rr * squash;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export interface BlobStyle {
  color: RGB;
  edge?: RGB;
  alpha?: number;
  seed?: number;
  wobble?: number;
  time?: number;
  squash?: number;
  halo?: number;
  light?: number;
}

/** 먹이 고여 가장자리가 짙어지는(墨暈) 덩이. 먹귀들의 몸통이다. */
export function inkBlob(ctx: Ctx, x: number, y: number, r: number, s: BlobStyle): void {
  const a = s.alpha ?? 1;
  const seed = s.seed ?? 1;
  const wob = s.wobble ?? 0.14;
  const t = s.time ?? 0;
  const sq = s.squash ?? 1;
  const edge = s.edge ?? mix(s.color, BLACK, 0.32);
  const halo = s.halo ?? 0.5;
  if (halo > 0) {
    blobPath(ctx, x, y + r * 0.04, r * 1.2, seed + 3, wob * 1.5, -t, sq);
    ctx.fillStyle = rgba(s.color, a * 0.24 * halo);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.32 * sq, r * 0.05, x, y, r * 1.05);
  g.addColorStop(0, rgba(mix(s.color, WHITE, s.light ?? 0.14), a * 0.8));
  g.addColorStop(0.62, rgba(s.color, a * 0.9));
  g.addColorStop(1, rgba(edge, a * 0.96));
  blobPath(ctx, x, y, r, seed, wob, t, sq);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(0.8, r * 0.07);
  ctx.strokeStyle = rgba(edge, a * 0.55);
  ctx.stroke();
}

/** 묽은 먹의 번짐 — 그림자, 웅덩이, 안개 등. */
export function wash(ctx: Ctx, x: number, y: number, r: number, color: RGB, alpha: number, seed = 1, squash = 1): void {
  blobPath(ctx, x, y, r, seed, 0.2, 0, squash);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.1);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.7, rgba(color, alpha * 0.7));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fill();
}

/** 먹이 튀어 번진 자국. */
export function splatter(ctx: Ctx, x: number, y: number, r: number, color: RGB, seed: number, alpha = 0.5): void {
  const rng = mulberry32(seed);
  blobPath(ctx, x, y, r * 1.18, seed + 1, 0.32);
  ctx.fillStyle = rgba(color, alpha * 0.22);
  ctx.fill();
  blobPath(ctx, x, y, r, seed, 0.26);
  ctx.fillStyle = rgba(color, alpha * 0.5);
  ctx.fill();
  blobPath(ctx, x + (rng() - 0.5) * r * 0.4, y + (rng() - 0.5) * r * 0.4, r * 0.55, seed + 2, 0.3);
  ctx.fillStyle = rgba(color, alpha * 0.35);
  ctx.fill();
  const count = 5 + Math.floor(r / 4 + rng() * 6);
  for (let i = 0; i < count; i++) {
    const th = rng() * TAU;
    const d = r * (1.05 + rng() * 1.7);
    const sz = Math.max(0.8, r * (0.04 + rng() * 0.14));
    const px = x + Math.cos(th) * d;
    const py = y + Math.sin(th) * d;
    if (rng() < 0.35) {
      ctx.strokeStyle = rgba(color, alpha * 0.3);
      ctx.lineWidth = sz * 0.7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(th) * r * 0.85, y + Math.sin(th) * r * 0.85);
      ctx.lineTo(px, py);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(th);
    ctx.beginPath();
    ctx.ellipse(0, 0, sz * (1.2 + rng() * 1.4), sz, 0, 0, TAU);
    ctx.fillStyle = rgba(color, alpha * (0.45 + rng() * 0.45));
    ctx.fill();
    ctx.restore();
  }
}

/** 점 하나 — 태점(苔點)이나 꽃잎처럼 쓰는 작은 먹 점. */
export function dot(ctx: Ctx, x: number, y: number, r: number, color: RGB, alpha: number, seed = 1): void {
  blobPath(ctx, x, y, r, seed, 0.22);
  ctx.fillStyle = rgba(color, alpha);
  ctx.fill();
}
