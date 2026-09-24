import { hashString, mulberry32, wrapAngle } from "./math";
import type { Wind } from "./types";

/**
 * How a venue plays, separate from how it looks.
 * Fog Belt is a firm marine links: a steady cross you can aim into, extra run, and a soft yardage once the pin is in the haze.
 * Harbor Dunes is a kicking dune course: a lighter setup wind that gusts and shears, a clearer number, and a fairway that bounds.
 */
export interface CourseCharacter {
  id: string;
  /** Quiet status line on the monitor. */
  cue: string;
  /** Lowest steady wind, mph. */
  windMin: number;
  /** Added to windMin for the top of the steady range. */
  windSpan: number;
  /** 0 is a random direction. 1 locks the wind to a pure cross of the hole. */
  crossBias: number;
  /** Extra mph that swells through the middle of the flight, then drops off. */
  gust: number;
  /** How hard one mph pushes. 1 is the stock breeze. */
  influence: number;
  /** Radians the gust swings the wind at mid-height. 0 stays on the setup direction. */
  shear: number;
  /** Tee and fairway rollout versus the club's authored roll. */
  roll: number;
  /** Tee and fairway first hop versus stock. Under 1 releases and runs. Over 1 kicks. */
  hop: number;
  /** Exact yardage inside this. Beyond it the monitor softens. */
  clearYards: number;
  /** Rounding of a hazy figure. 0 keeps the number exact. */
  hazeStep: number;
  /** Max yards the haze may shift the figure before rounding. */
  hazeBias: number;
}

export const FOG_BELT_PLAY: CourseCharacter = {
  id: "fog-belt-links",
  cue: "Firm run · marine cross",
  windMin: 8,
  windSpan: 7,
  crossBias: 0.82,
  gust: 1.1,
  influence: 1.38,
  shear: 0,
  roll: 1.92,
  hop: 0.48,
  clearYards: 145,
  hazeStep: 5,
  hazeBias: 4,
};

export const HARBOR_DUNES_PLAY: CourseCharacter = {
  id: "harbor-dunes",
  cue: "Dune kick · coastal gust",
  windMin: 3,
  windSpan: 5,
  crossBias: 0.7,
  gust: 6.5,
  influence: 1,
  shear: 0.4,
  roll: 1.08,
  hop: 1.7,
  clearYards: 0,
  hazeStep: 0,
  hazeBias: 0,
};

export function characterForCourse(courseId: string): CourseCharacter {
  if (courseId === "fog-belt-links") return FOG_BELT_PLAY;
  return HARBOR_DUNES_PLAY;
}

/** Steady hole wind. The gust and shear ride on top during the flight. */
export function windForCharacter(play: CourseCharacter, rng: () => number, holeAim: number): Wind {
  const speed = play.windMin + rng() * play.windSpan;
  const randomDir = rng() * Math.PI * 2;
  const side = rng() < 0.5 ? 1 : -1;
  const cross = holeAim + side * (Math.PI / 2);
  const dir = randomDir + wrapAngle(cross - randomDir) * play.crossBias;
  return {
    speed,
    dir,
    gust: play.gust,
    influence: play.influence,
    shear: play.shear,
  };
}

/** Share of the wind that sits across the hole. 1 is a pure cross, 0 is straight down the line. */
export function crossShare(dir: number, holeAim: number): number {
  return Math.abs(Math.sin(wrapAngle(dir - holeAim)));
}

export interface HazeRead {
  from: number;
  step: number;
  bias: number;
}

/**
 * Stable per-hole uncertainty for a hazy venue. The same hole always softens the same way,
 * so the figure does not flicker while you aim. Short of `from`, the caller should show the truth.
 */
export function hazeForHole(play: CourseCharacter, courseId: string, holeNumber: number): HazeRead | null {
  if (play.hazeStep <= 0) return null;
  const rng = mulberry32(hashString(`${courseId}-haze-${holeNumber}`));
  return {
    from: play.clearYards,
    step: play.hazeStep,
    bias: (rng() * 2 - 1) * play.hazeBias,
  };
}

/** Wind bed loudness. A gusty hole sounds a little fuller than its setup number. */
export function ambienceMph(wind: Wind): number {
  return Math.max(0, wind.speed + (wind.gust ?? 0) * 0.4);
}
