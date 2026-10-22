// 글꼴은 외부 서버가 아니라 게임과 함께 내려준다
import '@fontsource/noto-serif-kr/400.css';
import '@fontsource/noto-serif-kr/600.css';
import '@fontsource/noto-serif-kr/700.css';
import '@fontsource/noto-serif-kr/900.css';
import '@fontsource/nanum-brush-script/400.css';
import { Application } from 'pixi.js';
import { Sound } from './audio';
import { Game, type InputFrame } from './game/game';
import { WORLD_H, WORLD_W } from './game/types';
import { View } from './gfx/view';
import { ResolutionGovernor } from './gfx/governor';
import { EXCESS_COST, INK_ORDER, type InkId, counterOf, inkName } from './ink';
import { CHARACTERS } from './game/characters';
import { CHAPTERS, ROOM_KINDS, bossDesc, chapterDone, chapterRoad } from './game/rooms';
import { josa } from './core/hangul';
import { ARTIFACT_LIST, type ArtifactId } from './game/artifacts';
import { Input } from './input';
import { UI } from './ui';
import { setupGallery } from './gallery';
import { showArtSheet } from './artsheet';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
/** 스스로 싸우는 시연 모드 — 화면 확인용 */
const DEMO = params.has('demo');
/** 그림 점검용 진열장 */
const GALLERY = params.get('gallery');
/** 시험용 방이 몇 번째 장에 있는지 (?ch=1) */
const DEBUG_CH = Math.max(0, Math.min(CHAPTERS.length - 1, Number(params.get('ch')) || 0));
/** 해상도를 고정해서 볼 때 (?res=1.5) */
const FORCED_RES = Number(params.get('res')) || 0;

/**
 * 웹 글꼴은 글자 묶음별로 나눠 받는다. 캔버스에 쓸 글자를 미리 알려 줘야
 * 처음 쓰는 순간 다른 글꼴로 그려지지 않는다.
 */
function canvasGlyphs(): string {
  const words = [
    '墨流五色靑赤黃白黑淡氣一二三破木火土金水剋生',
    '첫째둘째셋째넷째다섯째여섯째일곱째여덟째아홉째열째번째 물결',
    '먹귀가 몰려온다 물결을 넘기다 먹이 마르기 전에 다음 먹을 고르라',
    '먹귀의 기운 유리한 먹 남은 먹귀 붓잡이 0123456789+-!·「」—',
    '방 문이 열리다 문에 적힌 먹과 방을 보고 길을 고른다 문을 골라 지나간다 남은 무리',
    '한 폭을 그려 내다 낙관을 찍는다 샘에 다가가 먹을 씻는다 화첩을 덮는다 다 그리다 마지막 문을 지나',
    '一二三四五六七八終 어귀 정자에서 숨을 고른다 — 샘과 서안을 들르고 문을 고른다 병풍을 다 그리다 로 가는 문이 열린다',
    ...CHAPTERS.flatMap((c) => [c.name, c.hanja, c.boss.name, c.boss.hanja, c.boss.title, `${josa(c.boss.title, '을/를')} 그려 내다`, bossDesc(c), chapterDone(c), chapterRoad(c), josa(c.boss.name, '이/가')]),
    '봉황 · 산사의 주인 鳳 · 산사의 주인이 날개를 편다 봉황이 떨어지다 종소리에 날개가 꺾였다 — 지금이 틈',
    '범종 — 붓으로 치면 종소리가 먹귀를 굳힌다 鐘 裂 石 甲 빼앗기다 먹을 되찾다',
    '먹이 모자라다 () / 바꿔 쥘 먹이 없다 갈아 쥔 첫 획 ×1.3 Q E · 1–5 · 휠  먹 바꾸기 太過 쥐면 지니는 동안',
    '묵호 · 대숲의 주인 墨虎 · 대숲의 주인이 내려온다 을 두르다 묵호가 먹으로 갈아입는다 — 먹이 이긴다',
    '대숲의 주인을 그려 내다 의 마지막 폭에 낙관을 찍는다',
    '太過 상극 ×1.8 약점 없음 이 넘치다 약점이 사라진다 대가: 지닌 물건 서안 — 물건을 본다 서안에 다가가 물건을 본다 문방에서 물건을 고르다',
    ...Object.values(EXCESS_COST).flatMap((c) => [c.title, c.cost]),
    ...ARTIFACT_LIST.flatMap((a) => [a.glyph, a.name, a.desc]),
    ...Object.values(ROOM_KINDS).flatMap((k) => [k.name, k.hanja, k.desc]),
  ];
  for (const c of CHARACTERS) {
    words.push(c.name);
    for (const ink of [null, ...INK_ORDER]) {
      words.push(c.styleName(ink), inkName(ink));
      for (const m of c.combo(ink)) words.push(m.name);
    }
  }
  return [...new Set(words.join(''))].join('');
}

const FACES = ['400 40px "Noto Serif KR"', '600 40px "Noto Serif KR"', '700 40px "Noto Serif KR"', '900 40px "Noto Serif KR"', '400 40px "Nanum Brush Script"'];

async function loadFonts(): Promise<void> {
  const sample = canvasGlyphs();
  const all = Promise.all(FACES.map((f) => document.fonts.load(f, sample)));
  await Promise.race([all, new Promise((r) => setTimeout(r, 10000))]);
  const missing = FACES.filter((f) => !document.fonts.check(f, sample));
  if (missing.length) console.warn('글꼴을 다 받지 못했다:', missing);
}

async function boot(): Promise<void> {
  const sheet = params.get('sheet');
  if (sheet) {
    showArtSheet(sheet);
    return;
  }
  const host = document.getElementById('app')!;
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = '먹을 가는 중…';
  document.body.appendChild(loading);

  await loadFonts();

  // 고해상도 화면은 1.5배에서 시작하고, 기기가 넉넉하면 화면 배율까지 올린다
  const maxRes = FORCED_RES || Math.min(2, window.devicePixelRatio || 1);
  const startRes = FORCED_RES || Math.min(maxRes, 1.5);
  const app = new Application();
  await app.init({
    preference: 'webgl',
    resizeTo: window,
    resolution: startRes,
    autoDensity: true,
    antialias: false,
    autoStart: false,
    background: '#2b3038',
  });
  host.appendChild(app.canvas);

  const view = new View(app);
  const governor = new ResolutionGovernor(app.renderer, () => view.resize(), maxRes, startRes);
  // 늦게 도착한 글꼴 조각이 있으면 구워 둔 글자를 새로 굽는다
  document.fonts.addEventListener('loadingdone', () => view.text.clear());
  const game = new Game();
  const input = new Input(app.canvas);
  const ui = new UI(game, document.body);
  const sound = new Sound();
  ui.onSelect = () => sound.play({ type: 'ui' });
  ui.album = () => view.album;
  // 판이 끝나는 순간, 마지막 방을 화첩에 담은 뒤에 화면을 띄운다
  const showPhase = game.onPhase;
  game.onPhase = (p) => {
    if (p === 'won' || p === 'over') view.flushCapture(game);
    showPhase?.(p);
  };
  const unlock = (): void => sound.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', (e) => {
    unlock();
    if (e.code === 'KeyM') sound.toggleMute();
  });
  loading.remove();

  ui.onPauseToggle = () => {
    if (game.phase !== 'play') return;
    game.paused = !game.paused;
    ui.setPaused(game.paused);
  };
  window.addEventListener('resize', () => requestAnimationFrame(() => view.resize()));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.phase === 'play' && !game.paused) ui.onPauseToggle?.();
  });

  // 시험용: I를 누른 채 1–5면 그 먹 +10, O를 누른 채면 −10 (그냥 1–5는 먹 바꾸기)
  const debugKeys = (): void => {
    const add = input.down('KeyI') ? 10 : input.down('KeyO') ? -10 : 0;
    if (add) INK_ORDER.forEach((id, i) => {
      if (input.hit(`Digit${i + 1}`)) game.debugInk(id, add);
    });
    if (input.hit('KeyN')) for (const e of game.enemies) e.hp = 0.01;
  };

  const gallery = GALLERY ? setupGallery(game, GALLERY) : null;
  if (gallery) view.focus = gallery.focus;
  const freeze = gallery?.freeze;

  let last = performance.now();
  const loop = (now: number): void => {
    // 시험용: 화면을 잡아 두고 들여다볼 때 (window.__hold = true)
    if ((window as { __hold?: boolean }).__hold) {
      last = now;
      requestAnimationFrame(loop);
      return;
    }
    // 첫 프레임의 시각은 등록한 때보다 앞설 수 있다 — 거꾸로 흐르지 않게 막는다
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    if (!FORCED_RES && !freeze && !document.hidden) governor.frame(now - last);
    last = now;
    if (freeze) {
      freeze();
      game.sounds.length = 0;
      game.time += dt;
      view.render(game, dt);
      requestAnimationFrame(loop);
      return;
    }
    if (DEBUG && game.phase === 'play') debugKeys();
    let frame: InputFrame = input.frame((x, y) => view.screenToWorld(x, y));
    if (DEMO) frame = demoInput(game, now / 1000);
    game.update(dt, frame);
    sound.beginFrame();
    for (const e of game.sounds) sound.play(e);
    game.sounds.length = 0;
    view.render(game, dt);
    input.endFrame();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // 시험용: 물건을 지니고 시작한다 (?items=pine-soot,brazier)
  const itemsParam = params.get('items');
  const giveItems = (): void => {
    for (const id of (itemsParam ?? '').split(',')) if (ARTIFACT_LIST.some((a) => a.id === id)) game.acquire(id as ArtifactId);
  };
  // 시험용: 곧장 대숲의 주인에게 (?boss 또는 ?boss=jeok)
  if (params.has('boss')) {
    const el = (INK_ORDER as readonly string[]).includes(params.get('boss') ?? '') ? (params.get('boss') as InkId) : 'heuk';
    game.debugRoom({ kind: 'boss', el, chapter: DEBUG_CH, depth: CHAPTERS[DEBUG_CH].rooms - 1, seed: 4242 });
    giveItems();
  }
  // 시험용: 곧장 장 사이의 정자로 (?rest&ch=1), 장의 첫 방으로 (?room&ch=1)
  if (params.has('rest')) {
    game.debugRoom({ kind: 'rest', el: null, chapter: Math.max(1, DEBUG_CH), depth: -1, seed: 31 });
    giveItems();
  }
  if (params.has('room')) {
    game.debugRoom({ kind: 'battle', el: 'jeok', chapter: DEBUG_CH, depth: Number(params.get('room')) || 0, seed: 32 });
    giveItems();
  }
  // 시험용: 곧장 문방으로 (?shop)
  if (params.has('shop')) {
    game.debugRoom({ kind: 'shop', el: null, chapter: DEBUG_CH, depth: 1, seed: 777 });
    giveItems();
  }

  if (DEMO) {
    game.onPhase = ((orig) => (p) => {
      orig?.(p);
      if (p === 'reward') setTimeout(() => game.chooseReward(game.rewards[Math.floor(Math.random() * game.rewards.length)]), 600);
      if (p === 'over') setTimeout(() => game.startRun(), 2000);
    })(game.onPhase);
    if (!params.has('boss') && !params.has('room') && !params.has('rest')) game.startRun();
  }

  /** 시험용: 시연 입력으로 게임을 빨리 감는다 */
  // 시연 붓잡이의 시계 — 그리지 않고 빨리 감을 때도 게임 시간만큼 흐른다
  let demoClock = 0;
  const step = (sec: number, draw = true): void => {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) {
      if (game.phase === 'reward') game.chooseReward(game.rewards[Math.floor(Math.random() * game.rewards.length)]);
      demoClock += 1 / 60;
      game.update(1 / 60, demoInput(game, demoClock));
      game.sounds.length = 0;
      if (draw && (i % 90 === 0 || i === n - 1)) view.render(game, 1 / 60);
    }
  };
  Object.assign(window, { __game: game, __view: view, __governor: governor, __step: step, __ready: true });
}

/** 시연용 붓잡이: 가까운 먹귀를 겨누며 원을 그리듯 움직이고, 샘과 문으로 걸어간다 */
function demoInput(g: Game, t: number): InputFrame {
  const pl = g.player;
  let target = { x: pl.x + Math.cos(t) * 100, y: pl.y + Math.sin(t) * 100 };
  let best = Infinity;
  let nearest: (typeof g.enemies)[number] | null = null;
  for (const e of g.enemies) {
    const d = Math.hypot(e.x - pl.x, e.y - pl.y);
    if (d < best) {
      best = d;
      nearest = e;
      target = { x: e.x, y: e.y - 10 };
    }
  }
  const a = t * 0.6;
  let cx = WORLD_W / 2 + Math.cos(a) * 260;
  let cy = WORLD_H / 2 + 60 + Math.sin(a * 1.3) * 150;
  const goal = g.roomPhase === 'open' && g.gates.length ? g.gates[Math.floor(t / 1000) % g.gates.length] : g.roomPhase === 'spring' ? g.layout.pond : g.roomPhase === 'shop' ? g.layout.desk : null;
  if (goal) {
    cx = goal.x;
    cy = goal.y;
  }
  let mx = (cx - pl.x) / 120;
  let my = (cy - pl.y) / 120;
  if (best < 70 && best > 0.5) {
    mx -= (target.x - pl.x) / best;
    my -= (target.y - pl.y) / best;
  }
  // 가까운 먹귀를 이기는 먹을 쥐고 있으면 바꿔 쥔다
  let ink = -1;
  if (nearest) {
    const c = counterOf(nearest.el);
    if (c !== g.ink.active && g.ink.held(c)) ink = INK_ORDER.indexOf(c);
  }
  return { moveX: mx, moveY: my, aimX: target.x, aimY: target.y, attack: best < 200, dash: best < 40 && Math.sin(t * 3) > 0.9, ink };
}

boot();
