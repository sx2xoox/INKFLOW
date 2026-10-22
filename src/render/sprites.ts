/**
 * 인물과 먹귀 그림. 모두 원점(0,0)을 발밑(또는 몸 가운데)으로 두고 세계 단위로 그린다.
 * 아틀라스가 이 함수들로 애니메이션 프레임을 미리 구워 둔다.
 */
import { type Vec, TAU } from '../core/math';
import { mulberry32 } from '../core/rng';
import { arcPoints, blobPath, brushStroke, dot, inkBlob, splatter, wash } from './brush';
import { type RGB, DAMMUK, INK, PAPER_LIGHT, STRAW, WHITE, mix, rgba } from './color';

type Ctx = CanvasRenderingContext2D;

export const WALK_FRAMES = 8;
export const ENEMY_FRAMES = 8;

const isLight = (c: RGB): boolean => c[0] + c[1] + c[2] > 600;

/** 흰 도포 */
export const ROBE: RGB = [242, 237, 226];

/* ───────── 붓잡이: 삿갓 쓴 나그네 ───────── */

export function drawPlayer(ctx: Ctx, frame: number): void {
  const ph = (frame / WALK_FRAMES) * TAU;
  const step = Math.sin(ph);
  const bob = -Math.abs(Math.cos(ph)) * 1.6;
  const sway = step * 1.8;
  ctx.save();
  ctx.translate(0, bob);

  // 발 — 검은 신
  brushStroke(ctx, [{ x: -4 + step * 5, y: -7 }, { x: -3 + step * 6, y: -1 }], { width: 4.4, color: INK, alpha: 0.92, dryness: 0.2, taperOut: 0.3, seed: 11 });
  brushStroke(ctx, [{ x: 4 - step * 5, y: -7 }, { x: 6 - step * 6, y: -1 }], { width: 4.4, color: INK, alpha: 0.92, dryness: 0.2, taperOut: 0.3, seed: 12 });

  // 뒤쪽 소매 — 흰 소매에 먹선
  const sleeve = [{ x: -6, y: -33 }, { x: -11 - step * 2, y: -26 }, { x: -12.5 - step * 3.5, y: -18 }];
  brushStroke(ctx, sleeve, { width: 9.5, color: INK, alpha: 0.85, dryness: 0.3, taperIn: 0.1, taperOut: 0.2, seed: 13 });
  brushStroke(ctx, sleeve, { width: 6.6, color: ROBE, alpha: 1, dryness: 0, wet: 0, taperIn: 0.1, taperOut: 0.25, seed: 113 });

  // 흰 도포
  ctx.beginPath();
  ctx.moveTo(0, -39);
  ctx.bezierCurveTo(-6, -38, -10, -35, -11, -29);
  ctx.bezierCurveTo(-13 + sway * 0.3, -20, -15 + sway, -11, -16 + sway, -6);
  ctx.quadraticCurveTo(-8 + sway, -3.5, 0 + sway * 0.6, -5);
  ctx.quadraticCurveTo(8 + sway, -3, 15 + sway, -6.5);
  ctx.bezierCurveTo(14 + sway, -12, 12 + sway * 0.3, -21, 10, -29);
  ctx.bezierCurveTo(9, -35, 6, -38, 0, -39);
  ctx.closePath();
  const g = ctx.createLinearGradient(-10, -39, 12, -4);
  g.addColorStop(0, rgba(ROBE, 1));
  g.addColorStop(0.6, rgba(mix(ROBE, DAMMUK, 0.12), 1));
  g.addColorStop(1, rgba(mix(ROBE, DAMMUK, 0.32), 1));
  ctx.fillStyle = g;
  ctx.fill();
  // 그늘 — 옅은 담묵 번짐
  brushStroke(ctx, [{ x: 8, y: -30 }, { x: 11 + sway * 0.5, y: -18 }, { x: 12 + sway, y: -8 }], { width: 7, color: DAMMUK, alpha: 0.28, dryness: 0.1, wet: 0.8, seed: 114 });
  // 옷 윤곽 — 자신 있게 그은 선묘(線描)
  brushStroke(ctx, [{ x: -6, y: -38 }, { x: -11, y: -30 }, { x: -13 + sway * 0.5, y: -18 }, { x: -16 + sway, y: -6 }], { width: 2.8, color: INK, alpha: 0.95, dryness: 0.35, taperIn: 0.15, taperOut: 0.2, seed: 14 });
  brushStroke(ctx, [{ x: 6, y: -38 }, { x: 10, y: -30 }, { x: 13 + sway * 0.5, y: -18 }, { x: 15 + sway, y: -7 }], { width: 2.6, color: INK, alpha: 0.95, dryness: 0.4, taperIn: 0.15, taperOut: 0.2, seed: 15 });
  brushStroke(ctx, [{ x: -16 + sway, y: -6 }, { x: -8 + sway, y: -3.6 }, { x: 0 + sway * 0.6, y: -5 }, { x: 8 + sway, y: -3.2 }, { x: 15 + sway, y: -6.5 }], {
    width: 2.4,
    color: INK,
    alpha: 0.9,
    dryness: 0.45,
    taperIn: 0.1,
    taperOut: 0.25,
    seed: 18,
  });
  // 옷주름
  brushStroke(ctx, [{ x: -3, y: -25 }, { x: -5 + sway * 0.6, y: -15 }, { x: -6 + sway, y: -7 }], { width: 1.5, color: INK, alpha: 0.55, dryness: 0.5, seed: 16 });
  brushStroke(ctx, [{ x: 4, y: -23 }, { x: 5.5 + sway * 0.6, y: -14 }, { x: 7 + sway, y: -7 }], { width: 1.3, color: INK, alpha: 0.45, dryness: 0.55, seed: 17 });
  // 검은 깃
  brushStroke(ctx, [{ x: -5, y: -38.5 }, { x: 0.5, y: -32 }, { x: 4, y: -37.5 }], { width: 2.8, color: INK, alpha: 0.95, dryness: 0.2, taperIn: 0.2, taperOut: 0.2, seed: 19 });

  // 삿갓 아래 그늘진 얼굴
  inkBlob(ctx, 3, -39.5, 4.4, { color: mix(INK, DAMMUK, 0.3), alpha: 0.9, seed: 20, halo: 0, light: 0 });
  // 갓끈
  brushStroke(ctx, [{ x: -6, y: -42 }, { x: 0, y: -36.5 }, { x: 6, y: -41 }], { width: 1, color: INK, alpha: 0.7, dryness: 0.2, seed: 21 });

  drawHat(ctx, 1, -43);
  ctx.restore();
}

function drawHat(ctx: Ctx, cx: number, cy: number): void {
  const rx = 21;
  const ry = 7.6;
  const apex = { x: cx + 1.5, y: cy - 15 };
  // 몸체
  ctx.beginPath();
  ctx.moveTo(apex.x, apex.y);
  ctx.lineTo(cx + rx, cy);
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(apex.x, apex.y);
  ctx.closePath();
  const g = ctx.createLinearGradient(cx - rx, cy - 14, cx + rx, cy + ry);
  g.addColorStop(0, rgba(mix(STRAW, PAPER_LIGHT, 0.35), 0.98));
  g.addColorStop(0.55, rgba(STRAW, 0.97));
  g.addColorStop(1, rgba(mix(STRAW, INK, 0.3), 0.97));
  ctx.fillStyle = g;
  ctx.fill();

  // 짚 결
  const rng = mulberry32(77);
  ctx.lineCap = 'round';
  for (let k = 0; k <= 12; k++) {
    const th = Math.PI - (k / 12) * Math.PI;
    const ex = cx + Math.cos(th) * rx * 0.98;
    const ey = cy + Math.sin(th) * ry * 0.98;
    ctx.strokeStyle = rgba(mix(STRAW, INK, 0.55), 0.28 + rng() * 0.25);
    ctx.lineWidth = 0.55 + rng() * 0.4;
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y + 1);
    ctx.quadraticCurveTo((apex.x + ex) / 2 + (ex - cx) * 0.05, (apex.y + ey) / 2 + 1.5, ex, ey);
    ctx.stroke();
  }
  // 동심 엮음
  for (const t of [0.42, 0.72]) {
    const pts = arcPoints(apex.x + (cx - apex.x) * t, apex.y + (cy - apex.y) * t, rx * t, Math.PI * 0.98, -Math.PI * 0.96, 12, rx * t, ry / rx);
    brushStroke(ctx, pts, { width: 0.9, color: mix(STRAW, INK, 0.5), alpha: 0.45, dryness: 0.6, taperIn: 0.1, taperOut: 0.1, seed: Math.floor(t * 100) });
  }
  // 챙
  brushStroke(ctx, arcPoints(cx, cy, rx, Math.PI * 1.02, -Math.PI * 1.04, 18, rx, ry / rx), {
    width: 2.8,
    color: INK,
    alpha: 0.85,
    dryness: 0.35,
    taperIn: 0.05,
    taperOut: 0.12,
    seed: 21,
  });
  brushStroke(ctx, [{ x: apex.x, y: apex.y }, { x: cx - rx * 0.55, y: cy - 6 }, { x: cx - rx, y: cy }], { width: 1.8, color: mix(STRAW, INK, 0.55), alpha: 0.6, dryness: 0.5, seed: 22 });
  // 빛 받은 면
  brushStroke(ctx, [{ x: apex.x - 1, y: apex.y + 3 }, { x: cx - 8, y: cy - 4 }], { width: 2.2, color: PAPER_LIGHT, alpha: 0.35, dryness: 0.4, seed: 23 });
}

/* ───────── 먹귀 ───────── */

function eyes(ctx: Ctx, x: number, y: number, gap: number, size: number, body: RGB, look = 0.6, angry = true, seed = 1): void {
  const light = isLight(body);
  for (const s of [-1, 1]) {
    const ex = x + s * gap;
    ctx.beginPath();
    ctx.ellipse(ex, y, size * 0.92, size * 1.08, 0, 0, TAU);
    ctx.fillStyle = rgba(PAPER_LIGHT, 0.97);
    ctx.fill();
    if (light) {
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = rgba(INK, 0.55);
      ctx.stroke();
    }
    dot(ctx, ex + look * size * 0.35, y + size * 0.12, size * 0.5, INK, 0.95, seed + s);
    if (angry) {
      brushStroke(ctx, [{ x: ex - s * size * 1.25, y: y - size * 1.55 }, { x: ex + s * size * 0.9, y: y - size * 0.95 }], {
        width: size * 0.75,
        color: INK,
        alpha: 0.9,
        dryness: 0.2,
        taperIn: 0.15,
        taperOut: 0.5,
        seed: seed + 5 + s,
      });
    }
  }
}

function bodyFill(ctx: Ctx, cx: number, cy: number, r: number, color: RGB, edge: RGB): void {
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.05, cx, cy, r * 1.15);
  g.addColorStop(0, rgba(mix(color, WHITE, isLight(color) ? 0.3 : 0.18), 0.86));
  g.addColorStop(0.6, rgba(color, 0.92));
  g.addColorStop(1, rgba(edge, 0.97));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.strokeStyle = rgba(edge, 0.6);
  ctx.stroke();
}

/** 먹방울: 물방울 모양 먹귀 */
export function drawDrop(ctx: Ctx, frame: number, color: RGB, edge: RGB, seed: number): void {
  const r = 13;
  const ph = (frame / ENEMY_FRAMES) * TAU;
  const sx = 1 + 0.08 * Math.sin(ph);
  const sy = 1 - 0.08 * Math.sin(ph);
  const sway = Math.sin(ph + 1) * 3;
  ctx.save();
  ctx.scale(sx, sy);
  ctx.beginPath();
  ctx.moveTo(sway, -r * 2.05);
  ctx.bezierCurveTo(r * 0.25 + sway * 0.6, -r * 1.65, r * 1.05, -r * 1.3, r * 1.02, -r * 0.68);
  ctx.bezierCurveTo(r * 1.0, -r * 0.08, r * 0.55, 0, 0, 0);
  ctx.bezierCurveTo(-r * 0.55, 0, -r * 1.0, -r * 0.08, -r * 1.02, -r * 0.68);
  ctx.bezierCurveTo(-r * 1.05, -r * 1.3, -r * 0.25 + sway * 0.6, -r * 1.65, sway, -r * 2.05);
  ctx.closePath();
  bodyFill(ctx, 0, -r * 0.8, r, color, edge);
  brushStroke(ctx, [{ x: r * 0.95, y: -r * 1.0 }, { x: r * 0.8, y: -r * 0.3 }, { x: r * 0.2, y: -r * 0.02 }], { width: 2.6, color: edge, alpha: 0.6, dryness: 0.6, seed });
  // 젖은 먹의 윤기
  brushStroke(ctx, [{ x: -r * 0.6, y: -r * 1.05 }, { x: -r * 0.45, y: -r * 1.4 }, { x: -r * 0.1 + sway * 0.4, y: -r * 1.72 }], {
    width: 2.4,
    color: PAPER_LIGHT,
    alpha: isLight(color) ? 0.9 : 0.5,
    dryness: 0.3,
    taperIn: 0.3,
    taperOut: 0.5,
    seed: seed + 1,
  });
  eyes(ctx, 0.5, -r * 0.72, r * 0.36, 3.3, color, 0.6, true, seed + 2);
  ctx.restore();
}

/** 먹제비: 오른쪽을 보고 나는 제비. 원점이 몸 가운데. */
export function drawSwallow(ctx: Ctx, frame: number, color: RGB, edge: RGB, seed: number): void {
  const ph = (frame / ENEMY_FRAMES) * TAU;
  const k = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(ph));
  const wing = mix(color, INK, isLight(color) ? 0.15 : 0.35);
  const wingEdge = mix(edge, INK, 0.3);
  // 꼬리
  for (const s of [-1, 1]) {
    brushStroke(ctx, [{ x: -6, y: s * 1.5 }, { x: -16, y: s * 3.5 }, { x: -27, y: s * 8 }], { width: 3.2, color: wing, alpha: 0.95, dryness: 0.3, taperIn: 0.1, taperOut: 0.85, seed: seed + s });
  }
  // 날개
  for (const s of [-1, 1]) {
    const tip = { x: -12 + (1 - k) * 6, y: s * (6 + 22 * k) };
    const mid = { x: 1, y: s * (5 + 11 * k) };
    brushStroke(ctx, [{ x: 4, y: s * 2 }, mid, tip], { width: 9, color: wing, alpha: 0.95, dryness: 0.35, taperIn: 0.15, taperOut: 0.75, seed: seed + 10 + s, edgeColor: wingEdge });
    brushStroke(ctx, [{ x: 0, y: s * 3 }, { x: -6, y: s * (6 + 8 * k) }, { x: -14 + (1 - k) * 5, y: s * (5 + 16 * k) }], {
      width: 4,
      color: wingEdge,
      alpha: 0.7,
      dryness: 0.5,
      taperOut: 0.7,
      seed: seed + 20 + s,
    });
  }
  // 몸통
  blobPath(ctx, 0, 0, 7.5, seed, 0.08, 0, 0.62);
  bodyFill(ctx, 0, 0, 7.5, wing, wingEdge);
  // 흰 배
  brushStroke(ctx, [{ x: -5, y: 1.8 }, { x: 0, y: 3.2 }, { x: 6, y: 2 }], { width: 3, color: PAPER_LIGHT, alpha: 0.75, dryness: 0.3, seed: seed + 30 });
  // 머리
  inkBlob(ctx, 8.5, -0.5, 5, { color: mix(wing, INK, 0.4), alpha: 1, seed: seed + 31, halo: 0, wobble: 0.06 });
  dot(ctx, 10, -2, 1.5, PAPER_LIGHT, 1, seed + 32);
  dot(ctx, 10.4, -2, 0.75, INK, 1, seed + 33);
  brushStroke(ctx, [{ x: 12.5, y: -0.5 }, { x: 17, y: 0.2 }], { width: 1.8, color: INK, alpha: 0.9, taperIn: 0, taperOut: 0.9, seed: seed + 34 });
  // 붉은 멱
  dot(ctx, 11.5, 1.6, 1.4, [176, 58, 42], 0.8, seed + 35);
}

/** 먹두꺼비: 납작 엎드린 두꺼비 */
export function drawToad(ctx: Ctx, frame: number, color: RGB, edge: RGB, seed: number): void {
  const r = 17;
  const ph = (frame / ENEMY_FRAMES) * TAU;
  const breathe = 1 + 0.04 * Math.sin(ph);
  const cy = -r * 0.62;
  const rng = mulberry32(seed);
  // 뒷다리
  for (const s of [-1, 1]) {
    brushStroke(ctx, [{ x: s * r * 0.75, y: cy + 2 }, { x: s * r * 1.25, y: cy + 6 }, { x: s * r * 1.05, y: -1 }, { x: s * r * 1.35, y: 0 }], {
      width: 6,
      color: mix(color, INK, 0.35),
      alpha: 0.95,
      dryness: 0.35,
      taperIn: 0.1,
      taperOut: 0.4,
      seed: seed + s,
    });
    brushStroke(ctx, [{ x: s * r * 0.45, y: cy + 6 }, { x: s * r * 0.55, y: -0.5 }], { width: 4, color: mix(color, INK, 0.4), alpha: 0.9, dryness: 0.3, seed: seed + 3 + s });
  }
  ctx.save();
  ctx.translate(0, cy);
  ctx.scale(breathe, 1 / breathe);
  blobPath(ctx, 0, 0, r * 1.05, seed, 0.1, ph, 0.7);
  bodyFill(ctx, 0, 0, r, color, edge);
  // 오돌토돌한 등
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * (0.15 + rng() * 0.7);
    const rr = r * (0.3 + rng() * 0.55);
    dot(ctx, Math.cos(a) * rr, Math.sin(a) * rr * 0.7, 1.2 + rng() * 1.8, edge, 0.55, seed + 40 + i);
  }
  // 입
  brushStroke(ctx, [{ x: -r * 0.7, y: r * 0.05 }, { x: 0, y: r * 0.3 }, { x: r * 0.7, y: r * 0.05 }], { width: 1.8, color: INK, alpha: 0.8, dryness: 0.3, taperIn: 0.3, taperOut: 0.3, seed: seed + 50 });
  ctx.restore();
  // 툭 튀어나온 눈
  for (const s of [-1, 1]) {
    const ex = s * r * 0.48;
    const ey = cy - r * 0.62;
    inkBlob(ctx, ex, ey, 5.6, { color, edge, alpha: 1, seed: seed + 60 + s, halo: 0, wobble: 0.05 });
    ctx.beginPath();
    ctx.ellipse(ex, ey - 0.5, 3.6, 3.3, 0, 0, TAU);
    ctx.fillStyle = rgba([226, 196, 92], 0.95);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(ex, ey - 0.4, 2.5, 1.05, 0, 0, TAU);
    ctx.fillStyle = rgba(INK, 0.95);
    ctx.fill();
  }
}

/** 묵괴: 뿔 달린 커다란 먹 덩어리 */
export function drawBrute(ctx: Ctx, frame: number, color: RGB, edge: RGB, seed: number): void {
  const r = 29;
  const ph = (frame / ENEMY_FRAMES) * TAU;
  const cy = -r * 1.0;
  const rng = mulberry32(seed);
  // 발
  inkBlob(ctx, -r * 0.45, -3, 7, { color: mix(color, INK, 0.5), alpha: 1, seed: seed + 1, halo: 0 });
  inkBlob(ctx, r * 0.45, -3, 7, { color: mix(color, INK, 0.5), alpha: 1, seed: seed + 2, halo: 0 });
  // 뿔
  for (const s of [-1, 1]) {
    brushStroke(ctx, [{ x: s * r * 0.4, y: cy - r * 0.72 }, { x: s * r * 0.62, y: cy - r * 1.15 }, { x: s * r * 0.98, y: cy - r * 1.3 }], {
      width: 9,
      color: INK,
      alpha: 0.95,
      dryness: 0.45,
      taperIn: 0.05,
      taperOut: 0.85,
      seed: seed + 3 + s,
    });
  }
  // 팔
  for (const s of [-1, 1]) {
    brushStroke(ctx, [{ x: s * r * 0.8, y: cy - 4 }, { x: s * r * 1.15, y: cy + 10 + Math.sin(ph) * 2 }, { x: s * r * 1.05, y: cy + 22 }], {
      width: 9,
      color: mix(color, INK, 0.45),
      alpha: 0.95,
      dryness: 0.4,
      taperOut: 0.5,
      seed: seed + 6 + s,
    });
  }
  blobPath(ctx, 0, cy, r, seed, 0.13, ph, 1);
  bodyFill(ctx, 0, cy, r, color, edge);
  // 거친 털 — 마른 붓 결
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI * (0.05 + (i / 15) * 0.9) + (rng() - 0.5) * 0.15;
    const r0 = r * 0.82;
    const r1 = r * (1.08 + rng() * 0.25);
    brushStroke(ctx, [{ x: Math.cos(a) * r0, y: cy + Math.sin(a) * r0 }, { x: Math.cos(a) * r1, y: cy + Math.sin(a) * r1 }], {
      width: 3.5 + rng() * 2,
      color: edge,
      alpha: 0.7,
      dryness: 0.75,
      taperIn: 0.1,
      taperOut: 0.7,
      seed: seed + 10 + i,
    });
  }
  eyes(ctx, 0, cy - r * 0.18, r * 0.34, 5, color, 0.5, true, seed + 30);
  // 이빨 드러낸 입
  const my = cy + r * 0.35;
  brushStroke(ctx, [{ x: -r * 0.45, y: my }, { x: -r * 0.15, y: my + 4 }, { x: r * 0.15, y: my + 3 }, { x: r * 0.45, y: my - 1 }], {
    width: 5,
    color: INK,
    alpha: 0.95,
    dryness: 0.3,
    seed: seed + 40,
  });
  for (const tx of [-0.28, 0.02, 0.3]) {
    ctx.beginPath();
    ctx.moveTo(r * tx - 2.6, my + 1);
    ctx.lineTo(r * tx + 2.6, my + 1.5);
    ctx.lineTo(r * tx, my + 6);
    ctx.closePath();
    ctx.fillStyle = rgba(PAPER_LIGHT, 0.95);
    ctx.fill();
  }
}

/* ───────── 연못의 먹귀 ───────── */

/** 잉어 한 마리 — 오른쪽을 보고, 가운데가 (0,0) */
function fish(ctx: Ctx, color: RGB, edge: RGB, seed: number, bend: number, mouth = 0): void {
  const fin = mix(color, INK, isLight(color) ? 0.2 : 0.3);
  // 꼬리지느러미 — 두 갈래
  for (const s of [-1, 1]) {
    brushStroke(ctx, [{ x: -15, y: s * 1 }, { x: -22, y: s * 4 + bend * 4 }, { x: -29, y: s * 9 + bend * 6 }], {
      width: 6,
      color: fin,
      alpha: 0.95,
      dryness: 0.45,
      taperIn: 0.1,
      taperOut: 0.85,
      seed: seed + 1 + s,
    });
  }
  // 등지느러미
  brushStroke(ctx, [{ x: -8, y: -7 }, { x: -1, y: -13 }, { x: 6, y: -9 }], { width: 4.5, color: fin, alpha: 0.95, dryness: 0.5, taperIn: 0.2, taperOut: 0.6, seed: seed + 3 });
  // 몸통
  ctx.beginPath();
  ctx.moveTo(19, 0);
  ctx.bezierCurveTo(16, -8, 4, -10, -6, -8);
  ctx.bezierCurveTo(-13, -6, -17, -2 + bend * 2, -17, 0 + bend * 2);
  ctx.bezierCurveTo(-16, 4 + bend * 2, -8, 8, 2, 8);
  ctx.bezierCurveTo(12, 8, 18, 4, 19, 0);
  ctx.closePath();
  bodyFill(ctx, 1, 0, 13, color, edge);
  // 흰 배
  brushStroke(ctx, [{ x: -10, y: 5 }, { x: 2, y: 7 }, { x: 14, y: 4 }], { width: 3.2, color: PAPER_LIGHT, alpha: isLight(color) ? 0.9 : 0.45, dryness: 0.3, seed: seed + 4 });
  // 비늘 — 작은 반달을 겹쳐 찍는다
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 2; j++) {
      const x = -9 + i * 4.6 + j * 2.3;
      const y = -4 + j * 4.2;
      brushStroke(ctx, arcPoints(x, y, 2.4, -1.2, 2.4, 6), { width: 0.9, color: edge, alpha: 0.5, dryness: 0.3, seed: seed + 10 + i * 3 + j });
    }
  }
  // 가슴지느러미와 아가미
  brushStroke(ctx, [{ x: 6, y: 3 }, { x: 2, y: 9 }], { width: 3, color: fin, alpha: 0.9, dryness: 0.4, taperOut: 0.8, seed: seed + 5 });
  brushStroke(ctx, arcPoints(10, 0, 5, -1.3, 2.6, 8), { width: 1.4, color: INK, alpha: 0.6, dryness: 0.4, seed: seed + 6 });
  // 눈과 입, 수염
  dot(ctx, 13.5, -2.2, 2.6, PAPER_LIGHT, 0.97, seed + 7);
  dot(ctx, 14, -2, 1.4, INK, 1, seed + 8);
  brushStroke(ctx, [{ x: 18, y: 1 + mouth }, { x: 21, y: 2 + mouth * 2 }], { width: 1.4, color: INK, alpha: 0.85, seed: seed + 9 });
  brushStroke(ctx, [{ x: 17, y: 2 }, { x: 20, y: 6 }, { x: 24, y: 8 }], { width: 0.9, color: INK, alpha: 0.7, taperOut: 0.9, seed: seed + 20 });
}

/**
 * 먹잉어. 0~5: 먹 속을 헤엄치는 모습(등과 지느러미만 보인다), 6: 뛰어오름, 7: 땅에서 퍼덕임.
 * 원점은 몸 아래의 바닥.
 */
export function drawCarp(ctx: Ctx, frame: number, color: RGB, edge: RGB, seed: number): void {
  if (frame < 6) {
    const ph = (frame / 6) * TAU;
    // 물결 — 먹 표면이 갈라진다
    wash(ctx, 0, -1, 24, edge, 0.18, seed, 0.28);
    for (const k of [0, 1]) {
      const r = 16 + k * 8 + Math.sin(ph + k) * 1.5;
      brushStroke(ctx, arcPoints(0, -1, r, Math.PI * 0.95, Math.PI * 1.1, 14, r, 0.28), { width: 1.6 - k * 0.4, color: edge, alpha: 0.55 - k * 0.2, dryness: 0.5, seed: seed + 30 + k });
    }
    // 드러난 등
    const sw = Math.sin(ph) * 2;
    ctx.beginPath();
    ctx.moveTo(-15, -1);
    ctx.bezierCurveTo(-8, -9 + sw * 0.3, 8, -10 - sw * 0.3, 16, -1);
    ctx.quadraticCurveTo(0, -3, -15, -1);
    ctx.closePath();
    bodyFill(ctx, 0, -4, 10, color, edge);
    brushStroke(ctx, [{ x: -4, y: -8 }, { x: 2, y: -15 + sw * 0.5 }, { x: 7, y: -9 }], { width: 4, color: mix(color, INK, 0.3), alpha: 0.95, dryness: 0.5, taperIn: 0.2, taperOut: 0.6, seed: seed + 3 });
    // 꼬리 끝이 살랑인다
    brushStroke(ctx, [{ x: -16, y: -2 }, { x: -22, y: -5 + sw }, { x: -27, y: -9 + sw * 1.4 }], { width: 4.5, color: mix(color, INK, 0.3), alpha: 0.9, dryness: 0.5, taperOut: 0.9, seed: seed + 4 });
    return;
  }
  ctx.save();
  if (frame === 6) {
    // 활처럼 휘어 뛰어오른다
    ctx.translate(0, -16);
    ctx.rotate(-0.38);
    fish(ctx, color, edge, seed, -0.8, 1.5);
  } else {
    // 옆으로 누워 퍼덕인다
    ctx.translate(0, -8);
    ctx.rotate(0.12);
    fish(ctx, color, edge, seed, 1, 2);
  }
  ctx.restore();
}

/** 등딱지 — 거북의 몸통. 가운데가 (0, cy) */
function shell(ctx: Ctx, cy: number, color: RGB, edge: RGB, seed: number): void {
  ctx.beginPath();
  ctx.moveTo(-18, cy + 6);
  ctx.bezierCurveTo(-18, cy - 10, -8, cy - 16, 0, cy - 16);
  ctx.bezierCurveTo(8, cy - 16, 18, cy - 10, 18, cy + 6);
  ctx.quadraticCurveTo(0, cy + 9, -18, cy + 6);
  ctx.closePath();
  bodyFill(ctx, 0, cy - 4, 17, color, edge);
  // 거북등 무늬 — 가운데 육각과 둘레의 갈래
  const line = mix(edge, INK, 0.35);
  const hex = [
    { x: -6, y: cy - 4 },
    { x: -3, y: cy - 10 },
    { x: 4, y: cy - 10 },
    { x: 7, y: cy - 4 },
    { x: 4, y: cy + 1 },
    { x: -3, y: cy + 1 },
    { x: -6, y: cy - 4 },
  ];
  brushStroke(ctx, hex, { width: 1.6, color: line, alpha: 0.75, dryness: 0.4, taperIn: 0.05, taperOut: 0.05, seed: seed + 1 });
  for (const [a, b] of [
    [hex[0], { x: -16, y: cy - 2 }],
    [hex[1], { x: -9, y: cy - 14 }],
    [hex[2], { x: 9, y: cy - 14 }],
    [hex[3], { x: 16, y: cy - 2 }],
    [hex[4], { x: 8, y: cy + 6 }],
    [hex[5], { x: -8, y: cy + 6 }],
  ] as [Vec, Vec][]) {
    brushStroke(ctx, [a, b], { width: 1.3, color: line, alpha: 0.65, dryness: 0.5, seed: seed + 2 + a.x });
  }
  // 테두리 띠
  brushStroke(ctx, [{ x: -18, y: cy + 5 }, { x: 0, y: cy + 8.5 }, { x: 18, y: cy + 5 }], { width: 3.4, color: mix(color, INK, 0.4), alpha: 0.9, dryness: 0.35, seed: seed + 9 });
}

/**
 * 먹거북. 0~5: 걷기, 6: 등딱지에 숨어 도는 모습, 7: 뒤집혀 버둥거림.
 * 오른쪽을 보고, 원점은 발밑.
 */
export function drawTurtle(ctx: Ctx, frame: number, color: RGB, edge: RGB, seed: number): void {
  const skin = mix(color, isLight(color) ? DAMMUK : PAPER_LIGHT, 0.25);
  const skinEdge = mix(edge, INK, 0.3);
  const limb = (x: number, y: number, dx: number, dy: number, s: number): void => {
    brushStroke(ctx, [{ x, y }, { x: x + dx, y: y + dy }], { width: 5.5, color: skin, alpha: 1, dryness: 0.25, taperIn: 0.05, taperOut: 0.3, seed: seed + s, edgeColor: skinEdge });
  };
  if (frame === 6) {
    // 숨은 등딱지 — 팽이처럼 돈다
    shell(ctx, -10, color, edge, seed);
    for (let k = 0; k < 3; k++) {
      brushStroke(ctx, arcPoints(0, -8, 24 + k * 5, -2.6 + k * 1.9, 1.3, 10, 24 + k * 5, 0.45), { width: 2, color: edge, alpha: 0.45, dryness: 0.7, taperIn: 0.3, taperOut: 0.6, seed: seed + 40 + k });
    }
    dot(ctx, 15, -6, 2.4, INK, 0.8, seed + 50);
    dot(ctx, -15, -6, 2.2, INK, 0.6, seed + 51);
    return;
  }
  if (frame === 7) {
    // 뒤집혀서 배딱지가 하늘을 보고, 네 발이 버둥거린다
    ctx.save();
    ctx.translate(0, -12);
    ctx.scale(1, -1);
    shell(ctx, 0, color, edge, seed);
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(0, -16, 15, 5, 0, 0, TAU);
    ctx.fillStyle = rgba(mix(skin, PAPER_LIGHT, 0.4), 1);
    ctx.fill();
    brushStroke(ctx, [{ x: -12, y: -16 }, { x: 12, y: -16 }], { width: 1, color: skinEdge, alpha: 0.6, seed: seed + 60 });
    for (const [x, d] of [
      [-10, -1],
      [-5, 1],
      [5, -1],
      [10, 1],
    ] as [number, number][]) {
      limb(x, -18, d * 3, -8, 61 + x);
    }
    // 어지러운 눈
    inkBlob(ctx, 20, -10, 5, { color: skin, edge: skinEdge, alpha: 1, seed: seed + 70, halo: 0, wobble: 0.05 });
    brushStroke(ctx, arcPoints(20, -10, 2.2, 0, TAU * 1.4, 12, 0.4), { width: 1, color: INK, alpha: 0.85, seed: seed + 71 });
    return;
  }
  const ph = (frame / 6) * TAU;
  const step = Math.sin(ph) * 3;
  const bob = Math.abs(Math.cos(ph)) * 0.8;
  // 먼 쪽 다리
  limb(-9 - step, -5, -2, 5, 1);
  limb(9 + step, -5, 2, 5, 2);
  // 꼬리
  brushStroke(ctx, [{ x: -17, y: -6 }, { x: -22, y: -4 }], { width: 3.5, color: skin, alpha: 1, taperOut: 0.9, seed: seed + 3, edgeColor: skinEdge });
  // 목과 머리
  brushStroke(ctx, [{ x: 13, y: -8 }, { x: 19, y: -10 - bob }], { width: 6, color: skin, alpha: 1, dryness: 0.2, seed: seed + 4, edgeColor: skinEdge });
  inkBlob(ctx, 22, -11 - bob, 5.2, { color: skin, edge: skinEdge, alpha: 1, seed: seed + 5, halo: 0, wobble: 0.05, squash: 0.85 });
  dot(ctx, 23.5, -12.5 - bob, 1.5, INK, 1, seed + 6);
  brushStroke(ctx, [{ x: 24, y: -9 - bob }, { x: 27, y: -9.5 - bob }], { width: 1, color: INK, alpha: 0.7, seed: seed + 7 });
  shell(ctx, -10 - bob, color, edge, seed);
  // 가까운 쪽 다리
  limb(-11 + step, -3, -2, 4, 8);
  limb(11 - step, -3, 2, 4, 9);
}

/* ───────── 산사의 먹귀 ───────── */

const AMBER: RGB = [226, 176, 72];

/**
 * 먹여우. 0~5: 종종걸음, 6: 웅크려 노림(나타난 순간), 7: 뛰어들어 문다.
 * 오른쪽을 보고, 원점은 발밑.
 */
export function drawFox(ctx: Ctx, frame: number, color: RGB, edge: RGB, seed: number): void {
  const light = isLight(color);
  const fur = color;
  const dark = mix(color, INK, light ? 0.3 : 0.42);
  const line = light ? mix(edge, INK, 0.45) : mix(edge, INK, 0.25);
  const ph = (frame / 6) * TAU;
  const trot = frame < 6;
  const crouch = frame === 6;
  const lunge = frame === 7;
  const bob = trot ? -Math.abs(Math.sin(ph)) * 1.4 : 0;
  const by = (crouch ? -11 : lunge ? -19 : -17) + bob;
  const s = lunge ? 1.22 : crouch ? 0.92 : 1;
  const hx = lunge ? 27 : crouch ? 19 : 20;
  const hy = by + (lunge ? -4 : crouch ? -4 : -8);
  const swing = trot ? Math.sin(ph) : 0;

  // 다리 — 엉덩이와 어깨에서 발끝으로, 발목 아래는 검은 털
  const leg = (hipX: number, footX: number, footY: number, near: boolean, k: number): void => {
    const hip = { x: hipX, y: by + 4 };
    const knee = { x: (hipX + footX) / 2 + (hipX < 0 ? -2 : 2), y: (by + 4 + footY) / 2 };
    const foot = { x: footX, y: footY };
    brushStroke(ctx, [hip, knee, foot], { width: near ? 4.4 : 3.6, color: near ? fur : dark, alpha: 1, dryness: 0.25, taperIn: 0.05, taperOut: 0.2, seed: seed + k, edgeColor: line });
    brushStroke(ctx, [{ x: knee.x + (foot.x - knee.x) * 0.35, y: knee.y + (foot.y - knee.y) * 0.35 }, foot, { x: foot.x + 2.5, y: foot.y }], { width: near ? 3.4 : 2.8, color: INK, alpha: 0.95, dryness: 0.2, taperIn: 0.1, taperOut: 0.2, seed: seed + k + 10 });
  };
  const lift = (v: number): number => -Math.max(0, v) * 3;
  // 먼 쪽 다리
  if (lunge) {
    leg(-10, -22, -6, false, 1);
    leg(9, 24, -10, false, 2);
  } else if (crouch) {
    leg(-10, -12, 0, false, 1);
    leg(9, 13, 0, false, 2);
  } else {
    leg(-11, -11 + swing * 6, lift(swing), false, 1);
    leg(9, 9 - swing * 6, lift(-swing), false, 2);
  }

  // 꼬리 — 크고 탐스럽게, 끝은 희다
  const tb = { x: -14 * s, y: by - 2 };
  const tip = lunge ? { x: -44, y: by - 6 } : crouch ? { x: -27, y: by - 24 } : { x: -36, y: by - 13 + swing * 2 };
  const tm = { x: (tb.x + tip.x) / 2, y: Math.min(tb.y, tip.y) - (lunge ? 2 : 7) };
  brushStroke(ctx, [tb, tm, tip], { width: 13, color: fur, alpha: 1, dryness: 0.35, taperIn: 0.3, taperOut: 0.45, seed: seed + 20, edgeColor: line });
  brushStroke(ctx, [{ x: tm.x + (tip.x - tm.x) * 0.35, y: tm.y + (tip.y - tm.y) * 0.35 }, tip], { width: 9, color: PAPER_LIGHT, alpha: 0.95, dryness: 0.4, taperIn: 0.3, taperOut: 0.7, seed: seed + 21 });
  // 꼬리털 결
  brushStroke(ctx, [tb, tm, { x: tm.x + (tip.x - tm.x) * 0.6, y: tm.y + (tip.y - tm.y) * 0.6 }], { width: 2, color: line, alpha: 0.5, dryness: 0.7, taperIn: 0.3, taperOut: 0.6, seed: seed + 22 });

  // 목
  brushStroke(ctx, [{ x: 9 * s, y: by - 2 }, { x: hx - 4, y: hy + 3 }], { width: 9, color: fur, alpha: 1, dryness: 0.2, taperIn: 0, taperOut: 0, seed: seed + 30, edgeColor: line });
  // 몸통 — 날씬한 허리
  ctx.beginPath();
  ctx.moveTo(-16 * s, by - 1);
  ctx.bezierCurveTo(-14 * s, by - 9, 4 * s, by - 10, 12 * s, by - 6);
  ctx.bezierCurveTo(16 * s, by - 2, 15 * s, by + 5, 8 * s, by + 6.5);
  ctx.bezierCurveTo(0, by + 8, -11 * s, by + 7, -16 * s, by - 1);
  ctx.closePath();
  bodyFill(ctx, 0, by, 14, fur, edge);
  // 흰 가슴과 배
  brushStroke(ctx, [{ x: -6 * s, y: by + 5.5 }, { x: 4 * s, y: by + 6.5 }, { x: 12 * s, y: by + 2 }], { width: 4, color: PAPER_LIGHT, alpha: light ? 0.95 : 0.8, dryness: 0.3, taperIn: 0.3, taperOut: 0.3, seed: seed + 31 });
  brushStroke(ctx, [{ x: -15 * s, y: by - 3 }, { x: -2 * s, y: by - 9 }, { x: 10 * s, y: by - 7 }], { width: 2, color: line, alpha: 0.7, dryness: 0.5, seed: seed + 32 });

  // 머리 — 뾰족한 주둥이
  ctx.beginPath();
  ctx.moveTo(hx - 7, hy - 1);
  ctx.bezierCurveTo(hx - 6, hy - 7, hx + 2, hy - 7.5, hx + 5, hy - 4);
  ctx.lineTo(hx + 12.5, hy + 1);
  ctx.bezierCurveTo(hx + 8, hy + 3.5, hx + 1, hy + 6, hx - 5, hy + 4.5);
  ctx.closePath();
  bodyFill(ctx, hx, hy, 8, fur, edge);
  // 흰 뺨
  brushStroke(ctx, [{ x: hx - 4, y: hy + 3 }, { x: hx + 3, y: hy + 3.4 }, { x: hx + 9, y: hy + 2 }], { width: 3, color: PAPER_LIGHT, alpha: 0.95, dryness: 0.2, taperIn: 0.2, taperOut: 0.6, seed: seed + 40 });
  // 귀 — 웅크리면 뒤로 젖힌다
  const back = crouch ? 1 : lunge ? 0.6 : 0;
  for (const k of [0, 1]) {
    const bx = hx - 4 + k * 5;
    const tx = bx - 3 - back * 7;
    const ty = hy - 14 + back * 6;
    ctx.beginPath();
    ctx.moveTo(bx - 3, hy - 4);
    ctx.lineTo(tx, ty);
    ctx.lineTo(bx + 3, hy - 5);
    ctx.closePath();
    ctx.fillStyle = rgba(k ? fur : dark, 1);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(line, 0.9);
    ctx.stroke();
    if (k) brushStroke(ctx, [{ x: bx - 0.5, y: hy - 5 }, { x: tx + 1, y: ty + 3 }], { width: 1.6, color: INK, alpha: 0.7, taperOut: 0.6, seed: seed + 41 });
  }
  // 눈 — 가늘게 찢어진 호박빛
  ctx.beginPath();
  ctx.ellipse(hx + 1.5, hy - 2.2, 2.4, 1.3, -0.25, 0, TAU);
  ctx.fillStyle = rgba(AMBER, 1);
  ctx.fill();
  brushStroke(ctx, [{ x: hx - 1.5, y: hy - 1.6 }, { x: hx + 1.5, y: hy - 3.2 }, { x: hx + 4.5, y: hy - 2.6 }], { width: 1.3, color: INK, alpha: 0.95, taperIn: 0.2, taperOut: 0.4, seed: seed + 42 });
  dot(ctx, hx + 1.8, hy - 2.2, 0.8, INK, 1, seed + 43);
  // 코와 입
  dot(ctx, hx + 12, hy + 0.8, 1.6, INK, 1, seed + 44);
  if (lunge) {
    ctx.beginPath();
    ctx.moveTo(hx + 3, hy + 3);
    ctx.lineTo(hx + 12, hy + 2);
    ctx.lineTo(hx + 9, hy + 8);
    ctx.closePath();
    ctx.fillStyle = rgba([120, 34, 30], 1);
    ctx.fill();
    for (const tx of [5.5, 9]) {
      ctx.beginPath();
      ctx.moveTo(hx + tx - 1, hy + 2.6);
      ctx.lineTo(hx + tx + 1, hy + 2.4);
      ctx.lineTo(hx + tx, hy + 5);
      ctx.closePath();
      ctx.fillStyle = rgba(PAPER_LIGHT, 1);
      ctx.fill();
    }
  } else {
    brushStroke(ctx, [{ x: hx + 11, y: hy + 2 }, { x: hx + 5, y: hy + 3.5 }], { width: 1, color: INK, alpha: 0.7, seed: seed + 45 });
  }

  // 가까운 쪽 다리
  if (lunge) {
    leg(-12, -26, -3, true, 3);
    leg(10, 28, -12, true, 4);
  } else if (crouch) {
    leg(-12, -9, 0, true, 3);
    leg(10, 16, 0, true, 4);
  } else {
    leg(-12, -12 - swing * 6, lift(-swing), true, 3);
    leg(10, 10 + swing * 6, lift(swing), true, 4);
  }
}

const LION_STONE: RGB = [184, 178, 164];

/** 갈기의 소용돌이 털 하나 */
function curl(ctx: Ctx, x: number, y: number, r: number, fill: RGB, line: RGB, seed: number): void {
  dot(ctx, x, y, r, fill, 1, seed);
  brushStroke(ctx, arcPoints(x, y, r * 0.95, seed % 7, TAU * 1.25, 16, r * 0.15), { width: Math.max(0.9, r * 0.28), color: line, alpha: 0.85, dryness: 0.35, taperIn: 0.1, taperOut: 0.5, seed: seed + 1 });
}

/** 돌결 — 마른 붓으로 쪼갠 듯한 짧은 획과 이끼 점 */
function stoneTexture(ctx: Ctx, cx: number, cy: number, w: number, h: number, line: RGB, seed: number): void {
  const rng = mulberry32(seed);
  for (let i = 0; i < 7; i++) {
    const x = cx + (rng() - 0.5) * w;
    const y = cy + (rng() - 0.5) * h;
    brushStroke(ctx, [{ x, y }, { x: x + 2 + rng() * 3, y: y + 3 + rng() * 4 }], { width: 1.6 + rng() * 1.6, color: line, alpha: 0.35, dryness: 0.85, taperIn: 0.1, taperOut: 0.7, seed: seed + i });
  }
  for (let i = 0; i < 4; i++) dot(ctx, cx + (rng() - 0.5) * w, cy + (rng() - 0.5) * h, 0.9 + rng(), [92, 104, 74], 0.55, seed + 20 + i);
}

/**
 * 돌사자(石獅). 0: 돌로 앉아 있다, 1: 금 사이로 먹 기운이 새며 깨어난다, 2: 엎드려 노린다,
 * 3·4: 내닫기, 5: 부딪혀 금이 가 휘청인다, 6: 0과 같음, 7: 3과 같음.
 * 오른쪽을 보고, 원점은 발밑.
 */
export function drawLion(ctx: Ctx, frame: number, color: RGB, edge: RGB, seed: number): void {
  const f = frame === 6 ? 0 : frame === 7 ? 3 : frame;
  const stone = f === 0 || f === 1 || f === 5;
  const light = isLight(color);
  const body = stone ? LION_STONE : mix(LION_STONE, color, 0.55);
  const mane = stone ? mix(LION_STONE, DAMMUK, 0.25) : mix(color, INK, light ? 0.15 : 0.25);
  const line = stone ? mix(DAMMUK, INK, 0.45) : light ? mix(edge, INK, 0.5) : mix(edge, INK, 0.35);
  const glow = light ? mix(color, INK, 0.25) : mix(color, PAPER_LIGHT, 0.35);

  if (stone) {
    // 앉은 자세 — 뒷다리를 접고 앞다리를 곧게 세웠다
    const slump = f === 5 ? 3 : 0;
    // 꼬리 — 불꽃처럼 말려 올라간다
    brushStroke(ctx, [{ x: -14, y: -14 }, { x: -22, y: -26 }, { x: -16, y: -36 }], { width: 7, color: mane, alpha: 1, dryness: 0.4, taperIn: 0.2, taperOut: 0.6, seed: seed + 1, edgeColor: line });
    curl(ctx, -17, -34, 3.6, mane, line, seed + 2);
    // 몸통
    ctx.beginPath();
    ctx.ellipse(-4, -15 + slump, 15, 13, -0.35, 0, TAU);
    bodyFill(ctx, -4, -15, 15, body, line);
    // 뒷다리 허벅지
    ctx.beginPath();
    ctx.ellipse(-9, -7 + slump * 0.5, 10, 7, 0.1, 0, TAU);
    bodyFill(ctx, -9, -7, 10, body, line);
    brushStroke(ctx, [{ x: -16, y: -1 }, { x: -2, y: -1 }], { width: 4, color: mix(body, INK, 0.25), alpha: 1, dryness: 0.4, taperIn: 0.1, taperOut: 0.2, seed: seed + 3 });
    // 앞다리 둘
    for (const [x, k] of [
      [5, 0],
      [11, 1],
    ] as [number, number][]) {
      brushStroke(ctx, [{ x, y: -18 + slump }, { x: x + 0.5, y: -9 }, { x: x + 1, y: -1 }], { width: k ? 6 : 5, color: k ? body : mix(body, INK, 0.2), alpha: 1, dryness: 0.3, taperIn: 0.05, taperOut: 0.05, seed: seed + 4 + k, edgeColor: line });
      for (let t = 0; t < 3; t++) brushStroke(ctx, [{ x: x - 1.5 + t * 1.6, y: -2.5 }, { x: x - 1.2 + t * 1.6, y: 0 }], { width: 0.9, color: line, alpha: 0.7, seed: seed + 6 + k * 3 + t });
    }
    stoneTexture(ctx, -4, -14, 24, 18, line, seed + 50);
    lionHead(ctx, 10, -32 + slump * 1.5, f === 0 ? 'sleep' : f === 1 ? 'wake' : 'daze', body, mane, line, glow, seed);
    if (f === 1 || f === 5) {
      // 금 — 깨어날 때는 먹 기운이 새어 나오고, 부딪힌 뒤에는 깊게 갈라진다
      const cracks: [number, number, number, number][] = [
        [-10, -22, -2, -10],
        [2, -26, 8, -16],
        [-14, -10, -6, -4],
        [12, -40, 6, -30],
      ];
      cracks.forEach(([x0, y0, x1, y1], i) => {
        const pts = [{ x: x0, y: y0 }, { x: (x0 + x1) / 2 + (i % 2 ? 2 : -2), y: (y0 + y1) / 2 }, { x: x1, y: y1 }];
        if (f === 1) brushStroke(ctx, pts, { width: 4, color: glow, alpha: 0.75, dryness: 0.2, wet: 0.6, taperIn: 0.2, taperOut: 0.4, seed: seed + 60 + i });
        brushStroke(ctx, pts, { width: f === 5 ? 2 : 1.2, color: INK, alpha: 0.9, dryness: 0.5, taperIn: 0.2, taperOut: 0.5, seed: seed + 64 + i });
      });
      if (f === 5) {
        // 떨어져 나간 돌조각
        for (const [x, y, r] of [
          [-20, -2, 2.6],
          [16, -3, 2],
          [-2, 0, 1.8],
        ] as [number, number, number][]) {
          dot(ctx, x, y, r, body, 1, seed + 70 + x);
          brushStroke(ctx, arcPoints(x, y, r, 0, TAU, 8), { width: 0.8, color: line, alpha: 0.8, seed: seed + 71 + x });
        }
      }
    }
    return;
  }

  // 일어선 자세 — 2: 엎드려 노림, 3·4: 내닫기
  const gallop = f === 3 || f === 4;
  const by = f === 2 ? -15 : -19;
  const stretch = gallop ? 1.12 : 1;
  const legs: [number, number, number, number, boolean][] =
    f === 2
      ? [
          [-12, -16, 0, 0, false],
          [10, 14, 0, 0, false],
          [-14, -12, 0, 0, true],
          [12, 18, 0, 0, true],
        ]
      : f === 3
        ? [
            [-12, -24, -6, 0, false],
            [10, 22, -4, 0, false],
            [-14, -20, -2, 0, true],
            [12, 26, -8, 0, true],
          ]
        : [
            [-12, -4, -3, 0, false],
            [10, 4, -2, 0, false],
            [-14, -8, -1, 0, true],
            [12, 6, -3, 0, true],
          ];
  const leg = (hx: number, fx: number, fy: number, near: boolean, k: number): void => {
    brushStroke(ctx, [{ x: hx, y: by + 4 }, { x: (hx + fx) / 2, y: (by + 4 + fy) / 2 + 1 }, { x: fx, y: fy }], { width: near ? 7 : 6, color: near ? body : mix(body, INK, 0.25), alpha: 1, dryness: 0.3, taperIn: 0.05, taperOut: 0.1, seed: seed + 80 + k, edgeColor: line });
    for (let t = 0; t < 3; t++) brushStroke(ctx, [{ x: fx - 1.5 + t * 1.7, y: fy - 2.5 }, { x: fx - 1 + t * 1.7, y: fy }], { width: 0.9, color: line, alpha: 0.7, seed: seed + 90 + k * 3 + t });
  };
  legs.filter((l) => !l[4]).forEach((l, i) => leg(l[0], l[1], l[2], false, i));
  // 꼬리 — 뒤로 휘날린다
  const tailTip = gallop ? { x: -34, y: by - 12 } : { x: -24, y: by - 22 };
  brushStroke(ctx, [{ x: -16 * stretch, y: by - 3 }, { x: -26, y: by - 8 }, tailTip], { width: 7, color: mane, alpha: 1, dryness: 0.4, taperIn: 0.2, taperOut: 0.6, seed: seed + 100, edgeColor: line });
  curl(ctx, tailTip.x, tailTip.y, 3.8, mane, line, seed + 101);
  // 몸통
  ctx.beginPath();
  ctx.ellipse(0, by, 18 * stretch, 10, gallop ? -0.05 : 0.08, 0, TAU);
  bodyFill(ctx, 0, by, 18, body, line);
  stoneTexture(ctx, -2, by, 28, 12, line, seed + 110);
  brushStroke(ctx, [{ x: -16 * stretch, y: by - 4 }, { x: 0, y: by - 10 }, { x: 14 * stretch, y: by - 7 }], { width: 2.2, color: line, alpha: 0.7, dryness: 0.5, seed: seed + 111 });
  legs.filter((l) => l[4]).forEach((l, i) => leg(l[0], l[1], l[2], true, i + 4));
  lionHead(ctx, (gallop ? 22 : 18) * stretch, by + (f === 2 ? -6 : -11), 'awake', body, mane, line, glow, seed);
}

/** 사자 머리 — 둥근 소용돌이 갈기, 부리부리한 눈, 송곳니를 드러낸 넓은 입 */
function lionHead(ctx: Ctx, x: number, y: number, mood: 'sleep' | 'wake' | 'awake' | 'daze', body: RGB, mane: RGB, line: RGB, glow: RGB, seed: number): void {
  // 갈기 — 머리를 둥글게 두른 소용돌이
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * 1.05 + (i / (n - 1)) * Math.PI * 1.6;
    curl(ctx, x - 3 + Math.cos(a) * 12, y + Math.sin(a) * 11, 4.4, mane, line, seed + 120 + i * 3);
  }
  // 얼굴
  ctx.beginPath();
  ctx.ellipse(x + 1, y + 1, 10, 9, 0, 0, TAU);
  bodyFill(ctx, x + 1, y + 1, 10, body, line);
  // 눈썹뼈
  brushStroke(ctx, [{ x: x - 5, y: y - 5 }, { x: x + 1, y: y - 7 }, { x: x + 8, y: y - 5 }], { width: 2.6, color: line, alpha: 0.85, dryness: 0.4, taperIn: 0.2, taperOut: 0.3, seed: seed + 150 });
  // 눈
  for (const [ex, k] of [
    [x - 1.5, 0],
    [x + 5.5, 1],
  ] as [number, number][]) {
    const ey = y - 2;
    if (mood === 'sleep') {
      brushStroke(ctx, [{ x: ex - 2.5, y: ey }, { x: ex, y: ey + 1 }, { x: ex + 2.5, y: ey }], { width: 1.4, color: line, alpha: 0.85, seed: seed + 151 + k });
    } else if (mood === 'daze') {
      brushStroke(ctx, arcPoints(ex, ey, 2.4, k * 2, TAU * 1.4, 12, 0.3), { width: 1, color: INK, alpha: 0.9, seed: seed + 153 + k });
    } else {
      ctx.beginPath();
      ctx.ellipse(ex, ey, 2.9, 2.7, 0, 0, TAU);
      ctx.fillStyle = rgba(mood === 'wake' ? glow : PAPER_LIGHT, 1);
      ctx.fill();
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = rgba(INK, 0.9);
      ctx.stroke();
      dot(ctx, ex + 0.8, ey + 0.2, 1.4, mood === 'wake' ? PAPER_LIGHT : INK, 1, seed + 155 + k);
    }
  }
  // 코
  dot(ctx, x + 7, y + 3, 2.2, mix(line, INK, 0.4), 0.95, seed + 160);
  // 입 — 깨어나면 송곳니를 드러낸다
  const open = mood === 'awake';
  brushStroke(ctx, [{ x: x - 4, y: y + 6 }, { x: x + 2, y: y + (open ? 8.5 : 7) }, { x: x + 9, y: y + 6 }], { width: open ? 2.6 : 1.6, color: INK, alpha: 0.9, dryness: 0.3, seed: seed + 161 });
  if (open) {
    for (const tx of [-1.5, 6]) {
      ctx.beginPath();
      ctx.moveTo(x + tx - 1.2, y + 6.4);
      ctx.lineTo(x + tx + 1.2, y + 6.6);
      ctx.lineTo(x + tx, y + 9.5);
      ctx.closePath();
      ctx.fillStyle = rgba(PAPER_LIGHT, 1);
      ctx.fill();
    }
  }
}

/* ───────── 작은 것들 ───────── */

/** 주울 수 있는 먹방울 */
export function drawPickup(ctx: Ctx, color: RGB, edge: RGB): void {
  const r = 6.5;
  ctx.beginPath();
  ctx.moveTo(0, -r * 2.2);
  ctx.bezierCurveTo(r * 0.3, -r * 1.7, r * 1.05, -r * 1.25, r, -r * 0.65);
  ctx.bezierCurveTo(r, -r * 0.05, r * 0.5, 0, 0, 0);
  ctx.bezierCurveTo(-r * 0.5, 0, -r, -r * 0.05, -r, -r * 0.65);
  ctx.bezierCurveTo(-r * 1.05, -r * 1.25, -r * 0.3, -r * 1.7, 0, -r * 2.2);
  ctx.closePath();
  bodyFill(ctx, 0, -r * 0.8, r, color, edge);
  brushStroke(ctx, [{ x: -r * 0.5, y: -r * 0.9 }, { x: -r * 0.2, y: -r * 1.5 }], { width: 1.8, color: PAPER_LIGHT, alpha: 0.8, dryness: 0.2, seed: 3 });
}

/** 입자용 먹 덩이(흰색으로 굽고 색은 틴트로) */
export function drawBlob(ctx: Ctx, r: number, seed: number): void {
  inkBlob(ctx, 0, 0, r, { color: WHITE, edge: [150, 150, 150], seed, halo: 0.6, light: 0, wobble: 0.2 });
}

/** 가장자리가 부드러운 웅덩이 — 바닥 효과용 */
export function drawWash(ctx: Ctx, r: number, seed: number): void {
  const rng = mulberry32(seed);
  wash(ctx, 0, 0, r, WHITE, 0.7, seed);
  for (let i = 0; i < 4; i++) {
    const a = rng() * TAU;
    const d = r * 0.35 * rng();
    wash(ctx, Math.cos(a) * d, Math.sin(a) * d, r * (0.4 + rng() * 0.35), WHITE, 0.35, seed + 10 + i);
  }
  // 마르며 짙어진 테두리
  blobPath(ctx, 0, 0, r * 0.86, seed + 3, 0.16);
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = 'rgba(170,170,170,0.35)';
  ctx.stroke();
}

export function drawSplat(ctx: Ctx, r: number, seed: number): void {
  splatter(ctx, 0, 0, r, WHITE, seed, 1);
}

export function drawShadow(ctx: Ctx, rx: number, ry: number): void {
  ctx.save();
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawGlow(ctx: Ctx, r: number): void {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
}

/** 벼루 — 먹 기운 표시 칸 */
export function drawInkWell(ctx: Ctx, r: number): void {
  inkBlob(ctx, 0, 2, r * 1.05, { color: [70, 66, 62], edge: [34, 31, 29], alpha: 0.9, seed: 5, halo: 0.4, wobble: 0.06, light: 0.1 });
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.76, 0, TAU);
  const g = ctx.createRadialGradient(-r * 0.2, -r * 0.25, 0, 0, 0, r * 0.8);
  g.addColorStop(0, rgba([236, 228, 210], 1));
  g.addColorStop(1, rgba([206, 196, 176], 1));
  ctx.fillStyle = g;
  ctx.fill();
  brushStroke(ctx, arcPoints(0, 0, r * 0.78, -2.6, 4.9, 20), { width: 2, color: INK, alpha: 0.5, dryness: 0.6, seed: 9 });
}

export const drawSeal = (ctx: Ctx, size: number, color: RGB): void => {
  const rng = mulberry32(31);
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(-s + rng() * 2, -s + rng() * 2);
  ctx.lineTo(s - rng() * 2, -s + rng() * 2);
  ctx.lineTo(s - rng() * 2, s - rng() * 2);
  ctx.lineTo(-s + rng() * 2, s - rng() * 2);
  ctx.closePath();
  ctx.fillStyle = rgba(color, 0.9);
  ctx.fill();
};

export type SpriteDraw = (ctx: Ctx, frame: number, color: RGB, edge: RGB, seed: number) => void;

/** 잎 모양 점 몇 개 — 덩굴 장식용 */
export function leafPoints(cx: number, cy: number, a: number, len: number): Vec[] {
  return [
    { x: cx, y: cy },
    { x: cx + Math.cos(a) * len * 0.5 + Math.cos(a + 1.2) * len * 0.15, y: cy + Math.sin(a) * len * 0.5 + Math.sin(a + 1.2) * len * 0.15 },
    { x: cx + Math.cos(a) * len, y: cy + Math.sin(a) * len },
  ];
}
