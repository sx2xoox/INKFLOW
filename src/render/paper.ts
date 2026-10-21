/**
 * 싸움터가 되는 한 폭의 그림. 한지 바탕에 바위·난초·대나무·매화를 옅게 그려 둔다.
 * 종이의 잔결(grain)은 합성 셰이더가 해상도에 상관없이 그리므로 여기서는 큰 결만 굽는다.
 */
import { type Vec, TAU } from '../core/math';
import { type Rng, mulberry32 } from '../core/rng';
import { brushStroke, dot, inkBlob, wash } from './brush';
import { type RGB, DAMMUK, INK, PAPER, SEAL, mix, rgba } from './color';

type Ctx = CanvasRenderingContext2D;

const range = (rng: Rng, a: number, b: number): number => a + rng() * (b - a);

export function createPaperCanvas(w: number, h: number, seed: number, scenery = true): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const rng = mulberry32(seed);

  ctx.fillStyle = rgba(PAPER, 1);
  ctx.fillRect(0, 0, w, h);

  // 얼룩덜룩한 종이 톤
  for (let i = 0; i < (w * h) / 60000; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = range(rng, 120, 420);
    const warm = rng() < 0.62;
    const col: RGB = warm ? [206, 186, 148] : [255, 252, 243];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, range(rng, 0.08, 0.17)));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // 닥나무 섬유
  ctx.lineCap = 'round';
  for (let i = 0; i < (w * h) / 2200; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const len = range(rng, 6, 28);
    const th = rng() * TAU;
    const bend = (rng() - 0.5) * 0.9;
    const dark = rng() < 0.55;
    ctx.strokeStyle = dark ? rgba([150, 130, 98], range(rng, 0.05, 0.12)) : rgba([255, 253, 246], range(rng, 0.14, 0.32));
    ctx.lineWidth = range(rng, 0.4, 1.3);
    const ex = x + Math.cos(th) * len;
    const ey = y + Math.sin(th) * len;
    const mx = (x + ex) / 2 + Math.cos(th + Math.PI / 2) * len * bend * 0.5;
    const my = (y + ey) / 2 + Math.sin(th + Math.PI / 2) * len * bend * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
  }
  // 티끌
  for (let i = 0; i < (w * h) / 9000; i++) {
    dot(ctx, rng() * w, rng() * h, range(rng, 0.5, 1.7), [110, 94, 70], range(rng, 0.12, 0.35), i);
  }

  if (scenery) {
    paintScenery(ctx, w, h, rng);
    paintFrame(ctx, w, h, rng);
  }
  return c;
}

/* ───────── 풍경 ───────── */

function paintScenery(ctx: Ctx, w: number, h: number, rng: Rng): void {
  // 옅은 안개 번짐
  for (let i = 0; i < 9; i++) {
    wash(ctx, range(rng, 0, w), range(rng, 0, h), range(rng, 160, 340), DAMMUK, range(rng, 0.025, 0.05), 900 + i, 0.55);
  }

  // 가운데(첫 자리)는 비워 둔다. 자리를 못 찾으면 포기한다.
  let tries = 0;
  const keepOut = (x: number, y: number, r: number): boolean => Math.hypot(x - w / 2, y - h / 2) < r && ++tries % 50 !== 0;

  // 바위와 태점
  for (let i = 0; i < 13; i++) {
    let x = 0;
    let y = 0;
    do {
      x = range(rng, 140, w - 140);
      y = range(rng, 140, h - 140);
    } while (keepOut(x, y, 260));
    paintRock(ctx, x, y, range(rng, 26, 62), rng);
  }

  // 풀 무더기
  for (let i = 0; i < 90; i++) {
    const x = range(rng, 60, w - 60);
    const y = range(rng, 60, h - 60);
    paintGrass(ctx, x, y, range(rng, 0.6, 1.25), rng);
  }

  // 난초
  for (let i = 0; i < 9; i++) {
    let x = 0;
    let y = 0;
    do {
      x = range(rng, 160, w - 160);
      y = range(rng, 160, h - 160);
    } while (keepOut(x, y, 300));
    paintOrchid(ctx, x, y, range(rng, 0.8, 1.3), rng);
  }

  // 가장자리 대숲
  paintBamboo(ctx, 70, h - 40, 1.25, rng, 4);
  paintBamboo(ctx, w - 260, 260, 0.95, rng, 3);
  paintBamboo(ctx, w * 0.62, h - 30, 0.8, rng, 2);

  // 귀퉁이에서 뻗어 나온 매화 가지
  paintPlum(ctx, w - 30, 40, rng);
  paintPlum(ctx, 30, 30, rng, true);
}

function paintRock(ctx: Ctx, x: number, y: number, r: number, rng: Rng): void {
  const seed = Math.floor(rng() * 1e6);
  wash(ctx, x + r * 0.1, y + r * 0.35, r * 1.25, DAMMUK, 0.07, seed, 0.45);
  inkBlob(ctx, x, y, r, { color: mix(DAMMUK, PAPER, 0.55), alpha: 0.45, seed, wobble: 0.22, squash: 0.62, halo: 0.6, light: 0.3 });
  // 바위 결(준법) — 마른 붓으로 그은 윤곽
  for (let k = 0; k < 3; k++) {
    const a0 = range(rng, -Math.PI * 1.1, -0.1);
    const sweep = range(rng, 0.9, 1.9);
    const rr = r * range(rng, 0.75, 1.02);
    const pts: Vec[] = [];
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (sweep * i) / 6;
      pts.push({ x: x + Math.cos(a) * rr * range(rng, 0.94, 1.06), y: y + Math.sin(a) * rr * 0.62 });
    }
    brushStroke(ctx, pts, { width: range(rng, 2.5, 5), color: INK, alpha: range(rng, 0.35, 0.6), dryness: 0.7, seed: seed + k, taperIn: 0.2, taperOut: 0.5 });
  }
  // 태점
  const dots = 3 + Math.floor(rng() * 6);
  for (let i = 0; i < dots; i++) {
    const a = range(rng, -Math.PI * 0.95, -0.05);
    dot(ctx, x + Math.cos(a) * r * range(rng, 0.6, 1), y + Math.sin(a) * r * 0.62 * range(rng, 0.7, 1.05), range(rng, 1.6, 3.4), INK, range(rng, 0.55, 0.85), seed + 20 + i);
  }
}

function paintGrass(ctx: Ctx, x: number, y: number, s: number, rng: Rng): void {
  const blades = 3 + Math.floor(rng() * 4);
  const alpha = range(rng, 0.18, 0.4);
  for (let i = 0; i < blades; i++) {
    const bx = x + (rng() - 0.5) * 10 * s;
    const lean = (rng() - 0.5) * 26 * s;
    const hgt = range(rng, 12, 28) * s;
    const pts = [
      { x: bx, y },
      { x: bx + lean * 0.35, y: y - hgt * 0.55 },
      { x: bx + lean, y: y - hgt },
    ];
    brushStroke(ctx, pts, { width: 2.6 * s, color: DAMMUK, alpha, dryness: 0.3, taperIn: 0.05, taperOut: 0.85, seed: Math.floor(rng() * 1e6), wet: 0.2 });
  }
}

function paintOrchid(ctx: Ctx, x: number, y: number, s: number, rng: Rng): void {
  const leaves = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < leaves; i++) {
    const dir = (i % 2 ? 1 : -1) * range(rng, 0.25, 1.1);
    const len = range(rng, 60, 130) * s;
    const p0 = { x: x + (rng() - 0.5) * 8, y };
    const p1 = { x: x + dir * len * 0.25, y: y - len * 0.55 };
    const p2 = { x: x + dir * len * 0.7, y: y - len * range(rng, 0.65, 0.95) };
    const p3 = { x: x + dir * len * 1.05, y: y - len * range(rng, 0.45, 0.8) };
    brushStroke(ctx, [p0, p1, p2, p3], {
      width: range(rng, 3.5, 6) * s,
      color: INK,
      alpha: range(rng, 0.35, 0.55),
      dryness: 0.25,
      taperIn: 0.08,
      taperOut: 0.7,
      seed: Math.floor(rng() * 1e6),
      wet: 0.25,
    });
  }
  // 꽃 한두 송이
  for (let f = 0; f < 2; f++) {
    const fx = x + (rng() - 0.5) * 40 * s;
    const fy = y - range(rng, 30, 60) * s;
    for (let p = 0; p < 4; p++) {
      const a = -Math.PI / 2 + (p - 1.5) * 0.55;
      brushStroke(ctx, [{ x: fx, y: fy }, { x: fx + Math.cos(a) * 9 * s, y: fy + Math.sin(a) * 9 * s }], {
        width: 3.2 * s,
        color: DAMMUK,
        alpha: 0.4,
        dryness: 0.1,
        taperIn: 0.3,
        taperOut: 0.6,
        seed: f * 10 + p + Math.floor(rng() * 1e5),
      });
    }
    dot(ctx, fx, fy - 2 * s, 1.4 * s, INK, 0.8, f);
  }
}

function paintBamboo(ctx: Ctx, x: number, y: number, s: number, rng: Rng, stalks: number): void {
  for (let k = 0; k < stalks; k++) {
    const bx = x + k * range(rng, 28, 48) * s;
    const lean = (rng() - 0.5) * 0.12;
    const segs = 4 + Math.floor(rng() * 3);
    let cy = y;
    const segH = range(rng, 52, 76) * s;
    const alpha = range(rng, 0.35, 0.6);
    for (let i = 0; i < segs; i++) {
      const x0 = bx + (y - cy) * lean;
      const y1 = cy - segH;
      const x1 = bx + (y - y1) * lean;
      brushStroke(ctx, [{ x: x0, y: cy - 3 }, { x: (x0 + x1) / 2, y: (cy + y1) / 2 }, { x: x1, y: y1 + 3 }], {
        width: 9 * s,
        color: DAMMUK,
        alpha,
        dryness: 0.45,
        taperIn: 0.08,
        taperOut: 0.08,
        seed: Math.floor(rng() * 1e6),
        wet: 0.15,
      });
      // 마디
      brushStroke(ctx, [{ x: x1 - 6 * s, y: y1 + 1 }, { x: x1, y: y1 - 1.5 }, { x: x1 + 6 * s, y: y1 + 1 }], {
        width: 2.4 * s,
        color: INK,
        alpha: alpha + 0.2,
        dryness: 0.2,
        seed: Math.floor(rng() * 1e6),
      });
      // 잎
      if (i >= segs - 3 && rng() < 0.8) {
        const side = rng() < 0.5 ? -1 : 1;
        const nLeaves = 2 + Math.floor(rng() * 3);
        for (let l = 0; l < nLeaves; l++) {
          const a = (side > 0 ? 0.35 : Math.PI - 0.35) + (rng() - 0.5) * 0.9 + 0.4;
          const len = range(rng, 34, 58) * s;
          const sx = x1;
          const sy = y1 + 2;
          brushStroke(
            ctx,
            [
              { x: sx, y: sy },
              { x: sx + Math.cos(a) * len * 0.5, y: sy + Math.sin(a) * len * 0.5 - 4 },
              { x: sx + Math.cos(a) * len, y: sy + Math.sin(a) * len },
            ],
            { width: 8 * s, color: INK, alpha: range(rng, 0.45, 0.7), dryness: 0.15, taperIn: 0.25, taperOut: 0.75, seed: Math.floor(rng() * 1e6), wet: 0.3 },
          );
        }
      }
      cy = y1;
    }
  }
}

function paintPlum(ctx: Ctx, x: number, y: number, rng: Rng, flip = false): void {
  const sx = flip ? 1 : -1;
  const blossoms: Vec[] = [];
  const branch = (bx: number, by: number, ang: number, len: number, wdt: number, depth: number): void => {
    const pts: Vec[] = [{ x: bx, y: by }];
    let cx = bx;
    let cy = by;
    let a = ang;
    const segs = 4;
    for (let i = 0; i < segs; i++) {
      a += (rng() - 0.5) * 0.7;
      cx += Math.cos(a) * (len / segs);
      cy += Math.sin(a) * (len / segs);
      pts.push({ x: cx, y: cy });
    }
    brushStroke(ctx, pts, { width: wdt, color: INK, alpha: 0.7, dryness: 0.75, taperIn: 0.02, taperOut: 0.55, seed: Math.floor(rng() * 1e6), wet: 0.1 });
    for (let i = 1; i < pts.length; i++) if (rng() < 0.6) blossoms.push(pts[i]);
    if (depth > 0) {
      const kids = 1 + Math.floor(rng() * 2);
      for (let k = 0; k < kids; k++) {
        const p = pts[1 + Math.floor(rng() * (pts.length - 1))];
        branch(p.x, p.y, a + (rng() - 0.5) * 1.6, len * 0.55, wdt * 0.55, depth - 1);
      }
    }
  };
  branch(x, y, flip ? 0.55 : Math.PI - 0.55, 260, 13, 2);

  const petal: RGB = [214, 86, 92];
  for (const b of blossoms) {
    const n = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const fx = b.x + (rng() - 0.5) * 22 * sx;
      const fy = b.y + (rng() - 0.5) * 22;
      const fr = range(rng, 3.4, 5.4);
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * TAU + rng();
        dot(ctx, fx + Math.cos(a) * fr, fy + Math.sin(a) * fr, fr * 0.78, petal, range(rng, 0.35, 0.6), Math.floor(rng() * 1e6));
      }
      dot(ctx, fx, fy, fr * 0.35, [150, 40, 40], 0.7, Math.floor(rng() * 1e6));
      for (let s = 0; s < 4; s++) {
        const a = rng() * TAU;
        dot(ctx, fx + Math.cos(a) * fr * 0.9, fy + Math.sin(a) * fr * 0.9, 0.7, INK, 0.75, s);
      }
    }
  }
}

/** 그림의 테두리 — 싸움터의 끝. */
function paintFrame(ctx: Ctx, w: number, h: number, rng: Rng): void {
  const band = 110;
  const grads: [number, number, number, number][] = [
    [0, 0, 0, band],
    [0, h, 0, h - band],
    [0, 0, band, 0],
    [w, 0, w - band, 0],
  ];
  for (const [x0, y0, x1, y1] of grads) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgba([120, 100, 72], 0.28));
    g.addColorStop(1, rgba([120, 100, 72], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  const edge = (pts: Vec[]): void =>
    brushStroke(ctx, pts, { width: range(rng, 7, 12), color: INK, alpha: 0.55, dryness: 0.85, taperIn: 0.04, taperOut: 0.06, seed: Math.floor(rng() * 1e6), wet: 0.1 });
  const m = 26;
  const jag = (a: Vec, b: Vec): Vec[] => {
    const pts: Vec[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push({ x: a.x + (b.x - a.x) * t + (rng() - 0.5) * 3, y: a.y + (b.y - a.y) * t + (rng() - 0.5) * 3 });
    }
    return pts;
  };
  edge(jag({ x: m, y: m }, { x: w - m, y: m }));
  edge(jag({ x: w - m, y: m }, { x: w - m, y: h - m }));
  edge(jag({ x: w - m, y: h - m }, { x: m, y: h - m }));
  edge(jag({ x: m, y: h - m }, { x: m, y: m }));

  // 화제(畫題)와 낙관
  ctx.save();
  ctx.fillStyle = rgba(INK, 0.6);
  ctx.font = '600 40px "Noto Serif KR", serif';
  ctx.textAlign = 'center';
  const title = ['墨', '流', '五', '色'];
  title.forEach((ch, i) => ctx.fillText(ch, w - 96, h - 360 + i * 48));
  ctx.restore();
  paintSeal(ctx, w - 96, h - 142, 46, '墨流');
}

export function paintSeal(ctx: Ctx, cx: number, cy: number, size: number, text: string): void {
  const seed = 4242;
  const rng = mulberry32(seed);
  ctx.save();
  ctx.beginPath();
  const s = size / 2;
  const jit = (): number => (rng() - 0.5) * size * 0.04;
  ctx.moveTo(cx - s + jit(), cy - s + jit());
  ctx.lineTo(cx + s + jit(), cy - s + jit());
  ctx.lineTo(cx + s + jit(), cy + s + jit());
  ctx.lineTo(cx - s + jit(), cy + s + jit());
  ctx.closePath();
  ctx.fillStyle = rgba(SEAL, 0.86);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  ctx.font = `700 ${Math.round(size * 0.4)}px "Noto Serif KR", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  if (chars.length === 2) {
    ctx.fillText(chars[0], cx, cy - size * 0.2);
    ctx.fillText(chars[1], cx, cy + size * 0.22);
  } else ctx.fillText(text, cx, cy);
  // 인주가 덜 묻은 자리
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.2 + rng() * 0.5})`;
    ctx.beginPath();
    ctx.arc(cx + (rng() - 0.5) * size, cy + (rng() - 0.5) * size, rng() * size * 0.03 + 0.3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
