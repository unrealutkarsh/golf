export class AudioBus {
  muted = false;
  private ctx: AudioContext | null = null;

  constructor() {
    this.muted = readMute() === "1";
  }

  toggle(): boolean {
    this.muted = !this.muted;
    writeMute(this.muted ? "1" : "0");
    return this.muted;
  }

  unlock(): void {
    const ctx = this.ensure();
    if (ctx?.state === "suspended") void ctx.resume();
  }

  /** Club-on-ball contact: a sharp crack, a body thump, then the ball tearing away. */
  strike(power: number, quality: "perfect" | "good" | "miss"): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const loud = 0.5 + power * 0.5;
    const bright = quality === "perfect" ? 5200 : quality === "good" ? 3600 : 1500;
    // Crack
    this.burst(ctx, t, 0.035, "highpass", 1800, bright, 0.55 * loud);
    // Body
    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = "sine";
    body.frequency.setValueAtTime(quality === "miss" ? 140 : 210, t);
    body.frequency.exponentialRampToValueAtTime(70, t + 0.09);
    bodyGain.gain.setValueAtTime(0.28 * loud, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    body.connect(bodyGain).connect(ctx.destination);
    body.start(t);
    body.stop(t + 0.13);
    if (quality === "perfect") {
      this.tone(2350, 0.14, "triangle", 0.035);
      this.tone(3520, 0.1, "sine", 0.02, 0.01);
    }
    // Ball tearing away
    this.burst(ctx, t + 0.02, 0.5 + power * 0.35, "bandpass", 1700, 500, 0.07 * loud, 0.6);
  }

  /** First touchdown. Greens thock, sand puffs, fairway and rough thud. */
  land(lie: string): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (lie === "bunker") {
      this.burst(ctx, t, 0.22, "bandpass", 2200, 900, 0.14, 0.8);
      return;
    }
    const soft = lie === "rough" ? 0.6 : 1;
    this.burst(ctx, t, 0.08, "lowpass", lie === "green" ? 900 : 520, 180, 0.35 * soft);
    if (lie === "green") this.tone(330, 0.07, "sine", 0.05);
  }

  /** Filtered noise with a sweeping cutoff and a fast attack. */
  private burst(ctx: AudioContext, t: number, dur: number, type: BiquadFilterType, fromHz: number, toHz: number, vol: number, q = 0.7): void {
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(fromHz, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, toHz), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.01);
  }

  putt(): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 220;
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  splash(): void {
    if (this.muted) return;
    this.noise(0.16, 0.28, 500);
  }

  hole(): void {
    if (this.muted) return;
    this.tone(523, 0.12, "sine", 0.07);
    this.tone(784, 0.16, "sine", 0.05, 0.08);
  }

  cheer(level: number): void {
    if (this.muted) return;
    this.noise(0.12 + level * 0.08, 0.7, 1400);
    if (level > 0) this.tone(660, 0.2, "triangle", 0.04, 0.05);
    if (level > 1) this.tone(880, 0.24, "triangle", 0.04, 0.12);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(vol: number, dur: number, freq: number): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    return this.ctx;
  }
}

function readMute(): string | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem("ptg-mute");
  } catch {
    /* ignore */
  }
  return null;
}

function writeMute(value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem("ptg-mute", value);
  } catch {
    /* ignore */
  }
}
