import type { SwingPhase } from "./types";

export type ClubTray = "closed" | "open";
export type PlayHudMode = "address" | "bag" | "swing" | "flight";

export interface YardageReadout {
  /** Big figure on the monitor. */
  value: string;
  unit: "FT" | "YDS";
  caption: "TO HOLE" | "TO PIN" | "HAZY";
}

/** A hazy pin. Inside `from` the number stays exact. Beyond it, the figure is shifted and rounded. */
export interface HazeRead {
  from: number;
  step: number;
  bias: number;
}

/** Launch-monitor distance. Putts read in feet; everything else in yards to the pin. A haze softens only the long number. */
export function yardageReadout(yardsToPin: number, putting: boolean, haze?: HazeRead | null): YardageReadout {
  const yards = Math.max(0, yardsToPin);
  if (putting) {
    const feet = yards * 3;
    return {
      value: feet < 10 ? feet.toFixed(1) : String(Math.round(feet)),
      unit: "FT",
      caption: "TO HOLE",
    };
  }
  if (haze && haze.step > 0 && yards > haze.from) {
    const shown = Math.round((yards + haze.bias) / haze.step) * haze.step;
    return {
      value: String(Math.max(haze.step, shown)),
      unit: "YDS",
      caption: "HAZY",
    };
  }
  return {
    value: yards < 10 ? yards.toFixed(1) : String(Math.round(yards)),
    unit: "YDS",
    caption: "TO PIN",
  };
}

/**
 * Quiet line under the wind number.
 * A gusty hole shows the mid-flight peak, because the setup number under-calls the air.
 * A strong steady breeze says so, so the number is the number.
 */
export function windCharacterNote(wind: { speed: number; gust?: number; influence?: number }): string {
  const gust = wind.gust ?? 0;
  if (gust >= 3) return `Gust ${Math.round(wind.speed + gust)}`;
  if ((wind.influence ?? 1) >= 1.15) return "Steady";
  return "";
}

/** Power and accuracy stay off the glass until the swing has started. */
export function showSwingMeter(phase: SwingPhase): boolean {
  return phase === "power" || phase === "accuracy";
}

/** The bag is an address-only panel. A swing tucks it even if the flag is still open. */
export function showClubTray(phase: SwingPhase, tray: ClubTray): boolean {
  return phase === "aim" && tray === "open";
}

export function playHudMode(phase: SwingPhase, tray: ClubTray): PlayHudMode {
  if (showSwingMeter(phase)) return "swing";
  if (phase === "flight" || phase === "settle") return "flight";
  if (showClubTray(phase, tray)) return "bag";
  return "address";
}

/**
 * CSS degrees for an arrow that points up at 0.
 * Wind dir 0 blows east (+x); a quarter turn blows south (+y on the course map).
 */
export function windArrowDegrees(dirRad: number): number {
  const deg = (((dirRad * 180) / Math.PI) % 360 + 360) % 360;
  return (deg + 90) % 360;
}
