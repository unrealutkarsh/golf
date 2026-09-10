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

  swing(power: number): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(140 + power * 80, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.18);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08 + power * 0.06, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.24);
    this.noise(0.08, 0.12, 900);
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
