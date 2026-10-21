/**
 * 게임 상태를 화면으로 옮긴다.
 * 모든 먹(인물, 먹귀, 획, 자국)은 먹 레이어에 그린 뒤 합성 셰이더가 한지에 스미게 한다.
 */
import { type Application, Container, RenderTexture, Sprite, Texture } from 'pixi.js';
import { clamp, lerp } from '../core/math';
import type { Game } from '../game/game';
import { WORLD_H, WORLD_W } from '../game/types';
import { INKS, inkColor } from '../ink';
import { DAMMUK, INK, PAPER_LIGHT, mix } from '../render/color';
import { CHAPTER, ROOM_KINDS, type RoomDef, WALL_TOP } from '../game/rooms';
import { paintSeal } from '../render/paper';
import { createRoomCanvas, paintObstacle } from '../render/room';
import { ENEMY_FRAMES, WALK_FRAMES } from '../render/sprites';
import { BAKE, type Atlas } from './atlas';
import { BLOB_R, BLOB_VARIANTS, ENEMY_ART, WASH_R, WASH_VARIANTS, buildAtlas, enemyFrame, enemyWhite } from './assets';
import { Compositor } from './composite';
import { drawDashTrail, drawGate, drawPlayerGear, drawProjectile, drawRing, drawSash, drawStatus, drawTrace, drawZone } from './fx';
import { Hud } from './hud';
import { InkSim } from './inksim';
import { StrokeBatch } from './strokes';
import { TextCache, textRes } from './text';

const toHex = (c: readonly number[]): number => ((c[0] & 255) << 16) | ((c[1] & 255) << 8) | (c[2] & 255);

interface EnemySprites {
  root: Container;
  shadow: Sprite;
  body: Sprite;
  flash: Sprite;
  seen: boolean;
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
    this.paperCanvas = document.createElement('canvas');
    this.paperTex = Texture.WHITE;
    const { width, height } = app.screen;
    const res = app.renderer.resolution;
    this.inkRT = RenderTexture.create({ width, height, resolution: res });
    this.compositor = new Compositor(this.inkRT, this.paperTex, WORLD_W, WORLD_H);
    // 글씨가 또렷해야 하는 화면 표시는 합성 위에 바로 그린다
    app.stage.addChild(this.compositor.mesh, this.overlay, this.hudLayer);
    this.overlay.addChild(this.textLayer);

    this.stains = new InkSim(app.renderer, this.atlas, WORLD_W, WORLD_H);

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
    this.entities.addChild(this.player, this.playerStrokes.mesh);

    this.hud = new Hud(this.hudLayer, this.atlas, this.text);
    this.resize();
  }

  private frameSprite(name: string): Sprite {
    const f = this.atlas.get(name);
    const s = new Sprite(f.texture);
    s.anchor.set(f.ax, f.ay);
    s.scale.set(1 / BAKE);
    return s;
  }

  private setFrame(s: Sprite, name: string): void {
    const f = this.atlas.get(name);
    if (s.texture !== f.texture) {
      s.texture = f.texture;
      s.anchor.set(f.ax, f.ay);
    }
  }

  resize(): void {
    const { width, height } = this.app.screen;
    const res = this.app.renderer.resolution;
    if (this.inkRT.width !== width || this.inkRT.height !== height) {
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
    paintSeal(c.getContext('2d')!, 60, 60, 92, `${CHAPTER.hanja}${['一', '二', '三', '四', '五', '六'][n - 1] ?? ''}`);
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
    let tx = fx - vw / 2;
    let ty = fy - vh / 2;
    // 문을 고를 때는 그림 위쪽 표구까지 올라가 담장이 화면 표시 아래로 내려오게 한다
    const topRoom = !this.focus && (g.roomPhase === 'open' || g.transition) ? -120 : 0;
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
    for (const sp of this.enemySprites.values()) sp.seen = false;
    for (const e of g.enemies) {
      let sp = this.enemySprites.get(e.id);
      if (!sp) {
        const root = new Container();
        const shadow = this.frameSprite('shadow');
        shadow.tint = toHex(DAMMUK);
        const body = this.frameSprite(enemyFrame(e.kind, e.el, 0));
        const flash = this.frameSprite(enemyWhite(e.kind, 0));
        if (e.kind !== 'swallow') root.addChild(shadow);
        root.addChild(body, flash);
        this.entities.addChild(root);
        sp = { root, shadow, body, flash, seen: true };
        this.enemySprites.set(e.id, sp);
      }
      sp.seen = true;
      const art = ENEMY_ART[e.kind];
      const held = e.stunT > 0 || e.rootT > 0;
      const animSpeed = held ? 0.25 : e.slowT > 0 || e.inPool ? 0.5 : 1;
      const f = Math.floor(((e.anim * animSpeed) / art.period) * ENEMY_FRAMES + e.seed) % ENEMY_FRAMES;
      this.setFrame(sp.body, enemyFrame(e.kind, e.el, f));
      this.setFrame(sp.flash, enemyWhite(e.kind, f));
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
      const flipX = e.kind === 'swallow' ? 1 : e.vx < -5 ? -1 : e.vx > 5 ? 1 : (sp.body.scale.x < 0 ? -1 : 1);

      sp.body.position.set(shiverX, 0);
      sp.flash.position.set(shiverX, 0);
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
      sp.body.alpha = e.spawnT > 0 ? grow : 1;
      sp.flash.alpha = e.hitT > 0 ? (e.hitT / 0.14) * 0.85 : 0;
      const shk = (e.r * 1.3) / 31 / BAKE;
      sp.shadow.scale.set(shk * pop, shk * pop);
      sp.shadow.alpha = 0.28;
    }
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
      k.texture = this.text.get(room ? ROOM_KINDS[room.kind].hanja : '終', { size: 30, color: PAPER_LIGHT, res, weight: 900 });
      k.anchor.set(0.5);
      k.scale.set((1 + 0.08 * near) / res);
      k.position.set(gate.x, gate.y + 1);
      k.alpha = a;
      // 담 아래의 이름표
      const label = room ? `${el ? INKS[el].hanja + ' ' : ''}${ROOM_KINDS[room.kind].name}` : '화첩을 덮는다';
      const l = this.textPool.next();
      l.texture = this.text.get(label, { size: 17, color: room ? elCol : INK, res, weight: 900, halo: 2.4 });
      l.anchor.set(0.5);
      l.scale.set((1 + 0.12 * near) / res);
      l.position.set(gate.x, WALL_TOP + 26);
      l.alpha = a;
      if (near > 0.05 && room) {
        const d = this.textPool.next();
        d.texture = this.text.get(ROOM_KINDS[room.kind].desc, { size: 13, color: mix(INK, DAMMUK, 0.3), res, weight: 700, halo: 2.2 });
        d.anchor.set(0.5);
        d.scale.set(1 / res);
        d.position.set(gate.x, WALL_TOP + 48);
        d.alpha = a * near;
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
