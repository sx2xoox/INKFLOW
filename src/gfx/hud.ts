/**
 * 화면 위 표시. 이것도 먹 레이어에 그려져 한지 위에 스민다.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { TAU, clamp, lerp } from '../core/math';
import type { Game } from '../game/game';
import type { Enemy } from '../game/types';
import { EXCESS_AT, EXCESS_COST, INKS, INK_MAX, INK_ORDER, type InkId, OVERCOMES, inkColor, inkEdge, inkName } from '../ink';
import { ARTIFACTS } from '../game/artifacts';
import { numeral } from '../game/game';
import { CHAPTER, ROOM_KINDS } from '../game/rooms';
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
  /** 글자와 그림 — 붓질 위에 */
  private readonly labels = new Container();
  /** 그림 위에 다시 긋는 가는 획 (벼루의 태과 문턱) */
  private readonly topStrokes = new StrokeBatch(2000);
  /** 문을 지날 때 화면을 덮는 먹 — 맨 위 */
  private readonly wipe = new Container();
  private readonly wipeFill = new Sprite(Texture.WHITE);
  private readonly wipeStrokes = new StrokeBatch(2000);
  private readonly wipeGlyph = new Sprite();
  private readonly sprites: Sprite[] = [];
  private used = 0;
  private shownHp = 100;
  private ghostHp = 100;
  private bossShown = -1;
  private bossGhost = 1;
  private w = 1280;
  private h = 760;
  /** 화면 표시 글자는 기기 픽셀에 1:1로 굽는다 */
  res = 2;

  constructor(
    layer: Container,
    private readonly atlas: Atlas,
    private readonly text: TextCache,
  ) {
    layer.addChild(this.strokes.mesh, this.labels, this.topStrokes.mesh, this.wipe);
    this.wipeFill.tint = 0x1a1715;
    this.wipeGlyph.anchor.set(0.5);
    this.wipe.addChild(this.wipeFill, this.wipeStrokes.mesh, this.wipeGlyph);
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
      this.labels.addChild(s);
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
    this.topStrokes.begin();
    const show = g.phase === 'play' || g.phase === 'over';
    if (show) {
      this.vitality(g);
      this.combo(g);
      this.waveInfo(g);
      this.wells(g);
      this.belongings(g);
    }
    this.banner(g);
    this.switchFx(g);
    this.transition(g);
    this.strokes.end();
    this.topStrokes.end();
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

  /* 방과 먹귀의 기운 */
  private waveInfo(g: Game): void {
    const w = this.w;
    const m = 26;
    const wave = g.wave;
    let themes: InkId[] = [];
    if (g.mode === 'explore') {
      const room = g.room;
      this.label(`${CHAPTER.name} · ${numeral(room.depth + 1)} 방`, w / 2, m + 12, { size: 30, color: INK, font: BRUSH_FONT, weight: 400, halo: 2 });
      // 장의 방들 — 다 그린 방은 그 먹 색으로 채운다
      const gap = 30;
      const x0 = w / 2 - ((CHAPTER.rooms - 1) * gap) / 2;
      const ny = m + 44;
      for (let i = 0; i < CHAPTER.rooms; i++) {
        const x = x0 + i * gap;
        const done = g.cleared[i];
        if (i > 0) this.strokes.stroke([{ x: x - gap + 9, y: ny }, { x: x - 9, y: ny }], { width: 1.6, color: DAMMUK, alpha: 0.4, dryness: 0.5, taperIn: 0.1, taperOut: 0.1, seed: 80 + i });
        if (done) this.frame(`blob/${i % 6}`, x, ny, 8 / BLOB_R, done.el ? INKS[done.el].color : DAMMUK, 0.95);
        const current = i === room.depth && !done;
        this.strokes.stroke(arcPoints(x, ny, 7.5, -2 + i, TAU * 0.92, 18), {
          width: current ? 2.8 : 1.6,
          color: current ? INK : DAMMUK,
          alpha: current ? 0.95 : done ? 0.6 : 0.4,
          dryness: 0.4,
          taperIn: 0.1,
          taperOut: 0.3,
          seed: 90 + i,
        });
      }
      const sy = m + 66;
      const boss = room.kind === 'boss' ? g.enemies.find((e) => e.boss) : undefined;
      if (boss) {
        this.bossBar(boss, sy);
      } else if (g.roomPhase === 'fight' && room.kind !== 'hold') {
        const left = g.beatsLeft;
        this.label(left > 0 ? `먹귀 ${g.enemies.length} · 남은 무리 ${left}` : `남은 먹귀 ${g.enemies.length}`, w / 2, sy, { size: 14, color: INK, halo: 2, weight: 700 });
      } else if (g.roomPhase === 'spring') {
        this.label('샘에 다가가 먹을 씻는다', w / 2, sy, { size: 14, color: INK, halo: 2, weight: 700 });
      } else if (g.roomPhase === 'shop') {
        this.label('서안에 다가가 물건을 본다', w / 2, sy, { size: 14, color: INK, halo: 2, weight: 700 });
      } else if (g.roomPhase === 'open') {
        this.label('문을 골라 지나간다', w / 2, sy, { size: 14, color: INK, halo: 2, weight: 700 });
      }
      if (room.kind === 'hold' && wave && g.roomPhase === 'fight') this.timerBar(wave, sy);
      if (g.roomPhase === 'fight') themes = boss ? [boss.el] : wave ? wave.themes : room.el ? [room.el] : [];
    } else {
      if (!wave) return;
      this.label(`${numeral(wave.n)} 물결`, w / 2, m + 12, { size: 30, color: INK, font: BRUSH_FONT, weight: 400, halo: 2 });
      const y = m + 40;
      if (wave.spawning) this.timerBar(wave, y);
      else this.label(`남은 먹귀 ${g.enemies.length}`, w / 2, y, { size: 14, color: INK, halo: 2, weight: 700 });
      themes = wave.themes;
    }
    if (!themes.length) return;

    // 오른쪽 위: 먹귀의 기운과 상극
    const rx = w - m;
    this.label('먹귀의 기운', rx, m + 8, { size: 13, color: DAMMUK, halo: 2, weight: 700 }, 1, 0.5);
    themes.forEach((el, i) => {
      const x = rx - 14 - i * 36;
      const yy = m + 36;
      this.frame(`blob/${(i + 2) % 6}`, x, yy, 13 / BLOB_R, INKS[el].color, 0.95);
      this.label(INKS[el].hanja, x, yy, { size: 15, color: el === 'baek' ? INK : PAPER_LIGHT, weight: 900 });
    });
    const counters = themes.map((el) => INK_ORDER.find((id) => OVERCOMES[id] === el)!);
    const hint = counters.map((c) => INKS[c].hanja).join(' ');
    this.label(`유리한 먹  ${hint}`, rx, m + 64, { size: 13, color: INK, halo: 2, weight: 700 }, 1, 0.5, 0.8);
  }

  /** 대숲의 주인 — 이름과 긴 기력 획. 2/3, 1/3 자리에 포효할 마디가 있다 */
  private bossBar(e: Enemy, y: number): void {
    const b = e.boss!;
    if (b.roared < 1) {
      this.bossShown = 1;
      this.bossGhost = 1;
      return;
    }
    const appear = b.roared > 1 || b.move !== 'roar' ? 1 : clamp((b.t - 0.3) / 0.5, 0, 1);
    const w = this.w;
    // 왼쪽 위 콤보 표시와 겹치지 않을 만큼
    const L = clamp(w - 760, 220, 460);
    const x0 = w / 2 - L / 2;
    const by = y + 22;
    const fr = clamp(e.hp / e.maxHp, 0, 1);
    this.bossShown = this.bossShown < 0 ? fr : lerp(this.bossShown, fr, 0.25);
    this.bossGhost = fr < this.bossGhost ? lerp(this.bossGhost, fr, 0.03) : fr;
    const col = INKS[e.el].color;
    this.label('묵호 · 대숲의 주인', w / 2, y, { size: 15, color: INK, halo: 2.2, weight: 900 }, 0.5, 0.5, appear);
    this.strokes.stroke([{ x: x0, y: by }, { x: x0 + L * 0.5, y: by - 2 }, { x: x0 + L, y: by }], { width: 13, color: DAMMUK, alpha: 0.16 * appear, dryness: 0.7, taperIn: 0.02, taperOut: 0.04, seed: 140 });
    if (this.bossGhost > 0.005) {
      this.strokes.stroke([{ x: x0, y: by }, { x: x0 + L * this.bossGhost, y: by - 1 }], { width: 11, color: mix(SEAL, PAPER_LIGHT, 0.5), alpha: 0.65 * appear, dryness: 0.45, taperIn: 0.02, taperOut: 0.1, seed: 141 });
    }
    if (this.bossShown > 0.005) {
      const bar = e.el === 'baek' ? mix(col, INK, 0.35) : col;
      this.strokes.stroke([{ x: x0, y: by }, { x: x0 + L * this.bossShown * 0.5, y: by - 1.5 }, { x: x0 + L * this.bossShown, y: by - 0.5 }], {
        width: 12,
        color: bar,
        alpha: 0.95 * appear,
        dryness: 0.35,
        taperIn: 0.02,
        taperOut: 0.12,
        seed: 142,
      });
    }
    // 포효할 마디
    for (const k of [1 / 3, 2 / 3]) {
      const x = x0 + L * k;
      this.strokes.stroke([{ x: x - 1, y: by - 11 }, { x: x + 1, y: by + 10 }], { width: 2.6, color: INK, alpha: 0.75 * appear, dryness: 0.4, taperIn: 0.2, taperOut: 0.2, seed: 150 + k * 10 });
    }
    // 두른 먹
    const bx = x0 - 22;
    this.frame(`blob/${e.seed % 6}`, bx, by, 13 / BLOB_R, col, 0.95 * appear);
    this.label(INKS[e.el].hanja, bx, by, { size: 15, color: e.el === 'baek' ? INK : PAPER_LIGHT, weight: 900 }, 0.5, 0.5, appear);
  }

  private timerBar(wave: NonNullable<Game['wave']>, y: number): void {
    const w = this.w;
    const frac = clamp(1 - wave.t / wave.duration, 0, 1);
    const L = 180;
    this.strokes.stroke([{ x: w / 2 - L / 2, y }, { x: w / 2 + L / 2, y }], { width: 5, color: DAMMUK, alpha: 0.15, dryness: 0.6, taperIn: 0.05, taperOut: 0.05, seed: 40 });
    if (frac > 0.01) {
      this.strokes.stroke([{ x: w / 2 - L / 2, y }, { x: w / 2 - L / 2 + L * frac, y }], { width: 5, color: INK, alpha: 0.7, dryness: 0.5, taperIn: 0.05, taperOut: 0.2, seed: 41 });
    }
  }

  /** 문을 지날 때 — 큰 붓질로 화면을 덮었다가 걷는다 */
  private transition(g: Game): void {
    const tr = g.transition;
    this.wipeStrokes.begin();
    this.wipe.visible = !!tr;
    if (!tr) {
      this.wipeStrokes.end();
      return;
    }
    const half = tr.dur * 0.5;
    const cover = tr.t < half;
    const a = cover ? 1 : clamp(1 - (tr.t - half) / half, 0, 1);
    // 붓질이 지나간 뒤를 먹이 메운다
    const fill = cover ? clamp((tr.t / half) * 1.7 - 0.7, 0, 1) : a;
    this.wipeFill.width = this.w;
    this.wipeFill.height = this.h;
    this.wipeFill.alpha = Math.pow(fill, 1.5) * 0.97;
    const n = 6;
    const rowH = this.h / n;
    for (let i = 0; i < n; i++) {
      const p = cover ? clamp((tr.t / half) * 1.3 - i * 0.06, 0, 1) : 1;
      if (p <= 0) continue;
      const y = rowH * (i + 0.5) + (i % 2 ? 6 : -6);
      const dir = i % 2 ? -1 : 1;
      const x0 = dir > 0 ? -80 : this.w + 80;
      const x1 = x0 + dir * (this.w + 160) * p;
      const pts = [{ x: x0, y }, { x: (x0 + x1) / 2, y: y + (i % 2 ? -8 : 8) }, { x: x1, y }];
      this.wipeStrokes.stroke(pts, { width: rowH * 1.9, color: INK, alpha: a, dryness: 0.3, taperIn: 0.02, taperOut: 0.22, seed: 500 + i, wet: 0.4, bristles: 9 });
    }
    const mid = 1 - Math.abs(tr.t - half) / half;
    const room = tr.to;
    const res = textRes(this.res * 1.4);
    this.wipeGlyph.texture = this.text.get(room ? ROOM_KINDS[room.kind].hanja : '終', {
      size: 140,
      color: room?.el ? mix(INKS[room.el].color, PAPER_LIGHT, 0.35) : PAPER_LIGHT,
      weight: 900,
      res,
    });
    this.wipeGlyph.scale.set((1 + 0.06 * mid) / res);
    this.wipeGlyph.position.set(this.w / 2, this.h / 2);
    this.wipeGlyph.alpha = clamp(mid * 2.2 - 0.5, 0, 1) * a;
    this.wipeStrokes.end();
  }

  /* 다섯 벼루 — 가운데 짙은 것이 굳은 먹, 둘레의 윤기 나는 것이 젖은 먹. 붉은 고리가 태과 문턱 */
  private wells(g: Game): void {
    const n = INK_ORDER.length;
    const gap = 76;
    const x0 = this.w / 2 - ((n - 1) * gap) / 2;
    const y = this.h - 58;
    const t = g.time;
    const rOf = (v: number): number => 4 + 13 * Math.sqrt(v / INK_MAX);
    INK_ORDER.forEach((id, i) => {
      const x = x0 + i * gap;
      const v = g.ink.values[id];
      const lk = g.ink.locked[id];
      const d = INKS[id];
      const dom = g.ink.dominant === id;
      const ex = g.ink.excess === id;
      if (ex) {
        // 넘친 먹이 벼루 둘레로 번진다
        const pulse = 1 + 0.08 * Math.sin(t * 6 + i);
        this.frame(`wash/${i % 4}`, x, y + 2, (0.95 * pulse * 30) / 30, d.color, 0.55);
      }
      this.frame('well', x, y, 0.82, null, 0.95);
      if (v > 0) {
        // 젖은 먹은 옅고 윤기 있게, 굳은 먹은 가운데에 짙게
        const wet = mix(d.color, PAPER_LIGHT, id === 'baek' ? 0 : 0.22);
        this.frame(`blob/${i}`, x, y, rOf(v) / BLOB_R, wet, 0.95);
        if (v - lk > 0.5) this.frame(`blob/${(i + 3) % 6}`, x - rOf(v) * 0.34, y - rOf(v) * 0.36, (rOf(v) * 0.2) / BLOB_R, PAPER_LIGHT, 0.5);
      }
      if (lk > 0) this.frame(`blob/${(i + 1) % 6}`, x, y, rOf(lk) / BLOB_R, mix(d.color, INK, id === 'baek' ? 0.45 : 0.3), 1);
      // 태과 문턱 — 이 고리를 넘으면 넘친다
      const rx = rOf(EXCESS_AT) + 1.5;
      this.topStrokes.stroke(arcPoints(x, y, rx, i * 1.3, TAU * 0.96, 26, rx), {
        width: ex ? 2 : 1.2,
        color: SEAL,
        alpha: ex ? 0.9 : v > EXCESS_AT * 0.55 ? 0.5 : 0.18,
        dryness: 0.55,
        taperIn: 0.1,
        taperOut: 0.1,
        seed: 300 + i,
      });
      if (ex) {
        // 벼루 가장자리에서 먹이 흘러내린다
        for (let k = 0; k < 2; k++) {
          const ph = (t * 0.7 + k * 0.5 + i * 0.13) % 1;
          const sx = x + (k ? 17 : -17);
          this.frame(`blob/${(k + i) % 6}`, sx + (k ? 3 : -3) * ph, y + 10 + ph * 18, (4.4 * (1 - ph * 0.45)) / BLOB_R, d.color, 0.95 * (1 - ph * ph));
        }
      }
      const labelCol = id === 'baek' ? ([110, 106, 98] as RGB) : d.edge;
      this.label(d.hanja, x, y - 38, { size: dom ? 20 : 16, color: labelCol, halo: 2.4, weight: 900 }, 0.5, 0.5, dom ? 1 : 0.75);
      this.label(`${Math.round(v)}`, x, y + 34, { size: 13, color: ex ? SEAL : INK, halo: 2, weight: 700 }, 0.5, 0.5, v > 0 ? 0.85 : 0.4);
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
    // 태과 — 무엇을 얻고 무엇을 치르는지
    const ex = g.ink.excess;
    if (ex) {
      const c = EXCESS_COST[ex];
      const pulse = 0.8 + 0.2 * Math.sin(t * 5);
      this.label(`太過 · 상극 ×1.8 · 약점 없음 — ${c.title}: ${c.cost}`, this.w / 2, y - 66, { size: 14, color: SEAL, halo: 2.4, weight: 900 }, 0.5, 0.5, pulse);
    }
  }

  /* 지닌 물건 — 왼쪽 아래에 인장처럼 */
  private belongings(g: Game): void {
    const list = g.artifactOrder;
    if (!list.length) return;
    const m = 26;
    const size = 26;
    // 벼루와 겹치지 않을 만큼만 한 줄에 놓고, 넘치면 위로 쌓는다
    const perRow = Math.max(3, Math.min(8, Math.floor((this.w / 2 - 190 - m) / (size + 6))));
    const rows = Math.ceil(list.length / perRow);
    const yOf = (r: number): number => this.h - m - size / 2 - (rows - 1 - r) * (size + 6);
    this.label('지닌 물건', m, yOf(0) - size + 2, { size: 12, color: DAMMUK, halo: 2, weight: 700 }, 0, 0.5);
    list.forEach((id, i) => {
      const a = ARTIFACTS[id];
      const y = yOf(Math.floor(i / perRow));
      const x = m + size / 2 + (i % perRow) * (size + 6);
      const col = a.ink === 'baek' ? ([150, 146, 138] as RGB) : INKS[a.ink].color;
      this.strokes.stroke([{ x: x - size / 2 + 2, y }, { x: x + size / 2 - 2, y: y - 0.5 }], { width: size - 2, color: col, alpha: 0.9, dryness: 0.2, taperIn: 0, taperOut: 0, seed: 400 + i, wet: 0.2 });
      this.label(a.glyph, x, y + 0.5, { size: 15, color: a.ink === 'baek' || a.ink === 'hwang' ? INK : PAPER_LIGHT, weight: 900 });
    });
  }

  private banner(g: Game): void {
    const b = g.banner;
    if (!b) return;
    const inA = clamp(b.t / 0.35, 0, 1);
    const outA = clamp((b.dur - b.t) / 0.6, 0, 1);
    const a = Math.min(inA, outA);
    const x = this.w / 2;
    const y = this.h * (b.low ? 0.68 : 0.24);
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
