/**
 * 글이 많은 화면(첫 화면, 먹 고르기, 끝 화면)은 DOM으로 그린다.
 * 카드 그림은 게임과 같은 붓 도구로 캔버스에 그린다.
 */
import { TAU } from './core/math';
import { mulberry32 } from './core/rng';
import { type Game, numeral } from './game/game';
import type { Item } from './game/items';
import { INKS, INK_MAX, INK_ORDER, type InkId, inkHanja, inkName } from './ink';
import { arcPoints, brushStroke, splatter, wash } from './render/brush';
import { DAMMUK, INK, PAPER, mix, rgba } from './render/color';
import { createPaperCanvas, paintSeal } from './render/paper';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export class UI {
  private readonly root: HTMLDivElement;
  private cards: { item: Item; node: HTMLElement }[] = [];
  onPauseToggle: (() => void) | null = null;
  /** 카드를 고르거나 단추를 눌렀을 때 */
  onSelect: (() => void) | null = null;

  constructor(
    private readonly game: Game,
    parent: HTMLElement,
  ) {
    this.root = el('div', 'ui');
    parent.appendChild(this.root);
    // 한지 질감을 CSS 배경으로
    const tile = createPaperCanvas(420, 420, 3, false);
    document.documentElement.style.setProperty('--paper', `url(${tile.toDataURL('image/jpeg', 0.86)})`);

    game.onPhase = (p) => this.show(p);
    window.addEventListener('keydown', (e) => {
      if (this.game.phase === 'reward') {
        const n = Number(e.key);
        if (n >= 1 && n <= this.cards.length) this.choose(this.cards[n - 1].item);
      }
      if ((this.game.phase === 'title' || this.game.phase === 'over') && (e.code === 'Enter' || e.code === 'Space')) {
        this.game.startRun();
      }
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPauseToggle?.();
    });
    this.show('title');
  }

  private clear(): void {
    this.root.innerHTML = '';
    this.root.className = 'ui';
    this.cards = [];
  }

  show(phase: Game['phase']): void {
    this.clear();
    if (phase === 'title') this.title();
    else if (phase === 'reward') this.reward();
    else if (phase === 'over') this.over();
    else this.root.classList.add('hidden');
  }

  setPaused(p: boolean): void {
    if (this.game.phase !== 'play') return;
    this.clear();
    if (!p) {
      this.root.classList.add('hidden');
      return;
    }
    const box = el('div', 'panel pause');
    box.appendChild(el('h2', 'brush', '잠시 붓을 놓다'));
    box.appendChild(controls());
    const b = el('button', 'btn', '다시 붓을 들다');
    b.onclick = () => this.onPauseToggle?.();
    box.appendChild(b);
    this.root.appendChild(box);
  }

  private title(): void {
    this.root.classList.add('title-screen');
    const box = el('div', 'title');
    const logo = el('canvas', 'logo') as HTMLCanvasElement;
    drawLogo(logo);
    box.appendChild(logo);
    box.appendChild(el('p', 'tag', '다섯 빛깔 먹의 기운을 다루는 붓잡이의 싸움'));
    const b = el('button', 'btn big', '붓을 들다');
    b.onclick = () => this.game.startRun();
    box.appendChild(b);
    box.appendChild(controls());
    this.root.appendChild(box);
  }

  private reward(): void {
    const g = this.game;
    this.root.classList.add('reward-screen');
    const box = el('div', 'reward');
    box.appendChild(el('h2', 'brush', g.rewardTitle));

    const themes = g.nextThemes.map((t) => `<b style="color:${textInk(t)}">${INKS[t].hanja}</b>`).join(' · ');
    const counters = g.counterHints().map((t) => `<b style="color:${textInk(t)}">${INKS[t].hanja} ${INKS[t].name}</b>`).join(', ');
    box.appendChild(el('p', 'next', `${numeral(g.waveNo + 1)} 물결 — ${themes} 먹귀가 온다. 상극인 먹: ${counters}`));
    box.appendChild(inkBars(g));

    const row = el('div', g.rewards.length > 3 ? 'cards five' : 'cards');
    g.rewards.forEach((item, i) => {
      const card = this.card(item, i);
      row.appendChild(card);
      this.cards.push({ item, node: card });
    });
    box.appendChild(row);
    box.appendChild(el('p', 'hint', '숫자 키나 클릭으로 고른다'));
    this.root.appendChild(box);
  }

  private card(item: Item, i: number): HTMLElement {
    const g = this.game;
    const card = el('button', `card kind-${item.kind}`);
    const art = el('canvas', 'art') as HTMLCanvasElement;
    drawCardArt(art, item);
    card.appendChild(art);
    const glyphInk = item.kind === 'shift' ? item.inks[1] : item.kind === 'raise' ? item.inks[0] : null;
    card.appendChild(el('div', 'glyph', `<span style="color:${item.kind === 'relic' ? rgba(INK, 1) : textInk(glyphInk)}">${item.glyph}</span>`));
    card.appendChild(el('div', 'name', item.name));
    card.appendChild(el('div', 'desc', item.desc));
    if (item.tag) card.appendChild(el('div', 'tag-chip', item.tag));

    if (item.deltas) {
      const pv = g.ink.preview(item.deltas);
      const now = g.ink.dominant;
      const after = pv.dominant;
      const moves = g.character.combo(after).map((m) => m.name).join(' → ');
      const changed = after !== now;
      const dom = el('div', `dom ${changed ? 'changed' : ''}`);
      dom.innerHTML = changed
        ? `주속성 <b style="color:${textInk(now)}">${inkHanja(now)}</b> → <b style="color:${textInk(after)}">${inkHanja(after)} ${inkName(after)}</b>`
        : `주속성 그대로 · <b style="color:${textInk(after)}">${inkHanja(after)} ${inkName(after)}</b>`;
      card.appendChild(dom);
      card.appendChild(el('div', 'moves', moves));
    }
    card.appendChild(el('div', 'key', `${i + 1}`));
    card.onclick = () => this.choose(item);
    return card;
  }

  private choose(item: Item): void {
    if (this.game.phase !== 'reward') return;
    this.onSelect?.();
    this.game.chooseReward(item);
  }

  private over(): void {
    const g = this.game;
    this.root.classList.add('over-screen');
    const box = el('div', 'panel over');
    box.appendChild(el('h2', 'brush', '획이 끊어지다'));
    const m = Math.floor(g.runTime / 60);
    const s = Math.floor(g.runTime % 60);
    box.appendChild(
      el(
        'div',
        'stats',
        `<div><span>넘긴 물결</span><b>${g.waveNo}</b></div><div><span>쓰러뜨린 먹귀</span><b>${g.kills}</b></div><div><span>버틴 시간</span><b>${m}:${String(s).padStart(2, '0')}</b></div><div><span>마지막 먹</span><b>${inkHanja(g.ink.dominant)} ${inkName(g.ink.dominant)}</b></div>`,
      ),
    );
    const b = el('button', 'btn big', '다시 먹을 갈다');
    b.onclick = () => g.startRun();
    box.appendChild(b);
    this.root.appendChild(box);
  }
}

function controls(): HTMLElement {
  return el(
    'div',
    'controls',
    `<div><kbd>W A S D</kbd> 걷기</div><div><kbd>마우스</kbd> 겨누기</div><div><kbd>왼쪽 클릭</kbd> 세 획 콤보 (누르고 있으면 이어서)</div><div><kbd>Space</kbd> / <kbd>오른쪽 클릭</kbd> 비켜 서기</div><div><kbd>F</kbd> 자동 휘두르기</div><div><kbd>Esc</kbd> 멈춤</div><div><kbd>M</kbd> 소리 끄기</div>`,
  );
}

function inkBars(g: Game): HTMLElement {
  const wrap = el('div', 'inkbars');
  for (const id of INK_ORDER) {
    const d = INKS[id];
    const v = g.ink.values[id];
    const dom = g.ink.dominant === id;
    const bar = el('div', `inkbar ${dom ? 'dom' : ''}`);
    bar.innerHTML = `<span class="h" style="color:${textInk(id)}">${d.hanja}</span><span class="track"><span class="fill" style="width:${(v / INK_MAX) * 100}%;background:${rgba(d.color, 0.9)};${id === 'baek' ? 'box-shadow: inset 0 0 0 1px rgba(110,106,98,.6)' : ''}"></span></span><span class="v">${Math.round(v)}</span>`;
    wrap.appendChild(bar);
  }
  return wrap;
}

/* ───────── 카드 그림 ───────── */

function cardCanvas(c: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = w * dpr;
  c.height = h * dpr;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}

function drawCardArt(c: HTMLCanvasElement, item: Item): void {
  const W = 220;
  const H = 120;
  const ctx = cardCanvas(c, W, H);
  const seed = [...item.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const rng = mulberry32(seed);
  switch (item.kind) {
    case 'raise': {
      const d = INKS[item.inks[0]];
      wash(ctx, W / 2, H / 2, 70, d.color, 0.18, seed, 0.5);
      splatter(ctx, W * 0.72, H * 0.42, 16, d.color, seed + 1, 0.55);
      brushStroke(ctx, [{ x: 24, y: H * 0.68 }, { x: W * 0.4, y: H * 0.42 }, { x: W * 0.7, y: H * 0.52 }, { x: W - 30, y: H * 0.3 }], {
        width: 30,
        color: d.color,
        dryness: 0.45,
        taperIn: 0.15,
        taperOut: 0.5,
        seed: seed + 2,
        wet: 0.6,
        edgeColor: d.edge,
      });
      break;
    }
    case 'purify': {
      const col = item.inks.length ? INKS[item.inks[0]].color : DAMMUK;
      wash(ctx, W / 2, H / 2, 60, col, 0.12, seed, 0.6);
      for (let k = 0; k < 3; k++) {
        brushStroke(ctx, arcPoints(W / 2, H / 2, 18 + k * 18, rng() * TAU, TAU * 0.8, 24, 20 + k * 18, 0.5), {
          width: 4 - k,
          color: mix(col, PAPER, 0.3 + k * 0.2),
          alpha: 0.8 - k * 0.2,
          dryness: 0.3,
          seed: seed + k,
        });
      }
      brushStroke(ctx, [{ x: 30, y: H * 0.3 }, { x: W * 0.5, y: H * 0.45 }, { x: W - 30, y: H * 0.35 }], { width: 18, color: col, alpha: 0.35, dryness: 0.9, seed: seed + 9, taperOut: 0.6 });
      break;
    }
    case 'shift': {
      const a = INKS[item.inks[0]];
      const b = INKS[item.inks[1]];
      brushStroke(ctx, [{ x: 22, y: H * 0.62 }, { x: W * 0.3, y: H * 0.42 }, { x: W * 0.5, y: H * 0.5 }], { width: 26, color: a.color, alpha: 0.75, dryness: 0.75, taperIn: 0.1, taperOut: 0.6, seed: seed + 1, edgeColor: a.edge });
      brushStroke(ctx, [{ x: W * 0.42, y: H * 0.52 }, { x: W * 0.68, y: H * 0.44 }, { x: W - 24, y: H * 0.3 }], { width: 28, color: b.color, dryness: 0.25, taperIn: 0.25, taperOut: 0.45, seed: seed + 2, edgeColor: b.edge, wet: 0.6 });
      splatter(ctx, W - 40, H * 0.32, 10, b.color, seed + 3, 0.5);
      break;
    }
    case 'relic': {
      brushStroke(ctx, arcPoints(W / 2, H / 2, 40, rng() * TAU, TAU * 0.93, 30, 41), { width: 9, color: INK, alpha: 0.75, dryness: 0.55, taperIn: 0.08, taperOut: 0.4, seed });
      wash(ctx, W / 2, H / 2, 46, DAMMUK, 0.08, seed + 1);
      break;
    }
  }
}

function drawLogo(c: HTMLCanvasElement): void {
  const W = 520;
  const H = 300;
  const ctx = cardCanvas(c, W, H);
  // 오방색 다섯 점
  INK_ORDER.forEach((id, i) => {
    const d = INKS[id];
    splatter(ctx, 90 + i * 85, 248, 12, d.color, 40 + i, 0.75);
  });
  ctx.fillStyle = rgba(INK, 0.92);
  ctx.font = '900 132px "Noto Serif KR", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('墨流', W / 2 - 24, 110);
  ctx.globalAlpha = 0.2;
  ctx.fillText('墨流', W / 2 - 21, 113);
  ctx.globalAlpha = 1;
  brushStroke(ctx, [{ x: 70, y: 196 }, { x: 250, y: 186 }, { x: 440, y: 194 }], { width: 9, color: INK, dryness: 0.85, taperIn: 0.05, taperOut: 0.5, seed: 9 });
  ctx.font = '600 22px "Noto Serif KR", serif';
  ctx.fillStyle = rgba(INK, 0.8);
  ctx.fillText('I N K F L O W  ·  먹 의 흐 름', W / 2, 218);
  paintSeal(ctx, W - 70, 92, 50, '五色');
}

/** 글자로 쓸 때의 먹 색 — 흰 먹은 종이 위에서 안 보이니 회색으로 */
function textInk(id: InkId | null): string {
  if (!id) return rgba(DAMMUK, 1);
  return rgba(id === 'baek' ? [110, 106, 98] : INKS[id].edge, 1);
}
