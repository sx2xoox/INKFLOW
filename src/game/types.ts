import type { Vec } from '../core/math';
import type { InkId } from '../ink';
import type { RGB } from '../render/color';
import type { Move } from './moves';

export const WORLD_W = 2400;
export const WORLD_H = 1600;
/** 그림 테두리 안쪽으로만 움직일 수 있다 */
export const WALL = 56;

export type ActionPhase = 'windup' | 'active' | 'recovery';

/** 지금 펼치고 있는 콤보의 한 동작 */
export interface Action {
  move: Move;
  /** 0, 1, 2 — 콤보의 몇 번째 타인지 */
  step: number;
  ink: InkId | null;
  potency: number;
  aim: number;
  dir: 1 | -1;
  t: number;
  phase: ActionPhase;
  /** 판정의 기준점(동작이 시작된 자리) */
  ox: number;
  oy: number;
  /** 적 id → 맞은 횟수 */
  hits: Map<number, number>;
  seed: number;
  heals: number;
  speed: number;
}

export interface Player {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  speed: number;
  aim: number;
  facing: 1 | -1;
  walk: number;
  moving: boolean;
  invuln: number;
  hurtT: number;
  dashT: number;
  dashCd: number;
  dashDx: number;
  dashDy: number;
  /** 대시가 지나간 자리 — 마른 붓 자국으로 그린다 */
  trail: Vec[];
  trailFade: number;
  action: Action | null;
  /** 다음에 나갈 콤보 단계 */
  comboStep: number;
  /** 이 시간 안에 다시 공격하면 콤보가 이어진다 */
  comboT: number;
  queued: boolean;
  /** 붓을 쥔 팔의 각도 */
  brushAngle: number;
  attackSpeed: number;
  moveMul: number;
  dashCdMul: number;
}

export type EnemyKind = 'drop' | 'swallow' | 'brute' | 'toad';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  el: InkId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 밀려나는 속도 */
  kx: number;
  ky: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  mass: number;
  seed: number;
  anim: number;
  face: number;
  hitT: number;
  spawnT: number;
  dead: boolean;
  burnStacks: number;
  burnT: number;
  burnTick: number;
  burnPower: number;
  slowT: number;
  rootT: number;
  stunT: number;
  inPool: boolean;
  ai: number;
  aiT: number;
  tx: number;
  ty: number;
  /** 0..1 — 먹두꺼비가 먹을 뱉기 전 볼이 부푸는 정도 */
  charge: number;
}

/** 공격이 그림 위에 남기는 획. 판정과 별개로 잠시 남았다가 마른다. */
export type Visual = 'sweep' | 'spin' | 'thrust' | 'whip' | 'slam' | 'burst' | 'quake' | 'vortex' | 'xslash' | 'cast';

export interface Trace {
  visual: Visual;
  ink: InkId | null;
  step: number;
  x: number;
  y: number;
  aim: number;
  dir: 1 | -1;
  reach: number;
  arc: number;
  length: number;
  radius: number;
  width: number;
  dryness: number;
  potency: number;
  t: number;
  /** 붓이 지나가는 데 걸리는 시간 */
  draw: number;
  /** 그려진 뒤 마르기까지 */
  fade: number;
  seed: number;
}

export type ProjectileKind = 'blade' | 'wave' | 'glob';

export interface Projectile {
  kind: ProjectileKind;
  hostile: boolean;
  ink: InkId | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  dmg: number;
  knock: number;
  pierce: Set<number>;
  seed: number;
  dead: boolean;
  trail: Vec[];
  potency: number;
  /** 지나간 자리에 웅덩이를 남기는 간격 */
  dropAcc: number;
}

export type ZoneKind = 'pool' | 'thorns' | 'embers';

/** 바닥에 남아 적에게 작용하는 자리 */
export interface Zone {
  kind: ZoneKind;
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
  seed: number;
  dps: number;
  tick: number;
  potency: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: RGB;
  alpha: number;
  life: number;
  maxLife: number;
  drag: number;
  /** 떨어진 자리에 먹 자국을 남긴다 */
  stain: boolean;
  seed: number;
  /** 위로 날아오르는 불티 같은 것 */
  rise: number;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: RGB;
  size: number;
  life: number;
  maxLife: number;
  vy: number;
}

export type RingKind = 'enso' | 'burst' | 'crack' | 'spawn' | 'shock';

export interface Ring {
  kind: RingKind;
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  maxLife: number;
  color: RGB;
  width: number;
  seed: number;
}

export interface Pickup {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ink: InkId;
  amount: number;
  t: number;
  life: number;
  seed: number;
  dead: boolean;
}

/** 그림 바탕에 영구히 남는 먹 자국. 화면 쪽에서 꺼내 그린다. */
export interface Stamp {
  kind: 'splat' | 'blob';
  x: number;
  y: number;
  r: number;
  color: RGB;
  alpha: number;
  seed: number;
  rot: number;
  /** 젖은 정도 — 번짐 시뮬레이션에 넣을 물의 양 */
  wet: number;
}

export interface Banner {
  title: string;
  sub: string;
  t: number;
  dur: number;
  color: RGB;
}
