/**
 * 캔버스 붓으로 그린 그림을 큰 종이(아틀라스)에 모아 굽고 Pixi 텍스처로 쓴다.
 * 세계 단위의 BAKE배 해상도로 구워 확대해도 붓결이 뭉개지지 않는다.
 */
import { CanvasSource, Rectangle, Texture } from 'pixi.js';

export const BAKE = 2.5;
const PAGE = 2048;
const PAD = 3;

type Ctx = CanvasRenderingContext2D;

export interface Frame {
  texture: Texture;
  /** 텍스처 안에서 원점(발밑)의 위치 0..1 */
  ax: number;
  ay: number;
}

interface Entry {
  name: string;
  w: number;
  h: number;
  ox: number;
  oy: number;
  draw: (ctx: Ctx) => void;
  white: boolean;
}

/** normal: 그대로, white: 흰 실루엣만(맞았을 때 번쩍임용) */
export type BakeMode = 'normal' | 'white';

export class Atlas {
  private entries: Entry[] = [];
  private frames = new Map<string, Frame>();
  readonly pages: HTMLCanvasElement[] = [];

  /** w, h: 그림 상자 크기(세계 단위), ox, oy: 상자 안 원점 위치. */
  add(name: string, w: number, h: number, ox: number, oy: number, draw: (ctx: Ctx) => void, mode: BakeMode = 'normal'): void {
    this.entries.push({ name, w, h, ox, oy, draw, white: mode === 'white' });
  }

  build(): void {
    const items = this.entries.map((e) => ({ e, pw: Math.ceil(e.w * BAKE) + PAD * 2, ph: Math.ceil(e.h * BAKE) + PAD * 2 }));
    items.sort((a, b) => b.ph - a.ph);

    let page: HTMLCanvasElement | null = null;
    let ctx: Ctx | null = null;
    let x = 0;
    let y = 0;
    let rowH = 0;
    const placed: { e: Entry; page: number; x: number; y: number; pw: number; ph: number }[] = [];
    const newPage = (): void => {
      page = document.createElement('canvas');
      page.width = PAGE;
      page.height = PAGE;
      ctx = page.getContext('2d')!;
      this.pages.push(page);
      x = 0;
      y = 0;
      rowH = 0;
    };
    newPage();

    for (const it of items) {
      if (x + it.pw > PAGE) {
        x = 0;
        y += rowH;
        rowH = 0;
      }
      if (y + it.ph > PAGE) newPage();
      const c = ctx as unknown as Ctx;
      c.save();
      c.beginPath();
      c.rect(x, y, it.pw, it.ph);
      c.clip();
      c.translate(x + PAD, y + PAD);
      c.scale(BAKE, BAKE);
      c.translate(it.e.ox, it.e.oy);
      it.e.draw(c);
      c.restore();
      if (it.e.white) {
        c.save();
        c.globalCompositeOperation = 'source-atop';
        c.fillStyle = '#fff';
        c.fillRect(x, y, it.pw, it.ph);
        c.restore();
      }
      placed.push({ e: it.e, page: this.pages.length - 1, x, y, pw: it.pw, ph: it.ph });
      x += it.pw;
      rowH = Math.max(rowH, it.ph);
    }

    const sources = this.pages.map((p) => new CanvasSource({ resource: p, scaleMode: 'linear' }));
    for (const p of placed) {
      const texture = new Texture({ source: sources[p.page], frame: new Rectangle(p.x, p.y, p.pw, p.ph) });
      this.frames.set(p.e.name, {
        texture,
        ax: (PAD + p.e.ox * BAKE) / p.pw,
        ay: (PAD + p.e.oy * BAKE) / p.ph,
      });
    }
    this.entries = [];
  }

  get(name: string): Frame {
    const f = this.frames.get(name);
    if (!f) throw new Error(`atlas: ${name} 없음`);
    return f;
  }

  has(name: string): boolean {
    return this.frames.has(name);
  }
}
