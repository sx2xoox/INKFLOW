/**
 * 이무기 머리 그림 — 용이 되지 못해 뿔이 없고, 눈썹뼈만 솟았다.
 * 긴 주둥이, 흩날리는 수염, 뒤로 뻗친 지느러미 갈기, 노랗게 타는 눈.
 * 오른쪽을 보는 옆모습이고 원점은 목이 몸과 이어지는 자리. 몸은 화면이 붓으로 따로 그린다.
 */
import { TAU } from '../core/math';
import { arcPoints, brushStroke, dot } from './brush';
import { type RGB, INK, PAPER_LIGHT, mix, rgba } from './color';

type Ctx = CanvasRenderingContext2D;

const EYE: RGB = [238, 196, 64];
const MOUTH: RGB = [140, 38, 32];

export function drawImugiHead(ctx: Ctx, open: number, color: RGB, edge: RGB): void {
  const light = color[0] + color[1] + color[2] > 600;
  const dark = mix(color, INK, light ? 0.35 : 0.45);
  const line = light ? mix(edge, INK, 0.5) : INK;

  // 갈기 — 뒤로 뻗친 지느러미
  for (let i = 0; i < 6; i++) {
    const y = -16 + i * 4.5;
    brushStroke(ctx, [{ x: 4, y }, { x: -10, y: y - 6 + i }, { x: -22 - i * 1.5, y: y - 10 + i * 2.2 }], {
      width: 4.5 - i * 0.3,
      color: i % 2 ? dark : mix(color, PAPER_LIGHT, 0.15),
      alpha: 0.95,
      dryness: 0.5,
      taperIn: 0.1,
      taperOut: 0.9,
      seed: 900 + i,
    });
  }

  // 아래턱 — 벌리면 내려간다
  ctx.save();
  ctx.translate(12, 4);
  ctx.rotate(open * 0.55);
  if (open > 0.05) {
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.quadraticCurveTo(20, -6, 40, -2);
    ctx.quadraticCurveTo(26, 6, 2, 6);
    ctx.closePath();
    ctx.fillStyle = rgba(MOUTH, 1);
    ctx.fill();
    // 갈라진 혀
    brushStroke(ctx, [{ x: 8, y: 1 }, { x: 30, y: 0 }, { x: 40, y: -2 }], { width: 2.4, color: [196, 90, 86], alpha: 1, taperIn: 0.2, taperOut: 0.6, seed: 950 });
    brushStroke(ctx, [{ x: 36, y: -1 }, { x: 44, y: 2 }], { width: 1.4, color: [196, 90, 86], alpha: 1, taperOut: 0.9, seed: 951 });
  }
  ctx.beginPath();
  ctx.moveTo(-2, 0);
  ctx.quadraticCurveTo(20, 2, 40, -1);
  ctx.quadraticCurveTo(36, 7, 18, 9);
  ctx.quadraticCurveTo(4, 9, -2, 0);
  ctx.fillStyle = rgba(mix(color, PAPER_LIGHT, 0.35), 1);
  ctx.fill();
  brushStroke(ctx, [{ x: 0, y: 7 }, { x: 18, y: 9.5 }, { x: 38, y: 2 }], { width: 2, color: line, alpha: 0.85, dryness: 0.35, taperIn: 0.2, taperOut: 0.3, seed: 952 });
  if (open > 0.05) for (let i = 0; i < 4; i++) tooth(ctx, 12 + i * 7, 0.5, -1, 3.5);
  // 턱수염
  for (let i = 0; i < 3; i++) {
    brushStroke(ctx, [{ x: 8 + i * 6, y: 8 }, { x: 4 + i * 6, y: 15 + i }, { x: -2 + i * 5, y: 20 + i * 2 }], {
      width: 2.2,
      color: dark,
      alpha: 0.9,
      dryness: 0.5,
      taperOut: 0.9,
      seed: 953 + i,
    });
  }
  ctx.restore();

  // 머리 — 긴 주둥이
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(-2, -10, 8, -18, 20, -16);
  ctx.bezierCurveTo(30, -15, 40, -10, 50, -6);
  ctx.bezierCurveTo(56, -4, 57, 1, 53, 3);
  ctx.bezierCurveTo(40, 5, 24, 6, 12, 6);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -18, 0, 8);
  g.addColorStop(0, rgba(dark, 1));
  g.addColorStop(0.55, rgba(color, 1));
  g.addColorStop(1, rgba(mix(color, PAPER_LIGHT, 0.3), 1));
  ctx.fillStyle = g;
  ctx.fill();
  brushStroke(ctx, [{ x: 0, y: 5 }, { x: 1, y: -8 }, { x: 10, y: -17 }, { x: 22, y: -16 }, { x: 40, y: -10 }, { x: 54, y: -4 }], {
    width: 2.6,
    color: line,
    alpha: 0.9,
    dryness: 0.4,
    taperIn: 0.1,
    taperOut: 0.2,
    seed: 960,
  });
  // 비늘
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 2; j++) {
      brushStroke(ctx, arcPoints(8 + i * 6 + j * 3, -6 + j * 5, 2.4, -1.2, 2.4, 6), { width: 0.9, color: line, alpha: 0.45, dryness: 0.3, seed: 970 + i * 2 + j });
    }
  }
  // 눈썹뼈 — 뿔이 되지 못한 혹
  for (const [x, h] of [
    [14, 8],
    [21, 6],
  ] as [number, number][]) {
    brushStroke(ctx, [{ x, y: -15 }, { x: x - 2, y: -15 - h }], { width: 4.2, color: dark, alpha: 1, taperIn: 0.05, taperOut: 0.7, seed: 980 + x });
  }
  // 타는 눈
  ctx.beginPath();
  ctx.ellipse(24, -9, 5.2, 4, -0.1, 0, TAU);
  ctx.fillStyle = rgba(EYE, 1);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = rgba(INK, 0.95);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(25, -9, 1.2, 3.2, 0, 0, TAU);
  ctx.fillStyle = rgba(INK, 1);
  ctx.fill();
  dot(ctx, 22.6, -10.8, 1, PAPER_LIGHT, 0.95, 990);
  brushStroke(ctx, [{ x: 17, y: -14 }, { x: 25, y: -15 }, { x: 31, y: -12 }], { width: 2.4, color: INK, alpha: 0.95, dryness: 0.3, taperIn: 0.2, taperOut: 0.5, seed: 991 });
  // 콧구멍과 윗입술
  dot(ctx, 50, -3, 1.4, INK, 0.9, 992);
  brushStroke(ctx, [{ x: 54, y: 2 }, { x: 40, y: 5 }, { x: 14, y: 6 }], { width: 1.8, color: line, alpha: 0.8, dryness: 0.35, seed: 993 });
  if (open > 0.05) for (let i = 0; i < 5; i++) tooth(ctx, 18 + i * 7, 5, 1, 4.5);
  // 흩날리는 긴 수염
  for (const [y0, k] of [
    [-1, 1],
    [2, -1],
  ] as [number, number][]) {
    brushStroke(
      ctx,
      [
        { x: 48, y: y0 },
        { x: 58, y: y0 - 6 * k },
        { x: 66, y: y0 + 2 * k },
        { x: 70, y: y0 + 12 * k },
        { x: 64, y: y0 + 22 * k },
      ],
      { width: 1.6, color: dark, alpha: 0.9, dryness: 0.3, taperIn: 0.1, taperOut: 0.95, seed: 995 + k },
    );
  }
}

function tooth(ctx: Ctx, x: number, y: number, dir: 1 | -1, len: number): void {
  ctx.beginPath();
  ctx.moveTo(x - 1.8, y);
  ctx.lineTo(x + 1.8, y);
  ctx.lineTo(x + 0.3, y + dir * len);
  ctx.closePath();
  ctx.fillStyle = rgba(PAPER_LIGHT, 1);
  ctx.fill();
}
