/**
 * 화면 위 표시. 이것도 먹 레이어에 그려져 한지 위에 스민다.
 */
import { type Container, Sprite } from 'pixi.js';
import { TAU, clamp, lerp } from '../core/math';
import type { Game } from '../game/game';
import { INKS, INK_MAX, INK_ORDER, OVERCOMES, inkColor, inkEdge, inkName } from '../ink';
import { arcPoints } from '../render/brush';
import { type RGB, DAMMUK, INK, PAPER_LIGHT, SEAL, mix } from '../render/color';
import { BAKE, type Atlas } from './atlas';
import { BLOB_R } from './assets';
import { StrokeBatch } from './strokes';
import { BRUSH_FONT, type TextCache, type TextStyle, textRes } from './text';

const toHex = (c: readonly number[]): number => ((c[0] & 255) << 16) | ((c[1] & 255) << 8) | (c[2] & 255);
const NUM = ['一', '二', '三'];

export class Hud {
  private readonly strokes = new StrokeBatch(12000);
  private readonly sprites: Sprite[] = [];
  private used = 0;
  private shownHp = 100;
  private ghostHp = 100;
  private w = 1280;
  private h = 760;
  /** 화면 표시 글자는 기기 픽셀에 1:1로 굽는다 */
  res = 2;

  constructor(
    private readonly layer: Container,
    private readonly atlas: Atlas,
    private readonly text: TextCache,
  ) {
    layer.addChild(this.strokes.mesh);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  private sprite(): Sprite {
    let s = this.sprites[this.used];
    if (!s) {
      s = new Sprite();
      this.sprites.push(s);
      this.layer.addChild(s);
    }
    s.visible = true;
    s.rotation = 0;
    s.tint = 0xffffff;
    s.alpha = 1;
    this.used++;
    return s;
  }

  private label(str: string, x: number, y: number, st: TextStyle, ax = 0.5, ay = 0.5, alpha = 1, scale = 1): Sprite {
    const s = this.sprite();
    // 크게 키워 보여 줄 글자는 그만큼 크게 굽는다
    const res = textRes(this.res * Math.max(1, scale));
    s.texture = this.text.get(str, { ...st, res });
    s.anchor.set(ax, ay);
    s.scale.set(scale / res);
    // 기기 픽셀에 맞춰 놓아야 작은 글자가 흐려지지 않는다
    const tw = s.texture.width;
    const th = s.texture.height;
    const left = x - tw * ax * (scale / res);
    const top = y - th * ay * (scale / res);
    s.position.set(x + (Math.round(left * this.res) / this.res - left), y + (Math.round(top * this.res) / this.res - top));
    s.alpha = alpha;
    return s;
  }

  private frame(name: string, x: number, y: number, scale: number, tint: RGB | null, alpha: number): Sprite {
    const f = this.atlas.get(name);
    const s = this.sprite();
    s.texture = f.texture;
    s.anchor.set(f.ax, f.ay);
    s.scale.set(scale / BAKE);
    s.position.set(x, y);
    if (tint) s.tint = toHex(tint);
    s.alpha = alpha;
    return s;
  }

  update(g: Game, w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.used = 0;
    this.strokes.begin();
    const show = g.phase === 'play' || g.phase === 'over';
    if (show) {
      this.vitality(g);
      this.combo(g);
      this.waveInfo(g);
      this.wells(g);
    }
    this.banner(g);
    this.switchFx(g);
    this.strokes.end();
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i].visible = false;
  }

  /* 기력 */
  private vitality(g: Game): void {
    const pl = g.player;
    const m = 26;
    this.shownHp = lerp(this.shownHp, pl.hp, 0.3);
    this.ghostHp = pl.hp < this.ghostHp ? lerp(this.ghostHp, pl.hp, 0.04) : pl.hp;
    // 낙관 같은 붉은 인장
    this.strokes.stroke([{ x: m, y: m + 16 }, { x: m + 30, y: m + 16 }], { width: 30, color: SEAL, alpha: 0.92, dryness: 0.15, taperIn: 0, taperOut: 0, seed: 1, wet: 0.2 });
    this.label('氣', m + 15, m + 16, { size: 20, color: PAPER_LIGHT, weight: 900 });
    const x0 = m + 44;
    const len = Math.min(340, 230 * (pl.maxHp / 100));
    const y = m + 16;
    this.strokes.stroke([{ x: x0, y }, { x: x0 + len * 0.5, y: y - 1.5 }, { x: x0 + len, y }], { width: 15, color: DAMMUK, alpha: 0.16, dryness: 0.7, taperIn: 0.02, taperOut: 0.04, seed: 2 });
    const gh = clamp(this.ghostHp / pl.maxHp, 0, 1);
    if (gh > 0.01) {
      this.strokes.stroke([{ x: x0, y }, { x: x0 + len * gh, y: y - 1 }], { width: 13, color: mix(SEAL, PAPER_LIGHT, 0.55), alpha: 0.7, dryness: 0.4, taperIn: 0.02, taperOut: 0.1, seed: 3 });
    }
    const fr = clamp(this.shownHp / pl.maxHp, 0, 1);
    if (fr > 0.01) {
      this.strokes.stroke([{ x: x0, y }, { x: x0 + len * fr * 0.5, y: y - 1.5 }, { x: x0 + len * fr, y: y - 0.5 }], {
        width: 14,
        color: SEAL,
        alpha: 0.95,
        dryness: 0.35,
        taperIn: 0.02,
        taperOut: 0.12,
        seed: 4,
      });
    }
    this.label(`${Math.ceil(Math.max(0, pl.hp))}`, x0 + len + 12, y, { size: 15, color: mix(SEAL, INK, 0.3), halo: 2 }, 0, 0.5);
  }

  /* 먹에 따른 세 획 */
  private combo(g: Game): void {
    const m = 26;
    const ink = g.ink.dominant;
    const col = inkColor(ink);
    const edge = ink === 'baek' ? ([96, 92, 86] as RGB) : inkEdge(ink);
    this.label(`${g.character.name} · ${inkName(ink)}`, m, m + 52, { size: 15, color: INK, halo: 2.2, weight: 700 }, 0, 0.5);
    this.label(`「${g.styleName}」`, m + 132, m + 52, { size: 15, color: edge, halo: 2.2, weight: 700 }, 0, 0.5);

    const moves = g.comboMoves;
    const cur = g.comboCursor;
    const pl = g.player;
    const chaining = pl.action !== null || pl.comboT > 0;
    for (let i = 0; i < 3; i++) {
      const x = m + 14 + i * 118;
      const y = m + 86;
      const active = cur.current === i;
      const next = !active && chaining && cur.next === i;
      if (active) {
        this.frame(`blob/${i}`, x, y, 14 / BLOB_R, col, 0.95);
      }
      this.strokes.stroke(arcPoints(x, y, 12, -2.2 + i, TAU * 0.92, 22), {
        width: active || next ? 3.6 : 2,
        color: active || next ? edge : DAMMUK,
        alpha: active || next ? 0.95 : 0.5,
        dryness: 0.45,
        taperIn: 0.1,
        taperOut: 0.4,
        seed: 30 + i,
      });
      const numCol: RGB = active ? (ink === 'baek' ? INK : PAPER_LIGHT) : next ? edge : DAMMUK;
      this.label(NUM[i], x, y + 0.5, { size: 13, color: numCol, weight: 900 });
      this.label(moves[i].name, x + 19, y, { size: 14, color: active ? edge : next ? INK : DAMMUK, halo: 2, weight: active ? 700 : 600 }, 0, 0.5, active || next ? 1 : 0.8);
    }
  }

  /* 물결과 먹귀의 기운 */
  private waveInfo(g: Game): void {
    const w = this.w;
    const m = 26;
    const wave = g.wave;
    if (!wave) return;
    this.label(`${['', '첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째', '아홉째', '열째'][wave.n] ?? `${wave.n}번째`} 물결`, w / 2, m + 12, {
      size: 30,
      color: INK,
      font: BRUSH_FONT,
      weight: 400,
      halo: 2,
    });
    const y = m + 40;
    if (wave.spawning) {
      const frac = clamp(1 - wave.t / wave.duration, 0, 1);
      const L = 180;
      this.strokes.stroke([{ x: w / 2 - L / 2, y }, { x: w / 2 + L / 2, y }], { width: 5, color: DAMMUK, alpha: 0.15, dryness: 0.6, taperIn: 0.05, taperOut: 0.05, seed: 40 });
      if (frac > 0.01) {
        this.strokes.stroke([{ x: w / 2 - L / 2, y }, { x: w / 2 - L / 2 + L * frac, y }], { width: 5, color: INK, alpha: 0.7, dryness: 0.5, taperIn: 0.05, taperOut: 0.2, seed: 41 });
      }
    } else {
      this.label(`남은 먹귀 ${g.enemies.length}`, w / 2, y, { size: 14, color: INK, halo: 2, weight: 700 });
    }

    // 오른쪽 위: 이번 물결의 기운과 상극
    const rx = w - m;
    this.label('먹귀의 기운', rx, m + 8, { size: 13, color: DAMMUK, halo: 2, weight: 700 }, 1, 0.5);
    wave.themes.forEach((el, i) => {
      const x = rx - 14 - i * 36;
      const yy = m + 36;
      this.frame(`blob/${(i + 2) % 6}`, x, yy, 13 / BLOB_R, INKS[el].color, 0.95);
      this.label(INKS[el].hanja, x, yy, { size: 15, color: el === 'baek' ? INK : PAPER_LIGHT, weight: 900 });
    });
    const counters = wave.themes.map((el) => INK_ORDER.find((id) => OVERCOMES[id] === el)!);
    const hint = counters.map((c) => INKS[c].hanja).join(' ');
    this.label(`유리한 먹  ${hint}`, rx, m + 64, { size: 13, color: INK, halo: 2, weight: 700 }, 1, 0.5, 0.8);
  }

  /* 다섯 벼루 */
  private wells(g: Game): void {
    const n = INK_ORDER.length;
    const gap = 76;
    const x0 = this.w / 2 - ((n - 1) * gap) / 2;
    const y = this.h - 58;
    const t = g.time;
    INK_ORDER.forEach((id, i) => {
      const x = x0 + i * gap;
      const v = g.ink.values[id];
      const d = INKS[id];
      const dom = g.ink.dominant === id;
      this.frame('well', x, y, 0.82, null, 0.95);
      if (v > 0) {
        const r = 4 + 15 * Math.sqrt(v / INK_MAX);
        this.frame(`blob/${i}`, x, y, r / BLOB_R, d.color, 0.95);
      }
      const labelCol = id === 'baek' ? ([110, 106, 98] as RGB) : d.edge;
      this.label(d.hanja, x, y - 38, { size: dom ? 20 : 16, color: labelCol, halo: 2.4, weight: 900 }, 0.5, 0.5, dom ? 1 : 0.75);
      this.label(`${Math.round(v)}`, x, y + 34, { size: 13, color: INK, halo: 2, weight: 700 }, 0.5, 0.5, v > 0 ? 0.85 : 0.4);
      if (dom) {
        this.strokes.stroke(arcPoints(x, y, 30, t * 0.8 + i, TAU * 0.9, 30, 31), {
          width: 4.5,
          color: id === 'baek' ? mix(d.color, INK, 0.45) : d.color,
          alpha: 0.95,
          dryness: 0.4,
          taperIn: 0.08,
          taperOut: 0.5,
          seed: 60 + i,
        });
      }
    });
  }

  private banner(g: Game): void {
    const b = g.banner;
    if (!b) return;
    const inA = clamp(b.t / 0.35, 0, 1);
    const outA = clamp((b.dur - b.t) / 0.6, 0, 1);
    const a = Math.min(inA, outA);
    const x = this.w / 2;
    const y = this.h * 0.24;
    const L = 280 * Math.min(1, b.t / 0.5);
    this.strokes.stroke([{ x: x - L / 2, y: y + 30 }, { x: x + L / 2, y: y + 28 }], { width: 7, color: INK, alpha: a * 0.8, dryness: 0.8, taperIn: 0.1, taperOut: 0.5, seed: 70 });
    this.label(b.title, x, y - 8, { size: 64, color: b.color, font: BRUSH_FONT, weight: 400, halo: 3 }, 0.5, 0.5, a, 0.94 + 0.06 * inA);
    this.label(b.sub, x, y + 56, { size: 17, color: INK, halo: 2.4, weight: 700 }, 0.5, 0.5, a * 0.9);
  }

  private switchFx(g: Game): void {
    const s = g.switchFx;
    // 물결 시작 글씨와 겹치지 않게
    if (!s || (g.banner && g.banner.t < 1.8)) return;
    const t = s.t;
    const a = t < 0.12 ? t / 0.12 : clamp(1 - (t - 0.35) / 1.0, 0, 1);
    const col = s.ink ? (s.ink === 'baek' ? mix(INKS.baek.color, INK, 0.5) : INKS[s.ink].color) : DAMMUK;
    const sc = 1 + 0.25 * Math.max(0, 1 - t / 0.25);
    this.label(s.ink ? INKS[s.ink].hanja : '淡', this.w / 2, this.h * 0.3, { size: 120, color: col, weight: 900, halo: 4 }, 0.5, 0.5, a * 0.75, sc);
    this.label(`${inkName(s.ink)} — ${g.styleName}`, this.w / 2, this.h * 0.3 + 80, { size: 18, color: INK, halo: 2.4, weight: 700 }, 0.5, 0.5, a);
  }
}
