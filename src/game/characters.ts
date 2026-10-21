/**
 * 캐릭터 = 공격의 "형태", 먹 = 공격의 "성질".
 * 캐릭터는 먹마다 다른 3타 콤보를 가진다. 주속성 먹이 바뀌면 다음 타부터 새 콤보가 나간다.
 * 새 캐릭터는 CharacterDef 하나를 더 만들면 된다.
 */
import { rand } from '../core/math';
import { INKS, type InkId } from '../ink';
import type { Game } from './game';
import { BASE_DAMAGE, type Move, shapeCenter } from './moves';
import type { Action, Enemy } from './types';

export interface CharacterDef {
  id: string;
  name: string;
  hanja: string;
  desc: string;
  maxHp: number;
  speed: number;
  /** 먹마다 다른 세 동작 */
  combo(ink: InkId | null): readonly Move[];
  /** 먹마다 달라지는 공격 이름 — 화면에 보여 준다 */
  styleName(ink: InkId | null): string;
}

const dmgOf = (a: Action, mult: number): number => BASE_DAMAGE * mult * (1 + 0.6 * a.potency);

/* ───────── 먹마다 공통인 성질 ───────── */

function ignite(e: Enemy, p: number, stacks = 1): void {
  e.burnStacks = Math.min(3 + Math.floor(p * 3), e.burnStacks + stacks);
  e.burnT = 3;
  e.burnPower = Math.max(e.burnPower, 3 + 4 * p);
}

function bind(g: Game, a: Action, e: Enemy, t: number): void {
  e.rootT = Math.max(e.rootT, t);
  if (a.heals < 4) {
    a.heals++;
    g.healPlayer(0.8 + 1.6 * a.potency);
  }
}

/* ───────── 담묵 ───────── */

const PLAIN_COMBO: Move[] = [
  {
    name: '가로 긋기',
    windup: 0.05,
    active: 0.12,
    recovery: 0.2,
    shape: { type: 'arc', reach: 92, arc: 2.0 },
    damage: 1,
    knock: 110,
    lunge: 70,
    visual: 'sweep',
    width: 22,
    dryness: 0.4,
  },
  {
    name: '되돌려 긋기',
    windup: 0.05,
    active: 0.12,
    recovery: 0.22,
    shape: { type: 'arc', reach: 96, arc: 2.2 },
    damage: 1.1,
    knock: 120,
    lunge: 70,
    visual: 'sweep',
    width: 24,
    dryness: 0.4,
  },
  {
    name: '내려 긋기',
    windup: 0.16,
    active: 0.08,
    recovery: 0.36,
    shape: { type: 'circle', offset: 56, radius: 50 },
    damage: 1.9,
    knock: 230,
    lunge: 90,
    visual: 'slam',
    width: 30,
    dryness: 0.5,
    shake: 6,
    hitstop: 0.05,
  },
];

/* ───────── 흑묵(水) — 물결 ───────── */

const HEUK_COMBO: Move[] = [
  {
    name: '물결 쓸기',
    windup: 0.06,
    active: 0.17,
    recovery: 0.2,
    shape: { type: 'arc', reach: 114, arc: 2.6 },
    damage: 0.95,
    knock: 90,
    lunge: 50,
    visual: 'sweep',
    width: 36,
    dryness: 0.06,
    onHit: (_g, _a, e) => {
      e.slowT = Math.max(e.slowT, 1.4);
    },
    onEnd: (g, a) => {
      for (const t of [0.3, 0.75]) {
        const ang = a.aim - a.dir * 1.3 + a.dir * 2.6 * t;
        const rr = 80;
        g.addZone('pool', a.ox + Math.cos(ang) * rr, a.oy + 14 + Math.sin(ang) * rr, 26 + 12 * a.potency, 2.6 + 2 * a.potency, 2 + 4 * a.potency, a.potency);
      }
    },
  },
  {
    name: '소용돌이',
    windup: 0.07,
    active: 0.3,
    recovery: 0.2,
    shape: { type: 'spin', reach: 104 },
    damage: 1.05,
    knock: -90,
    visual: 'spin',
    width: 32,
    dryness: 0.08,
    moveMul: 0.6,
    onHit: (_g, _a, e) => {
      e.slowT = Math.max(e.slowT, 1.8);
    },
  },
  {
    name: '해일',
    windup: 0.15,
    active: 0.1,
    recovery: 0.38,
    shape: { type: 'none' },
    damage: 0,
    knock: 0,
    lunge: 60,
    visual: 'cast',
    width: 46,
    dryness: 0.05,
    shake: 5,
    onActive: (g, a) => {
      const sp = 430;
      g.fireProjectile('wave', a.ox + Math.cos(a.aim) * 30, a.oy + Math.sin(a.aim) * 30, Math.cos(a.aim) * sp, Math.sin(a.aim) * sp, {
        r: 58 + 16 * a.potency,
        life: 0.78,
        dmg: dmgOf(a, 1.7),
        knock: 200,
        ink: 'heuk',
        potency: a.potency,
      });
    },
  },
];

/* ───────── 적묵(火) — 불꽃 ───────── */

const JEOK_COMBO: Move[] = [
  {
    name: '불씨 베기',
    windup: 0.04,
    active: 0.1,
    recovery: 0.15,
    shape: { type: 'arc', reach: 94, arc: 2.0 },
    damage: 0.9,
    knock: 100,
    lunge: 80,
    visual: 'sweep',
    width: 24,
    dryness: 0.5,
    onHit: (_g, a, e) => ignite(e, a.potency),
  },
  {
    name: '불꽃 찌르기',
    windup: 0.06,
    active: 0.12,
    recovery: 0.18,
    shape: { type: 'thrust', length: 150, width: 36 },
    damage: 1.15,
    knock: 160,
    lunge: 380,
    visual: 'thrust',
    width: 26,
    dryness: 0.45,
    moveMul: 0.2,
    onActive: (g, a) => {
      for (let i = 0; i < 10; i++) {
        const ang = a.aim + rand(-0.35, 0.35);
        const sp = rand(200, 460);
        g.addParticle(a.ox, a.oy, Math.cos(ang) * sp, Math.sin(ang) * sp, rand(1.5, 3.2), INKS.jeok.color, 0.9, rand(0.25, 0.5), i % 3 === 0, 30);
      }
    },
    onHit: (_g, a, e) => ignite(e, a.potency),
  },
  {
    name: '화염 폭발',
    windup: 0.18,
    active: 0.08,
    recovery: 0.34,
    shape: { type: 'circle', offset: 72, radius: 78 },
    damage: 1.4,
    knock: 260,
    lunge: 60,
    visual: 'burst',
    width: 30,
    dryness: 0.5,
    shake: 9,
    hitstop: 0.07,
    onHit: (g, a, e) => {
      // 쌓인 불씨를 한꺼번에 터뜨린다
      if (e.burnStacks > 0 && !e.dead) {
        const extra = e.burnStacks * e.burnPower * 1.5;
        e.burnStacks = 0;
        g.damageEnemy(e, extra, 'jeok', { crit: true });
        g.addRing('burst', e.x, e.y - e.r * 0.5, e.r * 0.5, e.r * 2.2, 0.35, 6, INKS.jeok.color);
      }
      if (!e.dead) ignite(e, a.potency);
    },
    onEnd: (g, a) => {
      const c = shapeCenter(a);
      g.addZone('embers', c.x, c.y + 10, 58 + 14 * a.potency, 2.4 + 1.6 * a.potency, 4 + 4 * a.potency, a.potency);
    },
  },
];

/* ───────── 청묵(木) — 덩굴 ───────── */

const CHEONG_COMBO: Move[] = [
  {
    name: '덩굴 채찍',
    windup: 0.07,
    active: 0.14,
    recovery: 0.16,
    shape: { type: 'thrust', length: 196, width: 28 },
    damage: 0.9,
    knock: 60,
    visual: 'whip',
    width: 16,
    dryness: 0.25,
    onHit: (g, a, e) => bind(g, a, e, 0.5 + 0.6 * a.potency),
  },
  {
    name: '가시 휘두르기',
    windup: 0.05,
    active: 0.14,
    recovery: 0.2,
    shape: { type: 'arc', reach: 106, arc: 2.3 },
    damage: 1.0,
    knock: 110,
    lunge: 60,
    visual: 'sweep',
    width: 24,
    dryness: 0.3,
    onHit: (g, a, e) => bind(g, a, e, 0.4),
    onEnd: (g, a) => {
      g.addZone('thorns', a.ox + Math.cos(a.aim) * 74, a.oy + 12 + Math.sin(a.aim) * 74, 50 + 12 * a.potency, 3 + 2 * a.potency, 4 + 4 * a.potency, a.potency);
    },
  },
  {
    name: '휘감기',
    windup: 0.16,
    active: 0.32,
    recovery: 0.3,
    shape: { type: 'circle', offset: 96, radius: 86 },
    damage: 1.5,
    knock: 0,
    visual: 'vortex',
    width: 14,
    dryness: 0.25,
    shake: 4,
    moveMul: 0.3,
    onTick: (g, a, dt, prog) => {
      // 덩굴이 적을 가운데로 끌어당긴다
      const c = shapeCenter(a);
      const R = 86 * (1 + 0.15 * a.potency) + 30;
      for (const e of g.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const dx = c.x - e.x;
        const dy = c.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d < R && d > 6) {
          const pull = (420 * (1 - prog * 0.5)) / e.mass;
          e.x += (dx / d) * pull * dt;
          e.y += (dy / d) * pull * dt;
        }
      }
    },
    onHit: (g, a, e) => bind(g, a, e, 1.2 + 0.8 * a.potency),
  },
];

/* ───────── 황묵(土) — 바위 ───────── */

const HWANG_COMBO: Move[] = [
  {
    name: '바위 내리치기',
    windup: 0.16,
    active: 0.08,
    recovery: 0.26,
    shape: { type: 'circle', offset: 60, radius: 52 },
    damage: 1.6,
    knock: 260,
    lunge: 70,
    visual: 'slam',
    width: 40,
    dryness: 0.65,
    shake: 6,
    hitstop: 0.05,
    onHit: (_g, a, e) => {
      e.stunT = Math.max(e.stunT, 0.3 + 0.3 * a.potency);
    },
  },
  {
    name: '쓸어 밀기',
    windup: 0.1,
    active: 0.2,
    recovery: 0.28,
    shape: { type: 'arc', reach: 112, arc: 2.7 },
    damage: 1.4,
    knock: 380,
    lunge: 80,
    visual: 'sweep',
    width: 42,
    dryness: 0.7,
    shake: 4,
    onHit: (_g, a, e) => {
      e.stunT = Math.max(e.stunT, 0.25 + 0.2 * a.potency);
    },
  },
  {
    name: '땅울림',
    windup: 0.26,
    active: 0.1,
    recovery: 0.46,
    shape: { type: 'circle', offset: 0, radius: 150 },
    damage: 2.0,
    knock: 240,
    visual: 'quake',
    width: 40,
    dryness: 0.7,
    shake: 14,
    hitstop: 0.09,
    moveMul: 0.1,
    onActive: (g, a) => {
      g.addRing('shock', a.ox, a.oy + 14, 20, 170 * (1 + 0.15 * a.potency), 0.5, 10, INKS.hwang.color);
    },
    onHit: (_g, a, e) => {
      e.stunT = Math.max(e.stunT, 0.8 + 0.6 * a.potency);
    },
  },
];

/* ───────── 백묵(金) — 칼날 ───────── */

const BAEK_COMBO: Move[] = [
  {
    name: '일섬',
    windup: 0.02,
    active: 0.07,
    recovery: 0.11,
    shape: { type: 'arc', reach: 94, arc: 1.6 },
    damage: 0.8,
    knock: 60,
    lunge: 90,
    visual: 'sweep',
    width: 12,
    dryness: 0.2,
  },
  {
    name: '쌍섬',
    windup: 0.03,
    active: 0.12,
    recovery: 0.13,
    shape: { type: 'arc', reach: 98, arc: 1.9 },
    damage: 0.7,
    hits: 2,
    knock: 50,
    lunge: 90,
    visual: 'xslash',
    width: 11,
    dryness: 0.2,
  },
  {
    name: '검기',
    windup: 0.07,
    active: 0.07,
    recovery: 0.24,
    shape: { type: 'arc', reach: 84, arc: 1.4 },
    damage: 1.0,
    knock: 80,
    lunge: 60,
    visual: 'sweep',
    width: 14,
    dryness: 0.2,
    hitstop: 0.03,
    onActive: (g, a) => {
      const sp = 660;
      for (const off of [-0.2, 0, 0.2]) {
        const ang = a.aim + off;
        g.fireProjectile('blade', a.ox + Math.cos(ang) * 30, a.oy + Math.sin(ang) * 30, Math.cos(ang) * sp, Math.sin(ang) * sp, {
          r: 16,
          life: 0.55,
          dmg: dmgOf(a, 1.1),
          knock: 70,
          ink: 'baek',
          potency: a.potency,
        });
      }
    },
  },
];

const COMBOS: Record<InkId | 'plain', Move[]> = {
  plain: PLAIN_COMBO,
  heuk: HEUK_COMBO,
  jeok: JEOK_COMBO,
  cheong: CHEONG_COMBO,
  hwang: HWANG_COMBO,
  baek: BAEK_COMBO,
};

export const BRUSH_WIELDER: CharacterDef = {
  id: 'brush',
  name: '붓잡이',
  hanja: '筆',
  desc: '커다란 붓을 휘두르는 나그네. 먹에 따라 세 획의 흐름이 완전히 달라진다.',
  maxHp: 100,
  speed: 215,
  combo: (ink) => COMBOS[ink ?? 'plain'],
  styleName(ink) {
    switch (ink) {
      case 'cheong':
        return '덩굴 획';
      case 'jeok':
        return '불꽃 획';
      case 'hwang':
        return '바위 획';
      case 'baek':
        return '칼날 획';
      case 'heuk':
        return '물결 획';
      default:
        return '맑은 획';
    }
  },
};

export const CHARACTERS: CharacterDef[] = [BRUSH_WIELDER];

/** 치명타 확률 — 백묵은 날카롭다 */
export function critChance(ink: InkId | null, potency: number): number {
  return ink === 'baek' ? 0.15 + 0.25 * potency : 0.04;
}

