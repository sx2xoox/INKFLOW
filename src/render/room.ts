/**
 * 방 한 칸 = 그림 한 폭. 위쪽에 기와를 얹은 돌담, 아래쪽에 디딤돌, 샘이면 연못을 그린다.
 * 바위와 대숲은 따로 그려 두었다가 인물과 앞뒤를 가려 세운다.
 */
import { type Vec, TAU } from '../core/math';
import { type Rng, mulberry32 } from '../core/rng';
import { ENTRANCE, type Obstacle, type RoomDef, type RoomLayout, WALL_TOP } from '../game/rooms';
import { brushStroke, dot, inkBlob, wash } from './brush';
import { type RGB, DAMMUK, INK, PAPER, PAPER_LIGHT, mix, rgba } from './color';
import { createPaperCanvas } from './paper';

type Ctx = CanvasRenderingContext2D;

const range = (rng: Rng, a: number, b: number): number => a + rng() * (b - a);
const LEAF_INK: RGB = [44, 62, 52];
const STONE: RGB = mix(DAMMUK, PAPER, 0.55);

export function createRoomCanvas(w: number, h: number, def: RoomDef, layout: RoomLayout): HTMLCanvasElement {
  const c = createPaperCanvas(w, h, def.seed, false);
  const ctx = c.getContext('2d')!;
  const rng = mulberry32(def.seed ^ 0x5eed);

  // 옅은 안개
  for (let i = 0; i < 6; i++) wash(ctx, range(rng, 0, w), range(rng, WALL_TOP, h), range(rng, 140, 300), DAMMUK, range(rng, 0.025, 0.05), 900 + i, 0.55);

  const blocked = (x: number, y: number, pad: number): boolean => {
    if (y < WALL_TOP + 20) return true;
    if (Math.hypot(x - ENTRANCE.x, y - ENTRANCE.y) < 90 + pad) return true;
    if (layout.pond && Math.hypot(x - layout.pond.x, (y - layout.pond.y) / 0.6) < layout.pond.r + 40 + pad) return true;
    return layout.obstacles.some((o) => Math.hypot(x - o.x, (y - o.y) / 0.62) < o.r + 30 + pad);
  };

  // 떨어진 댓잎
  for (let i = 0; i < 70; i++) {
    const x = range(rng, 60, w - 60);
    const y = range(rng, WALL_TOP + 30, h - 50);
    if (blocked(x, y, 0)) continue;
    const a = rng() * TAU;
    const l = range(rng, 7, 13);
    brushStroke(ctx, [{ x, y }, { x: x + Math.cos(a) * l, y: y + Math.sin(a) * l * 0.6 }], {
      width: range(rng, 2.4, 3.6),
      color: LEAF_INK,
      alpha: range(rng, 0.18, 0.35),
      dryness: 0.2,
      taperIn: 0.3,
      taperOut: 0.7,
      seed: Math.floor(rng() * 1e6),
    });
  }
  // 풀
  for (let i = 0; i < 55; i++) {
    const x = range(rng, 60, w - 60);
    const y = range(rng, WALL_TOP + 40, h - 50);
    if (blocked(x, y, 10)) continue;
    paintGrass(ctx, x, y, range(rng, 0.6, 1.2), rng);
  }
  // 난초 몇 포기
  for (let i = 0; i < 4; i++) {
    const x = range(rng, 120, w - 120);
    const y = range(rng, WALL_TOP + 120, h - 80);
    if (blocked(x, y, 60) || Math.hypot(x - w / 2, (y - h / 2) * 1.4) < 200) continue;
    paintOrchid(ctx, x, y, range(rng, 0.75, 1.1), rng);
  }

  if (layout.pond) paintPond(ctx, layout.pond.x, layout.pond.y, layout.pond.r, rng);
  paintSteppingStones(ctx, w, h, rng);
  paintWall(ctx, w, rng);
  paintBorder(ctx, w, h, rng);
  return c;
}

/* ───────── 담장 ───────── */

function paintWall(ctx: Ctx, w: number, rng: Rng): void {
  const roofY = 58;
  const base = WALL_TOP - 8;
  // 담 몸통 — 옅은 먹으로 돌을 쌓는다
  const g = ctx.createLinearGradient(0, roofY, 0, base);
  g.addColorStop(0, rgba(DAMMUK, 0.2));
  g.addColorStop(1, rgba(DAMMUK, 0.08));
  ctx.fillStyle = g;
  ctx.fillRect(0, roofY + 8, w, base - roofY - 8);
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const y0 = roofY + 18 + r * ((base - roofY - 20) / rows);
    let x = -range(rng, 0, 30);
    while (x < w) {
      const sw = range(rng, 38, 72);
      const sh = (base - roofY - 20) / rows - 4;
      const cx = x + sw / 2;
      const cy = y0 + sh / 2;
      wash(ctx, cx, cy, sw * 0.5, STONE, 0.22, Math.floor(rng() * 1e6), (sh / sw) * 0.95);
      brushStroke(
        ctx,
        [
          { x: x + 4, y: cy + sh * 0.35 },
          { x: cx, y: cy + sh * 0.5 },
          { x: x + sw - 4, y: cy + sh * 0.3 },
        ],
        { width: range(rng, 1.6, 2.6), color: INK, alpha: range(rng, 0.25, 0.45), dryness: 0.7, taperIn: 0.2, taperOut: 0.3, seed: Math.floor(rng() * 1e6) },
      );
      if (rng() < 0.5) dot(ctx, cx + range(rng, -sw / 3, sw / 3), cy - sh * 0.2, range(rng, 1.2, 2.2), INK, 0.6, Math.floor(rng() * 1e6));
      x += sw + range(rng, 2, 8);
    }
  }
  // 담 아래 그늘
  wash(ctx, w / 2, base + 6, w * 0.6, DAMMUK, 0.08, 77, 0.03);
  brushStroke(ctx, jagged({ x: 0, y: base }, { x: w, y: base }, rng, 14, 2), { width: 4, color: INK, alpha: 0.5, dryness: 0.8, taperIn: 0.02, taperOut: 0.02, seed: 11 });

  // 기와 — 위로 살짝 휜 지붕선과 막새 줄
  const roof = (y: number, lift: number): Vec[] => {
    const pts: Vec[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const edge = Math.pow(Math.abs(t - 0.5) * 2, 3);
      pts.push({ x: t * w, y: y - edge * lift + (rng() - 0.5) * 1.5 });
    }
    return pts;
  };
  brushStroke(ctx, roof(roofY - 14, 10), { width: 9, color: INK, alpha: 0.85, dryness: 0.45, taperIn: 0.02, taperOut: 0.02, seed: 21 });
  brushStroke(ctx, roof(roofY + 2, 12), { width: 14, color: mix(INK, DAMMUK, 0.4), alpha: 0.7, dryness: 0.55, taperIn: 0.02, taperOut: 0.02, seed: 22 });
  for (let x = 6; x < w; x += 17) {
    dot(ctx, x, roofY + 10, 4.2, INK, 0.75, Math.floor(rng() * 1e6));
    brushStroke(ctx, [{ x, y: roofY - 8 }, { x: x + 2, y: roofY + 6 }], { width: 2, color: INK, alpha: 0.35, dryness: 0.6, seed: Math.floor(rng() * 1e6) });
  }
}

/* ───────── 아래쪽 디딤돌 ───────── */

function paintSteppingStones(ctx: Ctx, w: number, h: number, rng: Rng): void {
  let y = h - 40;
  let x = w / 2 + range(rng, -10, 10);
  for (let i = 0; i < 3; i++) {
    const r = range(rng, 22, 30);
    wash(ctx, x + 4, y + 4, r * 1.2, DAMMUK, 0.1, Math.floor(rng() * 1e6), 0.5);
    inkBlob(ctx, x, y, r, { color: STONE, alpha: 0.55, seed: Math.floor(rng() * 1e6), wobble: 0.18, squash: 0.5, halo: 0.3, light: 0.35 });
    y -= range(rng, 38, 48);
    x += range(rng, -18, 18);
  }
}

/* ───────── 연못(샘) ───────── */

function paintPond(ctx: Ctx, x: number, y: number, r: number, rng: Rng): void {
  // 물 — 가장자리가 짙은 맑은 먹
  wash(ctx, x, y, r * 1.15, DAMMUK, 0.16, 501, 0.6);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.6, 0, 0, TAU);
  const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.15, r * 0.1, x, y, r);
  g.addColorStop(0, rgba(mix(PAPER_LIGHT, [150, 170, 175], 0.2), 0.7));
  g.addColorStop(0.75, rgba(mix(DAMMUK, [70, 96, 110], 0.4), 0.22));
  g.addColorStop(1, rgba(mix(DAMMUK, [50, 70, 80], 0.4), 0.42));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  // 물결
  for (let k = 0; k < 4; k++) {
    const rr = r * range(rng, 0.3, 0.8);
    const a0 = rng() * TAU;
    const pts: Vec[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (i / 8) * 1.4;
      pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * 0.6 });
    }
    brushStroke(ctx, pts, { width: 1.6, color: DAMMUK, alpha: 0.35, dryness: 0.5, taperIn: 0.3, taperOut: 0.3, seed: Math.floor(rng() * 1e6) });
  }
  // 둘레의 돌
  for (let i = 0; i < 9; i++) {
    const a = rng() * TAU;
    const sx = x + Math.cos(a) * r * 1.05;
    const sy = y + Math.sin(a) * r * 0.63;
    inkBlob(ctx, sx, sy, range(rng, 9, 16), { color: STONE, alpha: 0.6, seed: Math.floor(rng() * 1e6), wobble: 0.2, squash: 0.6, halo: 0.2, light: 0.3 });
  }
  // 연잎과 연꽃
  for (let i = 0; i < 6; i++) {
    const a = rng() * TAU;
    const d = r * range(rng, 0.2, 0.75);
    const lx = x + Math.cos(a) * d;
    const ly = y + Math.sin(a) * d * 0.6;
    const lr = range(rng, 14, 24);
    inkBlob(ctx, lx, ly, lr, { color: mix(LEAF_INK, [80, 120, 100], 0.5), edge: LEAF_INK, alpha: 0.75, seed: Math.floor(rng() * 1e6), wobble: 0.1, squash: 0.55, halo: 0.3, light: 0.25 });
    for (let k = 0; k < 6; k++) {
      const va = (k / 6) * TAU;
      brushStroke(ctx, [{ x: lx, y: ly }, { x: lx + Math.cos(va) * lr * 0.85, y: ly + Math.sin(va) * lr * 0.47 }], { width: 1, color: LEAF_INK, alpha: 0.5, taperOut: 0.7, seed: k + i * 10 });
    }
  }
  for (let f = 0; f < 2; f++) {
    const fx = x + range(rng, -r * 0.5, r * 0.5);
    const fy = y + range(rng, -r * 0.25, r * 0.2);
    for (let p = 0; p < 6; p++) {
      const a = -Math.PI / 2 + (p - 2.5) * 0.42;
      brushStroke(ctx, [{ x: fx, y: fy }, { x: fx + Math.cos(a) * 14, y: fy + Math.sin(a) * 16 }], {
        width: 7,
        color: [222, 132, 140],
        alpha: 0.7,
        dryness: 0.1,
        taperIn: 0.3,
        taperOut: 0.75,
        seed: f * 10 + p,
        edgeColor: [176, 70, 82],
      });
    }
    dot(ctx, fx, fy - 4, 2.4, [210, 170, 60], 0.9, f);
  }
}

/* ───────── 테두리 ───────── */

function paintBorder(ctx: Ctx, w: number, h: number, rng: Rng): void {
  const band = 90;
  const grads: [number, number, number, number][] = [
    [0, h, 0, h - band],
    [0, 0, band, 0],
    [w, 0, w - band, 0],
  ];
  for (const [x0, y0, x1, y1] of grads) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgba([120, 100, 72], 0.26));
    g.addColorStop(1, rgba([120, 100, 72], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  const m = 22;
  const edge = (a: Vec, b: Vec): void =>
    brushStroke(ctx, jagged(a, b, rng, 8, 3), { width: range(rng, 7, 11), color: INK, alpha: 0.55, dryness: 0.85, taperIn: 0.04, taperOut: 0.06, seed: Math.floor(rng() * 1e6), wet: 0.1 });
  edge({ x: m, y: m }, { x: w - m, y: m });
  edge({ x: w - m, y: m }, { x: w - m, y: h - m });
  edge({ x: w - m, y: h - m }, { x: m, y: h - m });
  edge({ x: m, y: h - m }, { x: m, y: m });
}

function jagged(a: Vec, b: Vec, rng: Rng, n: number, amp: number): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: a.x + (b.x - a.x) * t + (rng() - 0.5) * amp, y: a.y + (b.y - a.y) * t + (rng() - 0.5) * amp });
  }
  return pts;
}

function paintGrass(ctx: Ctx, x: number, y: number, s: number, rng: Rng): void {
  const blades = 3 + Math.floor(rng() * 4);
  const alpha = range(rng, 0.18, 0.38);
  for (let i = 0; i < blades; i++) {
    const bx = x + (rng() - 0.5) * 10 * s;
    const lean = (rng() - 0.5) * 26 * s;
    const hgt = range(rng, 12, 26) * s;
    brushStroke(ctx, [{ x: bx, y }, { x: bx + lean * 0.35, y: y - hgt * 0.55 }, { x: bx + lean, y: y - hgt }], {
      width: 2.6 * s,
      color: DAMMUK,
      alpha,
      dryness: 0.3,
      taperIn: 0.05,
      taperOut: 0.85,
      seed: Math.floor(rng() * 1e6),
      wet: 0.2,
    });
  }
}

function paintOrchid(ctx: Ctx, x: number, y: number, s: number, rng: Rng): void {
  const leaves = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < leaves; i++) {
    const dir = (i % 2 ? 1 : -1) * range(rng, 0.25, 1.1);
    const len = range(rng, 50, 110) * s;
    brushStroke(
      ctx,
      [
        { x: x + (rng() - 0.5) * 8, y },
        { x: x + dir * len * 0.25, y: y - len * 0.55 },
        { x: x + dir * len * 0.7, y: y - len * range(rng, 0.65, 0.95) },
        { x: x + dir * len * 1.05, y: y - len * range(rng, 0.45, 0.8) },
      ],
      { width: range(rng, 3.5, 5.5) * s, color: INK, alpha: range(rng, 0.32, 0.5), dryness: 0.25, taperIn: 0.08, taperOut: 0.7, seed: Math.floor(rng() * 1e6), wet: 0.25 },
    );
  }
}

/* ───────── 장애물: 따로 그려 세운다 ───────── */

export interface ObstacleArt {
  canvas: HTMLCanvasElement;
  /** 그림 안에서 바닥 중심의 위치(0..1) */
  ax: number;
  ay: number;
  /** 굽는 배율 */
  scale: number;
}

export function paintObstacle(o: Obstacle, scale: number): ObstacleArt {
  const isRock = o.kind === 'rock';
  const w = isRock ? o.r * 2.9 : o.r * 2 + 170;
  const h = isRock ? o.r * 2.6 : 300;
  const ox = w / 2;
  const oy = isRock ? h - o.r * 0.9 : h - 34;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale);
  c.height = Math.ceil(h * scale);
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.translate(ox, oy);
  const rng = mulberry32(o.seed);
  if (isRock) paintBoulder(ctx, o.r, rng, o.seed);
  else paintBambooClump(ctx, o.r, rng, o.seed);
  return { canvas: c, ax: ox / w, ay: oy / h, scale };
}

/**
 * 바위 — 모난 덩이 두세 개가 겹친 모양. 빛 받는 윗면은 비우고,
 * 그늘진 쪽은 부벽준(斧劈皴)으로 도끼로 쪼갠 듯 긋는다.
 */
function paintBoulder(ctx: Ctx, r: number, rng: Rng, seed: number): void {
  wash(ctx, r * 0.3, r * 0.1, r * 1.4, DAMMUK, 0.22, seed + 1, 0.4);
  // 큰 덩이와 곁 덩이들 (뒤에서 앞으로)
  const lumps: { x: number; y: number; w: number; h: number }[] = [
    { x: 0, y: 0, w: r, h: r * range(rng, 0.95, 1.25) },
    { x: -r * range(rng, 0.55, 0.75), y: r * 0.05, w: r * range(rng, 0.45, 0.6), h: r * range(rng, 0.5, 0.7) },
  ];
  if (rng() < 0.6) lumps.push({ x: r * range(rng, 0.55, 0.8), y: r * 0.08, w: r * range(rng, 0.35, 0.5), h: r * range(rng, 0.35, 0.55) });
  lumps.forEach((l, li) => paintRockLump(ctx, l.x, l.y, l.w, l.h, rng, seed + li * 97, li === 0));
  // 바닥선
  brushStroke(ctx, [{ x: -r * 1.05, y: r * 0.02 }, { x: 0, y: r * 0.14 }, { x: r * 1.0, y: r * 0.02 }], { width: 2.6, color: INK, alpha: 0.5, dryness: 0.6, seed: seed + 20 });
  // 바위 밑 풀
  for (let i = 0; i < 4; i++) {
    const gx = range(rng, -r * 1.1, r * 1.1);
    brushStroke(ctx, [{ x: gx, y: r * 0.1 }, { x: gx + range(rng, -8, 8), y: -range(rng, 10, 20) }], { width: 2.4, color: DAMMUK, alpha: 0.5, taperIn: 0.05, taperOut: 0.85, seed: seed + 40 + i });
  }
}

/** 모난 바위 한 덩이 — 바닥 가운데 (x, y), 가로 반폭 w, 높이 h */
function paintRockLump(ctx: Ctx, x: number, y: number, w: number, h: number, rng: Rng, seed: number, main: boolean): void {
  // 꼭짓점이 있는 실루엣: 바닥 왼쪽 → 어깨 → 꼭대기 몇 점 → 오른쪽 어깨 → 바닥 오른쪽
  const pts: Vec[] = [
    { x: x - w, y },
    { x: x - w * range(rng, 0.95, 1.08), y: y - h * range(rng, 0.35, 0.5) },
    { x: x - w * range(rng, 0.55, 0.75), y: y - h * range(rng, 0.8, 0.95) },
    { x: x - w * range(rng, -0.1, 0.15), y: y - h },
    { x: x + w * range(rng, 0.35, 0.6), y: y - h * range(rng, 0.85, 0.98) },
    { x: x + w * range(rng, 0.92, 1.05), y: y - h * range(rng, 0.4, 0.6) },
    { x: x + w, y },
  ];
  // 몸 — 윗면은 밝고 아래로 갈수록 담묵
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    ctx.quadraticCurveTo(a.x + (b.x - a.x) * 0.5 + range(rng, -2, 2), a.y + (b.y - a.y) * 0.5 + range(rng, -2, 2), b.x, b.y);
  }
  ctx.quadraticCurveTo(x, y + h * 0.12, pts[0].x, pts[0].y);
  ctx.closePath();
  const g = ctx.createLinearGradient(x - w * 0.4, y - h, x + w * 0.5, y);
  g.addColorStop(0, rgba(PAPER_LIGHT, 0.98));
  g.addColorStop(0.45, rgba(mix(STONE, PAPER_LIGHT, 0.4), 0.98));
  g.addColorStop(1, rgba(mix(STONE, DAMMUK, 0.35), 0.98));
  ctx.fillStyle = g;
  ctx.fill();
  // 그늘 — 오른쪽 면을 담묵으로 문지른다
  ctx.save();
  ctx.clip();
  wash(ctx, x + w * 0.65, y - h * 0.35, w * 0.85, DAMMUK, 0.42, seed + 2, 1.1);
  // 부벽준
  const n = main ? 7 : 4;
  for (let k = 0; k < n; k++) {
    const sx = x + w * range(rng, 0.0, 0.85);
    const sy = y - h * range(rng, 0.2, 0.85);
    const len = h * range(rng, 0.25, 0.45);
    brushStroke(ctx, [{ x: sx, y: sy }, { x: sx + len * 0.25, y: sy + len }], { width: range(rng, 4, 8), color: INK, alpha: range(rng, 0.22, 0.42), dryness: 0.85, taperIn: 0.05, taperOut: 0.7, seed: seed + 10 + k });
  }
  ctx.restore();
  // 윤곽 — 왼쪽 위는 짙고 굵게, 오른쪽은 가늘게
  brushStroke(ctx, pts.slice(0, 5), { width: main ? 4.5 : 3.4, color: INK, alpha: 0.88, dryness: 0.55, taperIn: 0.25, taperOut: 0.25, seed: seed + 3 });
  brushStroke(ctx, pts.slice(4), { width: main ? 2.6 : 2, color: INK, alpha: 0.65, dryness: 0.7, taperIn: 0.2, taperOut: 0.3, seed: seed + 4 });
  // 면을 나누는 주름
  const fx = x + w * range(rng, -0.15, 0.2);
  brushStroke(ctx, [{ x: pts[3].x, y: pts[3].y + 2 }, { x: fx, y: y - h * 0.45 }, { x: fx + w * 0.1, y: y - h * 0.05 }], { width: 2.4, color: INK, alpha: 0.5, dryness: 0.75, taperIn: 0.2, taperOut: 0.6, seed: seed + 5 });
  // 태점
  const dots = main ? 4 + Math.floor(rng() * 4) : 2;
  for (let i = 0; i < dots; i++) {
    const t = range(rng, 0.1, 0.9);
    const i0 = Math.floor(t * 5) + 1;
    const p = pts[Math.min(5, i0)];
    dot(ctx, p.x + range(rng, -5, 5), p.y + range(rng, 1, 6), range(rng, 1.8, 3.4), INK, range(rng, 0.7, 0.92), seed + 30 + i);
  }
}

/**
 * 대숲 한 무더기. 묵죽(墨竹)의 순서대로 — 줄기(竿)를 마디마다 끊어 긋고,
 * 마디(節)를 찍고, 잔가지(枝)를 치고, 잎(葉)을 개자(个字)로 모아 단다.
 */
function paintBambooClump(ctx: Ctx, r: number, rng: Rng, seed: number): void {
  wash(ctx, 0, 4, r * 1.7, DAMMUK, 0.16, seed + 1, 0.4);
  const stalks = 4 + Math.floor(rng() * 2);
  // 줄기 밑동은 고르게 흩어 둔다 — 한 줄로 겹치면 대가 아니라 야자처럼 보인다
  const bases: Vec[] = [];
  for (let k = 0; k < stalks; k++) {
    const t = stalks === 1 ? 0.5 : k / (stalks - 1);
    bases.push({ x: -r + 2 * r * t + range(rng, -r * 0.15, r * 0.15), y: range(rng, -r * 0.35, r * 0.35) });
  }
  bases.sort((a, b) => a.y - b.y);
  const leaves: { x: number; y: number; side: number; near: boolean }[] = [];
  for (const [k, b] of bases.entries()) {
    const near = k >= stalks - 2;
    const hgt = range(rng, 180, 260) * (near ? 1 : 0.85);
    // 바깥쪽으로 살짝 벌어진다
    const lean = (b.x / Math.max(1, r)) * 0.12 + range(rng, -0.05, 0.05);
    const segs = 6 + Math.floor(rng() * 2);
    const col = near ? mix(INK, DAMMUK, 0.45) : mix(DAMMUK, PAPER, 0.3);
    let cy = b.y;
    for (let i = 0; i < segs; i++) {
      const segH = (hgt / segs) * (i === 0 ? 0.7 : 1 + i * 0.04);
      const y1 = cy - segH;
      const x0 = b.x + (b.y - cy) * lean;
      const x1 = b.x + (b.y - y1) * lean;
      const wdt = Math.max(4.2, (near ? 7.5 : 6) - i * 0.35);
      brushStroke(ctx, [{ x: x0, y: cy - 2 }, { x: (x0 + x1) / 2, y: (cy + y1) / 2 }, { x: x1, y: y1 + 2.5 }], {
        width: wdt,
        color: col,
        alpha: near ? 0.85 : 0.6,
        dryness: 0.4,
        taperIn: 0.04,
        taperOut: 0.04,
        seed: seed + k * 20 + i,
        wet: 0.1,
      });
      // 마디 — 乙자처럼 짧게
      brushStroke(ctx, [{ x: x1 - wdt * 0.8, y: y1 + 2 }, { x: x1 - wdt * 0.2, y: y1 + 0.5 }, { x: x1 + wdt * 0.7, y: y1 + 1.5 }], {
        width: 1.8,
        color: INK,
        alpha: near ? 0.75 : 0.5,
        dryness: 0.3,
        taperIn: 0.3,
        taperOut: 0.4,
        seed: seed + k * 20 + i + 100,
      });
      // 위쪽 마디에서 잔가지와 잎
      if (i >= segs - 3 && rng() < 0.8) {
        const side = rng() < 0.5 ? -1 : 1;
        const tl = range(rng, 18, 34);
        const ta = -Math.PI / 2 + side * range(rng, 0.6, 0.9);
        const tx = x1 + Math.cos(ta) * tl;
        const ty = y1 + Math.sin(ta) * tl;
        brushStroke(ctx, [{ x: x1, y: y1 }, { x: tx, y: ty }], { width: 1.5, color: col, alpha: 0.7, dryness: 0.4, taperIn: 0.1, taperOut: 0.5, seed: seed + k * 30 + i + 200 });
        leaves.push({ x: tx, y: ty, side, near });
        if (rng() < 0.6) leaves.push({ x: x1 + side * 3, y: y1 + 2, side: -side, near });
      }
      cy = y1;
    }
  }
  // 잎은 줄기를 다 그린 뒤에 — 앞의 잎이 줄기를 덮는다
  for (const [n, L] of leaves.entries()) {
    const count = 3 + (n % 2);
    for (let l = 0; l < count; l++) {
      const a = Math.PI / 2 + L.side * range(rng, 0.25, 1.05) + (l - (count - 1) / 2) * range(rng, 0.3, 0.45);
      const len = range(rng, 28, 46) * (l === 1 ? 1.12 : 1);
      const dark = L.near && (l + n) % 3 !== 0;
      brushStroke(
        ctx,
        [
          { x: L.x, y: L.y },
          { x: L.x + Math.cos(a) * len * 0.45 + L.side * 2, y: L.y + Math.sin(a) * len * 0.45 },
          { x: L.x + Math.cos(a) * len, y: L.y + Math.sin(a) * len },
        ],
        {
          width: range(rng, 5, 7),
          color: dark ? INK : DAMMUK,
          alpha: dark ? range(rng, 0.6, 0.78) : range(rng, 0.32, 0.48),
          dryness: 0.1,
          taperIn: 0.32,
          taperOut: 0.82,
          seed: seed + 500 + n * 10 + l,
          wet: 0.35,
        },
      );
    }
  }
  // 밑동의 풀과 돌
  for (let i = 0; i < 5; i++) {
    const gx = range(rng, -r * 1.1, r * 1.1);
    brushStroke(ctx, [{ x: gx, y: 6 }, { x: gx + range(rng, -10, 10), y: -range(rng, 12, 22) }], { width: 2.6, color: DAMMUK, alpha: 0.5, taperIn: 0.05, taperOut: 0.85, seed: seed + 300 + i });
  }
  inkBlob(ctx, range(rng, -r, r), 4, range(rng, 6, 10), { color: STONE, alpha: 0.7, seed: seed + 400, wobble: 0.2, squash: 0.6, halo: 0.2, light: 0.3 });
}
