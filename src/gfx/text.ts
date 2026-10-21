/**
 * 글자를 캔버스에 붓글씨처럼 써서 텍스처로 보관한다.
 * 피해 숫자처럼 자주 반복되는 글자는 한 번만 굽는다.
 */
import { Texture } from 'pixi.js';
import { type RGB, PAPER_LIGHT, rgba } from '../render/color';

export const SERIF = '"Noto Serif KR", "Nanum Myeongjo", serif';
export const BRUSH_FONT = '"Nanum Brush Script", "Noto Serif KR", cursive';

export interface TextStyle {
  size: number;
  color: RGB;
  font?: string;
  weight?: number;
  /** 종이색 테두리 — 먹 위에서도 읽히게 */
  halo?: number;
  alpha?: number;
  /** 화면 픽셀 대비 굽는 배율. 화면에 1:1로 찍히게 맞추면 글자가 또렷하다 */
  res?: number;
}

export const DEFAULT_RES = 2;

/** 화면 배율에 맞춘 굽기 배율 — 너무 자주 바뀌지 않게 0.25 단위로 */
export const textRes = (screenScale: number): number => Math.min(4, Math.max(1, Math.round(screenScale * 4) / 4));

export class TextCache {
  private cache = new Map<string, Texture>();
  /** 이번 프레임에 아직 쓰일 수 있는 글자는 한 차례 미뤘다가 버린다 */
  private stale: Texture[] = [];

  get(text: string, s: TextStyle): Texture {
    const key = `${text}|${s.size}|${s.color.join(',')}|${s.font ?? ''}|${s.weight ?? 900}|${s.halo ?? 0}|${s.res ?? DEFAULT_RES}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (this.cache.size > 700) this.clear();
    const tex = Texture.from(renderText(text, s), true);
    this.cache.set(key, tex);
    return tex;
  }

  /** 글꼴이 늦게 도착했으면 다른 글꼴로 구운 글자를 버린다 */
  clear(): void {
    for (const t of this.stale) t.destroy(true);
    this.stale = [...this.cache.values()];
    this.cache.clear();
  }
}

export function renderText(text: string, s: TextStyle): HTMLCanvasElement {
  const RES = s.res ?? DEFAULT_RES;
  const font = `${s.weight ?? 900} ${s.size * RES}px ${s.font ?? SERIF}`;
  const c = document.createElement('canvas');
  const m = c.getContext('2d')!;
  m.font = font;
  const halo = (s.halo ?? 0) * RES;
  const w = Math.ceil(m.measureText(text).width + halo * 2 + 8 * RES);
  const h = Math.ceil(s.size * RES * 1.45 + halo * 2);
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const x = w / 2;
  const y = h / 2 + s.size * RES * 0.04;
  if (halo > 0) {
    // 글자 획을 두껍게 하지 않도록 테두리 대신 부드러운 종이빛 번짐을 깐다
    ctx.save();
    ctx.shadowColor = rgba(PAPER_LIGHT, 1);
    ctx.shadowBlur = halo * 1.6;
    ctx.fillStyle = rgba(PAPER_LIGHT, 0.9);
    ctx.fillText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  ctx.fillStyle = rgba(s.color, s.alpha ?? 1);
  ctx.fillText(text, x, y);
  return c;
}
