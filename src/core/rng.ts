export type Rng = () => number;

/** 같은 시드면 같은 수열 — 매 프레임 다시 그려도 붓 자국 모양이 떨리지 않게 한다. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = (): number => (Math.random() * 0xffffffff) >>> 0;
