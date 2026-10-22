import type { Vec } from '../core/math';
import type { InkId } from '../ink';
import type { RGB } from '../render/color';
import type { Move } from './moves';
import type { RoomDef } from './rooms';

/** 방 한 칸(그림 한 폭)의 크기 */
export const WORLD_W = 1600;
export const WORLD_H = 1000;
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
  /** 큰 일격에 밀려나는 속도 */
  kx: number;
  ky: number;
}

export type EnemyKind = 'drop' | 'swallow' | 'brute' | 'toad' | 'carp' | 'turtle' | 'fox' | 'lion' | 'tiger' | 'imugi' | 'phoenix';
/** 따로 그리는 주인들 — 아틀라스의 먹귀 그림에는 없다 */
export type BossKind = 'tiger' | 'imugi' | 'phoenix';

/**
 * 묵호(墨虎)의 동작.
 * perch: 담장 위에서 내려다본다 → descend: 뛰어내린다 → roar: 포효
 * stalk: 어슬렁거리며 다가온다 / swipe: 앞발 할퀴기 / crouch → leap → rest: 덮치기
 * aim → dash: 내달리기 / stagger: 부딪혀 휘청 / die: 쓰러진다
 */
export type TigerMove = 'perch' | 'descend' | 'roar' | 'stalk' | 'swipe' | 'crouch' | 'leap' | 'rest' | 'aim' | 'dash' | 'stagger' | 'die';

/**
 * 이무기의 동작.
 * rise: 못에서 깨어난다 → roar / swim: 먹 속을 헤엄친다(붓이 닿지 않는다) → surface: 솟는다
 * bite: 고개를 젖혔다 물어뜯는다 / spit: 먹물을 뿜는다 / sink: 다시 잠긴다
 * burrow → burst: 잠긴 채 붓잡이 발밑을 노리다 치솟는다 / coil: 치솟은 뒤 몸을 사린다(틈)
 */
export type SerpentMove = 'rise' | 'swim' | 'surface' | 'bite' | 'spit' | 'sink' | 'burrow' | 'burst' | 'coil';

/**
 * 봉황의 동작.
 * perch: 용마루에 앉아 내려다본다 → cry: 날개를 펴고 운다 → glide: 마당으로 내려앉는다
 * hover: 낮게 떠서 맴돈다(붓이 닿는다) / volley: 깃털 부채를 날린다 / gust: 날개 바람으로 밀어낸다
 * soar → plunge: 하늘 높이 올라 붓잡이를 쫓다가 붉은 원으로 내리꽂는다 → rest: 땅에서 숨을 고른다(틈)
 * climb → sweep: 마당 끝으로 날아가 붉은 띠를 따라 낮게 활공한다
 * fall: 종소리에 떨어져 버둥거린다(가장 큰 틈) / die
 */
export type BirdMove = 'perch' | 'cry' | 'glide' | 'hover' | 'volley' | 'gust' | 'soar' | 'plunge' | 'rest' | 'climb' | 'sweep' | 'fall' | 'die';

export type BossMove = TigerMove | SerpentMove | BirdMove;

export interface BossState {
  species: BossKind;
  move: BossMove;
  /** 지금 동작에 들어선 뒤의 시간 */
  t: number;
  dur: number;
  /** 1..3 — 기력이 줄수록 사나워진다 */
  phase: number;
  /** 포효를 마친 단계 */
  roared: number;
  /** 겨누는 방향(단위 벡터) */
  ax: number;
  ay: number;
  /** 동작의 시작점과 목표점 */
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  /** 공중에 뜬 높이 — 높이 뜨면 붓이 닿지 않는다 */
  z: number;
  /** 이번 동작이 이미 붓잡이를 쳤는지 */
  hit: boolean;
  /** 남은 연속 동작 수 */
  chain: number;
  /** 할퀴기를 내지르기까지의 시간 */
  wind: number;
  /** 어슬렁거릴 때 도는 쪽 */
  side: 1 | -1;
  pounceCd: number;
  dashCd: number;
  /** 내달리다 벽이나 바위에 막혔다 */
  blocked: boolean;
  /** 이무기의 몸 — 머리부터 꼬리까지의 마디 */
  spine: Vec[];
  /** 먹 속에 잠긴 정도 0..1 */
  under: number;
  /** 머리가 향한 쪽(라디안) */
  heading: number;
  /** 날갯짓의 위상(라디안) — 봉황 */
  flap: number;
  /** 종소리에 다시 떨어지지 않는 시간 — 봉황 */
  guard: number;
}

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
  /** 쓰러지면 반드시 떨구는 먹의 양(0이면 종류의 기본 확률을 따른다) */
  loot: number;
  /** 뛰어오른 자리(잉어) */
  ox: number;
  oy: number;
  /** 땅에서 뜬 높이 */
  z: number;
  /** 옆모습 먹귀가 바라보는 쪽(거북은 천천히 돌아선다) */
  side: 1 | -1;
  /** 돌아서기까지 남은 시간 */
  turnT: number;
  /** 여우가 물고 달아난 먹 — 쓰러뜨리면 되찾는다 */
  carry: { ink: InkId; amount: number } | null;
  boss: BossState | null;
}

/** 공격이 그림 위에 남기는 획. 판정과 별개로 잠시 남았다가 마른다. */
export type Visual = 'sweep' | 'spin' | 'thrust' | 'whip' | 'slam' | 'burst' | 'quake' | 'vortex' | 'xslash' | 'cast' | 'claw' | 'rake';

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

export type ProjectileKind = 'blade' | 'wave' | 'glob' | 'feather';

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
  /** 화면 아래쪽에 건다 — 위쪽의 무언가를 가리지 않게 */
  low?: boolean;
}

/** 산사의 범종 — 붓으로 치면 울려 둘레의 먹귀를 굳힌다. 한 번 울리면 한동안 쉰다 */
export interface Bell {
  x: number;
  y: number;
  /** 다시 칠 수 있을 때까지 */
  cd: number;
  /** 흔들리는 각도와 빠르기 */
  swing: number;
  vel: number;
  /** 울림이 남은 정도 0..1 */
  hum: number;
}

/** 담장에 그려지는 달문. room이 없으면 장을 마치는 문이다. */
export interface Gate {
  x: number;
  y: number;
  r: number;
  room: RoomDef | null;
  /** 0..1 — 붓으로 그려지는 정도 */
  open: number;
  seed: number;
}

/** 문을 지나 다음 방으로 넘어가는 동안 */
export interface Transition {
  t: number;
  dur: number;
  to: RoomDef | null;
  swapped: boolean;
}
