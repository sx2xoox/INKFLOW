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
import { INK_ORDER, inkName } from './ink';
import { CHARACTERS } from './game/characters';
import { CHAPTER, ROOM_KINDS } from './game/rooms';
import { Input } from './input';
import { UI } from './ui';
import { setupGallery } from './gallery';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
/** 스스로 싸우는 시연 모드 — 화면 확인용 */
const DEMO = params.has('demo');
/** 그림 점검용 진열장 */
const GALLERY = params.get('gallery');

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
    `${CHAPTER.name}${CHAPTER.hanja}一二三四五六終`,
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
  const host = document.getElementById('app')!;
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = '먹을 가는 중…';
  document.body.appendChild(loading);

  await loadFonts();

  const app = new Application();
  await app.init({
    preference: 'webgl',
    resizeTo: window,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
    antialias: false,
    autoStart: false,
    background: '#2b3038',
  });
  host.appendChild(app.canvas);

  const view = new View(app);
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

  const debugKeys = (): void => {
    INK_ORDER.forEach((id, i) => {
      if (input.hit(`Digit${i + 1}`)) game.debugInk(id, input.down('ShiftLeft') ? -10 : 10);
    });
    if (input.hit('KeyN')) for (const e of game.enemies) e.hp = 0.01;
  };

  const gallery = GALLERY ? setupGallery(game, GALLERY) : null;
  if (gallery) view.focus = gallery.focus;
  const freeze = gallery?.freeze;

  let last = performance.now();
  const loop = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
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

  if (DEMO) {
    game.onPhase = ((orig) => (p) => {
      orig?.(p);
      if (p === 'reward') setTimeout(() => game.chooseReward(game.rewards[Math.floor(Math.random() * game.rewards.length)]), 600);
      if (p === 'over') setTimeout(() => game.startRun(), 2000);
    })(game.onPhase);
    game.startRun();
  }

  /** 시험용: 시연 입력으로 게임을 빨리 감는다 */
  const step = (sec: number): void => {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) {
      if (game.phase === 'reward') game.chooseReward(game.rewards[Math.floor(Math.random() * game.rewards.length)]);
      const t = performance.now() / 1000 + i / 60;
      game.update(1 / 60, demoInput(game, t));
      game.sounds.length = 0;
      if (i % 90 === 0 || i === n - 1) view.render(game, 1 / 60);
    }
  };
  Object.assign(window, { __game: game, __view: view, __step: step, __ready: true });
}

/** 시연용 붓잡이: 가까운 먹귀를 겨누며 원을 그리듯 움직이고, 샘과 문으로 걸어간다 */
function demoInput(g: Game, t: number): InputFrame {
  const pl = g.player;
  let target = { x: pl.x + Math.cos(t) * 100, y: pl.y + Math.sin(t) * 100 };
  let best = Infinity;
  for (const e of g.enemies) {
    const d = Math.hypot(e.x - pl.x, e.y - pl.y);
    if (d < best) {
      best = d;
      target = { x: e.x, y: e.y - 10 };
    }
  }
  const a = t * 0.6;
  let cx = WORLD_W / 2 + Math.cos(a) * 260;
  let cy = WORLD_H / 2 + 60 + Math.sin(a * 1.3) * 150;
  const goal = g.roomPhase === 'open' && g.gates.length ? g.gates[Math.floor(t / 1000) % g.gates.length] : g.roomPhase === 'spring' ? g.layout.pond : null;
  if (goal) {
    cx = goal.x;
    cy = goal.y;
  }
  let mx = (cx - pl.x) / 120;
  let my = (cy - pl.y) / 120;
  if (best < 70) {
    mx -= (target.x - pl.x) / best;
    my -= (target.y - pl.y) / best;
  }
  return { moveX: mx, moveY: my, aimX: target.x, aimY: target.y, attack: best < 200, dash: best < 40 && Math.sin(t * 3) > 0.9 };
}

boot();
