/**
 * 묵호(墨虎) 그림 — 대숲의 주인.
 * 송하맹호도처럼 몸은 황토빛 담채에 마른 붓으로 줄무늬를 긋고,
 * 얼굴은 까치호랑이처럼 둥근 눈을 크게 뜬다. 이마에는 王 무늬.
 * 오른쪽을 보고 서 있으며 원점이 네 발 가운데의 바닥이다.
 * 몸통·다리·꼬리·머리를 자세 값으로 움직여 걷기·웅크리기·도약·할퀴기·포효를 그린다.
 */
import { type Vec, TAU, lerp } from '../core/math';
import { mulberry32 } from '../core/rng';
import { brushStroke, dot, wash } from './brush';
import { type RGB, DAMMUK, INK, PAPER_LIGHT, mix, rgba } from './color';

type Ctx = CanvasRenderingContext2D;

const OCHRE: RGB = [206, 148, 70];
const OCHRE_DEEP: RGB = [160, 100, 46];
const CREAM: RGB = [246, 236, 212];
const EYE: RGB = [232, 190, 72];
const MOUTH: RGB = [148, 44, 36];
const FAR = 0.38;

interface Pose {
  /** 몸 전체를 들어 올리는(-) 또는 낮추는(+) 정도 */
  lift: number;
  /** 몸통 기울기 — 앞이 들리면 + */
  tilt: number;
  /** 몸이 앞뒤로 늘어나는 정도 */
  stretch: number;
  /** 몸 전체를 앞으로 내미는 정도 */
  shift: number;
  /** 발끝 자리(바닥 좌표) — 가까운/먼 앞발, 가까운/먼 뒷발 */
  fn: Vec;
  ff: Vec;
  bn: Vec;
  bf: Vec;
  /** 머리를 옮기고 기울이고(위를 보면 -) 입을 벌린다 */
  hx: number;
  hy: number;
  ht: number;
  mouth: number;
  /** 꼬리 — 흔들림과 치켜든 정도 */
  sway: number;
  raise: number;
  /** 털이 곤두선 정도 */
  bristle: number;
  /** 할퀴는 앞발을 들었으면 그 발의 자리 */
  claw: Vec | null;
}

/** 서 있을 때의 몸 */
const SHOULDER: Vec = { x: 32, y: -66 };
const HIP: Vec = { x: -36, y: -66 };
const HEAD: Vec = { x: 66, y: -98 };
const PIVOT: Vec = { x: -2, y: -70 };
/** 까치호랑이처럼 머리를 크게 */
const HEAD_SCALE = 1.32;

/** 등선과 배선(앞에서 뒤로) */
const BACK: Vec[] = [
  { x: -58, y: -72 },
  { x: -50, y: -88 },
  { x: -32, y: -95 },
  { x: -8, y: -91 },
  { x: 14, y: -94 },
  { x: 34, y: -104 },
  { x: 50, y: -106 },
];
const BELLY: Vec[] = [
  { x: 56, y: -74 },
  { x: 46, y: -52 },
  { x: 26, y: -45 },
  { x: 0, y: -43 },
  { x: -22, y: -45 },
  { x: -42, y: -50 },
  { x: -56, y: -60 },
];

export const TIGER_FRAMES = {
  walk: 8,
  /** 웅크리기, 도약, 할퀴기 셋, 포효 둘 */
  names: ['crouch', 'leap', 'swipe0', 'swipe1', 'swipe2', 'roar0', 'roar1'] as const,
};
export type TigerPoseName = 'walk' | (typeof TIGER_FRAMES.names)[number];

const v = (x: number, y: number): Vec => ({ x, y });

function walkPose(f: number): Pose {
  const ph = (f / TIGER_FRAMES.walk) * TAU;
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const step = 17;
  // 대각선 다리끼리 함께 딛는다
  return {
    lift: -Math.abs(Math.sin(ph)) * 2.2,
    tilt: Math.sin(ph * 2) * 0.012,
    stretch: 0,
    shift: 0,
    fn: v(SHOULDER.x + 6 + s * step, -Math.max(0, c) * 10),
    bf: v(HIP.x + 2 + s * step, -Math.max(0, c) * 9),
    ff: v(SHOULDER.x + 2 - s * step, -Math.max(0, -c) * 10),
    bn: v(HIP.x - 4 - s * step, -Math.max(0, -c) * 9),
    hx: 0,
    hy: Math.sin(ph * 2 + 0.6) * 1.4,
    ht: Math.sin(ph * 2) * 0.03,
    mouth: 0,
    sway: s,
    raise: 0.3,
    bristle: 0,
    claw: null,
  };
}

function namedPose(name: Exclude<TigerPoseName, 'walk'>): Pose {
  const base = walkPose(0);
  switch (name) {
    case 'crouch':
      return {
        ...base,
        lift: 15,
        tilt: -0.07,
        shift: -4,
        fn: v(SHOULDER.x + 22, 0),
        ff: v(SHOULDER.x + 14, 0),
        bn: v(HIP.x + 10, 0),
        bf: v(HIP.x + 16, 0),
        hx: 8,
        hy: 14,
        ht: 0.12,
        mouth: 0.12,
        sway: 0.8,
        raise: -0.2,
      };
    case 'leap':
      return {
        ...base,
        lift: -10,
        tilt: 0.1,
        stretch: 0.16,
        shift: 6,
        fn: v(SHOULDER.x + 58, -30),
        ff: v(SHOULDER.x + 48, -20),
        bn: v(HIP.x - 46, -18),
        bf: v(HIP.x - 38, -10),
        hx: 8,
        hy: -2,
        ht: 0.05,
        mouth: 0.45,
        sway: -0.6,
        raise: -0.5,
      };
    case 'swipe0':
      return {
        ...base,
        lift: -4,
        tilt: 0.24,
        shift: -6,
        fn: v(SHOULDER.x + 6, 0),
        ff: v(SHOULDER.x + 12, 0),
        bn: v(HIP.x + 2, 0),
        bf: v(HIP.x + 8, 0),
        hx: -2,
        hy: -4,
        ht: -0.12,
        mouth: 0.5,
        sway: 1,
        raise: 0.7,
        bristle: 0.4,
        claw: v(8, -164),
      };
    case 'swipe1':
      return {
        ...base,
        lift: 2,
        tilt: 0.04,
        shift: 10,
        fn: v(SHOULDER.x + 18, 0),
        ff: v(SHOULDER.x + 24, 0),
        bn: v(HIP.x + 6, 0),
        bf: v(HIP.x + 12, 0),
        hx: 6,
        hy: 2,
        ht: 0.06,
        mouth: 0.65,
        sway: -0.6,
        raise: 0.4,
        bristle: 0.6,
        claw: v(126, -58),
      };
    case 'swipe2':
      return {
        ...base,
        lift: 6,
        tilt: -0.05,
        shift: 12,
        fn: v(SHOULDER.x + 22, 0),
        ff: v(SHOULDER.x + 26, 0),
        bn: v(HIP.x + 8, 0),
        bf: v(HIP.x + 14, 0),
        hx: 6,
        hy: 6,
        ht: 0.1,
        mouth: 0.3,
        sway: -1,
        raise: 0.2,
        bristle: 0.3,
        claw: v(114, -6),
      };
    case 'roar0':
    case 'roar1': {
      const k = name === 'roar1' ? 1 : 0.75;
      return {
        ...base,
        lift: -3,
        tilt: 0.09 + 0.03 * k,
        shift: -4,
        fn: v(SHOULDER.x + 18, 0),
        ff: v(SHOULDER.x + 4, 0),
        bn: v(HIP.x - 4, 0),
        bf: v(HIP.x + 6, 0),
        hx: 4,
        hy: -8 * k,
        ht: -0.34 * k,
        mouth: k,
        sway: 0.4,
        raise: 1,
        bristle: k,
      };
    }
  }
}

export function tigerPose(name: TigerPoseName, frame = 0): Pose {
  return name === 'walk' ? walkPose(frame) : namedPose(name);
}

/** 몸통 좌표를 자세에 맞춰 옮긴다 */
function bodyXf(p: Pose): (q: Vec) => Vec {
  const c = Math.cos(-p.tilt);
  const s = Math.sin(-p.tilt);
  return (q) => {
    const x = (q.x - PIVOT.x) * (1 + p.stretch);
    const y = q.y - PIVOT.y;
    return { x: PIVOT.x + x * c - y * s + p.shift, y: PIVOT.y + x * s + y * c + p.lift };
  };
}

export function drawTiger(ctx: Ctx, name: TigerPoseName, frame: number, seed: number): void {
  const p = tigerPose(name, frame);
  const xf = bodyXf(p);
  const rng = mulberry32(seed);
  const shoulder = xf(SHOULDER);
  const hip = xf(HIP);

  // 먼 쪽 다리 — 그늘에 묻혀 어둡다
  rearLeg(ctx, xf(v(HIP.x + 6, HIP.y - 2)), p.bf, true, seed + 10);
  frontLeg(ctx, xf(v(SHOULDER.x + 6, SHOULDER.y - 2)), p.ff, true, seed + 20);

  tail(ctx, xf(v(-56, -76)), p, seed + 30);
  // 가까운 넓적다리는 몸통 밑에 깔아 줄무늬가 그 위로 흐르게 한다
  const thigh = rearLeg(ctx, hip, p.bn, false, seed + 60);
  torso(ctx, p, rng, seed + 40);
  thighOutline(ctx, thigh, seed + 66);
  if (!p.claw) frontLeg(ctx, shoulder, p.fn, false, seed + 70);
  // 높이 치켜든 앞발은 머리 뒤로, 내지른 앞발은 얼굴 앞으로
  const high = p.claw && p.claw.y < -120;
  if (p.claw && high) clawArm(ctx, shoulder, p.claw, seed + 70);
  head(ctx, xf(HEAD), p, seed + 80);
  if (p.claw && !high) clawArm(ctx, shoulder, p.claw, seed + 70);
}

/* ───────── 몸통 ───────── */

function torso(ctx: Ctx, p: Pose, rng: () => number, seed: number): void {
  ctx.save();
  ctx.translate(p.shift, p.lift);
  ctx.translate(PIVOT.x, PIVOT.y);
  ctx.rotate(-p.tilt);
  ctx.scale(1 + p.stretch, 1);
  ctx.translate(-PIVOT.x, -PIVOT.y);

  const back = BACK;
  const belly = BELLY;
  ctx.beginPath();
  ctx.moveTo(back[0].x, back[0].y);
  for (let i = 1; i < back.length - 1; i++) {
    const m = v((back[i].x + back[i + 1].x) / 2, (back[i].y + back[i + 1].y) / 2);
    ctx.quadraticCurveTo(back[i].x, back[i].y, m.x, m.y);
  }
  ctx.quadraticCurveTo(64, -100, belly[0].x, belly[0].y);
  for (let i = 0; i < belly.length - 1; i++) {
    const m = v((belly[i].x + belly[i + 1].x) / 2, (belly[i].y + belly[i + 1].y) / 2);
    ctx.quadraticCurveTo(belly[i].x, belly[i].y, m.x, m.y);
  }
  ctx.quadraticCurveTo(-66, -64, back[0].x, back[0].y);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -104, 0, -42);
  g.addColorStop(0, rgba(mix(OCHRE, OCHRE_DEEP, 0.35), 1));
  g.addColorStop(0.45, rgba(OCHRE, 1));
  g.addColorStop(0.8, rgba(mix(OCHRE, CREAM, 0.55), 1));
  g.addColorStop(1, rgba(CREAM, 1));
  ctx.fillStyle = g;
  ctx.fill();

  ctx.save();
  ctx.clip();
  // 담채의 얼룩 — 등은 짙게, 배는 희게
  wash(ctx, -30, -88, 34, OCHRE_DEEP, 0.32, seed + 1, 0.5);
  wash(ctx, 26, -94, 30, OCHRE_DEEP, 0.28, seed + 2, 0.55);
  wash(ctx, 4, -46, 42, CREAM, 0.55, seed + 3, 0.3);
  wash(ctx, -52, -60, 22, DAMMUK, 0.16, seed + 4, 0.8);
  wash(ctx, 10, -50, 50, DAMMUK, 0.08, seed + 5, 0.25);
  // 줄무늬 — 등에서 배 쪽으로, 뒤로 휘며 가늘어진다. 몇은 갈라진다
  const stripes = 11;
  for (let i = 0; i < stripes; i++) {
    const t = i / (stripes - 1);
    const x0 = lerp(-52, 42, t) + (rng() - 0.5) * 4;
    const y0 = lineAt(BACK, x0) - 2;
    const depth = lineAt(BELLY, x0) - y0;
    const len = depth * lerp(0.55, 0.75, Math.sin(t * Math.PI)) * (0.85 + rng() * 0.3) * (i % 2 ? 0.75 : 1);
    const lean = -0.32 - rng() * 0.18 + (t - 0.5) * 0.25;
    const bend = (rng() - 0.5) * 6;
    const pts = [v(x0, y0), v(x0 + Math.sin(lean) * len * 0.5 + bend, y0 + len * 0.5), v(x0 + Math.sin(lean) * len - 2, y0 + len)];
    brushStroke(ctx, pts, { width: 6.2 - (i % 2) * 1.6, color: INK, alpha: 0.88, dryness: 0.42, taperIn: 0.08, taperOut: 0.85, seed: seed + 10 + i });
    if (rng() < 0.45) {
      // 갈래
      const b = pts[1];
      brushStroke(ctx, [b, v(b.x + 6 + rng() * 4, b.y + len * 0.35)], { width: 3.4, color: INK, alpha: 0.8, dryness: 0.45, taperIn: 0.1, taperOut: 0.9, seed: seed + 30 + i });
    }
    // 겹줄
    if (i % 3 === 1) {
      brushStroke(ctx, pts.map((q, k) => v(q.x + 7 - k, q.y + 2)), { width: 2.6, color: INK, alpha: 0.6, dryness: 0.55, taperIn: 0.1, taperOut: 0.9, seed: seed + 50 + i });
    }
  }
  ctx.restore();

  // 윤곽 — 등은 단숨에, 배는 털이 끊기듯
  brushStroke(ctx, back.slice(0, 6), { width: 3.4, color: INK, alpha: 0.9, dryness: 0.4, taperIn: 0.06, taperOut: 0.15, seed: seed + 70 });
  for (let i = 0; i < belly.length - 1; i += 1) {
    const a = belly[i];
    const b = belly[i + 1];
    brushStroke(ctx, [v(lerp(a.x, b.x, 0.1), lerp(a.y, b.y, 0.1) + 1), v(lerp(a.x, b.x, 0.85), lerp(a.y, b.y, 0.85) + 2.5)], {
      width: 2.2,
      color: INK,
      alpha: 0.75,
      dryness: 0.55,
      taperIn: 0.2,
      taperOut: 0.6,
      seed: seed + 80 + i,
    });
  }
  // 배의 털 — 아래로 늘어진 짧은 붓질
  for (let i = 0; i < 9; i++) {
    const x = lerp(-46, 36, i / 8);
    const y = lineAt(BELLY, x);
    brushStroke(ctx, [v(x, y - 2), v(x - 4, y + 5)], { width: 2.2, color: mix(CREAM, DAMMUK, 0.25), alpha: 0.8, dryness: 0.5, taperIn: 0.1, taperOut: 0.9, seed: seed + 90 + i });
  }
  // 등의 털결 — 곤두서면 길어진다
  const hair = 1 + p.bristle * 1.4;
  for (let i = 0; i < 12; i++) {
    const x = lerp(-52, 46, i / 11);
    const y = lineAt(BACK, x);
    brushStroke(ctx, [v(x, y + 1), v(x - 3 * hair, y - 4 * hair)], { width: 1.8, color: INK, alpha: 0.55, dryness: 0.6, taperIn: 0.1, taperOut: 0.9, seed: seed + 110 + i });
  }
  ctx.restore();
}

/** 선 위에서 x 자리의 높이 */
function lineAt(line: Vec[], x: number): number {
  const pts = line[0].x < line[line.length - 1].x ? line : [...line].reverse();
  if (x <= pts[0].x) return pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i].x) return lerp(pts[i - 1].y, pts[i].y, (x - pts[i - 1].x) / (pts[i].x - pts[i - 1].x));
  }
  return pts[pts.length - 1].y;
}

/* ───────── 다리 ───────── */

/** 황토 몸에 먹 윤곽 — 먹선을 먼저 굵게, 그 위에 살을 칠한다 */
const farTone = (c: RGB): RGB => mix(mix(c, OCHRE_DEEP, 0.5), DAMMUK, FAR * 0.45);

function limb(ctx: Ctx, pts: Vec[], w: number, far: boolean, seed: number): void {
  const body = far ? farTone(OCHRE) : OCHRE;
  brushStroke(ctx, pts, { width: w + 3.6, color: INK, alpha: far ? 0.75 : 0.9, dryness: 0.4, taperIn: 0.02, taperOut: 0.1, seed, wet: 0.1 });
  brushStroke(ctx, pts, { width: w, color: body, alpha: 1, dryness: 0.15, taperIn: 0.02, taperOut: 0.12, seed: seed + 1, wet: 0 });
}

function paw(ctx: Ctx, x: number, y: number, far: boolean, seed: number): void {
  const col = far ? farTone(mix(OCHRE, CREAM, 0.5)) : mix(OCHRE, CREAM, 0.55);
  ctx.beginPath();
  ctx.moveTo(x - 7, y - 1);
  ctx.bezierCurveTo(x - 8, y - 8, x - 2, y - 11, x + 5, y - 10);
  ctx.bezierCurveTo(x + 12, y - 9, x + 15, y - 4, x + 14, y - 0.5);
  ctx.quadraticCurveTo(x + 4, y + 1.2, x - 7, y - 1);
  ctx.closePath();
  ctx.fillStyle = rgba(col, 1);
  ctx.fill();
  brushStroke(ctx, [v(x - 7, y - 2), v(x - 6, y - 8), v(x + 4, y - 10.5), v(x + 13, y - 5), v(x + 14, y - 1)], {
    width: 2.2,
    color: INK,
    alpha: far ? 0.55 : 0.85,
    dryness: 0.35,
    taperIn: 0.1,
    taperOut: 0.2,
    seed: seed + 9,
  });
  brushStroke(ctx, [v(x - 7, y - 0.5), v(x + 14, y)], { width: 1.6, color: INK, alpha: far ? 0.4 : 0.6, dryness: 0.5, taperIn: 0.2, taperOut: 0.2, seed: seed + 8 });
  // 발가락 사이
  for (let i = 0; i < 3; i++) {
    const tx = x + 1 + i * 4.2;
    brushStroke(ctx, [v(tx + 1, y - 6.5), v(tx + 1.6, y - 1)], { width: 1.3, color: INK, alpha: far ? 0.4 : 0.7, dryness: 0.3, taperIn: 0.3, taperOut: 0.5, seed: seed + i });
  }
}

/** 고양이 앞다리 — 팔꿈치는 뒤로, 앞팔은 곧게 */
function frontLeg(ctx: Ctx, root: Vec, foot: Vec, far: boolean, seed: number): void {
  const elbow = v(lerp(root.x, foot.x, 0.35) - 8, lerp(root.y, foot.y, 0.5));
  const wrist = v(foot.x + 2, foot.y - 9);
  limb(ctx, [v(root.x + 2, root.y - 12), elbow, wrist], 18, far, seed);
  stripesOn(ctx, [elbow, wrist], 3, far, seed + 5);
  paw(ctx, foot.x, foot.y, far, seed + 9);
}

interface Thigh {
  cx: number;
  cy: number;
  root: Vec;
  knee: Vec;
}

/** 넓적다리 뒤쪽 둘레와 휘감긴 무늬 — 몸통 위에 얹는다 */
function thighOutline(ctx: Ctx, t: Thigh, seed: number): void {
  const { cx, cy, root, knee } = t;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, 23, 20, -0.55, 0, TAU);
  ctx.clip();
  const g = ctx.createRadialGradient(cx + 4, cy + 6, 2, cx, cy, 24);
  g.addColorStop(0, rgba(mix(OCHRE, CREAM, 0.2), 0.55));
  g.addColorStop(1, rgba(OCHRE, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - 26, cy - 26, 52, 52);
  ctx.restore();
  for (let i = 0; i < 4; i++) {
    const a = -2.3 + i * 0.5;
    brushStroke(ctx, [v(cx + Math.cos(a) * 21, cy + Math.sin(a) * 18), v(cx + Math.cos(a + 0.3) * 13, cy + Math.sin(a + 0.3) * 11), v(cx + Math.cos(a + 0.55) * 6, cy + Math.sin(a + 0.55) * 5)], {
      width: 4.2 - (i % 2),
      color: INK,
      alpha: 0.85,
      dryness: 0.45,
      taperIn: 0.1,
      taperOut: 0.9,
      seed: seed + i,
    });
  }
  brushStroke(ctx, [v(root.x - 20, root.y - 8), v(root.x - 23, root.y + 12), v(knee.x - 9, knee.y + 9), v(knee.x + 4, knee.y + 5)], {
    width: 2.8,
    color: INK,
    alpha: 0.85,
    dryness: 0.45,
    taperIn: 0.25,
    taperOut: 0.3,
    seed: seed + 9,
  });
}

/** 고양이 뒷다리 — 굵은 넓적다리, 앞으로 꺾인 무릎, 뒤로 꺾인 발목 */
function rearLeg(ctx: Ctx, root: Vec, foot: Vec, far: boolean, seed: number): Thigh {
  const knee = v(lerp(root.x, foot.x, 0.4) + 13, lerp(root.y, foot.y, 0.45));
  const hock = v(foot.x - 10, foot.y - 20);
  limb(ctx, [knee, hock, v(foot.x + 1, foot.y - 7)], 14, far, seed);
  // 넓적다리 — 몸통에서 흘러내린다
  const thigh = far ? farTone(OCHRE) : OCHRE;
  const cx0 = (root.x + knee.x) / 2 - 3;
  const cy0 = (root.y + knee.y) / 2 - 4;
  ctx.beginPath();
  ctx.ellipse(cx0, cy0, 23, 20, -0.55, 0, TAU);
  ctx.fillStyle = rgba(thigh, 1);
  ctx.fill();
  if (far) {
    brushStroke(ctx, [v(root.x - 20, root.y - 6), v(root.x - 22, root.y + 14), v(knee.x - 8, knee.y + 9), v(knee.x + 4, knee.y + 5)], {
      width: 2.6,
      color: INK,
      alpha: far ? 0.6 : 0.85,
      dryness: 0.45,
      taperIn: 0.2,
      taperOut: 0.3,
      seed: seed + 3,
    });
    // 넓적다리의 휘감긴 무늬
    for (let i = 0; i < 3; i++) {
      const a = -1.9 + i * 0.55;
      brushStroke(ctx, [v(cx0 + Math.cos(a) * 19, cy0 + Math.sin(a) * 16), v(cx0 + Math.cos(a + 0.35) * 8, cy0 + Math.sin(a + 0.35) * 7)], {
        width: 4,
        color: INK,
        alpha: far ? 0.45 : 0.8,
        dryness: 0.45,
        taperIn: 0.1,
        taperOut: 0.85,
        seed: seed + 6 + i,
      });
    }
  }
  stripesOn(ctx, [hock, v(foot.x, foot.y - 7)], 1, far, seed + 12);
  paw(ctx, foot.x, foot.y, far, seed + 15);
  return { cx: cx0, cy: cy0, root, knee };
}

/** 할퀴려고 치켜든 앞발 — 발톱이 드러난다 */
function clawArm(ctx: Ctx, root: Vec, tip: Vec, seed: number): void {
  const dx = tip.x - root.x;
  const dy = tip.y - root.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const elbow = v(root.x + dx * 0.45 - nx * 8, root.y + dy * 0.45 - ny * 8);
  limb(ctx, [v(root.x, root.y - 10), elbow, tip], 17, false, seed);
  stripesOn(ctx, [elbow, tip], 3, false, seed + 4);
  // 펼친 발바닥과 발톱
  ctx.beginPath();
  ctx.ellipse(tip.x, tip.y, 9.5, 8, Math.atan2(dy, dx), 0, TAU);
  ctx.fillStyle = rgba(mix(OCHRE, CREAM, 0.5), 1);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(INK, 0.85);
  ctx.stroke();
  const a0 = Math.atan2(dy, dx);
  for (let i = -1; i <= 1; i++) {
    const a = a0 + i * 0.42;
    const bx = tip.x + Math.cos(a) * 8;
    const by = tip.y + Math.sin(a) * 8;
    brushStroke(ctx, [v(bx, by), v(bx + Math.cos(a + 0.5) * 9, by + Math.sin(a + 0.5) * 9), v(bx + Math.cos(a + 1.2) * 13, by + Math.sin(a + 1.2) * 12)], {
      width: 3.4,
      color: INK,
      alpha: 0.95,
      dryness: 0.2,
      taperIn: 0.05,
      taperOut: 0.95,
      seed: seed + 10 + i,
    });
  }
}

/** 다리를 가로지르는 줄무늬 */
function stripesOn(ctx: Ctx, seg: [Vec, Vec] | Vec[], n: number, far: boolean, seed: number): void {
  const [a, b] = seg;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.6) / (n + 0.4);
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    brushStroke(ctx, [v(cx - nx * 7, cy - ny * 7), v(cx + nx * 1 + dx / l * 3, cy + ny * 1 + dy / l * 3)], {
      width: 3.4,
      color: INK,
      alpha: far ? 0.45 : 0.8,
      dryness: 0.45,
      taperIn: 0.1,
      taperOut: 0.85,
      seed: seed + i,
    });
  }
}

/* ───────── 꼬리 ───────── */

function tail(ctx: Ctx, root: Vec, p: Pose, seed: number): void {
  const sw = p.sway * 6;
  const up = p.raise;
  const pts: Vec[] = [
    root,
    v(root.x - 16, root.y + 6 - up * 6),
    v(root.x - 32 + sw * 0.3, root.y + 2 - up * 16),
    v(root.x - 44 + sw * 0.6, root.y - 14 - up * 26),
    v(root.x - 42 + sw, root.y - 32 - up * 30),
    v(root.x - 32 + sw * 1.3, root.y - 42 - up * 30),
  ];
  brushStroke(ctx, pts, { width: 10.5, color: INK, alpha: 0.9, dryness: 0.35, taperIn: 0.02, taperOut: 0.5, seed });
  brushStroke(ctx, pts.slice(0, 5), { width: 7, color: OCHRE, alpha: 1, dryness: 0.15, taperIn: 0.02, taperOut: 0.3, seed: seed + 1, wet: 0 });
  // 고리 무늬와 검은 꼬리 끝
  for (let i = 1; i < 5; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    brushStroke(ctx, [v(cx - (dy / l) * 5, cy + (dx / l) * 5), v(cx + (dy / l) * 5, cy - (dx / l) * 5)], { width: 4.2, color: INK, alpha: 0.9, dryness: 0.3, taperIn: 0.1, taperOut: 0.3, seed: seed + 5 + i });
  }
  brushStroke(ctx, pts.slice(4), { width: 8, color: INK, alpha: 0.95, dryness: 0.3, taperIn: 0.1, taperOut: 0.9, seed: seed + 12 });
}

/* ───────── 머리 ───────── */

function head(ctx: Ctx, c: Vec, p: Pose, seed: number): void {
  ctx.save();
  ctx.translate(c.x + p.hx, c.y + p.hy);
  ctx.rotate(-p.tilt * 0.6 + p.ht);
  ctx.scale(HEAD_SCALE, HEAD_SCALE);
  const m = p.mouth;

  // 갈기 같은 볼털 — 뒤로 뻗친다
  for (let i = 0; i < 7; i++) {
    const a = 1.6 + i * 0.32;
    const r0 = 15;
    const len = 12 + (i % 2) * 5 + p.bristle * 6;
    brushStroke(ctx, [v(Math.cos(a) * r0, Math.sin(a) * r0 * 0.9 + 4), v(Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len) * 0.85 + 6)], {
      width: 7,
      color: i % 2 ? CREAM : mix(OCHRE, CREAM, 0.4),
      alpha: 1,
      dryness: 0.35,
      taperIn: 0.1,
      taperOut: 0.85,
      seed: seed + i,
    });
  }

  // 귀 — 먼 귀, 가까운 귀
  for (const [ex, ey, r, far] of [
    [8, -19, 6.5, true],
    [-7, -18, 7.5, false],
  ] as [number, number, number, boolean][]) {
    ctx.beginPath();
    ctx.ellipse(ex, ey, r, r * 1.05, 0, 0, TAU);
    ctx.fillStyle = rgba(far ? farTone(OCHRE) : OCHRE, 1);
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = rgba(INK, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(ex + 0.5, ey + 1, r * 0.55, r * 0.6, 0, 0, TAU);
    ctx.fillStyle = rgba(far ? mix(CREAM, DAMMUK, 0.3) : CREAM, 1);
    ctx.fill();
  }

  // 아래턱 — 입을 벌리면 내려간다
  const jaw = m * 0.72;
  ctx.save();
  ctx.translate(6, 8);
  ctx.rotate(jaw);
  if (m > 0.05) {
    // 입 안
    ctx.beginPath();
    ctx.moveTo(-4, -2);
    ctx.quadraticCurveTo(12, -6, 26, -4);
    ctx.quadraticCurveTo(22, 8, 4, 8);
    ctx.closePath();
    ctx.fillStyle = rgba(MOUTH, 1);
    ctx.fill();
    // 혀
    ctx.beginPath();
    ctx.ellipse(10, 4, 8, 3, 0.1, 0, TAU);
    ctx.fillStyle = rgba([206, 104, 96], 1);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.quadraticCurveTo(10, 3, 24, 1);
  ctx.quadraticCurveTo(22, 9, 8, 11);
  ctx.quadraticCurveTo(-4, 10, -6, 0);
  ctx.fillStyle = rgba(CREAM, 1);
  ctx.fill();
  brushStroke(ctx, [v(-4, 9), v(8, 11.5), v(21, 6)], { width: 2.2, color: INK, alpha: 0.8, dryness: 0.4, taperIn: 0.2, taperOut: 0.4, seed: seed + 20 });
  if (m > 0.05) {
    // 아랫니
    for (const tx of [19, 9]) tooth(ctx, tx, 0.5, -1, 4 + m * 2);
  }
  ctx.restore();

  // 얼굴 — 넓적한 머리
  ctx.beginPath();
  ctx.moveTo(-18, 2);
  ctx.bezierCurveTo(-20, -14, -8, -24, 6, -23);
  ctx.bezierCurveTo(20, -22, 28, -12, 30, -2);
  ctx.bezierCurveTo(31, 6, 26, 10, 18, 10);
  ctx.bezierCurveTo(8, 12, -2, 14, -10, 12);
  ctx.bezierCurveTo(-16, 10, -18, 6, -18, 2);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -24, 0, 12);
  g.addColorStop(0, rgba(mix(OCHRE, OCHRE_DEEP, 0.3), 1));
  g.addColorStop(0.55, rgba(OCHRE, 1));
  g.addColorStop(1, rgba(mix(OCHRE, CREAM, 0.6), 1));
  ctx.fillStyle = g;
  ctx.fill();
  brushStroke(ctx, [v(-18, 4), v(-19, -10), v(-8, -22), v(8, -23), v(22, -18), v(29, -6)], { width: 2.8, color: INK, alpha: 0.9, dryness: 0.4, taperIn: 0.1, taperOut: 0.2, seed: seed + 30 });

  // 흰 볼과 주둥이
  ctx.beginPath();
  ctx.ellipse(17, 3, 12, 8.5, -0.1, 0, TAU);
  ctx.fillStyle = rgba(CREAM, 1);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-4, 6, 9, 6.5, 0.2, 0, TAU);
  ctx.fillStyle = rgba(mix(CREAM, OCHRE, 0.15), 1);
  ctx.fill();

  // 이마의 王 — 가운데 세로획 하나에 가로 셋
  const wx = 6;
  const wy = -15;
  for (const [dy, w] of [
    [-4.5, 9],
    [0, 7],
    [4.5, 10],
  ] as [number, number][]) {
    brushStroke(ctx, [v(wx - w / 2, wy + dy), v(wx + w / 2, wy + dy - 0.6)], { width: 2.4, color: INK, alpha: 0.92, dryness: 0.3, taperIn: 0.15, taperOut: 0.35, seed: seed + 40 + dy });
  }
  brushStroke(ctx, [v(wx + 0.3, wy - 5), v(wx, wy + 5)], { width: 2.2, color: INK, alpha: 0.92, dryness: 0.3, taperIn: 0.1, taperOut: 0.3, seed: seed + 45 });
  // 이마와 볼의 줄무늬
  for (const [x0, y0, x1, y1, w] of [
    [-12, -16, -5, -10, 3.2],
    [24, -16, 18, -10, 3],
    [-16, -4, -8, -2, 3],
    [-17, 2, -9, 3, 2.6],
    [27, -6, 22, -4, 2.4],
  ] as [number, number, number, number, number][]) {
    brushStroke(ctx, [v(x0, y0), v(x1, y1)], { width: w, color: INK, alpha: 0.85, dryness: 0.4, taperIn: 0.1, taperOut: 0.85, seed: seed + 50 + x0 });
  }

  // 둥근 눈 — 까치호랑이처럼 크게 뜬다
  eye(ctx, 0, -6, 6.2, seed + 60, m);
  eye(ctx, 17, -7, 5, seed + 61, m);

  // 코와 콧등
  brushStroke(ctx, [v(9, -9), v(16, -1), v(22, 2)], { width: 2, color: mix(INK, OCHRE_DEEP, 0.3), alpha: 0.6, dryness: 0.5, taperIn: 0.2, taperOut: 0.2, seed: seed + 70 });
  ctx.beginPath();
  ctx.moveTo(21, -1);
  ctx.quadraticCurveTo(28, -2.5, 29, 1);
  ctx.quadraticCurveTo(26, 5, 23, 4);
  ctx.closePath();
  ctx.fillStyle = rgba([120, 70, 56], 1);
  ctx.fill();
  dot(ctx, 25, 0, 1.2, INK, 0.8, seed + 71);
  // 윗입술과 송곳니
  brushStroke(ctx, [v(25, 4), v(22, 8.5), v(16, 9), v(11, 7.5)], { width: 2, color: INK, alpha: 0.85, dryness: 0.35, taperIn: 0.2, taperOut: 0.4, seed: seed + 72 });
  if (m > 0.05) for (const tx of [21, 11]) tooth(ctx, tx, 8, 1, 5 + m * 3);
  // 수염 — 가늘고 길게
  for (let i = 0; i < 4; i++) {
    const y = 4 + i * 1.8;
    brushStroke(ctx, [v(20, y), v(34 + i * 2, y - 3 + i * 2.2), v(46 + i * 3, y - 2 + i * 4.5)], { width: 0.9, color: INK, alpha: 0.55, dryness: 0.2, taperIn: 0.05, taperOut: 0.9, seed: seed + 80 + i });
    dot(ctx, 15 + (i % 2) * 3, 4 + i * 1.4, 0.8, INK, 0.6, seed + 90 + i);
  }
  ctx.restore();
}

function eye(ctx: Ctx, x: number, y: number, r: number, seed: number, rage: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.95, 0, 0, TAU);
  ctx.fillStyle = rgba(PAPER_LIGHT, 1);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + r * 0.12, y + r * 0.05, r * 0.78, r * 0.76, 0, 0, TAU);
  ctx.fillStyle = rgba(EYE, 1);
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, r * 0.3);
  ctx.strokeStyle = rgba(INK, 0.95);
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.95, 0, 0, TAU);
  ctx.stroke();
  // 성나면 눈동자가 작아진다
  dot(ctx, x + r * 0.2, y + r * 0.08, r * (0.42 - rage * 0.12), INK, 1, seed);
  dot(ctx, x - r * 0.18, y - r * 0.3, r * 0.16, PAPER_LIGHT, 0.95, seed + 1);
  // 눈썹 — 성난 붓질
  brushStroke(ctx, [v(x - r * 1.1, y - r * 1.2), v(x + r * 0.9, y - r * 0.85 + rage * 1.5)], { width: r * 0.55, color: INK, alpha: 0.9, dryness: 0.25, taperIn: 0.1, taperOut: 0.6, seed: seed + 2 });
}

function tooth(ctx: Ctx, x: number, y: number, dir: 1 | -1, len: number): void {
  ctx.beginPath();
  ctx.moveTo(x - 2.2, y);
  ctx.lineTo(x + 2.2, y);
  ctx.lineTo(x + 0.3, y + dir * len);
  ctx.closePath();
  ctx.fillStyle = rgba(PAPER_LIGHT, 1);
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = rgba(INK, 0.6);
  ctx.stroke();
}
