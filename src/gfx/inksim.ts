/**
 * 먹 번짐 시뮬레이션.
 * 그림 바탕에 떨어진 먹은 물을 머금고 있어서, 마를 때까지 종이 섬유를 따라 퍼지고
 * 물이 마르는 가장자리 쪽으로 안료가 밀려 테두리가 짙어진다(커피 얼룩과 같은 원리).
 * 안료(P)와 물(W)을 각각 두 장의 텍스처로 번갈아 쓰며 GPU에서 계산한다.
 */
import {
  Container,
  GlProgram,
  Mesh,
  MeshGeometry,
  type Renderer,
  RenderTexture,
  Shader,
  Sprite,
  type TEXTURE_FORMATS,
  type Texture,
  type WebGLRenderer,
} from 'pixi.js';
import type { Stamp } from '../game/types';
import type { Atlas } from './atlas';
import { BAKE } from './atlas';
import { BLOB_R, BLOB_VARIANTS, SPLAT_R, SPLAT_VARIANTS } from './assets';
import { MESH_VERTEX_HEADER } from './glsl';
import { PAPER_FX_DECODE } from './paperfx';

/** 세계 1단위당 시뮬레이션 칸 수 */
const SIM_RES = 0.5;
/** 한 프레임에 몇 번 흘릴지 */
const STEPS_PER_FRAME = 2;
/** 마지막 먹이 떨어진 뒤 이만큼 지나면 그 칸은 계산을 쉰다(초) — 물은 2초 안에 다 마른다 */
const WET_HOLD = 4;
/** 젖은 곳만 계산하려고 세계를 이 크기의 칸으로 나눈다 */
const TILE = 200;

const toHex = (c: readonly number[]): number => ((c[0] & 255) << 16) | ((c[1] & 255) << 8) | (c[2] & 255);

const vertex = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
${MESH_VERTEX_HEADER}
void main() {
  gl_Position = toClip(aPosition);
  vUV = aUV;
}
`;

const COMMON = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uP;
uniform sampler2D uW;
`;

/** 물: 젖은 곳에서 마른 곳으로 천천히 번지고, 가장자리부터 마른다 */
const waterFrag = /* glsl */ `
${COMMON}
uniform vec2 uTexel;
uniform sampler2D uFx;
${PAPER_FX_DECODE}
void main() {
  float w = texture(uW, vUV).r;
  // 종이마다 물을 빨아들이는 정도가 다르다 — 섬유 방향으로 길쭉한 얼룩(미리 구워 둔 것)
  float pm = fxPerm(texture(uFx, vUV));
  float sum = texture(uW, vUV + vec2(uTexel.x, 0.0)).r + texture(uW, vUV - vec2(uTexel.x, 0.0)).r
            + texture(uW, vUV + vec2(0.0, uTexel.y)).r + texture(uW, vUV - vec2(0.0, uTexel.y)).r;
  float acc = (sum - 4.0 * w) * 0.2 * pm;
  float edge = 1.0 - smoothstep(0.0, 0.12, w);
  float evap = 0.004 + 0.012 * edge;
  float nw = max(0.0, w + acc - evap);
  finalColor = vec4(nw, 0.0, 0.0, 1.0);
}
`;

/** 안료: 젖은 곳끼리는 섞이고, 마르는 쪽으로 밀려간다 */
const pigmentFrag = /* glsl */ `
${COMMON}
uniform vec2 uTexel;
uniform float uFade;

vec4 flow(vec4 p, float w, vec2 o) {
  vec4 pn = texture(uP, vUV + o);
  float wn = texture(uW, vUV + o).r;
  float both = smoothstep(0.004, 0.06, min(w, wn));
  vec4 acc = both * 0.16 * (pn - p);
  // 모세관 흐름 — 더 젖은 쪽에서 덜 젖은 쪽으로 안료가 실려 간다
  if (wn > w && w > 0.004) acc += 0.22 * min(wn - w, 0.5) * pn;
  if (wn < w && wn > 0.004) acc -= 0.22 * min(w - wn, 0.5) * p;
  return acc;
}

void main() {
  vec4 p = texture(uP, vUV);
  float w = texture(uW, vUV).r;
  if (w < 0.004 && uFade > 0.999) {
    finalColor = p;
    return;
  }
  vec4 acc = flow(p, w, vec2(uTexel.x, 0.0)) + flow(p, w, vec2(-uTexel.x, 0.0))
           + flow(p, w, vec2(0.0, uTexel.y)) + flow(p, w, vec2(0.0, -uTexel.y));
  finalColor = max(p + acc, vec4(0.0)) * uFade;
}
`;

interface Pass {
  mesh: Mesh<MeshGeometry, Shader>;
  stage: Container;
  uniforms: Record<string, unknown>;
}

export class InkSim {
  /** 그림에 놓을 결과 — 안료 텍스처 */
  readonly sprite: Sprite;
  private P: [RenderTexture, RenderTexture];
  private W: [RenderTexture, RenderTexture];
  private cur = 0;
  private readonly water: Pass;
  private readonly pigment: Pass;
  private readonly stampLayer = new Container();
  private readonly stampPool: Sprite[] = [];
  /** 칸마다 남은 젖음 시간 */
  private readonly wet: Float32Array;
  private readonly cols: number;
  private readonly rows: number;
  private readonly geometries: MeshGeometry[] = [];
  private activeKey = '';
  private fadeNext = 1;
  readonly floatOk: boolean;

  constructor(
    private readonly renderer: Renderer,
    private readonly atlas: Atlas,
    private readonly worldW: number,
    private readonly worldH: number,
    private readonly paperFx: Texture,
  ) {
    const gl = renderer as WebGLRenderer;
    this.floatOk = !!gl.context?.extensions?.colorBufferFloat;
    const format: TEXTURE_FORMATS = this.floatOk ? 'rgba16float' : 'rgba8unorm';
    const make = (): RenderTexture => RenderTexture.create({ width: worldW, height: worldH, resolution: SIM_RES, format, scaleMode: 'linear' });
    this.P = [make(), make()];
    this.W = [make(), make()];
    const empty = new Container();
    for (const t of [...this.P, ...this.W]) renderer.render({ container: empty, target: t, clear: true, clearColor: [0, 0, 0, 0] });

    this.cols = Math.ceil(worldW / TILE);
    this.rows = Math.ceil(worldH / TILE);
    this.wet = new Float32Array(this.cols * this.rows);
    const texel = new Float32Array([1 / (worldW * SIM_RES), 1 / (worldH * SIM_RES)]);
    this.water = this.makePass(waterFrag, 'ink-sim-water', {
      uTexel: { value: texel, type: 'vec2<f32>' },
    });
    this.pigment = this.makePass(pigmentFrag, 'ink-sim-pigment', {
      uTexel: { value: texel, type: 'vec2<f32>' },
      uFade: { value: 1, type: 'f32' },
    });
    this.sprite = new Sprite(this.P[0]);
  }

  private makePass(fragment: string, name: string, uniforms: Record<string, { value: unknown; type: string }>): Pass {
    // 칸마다 사각형 하나 — 쉬는 칸은 넓이 0으로 접어 둔다
    const n = Math.ceil(this.worldW / TILE) * Math.ceil(this.worldH / TILE);
    const indices = new Uint32Array(n * 6);
    for (let i = 0; i < n; i++) indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    const geometry = new MeshGeometry({ positions: new Float32Array(n * 8), uvs: new Float32Array(n * 8), indices });
    this.geometries.push(geometry);
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex, fragment, name, preferredFragmentPrecision: 'highp' }),
      resources: {
        uP: this.P[0].source,
        uW: this.W[0].source,
        uFx: this.paperFx.source,
        simUniforms: uniforms,
      },
    });
    const mesh = new Mesh({ geometry, shader });
    // 칸만 덮어쓰고 나머지는 그대로 두므로 섞지 않고 바로 쓴다
    mesh.blendMode = 'none';
    const stage = new Container();
    stage.addChild(mesh);
    return { mesh, stage, uniforms: shader.resources.simUniforms.uniforms };
  }

  apply(stamps: Stamp[]): void {
    if (!stamps.length) return;
    let i = 0;
    for (const s of stamps) {
      let sp = this.stampPool[i];
      if (!sp) {
        sp = new Sprite();
        this.stampPool.push(sp);
        this.stampLayer.addChild(sp);
      }
      sp.visible = true;
      const isSplat = s.kind === 'splat';
      const f = this.atlas.get(isSplat ? `splat/${s.seed % SPLAT_VARIANTS}` : `blob/${s.seed % BLOB_VARIANTS}`);
      sp.texture = f.texture;
      sp.anchor.set(f.ax, f.ay);
      const k = s.r / (isSplat ? SPLAT_R : BLOB_R) / BAKE;
      sp.scale.set(k * (s.seed & 1 ? -1 : 1), k * (isSplat ? 0.8 : 0.72));
      sp.position.set(s.x, s.y);
      sp.tint = toHex(s.color);
      sp.alpha = s.alpha;
      i++;
    }
    for (let k = i; k < this.stampPool.length; k++) this.stampPool[k].visible = false;
    // 쉬는 칸은 계산하지 않으니, 두 장 모두에 똑같이 찍어 두어야 번갈아 보여도 같다
    for (const t of this.P) this.renderer.render({ container: this.stampLayer, target: t, clear: false });

    // 같은 자리에 물도 붓는다
    let any = false;
    for (let k = 0; k < i; k++) {
      const s = stamps[k];
      const sp = this.stampPool[k];
      sp.tint = 0xffffff;
      sp.alpha = Math.min(1, s.wet * 0.9);
      if (s.wet > 0) any = true;
      else sp.visible = false;
    }
    if (any) {
      for (const t of this.W) this.renderer.render({ container: this.stampLayer, target: t, clear: false });
      for (const s of stamps) if (s.wet > 0) this.wetArea(s.x, s.y, s.r * 1.3 + 70);
    }
  }

  /** 먹물이 떨어진 둘레의 칸들을 깨운다(번져 나갈 자리까지) */
  private wetArea(x: number, y: number, r: number): void {
    const c0 = Math.max(0, Math.floor((x - r) / TILE));
    const c1 = Math.min(this.cols - 1, Math.floor((x + r) / TILE));
    const r0 = Math.max(0, Math.floor((y - r) / TILE));
    const r1 = Math.min(this.rows - 1, Math.floor((y + r) / TILE));
    for (let row = r0; row <= r1; row++) for (let c = c0; c <= c1; c++) this.wet[row * this.cols + c] = WET_HOLD;
  }

  /** 계산할 칸들로 사각형을 다시 짠다. 바래기는 그림 전체에 걸어야 하니 모든 칸을 편다 */
  private layoutTiles(all: boolean): boolean {
    let key = all ? 'all' : '';
    let any = all;
    if (!all) {
      for (let i = 0; i < this.wet.length; i++) {
        if (this.wet[i] > 0) {
          key += `${i},`;
          any = true;
        }
      }
    }
    if (!any || key === this.activeKey) return any;
    this.activeKey = key;
    const W = this.worldW;
    const H = this.worldH;
    for (const g of this.geometries) {
      const pos = g.positions;
      const uv = g.uvs;
      for (let i = 0; i < this.wet.length; i++) {
        const o = i * 8;
        if (!all && this.wet[i] <= 0) {
          pos.fill(0, o, o + 8);
          uv.fill(0, o, o + 8);
          continue;
        }
        const x0 = (i % this.cols) * TILE;
        const y0 = Math.floor(i / this.cols) * TILE;
        const x1 = Math.min(W, x0 + TILE);
        const y1 = Math.min(H, y0 + TILE);
        pos.set([x0, y0, x1, y0, x1, y1, x0, y1], o);
        uv.set([x0 / W, y0 / H, x1 / W, y0 / H, x1 / W, y1 / H, x0 / W, y1 / H], o);
      }
      g.positions = pos;
      g.uvs = uv;
    }
    return true;
  }

  /** 새 방 — 먹 자국과 물기를 모두 걷어 낸다 */
  clear(): void {
    const empty = new Container();
    for (const t of [...this.P, ...this.W]) this.renderer.render({ container: empty, target: t, clear: true, clearColor: [0, 0, 0, 0] });
    this.wet.fill(0);
    this.fadeNext = 1;
  }

  /** 지금 먹 자국 텍스처 */
  get texture(): RenderTexture {
    return this.P[this.cur];
  }

  /** 물결이 끝나면 먹 자국이 조금 바랜다 */
  fade(amount: number): void {
    this.fadeNext = 1 - amount;
  }

  step(dt: number): void {
    // 쉬는 칸은 두 장의 텍스처가 이미 같은 값이라 건드리지 않아도 된다
    if (!this.layoutTiles(this.fadeNext < 1)) return;
    for (let i = 0; i < this.wet.length; i++) this.wet[i] -= dt;
    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      const a = this.cur;
      const b = 1 - a;
      // 물
      this.water.mesh.shader!.resources.uW = this.W[a].source;
      this.renderer.render({ container: this.water.stage, target: this.W[b], clear: false });
      // 안료 (새로 흐른 물을 기준으로)
      const sh = this.pigment.mesh.shader!;
      sh.resources.uP = this.P[a].source;
      sh.resources.uW = this.W[b].source;
      this.pigment.uniforms.uFade = i === 0 ? this.fadeNext : 1;
      this.renderer.render({ container: this.pigment.stage, target: this.P[b], clear: false });
      this.cur = b;
    }
    this.fadeNext = 1;
    this.sprite.texture = this.P[this.cur];
  }
}
