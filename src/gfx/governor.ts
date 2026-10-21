/**
 * 그리는 해상도를 기기에 맞춘다.
 * 고해상도 화면에서는 픽셀 수가 네 배로 늘어 붓질·합성 셰이더가 감당하지 못할 수 있다.
 * 프레임 간격이 화면 주사율보다 눈에 띄게 길어지면 한 단 내리고, 오래 넉넉하면 한 단 올려 본다.
 *  - 올렸다가 곧바로 다시 밀린 단은 다시 올리지 않는다.
 *  - 내렸는데도 빨라지지 않으면(그림 탓이 아니라 절전 모드 등으로 주사율이 묶인 것) 되돌리고 더 내리지 않는다.
 */
import type { Renderer } from 'pixi.js';

const LADDER = [2, 1.75, 1.5, 1.25, 1, 0.85, 0.7];
/** 처음 이만큼은 지켜보기만 한다(ms) */
const WARMUP = 1500;
/** 이만큼 밀린 상태가 이어지면 내린다(ms) */
const SLOW_HOLD = 1200;
/** 이만큼 넉넉한 상태가 이어지면 올려 본다(ms) */
const FAST_HOLD = 9000;
/** 올린 뒤 이 안에 밀리면 그 단은 이 기기에 무겁다고 본다(ms) */
const PROBATION = 6000;
/** 내린 뒤 이만큼 지켜보고 효과가 있었는지 본다(ms) */
const VERIFY = 2500;

export class ResolutionGovernor {
  private readonly levels: number[];
  private level: number;
  /** 올라갈 수 있는 가장 높은 단(작은 번호일수록 고해상도) */
  private ceiling = 0;
  /** 내려갈 수 있는 가장 낮은 단 */
  private floor: number;
  private ema = 16.7;
  private slowT = 0;
  private fastT = 0;
  private sinceUp = Infinity;
  private elapsed = 0;
  private readonly recent: number[] = [];
  private refresh = 16.7;
  private frames = 0;
  /** 막 내린 단의 효과를 재는 중 */
  private trial: { from: number; before: number; t: number; sum: number; n: number } | null = null;

  constructor(
    private readonly renderer: Renderer,
    private readonly onChange: () => void,
    maxRes: number,
    startRes: number,
  ) {
    this.levels = [maxRes, ...LADDER.filter((r) => r < maxRes - 0.01)];
    this.level = this.levels.findIndex((r) => r <= startRes + 0.01);
    if (this.level < 0) this.level = this.levels.length - 1;
    this.floor = this.levels.length - 1;
  }

  get resolution(): number {
    return this.levels[this.level];
  }

  /** 프레임마다 직전 프레임 간격(ms)을 알려 준다 */
  frame(ms: number): void {
    if (ms <= 0) return;
    // 그림을 새로 굽는 순간의 큰 끊김 하나가 판단을 휘두르지 않게 눌러 둔다
    ms = Math.min(ms, 100);
    this.elapsed += ms;
    this.recent.push(ms);
    if (this.recent.length > 120) this.recent.shift();
    if (++this.frames % 30 === 0) {
      // 화면 주사율 — 빠른 프레임들의 간격. 모든 프레임이 밀리는 기기라도 60Hz보다 느리게 잡지는 않는다
      const sorted = [...this.recent].sort((a, b) => a - b);
      this.refresh = Math.max(6.5, Math.min(16.7, sorted[Math.floor(sorted.length * 0.1)]));
    }
    this.ema += (ms - this.ema) * 0.08;
    this.sinceUp += ms;
    if (this.elapsed < WARMUP) return;

    if (this.trial) {
      const tr = this.trial;
      tr.t += ms;
      tr.sum += ms;
      tr.n++;
      if (tr.t < VERIFY) return;
      this.trial = null;
      if (tr.sum / tr.n > tr.before * 0.9) {
        // 해상도 탓이 아니었다 — 원래대로 두고 더는 내리지 않는다
        this.floor = tr.from;
        this.set(tr.from);
        return;
      }
    }

    const slow = this.ema > this.refresh * 1.3 + 1.5;
    const fast = this.ema < this.refresh * 1.08 + 0.5;
    this.slowT = slow ? this.slowT + ms : Math.max(0, this.slowT - ms * 0.5);
    this.fastT = fast ? this.fastT + ms : 0;

    if (this.slowT > SLOW_HOLD && this.level < this.floor) {
      if (this.sinceUp < PROBATION) this.ceiling = this.level + 1;
      const from = this.level;
      const before = this.ema;
      this.set(this.level + 1);
      this.trial = { from, before, t: 0, sum: 0, n: 0 };
    } else if (this.fastT > FAST_HOLD && this.level > this.ceiling) {
      this.set(this.level - 1);
      this.sinceUp = 0;
    }
  }

  private set(level: number): void {
    this.level = level;
    this.slowT = 0;
    this.fastT = 0;
    this.ema = this.refresh;
    const r = this.renderer;
    r.resize(r.screen.width, r.screen.height, this.resolution);
    this.onChange();
  }
}
