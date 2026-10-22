/**
 * 방 한 칸 = 그림 한 폭. 위쪽에 기와를 얹은 돌담, 아래쪽에 디딤돌, 샘이면 연못을 그린다.
 * 바위와 대숲은 따로 그려 두었다가 인물과 앞뒤를 가려 세운다.
 */
import { type Vec, TAU } from '../core/math';
import { type Rng, mulberry32 } from '../core/rng';
import { BELL_HANG, CHAPTERS, ENTRANCE, type Obstacle, type RoomDef, type RoomLayout, WALL_TOP, type Water } from '../game/rooms';
import { arcPoints, brushStroke, dot, inkBlob, wash } from './brush';
import { type RGB, DAMMUK, INK, PAPER, PAPER_LIGHT, mix, rgba } from './color';
import { createPaperCanvas } from './paper';
import { MAPLE, mapleLeaf, paintBellPavilion, paintChrysanthemum, paintCourtyard, paintDancheong, paintFlagPath, paintMaple, paintPagoda, paintPhoenixSigns } from './temple';

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
    if (layout.desk && Math.hypot(x - layout.desk.x, (y - layout.desk.y) / 0.6) < layout.desk.r + 50 + pad) return true;
    if (layout.waters.some((w) => Math.hypot((x - w.x) / (w.rx + 20 + pad), (y - w.y) / (w.ry + 14 + pad)) < 1)) return true;
    return layout.obstacles.some((o) => Math.hypot(x - o.x, (y - o.y) / 0.62) < o.r + 30 + pad);
  };

  const lotus = CHAPTERS[def.chapter].id === 'lotus';
  const temple = CHAPTERS[def.chapter].id === 'temple';
  if (temple) {
    // 산사 — 입구에서 담장 가운데로 박석 길, 주인의 방은 너른 박석 마당
    const skip = (x: number, y: number): boolean => blocked(x, y, -10) && Math.hypot(x - ENTRANCE.x, y - ENTRANCE.y) > 120;
    if (def.kind === 'boss') paintCourtyard(ctx, w / 2, h / 2 + 50, 560, 300, rng, skip);
    else paintFlagPath(ctx, w / 2, WALL_TOP + 10, h - 30, range(rng, 70, 90), rng, skip);
  }
  // 떨어진 잎 — 대숲은 댓잎, 연못은 가는 버들잎, 산사는 단풍잎
  for (let i = 0; i < (temple ? 90 : 70); i++) {
    const x = range(rng, 60, w - 60);
    const y = range(rng, WALL_TOP + 30, h - 50);
    if (blocked(x, y, 0)) continue;
    const a = rng() * TAU;
    if (temple) {
      mapleLeaf(ctx, x, y, range(rng, 5, 8), MAPLE[Math.floor(rng() * MAPLE.length)], a, range(rng, 0.45, 0.75), Math.floor(rng() * 1e6));
      continue;
    }
    const l = range(rng, 7, 13) * (lotus ? 0.8 : 1);
    brushStroke(ctx, [{ x, y }, { x: x + Math.cos(a) * l, y: y + Math.sin(a) * l * 0.6 }], {
      width: range(rng, 2.4, 3.6) * (lotus ? 0.7 : 1),
      color: lotus ? WILLOW_INK : LEAF_INK,
      alpha: range(rng, 0.18, 0.35),
      dryness: 0.2,
      taperIn: 0.3,
      taperOut: 0.7,
      seed: Math.floor(rng() * 1e6),
    });
  }
  // 풀 — 연못에는 갈대가 섞인다. 산사는 풀이 성기다
  for (let i = 0; i < (temple ? 28 : 55); i++) {
    const x = range(rng, 60, w - 60);
    const y = range(rng, WALL_TOP + 40, h - 50);
    if (blocked(x, y, 10)) continue;
    if (lotus && rng() < 0.35) paintReeds(ctx, x, y, range(rng, 0.7, 1.1), rng);
    else paintGrass(ctx, x, y, range(rng, 0.6, 1.2), rng);
  }
  // 물 — 가장자리에 갈대를 두른다
  for (const water of layout.waters) {
    paintWater(ctx, water, rng);
    for (let k = 0; k < 7; k++) {
      const a = rng() * TAU;
      paintReeds(ctx, water.x + Math.cos(a) * (water.rx + 6), water.y + Math.sin(a) * (water.ry + 4), range(rng, 0.8, 1.25), rng);
    }
  }
  // 난초 몇 포기 — 산사에는 국화
  for (let i = 0; i < (temple ? 6 : 4); i++) {
    const x = range(rng, 120, w - 120);
    const y = range(rng, WALL_TOP + 120, h - 80);
    if (blocked(x, y, 60) || Math.hypot(x - w / 2, (y - h / 2) * 1.4) < 200) continue;
    if (temple) paintChrysanthemum(ctx, x, y, range(rng, 0.85, 1.2), rng);
    else paintOrchid(ctx, x, y, range(rng, 0.75, 1.1), rng);
  }

  if (layout.pond) paintPond(ctx, layout.pond.x, layout.pond.y, layout.pond.r, rng);
  if (def.kind === 'boss' && CHAPTERS[def.chapter].id === 'bamboo') paintTigerSigns(ctx, w, h, rng, blocked);
  if (def.kind === 'boss' && temple) paintPhoenixSigns(ctx, w, h, rng, blocked);
  if (layout.desk) paintDesk(ctx, layout.desk.x, layout.desk.y, rng);
  paintSteppingStones(ctx, w, h, rng);
  paintWall(ctx, w, rng, temple);
  paintBorder(ctx, w, h, rng);
  return c;
}

/* ───────── 담장 ───────── */

function paintWall(ctx: Ctx, w: number, rng: Rng, temple: boolean): void {
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
  // 산사의 담은 처마 밑에 단청을 둘렀다
  if (temple) paintDancheong(ctx, w, roofY + 10, 11, rng);
  brushStroke(ctx, roof(roofY - 14, 10), { width: 9, color: INK, alpha: 0.85, dryness: 0.45, taperIn: 0.02, taperOut: 0.02, seed: 21 });
  brushStroke(ctx, roof(roofY + 2, 12), { width: 14, color: mix(INK, DAMMUK, 0.4), alpha: 0.7, dryness: 0.55, taperIn: 0.02, taperOut: 0.02, seed: 22 });
  for (let x = 6; x < w; x += 17) {
    dot(ctx, x, roofY + 10, 4.2, INK, 0.75, Math.floor(rng() * 1e6));
    brushStroke(ctx, [{ x, y: roofY - 8 }, { x: x + 2, y: roofY + 6 }], { width: 2, color: INK, alpha: 0.35, dryness: 0.6, seed: Math.floor(rng() * 1e6) });
  }
}

/* ───────── 연못 ───────── */

const WILLOW_INK: RGB = [70, 86, 62];
const LILY: RGB = [96, 122, 98];
const LOTUS_PINK: RGB = [222, 138, 146];

/** 물이 고인 자리 — 맑은 먹의 물에 연잎이 뜨고 연꽃이 핀다 */
function paintWater(ctx: Ctx, w: Water, rng: Rng): void {
  wash(ctx, w.x, w.y, w.rx * 1.12, DAMMUK, 0.13, Math.floor(rng() * 1e6), (w.ry / w.rx) * 1.05);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(w.x, w.y, w.rx, w.ry, 0, 0, TAU);
  const g = ctx.createRadialGradient(w.x - w.rx * 0.25, w.y - w.ry * 0.3, w.ry * 0.2, w.x, w.y, w.rx);
  g.addColorStop(0, rgba(mix(PAPER_LIGHT, [150, 172, 178], 0.25), 0.65));
  g.addColorStop(0.7, rgba(mix(DAMMUK, [70, 98, 112], 0.45), 0.2));
  g.addColorStop(1, rgba(mix(DAMMUK, [52, 74, 86], 0.45), 0.4));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  // 물가 — 먹이 고여 짙은 테
  brushStroke(ctx, arcPoints(w.x, w.y, w.rx, rng() * TAU, TAU * 0.97, 40, w.rx, w.ry / w.rx), {
    width: 3,
    color: mix(DAMMUK, [50, 70, 80], 0.4),
    alpha: 0.45,
    dryness: 0.7,
    taperIn: 0.1,
    taperOut: 0.1,
    seed: Math.floor(rng() * 1e6),
  });
  // 잔물결
  for (let k = 0; k < 7; k++) {
    const rr = range(rng, 0.25, 0.85);
    const a0 = rng() * TAU;
    brushStroke(ctx, arcPoints(w.x, w.y, w.rx * rr, a0, range(rng, 0.8, 1.6), 10, w.rx * rr, w.ry / w.rx), {
      width: 1.4,
      color: DAMMUK,
      alpha: 0.32,
      dryness: 0.5,
      taperIn: 0.3,
      taperOut: 0.3,
      seed: Math.floor(rng() * 1e6),
    });
  }
  // 연잎 — 둥근 잎에 잎맥, 한쪽이 갈라졌다
  const leaves = Math.round((w.rx * w.ry) / 3200);
  for (let i = 0; i < leaves; i++) {
    const a = rng() * TAU;
    const d = Math.sqrt(rng()) * 0.85;
    const lx = w.x + Math.cos(a) * w.rx * d;
    const ly = w.y + Math.sin(a) * w.ry * d;
    lilyPad(ctx, lx, ly, range(rng, 13, 24), rng);
  }
  // 연꽃
  const flowers = 1 + Math.floor(leaves / 4);
  for (let f = 0; f < flowers; f++) {
    const a = rng() * TAU;
    const d = Math.sqrt(rng()) * 0.7;
    lotusFlower(ctx, w.x + Math.cos(a) * w.rx * d, w.y + Math.sin(a) * w.ry * d, range(rng, 0.8, 1.15), rng);
  }
}

function lilyPad(ctx: Ctx, x: number, y: number, r: number, rng: Rng): void {
  const seed = Math.floor(rng() * 1e6);
  const notch = rng() * TAU;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.ellipse(x, y, r, r * 0.55, 0, notch + 0.25, notch + TAU - 0.25);
  ctx.closePath();
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, rgba(mix(LILY, PAPER_LIGHT, 0.25), 0.85));
  g.addColorStop(1, rgba(mix(LILY, INK, 0.25), 0.85));
  ctx.fillStyle = g;
  ctx.fill();
  for (let k = 0; k < 7; k++) {
    const va = notch + 0.4 + (k / 7) * (TAU - 0.8);
    brushStroke(ctx, [{ x, y }, { x: x + Math.cos(va) * r * 0.85, y: y + Math.sin(va) * r * 0.47 }], { width: 0.9, color: mix(LILY, INK, 0.5), alpha: 0.55, taperOut: 0.7, seed: seed + k });
  }
  brushStroke(ctx, arcPoints(x, y, r, notch + 0.3, TAU - 0.6, 18, r, 0.55), { width: 1.4, color: mix(LILY, INK, 0.55), alpha: 0.6, dryness: 0.5, seed: seed + 9 });
}

function lotusFlower(ctx: Ctx, x: number, y: number, s: number, rng: Rng): void {
  const seed = Math.floor(rng() * 1e6);
  lilyPad(ctx, x + 4, y + 6, 16 * s, rng);
  for (let p = 0; p < 7; p++) {
    const a = -Math.PI / 2 + (p - 3) * 0.36;
    const len = (p === 3 ? 18 : 15 - Math.abs(p - 3) * 1.2) * s;
    brushStroke(ctx, [{ x, y }, { x: x + Math.cos(a) * len * 0.6, y: y + Math.sin(a) * len * 0.75 }, { x: x + Math.cos(a) * len, y: y + Math.sin(a) * len }], {
      width: 8 * s,
      color: LOTUS_PINK,
      alpha: 0.78,
      dryness: 0.08,
      taperIn: 0.35,
      taperOut: 0.8,
      seed: seed + p,
      edgeColor: [176, 72, 86],
    });
  }
  dot(ctx, x, y - 5 * s, 2.6 * s, [214, 172, 64], 0.95, seed + 20);
}

/** 갈대 — 가늘게 휜 줄기 끝에 이삭 */
function paintReeds(ctx: Ctx, x: number, y: number, s: number, rng: Rng): void {
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const lean = range(rng, -0.35, 0.35);
    const h = range(rng, 34, 58) * s;
    const bx = x + range(rng, -6, 6);
    const tip = { x: bx + Math.sin(lean) * h, y: y - Math.cos(lean) * h };
    brushStroke(ctx, [{ x: bx, y }, { x: bx + Math.sin(lean) * h * 0.5 + lean * 4, y: y - h * 0.5 }, tip], {
      width: 1.8,
      color: WILLOW_INK,
      alpha: 0.6,
      dryness: 0.3,
      taperIn: 0.05,
      taperOut: 0.6,
      seed: Math.floor(rng() * 1e6),
    });
    if (rng() < 0.6) {
      brushStroke(ctx, [tip, { x: tip.x + Math.sin(lean) * 9, y: tip.y - 10 }], { width: 3.4, color: [140, 116, 82], alpha: 0.7, dryness: 0.4, taperIn: 0.3, taperOut: 0.7, seed: Math.floor(rng() * 1e6) });
    }
  }
  // 칼 같은 잎 하나
  const a = range(rng, -0.9, 0.9);
  brushStroke(ctx, [{ x, y }, { x: x + Math.sin(a) * 14 * s, y: y - 18 * s }, { x: x + Math.sin(a) * 30 * s, y: y - 24 * s }], {
    width: 3,
    color: WILLOW_INK,
    alpha: 0.55,
    dryness: 0.2,
    taperIn: 0.1,
    taperOut: 0.9,
    seed: Math.floor(rng() * 1e6),
  });
}

/** 수양버들 — 굽은 줄기에서 가는 가지가 길게 늘어진다 */
function paintWillow(ctx: Ctx, r: number, rng: Rng, seed: number): void {
  wash(ctx, 0, 4, r * 1.8, DAMMUK, 0.15, seed + 1, 0.4);
  // 줄기 — 굵고 비틀린 먹
  const lean = range(rng, -0.25, 0.25);
  const trunk = [
    { x: 0, y: 6 },
    { x: lean * 20 + 4, y: -40 },
    { x: lean * 40 - 6, y: -90 },
    { x: lean * 60 + 2, y: -150 },
  ];
  brushStroke(ctx, trunk, { width: 22, color: mix(INK, DAMMUK, 0.35), alpha: 0.9, dryness: 0.6, taperIn: 0.02, taperOut: 0.4, seed: seed + 2, wet: 0.2 });
  brushStroke(ctx, trunk.map((p) => ({ x: p.x - 6, y: p.y })), { width: 5, color: INK, alpha: 0.7, dryness: 0.7, taperIn: 0.1, taperOut: 0.5, seed: seed + 3 });
  // 옹이
  for (let i = 0; i < 3; i++) dot(ctx, range(rng, -6, 6) + lean * 40, range(rng, -120, -30), range(rng, 2, 3.5), INK, 0.7, seed + 4 + i);
  // 가지와 늘어진 실가지
  const top = trunk[trunk.length - 1];
  const tips: { x: number; y: number }[] = [];
  for (let b = 0; b < 6; b++) {
    const a = -Math.PI / 2 + (b - 2.5) * 0.45 + range(rng, -0.15, 0.15);
    const len = range(rng, 50, 85);
    const mid = { x: top.x + Math.cos(a) * len * 0.5, y: top.y + Math.sin(a) * len * 0.5 - 8 };
    const end = { x: top.x + Math.cos(a) * len, y: top.y + Math.sin(a) * len * 0.6 };
    brushStroke(ctx, [top, mid, end], { width: 5 - Math.abs(b - 2.5), color: mix(INK, DAMMUK, 0.4), alpha: 0.85, dryness: 0.5, taperIn: 0.05, taperOut: 0.7, seed: seed + 10 + b });
    tips.push(mid, end);
  }
  for (const [n, t] of tips.entries()) {
    const strands = 3 + (n % 3);
    for (let k = 0; k < strands; k++) {
      const x0 = t.x + range(rng, -8, 8);
      const len = range(rng, 70, 140);
      const sway = range(rng, -10, 10);
      const near = (n + k) % 3 !== 0;
      brushStroke(
        ctx,
        [
          { x: x0, y: t.y },
          { x: x0 + sway * 0.3, y: t.y + len * 0.45 },
          { x: x0 + sway, y: t.y + len },
        ],
        { width: 1.6, color: near ? WILLOW_INK : mix(WILLOW_INK, PAPER, 0.4), alpha: near ? 0.7 : 0.45, dryness: 0.25, taperIn: 0.05, taperOut: 0.85, seed: seed + 100 + n * 10 + k },
      );
      // 가는 잎이 줄지어 달린다
      for (let j = 1; j < 6; j++) {
        const yy = t.y + (len * j) / 6;
        const xx = x0 + sway * (j / 6) * (j / 6);
        const side = j % 2 ? 1 : -1;
        brushStroke(ctx, [{ x: xx, y: yy }, { x: xx + side * 5, y: yy + 4 }], { width: 2.2, color: WILLOW_INK, alpha: near ? 0.55 : 0.35, taperIn: 0.3, taperOut: 0.8, seed: seed + 300 + n * 40 + k * 6 + j });
      }
    }
  }
  // 밑동의 풀
  for (let i = 0; i < 4; i++) {
    const gx = range(rng, -r * 1.1, r * 1.1);
    brushStroke(ctx, [{ x: gx, y: 6 }, { x: gx + range(rng, -8, 8), y: -range(rng, 10, 20) }], { width: 2.4, color: DAMMUK, alpha: 0.5, taperIn: 0.05, taperOut: 0.85, seed: seed + 400 + i });
  }
}

/* ───────── 문방 ───────── */

const WOOD: RGB = [128, 92, 60];
const MAT: RGB = [206, 178, 120];

/** 서안(書案) — 돗자리 위의 낮은 책상에 벼루와 붓, 두루마리가 놓였다 */
function paintDesk(ctx: Ctx, x: number, y: number, rng: Rng): void {
  const seed = Math.floor(rng() * 1e6);
  // 돗자리
  wash(ctx, x, y + 26, 150, MAT, 0.32, seed, 0.42);
  for (let i = -5; i <= 5; i++) {
    brushStroke(ctx, [{ x: x - 140, y: y + 26 + i * 10 }, { x: x + 140, y: y + 26 + i * 10 + 1 }], {
      width: 1.4,
      color: mix(MAT, INK, 0.35),
      alpha: 0.22 * (1 - Math.abs(i) / 6),
      dryness: 0.7,
      taperIn: 0.1,
      taperOut: 0.1,
      seed: seed + 10 + i,
    });
  }
  // 그림자
  wash(ctx, x, y + 34, 120, DAMMUK, 0.16, seed + 1, 0.22);
  // 다리
  for (const s of [-1, 1]) {
    brushStroke(ctx, [{ x: x + s * 92, y: y - 6 }, { x: x + s * 94, y: y + 30 }], { width: 7, color: mix(WOOD, INK, 0.3), alpha: 0.9, dryness: 0.35, taperIn: 0.05, taperOut: 0.2, seed: seed + 20 + s });
    brushStroke(ctx, [{ x: x + s * 60, y: y + 2 }, { x: x + s * 61, y: y + 40 }], { width: 6, color: mix(WOOD, INK, 0.45), alpha: 0.8, dryness: 0.4, taperIn: 0.05, taperOut: 0.2, seed: seed + 24 + s });
  }
  // 상판 — 비스듬히 내려다본 판, 양 끝이 살짝 들린 서안
  ctx.beginPath();
  ctx.moveTo(x - 112, y - 30);
  ctx.quadraticCurveTo(x, y - 34, x + 112, y - 30);
  ctx.lineTo(x + 100, y - 2);
  ctx.quadraticCurveTo(x, y + 1, x - 100, y - 2);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, y - 34, 0, y);
  g.addColorStop(0, rgba(mix(WOOD, PAPER, 0.35), 0.95));
  g.addColorStop(1, rgba(WOOD, 0.95));
  ctx.fillStyle = g;
  ctx.fill();
  brushStroke(ctx, [{ x: x - 118, y: y - 36 }, { x: x - 108, y: y - 31 }, { x: x, y: y - 34 }, { x: x + 108, y: y - 31 }, { x: x + 118, y: y - 36 }], {
    width: 3.2,
    color: INK,
    alpha: 0.85,
    dryness: 0.4,
    taperIn: 0.2,
    taperOut: 0.2,
    seed: seed + 30,
  });
  brushStroke(ctx, [{ x: x - 100, y: y - 1 }, { x: x, y: y + 2 }, { x: x + 100, y: y - 1 }], { width: 5, color: mix(WOOD, INK, 0.5), alpha: 0.85, dryness: 0.45, taperIn: 0.05, taperOut: 0.05, seed: seed + 31 });
  // 나뭇결
  for (let i = 0; i < 4; i++) {
    const yy = y - 26 + i * 6;
    brushStroke(ctx, [{ x: x - 90 + rng() * 20, y: yy }, { x: x + 80 + rng() * 20, y: yy + rng() * 2 }], { width: 1.1, color: mix(WOOD, INK, 0.4), alpha: 0.3, dryness: 0.8, seed: seed + 40 + i });
  }
  // 벼루와 먹
  inkBlob(ctx, x - 62, y - 18, 13, { color: mix(INK, DAMMUK, 0.2), alpha: 0.95, seed: seed + 50, wobble: 0.05, squash: 0.55, halo: 0, light: 0.25 });
  inkBlob(ctx, x - 62, y - 19, 7, { color: INK, alpha: 1, seed: seed + 51, wobble: 0.1, squash: 0.5, halo: 0 });
  brushStroke(ctx, [{ x: x - 44, y: y - 26 }, { x: x - 36, y: y - 13 }], { width: 6, color: INK, alpha: 0.95, dryness: 0.2, taperIn: 0, taperOut: 0, seed: seed + 52 });
  // 붓걸이와 붓 셋
  brushStroke(ctx, [{ x: x + 20, y: y - 42 }, { x: x + 70, y: y - 43 }], { width: 3, color: mix(WOOD, INK, 0.45), alpha: 0.9, dryness: 0.3, taperIn: 0.05, taperOut: 0.05, seed: seed + 60 });
  for (const s of [0, 1]) brushStroke(ctx, [{ x: x + 22 + s * 46, y: y - 43 }, { x: x + 22 + s * 46, y: y - 26 }], { width: 2.4, color: mix(WOOD, INK, 0.45), alpha: 0.9, seed: seed + 61 + s });
  for (let k = 0; k < 3; k++) {
    const bx = x + 32 + k * 12;
    brushStroke(ctx, [{ x: bx, y: y - 44 }, { x: bx + 1, y: y - 30 }], { width: 2.2, color: mix(WOOD, PAPER, 0.2), alpha: 0.95, seed: seed + 64 + k });
    brushStroke(ctx, [{ x: bx + 1, y: y - 31 }, { x: bx + 1.5, y: y - 24 }], { width: 3.4, color: INK, alpha: 0.95, taperIn: 0.1, taperOut: 0.9, seed: seed + 67 + k });
  }
  // 두루마리
  brushStroke(ctx, [{ x: x - 20, y: y - 12 }, { x: x + 12, y: y - 13 }], { width: 7, color: PAPER_LIGHT, alpha: 1, dryness: 0, wet: 0, taperIn: 0, taperOut: 0, seed: seed + 70 });
  brushStroke(ctx, [{ x: x - 20, y: y - 16 }, { x: x + 12, y: y - 17 }], { width: 1.2, color: INK, alpha: 0.6, dryness: 0.4, seed: seed + 71 });
  brushStroke(ctx, [{ x: x - 20, y: y - 9 }, { x: x + 12, y: y - 10 }], { width: 1.2, color: INK, alpha: 0.6, dryness: 0.4, seed: seed + 72 });
  dot(ctx, x + 14, y - 13, 3.2, mix(WOOD, INK, 0.4), 0.95, seed + 73);
}

/* ───────── 주인의 방 ───────── */

/** 범이 다녀간 흔적 — 담장에서 내려온 발자국과 묵은 발톱 자국 */
function paintTigerSigns(ctx: Ctx, w: number, h: number, rng: Rng, blocked: (x: number, y: number, pad: number) => boolean): void {
  // 담장 아래에서 한가운데로 비스듬히 걸어 내려온 발자국
  let x = w / 2 + range(rng, -60, 60);
  let y = WALL_TOP + 40;
  let a = Math.PI / 2 + range(rng, -0.4, 0.4);
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    const px = x + Math.cos(a + Math.PI / 2) * 11 * side;
    const py = y + Math.sin(a + Math.PI / 2) * 11 * side * 0.7;
    if (!blocked(px, py, 0)) pawPrint(ctx, px, py, a, 0.32 - i * 0.012, Math.floor(rng() * 1e6));
    x += Math.cos(a) * 42;
    y += Math.sin(a) * 42 * 0.75;
    a += range(rng, -0.25, 0.25);
  }
  // 바닥을 긁은 묵은 발톱 자국
  for (let k = 0; k < 4; k++) {
    const cx = range(rng, 260, w - 260);
    const cy = range(rng, WALL_TOP + 160, h - 220);
    if (blocked(cx, cy, 40) || Math.hypot(cx - w / 2, cy - h / 2) < 140) continue;
    const ang = range(rng, 0, TAU);
    const len = range(rng, 60, 90);
    for (let i = -1; i <= 1; i++) {
      const ox = Math.cos(ang + Math.PI / 2) * i * 11;
      const oy = Math.sin(ang + Math.PI / 2) * i * 11 * 0.7;
      const pts = [0, 0.5, 1].map((t) => ({
        x: cx + ox + Math.cos(ang) * len * (t - 0.5) + Math.cos(ang + Math.PI / 2) * Math.sin(t * Math.PI) * 6,
        y: cy + oy + (Math.sin(ang) * len * (t - 0.5) + Math.sin(ang + Math.PI / 2) * Math.sin(t * Math.PI) * 6) * 0.7,
      }));
      brushStroke(ctx, pts, { width: 4.5, color: DAMMUK, alpha: 0.32, dryness: 0.8, taperIn: 0.3, taperOut: 0.6, seed: Math.floor(rng() * 1e6) });
    }
  }
}

/** 범의 발자국 — 큰 발바닥 하나에 발가락 넷 */
function pawPrint(ctx: Ctx, x: number, y: number, a: number, alpha: number, seed: number): void {
  if (alpha <= 0.04) return;
  const fx = Math.cos(a);
  const fy = Math.sin(a) * 0.7;
  inkBlob(ctx, x, y, 5.5, { color: DAMMUK, alpha, seed, wobble: 0.2, squash: 0.7, halo: 0.3 });
  for (let i = 0; i < 4; i++) {
    const s = (i - 1.5) * 0.5;
    const tx = x + fx * 8 + Math.cos(a + Math.PI / 2) * s * 9;
    const ty = y + fy * 8 + Math.sin(a + Math.PI / 2) * s * 9 * 0.7;
    inkBlob(ctx, tx, ty, 2.3, { color: DAMMUK, alpha: alpha * 0.9, seed: seed + i + 1, wobble: 0.2, squash: 0.8, halo: 0.2 });
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

/** 장애물 그림 상자 — 가로, 세로, 바닥 중심의 높이(아래에서) */
function obstacleBox(o: Obstacle): [number, number, number] {
  switch (o.kind) {
    case 'rock':
      return [o.r * 2.9, o.r * 2.6, o.r * 0.9];
    case 'willow':
      return [o.r * 2 + 230, 330, 34];
    case 'pagoda':
      return [o.r * 2 + 70, 200, 30];
    case 'maple':
      return [o.r * 2 + 230, 300, 34];
    case 'bell':
      return [230, BELL_HANG + 100, 34];
    default:
      return [o.r * 2 + 170, 300, 34];
  }
}

export function paintObstacle(o: Obstacle, scale: number): ObstacleArt {
  const isRock = o.kind === 'rock';
  const willow = o.kind === 'willow';
  const [w, h, below] = obstacleBox(o);
  const ox = w / 2;
  const oy = h - below;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale);
  c.height = Math.ceil(h * scale);
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.translate(ox, oy);
  const rng = mulberry32(o.seed);
  if (isRock) paintBoulder(ctx, o.r, rng, o.seed);
  else if (willow) paintWillow(ctx, o.r, rng, o.seed);
  else if (o.kind === 'pagoda') paintPagoda(ctx, o.r, rng, o.seed);
  else if (o.kind === 'maple') paintMaple(ctx, o.r, rng, o.seed);
  else if (o.kind === 'bell') paintBellPavilion(ctx, o.r, BELL_HANG, rng, o.seed);
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
