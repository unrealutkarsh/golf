import { inWater, lieAt, onGreen } from "./course";
import { fbm } from "./look";
import { dist, ellipseRadial, type Vec2 } from "./math";
import type { CamMode, Hole, Lie } from "./types";

export type ResolvedCam = "player" | "follow" | "putt";

const PUTT_ROLL_YARDS = 42;
/** Meter fill that should die at the hole. */
export const PUTT_HOLE_FILL = 0.5;


/** Launch-monitor / tour framing: ball + course, no character mesh to clear. */
export interface CamFraming {
  /** Yards behind the ball along the aim or travel heading. */
  back: number;
  /** Height above the ball. */
  height: number;
  /** Small broadcast offset to the right of the line. Not dummy clearance. */
  side: number;
  /** 0 look at the ball, 1 look at the pin. */
  lookAhead: number;
  fov: number;
}

export function camFraming(view: ResolvedCam): CamFraming {
  if (view === "putt") {
    // Over the ball, slightly off-center so the ball sits above the HUD dock.
    return { back: 2.48, height: 1.62, side: 0.36, lookAhead: 0.76, fov: 48 };
  }
  if (view === "follow") {
    return { back: 12.8, height: 5.4, side: 0, lookAhead: 0, fov: 50 };
  }
  // Over-the-ball address: ball stays readable in the lower third.
  return { back: 3.85, height: 2.22, side: 0.12, lookAhead: 0.38, fov: 50 };
}

export function camLabel(view: ResolvedCam): string {
  if (view === "player") return "address";
  return view;
}

export function suggestedPuttPower(yardsToPin: number): number {
  return Math.min(0.64, scaledPuttPower(PUTT_HOLE_FILL, yardsToPin));
}

/** Mid-meter should die at the hole; a full smash only runs about 1.5× leftover. */
export function scaledPuttPower(meter: number, yardsToPin: number): number {
  const fill = Math.max(0.05, Math.min(1, meter));
  const leftover = Math.max(0.2, yardsToPin);
  const factor = 0.38 + fill * 1.24;
  return Math.max(0.006, Math.min(0.95, (leftover * factor) / PUTT_ROLL_YARDS));
}

/** Inverse of scaledPuttPower for drawing the meter after a stroke is locked. */
export function puttPowerToMeterFill(power: number, yardsToPin: number): number {
  const leftover = Math.max(0.2, yardsToPin);
  const factor = (power * PUTT_ROLL_YARDS) / leftover;
  return Math.max(0, Math.min(1, (factor - 0.38) / 1.24));
}

/** Yards a putt should roll for this meter fill. Mid-meter ≈ leftover. */
export function puttMeterYards(meter: number, yardsToPin: number): number {
  return PUTT_ROLL_YARDS * scaledPuttPower(meter, yardsToPin);
}

export function isPuttingSituation(lie: Lie, pinDist: number, clubId: string, hole: Hole, pos: Vec2): boolean {
  return lie === "green" || onGreen(hole, pos) || (pinDist < 24 && clubId === "putter");
}

export function resolveCamView(
  mode: CamMode,
  phase: string,
  putting: boolean,
): ResolvedCam {
  if (putting) {
    if (mode === "follow") return "follow";
    return "putt";
  }
  if (mode === "player" || mode === "follow" || mode === "putt") return mode;
  if (phase === "flight" || phase === "settle") return "follow";
  return "player";
}

export function shapeLabel(shape: number): string {
  if (shape > 0.2) return "Draw";
  if (shape < -0.2) return "Fade";
  return "Straight";
}

export function groundHeight(hole: Hole, x: number, y: number): number {
  const p = { x, y };
  const n = fbm(x * 0.07, y * 0.07);
  const n2 = fbm(x * 0.21 + 4, y * 0.21);
  if (inWater(hole, p)) return -0.38 + n * 0.03;
  const lie = lieAt(hole, p);
  if (lie === "bunker") return -0.1 + n * 0.03;
  if (lie === "green" || onGreen(hole, p)) {
    const br = hole.greenBreak;
    return 0.16 + (x - hole.green.cx) * br.x * 0.012 + (y - hole.green.cy) * br.y * 0.012 + n * 0.008;
  }
  if (lie === "tee") return 0.11 + n * 0.012;
  if (lie === "fairway") return 0.08 + n * 0.028 + n2 * 0.012;
  if (lie === "rough") return 0.06 + n * 0.055 + n2 * 0.02;
  const dune = fbm(x * 0.028 + 9, y * 0.028);
  return 0.02 + dune * 0.32 + n * 0.1;
}

export function surfaceColor(hole: Hole, x: number, y: number): [number, number, number] {
  const p = { x, y };
  const n = fbm(x * 0.16, y * 0.16);
  const grain = fbm(x * 1.1, y * 1.1);
  const radial = ellipseRadial(p, hole.green.cx, hole.green.cy, hole.green.rx, hole.green.ry, hole.green.rotation);
  if (inWater(hole, p)) return [0.07 + n * 0.03, 0.26 + n * 0.05, 0.36 + n * 0.06];
  const lie = lieAt(hole, p);
  if (lie === "bunker") return [0.82 + n * 0.08, 0.7 + n * 0.05, 0.46 + n * 0.04];
  if (lie === "green" || onGreen(hole, p)) {
    if (radial >= 0.88) return [0.18 + n * 0.016, 0.40 + n * 0.022, 0.16 + n * 0.01];
    return [0.14 + n * 0.016 + grain * 0.01, 0.40 + n * 0.024 + grain * 0.012, 0.17 + n * 0.01];
  }
  if (radial < 1.3 && lie !== "ob") return [0.30 + n * 0.02, 0.40 + n * 0.02, 0.14 + n * 0.01];
  if (lie === "tee") return [0.22 + n * 0.02, 0.44 + n * 0.022, 0.14 + n * 0.01];
  if (lie === "fairway") {
    return [0.24 + n * 0.025 + grain * 0.012, 0.46 + n * 0.024, 0.14 + n * 0.01];
  }
  if (lie === "rough") return [0.18 + n * 0.035, 0.32 + n * 0.028, 0.10 + n * 0.014];
  return [0.26 + n * 0.06, 0.34 + n * 0.05, 0.16 + n * 0.03];
}

export function bladeHeight(lie: Lie): number {
  switch (lie) {
    case "green":
      return 0;
    case "tee":
      return 0.07;
    case "fairway":
      return 0.11;
    case "rough":
      return 0.28;
    default:
      return 0;
  }
}

export function bladeWidth(lie: Lie): number {
  switch (lie) {
    case "green":
      return 0.2;
    case "tee":
      return 0.55;
    case "fairway":
      return 0.7;
    case "rough":
      return 1.05;
    default:
      return 0;
  }
}

/** How meadow-like the ground shader should look. Greens stay tight and even. */
export function turfLush(lie: Lie): number {
  switch (lie) {
    case "green":
      return 0.06;
    case "tee":
      return 0.4;
    case "fairway":
      return 0.72;
    case "rough":
      return 1;
    default:
      return 0.16;
  }
}

/** Fraction of candidate tufts to keep. Greens are shader-only. */
export function bladeKeepChance(lie: Lie): number {
  switch (lie) {
    case "green":
      return 0;
    case "tee":
      return 0.55;
    case "fairway":
      return 0.82;
    case "rough":
      return 0.7;
    default:
      return 0;
  }
}

export function grassBudget(focusLie: Lie, full: number): number {
  if (focusLie === "green") return Math.floor(full * 0.08);
  if (focusLie === "rough") return Math.floor(full * 0.7);
  return full;
}

export function yardsBetween(a: Vec2, b: Vec2): number {
  return dist(a, b);
}
