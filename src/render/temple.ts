/**
 * 가을 산사의 그림 — 박석 깐 마당, 떨어진 단풍잎과 국화, 처마 밑 단청,
 * 석탑과 단풍나무, 범종이 걸린 종각. 방 그림(room.ts)이 불러 쓴다.
 */
import { type Vec, TAU } from '../core/math';
import type { Rng } from '../core/rng';
import { brushStroke, dot, inkBlob, wash } from './brush';
import { type RGB, DAMMUK, INK, PAPER, PAPER_LIGHT, mix, rgba } from './color';

type Ctx = CanvasRenderingContext2D;

const range = (rng: Rng, a: number, b: number): number => a + rng() * (b - a);
const GRANITE: RGB = [196, 190, 176];
const MOSS: RGB = [96, 110, 76];
/** 단풍 — 짙은 다홍에서 주황, 노랑까지 */
export const MAPLE: RGB[] = [
  [178, 48, 36],
  [200, 72, 40],
  [214, 108, 46],
  [220, 150, 56],
  [150, 40, 34],
];
const PILLAR: RGB = [136, 62, 44];
const TILE: RGB = [74, 74, 78];
const DAN_GREEN: RGB = [72, 122, 112];
const DAN_RED: RGB = [178, 58, 42];
const BRONZE: RGB = [104, 98, 70];
const PATINA: RGB = [96, 128, 106];

/* ───────── 바닥 ───────── */

/** 단풍잎 한 장 — 다섯 갈래. 바닥에 누운 잎은 squash로 납작하게 */
export function mapleLeaf(ctx: Ctx, x: number, y: number, s: number, col: RGB, rot: number, alpha: number, seed: number, squash = 0.75): void {
  for (let k = 0; k < 5; k++) {
    const a = rot - Math.PI / 2 + (k - 2) * 0.66;
    const len = s * (k === 2 ? 1 : k === 1 || k === 3 ? 0.86 : 0.58);
    brushStroke(
      ctx,
      [
        { x, y },
        { x: x + Math.cos(a) * len * 0.5, y: y + Math.sin(a) * len * 0.5 * squash },
        { x: x + Math.cos(a) * len, y: y + Math.sin(a) * len * squash },
      ],
      { width: s * 0.46, color: col, alpha, dryness: 0.12, taperIn: 0.45, taperOut: 0.85, seed: seed + k, edgeColor: mix(col, INK, 0.3) },
    );
  }
  const sa = rot + Math.PI / 2;
  brushStroke(ctx, [{ x, y }, { x: x + Math.cos(sa) * s * 0.55, y: y + Math.sin(sa) * s * 0.55 * squash }], { width: 0.9, color: mix(col, INK, 0.5), alpha: alpha * 0.9, taperOut: 0.6, seed: seed + 9 });
}

/** 네 꼭짓점을 둥글게 깎은 판 */
function roundedQuad(ctx: Ctx, pts: Vec[], r: number): void {
  const toward = (p: Vec, q: Vec): Vec => {
    const k = Math.min(0.5, r / (Math.hypot(q.x - p.x, q.y - p.y) || 1));
    return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
  };
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = toward(p, pts[(i + pts.length - 1) % pts.length]);
    const b = toward(p, pts[(i + 1) % pts.length]);
    if (i === 0) ctx.moveTo(a.x, a.y);
    else ctx.lineTo(a.x, a.y);
    ctx.quadraticCurveTo(p.x, p.y, b.x, b.y);
  }
  ctx.closePath();
}

/** 박석 한 장 — 모서리가 둥근 넓적한 돌 */
function flagstone(ctx: Ctx, x: number, y: number, w: number, h: number, rng: Rng): void {
  const seed = Math.floor(rng() * 1e6);
  const j = (): number => range(rng, -2.5, 2.5);
  const pts: Vec[] = [
    { x: x - w / 2 + j(), y: y - h / 2 + j() },
    { x: x + w / 2 + j(), y: y - h / 2 + j() },
    { x: x + w / 2 + j(), y: y + h / 2 + j() },
    { x: x - w / 2 + j(), y: y + h / 2 + j() },
  ];
  roundedQuad(ctx, pts, Math.min(w, h) * 0.24);
  const g = ctx.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
  g.addColorStop(0, rgba(mix(GRANITE, PAPER_LIGHT, 0.4), 0.42));
  g.addColorStop(1, rgba(mix(GRANITE, DAMMUK, 0.25), 0.42));
  ctx.fillStyle = g;
  ctx.fill();
  // 아래와 오른쪽 가장자리만 마른 붓으로
  brushStroke(ctx, [pts[1], pts[2], pts[3]], { width: range(rng, 1.4, 2.2), color: DAMMUK, alpha: range(rng, 0.35, 0.55), dryness: 0.75, taperIn: 0.2, taperOut: 0.3, seed });
  if (rng() < 0.35) dot(ctx, x + range(rng, -w / 3, w / 3), y + range(rng, -h / 4, h / 4), range(rng, 1, 2), MOSS, 0.5, seed + 1);
}

/** 박석 길 — 입구에서 담장 가운데 문까지 */
export function paintFlagPath(ctx: Ctx, cx: number, yTop: number, yBottom: number, half: number, rng: Rng, skip: (x: number, y: number) => boolean): void {
  let y = yBottom;
  while (y > yTop) {
    const rowH = range(rng, 30, 40);
    let x = cx - half + range(rng, -8, 8);
    while (x < cx + half) {
      const sw = range(rng, 40, 70);
      const sx = x + sw / 2;
      const sy = y - rowH / 2;
      if (!skip(sx, sy) && rng() > 0.08) flagstone(ctx, sx, sy, sw - 5, rowH - 5, rng);
      x += sw;
    }
    y -= rowH;
  }
}

/** 너른 마당 — 가운데 둥근 자리에 박석을 깐다 */
export function paintCourtyard(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, rng: Rng, skip: (x: number, y: number) => boolean): void {
  wash(ctx, cx, cy, rx * 1.05, GRANITE, 0.12, Math.floor(rng() * 1e6), ry / rx);
  for (let y = cy - ry; y < cy + ry; y += 36) {
    const span = rx * Math.sqrt(Math.max(0, 1 - ((y + 18 - cy) / ry) ** 2));
    let x = cx - span + range(rng, -10, 10);
    while (x < cx + span) {
      const sw = range(rng, 46, 74);
      if (!skip(x + sw / 2, y + 18) && rng() > 0.05) flagstone(ctx, x + sw / 2, y + 18, sw - 5, 31, rng);
      x += sw;
    }
  }
}

/** 국화 한 포기 — 노랗고 흰 작은 꽃 */
export function paintChrysanthemum(ctx: Ctx, x: number, y: number, s: number, rng: Rng): void {
  const seed = Math.floor(rng() * 1e6);
  const leaf: RGB = [62, 80, 58];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + range(rng, -1.1, 1.1);
    const l = range(rng, 14, 24) * s;
    brushStroke(ctx, [{ x, y }, { x: x + Math.cos(a) * l * 0.5, y: y + Math.sin(a) * l * 0.6 }, { x: x + Math.cos(a) * l, y: y + Math.sin(a) * l }], {
      width: 5 * s,
      color: leaf,
      alpha: 0.55,
      dryness: 0.2,
      taperIn: 0.3,
      taperOut: 0.7,
      seed: seed + i,
    });
  }
  const yellow = rng() < 0.65;
  const petal: RGB = yellow ? [222, 176, 58] : [244, 238, 222];
  const n = 2 + Math.floor(rng() * 3);
  for (let f = 0; f < n; f++) {
    const fx = x + range(rng, -12, 12) * s;
    const fy = y - range(rng, 16, 28) * s;
    brushStroke(ctx, [{ x: fx, y: fy + 4 }, { x: fx + range(rng, -3, 3), y: y }], { width: 1.2, color: leaf, alpha: 0.6, seed: seed + 20 + f });
    const r = range(rng, 5, 7) * s;
    for (let p = 0; p < 12; p++) {
      const a = (p / 12) * TAU;
      brushStroke(ctx, [{ x: fx, y: fy }, { x: fx + Math.cos(a) * r, y: fy + Math.sin(a) * r * 0.8 }], {
        width: 2.4 * s,
        color: petal,
        alpha: 0.9,
        dryness: 0.1,
        taperIn: 0.3,
        taperOut: 0.6,
        seed: seed + 30 + f * 12 + p,
        edgeColor: yellow ? [170, 120, 30] : [170, 160, 140],
      });
    }
    dot(ctx, fx, fy, 1.8 * s, yellow ? [176, 110, 30] : [214, 170, 60], 0.95, seed + 60 + f);
  }
}

/** 처마 밑 단청 띠 — 뇌록 바탕에 붉은 꽃과 흰 테 */
export function paintDancheong(ctx: Ctx, w: number, y: number, h: number, rng: Rng): void {
  ctx.fillStyle = rgba(DAN_GREEN, 0.62);
  ctx.fillRect(0, y, w, h);
  brushStroke(ctx, [{ x: 0, y }, { x: w, y }], { width: 2, color: INK, alpha: 0.55, dryness: 0.6, taperIn: 0.01, taperOut: 0.01, seed: 31 });
  brushStroke(ctx, [{ x: 0, y: y + h }, { x: w, y: y + h }], { width: 2, color: INK, alpha: 0.55, dryness: 0.6, taperIn: 0.01, taperOut: 0.01, seed: 32 });
  for (let x = 18; x < w; x += 40) {
    const cy = y + h / 2;
    dot(ctx, x, cy, h * 0.36, PAPER_LIGHT, 0.9, Math.floor(rng() * 1e6));
    dot(ctx, x, cy, h * 0.26, DAN_RED, 0.95, Math.floor(rng() * 1e6));
    dot(ctx, x, cy, h * 0.1, [222, 176, 58], 1, Math.floor(rng() * 1e6));
    // 사이사이 흰 띠
    brushStroke(ctx, [{ x: x + 16, y: y + 2 }, { x: x + 22, y: y + h - 2 }], { width: 2, color: PAPER_LIGHT, alpha: 0.7, taperIn: 0.1, taperOut: 0.1, seed: Math.floor(rng() * 1e6) });
  }
}

/** 주인의 방 — 마당에 흩어진 오색 깃털 */
export function paintPhoenixSigns(ctx: Ctx, w: number, h: number, rng: Rng, blocked: (x: number, y: number, pad: number) => boolean): void {
  const five: RGB[] = [
    [52, 86, 116],
    [178, 58, 42],
    [192, 146, 56],
    [150, 146, 136],
    [40, 40, 46],
  ];
  for (let i = 0; i < 16; i++) {
    const x = range(rng, 200, w - 200);
    const y = range(rng, 260, h - 140);
    if (blocked(x, y, 10)) continue;
    const a = rng() * TAU;
    const l = range(rng, 26, 46);
    const col = five[i % 5];
    const tip = { x: x + Math.cos(a) * l, y: y + Math.sin(a) * l * 0.7 };
    brushStroke(ctx, [{ x, y }, { x: (x + tip.x) / 2 + Math.cos(a + 1.6) * 3, y: (y + tip.y) / 2 + Math.sin(a + 1.6) * 3 }, tip], {
      width: 6,
      color: col,
      alpha: 0.55,
      dryness: 0.3,
      taperIn: 0.4,
      taperOut: 0.75,
      seed: Math.floor(rng() * 1e6),
    });
    brushStroke(ctx, [{ x, y }, tip], { width: 0.9, color: INK, alpha: 0.5, taperOut: 0.5, seed: Math.floor(rng() * 1e6) });
  }
}

/* ───────── 장애물 ───────── */

/** 삼층 석탑 — 두 겹 기단 위에 몸돌과 지붕돌을 세 번 얹고 꼭대기에 상륜 */
export function paintPagoda(ctx: Ctx, r: number, rng: Rng, seed: number): void {
  wash(ctx, 4, 2, r * 1.9, DAMMUK, 0.2, seed + 1, 0.35);
  const slab = (cx: number, top: number, w: number, h: number, k: number): void => {
    ctx.beginPath();
    ctx.rect(cx - w / 2, top, w, h);
    const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, rgba(mix(GRANITE, PAPER_LIGHT, 0.45), 1));
    g.addColorStop(0.55, rgba(GRANITE, 1));
    g.addColorStop(1, rgba(mix(GRANITE, DAMMUK, 0.45), 1));
    ctx.fillStyle = g;
    ctx.fill();
    brushStroke(ctx, [{ x: cx - w / 2, y: top + h }, { x: cx - w / 2, y: top }, { x: cx + w / 2, y: top }], { width: 1.8, color: INK, alpha: 0.75, dryness: 0.5, taperIn: 0.1, taperOut: 0.1, seed: seed + k });
    brushStroke(ctx, [{ x: cx + w / 2, y: top }, { x: cx + w / 2, y: top + h }, { x: cx - w / 2, y: top + h }], { width: 2.4, color: INK, alpha: 0.85, dryness: 0.55, taperIn: 0.1, taperOut: 0.1, seed: seed + k + 50 });
  };
  /** 지붕돌 — 끝이 살짝 들린 넓적한 돌, 아래에 층급받침 */
  const roof = (y: number, w: number, k: number): void => {
    const lift = 5;
    ctx.beginPath();
    ctx.moveTo(-w / 2 - 2, y - lift);
    ctx.quadraticCurveTo(-w / 4, y - 2, 0, y - 9);
    ctx.quadraticCurveTo(w / 4, y - 2, w / 2 + 2, y - lift);
    ctx.lineTo(w / 2 - 4, y + 3);
    ctx.lineTo(-w / 2 + 4, y + 3);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y - 9, 0, y + 3);
    g.addColorStop(0, rgba(mix(GRANITE, PAPER_LIGHT, 0.5), 1));
    g.addColorStop(1, rgba(mix(GRANITE, DAMMUK, 0.35), 1));
    ctx.fillStyle = g;
    ctx.fill();
    brushStroke(ctx, [{ x: -w / 2 - 2, y: y - lift }, { x: -w / 4, y: y - 3 }, { x: 0, y: y - 9 }, { x: w / 4, y: y - 3 }, { x: w / 2 + 2, y: y - lift }], {
      width: 2.6,
      color: INK,
      alpha: 0.85,
      dryness: 0.4,
      taperIn: 0.3,
      taperOut: 0.3,
      seed: seed + 100 + k,
    });
    for (let s = 0; s < 3; s++) {
      const ww = w * (0.62 - s * 0.08);
      brushStroke(ctx, [{ x: -ww / 2, y: y + 4 + s * 2.6 }, { x: ww / 2, y: y + 4 + s * 2.6 }], { width: 1.2, color: INK, alpha: 0.55, dryness: 0.6, taperIn: 0.05, taperOut: 0.05, seed: seed + 110 + k * 3 + s });
    }
  };
  slab(0, -12, r * 2 + 14, 12, 1);
  slab(0, -24, r * 2 - 2, 12, 2);
  let y = -24;
  const tiers: [number, number, number][] = [
    [r * 1.0, 30, r * 2 + 8],
    [r * 0.84, 18, r * 2 - 4],
    [r * 0.7, 14, r * 2 - 14],
  ];
  tiers.forEach(([bw, bh, rw], k) => {
    slab(0, y - bh, bw, bh, 10 + k);
    // 우주(모서리 기둥) 자국
    brushStroke(ctx, [{ x: -bw / 2 + 3, y: y - bh + 2 }, { x: -bw / 2 + 3, y: y - 2 }], { width: 1.1, color: INK, alpha: 0.4, seed: seed + 20 + k });
    brushStroke(ctx, [{ x: bw / 2 - 3, y: y - bh + 2 }, { x: bw / 2 - 3, y: y - 2 }], { width: 1.1, color: INK, alpha: 0.4, seed: seed + 25 + k });
    y -= bh;
    roof(y - 3, rw, k);
    y -= 12;
  });
  // 상륜 — 둥근 돌을 꿰어 세웠다
  brushStroke(ctx, [{ x: 0, y: y + 4 }, { x: 0, y: y - 30 }], { width: 3, color: mix(GRANITE, DAMMUK, 0.5), alpha: 1, dryness: 0.3, taperIn: 0.05, taperOut: 0.3, seed: seed + 40 });
  for (const [dy, rr] of [
    [-2, 5],
    [-12, 4.2],
    [-20, 3.4],
  ] as [number, number][]) {
    inkBlob(ctx, 0, y + dy, rr, { color: GRANITE, edge: DAMMUK, alpha: 1, seed: seed + 41 + dy, wobble: 0.04, squash: 0.65, halo: 0, light: 0.3 });
  }
  // 이끼와 얼룩
  for (let i = 0; i < 10; i++) dot(ctx, range(rng, -r, r), range(rng, -110, -4), range(rng, 1, 2.4), i % 3 ? MOSS : INK, range(rng, 0.35, 0.7), seed + 60 + i);
  // 밑동에 떨어진 단풍
  for (let i = 0; i < 5; i++) mapleLeaf(ctx, range(rng, -r - 10, r + 10), range(rng, -3, 6), range(rng, 5, 7), MAPLE[i % MAPLE.length], rng() * TAU, 0.75, seed + 70 + i * 10);
}

/** 단풍나무 — 굽은 줄기에서 가지가 퍼지고, 붉은 잎이 무리 지어 달렸다 */
export function paintMaple(ctx: Ctx, r: number, rng: Rng, seed: number): void {
  wash(ctx, 0, 4, r * 1.9, DAMMUK, 0.16, seed + 1, 0.4);
  const lean = range(rng, -0.25, 0.25);
  const trunk = [
    { x: 0, y: 6 },
    { x: lean * 16 + 3, y: -40 },
    { x: lean * 34 - 5, y: -84 },
    { x: lean * 44 + 2, y: -120 },
  ];
  brushStroke(ctx, trunk, { width: 18, color: mix(INK, DAMMUK, 0.3), alpha: 0.92, dryness: 0.6, taperIn: 0.02, taperOut: 0.45, seed: seed + 2, wet: 0.2 });
  brushStroke(ctx, trunk.map((p) => ({ x: p.x - 5, y: p.y })), { width: 4, color: INK, alpha: 0.7, dryness: 0.7, taperIn: 0.1, taperOut: 0.5, seed: seed + 3 });
  const top = trunk[3];
  const crown = { x: top.x, y: top.y - 50 };
  const tips: Vec[] = [];
  for (let b = 0; b < 6; b++) {
    const a = -Math.PI / 2 + (b - 2.5) * 0.55 + range(rng, -0.12, 0.12);
    const len = range(rng, 55, 90);
    const from = trunk[2 + (b % 2)];
    const mid = { x: from.x + Math.cos(a) * len * 0.5, y: from.y + Math.sin(a) * len * 0.45 - 6 };
    const end = { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len * 0.7 };
    brushStroke(ctx, [from, mid, end], { width: 6 - Math.abs(b - 2.5), color: mix(INK, DAMMUK, 0.35), alpha: 0.85, dryness: 0.5, taperIn: 0.05, taperOut: 0.7, seed: seed + 10 + b });
    tips.push(mid, end);
  }
  // 잎 무리 — 뒤는 짙은 다홍, 앞은 밝은 주황과 노랑
  const clusters: { x: number; y: number; depth: number }[] = [];
  for (let i = 0; i < 26; i++) {
    const t = tips[i % tips.length];
    clusters.push({ x: t.x + range(rng, -26, 26), y: t.y + range(rng, -22, 16), depth: rng() });
  }
  for (let i = 0; i < 10; i++) clusters.push({ x: crown.x + range(rng, -70, 70), y: crown.y + range(rng, -40, 40), depth: rng() });
  clusters.sort((a, b) => a.depth - b.depth);
  for (const [n, c] of clusters.entries()) {
    const back = c.depth < 0.4;
    const col = back ? MAPLE[n % 2 === 0 ? 4 : 0] : MAPLE[1 + (n % 3)];
    wash(ctx, c.x, c.y, range(rng, 16, 26), col, back ? 0.18 : 0.14, seed + 200 + n, 0.75);
    const leaves = back ? 4 : 6;
    for (let k = 0; k < leaves; k++) {
      mapleLeaf(ctx, c.x + range(rng, -14, 14), c.y + range(rng, -10, 10), range(rng, 6, 9), back ? mix(col, INK, 0.12) : col, range(rng, -0.6, 0.6), back ? 0.7 : 0.88, seed + 300 + n * 10 + k, 0.95);
    }
  }
  // 떨어지는 잎과 밑동의 잎
  for (let i = 0; i < 4; i++) mapleLeaf(ctx, range(rng, -60, 60), range(rng, -70, -20), range(rng, 5, 7), MAPLE[i % 5], rng() * TAU, 0.75, seed + 600 + i * 10, 0.9);
  for (let i = 0; i < 9; i++) mapleLeaf(ctx, range(rng, -r * 1.4, r * 1.4), range(rng, -2, 8), range(rng, 5, 7), MAPLE[i % 5], rng() * TAU, 0.7, seed + 700 + i * 10);
}

/** 종각 — 돌 기단 위에 붉은 기둥 넷, 단청 두른 대들보, 팔작지붕. 종은 따로 걸어 흔든다 */
export function paintBellPavilion(ctx: Ctx, r: number, beam: number, rng: Rng, seed: number): void {
  wash(ctx, 6, 4, r * 2.6, DAMMUK, 0.2, seed + 1, 0.35);
  // 기단
  const bw = 150;
  ctx.beginPath();
  ctx.rect(-bw / 2, -14, bw, 14);
  const g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
  g.addColorStop(0, rgba(mix(GRANITE, PAPER_LIGHT, 0.4), 1));
  g.addColorStop(1, rgba(mix(GRANITE, DAMMUK, 0.4), 1));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -14, bw / 2, 9, 0, Math.PI, TAU);
  ctx.fillStyle = rgba(mix(GRANITE, PAPER_LIGHT, 0.25), 1);
  ctx.fill();
  brushStroke(ctx, [{ x: -bw / 2, y: -14 }, { x: bw / 2, y: -14 }, { x: bw / 2, y: 0 }, { x: -bw / 2, y: 0 }], { width: 2, color: INK, alpha: 0.75, dryness: 0.5, taperIn: 0.05, taperOut: 0.05, seed: seed + 2 });
  // 종 아래 울림 구덩이
  ctx.beginPath();
  ctx.ellipse(0, -14, 24, 5.5, 0, 0, TAU);
  ctx.fillStyle = rgba(mix(INK, DAMMUK, 0.4), 0.8);
  ctx.fill();
  // 기둥 — 뒤의 둘은 옅게
  const post = (x: number, y0: number, w: number, back: boolean, k: number): void => {
    const col = back ? mix(PILLAR, PAPER, 0.35) : PILLAR;
    brushStroke(ctx, [{ x, y: y0 }, { x, y: -beam - 2 }], { width: w, color: col, alpha: 1, dryness: 0.25, taperIn: 0.02, taperOut: 0.02, seed: seed + 10 + k, edgeColor: mix(col, INK, 0.45) });
    brushStroke(ctx, [{ x: x - w * 0.3, y: y0 - 2 }, { x: x - w * 0.3, y: -beam + 4 }], { width: 1.2, color: PAPER_LIGHT, alpha: back ? 0.2 : 0.35, seed: seed + 15 + k });
    // 주춧돌
    inkBlob(ctx, x, y0 + 1, w * 0.9, { color: GRANITE, edge: DAMMUK, alpha: 1, seed: seed + 20 + k, wobble: 0.06, squash: 0.45, halo: 0, light: 0.3 });
  };
  post(-50, -26, 7, true, 1);
  post(50, -26, 7, true, 2);
  // 대들보 — 단청
  const beamY = -beam;
  ctx.fillStyle = rgba(DAN_GREEN, 0.95);
  ctx.fillRect(-72, beamY - 10, 144, 10);
  for (let x = -60; x <= 60; x += 30) {
    dot(ctx, x, beamY - 5, 3.6, PAPER_LIGHT, 0.95, seed + 30 + x);
    dot(ctx, x, beamY - 5, 2.4, DAN_RED, 1, seed + 31 + x);
  }
  brushStroke(ctx, [{ x: -74, y: beamY - 10 }, { x: 74, y: beamY - 10 }], { width: 2, color: INK, alpha: 0.8, dryness: 0.4, taperIn: 0.05, taperOut: 0.05, seed: seed + 32 });
  brushStroke(ctx, [{ x: -74, y: beamY }, { x: 74, y: beamY }], { width: 2.4, color: INK, alpha: 0.85, dryness: 0.4, taperIn: 0.05, taperOut: 0.05, seed: seed + 33 });
  // 종을 거는 고리
  brushStroke(ctx, [{ x: 0, y: beamY }, { x: 0, y: beamY + 6 }], { width: 3, color: INK, alpha: 0.9, seed: seed + 34 });
  // 당목 — 종을 치는 통나무가 줄에 매달려 있다
  const logY = beamY + 46;
  for (const x of [-78, -50]) brushStroke(ctx, [{ x, y: beamY }, { x: x + 1, y: logY }], { width: 1.2, color: mix([150, 120, 80], INK, 0.3), alpha: 0.85, seed: seed + 35 + x });
  brushStroke(ctx, [{ x: -88, y: logY }, { x: -40, y: logY + 1 }], { width: 9, color: [150, 116, 76], alpha: 1, dryness: 0.4, taperIn: 0.02, taperOut: 0.02, seed: seed + 37, edgeColor: mix([150, 116, 76], INK, 0.5) });
  // 지붕 — 처마 끝이 들린 팔작지붕
  const eave = beamY - 12;
  const ridge = beamY - 58;
  ctx.beginPath();
  ctx.moveTo(-98, eave - 12);
  ctx.quadraticCurveTo(-64, eave + 2, -44, ridge + 10);
  ctx.lineTo(44, ridge + 10);
  ctx.quadraticCurveTo(64, eave + 2, 98, eave - 12);
  ctx.quadraticCurveTo(60, eave + 6, 0, eave + 4);
  ctx.quadraticCurveTo(-60, eave + 6, -98, eave - 12);
  ctx.closePath();
  const rg = ctx.createLinearGradient(0, ridge, 0, eave + 6);
  rg.addColorStop(0, rgba(mix(TILE, PAPER, 0.3), 1));
  rg.addColorStop(1, rgba(TILE, 1));
  ctx.fillStyle = rg;
  ctx.fill();
  // 기왓골
  for (let i = -8; i <= 8; i++) {
    const x = i * 10.5;
    const top = ridge + 12 + Math.abs(i) * 0.4;
    brushStroke(ctx, [{ x: x * 0.48, y: top }, { x: x * 0.8, y: eave - 4 + Math.abs(i) * -0.6 }, { x, y: eave + 2 - Math.pow(Math.abs(i) / 8, 3) * 12 }], {
      width: 1.6,
      color: INK,
      alpha: 0.45,
      dryness: 0.6,
      taperIn: 0.1,
      taperOut: 0.1,
      seed: seed + 40 + i,
    });
  }
  // 막새와 처마선
  brushStroke(ctx, [{ x: -100, y: eave - 14 }, { x: -60, y: eave + 4 }, { x: 0, y: eave + 6 }, { x: 60, y: eave + 4 }, { x: 100, y: eave - 14 }], {
    width: 5,
    color: INK,
    alpha: 0.85,
    dryness: 0.4,
    taperIn: 0.15,
    taperOut: 0.15,
    seed: seed + 60,
  });
  for (let x = -84; x <= 84; x += 12) dot(ctx, x, eave + 5 - Math.pow(Math.abs(x) / 96, 3) * 15, 2.4, INK, 0.75, seed + 61 + x);
  // 용마루
  brushStroke(ctx, [{ x: -50, y: ridge + 6 }, { x: -44, y: ridge + 10 }, { x: 44, y: ridge + 10 }, { x: 50, y: ridge + 6 }], { width: 7, color: INK, alpha: 0.9, dryness: 0.35, taperIn: 0.2, taperOut: 0.2, seed: seed + 62 });
  // 앞 기둥 — 지붕 아래, 종 양옆
  post(-58, -10, 8, false, 3);
  post(58, -10, 8, false, 4);
  // 밑동의 단풍잎
  for (let i = 0; i < 6; i++) mapleLeaf(ctx, range(rng, -bw / 2 - 10, bw / 2 + 10), range(rng, 2, 10), range(rng, 5, 7), MAPLE[i % 5], rng() * TAU, 0.75, seed + 80 + i * 10);
}

/** 범종 — 용뉴와 음통, 어깨띠, 젖꼭지 아홉 개의 유곽, 연꽃 당좌, 입술띠. 원점은 고리 */
export const BELL_BOX = { w: 70, h: 92, ox: 35, oy: 4 };

export function paintBell(ctx: Ctx): void {
  const top = 12;
  const bottom = 84;
  const half0 = 18;
  const half1 = 27;
  // 용뉴 — 고리를 문 용머리
  brushStroke(ctx, [{ x: -8, y: top }, { x: -9, y: 3 }, { x: 0, y: -1 }, { x: 8, y: 4 }, { x: 6, y: top }], { width: 4.5, color: mix(BRONZE, INK, 0.3), alpha: 1, dryness: 0.3, taperIn: 0.2, taperOut: 0.4, seed: 901 });
  brushStroke(ctx, [{ x: 10, y: top }, { x: 11, y: top - 9 }], { width: 3.4, color: mix(BRONZE, INK, 0.2), alpha: 1, seed: 902 });
  // 몸 — 어깨에서 아래로 살짝 벌어졌다 입술에서 오므린다
  ctx.beginPath();
  ctx.moveTo(-half0, top + 2);
  ctx.quadraticCurveTo(-half0 - 2, top - 2, 0, top - 3);
  ctx.quadraticCurveTo(half0 + 2, top - 2, half0, top + 2);
  ctx.bezierCurveTo(half0 + 6, top + 30, half1 + 2, bottom - 18, half1 - 1, bottom);
  ctx.quadraticCurveTo(0, bottom + 5, -half1 + 1, bottom);
  ctx.bezierCurveTo(-half1 - 2, bottom - 18, -half0 - 6, top + 30, -half0, top + 2);
  ctx.closePath();
  const g = ctx.createLinearGradient(-half1, 0, half1, 0);
  g.addColorStop(0, rgba(mix(BRONZE, PAPER_LIGHT, 0.35), 1));
  g.addColorStop(0.35, rgba(BRONZE, 1));
  g.addColorStop(0.7, rgba(mix(BRONZE, PATINA, 0.5), 1));
  g.addColorStop(1, rgba(mix(BRONZE, INK, 0.45), 1));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // 푸른 녹
  wash(ctx, 10, 44, 18, PATINA, 0.35, 905, 1.4);
  wash(ctx, -12, 70, 10, PATINA, 0.25, 906, 1);
  ctx.restore();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = rgba(INK, 0.85);
  ctx.stroke();
  // 어깨띠와 입술띠
  const band = (y: number, h: number, half: number, k: number): void => {
    brushStroke(ctx, [{ x: -half, y }, { x: 0, y: y + 2 }, { x: half, y }], { width: h, color: mix(BRONZE, INK, 0.25), alpha: 0.9, dryness: 0.3, taperIn: 0.05, taperOut: 0.05, seed: 910 + k });
    for (let x = -half + 4; x < half - 2; x += 5) dot(ctx, x, y + 1, 0.9, mix(BRONZE, PAPER_LIGHT, 0.4), 0.8, 912 + k * 20 + x);
  };
  band(top + 5, 4, half0 + 1, 0);
  band(bottom - 5, 5, half1 - 1, 1);
  // 유곽 — 네모 안에 젖꼭지 아홉
  for (const sx of [-1, 1]) {
    const cx = sx * 10;
    const cy = top + 17;
    brushStroke(ctx, [{ x: cx - 6, y: cy - 6 }, { x: cx + 6, y: cy - 6 }, { x: cx + 6, y: cy + 6 }, { x: cx - 6, y: cy + 6 }, { x: cx - 6, y: cy - 6 }], { width: 1, color: INK, alpha: 0.6, taperIn: 0, taperOut: 0, seed: 930 + sx });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) dot(ctx, cx - 3.6 + i * 3.6, cy - 3.6 + j * 3.6, 1, mix(BRONZE, PAPER_LIGHT, 0.45), 1, 940 + i * 3 + j + sx * 10);
  }
  // 당좌 — 연꽃 무늬 치는 자리
  const dy = bottom - 22;
  for (let p = 0; p < 8; p++) {
    const a = (p / 8) * TAU;
    brushStroke(ctx, [{ x: 0, y: dy }, { x: Math.cos(a) * 6, y: dy + Math.sin(a) * 5 }], { width: 3, color: mix(BRONZE, PAPER_LIGHT, 0.3), alpha: 0.9, taperIn: 0.3, taperOut: 0.6, seed: 960 + p });
  }
  dot(ctx, 0, dy, 2, mix(BRONZE, INK, 0.4), 1, 970);
  ctx.beginPath();
  ctx.ellipse(0, dy, 8, 6.8, 0, 0, TAU);
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.stroke();
  // 빛 받은 쪽
  brushStroke(ctx, [{ x: -half0 + 3, y: top + 8 }, { x: -half0 - 1, y: top + 36 }, { x: -half1 + 5, y: bottom - 8 }], { width: 2.2, color: PAPER_LIGHT, alpha: 0.35, dryness: 0.4, seed: 980 });
}
