/**
 * 콤보 동작 정의. 동작 하나는 "준비 → 판정 → 마무리" 세 구간으로 나뉘고,
 * 마무리 도중 공격을 누르면 다음 타로 이어진다.
 */
import { TAU, clamp, easeOutCubic } from '../core/math';
import type { Game } from './game';
import type { Action, Enemy, Visual } from './types';

export type Shape =
  | { type: 'arc'; reach: number; arc: number }
  | { type: 'spin'; reach: number }
  | { type: 'thrust'; length: number; width: number }
  | { type: 'circle'; offset: number; radius: number }
  | { type: 'none' };

export interface Move {
  name: string;
  windup: number;
  active: number;
  recovery: number;
  shape: Shape;
  /** 기본 피해(10) 대비 배율 */
  damage: number;
  /** 한 동작에서 같은 적을 몇 번 벨 수 있는지 */
  hits?: number;
  knock: number;
  /** 판정이 시작될 때 앞으로 내딛는 힘 */
  lunge?: number;
  visual: Visual;
  width: number;
  dryness: number;
  fade?: number;
  shake?: number;
  hitstop?: number;
  /** 동작 중 움직일 수 있는 정도 */
  moveMul?: number;
  onActive?: (g: Game, a: Action) => void;
  onTick?: (g: Game, a: Action, dt: number, prog: number) => void;
  onHit?: (g: Game, a: Action, e: Enemy) => void;
  onEnd?: (g: Game, a: Action) => void;
}

export const BASE_DAMAGE = 10;

/** 판정 영역 안에 있는지. prog는 판정 구간의 진행도 0..1 */
export function inShape(a: Action, prog: number, ex: number, ey: number, er: number): boolean {
  const s = a.move.shape;
  const dx = ex - a.ox;
  const dy = ey - a.oy;
  switch (s.type) {
    case 'arc':
    case 'spin': {
      const reach = s.reach * (1 + 0.15 * a.potency);
      const d = Math.hypot(dx, dy);
      if (d > reach + er) return false;
      if (d < 24 + er) return true;
      const arc = s.type === 'arc' ? s.arc : TAU;
      const start = s.type === 'arc' ? a.aim - (a.dir * arc) / 2 : a.aim + Math.PI;
      const swept = arc * easeOutCubic(prog);
      let rel = (Math.atan2(dy, dx) - start) * a.dir;
      rel = ((rel % TAU) + TAU) % TAU;
      if (s.type === 'arc' && rel > Math.PI * 1.5) rel -= TAU;
      const tol = Math.asin(Math.min(1, er / d));
      return rel >= -tol && rel <= swept + tol;
    }
    case 'thrust': {
      const len = s.length * (1 + 0.12 * a.potency) * easeOutCubic(prog);
      const ux = Math.cos(a.aim);
      const uy = Math.sin(a.aim);
      const along = clamp(dx * ux + dy * uy, 0, len);
      const px = dx - ux * along;
      const py = dy - uy * along;
      return Math.hypot(px, py) < s.width / 2 + er;
    }
    case 'circle': {
      const cx = a.ox + Math.cos(a.aim) * s.offset;
      const cy = a.oy + Math.sin(a.aim) * s.offset;
      return Math.hypot(ex - cx, ey - cy) < s.radius * (1 + 0.15 * a.potency) + er * 0.6;
    }
    default:
      return false;
  }
}

/** 원형 판정의 중심 */
export function shapeCenter(a: Action): { x: number; y: number } {
  const s = a.move.shape;
  if (s.type === 'circle') return { x: a.ox + Math.cos(a.aim) * s.offset, y: a.oy + Math.sin(a.aim) * s.offset };
  return { x: a.ox, y: a.oy };
}
