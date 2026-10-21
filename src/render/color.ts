export type RGB = readonly [number, number, number];

export const rgba = (c: RGB, a: number): string =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a < 0 ? 0 : a > 1 ? 1 : a})`;

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export const BLACK: RGB = [0, 0, 0];
export const WHITE: RGB = [255, 255, 255];

/** 한지 바탕색 */
export const PAPER: RGB = [240, 232, 214];
export const PAPER_LIGHT: RGB = [251, 247, 237];
/** 진한 먹 */
export const INK: RGB = [26, 23, 21];
/** 물을 많이 탄 먹 */
export const DAMMUK: RGB = [96, 91, 84];
/** 삿갓 짚 색 */
export const STRAW: RGB = [196, 160, 100];
/** 낙관 인주 */
export const SEAL: RGB = [178, 42, 34];
