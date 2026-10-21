/**
 * 그림 점검용 진열장. ?gallery=jeok 처럼 열면 그 먹의 세 획과 먹귀들이 멈춘 채로 놓인다.
 * ?gallery=enemies 는 모든 먹귀를 색별로 늘어놓는다.
 */
import type { Game } from './game/game';
import { WORLD_H, WORLD_W } from './game/types';
import { INK_ORDER, type InkId } from './ink';
import type { EnemyKind } from './game/types';

const KINDS: EnemyKind[] = ['drop', 'swallow', 'toad', 'brute'];

export function setupGallery(g: Game, which: string): { freeze: () => void; focus: { x: number; y: number } } {
  g.startRun();
  g.chooseReward(g.rewards[0]);
  g.wave = null;
  g.banner = null;
  g.enemies = [];
  g.stamps = [];
  const cx = WORLD_W / 2;
  const cy = WORLD_H / 2;
  const pl = g.player;
  pl.x = cx;
  pl.y = cy + 250;
  pl.aim = -Math.PI / 2;
  const focus = { x: cx, y: cy + 40 };

  if (which === 'enemies') {
    KINDS.forEach((kind, r) => {
      INK_ORDER.forEach((el, c) => {
        const e = g.addEnemy(kind, el, cx - 360 + c * 180, cy - 200 + r * 120);
        e.spawnT = 0;
        e.anim = c * 0.3;
      });
    });
    g.stamps = [];
    g.particles = [];
    g.rings = [];
    g.ink.reset();
    return { freeze: () => {}, focus: { x: cx, y: cy - 20 } };
  }

  const ink = (which === 'plain' ? null : (which as InkId)) ?? null;
  g.ink.reset();
  if (ink) g.ink.apply({ [ink]: 60 });
  g.switchFx = null;
  const moves = g.character.combo(ink);
  const traces = moves.map((m, i) => {
    const x = cx - 340 + i * 340;
    const y = cy - 20;
    return g.traceFor(m, ink, i, x, y, -Math.PI / 2 + (i === 1 ? 0.3 : 0), i % 2 === 0 ? 1 : -1, 0.6, 1, 1000 + i * 77);
  });
  // 투사체를 쓰는 셋째 획은 투사체도 함께
  if (ink === 'heuk') g.fireProjectile('wave', cx + 340, cy - 160, 0, -430, { r: 68, life: 0.6, dmg: 0, knock: 0, ink, potency: 0.6 });
  if (ink === 'baek') for (const o of [-0.2, 0, 0.2]) g.fireProjectile('blade', cx + 340 + Math.sin(o) * 120, cy - 150, Math.sin(o) * 660, -Math.cos(o) * 660, { r: 16, life: 0.4, dmg: 0, knock: 0, ink, potency: 0.6 });
  if (ink === 'cheong') g.addZone('thorns', cx - 160, cy + 60, 50, 999, 0, 0.6);
  if (ink === 'jeok') g.addZone('embers', cx + 340, cy + 20, 70, 999, 0, 0.6);
  if (ink === 'heuk') for (let i = 0; i < 3; i++) g.addZone('pool', cx - 420 + i * 70, cy + 80, 34, 999, 0, 0.6);

  // 먹귀 다섯 색과 상태
  INK_ORDER.forEach((el, i) => {
    const e = g.addEnemy(i % 2 ? 'drop' : 'toad', el, cx - 300 + i * 150, cy + 170);
    e.spawnT = 0;
    if (i === 0) e.burnStacks = 3;
    if (i === 1) e.rootT = 5;
    if (i === 2) e.stunT = 5;
    if (i === 3) e.slowT = 5;
  });
  g.stamps = [];
  g.particles = [];
  g.rings = [];
  for (const z of g.zones) z.life = z.maxLife - 1;
  for (const p of g.projectiles) for (let k = 0; k < 6; k++) p.trail.push({ x: p.x - p.vx * 0.012 * (6 - k), y: p.y - p.vy * 0.012 * (6 - k) });

  // 획은 다 그어진 순간에 멈춰 둔다
  return {
    focus,
    freeze: () => {
      g.traces = traces;
      for (const t of traces) t.t = t.draw;
    },
  };
}
