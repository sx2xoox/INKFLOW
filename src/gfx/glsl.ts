/** 여러 셰이더가 함께 쓰는 GLSL 조각들. */

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm3(vec2 p) {
  float s = 0.5 * vnoise(p);
  p = p * 2.03 + vec2(17.1, 9.2);
  s += 0.25 * vnoise(p);
  p = p * 2.03 + vec2(17.1, 9.2);
  s += 0.125 * vnoise(p);
  return s / 0.875;
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}
`;

/** Pixi 메시가 넘겨주는 전역/지역 변환 행렬로 정점을 화면에 놓는다. */
export const MESH_VERTEX_HEADER = /* glsl */ `
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

vec4 toClip(vec2 pos) {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  return vec4((mvp * vec3(pos, 1.0)).xy, 0.0, 1.0);
}
`;
