import type { SwingPhase } from "./types";

export type ClubTray = "closed" | "open";
export type PlayHudMode = "address" | "bag" | "swing" | "flight";

export interface YardageReadout {
  /** Big figure on the monitor. */
  value: string;
  unit: "FT" | "YDS";
  caption: "TO HOLE" | "TO PIN";
}

/** Launch-monitor distance. Putts read in feet; everything else in yards to the pin. */
export function yardageReadout(yardsToPin: number, putting: boolean): YardageReadout {
  const yards = Math.max(0, yardsToPin);
  if (putting) {
    const feet = yards * 3;
    return {
      value: feet < 10 ? feet.toFixed(1) : String(Math.round(feet)),
      unit: "FT",
      caption: "TO HOLE",
    };
  }
  return {
    value: yards < 10 ? yards.toFixed(1) : String(Math.round(yards)),
    unit: "YDS",
    caption: "TO PIN",
  };
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
