/**
 * 그림 점검용 낱장 (?sheet=tiger) — 게임 없이 캔버스에 자세들을 크게 늘어놓는다.
 */
import { TIGER_FRAMES, type TigerPoseName, drawTiger } from './render/tiger';
import { PAPER } from './render/color';

export function showArtSheet(kind: string): void {
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
