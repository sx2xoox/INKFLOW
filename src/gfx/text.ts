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
}

const RES = 2;

export class TextCache {
  private cache = new Map<string, Texture>();

  get(text: string, s: TextStyle): Texture {
    const key = `${text}|${s.size}|${s.color.join(',')}|${s.font ?? ''}|${s.weight ?? 900}|${s.halo ?? 0}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (this.cache.size > 700) {
      for (const t of this.cache.values()) t.destroy(true);
      this.cache.clear();
    }
    const tex = Texture.from(renderText(text, s), true);
    this.cache.set(key, tex);
    return tex;
  }
}

export function renderText(text: string, s: TextStyle): HTMLCanvasElement {
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
    ctx.lineJoin = 'round';
    ctx.lineWidth = halo * 2;
    ctx.strokeStyle = rgba(PAPER_LIGHT, 0.85);
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = rgba(s.color, s.alpha ?? 1);
  ctx.fillText(text, x, y);
  // 붓이 지나간 듯 살짝 번진 둘째 겹
  ctx.globalAlpha = 0.18;
  ctx.fillText(text, x + 0.8 * RES, y + 0.6 * RES);
  return c;
}

export const TEXT_RES = RES;
