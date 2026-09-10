import { inWater, lieAt, onGreen } from "./course";
import { fbm } from "./look";
import { dist, type Vec2 } from "./math";
import type { CamMode, Hole, Lie } from "./types";

export type ResolvedCam = "player" | "follow" | "putt";

export function suggestedPuttPower(yardsToPin: number): number {
  return Math.max(0.14, Math.min(0.64, yardsToPin / 30));
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
  if (inWater(hole, p)) return -0.85 + n * 0.04;
  const lie = lieAt(hole, p);
  if (lie === "bunker") return -0.32 + n * 0.05;
  if (lie === "green" || onGreen(hole, p)) {
    const br = hole.greenBreak;
    return 0.16 + (x - hole.green.cx) * br.x * 0.028 + (y - hole.green.cy) * br.y * 0.028 + n * 0.018;
  }
  if (lie === "tee") return 0.1 + n * 0.02;
  if (lie === "fairway") return 0.07 + n * 0.055 + n2 * 0.02;
  if (lie === "rough") return 0.05 + n * 0.12 + n2 * 0.04;
  const dune = fbm(x * 0.03 + 9, y * 0.03);
  return -0.08 + dune * 0.55 + n * 0.18;
}

export function surfaceColor(hole: Hole, x: number, y: number): [number, number, number] {
  const p = { x, y };
  const n = fbm(x * 0.16, y * 0.16);
  const stripe = 0.5 + 0.5 * Math.sin(x * 0.85 + y * 0.08);
  if (inWater(hole, p)) return [0.07 + n * 0.04, 0.28 + n * 0.06, 0.42 + n * 0.08];
  const lie = lieAt(hole, p);
  if (lie === "bunker") return [0.86 + n * 0.08, 0.74 + n * 0.06, 0.48 + n * 0.04];
  if (lie === "green" || onGreen(hole, p)) {
    const sheen = 0.94 + stripe * 0.07;
    return [(0.18 + n * 0.03) * sheen, (0.46 + n * 0.05) * sheen, (0.28 + n * 0.03) * sheen];
  }
  if (lie === "tee") return [0.3 + n * 0.03, 0.52 + n * 0.04, 0.24 + n * 0.02];
  if (lie === "fairway") {
    const sheen = 0.93 + stripe * 0.08;
    return [(0.26 + n * 0.05) * sheen, (0.44 + n * 0.06) * sheen, (0.18 + n * 0.03) * sheen];
  }
  if (lie === "rough") return [0.27 + n * 0.06, 0.34 + n * 0.05, 0.14 + n * 0.03];
  return [0.58 + n * 0.1, 0.5 + n * 0.07, 0.3 + n * 0.04];
}

export function bladeHeight(lie: Lie): number {
  switch (lie) {
    case "green":
      return 0.12;
    case "tee":
      return 0.16;
    case "fairway":
      return 0.26;
    case "rough":
      return 0.52;
    default:
      return 0;
  }
}

export function bladeWidth(lie: Lie): number {
  switch (lie) {
    case "green":
      return 0.7;
    case "tee":
    case "fairway":
      return 1;
    case "rough":
      return 1.45;
    default:
      return 0;
  }
}

export function yardsBetween(a: Vec2, b: Vec2): number {
  return dist(a, b);
}
