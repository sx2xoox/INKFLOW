/**
 * 게임 상태를 화면으로 옮긴다.
 * 모든 먹(인물, 먹귀, 획, 자국)은 먹 레이어에 그린 뒤 합성 셰이더가 한지에 스미게 한다.
 */
import { type Application, Container, RenderTexture, Sprite, Texture } from 'pixi.js';
import { clamp, lerp } from '../core/math';
import type { Game } from '../game/game';
import type { Enemy } from '../game/types';
import { TIGER_BODY } from '../game/boss';
import { SPINE_N, segZ } from '../game/imugi';
import { ARTIFACTS } from '../game/artifacts';
import { TIGER_FRAMES, type TigerPoseName } from '../render/tiger';
import { WORLD_H, WORLD_W } from '../game/types';
import { INKS, inkColor } from '../ink';
import { DAMMUK, INK, PAPER_LIGHT, mix } from '../render/color';
import { CHAPTERS, ROOM_KINDS, type RoomDef, WALL_TOP, roomDesc, roomGlyph } from '../game/rooms';
import { paintSeal } from '../render/paper';
import { createRoomCanvas, paintObstacle } from '../render/room';
import { ENEMY_FRAMES, WALK_FRAMES } from '../render/sprites';
import { arcPoints } from '../render/brush';
import { BAKE, type Atlas, type Frame } from './atlas';
import { BLOB_R, BLOB_VARIANTS, ENEMY_ART, WASH_R, WASH_VARIANTS, buildAtlas, enemyFrame, enemyWhite, imugiFrame, imugiWhite, tigerAtlas, tigerFrame } from './assets';
import { Compositor } from './composite';
import { drawDashTrail, drawGate, drawImugiTells, drawPlayerGear, drawProjectile, drawRing, drawSash, drawStatus, drawTigerTells, drawTrace, drawZone } from './fx';
import { Hud } from './hud';
import { InkSim } from './inksim';
import { bakePaperFx } from './paperfx';
import { StrokeBatch } from './strokes';
import { TextCache, textRes } from './text';

const toHex = (c: readonly number[]): number => ((c[0] & 255) << 16) | ((c[1] & 255) << 8) | (c[2] & 255);

interface EnemySprites {
  root: Container;
  shadow: Sprite;
  body: Sprite;
  flash: Sprite;
  seen: boolean;
  /** 걸음 위상(바퀴) — 묵호는 움직인 만큼 발을 옮긴다 */
  walk: number;
}

/** 스프라이트를 프레임마다 필요한 만큼만 꺼내 쓰는 묶음 */
class SpritePool {
  private items: Sprite[] = [];
  private used = 0;
  constructor(private readonly parent: Container) {}
  begin(): void {
    this.used = 0;
  }
  next(): Sprite {
    let s = this.items[this.used];
    if (!s) {
      s = new Sprite();
      this.items.push(s);
      this.parent.addChild(s);
    }
    s.visible = true;
    this.used++;
    return s;
  }
  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i].visible = false;
  }
}

export class View {
  readonly atlas: Atlas;
  /** 묵호는 크고 붓질이 많아 따로, 조금씩 굽는다 */
  private readonly tigerArt: Atlas;
  private tigerBake: Generator<void> | null;
  readonly text = new TextCache();
  private readonly inkScene = new Container();
  private readonly world = new Container();
  private readonly ground = new Container();
  private readonly entities = new Container();
  private readonly fxLayer = new Container();
  /** 피해 숫자 같은 글자 — 먹 합성을 거치지 않아 또렷하다 */
  private readonly overlay = new Container();
  private readonly textLayer = new Container();
  readonly hudLayer = new Container();

  private readonly groundStrokes = new StrokeBatch();
  private readonly fxStrokes = new StrokeBatch();
  private readonly playerStrokes = new StrokeBatch(4000);
  /** 이무기의 몸 — 마디를 따라 붓으로 그린다 */
  private readonly bossStrokes = new StrokeBatch(6000);
  private readonly groundPool: SpritePool;
  private readonly particlePool: SpritePool;
  private readonly textPool: SpritePool;
  private readonly pickupPool: SpritePool;

  private readonly player: Container;
  private readonly playerBody: Sprite;
  private readonly playerFlash: Sprite;
  private readonly playerShadow: Sprite;
  private readonly enemySprites = new Map<number, EnemySprites>();
  /** 쓰러진 먹귀가 먹으로 흩어지는 잠깐 */
  private dying: { root: Container; t: number }[] = [];

  private readonly stains: InkSim;
  private paperTex: Texture;
  private paperCanvas: HTMLCanvasElement;
  private obstacleSprites: Sprite[] = [];
  private seal: Sprite | null = null;
  private sealT = 0;
  private seenRoom = -1;
  private seenCleared = 0;
  private clock = 0;
  private captureAt = -1;
  /** 이번 판에 그려 낸 방들 — 끝에 화첩으로 보여 준다 */
  readonly album: { canvas: HTMLCanvasElement; room: RoomDef }[] = [];
  private inkRT: RenderTexture;
  private readonly compositor: Compositor;
  private readonly hud: Hud;

  /** 화면 왼쪽 위의 세계 좌표와 배율 */
  camX = 0;
  camY = 0;
  scale = 1;
  private camInit = false;
  /** 진열장처럼 카메라를 한 자리에 고정할 때 */
  focus: { x: number; y: number } | null = null;

  constructor(private readonly app: Application) {
    this.atlas = buildAtlas();
    this.tigerArt = tigerAtlas();
    this.tigerBake = this.tigerArt.buildSteps();
    this.paperCanvas = document.createElement('canvas');
    this.paperTex = Texture.WHITE;
    const { width, height } = app.screen;
    const res = app.renderer.resolution;
    this.inkRT = RenderTexture.create({ width, height, resolution: res });
    const paperFx = bakePaperFx(app.renderer, WORLD_W, WORLD_H);
    this.compositor = new Compositor(this.inkRT, this.paperTex, paperFx, WORLD_W, WORLD_H);
    // 글씨가 또렷해야 하는 화면 표시는 합성 위에 바로 그린다
    app.stage.addChild(this.compositor.mesh, this.overlay, this.hudLayer);
    this.overlay.addChild(this.textLayer);

    this.stains = new InkSim(app.renderer, this.atlas, WORLD_W, WORLD_H, paperFx);

    this.inkScene.addChild(this.world);
    this.world.addChild(this.stains.sprite, this.ground, this.groundStrokes.mesh, this.entities, this.fxLayer);
    this.fxLayer.addChild(this.fxStrokes.mesh);
    this.entities.sortableChildren = true;

    this.groundPool = new SpritePool(this.ground);
    const particleLayer = new Container();
    this.fxLayer.addChild(particleLayer);
    this.particlePool = new SpritePool(particleLayer);
    this.textPool = new SpritePool(this.textLayer);
    const pickupLayer = new Container();
    this.ground.addChild(pickupLayer);
    this.pickupPool = new SpritePool(pickupLayer);

    this.player = new Container();
    this.playerShadow = this.frameSprite('shadow');
    this.playerShadow.tint = toHex(DAMMUK);
    this.playerShadow.alpha = 0.3;
    this.ground.addChild(this.playerShadow);
    this.playerBody = this.frameSprite('player/0');
    this.playerFlash = this.frameSprite('player/white/0');
    this.player.addChild(this.playerBody, this.playerFlash);
    this.entities.addChild(this.player, this.playerStrokes.mesh, this.bossStrokes.mesh);

    this.hud = new Hud(this.hudLayer, this.atlas, this.text);
    this.resize();
  }

  /** 묵호 그림이 필요한데 아직 다 굽지 못했으면 남은 것을 마저 굽는다 */
  private bakeTiger(budgetMs: number): void {
    if (!this.tigerBake) return;
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      if (this.tigerBake.next().done) {
        this.tigerBake = null;
        return;
      }
    }
  }

  private art(name: string): Frame {
    if (name.startsWith('tiger/')) {
      this.bakeTiger(Infinity);
      return this.tigerArt.get(name);
    }
    return this.atlas.get(name);
  }

  private frameSprite(name: string): Sprite {
    const f = this.art(name);
    const s = new Sprite(f.texture);
    s.anchor.set(f.ax, f.ay);
    s.scale.set(1 / BAKE);
    return s;
  }

  private setFrame(s: Sprite, name: string): void {
    const f = this.art(name);
    if (s.texture !== f.texture) {
      s.texture = f.texture;
      s.anchor.set(f.ax, f.ay);
    }
  }

  resize(): void {
    const { width, height } = this.app.screen;
    const res = this.app.renderer.resolution;
    if (this.inkRT.width !== width || this.inkRT.height !== height || this.inkRT.source.resolution !== res) {
      this.inkRT.resize(width, height, res);
    }
    this.compositor.resize(width, height, width * res, height * res);
    this.scale = clamp(Math.min(width / 1060, height / 620), 0.55, 1.8);
    this.hud.resize(width, height);
  }

  screenToWorld(x: number, y: number): { x: number; y: number } {
    return { x: this.camX + x / this.scale, y: this.camY + y / this.scale };
  }

  render(g: Game, dt: number): void {
    const { width, height } = this.app.screen;
    this.clock += dt;
    // 시작 화면이나 고르는 동안 묵호를 조금씩 구워 둔다
    if (this.tigerBake && g.phase !== 'play') this.bakeTiger(6);
    this.syncRoom(g);
    this.updateCamera(g, dt, width, height);

    if (g.fadeStains) {
      g.fadeStains = false;
      this.stains.fade(0.3);
    }
    this.stains.apply(g.stamps);
    g.stamps.length = 0;
    this.stains.step(dt);

    this.drawGround(g);
    this.drawEntities(g, dt);
    this.drawFx(g);
    this.drawTexts(g);
    this.hud.res = this.app.renderer.resolution;
    this.hud.update(g, width, height);

    const shakeX = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0;
    const shakeY = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0;
    // 마무리 일격 — 붓잡이 쪽으로 살짝 다가선다
    const zoom = this.scale * (1 + 0.04 * g.punch * g.punch);
    const cxw = this.camX + width / this.scale / 2;
    const cyw = this.camY + height / this.scale / 2;
    const vx = cxw - width / zoom / 2 + shakeX / zoom;
    const vy = cyw - height / zoom / 2 + shakeY / zoom;
    this.world.scale.set(zoom);
    this.world.position.set(-vx * zoom, -vy * zoom);
    this.overlay.scale.set(zoom);
    this.overlay.position.set(-vx * zoom, -vy * zoom);

    this.app.renderer.render({ container: this.inkScene, target: this.inkRT, clear: true, clearColor: [0, 0, 0, 0] });
    this.compositor.update(vx, vy, width / zoom, height / zoom, zoom * this.app.renderer.resolution, g.time, g.hurtFlash);
    this.app.render();
  }

  /** 방이 바뀌었거나 다 그려졌는지 살핀다 */
  private syncRoom(g: Game): void {
    if (g.roomVersion !== this.seenRoom) {
      this.seenRoom = g.roomVersion;
      this.buildRoom(g);
    }
    if (g.clearedVersion !== this.seenCleared) {
      this.seenCleared = g.clearedVersion;
      if (g.cleared.length) this.stampSeal(g);
    }
    if (this.seal) {
      this.sealT += 1 / 60;
      const k = Math.min(1, this.sealT / 0.22);
      const sc = 1 + 0.7 * Math.pow(1 - k, 2);
      this.seal.scale.set(sc / 2);
      this.seal.alpha = Math.min(1, this.sealT / 0.12);
    }
    // 낙관이 자리 잡은 뒤, 또는 장이 끝나는 순간 화첩에 담는다
    if (this.captureAt > 0 && (this.clock >= this.captureAt || g.phase === 'won')) this.flushCapture(g);
  }

  /** 다 그린 방을 아직 화첩에 담지 못했으면 지금 담는다 */
  flushCapture(g: Game): void {
    if (this.captureAt < 0) return;
    this.captureAt = -1;
    const room = g.cleared[g.cleared.length - 1];
    if (room && !this.album.some((a) => a.room === room)) this.album.push({ canvas: this.captureRoom(), room });
  }

  /** 새 그림 한 폭을 편다 */
  private buildRoom(g: Game): void {
    this.flushCapture(g);
    if (g.cleared.length === 0) this.album.length = 0;
    const canvas = createRoomCanvas(WORLD_W, WORLD_H, g.room, g.layout);
    const old = this.paperTex;
    this.paperTex = Texture.from(canvas);
    this.paperCanvas = canvas;
    this.compositor.setPaper(this.paperTex);
    if (old !== Texture.WHITE) old.destroy(true);
    this.stains.clear();

    for (const s of this.obstacleSprites) s.destroy({ texture: true, textureSource: true });
    this.obstacleSprites = g.layout.obstacles.map((o) => {
      const art = paintObstacle(o, 2);
      const s = new Sprite(Texture.from(art.canvas));
      s.anchor.set(art.ax, art.ay);
      s.scale.set(1 / art.scale);
      s.position.set(o.x, o.y);
      s.zIndex = o.y;
      this.entities.addChild(s);
      return s;
    });

    for (const sp of this.enemySprites.values()) sp.root.destroy({ children: true });
    this.enemySprites.clear();
    for (const d of this.dying) d.root.destroy({ children: true });
    this.dying = [];
    this.seal?.destroy({ texture: true, textureSource: true });
    this.seal = null;
    this.captureAt = -1;
    this.camInit = false;
  }

  /** 방을 다 그려 냈다 — 오른쪽 아래에 낙관을 찍는다 */
  private stampSeal(g: Game): void {
    const n = g.cleared.length;
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 120;
    const room = g.cleared[n - 1];
    paintSeal(c.getContext('2d')!, 60, 60, 92, `${CHAPTERS[room.chapter].hanja}${['一', '二', '三', '四', '五', '六', '七', '八'][room.depth] ?? ''}`);
    this.seal?.destroy({ texture: true, textureSource: true });
    this.seal = new Sprite(Texture.from(c));
    this.seal.anchor.set(0.5);
    this.seal.position.set(WORLD_W - 110, WORLD_H - 100);
    this.ground.addChild(this.seal);
    this.sealT = 0;
    this.captureAt = this.clock + 1.1;
  }

  /** 지금 방의 그림을 작게 떠 둔다 — 종이, 바위와 대숲, 먹 자국, 낙관 */
  private captureRoom(): HTMLCanvasElement {
    const W = 480;
    const H = Math.round((W * WORLD_H) / WORLD_W);
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(this.paperCanvas, 0, 0, W, H);
    const layer = new Container();
    layer.addChild(new Sprite(this.stains.texture));
    for (const s of this.obstacleSprites) {
      const c = new Sprite(s.texture);
      c.anchor.copyFrom(s.anchor);
      c.scale.copyFrom(s.scale);
      c.position.copyFrom(s.position);
      layer.addChild(c);
    }
    if (this.seal) {
      const c = new Sprite(this.seal.texture);
      c.anchor.set(0.5);
      c.scale.set(0.5);
      c.position.copyFrom(this.seal.position);
      layer.addChild(c);
    }
    const rt = RenderTexture.create({ width: WORLD_W, height: WORLD_H, resolution: W / WORLD_W });
    this.app.renderer.render({ container: layer, target: rt, clear: true, clearColor: [0, 0, 0, 0] });
    const ink = this.app.renderer.extract.canvas({ target: rt }) as HTMLCanvasElement;
    ctx.drawImage(ink, 0, 0, W, H);
    rt.destroy(true);
    layer.destroy({ children: true });
    return out;
  }

  private updateCamera(g: Game, dt: number, w: number, h: number): void {
    const pl = g.player;
    const vw = w / this.scale;
    const vh = h / this.scale;
    // 겨누는 쪽을 조금 더 보여 준다
    const lookX = Math.cos(pl.aim) * 40;
    const lookY = Math.sin(pl.aim) * 30;
    let fx = this.focus ? this.focus.x : pl.x + lookX;
    let fy = this.focus ? this.focus.y : pl.y - 20 + lookY;
    // 문이 열리면 담장 쪽을 올려다본다
    if (!this.focus && (g.roomPhase === 'open' || g.transition)) fy = Math.min(fy, pl.y - 240);
    if (g.phase === 'title') {
      // 첫 화면에서는 그림 위를 천천히 거닌다
      fx = WORLD_W / 2 + Math.sin(g.time * 0.05) * 260;
      fy = WORLD_H / 2 + Math.sin(g.time * 0.037 + 1) * 160;
    }
    // 대숲의 주인이 나타날 때는 담장 위의 범을 올려다본다
    const boss = g.enemies.find((e) => e.boss);
    const bb = boss?.boss;
    const intro =
      !this.focus &&
      g.phase === 'play' &&
      !!bb &&
      (bb.move === 'perch' || bb.move === 'descend' || bb.move === 'rise' || (bb.species === 'tiger' && bb.move === 'roar' && bb.roared === 1 && bb.t < 1.3));
    if (intro && boss && bb) {
      fx = lerp(pl.x, boss.x, 0.85);
      fy = boss.y - bb.z - 60;
    }
    let tx = fx - vw / 2;
    let ty = fy - vh / 2;
    // 문을 고를 때는 그림 위쪽 표구까지 올라가 담장이 화면 표시 아래로 내려오게 한다
    const topRoom = !this.focus && (g.roomPhase === 'open' || g.transition || intro) ? -120 : 0;
    tx = vw >= WORLD_W ? (WORLD_W - vw) / 2 : clamp(tx, 0, WORLD_W - vw);
    ty = vh >= WORLD_H ? (WORLD_H - vh) / 2 : clamp(ty, topRoom, WORLD_H - vh);
    if (!this.camInit || (g.phase !== 'play' && g.phase !== 'title')) {
      this.camX = tx;
      this.camY = ty;
      this.camInit = true;
    } else {
      const k = 1 - Math.exp(-6 * dt);
      this.camX = lerp(this.camX, tx, k);
      this.camY = lerp(this.camY, ty, k);
    }
  }

  private drawGround(g: Game): void {
    this.groundPool.begin();
    this.groundStrokes.begin();
    const t = g.time;

    for (const z of g.zones) {
      const life = z.life / z.maxLife;
      const fadeIn = clamp((z.maxLife - z.life) / 0.25, 0, 1);
      const a = Math.min(fadeIn, clamp(z.life / 0.6, 0, 1));
      if (z.kind !== 'thorns') {
        const s = this.groundPool.next();
        this.setFrame(s, `wash/${z.seed % WASH_VARIANTS}`);
        const k = (z.r / WASH_R / BAKE) * (0.85 + 0.15 * fadeIn);
        s.scale.set(k, k * 0.62);
        s.position.set(z.x, z.y);
        s.rotation = 0;
        s.tint = toHex(z.kind === 'pool' ? INKS.heuk.color : [120, 40, 22]);
        s.alpha = a * (z.kind === 'pool' ? 0.7 : 0.45) * (0.8 + 0.2 * life);
      }
      drawZone(this.groundStrokes, z, t);
    }

    // 열린 달문 너머로 안개 낀 다음 방이 비친다
    for (const gate of g.gates) {
      if (gate.open <= 0) continue;
      const s = this.groundPool.next();
      this.setFrame(s, `wash/${gate.seed % WASH_VARIANTS}`);
      const k = (gate.r / WASH_R / BAKE) * 0.98;
      s.scale.set(k, k);
      s.position.set(gate.x, gate.y);
      s.rotation = 0;
      const el = gate.room?.el;
      s.tint = toHex(mix(el ? INKS[el].color : DAMMUK, INK, el === 'baek' ? 0.65 : 0.5));
      s.alpha = 0.85 * Math.min(1, gate.open * 1.4);
    }
    for (const r of g.rings) if (r.kind === 'spawn' || r.kind === 'shock' || r.kind === 'crack') drawRing(this.groundStrokes, r);
    drawDashTrail(this.groundStrokes, g.player);

    // 주속성 먹의 기운이 발밑에 번진다
    const pl = g.player;
    if (g.ink.dominant) {
      const s = this.groundPool.next();
      this.setFrame(s, 'blob/0');
      const k = ((22 + g.ink.potency * 10) / BLOB_R / BAKE) * (1 + 0.05 * Math.sin(t * 3));
      s.scale.set(k, k * 0.5);
      s.position.set(pl.x, pl.y + 1);
      s.rotation = 0;
      s.tint = toHex(inkColor(g.ink.dominant));
      s.alpha = 0.14 + 0.1 * g.ink.potency;
    }

    // 묵호가 두른 먹의 기운과 다음 수, 이무기의 그림자
    for (const e of g.enemies) {
      if (!e.boss || e.dead) continue;
      const b = e.boss;
      if (b.species === 'imugi') {
        this.imugiShadow(e);
        drawImugiTells(this.groundStrokes, e, t);
        continue;
      }
      const s = this.groundPool.next();
      this.setFrame(s, `wash/${e.seed % WASH_VARIANTS}`);
      const k = ((e.r * 2.3) / WASH_R / BAKE) * (1 + 0.06 * Math.sin(t * 2.4)) / (1 + b.z / 120);
      s.scale.set(k * 1.5, k * 0.6);
      s.position.set(e.x, e.y + 2);
      s.rotation = 0;
      s.tint = toHex(inkColor(e.el));
      s.alpha = (b.move === 'die' ? 0.2 : 0.38) * (b.move === 'perch' ? 0 : 1);
      drawTigerTells(this.groundStrokes, e, t);
    }

    // 먹귀 그림자
    for (const e of g.enemies) {
      if (e.kind === 'swallow') {
        const s = this.groundPool.next();
        this.setFrame(s, 'shadow');
        const k = (e.r * 1.4) / 31 / BAKE;
        s.scale.set(k, k);
        s.position.set(e.x, e.y + 22);
        s.rotation = 0;
        s.tint = toHex(DAMMUK);
        s.alpha = 0.18;
      }
    }

    this.pickupPool.begin();
    for (const pk of g.pickups) {
      const bob = Math.sin(pk.t * 4 + pk.seed) * 3;
      const blink = pk.life < 4 ? 0.55 + 0.45 * Math.sin(pk.t * 14) : 1;
      const sh = this.pickupPool.next();
      this.setFrame(sh, 'shadow');
      sh.scale.set(0.24 / BAKE * 2.2, 0.24 / BAKE * 2.2);
      sh.position.set(pk.x, pk.y);
      sh.tint = toHex(DAMMUK);
      sh.alpha = 0.25 * blink;
      const s = this.pickupPool.next();
      this.setFrame(s, `pickup/${pk.ink}`);
      s.scale.set(1 / BAKE);
      s.position.set(pk.x, pk.y - 4 + bob);
      s.alpha = blink;
      s.tint = 0xffffff;
    }
    this.pickupPool.end();
    this.groundPool.end();
    this.groundStrokes.end();
  }

  private drawEntities(g: Game, dt: number): void {
    const t = g.time;
    const pl = g.player;

    // 붓잡이
    const frame = pl.moving ? Math.floor(pl.walk * 1.2) % WALK_FRAMES : 0;
    const breathe = pl.moving ? 1 : 1 + Math.sin(t * 2.2) * 0.015;
    this.setFrame(this.playerBody, `player/${frame}`);
    this.setFrame(this.playerFlash, `player/white/${frame}`);
    this.player.position.set(pl.x, pl.y);
    this.player.scale.set(pl.facing, breathe);
    this.player.zIndex = pl.y;
    const blink = pl.invuln > 0 && pl.dashT <= 0 ? 0.55 + 0.45 * Math.sin(t * 40) : 1;
    this.playerBody.alpha = g.phase === 'over' ? 0.35 : blink;
    this.playerBody.tint = pl.hurtT > 0 ? 0xffb0a0 : 0xffffff;
    this.playerFlash.alpha = pl.hurtT > 0 ? pl.hurtT * 2 : 0;
    this.playerFlash.tint = 0xffe0d8;
    this.playerShadow.position.set(pl.x, pl.y);
    const sk = 22 / 31 / BAKE;
    this.playerShadow.scale.set(sk, sk);

    const bob = pl.moving ? -Math.abs(Math.cos((frame / WALK_FRAMES) * Math.PI * 2)) * 1.6 : 0;
    this.playerStrokes.begin();
    if (g.phase !== 'over') {
      const col = inkColor(g.ink.dominant);
      drawSash(this.playerStrokes, pl, col, bob, t);
      drawPlayerGear(this.playerStrokes, pl, col, g.ink.potency, bob, t);
    }
    this.playerStrokes.end();
    // 붓이 뒤로 갈 때는 몸 뒤에 그린다
    this.playerStrokes.mesh.zIndex = Math.sin(pl.brushAngle) < -0.35 ? pl.y - 0.5 : pl.y + 0.5;

    // 먹귀
    this.bossStrokes.begin();
    for (const sp of this.enemySprites.values()) sp.seen = false;
    for (const e of g.enemies) {
      let sp = this.enemySprites.get(e.id);
      if (!sp) {
        const root = new Container();
        const shadow = this.frameSprite('shadow');
        shadow.tint = toHex(DAMMUK);
        const tiger = e.kind === 'tiger';
        const imugi = e.kind === 'imugi';
        const body = this.frameSprite(tiger ? tigerFrame('walk') : imugi ? imugiFrame(e.el, false) : enemyFrame(e.kind as keyof typeof ENEMY_ART, e.el, 0));
        const flash = this.frameSprite(tiger ? tigerFrame('walk', 0, true) : imugi ? imugiWhite(false) : enemyWhite(e.kind as keyof typeof ENEMY_ART, 0));
        if (e.kind !== 'swallow') root.addChild(shadow);
        root.addChild(body, flash);
        this.entities.addChild(root);
        sp = { root, shadow, body, flash, seen: true, walk: 0 };
        this.enemySprites.set(e.id, sp);
      }
      sp.seen = true;
      if (e.kind === 'tiger') {
        this.drawTiger(e, sp, dt);
        continue;
      }
      if (e.kind === 'imugi') {
        this.drawImugi(e, sp, dt);
        continue;
      }
      const kind = e.kind;
      const art = ENEMY_ART[kind];
      const held = e.stunT > 0 || e.rootT > 0;
      const animSpeed = held ? 0.25 : e.slowT > 0 || e.inPool ? 0.5 : 1;
      // 잉어와 거북은 0~5가 움직임, 6·7은 동작에 따라 고른다
      const posed = kind === 'carp' || kind === 'turtle';
      const cycle = posed ? 6 : ENEMY_FRAMES;
      let f = Math.floor(((e.anim * animSpeed) / art.period) * cycle + e.seed) % cycle;
      if (kind === 'carp' && e.ai >= 2) f = e.ai === 2 ? 6 : 7;
      if (kind === 'turtle' && e.ai >= 1) f = e.ai === 3 ? 7 : 6;
      this.setFrame(sp.body, enemyFrame(kind, e.el, f));
      this.setFrame(sp.flash, enemyWhite(kind, f));
      sp.root.position.set(e.x, e.y);
      sp.root.zIndex = e.y;

      // 나타나는 중: 먹이 솟아오른다
      const grow = e.spawnT > 0 ? 1 - e.spawnT / 0.6 : 1;
      const pop = grow < 1 ? Math.sin(grow * Math.PI * 0.5) * (1 + 0.25 * Math.sin(grow * Math.PI)) : 1;
      let sx = pop;
      let sy = pop;
      if (e.hitT > 0) {
        const k = e.hitT / 0.14;
        sx *= 1 + 0.18 * k;
        sy *= 1 - 0.14 * k;
      }
      if (e.kind === 'toad' && e.charge > 0) {
        sx *= 1 + 0.16 * e.charge;
        sy *= 1 + 0.1 * e.charge;
      }
      let shiverX = 0;
      if (e.kind === 'swallow' && e.ai === 1) shiverX = Math.sin(t * 60) * 1.5;
      if ((e.kind === 'carp' || e.kind === 'turtle') && e.ai === 1) shiverX = Math.sin(t * 55) * 1.2;
      let flipX = e.kind === 'swallow' ? 1 : e.vx < -5 ? -1 : e.vx > 5 ? 1 : sp.body.scale.x < 0 ? -1 : 1;
      if (posed) flipX = e.side;
      // 도는 등딱지는 좌우로 번갈아 뒤집어 팽이처럼 보이게
      if (e.kind === 'turtle' && e.ai === 2) flipX = Math.sin(t * 40) > 0 ? 1 : -1;
      if (e.kind === 'carp' && e.ai === 3) sy *= 1 + 0.12 * Math.sin(t * 30);

      sp.body.position.set(shiverX, -e.z);
      sp.flash.position.set(shiverX, -e.z);
      if (e.kind === 'swallow') {
        const up = Math.cos(e.face) < 0 ? -1 : 1;
        const hover = -18 + Math.sin(e.anim * 6) * 2;
        sp.body.rotation = e.face;
        sp.flash.rotation = e.face;
        sp.body.y = hover;
        sp.flash.y = hover;
        sp.body.scale.set(sx / BAKE, (sy * up) / BAKE);
        sp.flash.scale.set(sx / BAKE, (sy * up) / BAKE);
      } else {
        sp.body.scale.set((sx * flipX) / BAKE, sy / BAKE);
        sp.flash.scale.set((sx * flipX) / BAKE, sy / BAKE);
      }
      // 먹 속에 잠긴 잉어는 조금 비친다
      const under = e.kind === 'carp' && e.ai <= 1;
      sp.body.alpha = (e.spawnT > 0 ? grow : 1) * (under ? 0.85 : 1);
      sp.flash.alpha = e.hitT > 0 ? (e.hitT / 0.14) * 0.85 : 0;
      const shk = ((e.r * 1.3) / 31 / BAKE) / (1 + e.z / 60);
      sp.shadow.scale.set(shk * pop, shk * pop);
      sp.shadow.alpha = under ? 0 : 0.28 / (1 + e.z / 60);
    }
    this.bossStrokes.end();
    for (const [id, sp] of this.enemySprites) {
      if (!sp.seen) {
        sp.shadow.visible = false;
        sp.flash.alpha = 0.6;
        this.dying.push({ root: sp.root, t: 0 });
        this.enemySprites.delete(id);
      }
    }
    for (const d of this.dying) {
      d.t += dt;
      const k = d.t / 0.22;
      d.root.scale.set(1 + k * 0.7, 1 + k * 0.35);
      d.root.alpha = Math.max(0, 1 - k);
    }
    this.dying = this.dying.filter((d) => {
      if (d.t < 0.22) return true;
      d.root.destroy({ children: true });
      return false;
    });
  }

  /** 묵호 — 동작에 맞는 자세를 고르고, 뛰면 그림자만 땅에 남긴다 */
  private drawTiger(e: Enemy, sp: EnemySprites, dt: number): void {
    const b = e.boss!;
    const sp2 = Math.hypot(e.vx, e.vy);
    sp.walk += (sp2 * dt) / 70;
    let pose: TigerPoseName = 'walk';
    let frame = 0;
    switch (b.move) {
      case 'perch':
      case 'crouch':
      case 'aim':
      case 'stagger':
        pose = 'crouch';
        break;
      case 'descend':
      case 'leap':
        pose = 'leap';
        break;
      case 'roar':
        if (b.t < 0.22) pose = 'crouch';
        else if (b.t < 1.35) pose = Math.floor(b.t * 9) % 2 ? 'roar1' : 'roar0';
        break;
      case 'swipe':
        pose = b.t < b.wind ? 'swipe0' : b.t < b.wind + 0.13 ? 'swipe1' : 'swipe2';
        break;
      case 'dash':
        frame = Math.floor(b.t * 26) % TIGER_FRAMES.walk;
        break;
      case 'die':
        pose = 'roar1';
        break;
      default:
        frame = sp2 > 8 ? Math.floor(sp.walk * TIGER_FRAMES.walk) % TIGER_FRAMES.walk : 0;
    }
    this.setFrame(sp.body, tigerFrame(pose, frame));
    this.setFrame(sp.flash, tigerFrame(pose, frame, true));
    sp.root.position.set(e.x, e.y);
    sp.root.zIndex = e.y;

    const flip = Math.cos(e.face) >= 0 ? 1 : -1;
    let rot = 0;
    let sx = 1;
    let sy = 1;
    let lift = b.z;
    if (b.move === 'crouch' || b.move === 'aim') rot = Math.sin(b.t * 32) * 0.012 * flip;
    if (b.move === 'stagger') rot = Math.sin(b.t * 15) * 0.06 * (1 - b.t / b.dur);
    if (b.move === 'rest' || (b.move === 'stalk' && sp2 < 8)) sy = 1 + Math.sin(b.t * 7) * 0.015;
    if (e.hitT > 0) {
      const k = e.hitT / 0.14;
      sx *= 1 + 0.05 * k;
      sy *= 1 - 0.04 * k;
    }
    let alpha = 1;
    if (b.move === 'die') {
      const k = b.t / b.dur;
      sy *= 1 - 0.25 * k;
      sx *= 1 + 0.1 * k;
      lift -= 6 * k;
      alpha = 1 - Math.max(0, (k - 0.55) / 0.45);
    }
    for (const s of [sp.body, sp.flash]) {
      s.position.set(0, -lift);
      s.rotation = rot;
      s.scale.set((sx * flip) / BAKE, sy / BAKE);
    }
    sp.body.alpha = alpha;
    sp.flash.alpha = e.hitT > 0 ? (e.hitT / 0.14) * 0.55 : b.move === 'die' ? Math.max(0, 0.6 - b.t) : 0;
    // 하늘 높이 뜨면 그림자가 작고 옅어진다
    const k = 1 / (1 + b.z / 90);
    const shw = (TIGER_BODY.rx * 1.25) / 31 / BAKE;
    sp.shadow.scale.set(shw * k, (shw * 0.85) * k);
    sp.shadow.alpha = 0.3 * k * alpha;
  }

  /** 이무기의 그림자 — 솟으면 땅에, 잠기면 종이 밑의 검은 그림자 */
  private imugiShadow(e: Enemy): void {
    const b = e.boss!;
    const sb = this.groundStrokes;
    const ground = b.spine.map((p) => ({ x: p.x, y: p.y }));
    if (ground.length < 2) return;
    const s = 1 - b.under;
    if (b.under > 0.02) {
      sb.stroke(ground, { width: 46, color: INK, alpha: 0.4 * b.under, dryness: 0.8, wet: 1, taperIn: 0.05, taperOut: 0.85, seed: e.seed + 1, bristles: 10 });
      // 먹 속에서 눈만 번뜩인다
      const h = ground[0];
      const fx = Math.cos(b.heading);
      const fy = Math.sin(b.heading);
      for (const sd of [-1, 1]) {
        const ex = h.x + fx * 12 - fy * 7 * sd;
        const ey = h.y + fy * 6 + fx * 4 * sd;
        sb.stroke([{ x: ex - 2, y: ey }, { x: ex + 2, y: ey }], { width: 4, color: [238, 196, 64], alpha: 0.85 * b.under, dryness: 0, taperIn: 0, taperOut: 0, seed: e.seed + 5 + sd });
      }
    }
    if (s > 0.02) sb.stroke(ground, { width: 34, color: DAMMUK, alpha: 0.22 * s, dryness: 0.6, wet: 0.8, taperIn: 0.05, taperOut: 0.9, seed: e.seed + 2 });
  }

  /** 이무기 — 몸은 마디를 따라 긋고, 머리는 구워 둔 그림을 얹는다 */
  private drawImugi(e: Enemy, sp: EnemySprites, dt: number): void {
    const b = e.boss!;
    const s = 1 - b.under;
    const t = this.clock;
    const col = inkColor(e.el);
    const light = col[0] + col[1] + col[2] > 600;
    const body = mix(col, INK, light ? 0.12 : 0.18);
    const fin = mix(col, INK, light ? 0.4 : 0.5);
    const pts = b.spine.map((p, i) => ({ x: p.x, y: p.y - 12 * s - segZ(b, i) + Math.sin(t * 4 - i * 0.5) * 1.2 * s }));
    const fade = b.move === 'die' ? Math.max(0, 1 - Math.max(0, b.t / b.dur - 0.5) / 0.5) : 1;
    if (s > 0.02 && pts.length > 2) {
      const sb = this.bossStrokes;
      // 지느러미 — 등을 따라 뾰족하게
      for (let i = 2; i < SPINE_N - 6; i += 2) {
        const a = pts[i - 1];
        const c = pts[i + 1];
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const l = Math.hypot(dx, dy) || 1;
        const k = 1 - i / SPINE_N;
        sb.stroke([pts[i], { x: pts[i].x - (dx / l) * 8 * k, y: pts[i].y - (12 * k + 4) }], {
          width: 6 * k + 2,
          color: fin,
          alpha: 0.9 * s * fade,
          dryness: 0.5,
          taperIn: 0.1,
          taperOut: 0.9,
          seed: e.seed + 10 + i,
        });
      }
      // 몸통
      sb.stroke(pts, { width: 36, color: body, alpha: s * fade, dryness: 0.32, edgeInk: 0.7, wet: 0.3, taperIn: 0.02, taperOut: 0.85, seed: e.seed + 3, bristles: 16 });
      // 흰 배
      sb.stroke(
        pts.map((p, i) => ({ x: p.x, y: p.y + 7 * (1 - i / SPINE_N) })),
        { width: 12, color: mix(col, PAPER_LIGHT, light ? 0.1 : 0.55), alpha: 0.6 * s * fade, dryness: 0.4, taperIn: 0.05, taperOut: 0.85, seed: e.seed + 4 },
      );
      // 비늘 — 등줄기를 따라 반달 무늬
      for (let i = 1; i < SPINE_N - 4; i++) {
        const p = pts[i];
        const r = 5 * (1 - i / SPINE_N) + 2;
        sb.stroke(arcPoints(p.x, p.y - 2, r, -2.4, 1.6, 6), { width: 1.2, color: fin, alpha: 0.5 * s * fade, dryness: 0.4, seed: e.seed + 40 + i });
      }
    }
    this.bossStrokes.mesh.zIndex = (b.spine[0]?.y ?? e.y) - 1;

    // 머리
    const open = (b.move === 'bite' && b.t > b.wind * 0.4) || (b.move === 'spit' && b.t > b.wind * 0.5) || b.move === 'roar' || b.move === 'burst' || (b.move === 'rise' && b.t > 1.3) || b.move === 'die';
    this.setFrame(sp.body, imugiFrame(e.el, open));
    this.setFrame(sp.flash, imugiWhite(open));
    const head = pts[0] ?? { x: e.x, y: e.y };
    sp.root.position.set(e.x, e.y);
    sp.root.zIndex = e.y;
    const flip = Math.cos(b.heading) >= 0 ? 1 : -1;
    const tilt = clamp(Math.atan2(Math.sin(b.heading) * 0.5, Math.abs(Math.cos(b.heading))), -0.55, 0.55) - (b.z > 50 ? 0.25 : 0);
    for (const spr of [sp.body, sp.flash]) {
      spr.position.set(head.x - e.x, head.y - e.y);
      spr.rotation = tilt * flip;
      spr.scale.set(flip / BAKE, 1 / BAKE);
    }
    sp.body.alpha = s * fade;
    sp.flash.alpha = e.hitT > 0 ? (e.hitT / 0.14) * 0.6 * s : 0;
    sp.shadow.visible = false;
    void dt;
  }

  private drawFx(g: Game): void {
    const t = g.time;
    this.fxStrokes.begin();
    for (const e of g.enemies) if (e.spawnT <= 0) drawStatus(this.fxStrokes, e, t);
    for (const p of g.projectiles) drawProjectile(this.fxStrokes, p);
    for (const tr of g.traces) drawTrace(this.fxStrokes, tr);
    for (const gate of g.gates) drawGate(this.fxStrokes, gate, this.gateNear(g, gate.x, gate.y));
    for (const r of g.rings) if (r.kind === 'enso' || r.kind === 'burst') drawRing(this.fxStrokes, r);
    this.fxStrokes.end();

    this.particlePool.begin();
    for (const p of g.projectiles) {
      if (p.kind !== 'glob') continue;
      const s = this.particlePool.next();
      this.setFrame(s, `blob/${p.seed % BLOB_VARIANTS}`);
      const k = p.r / BLOB_R / BAKE;
      s.scale.set(k * 1.15, k * 0.95);
      s.position.set(p.x, p.y);
      s.rotation = Math.atan2(p.vy, p.vx);
      s.tint = toHex(inkColor(p.ink));
      s.alpha = 1;
    }
    for (const p of g.particles) {
      const s = this.particlePool.next();
      this.setFrame(s, `blob/${p.seed % BLOB_VARIANTS}`);
      const life = p.life / p.maxLife;
      const sp = Math.hypot(p.vx, p.vy);
      const stretch = 1 + Math.min(1.2, sp / 300);
      const k = (p.r / BLOB_R / BAKE) * (0.6 + 0.4 * life);
      s.scale.set(k * stretch, k / Math.sqrt(stretch));
      s.rotation = Math.atan2(p.vy, p.vx);
      s.position.set(p.x, p.y);
      s.tint = toHex(p.color);
      s.alpha = p.alpha * Math.min(1, life * 2.5);
    }
    this.particlePool.end();
  }

  /** 붓잡이가 문에 다가온 정도 */
  private gateNear(g: Game, x: number, y: number): number {
    const d = Math.hypot(g.player.x - x, (g.player.y - y) * 0.8);
    return clamp(1 - (d - 70) / 160, 0, 1);
  }

  private drawTexts(g: Game): void {
    this.textPool.begin();
    for (const gate of g.gates) {
      const a = clamp((gate.open - 0.4) / 0.6, 0, 1);
      if (a <= 0) continue;
      const near = this.gateNear(g, gate.x, gate.y);
      const room = gate.room;
      const res = textRes(this.app.renderer.resolution * this.scale * 1.15);
      const el = room?.el ?? null;
      const elCol = el ? (el === 'baek' ? ([96, 92, 86] as const) : INKS[el].edge) : INK;
      // 문 안의 글자 — 방 종류
      const k = this.textPool.next();
      k.texture = this.text.get(room ? roomGlyph(room) : '終', { size: 30, color: PAPER_LIGHT, res, weight: 900 });
      k.anchor.set(0.5);
      k.scale.set((1 + 0.08 * near) / res);
      k.position.set(gate.x, gate.y + 1);
      k.alpha = a;
      // 담 아래의 이름표
      const kindName = !room ? '' : room.kind === 'boss' ? CHAPTERS[room.chapter].boss.name : room.kind === 'rest' ? `${CHAPTERS[room.chapter].name} 어귀` : ROOM_KINDS[room.kind].name;
      const label = room ? `${el ? INKS[el].hanja + ' ' : ''}${kindName}` : '화첩을 덮는다';
      const l = this.textPool.next();
      l.texture = this.text.get(label, { size: 17, color: room ? elCol : INK, res, weight: 900, halo: 2.4 });
      l.anchor.set(0.5);
      l.scale.set((1 + 0.12 * near) / res);
      l.position.set(gate.x, WALL_TOP + 26);
      l.alpha = a;
      if (near > 0.05 && room) {
        const d = this.textPool.next();
        d.texture = this.text.get(roomDesc(room), { size: 13, color: mix(INK, DAMMUK, 0.3), res, weight: 700, halo: 2.2 });
        d.anchor.set(0.5);
        d.scale.set(1 / res);
        d.position.set(gate.x, WALL_TOP + 48);
        d.alpha = a * near;
      }
    }
    // 문방 — 서안 위에 놓인 물건들이 떠 있다
    const desk = g.layout.desk;
    if (desk && g.deskOpen) {
      const res = textRes(this.app.renderer.resolution * this.scale * 1.15);
      g.stock.forEach((id, i) => {
        const a = ARTIFACTS[id];
        const x = desk.x + (i - (g.stock.length - 1) / 2) * 62;
        const y = desk.y - 78 + Math.sin(g.time * 2 + i * 1.7) * 4;
        const col = a.ink === 'baek' ? ([96, 92, 86] as const) : INKS[a.ink].edge;
        const s = this.textPool.next();
        s.texture = this.text.get(a.glyph, { size: 30, color: col, res, weight: 900, halo: 3 });
        s.anchor.set(0.5);
        s.scale.set(1 / res);
        s.position.set(x, y);
        s.alpha = 1;
      });
      const near = clamp(1 - (Math.hypot(g.player.x - desk.x, g.player.y - desk.y) - 120) / 200, 0, 1);
      if (near > 0.05) {
        const l = this.textPool.next();
        l.texture = this.text.get('서안 — 물건을 본다', { size: 15, color: INK, res, weight: 900, halo: 2.4 });
        l.anchor.set(0.5);
        l.scale.set(1 / res);
        l.position.set(desk.x, desk.y + 58);
        l.alpha = near;
      }
    }
    for (const ft of g.texts) {
      const s = this.textPool.next();
      const res = textRes(this.app.renderer.resolution * this.scale * 1.15);
      s.texture = this.text.get(ft.text, { size: Math.round(ft.size), color: ft.color, halo: 2.4, res });
      s.anchor.set(0.5);
      const age = 1 - ft.life / ft.maxLife;
      const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.55 : 1.15 - Math.min(0.15, (age - 0.12) * 0.6);
      s.scale.set(pop / res);
      s.position.set(ft.x, ft.y);
      s.alpha = Math.min(1, (ft.life / ft.maxLife) * 3);
    }
    this.textPool.end();
  }
}
