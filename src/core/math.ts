export interface Vec {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const angleTo = (a: Vec, b: Vec): number => Math.atan2(b.y - a.y, b.x - a.x);

/** -π..π 범위로 각도를 감는다. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeOutSine = (t: number): number => Math.sin((t * Math.PI) / 2);
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const randInt = (a: number, b: number): number => Math.floor(rand(a, b + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 가중치 표에서 하나를 뽑는다. */
export function weighted<T>(entries: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = Math.random() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  return entries[entries.length - 1][0];
}
