/**
 * GPU 붓질 묶음. 한 프레임의 모든 동적 획(휘두르기, 대시 자국, 덩굴, 불꽃…)을
 * 하나의 메시로 모아 한 번에 그린다. 붓털 결과 비백, 번짐은 프래그먼트 셰이더가 만든다.
 */
import { Buffer, BufferUsage, Geometry, GlProgram, Mesh, Shader } from 'pixi.js';
import { type Vec, clamp, easeOutSine } from '../core/math';
import type { RGB } from '../render/color';
import { MESH_VERTEX_HEADER, NOISE_GLSL } from './glsl';

/** 정점 하나: 위치2 + uv2 + 색4 + 붓 매개변수4 + 보조4 = 16 float */
const STRIDE = 16;
/** 획 둘레로 번짐을 그릴 여유 폭(몸통 폭 대비) */
const MARGIN = 1.45;

const vertex = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
in vec4 aColor;
in vec4 aParams;
in vec4 aExtra;
out vec2 vUV;
out vec4 vColor;
out vec4 vParams;
out vec4 vExtra;
${MESH_VERTEX_HEADER}
void main() {
  gl_Position = toClip(aPosition);
  vUV = aUV;
  vColor = aColor;
  vParams = aParams;
  vExtra = aExtra;
}
`;

const fragment = /* glsl */ `
in vec2 vUV;
in vec4 vColor;
in vec4 vParams;
in vec4 vExtra;
out vec4 finalColor;
${NOISE_GLSL}
void main() {
  float along = vUV.x;            // 획 시작부터의 거리(px)
  float across = vUV.y;           // 획 폭 방향 -MARGIN..MARGIN, |1|이 몸통 가장자리
  float dry = vParams.x;
  float seed = vParams.y;
  float L = max(vParams.z, 1.0);
  float wet = vParams.w;
  float bristles = vExtra.x;
  float edgeInk = vExtra.y;       // 가장자리가 짙어지는 정도
  float t = along / L;
  float a = abs(across);

  // 종이결에 걸려 들쭉날쭉한 가장자리
  float rag = fbm3(vec2(along * 0.035 + seed * 7.0, across * 1.1 + seed));
  float fiber = vnoise(vec2(along * 0.45, across * 9.0 + seed)) - 0.5;
  float edge = 0.92 + (rag - 0.5) * 0.38 + fiber * 0.08;
  float body = 1.0 - smoothstep(edge - 0.2, edge + 0.05, a);

  // 붓털 하나하나의 먹 머금은 양
  float b = (across * 0.5 + 0.5) * bristles;
  float id = floor(b);
  float cap = hash12(vec2(id, seed * 3.1));
  float streak = vnoise(vec2(b * 1.3, along * 0.012 + seed * 5.0));
  float left = 1.0 - dry * (t * (0.7 + 1.1 * (1.0 - cap)) + 0.35 * (1.0 - cap));
  float fly = smoothstep(0.0, 0.22, left + (streak - 0.5) * 0.9 * dry);
  float density = body * mix(1.0, fly, clamp(dry * 1.5, 0.0, 1.0));

  // 붓털 사이 틈과 가는 결
  float gapLine = smoothstep(0.0, 0.35, abs(fract(b) - 0.5) * 2.0);
  float fine = vnoise(vec2(b * 3.1, along * 0.045 + seed));
  density *= mix(1.0, 0.5 + 0.5 * gapLine, dry * 0.75) * (1.0 - (0.3 * (0.4 + dry)) * (1.0 - fine));

  // 먹의 농담 — 획 머리에 먹이 고이고 꼬리로 갈수록 옅어진다
  float pool = vnoise(vec2(along * 0.018 + seed, across * 0.6));
  density *= mix(1.18, 0.78, t * (0.4 + dry)) * (0.8 + 0.4 * pool);

  // 먹이 가장자리로 몰려 짙어진다
  float rim = smoothstep(edge - 0.42, edge - 0.04, a) * body;
  density *= mix(1.0, 0.8, clamp(edgeInk * 3.0, 0.0, 1.0)) * (1.0 + edgeInk * 1.6 * rim);

  // 획 바깥으로 스미는 번짐
  float bleed = (1.0 - smoothstep(edge, edge + 0.45, a)) * (1.0 - body);
  bleed *= wet * 0.28 * (0.6 + 0.8 * vnoise(vec2(along * 0.05, across * 3.0 + seed)));

  float alpha = clamp(density + bleed, 0.0, 1.0) * vColor.a;
  // 밝은 안료(호분)는 가장자리에 회색 테가 생겨 종이 위에서도 보인다
  vec3 col = mix(vColor.rgb, vColor.rgb * 0.5, rim * smoothstep(0.6, 0.95, dot(vColor.rgb, vec3(0.333))) * 0.9);
  finalColor = vec4(col * alpha, alpha);
}
`;

/** 곡선을 다시 찍을 때 쓰는 작업 공간 — 매 프레임 수백 개의 획이 지나가니 새로 만들지 않는다 */
let PX = new Float64Array(1024);
let PY = new Float64Array(1024);

/** 담아 둔 점은 그대로 둔 채 자리를 늘린다 */
function reserve(n: number): void {
  if (n <= PX.length) return;
  const size = Math.max(n, PX.length * 2);
  const nx = new Float64Array(size);
  const ny = new Float64Array(size);
  nx.set(PX);
  ny.set(PY);
  PX = nx;
  PY = ny;
}

/**
 * 조절점을 캣멀롬 곡선으로 잇고 일정한 간격으로 다시 찍어 PX, PY에 담는다.
 * render/brush.ts의 smoothPath와 같은 결과를 객체 없이 만든다. 찍은 점의 수를 돌려준다.
 */
function resample(pts: readonly Vec[], spacing: number): number {
  const m = pts.length;
  const SUB = 10;
  reserve(Math.ceil(((m - 1) * SUB + 1) * 1.2) + 64);
  let n = 0;
  PX[n] = pts[0].x;
  PY[n] = pts[0].y;
  n++;
  let ax = pts[0].x;
  let ay = pts[0].y;
  let acc = 0;
  const visit = (bx: number, by: number): void => {
    let seg = Math.hypot(bx - ax, by - ay);
    while (acc + seg >= spacing && seg > 0) {
      const t = (spacing - acc) / seg;
      ax += (bx - ax) * t;
      ay += (by - ay) * t;
      if (n >= PX.length) reserve(n * 2);
      PX[n] = ax;
      PY[n] = ay;
      n++;
      seg = Math.hypot(bx - ax, by - ay);
      acc = 0;
    }
    acc += seg;
    ax = bx;
    ay = by;
  };
  for (let i = 0; i < m - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(m - 1, i + 2)];
    // 첫 칸(s=0)은 앞 점 자체이므로 i=0일 때만 시작점이 된다(이미 넣었다)
    for (let k = i === 0 ? 1 : 0; k < SUB; k++) {
      const t = k / SUB;
      const t2 = t * t;
      const t3 = t2 * t;
      visit(
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      );
    }
  }
  const lx = pts[m - 1].x;
  const ly = pts[m - 1].y;
  visit(lx, ly);
  if (n >= PX.length) reserve(n + 1);
  if (Math.hypot(PX[n - 1] - lx, PY[n - 1] - ly) > spacing * 0.3) {
    PX[n] = lx;
    PY[n] = ly;
    n++;
  }
  return n;
}

export interface GpuStroke {
  width: number;
  color: RGB;
  alpha?: number;
  dryness?: number;
  wet?: number;
  taperIn?: number;
  taperOut?: number;
  seed?: number;
  /** 0..1 — 획의 앞부분만 그린다 */
  progress?: number;
  edgeInk?: number;
  bristles?: number;
  roughness?: number;
}

export class StrokeBatch {
  readonly mesh: Mesh<Geometry, Shader>;
  private readonly geometry: Geometry;
  private vdata: Float32Array;
  private idata: Uint32Array;
  private readonly vbuf: Buffer;
  private readonly ibuf: Buffer;
  private verts = 0;
  private indices = 0;

  constructor(capacityVerts = 40000) {
    this.vdata = new Float32Array(capacityVerts * STRIDE);
    this.idata = new Uint32Array(capacityVerts * 3);
    this.vbuf = new Buffer({ data: this.vdata, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
    this.ibuf = new Buffer({ data: this.idata, usage: BufferUsage.INDEX | BufferUsage.COPY_DST });
    const B = 4 * STRIDE;
    this.geometry = new Geometry({
      attributes: {
        aPosition: { buffer: this.vbuf, format: 'float32x2', stride: B, offset: 0 },
        aUV: { buffer: this.vbuf, format: 'float32x2', stride: B, offset: 8 },
        aColor: { buffer: this.vbuf, format: 'float32x4', stride: B, offset: 16 },
        aParams: { buffer: this.vbuf, format: 'float32x4', stride: B, offset: 32 },
        aExtra: { buffer: this.vbuf, format: 'float32x4', stride: B, offset: 48 },
      },
      indexBuffer: this.ibuf,
    });
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex, fragment, name: 'ink-stroke', preferredFragmentPrecision: 'highp' }),
      resources: {},
    });
    this.mesh = new Mesh({ geometry: this.geometry, shader });
  }

  begin(): void {
    this.verts = 0;
    this.indices = 0;
  }

  private ensure(extraVerts: number): void {
    const needV = (this.verts + extraVerts) * STRIDE;
    if (needV <= this.vdata.length) return;
    const nv = new Float32Array(Math.max(needV, this.vdata.length * 2));
    nv.set(this.vdata);
    this.vdata = nv;
    const ni = new Uint32Array((nv.length / STRIDE) * 3);
    ni.set(this.idata);
    this.idata = ni;
    this.vbuf.data = this.vdata;
    this.ibuf.data = this.idata;
  }

  stroke(pts: readonly Vec[], s: GpuStroke): void {
    const width = s.width;
    if (width <= 0.2 || pts.length < 2) return;
    const total = resample(pts, Math.max(1.5, Math.min(6, width * 0.22)));
    if (total < 2) return;
    const n = s.progress === undefined ? total : Math.max(2, Math.ceil(total * clamp(s.progress, 0, 1)));
    const X = PX;
    const Y = PY;

    let L = 0;
    for (let i = 1; i < total; i++) L += Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);

    this.ensure(n * 2);
    const tin = s.taperIn ?? 0.12;
    const tout = s.taperOut ?? 0.32;
    const seed = s.seed ?? 1;
    const rough = s.roughness ?? 0.5;
    const ph = (seed % 97) * 0.37;
    const [r, g, b] = s.color;
    const alpha = s.alpha ?? 1;
    const dry = s.dryness ?? 0.25;
    const wet = s.wet ?? 0.35;
    const bristles = s.bristles ?? clamp(width / 2.6, 4, 16);
    const edgeInk = s.edgeInk ?? 0.35;
    const seedF = (seed % 1000) * 0.618;

    const v = this.vdata;
    const base = this.verts;
    let along = 0;
    for (let i = 0; i < n; i++) {
      const t = i / (total - 1);
      if (i > 0) along += Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
      let pr = 1;
      if (tin > 0 && t < tin) pr *= 0.22 + 0.78 * easeOutSine(t / tin);
      if (tout > 0 && t > 1 - tout) pr *= 0.05 + 0.95 * Math.pow((1 - t) / tout, 0.85);
      const wob = 1 + rough * 0.12 * (Math.sin(i * 0.55 + ph) + 0.5 * Math.sin(i * 1.7 + ph * 2.3));
      const half = width * 0.5 * pr * wob * MARGIN;
      const ia = Math.max(0, i - 1);
      const ic = Math.min(total - 1, i + 1);
      const dx = X[ic] - X[ia];
      const dy = Y[ic] - Y[ia];
      const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l;
      const ny = dx / l;
      const px = X[i];
      const py = Y[i];
      for (let side = -1; side <= 1; side += 2) {
        const o = (base + i * 2 + (side + 1) / 2) * STRIDE;
        v[o] = px + nx * half * side;
        v[o + 1] = py + ny * half * side;
        v[o + 2] = along;
        v[o + 3] = side * MARGIN;
        v[o + 4] = r / 255;
        v[o + 5] = g / 255;
        v[o + 6] = b / 255;
        v[o + 7] = alpha;
        v[o + 8] = dry;
        v[o + 9] = seedF;
        v[o + 10] = L;
        v[o + 11] = wet;
        v[o + 12] = bristles;
        v[o + 13] = edgeInk;
        v[o + 14] = 0;
        v[o + 15] = 0;
      }
    }
    const idx = this.idata;
    let k = this.indices;
    for (let i = 0; i < n - 1; i++) {
      const a0 = base + i * 2;
      idx[k++] = a0;
      idx[k++] = a0 + 1;
      idx[k++] = a0 + 2;
      idx[k++] = a0 + 1;
      idx[k++] = a0 + 3;
      idx[k++] = a0 + 2;
    }
    this.indices = k;
    this.verts += n * 2;
  }

  end(): void {
    this.mesh.visible = this.indices > 0;
    if (!this.indices) return;
    this.vbuf.update(this.verts * STRIDE * 4);
    this.ibuf.update(this.indices * 4);
    this.geometry.indexCount = this.indices;
  }
}
