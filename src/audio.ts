/**
 * 소리도 그림처럼 코드로 만든다. 소리 파일 없이 WebAudio로 합성한다.
 * 오행은 오음(五音)과 짝을 이룬다: 목-각, 화-치, 토-궁, 금-상, 수-우.
 */
import type { InkId } from './ink';

export type SoundEvent =
  | { type: 'swing'; ink: InkId | null; step: number }
  | { type: 'hit'; strong: boolean; crit: boolean }
  | { type: 'kill'; big: boolean }
  | { type: 'pickup'; ink: InkId }
  | { type: 'switch'; ink: InkId | null }
  | { type: 'hurt' }
  | { type: 'wave' }
  | { type: 'explode' }
  | { type: 'quake' }
  | { type: 'dash' }
  | { type: 'spit' }
  | { type: 'seal' }
  | { type: 'gate' }
  | { type: 'ui' }
  | { type: 'roar'; big: boolean }
  | { type: 'claw' }
  | { type: 'bell' }
  | { type: 'cry'; big: boolean }
  | { type: 'gust' }
  | { type: 'blink' }
  | { type: 'stone' };

/** 궁(C) 상(D) 각(E) 치(G) 우(A) */
const NOTE: Record<InkId | 'plain', number> = {
  hwang: 261.63,
  baek: 293.66,
  cheong: 329.63,
  jeok: 392.0,
  heuk: 440.0,
  plain: 349.23,
};

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  muted = false;
  private budget = new Map<string, number>();

  /** 브라우저는 사용자의 첫 입력 뒤에만 소리를 허락한다 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 1.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  /** 한 프레임에 같은 소리가 너무 겹치지 않게 */
  beginFrame(): void {
    this.budget.clear();
  }

  play(e: SoundEvent): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const n = this.budget.get(e.type) ?? 0;
    if (n >= (e.type === 'hit' ? 3 : 2)) return;
    this.budget.set(e.type, n + 1);
    const t = ctx.currentTime;
    switch (e.type) {
      case 'swing':
        return this.swing(t, e.ink, e.step);
      case 'hit':
        this.thump(t, e.strong ? 150 : 120, e.strong ? 0.5 : 0.32, 0.09);
        this.burst(t, 'highpass', 2400, 0.04, e.crit ? 0.4 : 0.18);
        if (e.crit) this.tone(t, 1760, 0.08, 0.12, 'triangle');
        return;
      case 'kill':
        this.burst(t, 'lowpass', e.big ? 500 : 900, e.big ? 0.45 : 0.22, e.big ? 0.6 : 0.35);
        this.thump(t, e.big ? 90 : 220, 0.3, e.big ? 0.2 : 0.08);
        return;
      case 'pickup':
        this.pluck(t, NOTE[e.ink] * 2, 0.22);
        return;
      case 'switch': {
        const f = NOTE[e.ink ?? 'plain'];
        // 싱잉볼 같은 맑은 울림
        for (const [mul, amp] of [
          [1, 0.22],
          [2.76, 0.08],
          [5.4, 0.04],
        ] as const) {
          this.tone(t, f * mul, 1.8, amp, 'sine');
        }
        return;
      }
      case 'hurt':
        this.thump(t, 80, 0.6, 0.25);
        this.burst(t, 'lowpass', 400, 0.2, 0.4);
        return;
      case 'wave':
        // 북 두 번
        this.thump(t, 70, 0.8, 0.5);
        this.burst(t, 'lowpass', 300, 0.15, 0.25);
        this.thump(t + 0.28, 64, 0.7, 0.55);
        return;
      case 'explode':
        this.burst(t, 'lowpass', 1200, 0.5, 0.6);
        this.crackle(t, 0.4);
        this.thump(t, 70, 0.5, 0.3);
        return;
      case 'quake':
        this.burst(t, 'lowpass', 160, 0.8, 0.9);
        this.thump(t, 50, 0.9, 0.6);
        return;
      case 'dash':
        this.sweep(t, 600, 2200, 0.16, 0.18, 'bandpass');
        return;
      case 'spit':
        this.thump(t, 300, 0.15, 0.06);
        this.burst(t, 'bandpass', 900, 0.08, 0.15);
        return;
      case 'seal':
        // 낙관을 꾹 누르는 소리
        this.thump(t, 110, 0.55, 0.18);
        this.burst(t, 'lowpass', 700, 0.12, 0.3);
        this.tone(t + 0.05, NOTE.hwang, 1.4, 0.12, 'sine');
        this.tone(t + 0.05, NOTE.hwang * 1.5, 1.2, 0.06, 'sine');
        return;
      case 'gate':
        // 붓으로 문을 그리는 소리와 맑은 울림
        this.sweep(t, 400, 1600, 0.5, 0.25, 'bandpass');
        this.tone(t + 0.15, NOTE.heuk * 2, 1.6, 0.08, 'sine');
        this.tone(t + 0.3, NOTE.cheong * 2, 1.6, 0.06, 'sine');
        return;
      case 'ui':
        // 목탁
        this.tone(t, 820, 0.09, 0.25, 'sine');
        this.burst(t, 'bandpass', 1600, 0.03, 0.2);
        return;
      case 'roar':
        return this.roar(t, e.big);
      case 'claw':
        // 앞발이 공기를 찢는다
        this.sweep(t, 300, 1400, 0.22, 0.5, 'bandpass');
        this.burst(t + 0.06, 'highpass', 1800, 0.12, 0.3);
        this.thump(t + 0.05, 140, 0.3, 0.12);
        return;
      case 'bell':
        return this.bell(t);
      case 'cry':
        return this.cry(t, e.big);
      case 'gust':
        // 날개가 공기를 크게 밀어낸다
        this.sweep(t, 200, 900, 0.45, 0.45, 'lowpass');
        this.thump(t, 70, 0.4, 0.2);
        return;
      case 'blink':
        // 먹 연기 — 훅 꺼지는 숨
        this.sweep(t, 2400, 500, 0.18, 0.22, 'bandpass');
        this.tone(t, 660, 0.12, 0.05, 'sine');
        return;
      case 'stone':
        // 돌이 맞부딪히는 단단한 소리
        this.tone(t, 1240, 0.06, 0.12, 'square');
        this.burst(t, 'highpass', 3200, 0.05, 0.25);
        this.thump(t, 180, 0.2, 0.05);
        return;
    }
  }

  /**
   * 범종 — 낮은 맥놀이가 길게 남는다. 고르지 않은 배음을 여럿 겹치고,
   * 바닥음 둘을 살짝 어긋나게 해 소리가 울렁이게 한다.
   */
  private bell(t: number): void {
    const f = 98;
    for (const [mul, amp, dur] of [
      [1, 0.3, 5.5],
      [1.012, 0.22, 5.5],
      [2.0, 0.12, 3.6],
      [2.76, 0.1, 2.8],
      [3.6, 0.06, 2.0],
      [5.4, 0.04, 1.2],
      [8.9, 0.025, 0.6],
    ] as const) {
      this.tone(t, f * mul, dur, amp, 'sine');
    }
    // 당목이 종을 치는 둔탁한 소리
    this.thump(t, 90, 0.7, 0.25);
    this.burst(t, 'lowpass', 600, 0.2, 0.35);
  }

  /** 봉황의 울음 — 높이 꺾여 올라가는 맑은 소리에 떨림을 얹는다 */
  private cry(t: number, big: boolean): void {
    const ctx = this.ctx!;
    const dur = big ? 1.3 : 0.45;
    for (const [mul, amp] of [
      [1, big ? 0.22 : 0.14],
      [1.5, big ? 0.1 : 0.06],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(700 * mul, t);
      o.frequency.exponentialRampToValueAtTime(1500 * mul, t + dur * 0.25);
      o.frequency.exponentialRampToValueAtTime(900 * mul, t + dur);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 9;
      const lg = ctx.createGain();
      lg.gain.value = 40 * mul;
      lfo.connect(lg).connect(o.frequency);
      o.connect(this.env(t, dur, amp));
      o.start(t);
      lfo.start(t);
      o.stop(t + dur + 0.05);
      lfo.stop(t + dur + 0.05);
    }
    this.sweep(t, 1200, 4000, dur * 0.6, big ? 0.2 : 0.1, 'bandpass');
  }

  /** 범의 울음 — 낮게 떨리는 톱니파에 거친 숨을 섞는다 */
  private roar(t: number, big: boolean): void {
    const ctx = this.ctx!;
    const dur = big ? 1.5 : 0.55;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(big ? 95 : 120, t);
    o.frequency.linearRampToValueAtTime(big ? 140 : 150, t + dur * 0.25);
    o.frequency.exponentialRampToValueAtTime(big ? 60 : 80, t + dur);
    // 목이 떨리는 소리
    const lfo = ctx.createOscillator();
    lfo.frequency.value = big ? 28 : 34;
    const lg = ctx.createGain();
    lg.gain.value = 18;
    lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(big ? 1500 : 1100, t + dur * 0.3);
    f.frequency.exponentialRampToValueAtTime(300, t + dur);
    f.Q.value = 3;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(big ? 0.55 : 0.35, t + 0.08);
    env.gain.setValueAtTime(big ? 0.5 : 0.3, t + dur * 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    env.connect(this.master);
    o.connect(f).connect(env);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    this.burst(t, 'bandpass', 700, dur * 0.8, big ? 0.35 : 0.2);
    if (big) this.thump(t, 55, 0.7, 0.6);
  }

  private swing(t: number, ink: InkId | null, step: number): void {
    const fin = step === 2 ? 1.3 : 1;
    switch (ink) {
      case 'hwang':
        this.sweep(t, 180, 700, 0.26 * fin, 0.5, 'bandpass');
        break;
      case 'baek':
        this.sweep(t, 2400, 6000, 0.09, 0.32, 'bandpass');
        this.tone(t + 0.02, 2600 + step * 300, 0.18, 0.05, 'sine');
        break;
      case 'jeok':
        this.sweep(t, 700, 2600, 0.14 * fin, 0.38, 'bandpass');
        this.crackle(t, 0.15 * fin);
        break;
      case 'cheong':
        this.sweep(t, 900, 3800, 0.12 * fin, 0.34, 'bandpass');
        break;
      case 'heuk':
        this.sweep(t, 300, 1200, 0.3 * fin, 0.45, 'lowpass');
        break;
      default:
        this.sweep(t, 600, 2400, 0.13 * fin, 0.35, 'bandpass');
    }
  }

  private src(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    return s;
  }

  private env(t: number, dur: number, peak: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master);
    return g;
  }

  /** 붓이 공기를 가르는 소리 — 걸러진 잡음의 주파수가 쓸려 간다 */
  private sweep(t: number, f0: number, f1: number, dur: number, amp: number, type: BiquadFilterType): void {
    const ctx = this.ctx!;
    const s = this.src();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = type === 'bandpass' ? 1.4 : 0.8;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    f.frequency.exponentialRampToValueAtTime(f0 * 1.2, t + dur);
    s.connect(f).connect(this.env(t, dur, amp));
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  private burst(t: number, type: BiquadFilterType, freq: number, dur: number, amp: number): void {
    const ctx = this.ctx!;
    const s = this.src();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    s.connect(f).connect(this.env(t, dur, amp));
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  private thump(t: number, freq: number, amp: number, dur: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    o.connect(this.env(t, dur, amp));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private tone(t: number, freq: number, dur: number, amp: number, type: OscillatorType): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(this.env(t, dur, amp));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** 가야금을 뜯은 듯한 소리 */
  private pluck(t: number, freq: number, amp: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq * 1.01, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 6, t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.4);
    o.connect(f).connect(this.env(t, 0.55, amp));
    o.start(t);
    o.stop(t + 0.6);
  }

  /** 타닥타닥 불티 */
  private crackle(t: number, dur: number): void {
    for (let i = 0; i < 6; i++) {
      const at = t + Math.random() * dur;
      this.burst(at, 'highpass', 3000 + Math.random() * 3000, 0.015, 0.25 * Math.random() + 0.05);
    }
  }
}
