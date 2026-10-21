import { Application } from 'pixi.js';
import { Sound } from './audio';
import { TAU } from './core/math';
import { Game, type InputFrame } from './game/game';
import { View } from './gfx/view';
import { INK_ORDER } from './ink';
import { Input } from './input';
import { UI } from './ui';
import { setupGallery } from './gallery';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
/** 스스로 싸우는 시연 모드 — 화면 확인용 */
const DEMO = params.has('demo');
/** 그림 점검용 진열장 */
const GALLERY = params.get('gallery');

async function loadFonts(): Promise<void> {
  const want = ['900 40px "Noto Serif KR"', '700 40px "Noto Serif KR"', '400 40px "Nanum Brush Script"'];
  const sample = '墨流靑赤黃白黑淡氣一二三 먹의 흐름 물결 0123456789';
  await Promise.race([Promise.all(want.map((f) => document.fonts.load(f, sample))), new Promise((r) => setTimeout(r, 4000))]);
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
  const game = new Game();
  const input = new Input(app.canvas);
  const ui = new UI(game, document.body);
  const sound = new Sound();
  ui.onSelect = () => sound.play({ type: 'ui' });
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

/** 시연용 붓잡이: 가까운 먹귀를 겨누며 원을 그리듯 움직인다 */
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
  const cx = 1200 + Math.cos(a) * 260;
  const cy = 800 + Math.sin(a * 1.3) * 180;
  let mx = (cx - pl.x) / 200;
  let my = (cy - pl.y) / 200;
  if (best < 70) {
    mx -= (target.x - pl.x) / best;
    my -= (target.y - pl.y) / best;
  }
  return { moveX: mx, moveY: my, aimX: target.x, aimY: target.y, attack: best < 200, dash: best < 40 && Math.sin(t * 3) > 0.9 && TAU > 0 };
}

boot();
