import { TAU, clamp, dist, rand, randInt, shuffle, weighted } from '../core/math';
import type { SoundEvent } from '../audio';
import { randomSeed } from '../core/rng';
import { INKS, INK_ORDER, InkState, type InkId, affinity, counterOf, inkColor } from '../ink';
import { type RGB, DAMMUK, INK, SEAL } from '../render/color';
import { BRUSH_WIELDER, type CharacterDef, critChance } from './characters';
import { TIGER_BODY, tigerHitCircles, untouchable, updateTiger } from './boss';
import { ENEMY_KINDS, makeEnemy, thinkEnemy } from './enemies';
import { type Item, rollRewards, springItems, startingItems } from './items';
import { BASE_DAMAGE, type Move, inShape, shapeCenter } from './moves';
import {
  type Beat,
  CHAPTER,
  ENTRANCE,
  GATE_R,
  GATE_Y,
  OBSTACLE_SQUASH,
  ROOM_KINDS,
  type RoomDef,
  type RoomLayout,
  WALL_TOP,
  encounter,
  firstRoom,
  gateXs,
  holdDuration,
  hpScale,
  makeLayout,
  nextRooms,
} from './rooms';
import {
  type Action,
  type Banner,
  type Enemy,
  type EnemyKind,
  type FloatText,
  type Gate,
  type Particle,
  type Pickup,
  type Player,
  type Projectile,
  type ProjectileKind,
  type Ring,
  type RingKind,
  type Stamp,
  type Trace,
  type Transition,
  WALL,
  WORLD_H,
  WORLD_W,
  type Zone,
  type ZoneKind,
} from './types';

export type Phase = 'title' | 'reward' | 'play' | 'over' | 'won';
/** 탐험: 방을 열어 나간다. 끝없는 물결: 한 방에서 계속 버틴다. */
export type Mode = 'explore' | 'endless';
/** 방의 진행 — 싸우는 중, 다 그려 내는 중(낙관), 샘, 문이 열림 */
export type RoomPhase = 'fight' | 'clearing' | 'spring' | 'open';

export interface InputFrame {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  attack: boolean;
  dash: boolean;
}

interface WaveState {
  /** 모두 쓰러뜨린 뒤 보상 화면까지 남은 시간 */
  clearT: number;
  n: number;
  themes: InkId[];
  t: number;
  duration: number;
  spawnAcc: number;
  spawning: boolean;
  hpMul: number;
  rate: number;
  packT: number;
}

const DASH_TIME = 0.17;
const DASH_SPEED = 680;
const DASH_CD = 0.85;
const PICKUP_MAGNET = 70;
/** 동작이 끝난 뒤 다음 타로 이어 갈 수 있는 시간 */
const COMBO_WINDOW = 0.5;
/** 마무리 구간의 이 비율이 지나면 다음 타로 끊고 들어갈 수 있다 */
const CANCEL_AT = 0.3;
/** 공격의 판정 높이(발밑에서 몸통까지) */
const TORSO = 14;

function makePlayer(c: CharacterDef): Player {
  return {
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    r: 14,
    vx: 0,
    vy: 0,
    hp: c.maxHp,
    maxHp: c.maxHp,
    speed: c.speed,
    aim: 0,
    facing: 1,
    walk: 0,
    moving: false,
    invuln: 0,
    hurtT: 0,
    dashT: 0,
    dashCd: 0,
    dashDx: 1,
    dashDy: 0,
    trail: [],
    trailFade: 0,
    action: null,
    comboStep: 0,
    comboT: 0,
    queued: false,
    brushAngle: 0,
    attackSpeed: 1,
    moveMul: 1,
    dashCdMul: 1,
    kx: 0,
    ky: 0,
  };
}

export class Game {
  phase: Phase = 'title';
  mode: Mode = 'explore';
  paused = false;
  character: CharacterDef = BRUSH_WIELDER;
  ink = new InkState();
  player: Player = makePlayer(this.character);
  enemies: Enemy[] = [];
  traces: Trace[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  particles: Particle[] = [];
  texts: FloatText[] = [];
  rings: Ring[] = [];
  pickups: Pickup[] = [];
  /** 바탕 그림에 새길 먹 자국 — 화면이 꺼내 간다 */
  stamps: Stamp[] = [];
  /** 물결이 끝나 바탕의 먹 자국을 옅게 할 차례 */
  fadeStains = false;
  /** 이번 프레임에 날 소리 — main이 꺼내 간다 */
  sounds: SoundEvent[] = [];

  time = 0;
  runTime = 0;
  shake = 0;
  /** 마무리 일격 때 화면이 살짝 다가오는 정도 */
  punch = 0;
  /** 물결을 넘긴 순간 시간이 느려진다 */
  timeScale = 1;
  hitstop = 0;
  hurtFlash = 0;
  kills = 0;
  bestCombo = 0;
  waveNo = 0;
  wave: WaveState | null = null;
  nextThemes: InkId[] = [];
  rewards: Item[] = [];
  rewardTitle = '';
  banner: Banner | null = null;
  /** 주속성이 바뀐 순간의 연출 */
  switchFx: { ink: InkId | null; t: number } | null = null;

  /* 탐험 */
  room: RoomDef = firstRoom();
  layout: RoomLayout = { obstacles: [], pond: null };
  roomPhase: RoomPhase = 'fight';
  /** 방이 바뀔 때마다 오른다 — 화면이 그림을 새로 그린다 */
  roomVersion = 0;
  /** 방을 다 그려 낼 때마다 오른다 — 화면이 낙관을 찍고 화첩에 담는다 */
  clearedVersion = 0;
  /** 이번 판에 다 그려 낸 방들 */
  cleared: RoomDef[] = [];
  gates: Gate[] = [];
  transition: Transition | null = null;
  private beats: Beat[] = [];
  private beatIndex = 0;
  private beatDelay = 0;
  private clearT = 0;
  private rewardFor: 'start' | 'clear' | 'spring' | 'wave' = 'start';

  onPhase: ((p: Phase) => void) | null = null;

  constructor() {
    this.ink.onSwitch = (_from, to) => {
      this.switchFx = { ink: to, t: 0 };
      this.sounds.push({ type: 'switch', ink: to });
      const pl = this.player;
      const col = inkColor(to);
      this.addRing('enso', pl.x, pl.y - 18, 20, 120, 0.8, 11, col);
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU;
        this.addParticle(pl.x, pl.y - 18, Math.cos(a) * rand(140, 280), Math.sin(a) * rand(140, 280), rand(2, 5), col, 0.85, rand(0.4, 0.8), true);
      }
      this.stamps.push({ kind: 'splat', x: pl.x, y: pl.y, r: 34, color: col, alpha: 0.4, seed: randomSeed() % 100000, rot: Math.random() * TAU, wet: 1 });
      // 새 먹의 첫 타부터
      pl.comboStep = 0;
    };
  }

  /* ───────── 흐름 ───────── */

  setPhase(p: Phase): void {
    this.phase = p;
    this.onPhase?.(p);
  }

  startRun(mode: Mode = this.mode): void {
    this.mode = mode;
    this.ink.reset();
    this.player = makePlayer(this.character);
    this.clearField();
    this.kills = 0;
    this.waveNo = 0;
    this.runTime = 0;
    this.wave = null;
    this.hurtFlash = 0;
    this.switchFx = null;
    this.cleared = [];
    this.transition = null;
    this.banner = null;
    if (mode === 'explore') {
      this.setRoom(firstRoom());
      this.nextThemes = this.room.el ? [this.room.el] : [];
    } else {
      this.setRoom({ kind: 'hold', el: null, depth: 0, seed: 20261021 });
      this.nextThemes = this.rollThemes(1);
    }
    this.rewards = startingItems();
    this.rewardTitle = '첫 먹을 고르다';
    this.rewardFor = 'start';
    this.setPhase('reward');
  }

  chooseReward(item: Item): void {
    if (this.phase !== 'reward') return;
    if (item.deltas) this.ink.apply(item.deltas);
    item.apply?.(this);
    if (this.mode === 'endless') this.beginWave(this.waveNo + 1);
    else if (this.rewardFor === 'start') this.beginRoom();
    else this.openGates();
    this.setPhase('play');
  }

  /** 싸움터에 남은 것들을 모두 걷는다 */
  private clearField(): void {
    this.enemies = [];
    this.traces = [];
    this.projectiles = [];
    this.zones = [];
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.pickups = [];
    this.stamps = [];
    this.gates = [];
  }

  /** 새 그림 한 폭을 펼친다 */
  private setRoom(def: RoomDef): void {
    this.room = def;
    this.layout = makeLayout(def);
    this.roomVersion++;
    this.roomPhase = def.kind === 'spring' ? 'spring' : 'fight';
    const pl = this.player;
    pl.x = ENTRANCE.x;
    pl.y = ENTRANCE.y;
    pl.vx = 0;
    pl.vy = 0;
    pl.action = null;
    pl.queued = false;
    pl.trail = [];
  }

  private enterRoom(def: RoomDef): void {
    this.clearField();
    this.wave = null;
    this.setRoom(def);
    this.beginRoom();
  }

  /** 방에 들어선 순간 — 먹귀가 솟거나 샘이 기다린다 */
  private beginRoom(): void {
    const def = this.room;
    const info = ROOM_KINDS[def.kind];
    const where = `${CHAPTER.name} · ${numeral(def.depth + 1)} 방`;
    if (def.kind === 'spring') {
      this.roomPhase = 'spring';
      this.banner = { title: where, sub: '샘에 다가가 먹을 씻는다', t: 0, dur: 2.6, color: INK };
      return;
    }
    this.roomPhase = 'fight';
    const el = def.el ? INKS[def.el].hanja : '';
    if (def.kind === 'boss') {
      // 주인은 담장 위에서 내려다보다 뛰어내린다 — 이름은 포효할 때 걸린다
      this.beats = [];
      this.beatIndex = 0;
      this.beatDelay = 0;
      this.addEnemy('tiger', def.el ?? 'heuk', WORLD_W / 2, 150, 1, false);
      this.sounds.push({ type: 'wave' });
      return;
    }
    this.banner = { title: where, sub: `${el} 먹귀 · ${info.name} — ${info.desc}`, t: 0, dur: 2.8, color: INK };
    this.sounds.push({ type: 'wave' });
    if (def.kind === 'hold') {
      this.wave = {
        clearT: 0,
        n: def.depth + 1,
        themes: def.el ? [def.el] : this.rollThemes(1),
        t: 0,
        duration: holdDuration(def),
        spawnAcc: 0,
        spawning: true,
        hpMul: hpScale(def.depth),
        rate: 1.1 + def.depth * 0.35,
        packT: rand(5, 8),
      };
    } else {
      this.beats = encounter(def);
      this.beatIndex = 0;
      this.beatDelay = 1.1;
    }
  }

  private updateRoom(dt: number): void {
    const def = this.room;
    if (this.roomPhase === 'fight') {
      if (def.kind === 'hold') {
        this.updateWave(dt);
        return;
      }
      this.beatDelay -= dt;
      const alive = this.enemies.length;
      const beat = this.beats[this.beatIndex];
      if (beat && this.beatDelay <= 0 && alive <= beat.trigger) {
        this.spawnBeat(beat);
        this.beatIndex++;
        this.beatDelay = 1.4;
      }
      if (!beat && alive === 0) this.startClearing();
    } else if (this.roomPhase === 'clearing') {
      this.clearT -= dt / Math.max(0.25, this.timeScale);
      if (this.clearT <= 0) this.offerClearRewards();
    } else if (this.roomPhase === 'spring') {
      const pond = this.layout.pond;
      const pl = this.player;
      if (pond && Math.hypot(pl.x - pond.x, (pl.y - pond.y) / 0.6) < pond.r * 0.95) {
        this.healPlayer(10);
        this.rewards = springItems(this.ink.values, this.ink.dominant);
        this.rewardTitle = '샘에서 먹을 씻다';
        this.rewardFor = 'spring';
        this.roomPhase = 'clearing';
        this.clearT = 0;
        this.cleared.push(def);
        this.clearedVersion++;
        this.setPhase('reward');
      }
    } else if (this.roomPhase === 'open') {
      this.updateGates(dt);
    }
  }

  private spawnBeat(beat: Beat): void {
    const def = this.room;
    const hp = hpScale(def.depth) * (def.kind === 'elite' ? 1.15 : 1);
    for (const [kind, n] of beat.groups) {
      // 같은 무리는 한 자리 근처에서 솟는다
      const c = this.findSpawn(340);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = kind === 'brute' ? 0 : rand(10, 60);
        const p = this.freeSpot(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.7, ENEMY_KINDS[kind].r);
        this.addEnemy(kind, this.roomElement(), p.x, p.y, hp);
      }
    }
  }

  /** 방 먹귀의 속성 — 가끔 다른 먹이 섞인다 */
  private roomElement(): InkId {
    const el = this.room.el;
    if (el && Math.random() < 0.85) return el;
    return INK_ORDER[Math.floor(Math.random() * 5)];
  }

  /** 마지막 먹귀가 쓰러진 순간 — 낙관을 찍는다 */
  private startClearing(): void {
    this.roomPhase = 'clearing';
    this.clearT = 1.7;
    this.timeScale = 0.25;
    this.cleared.push(this.room);
    this.clearedVersion++;
    this.sounds.push({ type: 'seal' });
    this.banner =
      this.room.kind === 'boss'
        ? { title: '대숲의 주인을 그려 내다', sub: `${CHAPTER.name}의 마지막 폭에 낙관을 찍는다`, t: 0, dur: 2.4, color: INK }
        : { title: '한 폭을 그려 내다', sub: `${CHAPTER.name} · ${numeral(this.room.depth + 1)} 방에 낙관을 찍는다`, t: 0, dur: 2.0, color: INK };
  }

  private offerClearRewards(): void {
    const def = this.room;
    this.absorbPickups();
    this.rewards = rollRewards(this.ink.values, this.ink.dominant, { guarantee: def.el, relic: def.kind === 'elite' || def.kind === 'boss' });
    this.rewardTitle = `${numeral(def.depth + 1)} 방을 그려 내다`;
    this.rewardFor = 'clear';
    const pl = this.player;
    pl.action = null;
    pl.queued = false;
    this.setPhase('reward');
  }

  /** 남은 먹방울은 저절로 스며든다 */
  private absorbPickups(): void {
    const sum: Partial<Record<InkId, number>> = {};
    for (const pk of this.pickups) if (!pk.dead) sum[pk.ink] = (sum[pk.ink] ?? 0) + pk.amount;
    this.ink.apply(sum);
    this.pickups = [];
  }

  /** 담장에 달문을 그린다 */
  private openGates(): void {
    const next = nextRooms(this.room);
    const rooms: (RoomDef | null)[] = next.length ? next : [null];
    const xs = gateXs(rooms.length);
    this.gates = rooms.map((room, i) => ({ x: xs[i], y: GATE_Y, r: GATE_R, room, open: 0, seed: randomSeed() % 100000 }));
    this.roomPhase = 'open';
    this.sounds.push({ type: 'gate' });
    this.banner = next.length
      ? { title: '문이 열리다', sub: '문에 적힌 먹과 방을 보고 길을 고른다', t: 0, dur: 2.4, color: INK }
      : { title: `${CHAPTER.name}을 다 그리다`, sub: '마지막 문을 지나 화첩을 덮는다', t: 0, dur: 2.6, color: INK };
  }

  private updateGates(dt: number): void {
    const pl = this.player;
    for (const g of this.gates) {
      g.open = Math.min(1, g.open + dt * 1.1);
      if (this.transition || g.open < 0.6) continue;
      if (Math.abs(pl.x - g.x) < g.r * 0.75 && pl.y < WALL_TOP - 12) {
        this.transition = { t: 0, dur: 1.15, to: g.room, swapped: false };
        this.sounds.push({ type: 'ui' });
      }
    }
  }

  /** 문을 지나는 동안: 화면을 먹으로 덮었다가 새 방을 펼친다 */
  private updateTransition(realDt: number): void {
    const tr = this.transition;
    if (!tr) return;
    tr.t += realDt;
    if (!tr.swapped && tr.t >= tr.dur * 0.5) {
      tr.swapped = true;
      if (tr.to) this.enterRoom(tr.to);
      else this.win();
    }
    if (tr.t >= tr.dur) this.transition = null;
  }

  private win(): void {
    this.clearField();
    this.setPhase('won');
  }

  /** 문 쪽 담장 틈으로는 지나갈 수 있다 */
  private topLimit(x: number): number {
    if (this.roomPhase === 'open') {
      for (const g of this.gates) if (g.open > 0.6 && Math.abs(x - g.x) < g.r * 0.75) return GATE_Y + 6;
    }
    return WALL_TOP;
  }

  /** 바위와 대숲에 막힌다 — 바닥 둘레(납작한 타원) 밖으로 밀어낸다 */
  pushOut(p: { x: number; y: number }, r: number): boolean {
    let hit = false;
    for (const o of this.layout.obstacles) {
      const dx = p.x - o.x;
      const dy = (p.y - o.y) / OBSTACLE_SQUASH;
      const d = Math.hypot(dx, dy);
      const min = o.r + r;
      if (d < min && d > 0.0001) {
        p.x = o.x + (dx / d) * min;
        p.y = o.y + (dy / d) * min * OBSTACLE_SQUASH;
        hit = true;
      }
    }
    return hit;
  }

  private inPond(x: number, y: number): boolean {
    const pond = this.layout.pond;
    return !!pond && Math.hypot(x - pond.x, (y - pond.y) / 0.6) < pond.r;
  }

  insideObstacle(x: number, y: number, pad: number): boolean {
    for (const o of this.layout.obstacles) if (Math.hypot(x - o.x, (y - o.y) / OBSTACLE_SQUASH) < o.r + pad) return true;
    const pond = this.layout.pond;
    return !!pond && Math.hypot(x - pond.x, (y - pond.y) / 0.6) < pond.r + pad;
  }

  /** 붓잡이와 떨어진, 막히지 않은 자리 */
  findSpawn(minDist: number): { x: number; y: number } {
    const pl = this.player;
    let best = { x: WORLD_W / 2, y: WALL_TOP + 80 };
    let bestD = -1;
    for (let i = 0; i < 40; i++) {
      const x = rand(WALL + 50, WORLD_W - WALL - 50);
      const y = rand(WALL_TOP + 40, WORLD_H - WALL - 40);
      if (this.insideObstacle(x, y, 40)) continue;
      const d = Math.hypot(x - pl.x, y - pl.y);
      if (d >= minDist) return { x, y };
      if (d > bestD) {
        bestD = d;
        best = { x, y };
      }
    }
    return best;
  }

  freeSpot(x: number, y: number, r: number): { x: number; y: number } {
    const p = { x: clamp(x, WALL + r, WORLD_W - WALL - r), y: clamp(y, WALL_TOP + r, WORLD_H - WALL - r) };
    this.pushOut(p, r);
    return p;
  }

  private rollThemes(n: number): InkId[] {
    const order = shuffle([...INK_ORDER]);
    return n === 1 ? [order[0]] : [order[0], order[1]];
  }

  private beginWave(n: number): void {
    this.wave = {
      clearT: 0,
      n,
      themes: this.nextThemes,
      t: 0,
      duration: Math.min(24 + n * 3, 48),
      spawnAcc: 0,
      spawning: true,
      hpMul: 1 + (n - 1) * 0.14,
      rate: Math.min(0.9 + n * 0.32, 4.4),
      packT: rand(6, 10),
    };
    this.sounds.push({ type: 'wave' });
    const names = this.wave.themes.map((t) => INKS[t].hanja).join(' · ');
    this.banner = { title: `${numeral(n)} 물결`, sub: `${names} 먹귀가 몰려온다`, t: 0, dur: 2.6, color: INK };
  }

  private endWave(): void {
    if (!this.wave) return;
    this.waveNo = this.wave.n;
    this.wave = null;
    this.nextThemes = this.rollThemes(this.waveNo + 1);
    this.rewards = rollRewards(this.ink.values, this.ink.dominant);
    this.rewardTitle = `${numeral(this.waveNo)} 물결을 넘기다`;
    this.rewardFor = 'wave';
    this.fadeStains = true;
    this.absorbPickups();
    const pl = this.player;
    pl.action = null;
    pl.queued = false;
    this.setPhase('reward');
  }

  /** 다음 물결 먹귀를 이기는 먹 */
  counterHints(): InkId[] {
    return this.nextThemes.map(counterOf);
  }

  /* ───────── 갱신 ───────── */

  update(realDt: number, input: InputFrame): void {
    this.timeScale += (1 - this.timeScale) * Math.min(1, realDt * 2.5);
    const dt = realDt * this.timeScale;
    this.time += dt;
    this.updateCosmetics(dt);
    if (this.paused) return;
    this.updateTransition(realDt);
    if (this.phase !== 'play') return;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    this.runTime += dt;
    if (this.mode === 'endless') this.updateWave(dt);
    else this.updateRoom(dt);
    // 문을 지나는 동안은 붓잡이가 멈춘다
    if (this.transition) input = { ...input, moveX: 0, moveY: -0.4, attack: false, dash: false };
    this.updatePlayer(dt, input);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updatePickups(dt);
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.player.hp <= 0) this.die();
  }

  /** 멈춰 있어도 흘러가는 연출들 */
  private updateCosmetics(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 30);
    this.punch = Math.max(0, this.punch - dt * 5);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }
    if (this.switchFx) {
      this.switchFx.t += dt;
      if (this.switchFx.t > 1.5) this.switchFx = null;
    }
    for (const tr of this.traces) tr.t += dt;
    this.traces = this.traces.filter((tr) => tr.t < tr.draw + tr.fade);
    for (const p of this.particles) {
      p.life -= dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.vy -= p.rise * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0 && p.stain) {
        this.stamps.push({ kind: 'blob', x: p.x, y: p.y, r: p.r * 0.9, color: p.color, alpha: 0.25 * p.alpha, seed: p.seed, rot: 0, wet: 0.3 });
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-3 * dt);
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    const pl = this.player;
    pl.trailFade = Math.max(0, pl.trailFade - dt);
    if (pl.trailFade <= 0 && pl.dashT <= 0) pl.trail = [];
  }

  private updateWave(dt: number): void {
    const w = this.wave;
    if (!w) return;
    w.t += dt;
    if (w.spawning) {
      w.spawnAcc += dt * w.rate * (0.75 + 0.5 * Math.min(1, w.t / w.duration));
      while (w.spawnAcc >= 1) {
        w.spawnAcc -= 1;
        this.spawnOne(w);
      }
      w.packT -= dt;
      if (w.packT <= 0) {
        w.packT = rand(7, 12);
        this.spawnPack(w);
      }
      if (w.t >= w.duration) w.spawning = false;
    } else if (this.enemies.length === 0) {
      if (this.mode === 'explore') {
        this.wave = null;
        this.startClearing();
        return;
      }
      if (w.clearT === 0) {
        // 마지막 먹귀가 쓰러지는 순간을 천천히
        w.clearT = 1.6;
        this.timeScale = 0.25;
        this.banner = { title: '물결을 넘기다', sub: '먹이 마르기 전에 다음 먹을 고르라', t: 0, dur: 1.9, color: INK };
      }
      w.clearT -= dt / Math.max(0.25, this.timeScale);
      if (w.clearT <= 0) this.endWave();
    }
  }

  private themedElement(w: WaveState): InkId {
    if (w.themes.length === 1 || Math.random() < 0.65) return w.themes[0];
    return w.themes[1];
  }

  private spawnOne(w: WaveState): void {
    const n = w.n;
    const kind = weighted<EnemyKind>([
      ['drop', 10],
      ['swallow', n >= 2 ? 3 + n : 0],
      ['toad', n >= 3 ? 2 + n * 0.5 : 0],
      ['brute', n >= 4 ? 0.8 + n * 0.25 : 0],
    ]);
    const p = this.findSpawn(420);
    this.addEnemy(kind, this.themedElement(w), p.x, p.y, w.hpMul);
  }

  /** 한 자리에서 먹방울이 무더기로 솟는다 */
  private spawnPack(w: WaveState): void {
    const c = this.findSpawn(420);
    const el = this.themedElement(w);
    const count = randInt(4, 6 + Math.floor(w.n / 2));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const r = rand(0, 46);
      const p = this.freeSpot(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 13);
      this.addEnemy('drop', el, p.x, p.y, w.hpMul);
    }
  }

  addEnemy(kind: EnemyKind, el: InkId, x: number, y: number, hpMul = 1, rise = true): Enemy {
    const e = makeEnemy(kind, el, x, y, hpMul);
    this.enemies.push(e);
    if (!rise) {
      e.spawnT = 0;
      return e;
    }
    this.stamps.push({ kind: 'splat', x, y: y + 2, r: e.r * 1.1, color: inkColor(el), alpha: 0.32, seed: e.seed, rot: Math.random() * TAU, wet: 1 });
    this.addRing('spawn', x, y, e.r * 0.4, e.r * 2.2, 0.6, 3, inkColor(el));
    return e;
  }

  /* ───────── 붓잡이 ───────── */

  private updatePlayer(dt: number, input: InputFrame): void {
    const pl = this.player;
    pl.invuln = Math.max(0, pl.invuln - dt);
    pl.hurtT = Math.max(0, pl.hurtT - dt);
    pl.dashCd = Math.max(0, pl.dashCd - dt);
    if (!pl.action) {
      pl.comboT = Math.max(0, pl.comboT - dt);
      if (pl.comboT <= 0) pl.comboStep = 0;
    }

    pl.aim = Math.atan2(input.aimY - (pl.y - TORSO), input.aimX - pl.x);
    const act = pl.action;
    const lockedAim = act && act.phase !== 'windup' ? act.aim : pl.aim;
    pl.facing = Math.cos(lockedAim) >= 0 ? 1 : -1;

    let mx = input.moveX;
    let my = input.moveY;
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }

    if (input.dash && pl.dashCd <= 0 && pl.dashT <= 0) this.startDash(mx, my, ml);

    if (input.attack) pl.queued = true;

    if (pl.dashT > 0) {
      pl.dashT -= dt;
      pl.vx = pl.dashDx * DASH_SPEED;
      pl.vy = pl.dashDy * DASH_SPEED;
      pl.trail.push({ x: pl.x, y: pl.y - 8 });
      pl.trailFade = 0.45;
    } else {
      let mul = pl.moveMul;
      if (pl.action) mul *= pl.action.phase === 'recovery' ? 0.65 : pl.action.move.moveMul ?? 0.4;
      const target = pl.speed * mul;
      const k = 1 - Math.exp(-14 * dt);
      pl.vx += (mx * target - pl.vx) * k;
      pl.vy += (my * target - pl.vy) * k;
    }
    const kd = Math.exp(-7 * dt);
    pl.kx *= kd;
    pl.ky *= kd;
    pl.x = clamp(pl.x + (pl.vx + pl.kx) * dt, WALL, WORLD_W - WALL);
    pl.y = clamp(pl.y + (pl.vy + pl.ky) * dt, this.topLimit(pl.x), WORLD_H - WALL);
    this.pushOut(pl, pl.r);
    const sp = Math.hypot(pl.vx, pl.vy);
    pl.moving = sp > 30;
    if (pl.moving) pl.walk += dt * (sp / 26);

    if (pl.action) this.advanceAction(pl.action, dt);
    if (!pl.action && pl.queued && pl.dashT <= 0) this.startMove();
    if (!input.attack && !pl.action) pl.queued = false;
  }

  private startDash(mx: number, my: number, ml: number): void {
    const pl = this.player;
    const dx = ml > 0.1 ? mx : Math.cos(pl.aim);
    const dy = ml > 0.1 ? my : Math.sin(pl.aim);
    const l = Math.hypot(dx, dy) || 1;
    pl.dashDx = dx / l;
    pl.dashDy = dy / l;
    pl.dashT = DASH_TIME;
    pl.dashCd = DASH_CD * pl.dashCdMul;
    pl.invuln = Math.max(pl.invuln, DASH_TIME + 0.06);
    pl.trail = [{ x: pl.x, y: pl.y - 8 }];
    this.sounds.push({ type: 'dash' });
    // 대시는 동작을 끊는다
    pl.action = null;
    pl.comboStep = 0;
    pl.comboT = 0;
    for (let i = 0; i < 6; i++) {
      this.addParticle(pl.x, pl.y, -pl.dashDx * rand(60, 160) + rand(-40, 40), -pl.dashDy * rand(60, 160) + rand(-40, 40), rand(1.5, 3.5), DAMMUK, 0.7, rand(0.3, 0.6), true);
    }
  }

  private startMove(): void {
    const pl = this.player;
    const combo = this.character.combo(this.ink.dominant);
    const step = pl.comboStep % combo.length;
    const move = combo[step];
    pl.action = {
      move,
      step,
      ink: this.ink.dominant,
      potency: this.ink.potency,
      aim: pl.aim,
      dir: step % 2 === 0 ? 1 : -1,
      t: 0,
      phase: 'windup',
      ox: pl.x,
      oy: pl.y - TORSO,
      hits: new Map(),
      seed: randomSeed() % 100000,
      heals: 0,
      speed: pl.attackSpeed,
    };
    pl.comboStep = (step + 1) % combo.length;
    pl.queued = false;
  }

  private advanceAction(a: Action, dt: number): void {
    const pl = this.player;
    const m = a.move;
    a.t += dt * a.speed;
    if (a.phase === 'windup') {
      a.aim = pl.aim;
      if (a.t < m.windup) return;
      a.t -= m.windup;
      a.phase = 'active';
      this.beginActive(a);
    }
    if (a.phase === 'active') {
      if (m.shape.type === 'thrust') {
        a.ox = pl.x;
        a.oy = pl.y - TORSO;
      }
      const prog = Math.min(1, a.t / m.active);
      m.onTick?.(this, a, dt, prog);
      this.resolveHits(a, prog);
      if (a.t < m.active) return;
      a.t -= m.active;
      a.phase = 'recovery';
      m.onEnd?.(this, a);
    }
    if (a.phase === 'recovery') {
      const canCancel = a.t >= m.recovery * CANCEL_AT;
      if (pl.queued && canCancel) {
        pl.action = null;
        this.startMove();
        return;
      }
      if (a.t >= m.recovery) {
        pl.action = null;
        pl.comboT = COMBO_WINDOW;
        if (a.step === 2) pl.comboStep = 0;
      }
    }
  }

  private beginActive(a: Action): void {
    const pl = this.player;
    const m = a.move;
    a.aim = pl.aim;
    a.ox = pl.x;
    a.oy = pl.y - TORSO;
    if (m.lunge) {
      pl.vx += Math.cos(a.aim) * m.lunge;
      pl.vy += Math.sin(a.aim) * m.lunge;
    }
    if (m.shake) this.shake = Math.max(this.shake, m.shake);
    if (a.step === 2) this.punch = 1;
    this.sounds.push(m.visual === 'quake' ? { type: 'quake' } : { type: 'swing', ink: a.ink, step: a.step });
    const c = shapeCenter(a);
    this.traces.push(this.traceFor(m, a.ink, a.step, c.x, c.y, a.aim, a.dir, a.potency, a.speed, a.seed));
    m.onActive?.(this, a);
  }

  /** 동작이 그림 위에 남길 획 */
  traceFor(m: Move, ink: InkId | null, step: number, x: number, y: number, aim: number, dir: 1 | -1, p: number, speed = 1, seed = randomSeed() % 100000): Trace {
    const s = m.shape;
    return {
      visual: m.visual,
      ink,
      step,
      x,
      y,
      aim,
      dir,
      reach: s.type === 'arc' || s.type === 'spin' ? s.reach * (1 + 0.15 * p) : 0,
      arc: s.type === 'arc' ? s.arc : TAU,
      length: s.type === 'thrust' ? s.length * (1 + 0.12 * p) : 0,
      radius: s.type === 'circle' ? s.radius * (1 + 0.15 * p) : 0,
      width: m.width * (1 + 0.25 * p),
      dryness: m.dryness,
      potency: p,
      t: 0,
      draw: m.active / speed,
      fade: m.fade ?? 0.38,
      seed,
    };
  }

  private resolveHits(a: Action, prog: number): void {
    const m = a.move;
    if (m.shape.type === 'none') return;
    const maxHits = m.hits ?? 1;
    for (const e of this.enemies) {
      if (!this.hittable(e)) continue;
      const n = a.hits.get(e.id) ?? 0;
      if (n >= maxHits || prog < n / maxHits) continue;
      if (!this.bodyCircles(e).some((c) => inShape(a, prog, c.x, c.y, c.r))) continue;
      a.hits.set(e.id, n + 1);
      this.applyMoveHit(a, e);
    }
    // 날아오는 먹덩이를 쳐낸다
    for (const pr of this.projectiles) {
      if (!pr.hostile || pr.dead) continue;
      if (inShape(a, prog, pr.x, pr.y, pr.r + 4)) {
        pr.dead = true;
        this.splash(pr.x, pr.y, 9, inkColor(pr.ink), 6);
        this.text(pr.x, pr.y - 16, '破', a.ink ? INKS[a.ink].edge : INK, 15);
      }
    }
  }

  private applyMoveHit(a: Action, e: Enemy): void {
    const m: Move = a.move;
    let dmg = BASE_DAMAGE * m.damage * (1 + 0.6 * a.potency);
    const crit = Math.random() < critChance(a.ink, a.potency);
    if (crit) dmg *= 2;
    const c = shapeCenter(a);
    const ang = Math.atan2(e.y - c.y, e.x - c.x);
    const k = m.knock / e.mass;
    this.damageEnemy(e, dmg, a.ink, { kx: Math.cos(ang) * k, ky: Math.sin(ang) * k, crit });
    if (m.hitstop) this.hitstop = Math.max(this.hitstop, m.hitstop);
    m.onHit?.(this, a, e);
  }

  /* ───────── 먹귀 ───────── */

  private updateEnemies(dt: number): void {
    const pl = this.player;
    for (const e of this.enemies) {
      e.anim += dt;
      e.hitT = Math.max(0, e.hitT - dt);
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        continue;
      }
      e.slowT = Math.max(0, e.slowT - dt);
      e.rootT = Math.max(0, e.rootT - dt);
      e.stunT = Math.max(0, e.stunT - dt);
      if (e.burnStacks > 0) {
        e.burnT -= dt;
        e.burnTick += dt;
        if (e.burnTick >= 0.5) {
          e.burnTick -= 0.5;
          this.damageEnemy(e, e.burnPower * e.burnStacks * 0.5, 'jeok', { quiet: true });
          this.addParticle(e.x + rand(-6, 6), e.y - e.r, rand(-20, 20), rand(-40, -10), rand(1.5, 3), INKS.jeok.color, 0.9, rand(0.4, 0.7), false, 60);
        }
        if (e.burnT <= 0) e.burnStacks = 0;
      }
      if (e.dead) continue;
      e.inPool = false;
      for (const z of this.zones) {
        if (z.kind === 'pool' && Math.hypot(e.x - z.x, e.y - z.y) < z.r + e.r * 0.5) {
          e.inPool = true;
          break;
        }
      }
      if (e.boss) updateTiger(this, e, dt);
      else thinkEnemy(this, e, dt);
      const kdamp = Math.exp(-7 * dt);
      e.kx *= kdamp;
      e.ky *= kdamp;
      e.x += (e.vx + e.kx) * dt;
      e.y += (e.vy + e.ky) * dt;
    }

    // 서로 밀어낸다
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      if (a.spawnT > 0 || a.dead) continue;
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        if (b.spawnT > 0 || b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 0.0001) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) / d;
        const wa = b.mass / (a.mass + b.mass);
        const wb = 1 - wa;
        a.x -= dx * push * wa * 0.5;
        a.y -= dy * push * wa * 0.5;
        b.x += dx * push * wb * 0.5;
        b.y += dy * push * wb * 0.5;
      }
    }

    for (const e of es) {
      if (e.dead || e.spawnT > 0) continue;
      if (e.boss) {
        this.tigerContact(e);
        continue;
      }
      e.x = clamp(e.x, WALL, WORLD_W - WALL);
      e.y = clamp(e.y, WALL_TOP, WORLD_H - WALL);
      this.pushOut(e, e.r * 0.8);
      const dx = e.x - pl.x;
      const dy = e.y - pl.y;
      const d = Math.hypot(dx, dy) || 1;
      const rr = e.r + pl.r;
      if (d < rr) {
        // 붓잡이를 파고들지 못하게
        e.x = pl.x + (dx / d) * rr;
        e.y = pl.y + (dy / d) * rr;
        if (e.stunT <= 0) this.hurtPlayer(e.dmg, e.el);
      }
    }
  }

  /** 묵호는 무거워서 붓잡이를 밀어낸다. 닿기만 해서는 다치지 않는다 — 다치는 건 할퀴기·덮치기·내달리기 */
  private tigerContact(e: Enemy): void {
    const b = e.boss!;
    if (b.move === 'perch' || b.move === 'descend') return;
    e.x = clamp(e.x, WALL + 30, WORLD_W - WALL - 30);
    e.y = clamp(e.y, WALL_TOP + 10, WORLD_H - WALL);
    if (b.z > 0 || b.move === 'die') return;
    this.pushOut(e, e.r * 0.8);
    const pl = this.player;
    const rx = TIGER_BODY.rx + pl.r;
    const ry = TIGER_BODY.ry + pl.r;
    const dx = pl.x - e.x;
    const dy = pl.y - e.y;
    const k = Math.hypot(dx / rx, dy / ry);
    if (k < 1 && pl.dashT <= 0) {
      const s = k > 0.0001 ? 1 / k : 1;
      pl.x = e.x + (k > 0.0001 ? dx : 1) * s;
      pl.y = e.y + (k > 0.0001 ? dy : 0) * s;
      this.pushOut(pl, pl.r);
    }
  }

  enemySpit(e: Enemy): void {
    const pl = this.player;
    this.sounds.push({ type: 'spit' });
    const a = Math.atan2(pl.y - TORSO - e.y, pl.x - e.x);
    const sp = 250;
    this.fireProjectile('glob', e.x + Math.cos(a) * e.r, e.y - 6 + Math.sin(a) * e.r, Math.cos(a) * sp, Math.sin(a) * sp, {
      r: 8,
      life: 3,
      dmg: 8,
      knock: 0,
      ink: e.el,
      potency: 0,
      hostile: true,
    });
  }

  fireProjectile(
    kind: ProjectileKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    o: { r: number; life: number; dmg: number; knock: number; ink: InkId | null; potency: number; hostile?: boolean },
  ): void {
    this.projectiles.push({
      kind,
      hostile: o.hostile ?? false,
      ink: o.ink,
      x,
      y,
      vx,
      vy,
      r: o.r,
      life: o.life,
      maxLife: o.life,
      dmg: o.dmg,
      knock: o.knock,
      pierce: new Set(),
      seed: randomSeed() % 100000,
      dead: false,
      trail: [],
      potency: o.potency,
      dropAcc: 0,
    });
  }

  private updateProjectiles(dt: number): void {
    const pl = this.player;
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 10) p.trail.shift();
      const out = p.x < WALL || p.y < WALL_TOP - 30 || p.x > WORLD_W - WALL || p.y > WORLD_H - WALL;
      const blocked = p.kind !== 'wave' && this.insideObstacle(p.x, p.y + 10, 0) && !this.inPond(p.x, p.y + 10);
      if (p.life <= 0 || out || blocked) {
        p.dead = true;
        if (p.kind === 'glob') this.splash(p.x, p.y, 10, inkColor(p.ink), 5);
        if (p.kind === 'wave') this.splash(p.x, p.y, 30, INKS.heuk.color, 10);
        continue;
      }
      if (p.kind === 'wave') {
        p.dropAcc += Math.hypot(p.vx, p.vy) * dt;
        if (p.dropAcc > 64) {
          p.dropAcc -= 64;
          this.addZone('pool', p.x, p.y + 14, 30 + 10 * p.potency, 2.4 + 2 * p.potency, 2 + 4 * p.potency, p.potency);
        }
      }
      if (p.hostile) {
        if (dist(p, { x: pl.x, y: pl.y - TORSO }) < p.r + pl.r) {
          p.dead = true;
          this.splash(p.x, p.y, 12, inkColor(p.ink), 7);
          this.hurtPlayer(p.dmg, p.ink);
        }
        continue;
      }
      for (const e of this.enemies) {
        if (!this.hittable(e) || p.pierce.has(e.id)) continue;
        if (this.bodyCircles(e).some((c) => Math.hypot(c.x - p.x, c.y - p.y) < c.r + p.r)) {
          p.pierce.add(e.id);
          const crit = Math.random() < critChance(p.ink, p.potency);
          const a = Math.atan2(p.vy, p.vx);
          const k = p.knock / e.mass;
          this.damageEnemy(e, p.dmg * (crit ? 2 : 1), p.ink, { kx: Math.cos(a) * k, ky: Math.sin(a) * k, crit });
          if (p.kind === 'wave') e.slowT = Math.max(e.slowT, 2);
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  /* ───────── 바닥 ───────── */

  addZone(kind: ZoneKind, x: number, y: number, r: number, life: number, dps: number, potency: number): void {
    const seed = randomSeed() % 100000;
    this.zones.push({ kind, x, y, r, life, maxLife: life, seed, dps, tick: 0, potency });
    if (kind === 'pool') this.stamps.push({ kind: 'blob', x, y, r: r * 0.85, color: INKS.heuk.color, alpha: 0.16, seed, rot: 0, wet: 1 });
    if (kind === 'embers') this.stamps.push({ kind: 'splat', x, y, r: r * 0.7, color: [92, 40, 24], alpha: 0.28, seed, rot: Math.random() * TAU, wet: 0.4 });
    if (kind === 'thorns') this.stamps.push({ kind: 'blob', x, y, r: r * 0.6, color: INKS.cheong.color, alpha: 0.1, seed, rot: 0, wet: 0.6 });
  }

  private updateZones(dt: number): void {
    for (const z of this.zones) {
      z.life -= dt;
      z.tick += dt;
      if (z.tick < 0.5) continue;
      z.tick -= 0.5;
      for (const e of this.enemies) {
        if (!this.hittable(e) || Math.hypot(e.x - z.x, e.y - z.y) > z.r + e.r * 0.5) continue;
        const ink: InkId = z.kind === 'pool' ? 'heuk' : z.kind === 'thorns' ? 'cheong' : 'jeok';
        this.damageEnemy(e, z.dps * 0.5, ink, { quiet: true });
        if (z.kind === 'thorns') e.rootT = Math.max(e.rootT, 0.3);
        if (z.kind === 'embers' && !e.dead) {
          e.burnStacks = Math.min(4, e.burnStacks + 1);
          e.burnT = 3;
          e.burnPower = Math.max(e.burnPower, 3 + 3 * z.potency);
        }
      }
      if (z.kind === 'embers') {
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * TAU;
          const r = Math.random() * z.r;
          this.addParticle(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r * 0.6, rand(-10, 10), rand(-30, -10), rand(1.2, 2.6), INKS.jeok.color, 0.8, rand(0.5, 0.9), false, 50);
        }
      }
    }
    this.zones = this.zones.filter((z) => z.life > 0);
  }

  private updatePickups(dt: number): void {
    const pl = this.player;
    for (const pk of this.pickups) {
      pk.t += dt;
      pk.life -= dt;
      const k = Math.exp(-5 * dt);
      pk.vx *= k;
      pk.vy *= k;
      const dx = pl.x - pk.x;
      const dy = pl.y - 10 - pk.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < PICKUP_MAGNET) {
        const pull = 900 * (1 - d / PICKUP_MAGNET) + 120;
        pk.vx += (dx / d) * pull * dt;
        pk.vy += (dy / d) * pull * dt;
      }
      pk.x += pk.vx * dt;
      pk.y += pk.vy * dt;
      this.pushOut(pk, 6);
      if (d < pl.r + 12) {
        pk.dead = true;
        this.sounds.push({ type: 'pickup', ink: pk.ink });
        this.ink.apply({ [pk.ink]: pk.amount });
        this.text(pl.x + rand(-10, 10), pl.y - 52, `${INKS[pk.ink].hanja} +${pk.amount}`, INKS[pk.ink].edge, 17);
        for (let i = 0; i < 5; i++) {
          this.addParticle(pk.x, pk.y, rand(-60, 60), rand(-90, -20), rand(1.5, 3), inkColor(pk.ink), 0.8, rand(0.3, 0.5), false);
        }
      }
      if (pk.life <= 0) {
        pk.dead = true;
        this.stamps.push({ kind: 'blob', x: pk.x, y: pk.y, r: 6, color: inkColor(pk.ink), alpha: 0.4, seed: pk.seed, rot: 0, wet: 0.8 });
      }
    }
    this.pickups = this.pickups.filter((p) => !p.dead);
  }

  /* ───────── 피해 ───────── */

  damageEnemy(
    e: Enemy,
    amount: number,
    ink: InkId | null,
    o: { kx?: number; ky?: number; crit?: boolean; quiet?: boolean } = {},
  ): void {
    if (e.dead) return;
    const mult = affinity(ink, e.el);
    const dmg = amount * mult;
    e.hp -= dmg;
    if (!o.quiet) e.hitT = 0.14;
    e.kx += o.kx ?? 0;
    e.ky += o.ky ?? 0;

    const strong = mult > 1;
    const weak = mult < 1;
    const base: RGB = ink ? INKS[ink].edge : INK;
    const col: RGB = weak ? [128, 120, 110] : ink === 'baek' ? [70, 68, 64] : base;
    const size = (o.quiet ? 13 : 18) * (strong ? 1.35 : 1) * (o.crit ? 1.3 : 1) * (weak ? 0.85 : 1);
    this.text(e.x + rand(-8, 8), e.y - e.r * 1.7, `${Math.max(1, Math.round(dmg))}${o.crit ? '!' : ''}`, col, size);

    if (!o.quiet) {
      this.sounds.push({ type: 'hit', strong, crit: !!o.crit });
      const a = Math.atan2(o.ky ?? -1, o.kx ?? 0);
      const n = strong ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const sa = a + rand(-0.8, 0.8);
        const sp = rand(120, 320);
        this.addParticle(e.x, e.y - e.r * 0.4, Math.cos(sa) * sp, Math.sin(sa) * sp, rand(1.5, 4), inkColor(e.el), 0.85, rand(0.25, 0.5), true);
      }
      if (strong) this.hitstop = Math.max(this.hitstop, 0.025);
    }
    if (e.hp <= 0) {
      if (e.boss) this.bossDown(e);
      else this.killEnemy(e, ink);
    }
  }

  /** 붓이 닿는 먹귀인지 — 솟는 중이거나 하늘 높이 뜬 묵호는 닿지 않는다 */
  hittable(e: Enemy): boolean {
    return !e.dead && e.spawnT <= 0 && !untouchable(e);
  }

  /** 맞는 자리 — 대부분 원 하나, 몸이 긴 묵호는 셋 */
  private bodyCircles(e: Enemy): { x: number; y: number; r: number }[] {
    return e.boss ? tigerHitCircles(e) : [{ x: e.x, y: e.y - e.r * 0.5, r: e.r }];
  }

  /** 묵호의 기력이 다했다 — 바로 사라지지 않고 먹을 토하며 스러진다 */
  private bossDown(e: Enemy): void {
    const b = e.boss!;
    if (b.move === 'die') return;
    e.hp = 0;
    b.move = 'die';
    b.t = 0;
    b.dur = 2.1;
    b.z = 0;
    this.timeScale = 0.3;
    this.hitstop = Math.max(this.hitstop, 0.18);
    this.shake = Math.max(this.shake, 18);
    this.sounds.push({ type: 'roar', big: true });
    // 불려 온 먹귀들은 주인을 따라 흩어진다
    for (const m of this.enemies) if (m !== e && !m.dead) this.killEnemy(m, null);
  }

  /** 마지막 숨 — 큰 먹 자국을 남기고 사라진다 */
  finishBoss(e: Enemy): void {
    const col = inkColor(e.el);
    this.stamps.push({ kind: 'splat', x: e.x, y: e.y, r: 150, color: col, alpha: 0.5, seed: e.seed + 3, rot: Math.random() * TAU, wet: 1 });
    this.stamps.push({ kind: 'splat', x: e.x + 30, y: e.y - 10, r: 90, color: INK, alpha: 0.4, seed: e.seed + 5, rot: Math.random() * TAU, wet: 1 });
    this.addRing('burst', e.x, e.y - 40, 40, 320, 0.8, 22, col);
    this.addRing('enso', e.x, e.y - 40, 60, 480, 1.2, 9, INK);
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * TAU;
      const sp = rand(160, 620);
      this.addParticle(e.x, e.y - 40, Math.cos(a) * sp, Math.sin(a) * sp * 0.7, rand(3, 8), i % 3 ? col : INK, 0.9, rand(0.4, 0.9), true);
    }
    this.sounds.push({ type: 'explode' });
    this.timeScale = 0.25;
    this.killEnemy(e, null);
  }

  /** 큰 일격에 붓잡이가 밀려난다 */
  knockPlayer(dx: number, dy: number, power: number): void {
    const pl = this.player;
    const l = Math.hypot(dx, dy) || 1;
    pl.kx += (dx / l) * power;
    pl.ky += (dy / l) * power;
  }

  private killEnemy(e: Enemy, ink: InkId | null): void {
    e.dead = true;
    this.kills++;
    this.sounds.push({ type: 'kill', big: e.kind === 'brute' || e.kind === 'tiger' });
    const col = inkColor(e.el);
    this.stamps.push({ kind: 'splat', x: e.x, y: e.y, r: e.r * 1.5, color: col, alpha: 0.5, seed: e.seed, rot: Math.random() * TAU, wet: 1 });
    this.addRing('burst', e.x, e.y - e.r * 0.4, e.r * 0.6, e.r * 2.6, 0.4, e.r * 0.35, col);
    const n = 8 + Math.floor(e.r / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = rand(120, 380);
      this.addParticle(e.x, e.y - e.r * 0.4, Math.cos(a) * sp, Math.sin(a) * sp, rand(2, 5) * (e.r / 14), col, 0.9, rand(0.3, 0.6), true);
    }
    const def = ENEMY_KINDS[e.kind];
    if (e.loot > 0 || Math.random() < def.dropChance) {
      const a = Math.random() * TAU;
      this.pickups.push({ x: e.x, y: e.y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, ink: e.el, amount: e.loot || def.dropAmount, t: 0, life: 16, seed: e.seed, dead: false });
    }
    const big = e.kind === 'brute' || e.kind === 'tiger';
    this.hitstop = Math.max(this.hitstop, big ? 0.09 : 0.02);
    this.shake = Math.max(this.shake, big ? 10 : 3);
    if (e.burnStacks > 0 && ink !== null) this.explode(e.x, e.y, 46 + 10 * e.burnStacks, e.burnPower * 1.6 + 4, e.id);
  }

  /** 불붙은 먹귀가 터진다 — 주변에 불을 옮긴다 */
  private explode(x: number, y: number, r: number, dmg: number, sourceId: number): void {
    const col = INKS.jeok.color;
    this.sounds.push({ type: 'explode' });
    this.addRing('burst', x, y, r * 0.3, r * 1.1, 0.45, 10, col);
    this.stamps.push({ kind: 'splat', x, y, r: r * 0.7, color: col, alpha: 0.35, seed: sourceId + 7, rot: Math.random() * TAU, wet: 0.6 });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU;
      const sp = rand(80, 260);
      this.addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(2, 4.5), col, 0.9, rand(0.3, 0.6), i % 2 === 0, 40);
    }
    this.shake = Math.max(this.shake, 6);
    for (const e of this.enemies) {
      if (!this.hittable(e) || e.id === sourceId) continue;
      if (Math.hypot(e.x - x, e.y - y) < r + e.r) {
        e.burnStacks = Math.min(6, e.burnStacks + 1);
        e.burnT = 3;
        e.burnPower = Math.max(e.burnPower, 4);
        const a = Math.atan2(e.y - y, e.x - x);
        this.damageEnemy(e, dmg, 'jeok', { kx: Math.cos(a) * 120, ky: Math.sin(a) * 120 });
      }
    }
  }

  /** 피했거나 무적이면 false */
  hurtPlayer(dmg: number, el: InkId | null): boolean {
    const pl = this.player;
    if (pl.invuln > 0 || pl.dashT > 0 || this.phase !== 'play') return false;
    pl.hp -= dmg;
    this.sounds.push({ type: 'hurt' });
    pl.invuln = 0.75;
    pl.hurtT = 0.3;
    this.hurtFlash = 1;
    this.shake = Math.max(this.shake, 9);
    this.hitstop = Math.max(this.hitstop, 0.05);
    this.text(pl.x, pl.y - 64, `-${Math.round(dmg)}`, SEAL, 22);
    this.stamps.push({ kind: 'splat', x: pl.x, y: pl.y + 2, r: 12, color: el ? inkColor(el) : INK, alpha: 0.35, seed: randomSeed() % 100000, rot: Math.random() * TAU, wet: 0.7 });
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * TAU;
      this.addParticle(pl.x, pl.y - 18, Math.cos(a) * rand(80, 200), Math.sin(a) * rand(80, 200), rand(1.5, 3.5), SEAL, 0.8, rand(0.3, 0.5), true);
    }
    return true;
  }

  healPlayer(n: number): void {
    const pl = this.player;
    const before = pl.hp;
    pl.hp = Math.min(pl.maxHp, pl.hp + n);
    const gained = pl.hp - before;
    if (gained >= 1 && this.phase === 'play') this.text(pl.x + rand(-12, 12), pl.y - 58, `+${Math.round(gained)}`, INKS.cheong.edge, 15);
  }

  private die(): void {
    const pl = this.player;
    pl.hp = 0;
    pl.action = null;
    this.stamps.push({ kind: 'splat', x: pl.x, y: pl.y, r: 40, color: INK, alpha: 0.7, seed: 99, rot: 0, wet: 1 });
    this.setPhase('over');
  }

  /* ───────── 연출 도우미 ───────── */

  addParticle(x: number, y: number, vx: number, vy: number, r: number, color: RGB, alpha: number, life: number, stain: boolean, rise = 0): void {
    if (this.particles.length > 900) return;
    this.particles.push({ x, y, vx, vy, r, color, alpha, life, maxLife: life, drag: 5, stain, seed: randomSeed() % 100000, rise });
  }

  addRing(kind: RingKind, x: number, y: number, r0: number, r1: number, life: number, width: number, color: RGB = INK): void {
    this.rings.push({ kind, x, y, r0, r1, life, maxLife: life, color, width, seed: randomSeed() % 100000 });
  }

  splash(x: number, y: number, r: number, color: RGB, n: number): void {
    this.stamps.push({ kind: 'splat', x, y, r, color, alpha: 0.45, seed: randomSeed() % 100000, rot: Math.random() * TAU, wet: 0.8 });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      this.addParticle(x, y, Math.cos(a) * rand(60, 200), Math.sin(a) * rand(60, 200), rand(1.2, 3), color, 0.8, rand(0.2, 0.45), true);
    }
  }

  text(x: number, y: number, text: string, color: RGB, size: number): void {
    if (this.texts.length > 80) this.texts.shift();
    this.texts.push({ x, y, text, color, size, life: 0.9, maxLife: 0.9, vy: -70 });
  }

  /* ───────── 화면이 묻는 것들 ───────── */

  get styleName(): string {
    return this.character.styleName(this.ink.dominant);
  }

  get comboMoves(): readonly Move[] {
    return this.character.combo(this.ink.dominant);
  }

  /** 지금 펼치는(또는 다음에 나갈) 타 */
  get comboCursor(): { current: number; next: number } {
    const pl = this.player;
    return { current: pl.action ? pl.action.step : -1, next: pl.comboStep };
  }

  /** 아직 나타나지 않은 먹귀 무리 수 */
  get beatsLeft(): number {
    return Math.max(0, this.beats.length - this.beatIndex);
  }

  /** 시험용: 곧장 어느 방으로 들어간다 (?boss) */
  debugRoom(def: RoomDef): void {
    this.startRun('explore');
    this.ink.apply({ [def.el ? counterOf(def.el) : 'heuk']: 40, [INK_ORDER[(INK_ORDER.indexOf(def.el ?? 'heuk') + 2) % 5]]: 30 });
    this.enterRoom(def);
    this.setPhase('play');
  }

  debugInk(id: InkId, amount: number): void {
    this.ink.apply({ [id]: amount });
  }
}

const NUMERALS = ['', '첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째', '아홉째', '열째'];
export const numeral = (n: number): string => NUMERALS[n] ?? `${n}번째`;

