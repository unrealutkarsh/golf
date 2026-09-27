import { clubFamily } from "./clubs";
import type { ClubId } from "./types";

export type StrikeFamily = "wood" | "iron" | "wedge" | "putter";

/** Whoosh then contact. Woods are lower and fuller; the putter is a soft knock. Volumes stay under the wind bed. */
export interface StrikeVoice {
  whooshFrom: number;
  whooshTo: number;
  whooshDur: number;
  whooshVol: number;
  crackFrom: number;
  crackTo: number;
  crackDur: number;
  crackVol: number;
  bodyHz: number;
  bodyVol: number;
}

export const STRIKE_VOICE: Record<StrikeFamily, StrikeVoice> = {
  wood: { whooshFrom: 480, whooshTo: 160, whooshDur: 0.2, whooshVol: 0.055, crackFrom: 820, crackTo: 2100, crackDur: 0.05, crackVol: 0.26, bodyHz: 98, bodyVol: 0.2 },
  iron: { whooshFrom: 860, whooshTo: 340, whooshDur: 0.15, whooshVol: 0.042, crackFrom: 1300, crackTo: 3200, crackDur: 0.034, crackVol: 0.18, bodyHz: 160, bodyVol: 0.13 },
  wedge: { whooshFrom: 1500, whooshTo: 620, whooshDur: 0.11, whooshVol: 0.032, crackFrom: 1900, crackTo: 880, crackDur: 0.028, crackVol: 0.12, bodyHz: 220, bodyVol: 0.07 },
  putter: { whooshFrom: 640, whooshTo: 260, whooshDur: 0.06, whooshVol: 0.018, crackFrom: 780, crackTo: 200, crackDur: 0.04, crackVol: 0.07, bodyHz: 140, bodyVol: 0.045 },
};

/** Quiet wind bed. A little louder in a breeze, ducked when the green hush is up. Never a howl. */
export function windBedGain(mph: number, hush: boolean): number {
  const wind = Math.min(0.034, 0.009 + Math.max(0, mph) * 0.0014);
  return hush ? wind * 0.4 : wind;
}

/** Soft air over the green, only while putting. */
export function hushBedGain(hush: boolean): number {
  return hush ? 0.011 : 0;
}

/**
 * How a lie colors the contact. Sand dulls the click and adds a scrape;
 * rough rustles; a fairway strike is the club on its own.
 */
export function lieStrikeMix(lie: string): { crack: number; body: number; sand: number; grass: number } {
  if (lie === "bunker") return { crack: 0.42, body: 1.2, sand: 0.2, grass: 0 };
  if (lie === "rough") return { crack: 0.64, body: 0.82, sand: 0, grass: 0.11 };
  if (lie === "green") return { crack: 0.78, body: 0.7, sand: 0, grass: 0 };
  return { crack: 1, body: 1, sand: 0, grass: 0 };
}

export class AudioBus {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bed: { windGain: GainNode; hushGain: GainNode; windFilter: BiquadFilterNode } | null = null;
  private bedWind = 0;
  private bedHush = false;
  private bedApplied = { wind: -1, hush: -1 };

  constructor() {
    this.muted = readMute() === "1";
  }

  toggle(): boolean {
    this.muted = !this.muted;
    writeMute(this.muted ? "1" : "0");
    if (this.muted) this.writeBed(0, 0);
    else this.setAmbience(this.bedWind, this.bedHush);
    return this.muted;
  }

  unlock(): void {
    const ctx = this.ensure();
    if (ctx?.state === "suspended") void ctx.resume();
  }

  /**
   * Looping wind, and a quieter hush on the green. `windMph` 0 silences the bed
   * (menus, hole summary). Safe to call every frame.
   */
  setAmbience(windMph: number, hush: boolean): void {
    this.bedWind = Math.max(0, windMph);
    this.bedHush = hush;
    if (this.muted || this.bedWind <= 0) {
      this.writeBed(0, 0);
      return;
    }
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    this.ensureBed(ctx);
    this.writeBed(windBedGain(this.bedWind, hush), hushBedGain(hush));
  }

  /** Whoosh, then contact. Family changes the pitch and the weight; a miss is duller. Lie adds sand or grass without replacing the club voice. */
  swing(clubId: ClubId, power: number, quality: "perfect" | "good" | "miss", lie = "fairway"): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const family = clubFamily(clubId);
    const voice = STRIKE_VOICE[family];
    const mix = lieStrikeMix(lie);
    const t = ctx.currentTime;
    const pace = Math.max(0.22, Math.min(1, power / (family === "putter" ? 1.35 : 1)));
    const taste = (quality === "perfect" ? 1 : quality === "good" ? 0.84 : 0.58) * (family === "putter" ? 1 : mix.crack);
    const bodyScale = family === "putter" ? 1 : mix.body;
    this.burst(ctx, t, voice.whooshDur, "bandpass", voice.whooshFrom, voice.whooshTo, voice.whooshVol * pace, 0.7);
    const hit = t + voice.whooshDur * (family === "putter" ? 0.4 : 0.62);
    const crackType: BiquadFilterType = family === "wedge" || family === "putter" ? "bandpass" : "highpass";
    this.burst(ctx, hit, voice.crackDur, crackType, voice.crackFrom, Math.max(80, voice.crackTo * taste), voice.crackVol * pace * taste, quality === "miss" ? 0.55 : 0.9);
    this.body(ctx, hit, voice.bodyHz * (quality === "miss" ? 0.8 : 1), voice.bodyVol * pace * (quality === "miss" ? 1.15 : 1) * bodyScale, family === "putter" ? 0.07 : 0.11);
    if (mix.sand > 0) {
      this.burst(ctx, hit, 0.26, "bandpass", 1800, 420, mix.sand, 0.55);
      this.burst(ctx, hit + 0.02, 0.2, "lowpass", 640, 140, mix.sand * 0.7, 0.4);
    } else if (mix.grass > 0 && family !== "putter") {
      this.burst(ctx, hit, 0.16, "bandpass", 2100, 680, mix.grass, 1.15);
    }
  }

  /** Club-on-ball contact kept for older call sites. Woods. */
  strike(power: number, quality: "perfect" | "good" | "miss"): void {
    this.swing("driver", power, quality);
  }

  /** First touchdown. Greens thock, sand puffs, fairway and rough thud. */
  land(lie: string): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (lie === "bunker") {
      this.burst(ctx, t, 0.3, "bandpass", 2100, 520, 0.16, 0.55);
      this.burst(ctx, t, 0.18, "lowpass", 480, 120, 0.12, 0.45);
      return;
    }
    if (lie === "rough") {
      this.burst(ctx, t, 0.14, "bandpass", 1500, 520, 0.07, 0.8);
      this.burst(ctx, t, 0.1, "lowpass", 380, 140, 0.1);
      return;
    }
    const soft = lie === "green" ? 0.45 : 0.75;
    this.burst(ctx, t, 0.08, "lowpass", lie === "green" ? 900 : 520, 180, 0.22 * soft);
    if (lie === "green") this.tone(280, 0.06, "sine", 0.03);
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
    filter.frequency.setValueAtTime(Math.max(40, fromHz), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, toHz), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.out(ctx));
    src.start(t);
    src.stop(t + dur + 0.01);
  }

  putt(): void {
    this.swing("putter", 0.45, "good");
  }

  splash(): void {
    if (this.muted) return;
    this.noise(0.1, 0.28, 500);
  }

  hole(): void {
    if (this.muted) return;
    this.tone(523, 0.12, "sine", 0.05);
    this.tone(784, 0.16, "sine", 0.035, 0.08);
  }

  cheer(level: number): void {
    if (this.muted) return;
    this.noise(0.08 + level * 0.05, 0.7, 1400);
    if (level > 0) this.tone(660, 0.2, "triangle", 0.03, 0.05);
    if (level > 1) this.tone(880, 0.24, "triangle", 0.028, 0.12);
  }

  private body(ctx: AudioContext, t: number, hz: number, vol: number, dur: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(Math.max(40, hz), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, hz * 0.45), t + dur);
    gain.gain.setValueAtTime(Math.max(0.0001, vol), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.out(ctx));
    osc.start(t);
    osc.stop(t + dur + 0.02);
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
    osc.connect(gain).connect(this.out(ctx));
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
    src.connect(filter).connect(gain).connect(this.out(ctx));
    src.start();
  }

  private out(ctx: AudioContext): AudioNode {
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(ctx.destination);
    }
    return this.master;
  }

  private ensureBed(ctx: AudioContext): void {
    if (this.bed) return;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let hold = 0;
    for (let i = 0; i < data.length; i++) {
      // Stepped noise reads as air, not a hiss.
      if (i % 8 === 0) hold = Math.random() * 2 - 1;
      data[i] = hold * 0.65 + (Math.random() * 2 - 1) * 0.35;
    }
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 480;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    const wind = ctx.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    wind.connect(windFilter).connect(windGain).connect(this.out(ctx));
    wind.start();

    const hushFilter = ctx.createBiquadFilter();
    hushFilter.type = "lowpass";
    hushFilter.frequency.value = 1200;
    const hushGain = ctx.createGain();
    hushGain.gain.value = 0;
    const hush = ctx.createBufferSource();
    hush.buffer = buffer;
    hush.loop = true;
    hush.connect(hushFilter).connect(hushGain).connect(this.out(ctx));
    hush.start(0, 0.8);
    this.bed = { windGain, hushGain, windFilter };
  }

  private writeBed(wind: number, hush: number): void {
    if (!this.bed || !this.ctx) return;
    if (Math.abs(wind - this.bedApplied.wind) < 0.0004 && Math.abs(hush - this.bedApplied.hush) < 0.0004) return;
    this.bedApplied = { wind, hush };
    const t = this.ctx.currentTime;
    const windGain = Math.max(0.0001, wind);
    const hushGain = Math.max(0.0001, hush);
    this.bed.windGain.gain.setTargetAtTime(wind <= 0 ? 0.0001 : windGain, t, 0.18);
    this.bed.hushGain.gain.setTargetAtTime(hush <= 0 ? 0.0001 : hushGain, t, 0.22);
    const cutoff = 380 + Math.min(this.bedWind, 16) * 18;
    this.bed.windFilter.frequency.setTargetAtTime(cutoff, t, 0.3);
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
