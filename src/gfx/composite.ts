/**
 * 먹 레이어를 한지 위에 스미게 하는 최종 합성 셰이더.
 *  - 가장자리 짙어짐(墨暈): 먹이 마르며 테두리로 몰리는 현상
 *  - 입자 가라앉음(granulation): 안료가 종이결의 골에 고이는 현상
 *  - 섬유 번짐: 종이 섬유를 따라 먹이 살짝 스미는 들쭉날쭉한 경계
 *  - 한지 잔결과 섬유, 비네트
 */
import { GlProgram, Mesh, MeshGeometry, Shader, type Texture } from 'pixi.js';
import { MESH_VERTEX_HEADER, NOISE_GLSL } from './glsl';

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

const fragment = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uInk;
uniform sampler2D uPaper;
uniform vec4 uView;     // 화면에 보이는 세계 영역 x, y, w, h
uniform vec2 uWorld;    // 세계 크기
uniform vec2 uTexel;    // 먹 레이어 한 픽셀의 uv 크기
uniform float uPx;      // 세계 1단위당 먹 레이어 픽셀 수
uniform float uTime;
uniform float uFlash;   // 피격 시 붉은 테
${NOISE_GLSL}

float paperHeight(vec2 wp) {
  float grain = vnoise(wp * 1.25) * 0.45 + vnoise(wp * 2.9 + 11.0) * 0.3 + vnoise(wp * 0.33) * 0.25;
  vec2 q1 = mat2(0.8, -0.6, 0.6, 0.8) * wp;
  vec2 q2 = mat2(0.28, 0.96, -0.96, 0.28) * wp;
  vec2 q3 = mat2(-0.7, 0.71, -0.71, -0.7) * wp;
  float fib = smoothstep(0.6, 0.92, vnoise(q1 * vec2(0.05, 0.9)))
            + smoothstep(0.62, 0.93, vnoise(q2 * vec2(0.045, 1.1)))
            + smoothstep(0.64, 0.95, vnoise(q3 * vec2(0.07, 1.3)));
  return grain * 0.85 + fib * 0.07;
}

void main() {
  vec2 wp = uView.xy + vUV * uView.zw;
  float h = paperHeight(wp);

  // 섬유를 따라 스미는 경계
  vec2 seep = ((vec2(vnoise(wp * 0.13 + 3.1), vnoise(wp * 0.13 + 7.7)) - 0.5) * 3.0
             + (vec2(vnoise(wp * 1.4 + 1.3), vnoise(wp * 1.4 + 5.9)) - 0.5) * 0.9) * uTexel * uPx;
  vec4 ink = texture(uInk, vUV + seep);

  // 주변 먹의 평균(두 겹의 고리)
  vec4 ring1 = vec4(0.0);
  vec4 ring2 = vec4(0.0);
  float r1 = 2.2 * uPx;
  float r2 = 6.0 * uPx;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.3;
    vec2 d = vec2(cos(a), sin(a)) * uTexel;
    ring1 += texture(uInk, vUV + seep + d * r1);
    ring2 += texture(uInk, vUV + d * r2);
  }
  ring1 *= 0.125;
  ring2 *= 0.125;

  float a = ink.a;
  vec3 pig = a > 0.002 ? ink.rgb / a : (ring2.a > 0.002 ? ring2.rgb / ring2.a : vec3(0.0));

  // 가장자리 짙어짐
  float edge = clamp(a - ring1.a, 0.0, 1.0) + clamp(a - ring2.a, 0.0, 1.0) * 0.5;
  float density = a * (1.0 + 1.6 * edge);

  // 입자 가라앉음 — 묽은 먹일수록 종이결이 드러난다
  float thin = 1.0 - smoothstep(0.55, 0.95, a);
  density *= mix(1.0, 0.62 + 0.7 * (1.0 - h), thin * 0.75);

  // 경계 밖으로 스민 옅은 번짐
  float halo = max(0.0, ring2.a - a) * 0.22;
  vec3 haloPig = ring2.a > 0.002 ? ring2.rgb / ring2.a : pig;
  pig = mix(haloPig, pig, clamp(a * 4.0, 0.0, 1.0));
  density = clamp(density + halo, 0.0, 1.0);

  // 한지
  vec2 puv = wp / uWorld;
  vec3 paper = texture(uPaper, clamp(puv, 0.0, 1.0)).rgb;
  paper *= 0.95 + 0.085 * h;
  if (puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0) {
    // 그림 밖은 옅은 쪽빛 표구 비단 — 올이 보이고 구름무늬가 은은하다
    float weave = vnoise(wp * vec2(1.6, 0.08)) * 0.5 + vnoise(wp * vec2(0.08, 1.6)) * 0.5;
    float cloud = smoothstep(0.55, 0.7, fbm(wp * 0.012)) - smoothstep(0.72, 0.8, fbm(wp * 0.012));
    paper = vec3(0.74, 0.77, 0.79) * (0.93 + 0.1 * weave) - cloud * 0.05;
    // 그림과 비단 사이의 가는 띠
    float d = max(max(-wp.x, wp.x - uWorld.x), max(-wp.y, wp.y - uWorld.y));
    paper = mix(vec3(0.42, 0.36, 0.3), paper, smoothstep(3.0, 8.0, d));
  }

  vec3 col = mix(paper, pig * (0.9 + 0.14 * h), density);

  vec2 dv = vUV - 0.5;
  float vig = 1.0 - dot(dv, dv) * 0.62;
  col *= vig;
  // 피격 — 화면 가장자리에 붉은 먹이 번진다
  float rim = smoothstep(0.18, 0.5, length(dv * vec2(1.0, 1.2)) + (vnoise(wp * 0.05 + uTime) - 0.5) * 0.12);
  col = mix(col, vec3(0.58, 0.12, 0.09), rim * uFlash * 0.55);
  finalColor = vec4(col, 1.0);
}
`;

export class Compositor {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly geometry: MeshGeometry;
  private readonly uniforms: {
    uView: Float32Array;
    uWorld: Float32Array;
    uTexel: Float32Array;
    uPx: number;
    uTime: number;
    uFlash: number;
  };

  constructor(ink: Texture, paper: Texture, worldW: number, worldH: number) {
    this.geometry = new MeshGeometry({
      positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex, fragment, name: 'ink-composite', preferredFragmentPrecision: 'highp' }),
      resources: {
        uInk: ink.source,
        uPaper: paper.source,
        compositeUniforms: {
          uView: { value: new Float32Array(4), type: 'vec4<f32>' },
          uWorld: { value: new Float32Array([worldW, worldH]), type: 'vec2<f32>' },
          uTexel: { value: new Float32Array(2), type: 'vec2<f32>' },
          uPx: { value: 1, type: 'f32' },
          uTime: { value: 0, type: 'f32' },
          uFlash: { value: 0, type: 'f32' },
        },
      },
    });
    this.uniforms = shader.resources.compositeUniforms.uniforms;
    this.mesh = new Mesh({ geometry: this.geometry, shader });
  }

  setInk(ink: Texture): void {
    this.mesh.shader!.resources.uInk = ink.source;
  }

  /** 방이 바뀌면 바탕 그림도 바뀐다 */
  setPaper(paper: Texture): void {
    this.mesh.shader!.resources.uPaper = paper.source;
  }

  resize(cssW: number, cssH: number, inkPxW: number, inkPxH: number): void {
    const pos = this.geometry.positions;
    pos.set([0, 0, cssW, 0, cssW, cssH, 0, cssH]);
    this.geometry.positions = pos;
    this.uniforms.uTexel[0] = 1 / inkPxW;
    this.uniforms.uTexel[1] = 1 / inkPxH;
  }

  update(viewX: number, viewY: number, viewW: number, viewH: number, pxPerWorld: number, time: number, flash: number): void {
    const v = this.uniforms.uView;
    v[0] = viewX;
    v[1] = viewY;
    v[2] = viewW;
    v[3] = viewH;
    this.uniforms.uPx = pxPerWorld;
    this.uniforms.uTime = time;
    this.uniforms.uFlash = flash;
  }
}
