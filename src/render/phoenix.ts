/**
 * 봉황 몸 그림 — 둥근 가슴, S자로 솟은 목, 작은 머리에 굽은 부리와 붉은 볏(육수),
 * 정수리에서 뒤로 휘는 깃 세 가닥. 목 밑동에는 오방색 구슬을 둘렀다.
 * 오른쪽을 보는 옆모습이고 원점은 몸통 가운데. 날개와 꼬리는 화면이 붓으로 따로 긋는다.
 */
import { TAU } from '../core/math';
import { arcPoints, brushStroke, dot } from './brush';
import { type RGB, INK, PAPER_LIGHT, mix, rgba } from './color';

type Ctx = CanvasRenderingContext2D;

const BEAK: RGB = [214, 168, 72];
const WATTLE: RGB = [186, 52, 40];
const EYE: RGB = [240, 200, 80];
/** 목에 두른 오방색 구슬 — 청 적 황 백 흑 */
const FIVE: RGB[] = [
  [52, 86, 116],
  [178, 58, 42],
  [192, 146, 56],
  [244, 240, 230],
  [40, 40, 46],
];

export function drawPhoenixBody(ctx: Ctx, open: number, color: RGB, edge: RGB): void {
  const light = color[0] + color[1] + color[2] > 600;
  const dark = mix(color, INK, light ? 0.32 : 0.42);
  const line = light ? mix(edge, INK, 0.45) : INK;
  const pale = mix(color, PAPER_LIGHT, light ? 0.2 : 0.42);

  // 꽁무니의 덮깃 — 꼬리로 이어지는 짧은 깃
  for (let i = 0; i < 5; i++) {
    const y = -5 + i * 3;
    brushStroke(ctx, [{ x: -28, y: y - 2 }, { x: -40, y: y + 1 }, { x: -50 - i * 1.5, y: y + 5 + i }], {
      width: 6 - i * 0.6,
      color: i % 2 ? dark : color,
      alpha: 0.95,
      dryness: 0.45,
      taperIn: 0.1,
      taperOut: 0.85,
      seed: 700 + i,
      edgeColor: line,
    });
  }

  // 목 — 가슴에서 S자로 솟아 머리로
  ctx.beginPath();
  ctx.moveTo(5, -11);
  ctx.bezierCurveTo(10, -22, 19, -26, 21, -36);
  ctx.bezierCurveTo(23, -46, 30, -53, 37, -49);
  ctx.bezierCurveTo(40, -45, 36, -40, 33, -36);
  ctx.bezierCurveTo(29, -30, 27, -18, 25, -3);
  ctx.closePath();
  const ng = ctx.createLinearGradient(6, -50, 26, -2);
  ng.addColorStop(0, rgba(dark, 1));
  ng.addColorStop(0.5, rgba(color, 1));
  ng.addColorStop(1, rgba(pale, 1));
  ctx.fillStyle = ng;
  ctx.fill();

  // 몸통 — 둥근 가슴과 갸름한 등
  ctx.beginPath();
  ctx.moveTo(26, -3);
  ctx.bezierCurveTo(28, 8, 14, 15, -2, 15);
  ctx.bezierCurveTo(-18, 15, -32, 9, -38, 1);
  ctx.bezierCurveTo(-34, -9, -18, -14, -4, -14);
  ctx.bezierCurveTo(10, -14, 22, -12, 26, -3);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, -16, 4, 17);
  bg.addColorStop(0, rgba(dark, 1));
  bg.addColorStop(0.45, rgba(color, 1));
  bg.addColorStop(1, rgba(pale, 1));
  ctx.fillStyle = bg;
  ctx.fill();
  // 등선과 배선
  brushStroke(ctx, [{ x: -38, y: 1 }, { x: -28, y: -10 }, { x: -6, y: -14 }, { x: 8, y: -13 }], { width: 2.6, color: line, alpha: 0.9, dryness: 0.4, taperIn: 0.2, taperOut: 0.3, seed: 710 });
  brushStroke(ctx, [{ x: -36, y: 5 }, { x: -18, y: 14 }, { x: 2, y: 15.5 }, { x: 19, y: 10 }, { x: 27, y: -2 }], { width: 2.2, color: line, alpha: 0.8, dryness: 0.45, taperIn: 0.2, taperOut: 0.2, seed: 711 });

  // 가슴 깃 — 반달을 겹쳐 찍는다
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      if (i === 3 && j === 2) continue;
      const x = 4 + i * 5 + j * 2.5;
      const y = -6 + j * 6 + i * 0.5;
      brushStroke(ctx, arcPoints(x, y, 3, 0.2, 2.6, 6), { width: 1, color: line, alpha: 0.5, dryness: 0.3, seed: 720 + i * 3 + j });
    }
  }
  // 목의 비늘깃
  for (let i = 0; i < 6; i++) {
    const x = 15 + i * 2.6;
    const y = -12 - i * 5.6;
    brushStroke(ctx, arcPoints(x, y, 3.2, 0.4, 2.4, 6), { width: 1.1, color: line, alpha: 0.55, dryness: 0.3, seed: 740 + i });
  }
  // 목선
  brushStroke(ctx, [{ x: 5, y: -11 }, { x: 13, y: -22 }, { x: 20, y: -30 }, { x: 22, y: -40 }, { x: 27, y: -48 }], { width: 2.4, color: line, alpha: 0.9, dryness: 0.4, taperIn: 0.2, taperOut: 0.2, seed: 750 });
  brushStroke(ctx, [{ x: 25, y: -3 }, { x: 27, y: -18 }, { x: 30, y: -30 }, { x: 35, y: -39 }], { width: 1.8, color: line, alpha: 0.75, dryness: 0.45, taperIn: 0.2, taperOut: 0.3, seed: 751 });

  // 오방색 구슬 목걸이
  FIVE.forEach((c, i) => {
    const t = i / 4;
    const x = 8 + t * 16;
    const y = -11 + Math.sin(t * Math.PI) * 3;
    dot(ctx, x, y, 1.9, c, 1, 760 + i);
    ctx.beginPath();
    ctx.arc(x, y, 1.9, 0, TAU);
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = rgba(INK, 0.7);
    ctx.stroke();
  });

  // 정수리 깃 — 뒤로 길게 흘러 끝이 말려 오르고, 작은 눈이 달린다
  for (let k = 0; k < 3; k++) {
    const end = { x: 2 - k * 6, y: -55 - k * 5 };
    brushStroke(
      ctx,
      [
        { x: 30, y: -53 },
        { x: 23 - k * 2, y: -59 - k * 2.5 },
        { x: 12 - k * 4, y: -59 - k * 4.5 },
        { x: end.x + 3, y: end.y - 1 },
        { x: end.x, y: end.y - 4 },
      ],
      { width: 2.4 - k * 0.3, color: k === 1 ? color : dark, alpha: 0.95, dryness: 0.3, taperIn: 0.4, taperOut: 0.25, seed: 770 + k, edgeColor: line },
    );
    dot(ctx, end.x, end.y - 4.5, 2.1, FIVE[(k * 2 + 1) % 5], 1, 775 + k);
    ctx.beginPath();
    ctx.arc(end.x, end.y - 4.5, 2.1, 0, TAU);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = rgba(INK, 0.8);
    ctx.stroke();
  }

  // 머리
  ctx.beginPath();
  ctx.ellipse(32, -48, 8.5, 7, -0.25, 0, TAU);
  const hg = ctx.createLinearGradient(26, -55, 36, -42);
  hg.addColorStop(0, rgba(dark, 1));
  hg.addColorStop(1, rgba(color, 1));
  ctx.fillStyle = hg;
  ctx.fill();
  brushStroke(ctx, arcPoints(32, -48, 8.5, 3.6, 3.2, 14, 7), { width: 2, color: line, alpha: 0.85, dryness: 0.35, seed: 780 });
  // 볏 — 붉은 살볏이 정수리에 낮게
  brushStroke(ctx, [{ x: 26, y: -54 }, { x: 31, y: -58 }, { x: 37, y: -55 }], { width: 4, color: WATTLE, alpha: 0.95, dryness: 0.2, taperIn: 0.3, taperOut: 0.4, seed: 781 });

  // 부리 — 위아래로 벌어진다
  const gape = open * 0.45;
  ctx.save();
  ctx.translate(38, -47);
  ctx.save();
  ctx.rotate(-gape * 0.5);
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.quadraticCurveTo(9, -4, 14, 1);
  ctx.quadraticCurveTo(8, 0.5, 0, 1);
  ctx.closePath();
  ctx.fillStyle = rgba(BEAK, 1);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(INK, 0.85);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.rotate(gape * 0.8);
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.quadraticCurveTo(7, 2, 11, 2.5);
  ctx.quadraticCurveTo(6, 4.5, 0, 4);
  ctx.closePath();
  ctx.fillStyle = rgba(mix(BEAK, INK, 0.15), 1);
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = rgba(INK, 0.8);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // 턱 밑의 붉은 육수
  brushStroke(ctx, [{ x: 36, y: -43 }, { x: 37.5, y: -38 }, { x: 35.5, y: -34 }], { width: 4.2, color: WATTLE, alpha: 0.95, dryness: 0.15, taperIn: 0.2, taperOut: 0.6, seed: 782 });

  // 눈 — 금빛 눈에 붉은 눈선이 뒤로 길게
  brushStroke(ctx, [{ x: 36, y: -49 }, { x: 31, y: -49.5 }, { x: 24, y: -47 }], { width: 2.2, color: WATTLE, alpha: 0.9, dryness: 0.2, taperIn: 0.1, taperOut: 0.8, seed: 783 });
  ctx.beginPath();
  ctx.ellipse(34, -49.5, 2.8, 2.3, 0, 0, TAU);
  ctx.fillStyle = rgba(EYE, 1);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(INK, 0.95);
  ctx.stroke();
  dot(ctx, 34.6, -49.5, 1.1, INK, 1, 784);
  dot(ctx, 33.6, -50.4, 0.5, PAPER_LIGHT, 0.95, 785);
}

/** 날개깃 하나를 그릴 색 — 날개 바깥 끝은 짙고, 안쪽 깃은 오방색 띠를 두른다 */
export const PHOENIX_FIVE = FIVE;
