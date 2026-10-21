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
