import { inWater, lieAt, onGreen } from "./course";
import { fbm } from "./look";
import { dist, type Vec2 } from "./math";
import type { CamMode, Hole, Lie } from "./types";

export type ResolvedCam = "player" | "follow" | "putt";

export function suggestedPuttPower(yardsToPin: number): number {
  return Math.max(0.14, Math.min(0.62, (yardsToPin + 0.6) / 22));
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
  const stripe = 0.5 + 0.5 * Math.sin(x * 0.42 + y * 0.05);
  if (inWater(hole, p)) return [0.07 + n * 0.03, 0.26 + n * 0.05, 0.36 + n * 0.06];
  const lie = lieAt(hole, p);
  if (lie === "bunker") return [0.82 + n * 0.08, 0.7 + n * 0.05, 0.46 + n * 0.04];
  if (lie === "green" || onGreen(hole, p)) {
    const sheen = 0.97 + stripe * 0.035;
    return [(0.16 + n * 0.02) * sheen, (0.48 + n * 0.03) * sheen, (0.32 + n * 0.02) * sheen];
  }
  if (lie === "tee") return [0.28 + n * 0.02, 0.5 + n * 0.03, 0.2 + n * 0.015];
  if (lie === "fairway") {
    const sheen = 0.96 + stripe * 0.03;
    return [(0.32 + n * 0.04) * sheen, (0.5 + n * 0.04) * sheen, (0.18 + n * 0.02) * sheen];
  }
  if (lie === "rough") return [0.22 + n * 0.05, 0.32 + n * 0.04, 0.11 + n * 0.025];
  return [0.5 + n * 0.1, 0.44 + n * 0.06, 0.28 + n * 0.04];
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
