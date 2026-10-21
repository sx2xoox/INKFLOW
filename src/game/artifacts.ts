/**
 * 물건 — 문방(文房)과 길에서 얻는 것들.
 * 물건은 저마다 효과를 주고, 한 가지 먹의 기운을 붙잡아 둔다(굳은 먹).
 * 붙잡힌 먹은 마르지도 씻기지도 않아서, 물건을 고르는 일이 곧 판 내내 지닐 먹을 정하는 일이 된다.
 * 같은 먹의 물건을 모으면 그 먹이 태과(太過)에 가까워진다.
 */
import type { InkId } from '../ink';
import type { Game } from './game';

export type ArtifactId =
  | 'bamboo-brush'
  | 'pine-dropper'
  | 'vine-knot'
  | 'sprout'
  | 'cinnabar-brush'
  | 'brazier'
  | 'flint'
  | 'seal-paste'
  | 'clay-inkstone'
  | 'paperweight'
  | 'jar'
  | 'folding-screen'
  | 'five-elements'
  | 'silver-knife'
  | 'iron-rest'
  | 'white-porcelain'
  | 'bronze-mirror'
  | 'pine-soot'
  | 'gourd'
  | 'well'
  | 'night-rain'
  | 'overflow-cup';

export interface Artifact {
  id: ArtifactId;
  name: string;
  /** 카드와 화면에 찍는 한 글자 */
  glyph: string;
  ink: InkId;
  /** 붙잡아 두는 먹의 기운 */
  lock: number;
  desc: string;
  /** 얻는 순간 한 번 */
  gain?: (g: Game) => void;
}

const list: Artifact[] = [
  /* 木 — 자라고 감고 되살린다 */
  {
    id: 'bamboo-brush',
    name: '대나무 붓대',
    glyph: '竹',
    ink: 'cheong',
    lock: 12,
    desc: '휘두르는 속도 +12%',
    gain: (g) => {
      g.player.attackSpeed *= 1.12;
    },
  },
  { id: 'pine-dropper', name: '솔잎 연적', glyph: '松', ink: 'cheong', lock: 10, desc: '방을 그려 낼 때마다 기력 +10' },
  { id: 'vine-knot', name: '덩굴 매듭', glyph: '蔓', ink: 'cheong', lock: 12, desc: '먹귀를 쓰러뜨리면 가장 가까운 먹귀를 1초 묶는다' },
  {
    id: 'sprout',
    name: '새순',
    glyph: '芽',
    ink: 'cheong',
    lock: 8,
    desc: '최대 기력 +20, 기력 20 회복',
    gain: (g) => {
      g.player.maxHp += 20;
      g.healPlayer(20);
    },
  },

  /* 火 — 태우고 터뜨린다 */
  { id: 'cinnabar-brush', name: '주칠 붓', glyph: '朱', ink: 'jeok', lock: 12, desc: '셋째 획에 맞은 먹귀에 불이 한 겹 붙는다 (어느 먹이든)' },
  { id: 'brazier', name: '화로', glyph: '爐', ink: 'jeok', lock: 10, desc: '불붙은 먹귀가 터지는 둘레와 피해 +50%' },
  { id: 'flint', name: '부싯돌', glyph: '燧', ink: 'jeok', lock: 10, desc: '비켜 선 자리에 불씨가 남는다' },
  { id: 'seal-paste', name: '붉은 인주', glyph: '印', ink: 'jeok', lock: 12, desc: '치명타 피해 ×2 → ×2.6' },

  /* 土 — 버티고 굳히고 거둔다 */
  { id: 'clay-inkstone', name: '황토 벼루', glyph: '硯', ink: 'hwang', lock: 14, desc: '받는 피해 −15%' },
  { id: 'paperweight', name: '돌 문진', glyph: '鎭', ink: 'hwang', lock: 12, desc: '셋째 획에 맞은 먹귀가 0.5초 굳는다' },
  { id: 'jar', name: '항아리', glyph: '甕', ink: 'hwang', lock: 10, desc: '먹방울을 주울 때마다 기력 +2' },
  { id: 'folding-screen', name: '병풍', glyph: '屛', ink: 'hwang', lock: 12, desc: '맞은 뒤 무적 +0.4초' },
  { id: 'five-elements', name: '오행도', glyph: '圖', ink: 'hwang', lock: 10, desc: '마르는 먹의 절반이 상생의 다음 먹으로 스민다' },

  /* 金 — 날카롭고 빠르고 되받는다 */
  { id: 'silver-knife', name: '은장도', glyph: '刀', ink: 'baek', lock: 12, desc: '치명타 확률 +10%' },
  {
    id: 'iron-rest',
    name: '쇠 필가',
    glyph: '架',
    ink: 'baek',
    lock: 10,
    desc: '비켜 서기 재사용 −25%',
    gain: (g) => {
      g.player.dashCdMul *= 0.75;
    },
  },
  { id: 'white-porcelain', name: '백자', glyph: '瓷', ink: 'baek', lock: 10, desc: '기력이 가득할 때 주는 피해 +25%' },
  { id: 'bronze-mirror', name: '청동 거울', glyph: '鏡', ink: 'baek', lock: 12, desc: '쳐낸 먹덩이를 되돌려 보낸다' },

  /* 水 — 흐르고 늦추고 끌어온다 */
  { id: 'pine-soot', name: '송연먹', glyph: '煙', ink: 'heuk', lock: 14, desc: '젖은 먹이 40% 덜 마른다' },
  { id: 'gourd', name: '먹물 표주박', glyph: '瓢', ink: 'heuk', lock: 10, desc: '비켜 선 길에 먹물 웅덩이가 남아 먹귀를 늦춘다' },
  { id: 'well', name: '우물', glyph: '井', ink: 'heuk', lock: 10, desc: '먹방울을 세 배 먼 곳에서 끌어온다' },
  { id: 'night-rain', name: '밤비', glyph: '雨', ink: 'heuk', lock: 12, desc: '기력이 1/3 아래면 받는 피해 −35%, 걸음 +15%' },
  { id: 'overflow-cup', name: '넘치는 잔', glyph: '溢', ink: 'heuk', lock: 10, desc: '태과일 때 주는 피해 +20%' },
];

export const ARTIFACTS: Record<ArtifactId, Artifact> = Object.fromEntries(list.map((a) => [a.id, a])) as Record<ArtifactId, Artifact>;
export const ARTIFACT_LIST: readonly Artifact[] = list;

/** 문방에서 치르는 값 — 붙잡는 먹보다 조금 더 많은 젖은 먹을 부어 굳힌다 */
export const priceOf = (a: Artifact): number => a.lock + 8;
