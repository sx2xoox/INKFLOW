/**
 * 한지의 결은 그림이 바뀌어도 그대로다. 매 프레임 픽셀마다 잡음을 새로 셈하지 않도록
 * 처음 한 번만 세계 크기의 텍스처에 구워 두고, 합성과 번짐 계산이 이것을 읽는다.
 *  r: 종이결의 높낮이(가장 고운 결은 합성 셰이더가 따로 더한다)
 *  g, b: 먹이 섬유를 따라 스미는 방향
 *  a: 물을 빨아들이는 정도
 */
import { Container, GlProgram, Mesh, MeshGeometry, type Renderer, RenderTexture, Shader } from 'pixi.js';
import { MESH_VERTEX_HEADER, NOISE_GLSL } from './glsl';

/** 세계 1단위당 텍셀 수 — 섬유가 뭉개지지 않을 만큼 */
export const PAPER_FX_RES = 1.5;

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
uniform vec2 uWorld;
${NOISE_GLSL}
void main() {
  vec2 wp = vUV * uWorld;
  float grain = vnoise(wp * 1.25) * 0.45 + vnoise(wp * 0.33) * 0.25;
  vec2 q1 = mat2(0.8, -0.6, 0.6, 0.8) * wp;
  vec2 q2 = mat2(0.28, 0.96, -0.96, 0.28) * wp;
  vec2 q3 = mat2(-0.7, 0.71, -0.71, -0.7) * wp;
  float fib = smoothstep(0.6, 0.92, vnoise(q1 * vec2(0.05, 0.9)))
            + smoothstep(0.62, 0.93, vnoise(q2 * vec2(0.045, 1.1)))
            + smoothstep(0.64, 0.95, vnoise(q3 * vec2(0.07, 1.3)));
  float h = grain * 0.85 + fib * 0.07;

  vec2 seep = (vec2(vnoise(wp * 0.13 + 3.1), vnoise(wp * 0.13 + 7.7)) - 0.5) * 3.0;

  float f = fbm(wp * vec2(0.05, 0.11) + 3.0) * 0.6 + vnoise(wp * 0.35) * 0.4;
  float perm = smoothstep(0.25, 0.75, f);

  finalColor = vec4(h, seep / 4.0 + 0.5, perm);
}
`;

/** 구운 결은 어느 셰이더에서든 이렇게 풀어 쓴다 */
export const PAPER_FX_DECODE = /* glsl */ `
// 종이결 높낮이(고운 결 제외), 스밈 방향(세계 단위), 물 빨아들임 0.3..1.2
float fxHeight(vec4 fx) { return fx.r; }
vec2 fxSeep(vec4 fx) { return (fx.gb - 0.5) * 4.0; }
float fxPerm(vec4 fx) { return 0.3 + 0.9 * fx.a; }
`;

export function bakePaperFx(renderer: Renderer, worldW: number, worldH: number): RenderTexture {
  const rt = RenderTexture.create({ width: worldW, height: worldH, resolution: PAPER_FX_RES, format: 'rgba8unorm', scaleMode: 'linear' });
  const geometry = new MeshGeometry({
    positions: new Float32Array([0, 0, worldW, 0, worldW, worldH, 0, worldH]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const shader = new Shader({
    glProgram: GlProgram.from({ vertex, fragment, name: 'paper-fx-bake', preferredFragmentPrecision: 'highp' }),
    resources: {
      bakeUniforms: { uWorld: { value: new Float32Array([worldW, worldH]), type: 'vec2<f32>' } },
    },
  });
  const stage = new Container();
  const mesh = new Mesh({ geometry, shader });
  // 알파에 값을 담으니 섞지 않고 그대로 쓴다
  mesh.blendMode = 'none';
  stage.addChild(mesh);
  renderer.render({ container: stage, target: rt, clear: true, clearColor: [0, 0, 0, 0] });
  stage.destroy({ children: true });
  shader.destroy();
  return rt;
}
