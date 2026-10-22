/**
 * 글이 많은 화면(첫 화면, 먹 고르기, 끝 화면)은 DOM으로 그린다.
 * 카드 그림은 게임과 같은 붓 도구로 캔버스에 그린다.
 */
import { TAU } from './core/math';
import { mulberry32 } from './core/rng';
import { type Game, numeral } from './game/game';
import { CHAPTERS, ROOM_KINDS, type RoomDef, TOTAL_ROOMS } from './game/rooms';
import type { Item } from './game/items';
import { ARTIFACTS } from './game/artifacts';
import { EXCESS_AT, EXCESS_COST, HOLD_MIN, INKS, INK_MAX, INK_ORDER, type InkDeltas, type InkId, inkHanja, inkName } from './ink';
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
  /** 이번 판에 그려 낸 방들의 그림 */
  album: () => { canvas: HTMLCanvasElement; room: RoomDef }[] = () => [];

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
        if (n >= 1 && n <= this.cards.length) this.choose(this.cards[n - 1].item, this.cards[n - 1].node);
      }
      if ((this.game.phase === 'title' || this.game.phase === 'over' || this.game.phase === 'won') && (e.code === 'Enter' || e.code === 'Space')) {
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
    else if (phase === 'won') this.won();
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
    box.appendChild(inkBars(this.game));
    if (this.game.artifactOrder.length) box.appendChild(ownedList(this.game, true));
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
    b.onclick = () => this.game.startRun('explore');
    box.appendChild(b);
    const sub = el('p', 'mode-desc', `${CHAPTERS.map((c) => `${c.name}(${c.hanja})`).join(' · ')} — 방 ${TOTAL_ROOMS}칸을 문을 골라 지나간다`);
    box.appendChild(sub);
    const e = el('button', 'btn ghost', '끝없는 물결');
    e.onclick = () => this.game.startRun('endless');
    box.appendChild(e);
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
    let next = '';
    if (g.mode === 'endless') next = `${numeral(g.waveNo + 1)} 물결 — ${themes} 먹귀가 온다. 상극인 먹: ${counters}`;
    else if (g.cleared.length === 0) next = `첫 방 — ${themes} 먹귀가 기다린다. 상극인 먹: ${counters}`;
    else if (g.rewards.some((r) => r.price)) next = '젖은 먹은 싸우는 동안 마른다 — 마르기 전에 물건으로 굳혀 두라. 값은 그 먹의 젖은 기운으로 치른다';
    else next = '고르고 나면 담장에 다음 방으로 가는 문이 그려진다';
    box.appendChild(el('p', 'next', next));
    box.appendChild(inkBars(g));
    if (g.artifactOrder.length) box.appendChild(ownedList(g, false));

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
    const afford = g.canAfford(item);
    const card = el('button', `card kind-${item.kind}${afford ? '' : ' poor'}`);
    const art = el('canvas', 'art') as HTMLCanvasElement;
    drawCardArt(art, item);
    card.appendChild(art);
    const glyphInk = item.kind === 'shift' ? item.inks[1] : item.kind === 'raise' || item.kind === 'artifact' ? item.inks[0] : null;
    card.appendChild(el('div', 'glyph', `<span style="color:${item.kind === 'relic' || item.kind === 'leave' ? rgba(INK, 1) : textInk(glyphInk)}">${item.glyph}</span>`));
    card.appendChild(el('div', 'name', item.name));
    card.appendChild(el('div', 'desc', item.desc));
    if (item.tag) card.appendChild(el('div', `tag-chip ${item.kind === 'artifact' ? 'lock' : ''}`, item.tag));
    if (item.price) {
      const have = Math.floor(g.ink.wet[item.price.ink]);
      card.appendChild(
        el('div', 'price', `값 · <b style="color:${textInk(item.price.ink)}">${INKS[item.price.ink].hanja}</b> 젖은 먹 ${item.price.amount} <span class="have">(지금 ${have})</span>`),
      );
    }

    const deltas: InkDeltas = { ...(item.deltas ?? {}) };
    if (item.price) deltas[item.price.ink] = (deltas[item.price.ink] ?? 0) - item.price.amount;
    const lock = item.artifact ? { id: ARTIFACTS[item.artifact].ink, amount: ARTIFACTS[item.artifact].lock } : undefined;
    if (item.deltas || lock) {
      const pv = g.ink.preview(deltas, lock);
      // 이 카드가 움직이는 먹 — 옮기기는 빼는 먹과 받는 먹, 나머지는 그 먹 하나
      const shown: InkId[] = item.kind === 'shift' ? [item.inks[0], item.inks[1]] : item.inks.slice(0, 1);
      for (const id of shown) {
        const before = g.ink.values[id];
        const after = pv.values[id];
        const note = before < HOLD_MIN && after >= HOLD_MIN ? ' · 새로 쥘 수 있다' : before >= HOLD_MIN && after < HOLD_MIN ? ' · 쥘 수 없게 된다' : '';
        card.appendChild(
          el('div', `dom ${note ? 'changed' : ''}`, `<b style="color:${textInk(id)}">${INKS[id].hanja}</b> ${Math.floor(before)} → <b>${Math.floor(after)}</b>${note}`),
        );
        if (after >= EXCESS_AT && !g.ink.over[id]) card.appendChild(el('div', 'excess', `太過 · ${EXCESS_COST[id].cost}`));
      }
      // 쥐었을 때 나갈 세 획 — 받는 먹 기준
      const main = shown[shown.length - 1];
      if (main && pv.values[main] >= HOLD_MIN) {
        card.appendChild(el('div', 'moves', `${INKS[main].hanja} · ${g.character.combo(main).map((m) => m.name).join(' → ')}`));
      }
      // 쥔 먹이 말라 저절로 바뀌는 때
      if (pv.active !== g.ink.active) {
        card.appendChild(
          el('div', 'dom changed', `붓의 먹 <b style="color:${textInk(g.ink.active)}">${inkHanja(g.ink.active)}</b> → <b style="color:${textInk(pv.active)}">${inkHanja(pv.active)} ${inkName(pv.active)}</b>`),
        );
      }
    }
    card.appendChild(el('div', 'key', `${i + 1}`));
    card.onclick = () => this.choose(item, card);
    return card;
  }

  private choose(item: Item, node?: HTMLElement): void {
    if (this.game.phase !== 'reward') return;
    if (!this.game.canAfford(item)) {
      // 먹이 모자라다 — 카드가 고개를 젓는다
      const n = node ?? this.cards.find((c) => c.item === item)?.node;
      n?.classList.remove('nope');
      void n?.offsetWidth;
      n?.classList.add('nope');
      return;
    }
    this.onSelect?.();
    this.game.chooseReward(item);
  }

  private stats(): HTMLElement {
    const g = this.game;
    const m = Math.floor(g.runTime / 60);
    const s = Math.floor(g.runTime % 60);
    const first = g.mode === 'explore' ? `<div><span>그려 낸 방</span><b>${g.cleared.length} / ${TOTAL_ROOMS}</b></div>` : `<div><span>넘긴 물결</span><b>${g.waveNo}</b></div>`;
    return el(
      'div',
      'stats',
      `${first}<div><span>쓰러뜨린 먹귀</span><b>${g.kills}</b></div><div><span>걸린 시간</span><b>${m}:${String(s).padStart(2, '0')}</b></div><div><span>마지막 먹</span><b>${inkHanja(g.ink.active)} ${inkName(g.ink.active)}</b></div>`,
    );
  }

  private over(): void {
    const g = this.game;
    this.root.classList.add('over-screen');
    const box = el('div', 'panel over');
    box.appendChild(el('h2', 'brush', '획이 끊어지다'));
    box.appendChild(this.stats());
    if (g.mode === 'explore' && this.album().length) box.appendChild(this.albumView());
    const b = el('button', 'btn big', '다시 먹을 갈다');
    b.onclick = () => g.startRun();
    box.appendChild(b);
    this.root.appendChild(box);
  }

  /** 장을 다 그렸다 — 그린 방들을 화첩으로 */
  private won(): void {
    const g = this.game;
    this.root.classList.add('won-screen');
    const box = el('div', 'panel won');
    box.appendChild(el('h2', 'brush', '병풍을 다 그리다'));
    box.appendChild(el('p', 'tag', '싸우며 남긴 먹 자국이 그대로 그림이 되었다'));
    box.appendChild(this.albumView());
    box.appendChild(this.stats());
    const b = el('button', 'btn big', '새 화첩을 펴다');
    b.onclick = () => g.startRun();
    box.appendChild(b);
    this.root.appendChild(box);
  }

  private albumView(): HTMLElement {
    const wrap = el('div', 'album');
    this.album().forEach(({ canvas, room }) => {
      const fig = el('figure', 'leaf');
      const img = el('img') as HTMLImageElement;
      img.src = canvas.toDataURL('image/jpeg', 0.9);
      img.alt = `${numeral(room.depth + 1)} 방`;
      fig.appendChild(img);
      const ch = CHAPTERS[room.chapter];
      const kind = room.kind === 'boss' ? ch.boss.name : ROOM_KINDS[room.kind].name;
      const elName = room.el ? `<b style="color:${textInk(room.el)}">${INKS[room.el].hanja}</b> ` : '';
      fig.appendChild(el('figcaption', '', `${ch.name} ${numeral(room.depth + 1)} 방 · ${elName}${kind}`));
      wrap.appendChild(fig);
    });
    return wrap;
  }
}

function controls(): HTMLElement {
  return el(
    'div',
    'controls',
    `<div><kbd>W A S D</kbd> 걷기</div><div><kbd>마우스</kbd> 겨누기</div><div><kbd>왼쪽 클릭</kbd> 세 획 콤보 (누르고 있으면 이어서)</div><div><kbd>Space</kbd> / <kbd>오른쪽 클릭</kbd> 비켜 서기</div><div><kbd>Q</kbd> <kbd>E</kbd> / <kbd>1–5</kbd> / 휠 먹 바꿔 쥐기</div><div><kbd>F</kbd> 자동 휘두르기</div><div><kbd>Esc</kbd> 멈춤</div><div><kbd>M</kbd> 소리 끄기</div>`,
  );
}

/** 다섯 먹의 기운 — 굳은 먹(짙게)과 젖은 먹(옅게), 태과 문턱 */
function inkBars(g: Game): HTMLElement {
  const wrap = el('div', 'inkbars');
  for (const id of INK_ORDER) {
    const d = INKS[id];
    const v = g.ink.values[id];
    const lk = g.ink.locked[id];
    const wt = g.ink.wet[id];
    const dom = g.ink.active === id;
    const ex = g.ink.over[id];
    const bar = el('div', `inkbar ${dom ? 'dom' : ''} ${ex ? 'ex' : ''}`);
    const edge = id === 'baek' ? 'box-shadow: inset 0 0 0 1px rgba(110,106,98,.6);' : '';
    bar.innerHTML =
      `<span class="h" style="color:${textInk(id)}">${d.hanja}</span>` +
      `<span class="track"><span class="fill lock" style="width:${(lk / INK_MAX) * 100}%;background:${rgba(mix(d.color, INK, 0.28), 0.95)};${edge}"></span>` +
      `<span class="fill wet" style="width:${(wt / INK_MAX) * 100}%;background:${rgba(d.color, 0.55)};${edge}"></span>` +
      `<span class="mark" style="left:${EXCESS_AT}%"></span></span>` +
      `<span class="v">${Math.round(v)}${lk > 0 ? `<small>굳 ${Math.round(lk)}</small>` : ''}</span>`;
    wrap.appendChild(bar);
  }
  return wrap;
}

/** 지닌 물건 — 보상 화면에는 글자만, 멈춤 화면에는 효과까지 */
function ownedList(g: Game, full: boolean): HTMLElement {
  const wrap = el('div', full ? 'owned full' : 'owned');
  if (!full) wrap.appendChild(el('span', 'label', '지닌 물건'));
  for (const id of g.artifactOrder) {
    const a = ARTIFACTS[id];
    const chip = el('span', 'item', `<b style="color:${textInk(a.ink)}">${a.glyph}</b>${full ? ` ${a.name} <i>${a.desc}</i>` : ''}`);
    chip.title = `${a.name} — ${a.desc} (굳은 ${INKS[a.ink].hanja} ${a.lock})`;
    wrap.appendChild(chip);
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
    case 'artifact': {
      // 물건은 그 먹으로 굳힌 네모난 인장처럼
      const d = INKS[item.inks[0]];
      wash(ctx, W / 2, H / 2, 64, d.color, 0.16, seed, 0.55);
      const r = 36;
      const pts = [
        { x: W / 2 - r, y: H / 2 - r },
        { x: W / 2 + r, y: H / 2 - r },
        { x: W / 2 + r, y: H / 2 + r },
        { x: W / 2 - r, y: H / 2 + r },
        { x: W / 2 - r, y: H / 2 - r + 2 },
      ];
      brushStroke(ctx, pts, { width: 7, color: mix(d.color, INK, 0.35), alpha: 0.85, dryness: 0.6, taperIn: 0.04, taperOut: 0.08, seed: seed + 1, edgeColor: d.edge });
      splatter(ctx, W / 2 + r + 18, H / 2 - r + 6, 9, d.color, seed + 2, 0.45);
      break;
    }
    case 'leave': {
      // 비켜 지나가는 발걸음
      for (let k = 0; k < 4; k++) {
        const x = 40 + k * 46;
        const y = H * 0.62 - (k % 2) * 14;
        brushStroke(ctx, [{ x, y }, { x: x + 12, y: y - 3 }], { width: 8, color: DAMMUK, alpha: 0.45, dryness: 0.6, taperIn: 0.3, taperOut: 0.6, seed: seed + k });
      }
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
