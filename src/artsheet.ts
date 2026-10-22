/**
 * 그림 점검용 낱장 (?sheet=tiger) — 게임 없이 캔버스에 자세들을 크게 늘어놓는다.
 */
import { TIGER_FRAMES, type TigerPoseName, drawTiger } from './render/tiger';
import { PAPER } from './render/color';
import { drawCarp, drawTurtle } from './render/sprites';
import { drawImugiHead } from './render/imugi';
import { INKS, INK_ORDER } from './ink';

export function showArtSheet(kind: string): void {
  if (kind === 'lotus') {
    lotusSheet();
    return;
  }
  if (kind !== 'tiger') return;
  const poses: [TigerPoseName, number][] = [
    ...Array.from({ length: TIGER_FRAMES.walk }, (_, f) => ['walk', f] as [TigerPoseName, number]),
    ...TIGER_FRAMES.names.map((n) => [n, 0] as [TigerPoseName, number]),
  ];
  const cols = 4;
  const cw = 270;
  const ch = 220;
  const scale = 2;
  const c = document.createElement('canvas');
  c.width = cols * cw * scale;
  c.height = Math.ceil(poses.length / cols) * ch * scale;
  c.style.width = `${cols * cw}px`;
  document.body.style.background = `rgb(${PAPER.join(',')})`;
  document.body.appendChild(c);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = `rgb(${PAPER.join(',')})`;
  ctx.fillRect(0, 0, c.width, c.height);
  poses.forEach(([name, f], i) => {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate((i % cols) * cw + 135, Math.floor(i / cols) * ch + 200);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${name} ${f}`, -128, -190);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.moveTo(-130, 0);
    ctx.lineTo(130, 0);
    ctx.stroke();
    drawTiger(ctx, name, f, 4400);
    ctx.restore();
  });
  Object.assign(window, { __ready: true });
}

/** 연못의 먹귀 — 잉어 여덟 자세, 거북 여덟 자세, 이무기 머리 */
function lotusSheet(): void {
  const scale = 2.4;
  const cw = 90;
  const ch = 80;
  const c = document.createElement('canvas');
  c.width = 8 * cw * scale;
  c.height = 7 * ch * scale;
  c.style.width = `${8 * cw}px`;
  document.body.style.background = `rgb(${PAPER.join(',')})`;
  document.body.appendChild(c);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = `rgb(${PAPER.join(',')})`;
  ctx.fillRect(0, 0, c.width, c.height);
  const cell = (col: number, row: number, draw: () => void): void => {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(col * cw + cw / 2, row * ch + ch - 16);
    draw();
    ctx.restore();
  };
  const els = ['jeok', 'cheong', 'baek'] as const;
  els.forEach((el, r) => {
    const d = INKS[el];
    for (let f = 0; f < 8; f++) cell(f, r * 2, () => drawCarp(ctx, f, d.color, d.edge, 100 + f));
    for (let f = 0; f < 8; f++) cell(f, r * 2 + 1, () => drawTurtle(ctx, f, d.color, d.edge, 100 + f));
  });
  INK_ORDER.forEach((el, i) => {
    const d = INKS[el];
    for (const open of [0, 1]) {
      ctx.save();
      ctx.scale(scale, scale);
      ctx.translate(i * 140 + 40 + open * 0, 6 * ch + 40 + (open ? 0 : 0));
      if (open) ctx.translate(0, 0);
      ctx.restore();
    }
    cell(i * 1.6, 6, () => drawImugiHead(ctx, 0, d.color, d.edge));
  });
  cell(7.2, 6, () => drawImugiHead(ctx, 1, INKS.cheong.color, INKS.cheong.edge));
  Object.assign(window, { __ready: true });
}
