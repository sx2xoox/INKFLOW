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
  type WebGLRenderer,
} from 'pixi.js';
import type { Stamp } from '../game/types';
import type { Atlas } from './atlas';
import { BAKE } from './atlas';
import { BLOB_R, BLOB_VARIANTS, SPLAT_R, SPLAT_VARIANTS } from './assets';
import { MESH_VERTEX_HEADER, NOISE_GLSL } from './glsl';

/** 세계 1단위당 시뮬레이션 칸 수 */
const SIM_RES = 0.5;
/** 한 프레임에 몇 번 흘릴지 */
const STEPS_PER_FRAME = 2;
/** 마지막 먹이 떨어진 뒤 이만큼 지나면 계산을 쉰다(초) */
const WET_HOLD = 4;

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
${NOISE_GLSL}
`;

/** 물: 젖은 곳에서 마른 곳으로 천천히 번지고, 가장자리부터 마른다 */
const waterFrag = /* glsl */ `
${COMMON}
uniform vec2 uTexel;
uniform vec2 uWorld;
float perm(vec2 wp) {
  // 종이마다 물을 빨아들이는 정도가 다르다 — 섬유 방향으로 길쭉한 얼룩
  float f = fbm(wp * vec2(0.05, 0.11) + 3.0) * 0.6 + vnoise(wp * 0.35) * 0.4;
  return 0.3 + 0.9 * smoothstep(0.25, 0.75, f);
}
void main() {
  float w = texture(uW, vUV).r;
  vec2 wp = vUV * uWorld;
  float pm = perm(wp);
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
  private wetT = 0;
  private fadeNext = 1;
  readonly floatOk: boolean;

  constructor(
    private readonly renderer: Renderer,
    private readonly atlas: Atlas,
    private readonly worldW: number,
    private readonly worldH: number,
  ) {
    const gl = renderer as WebGLRenderer;
    this.floatOk = !!gl.context?.extensions?.colorBufferFloat;
    const format: TEXTURE_FORMATS = this.floatOk ? 'rgba16float' : 'rgba8unorm';
    const make = (): RenderTexture => RenderTexture.create({ width: worldW, height: worldH, resolution: SIM_RES, format, scaleMode: 'linear' });
    this.P = [make(), make()];
    this.W = [make(), make()];
    const empty = new Container();
    for (const t of [...this.P, ...this.W]) renderer.render({ container: empty, target: t, clear: true, clearColor: [0, 0, 0, 0] });

    const texel = new Float32Array([1 / (worldW * SIM_RES), 1 / (worldH * SIM_RES)]);
    this.water = this.makePass(waterFrag, 'ink-sim-water', {
      uTexel: { value: texel, type: 'vec2<f32>' },
      uWorld: { value: new Float32Array([worldW, worldH]), type: 'vec2<f32>' },
    });
    this.pigment = this.makePass(pigmentFrag, 'ink-sim-pigment', {
      uTexel: { value: texel, type: 'vec2<f32>' },
      uFade: { value: 1, type: 'f32' },
    });
    this.sprite = new Sprite(this.P[0]);
  }

  private makePass(fragment: string, name: string, uniforms: Record<string, { value: unknown; type: string }>): Pass {
    const W = this.worldW;
    const H = this.worldH;
    const geometry = new MeshGeometry({
      positions: new Float32Array([0, 0, W, 0, W, H, 0, H]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex, fragment, name, preferredFragmentPrecision: 'highp' }),
      resources: {
        uP: this.P[0].source,
        uW: this.W[0].source,
        simUniforms: uniforms,
      },
    });
    const mesh = new Mesh({ geometry, shader });
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
    this.renderer.render({ container: this.stampLayer, target: this.P[this.cur], clear: false });

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
      this.renderer.render({ container: this.stampLayer, target: this.W[this.cur], clear: false });
      this.wetT = WET_HOLD;
    }
  }

  /** 물결이 끝나면 먹 자국이 조금 바랜다 */
  fade(amount: number): void {
    this.fadeNext = 1 - amount;
  }

  step(dt: number): void {
    if (this.wetT <= 0 && this.fadeNext >= 1) return;
    this.wetT -= dt;
    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      const a = this.cur;
      const b = 1 - a;
      // 물
      this.water.mesh.shader!.resources.uW = this.W[a].source;
      this.renderer.render({ container: this.water.stage, target: this.W[b], clear: true, clearColor: [0, 0, 0, 0] });
      // 안료 (새로 흐른 물을 기준으로)
      const sh = this.pigment.mesh.shader!;
      sh.resources.uP = this.P[a].source;
      sh.resources.uW = this.W[b].source;
      this.pigment.uniforms.uFade = i === 0 ? this.fadeNext : 1;
      this.renderer.render({ container: this.pigment.stage, target: this.P[b], clear: true, clearColor: [0, 0, 0, 0] });
      this.cur = b;
    }
    this.fadeNext = 1;
    this.sprite.texture = this.P[this.cur];
  }
}
