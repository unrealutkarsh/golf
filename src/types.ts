import type { Vec2 } from "./math";

export type Surface = "tee" | "fairway" | "rough" | "green" | "bunker" | "water" | "ob";

export type ClubId =
  | "driver"
  | "wood3"
  | "wood5"
  | "iron4"
  | "iron5"
  | "iron6"
  | "iron7"
  | "iron8"
  | "iron9"
  | "pw"
  | "sw"
  | "putter";

export interface Club {
  id: ClubId;
  name: string;
  shortName: string;
  /** Typical carry (or roll for putter) at full power, yards. */
  carry: number;
  /** Extra roll after landing at full power, yards. */
  roll: number;
  loft: number;
  accuracy: number;
  bounce: number;
}

export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation: number;
}

export interface Tree {
  x: number;
  y: number;
  r: number;
}

export interface Hole {
  number: number;
  name: string;
  par: 3 | 4 | 5;
  yards: number;
  tee: Vec2;
  pin: Vec2;
  fairway: Vec2[][];
  rough: Vec2[][];
  green: Ellipse;
  greenBreak: Vec2;
  bunkers: Ellipse[];
  water: Vec2[][];
  trees: Tree[];
  bounds: { x: number; y: number; w: number; h: number };
}

export interface Course {
  id: string;
  name: string;
  club: string;
  location: string;
  par: number;
  holes: Hole[];
}

export interface Wind {
  speed: number;
  dir: number;
}

export interface Ball {
  pos: Vec2;
  vel: Vec2;
  z: number;
  vz: number;
  spinning: number;
}

export type Lie = Surface;

export type SwingPhase = "aim" | "power" | "accuracy" | "flight" | "settle";

export type ScreenId = "title" | "tour" | "play" | "holeEnd" | "scorecard" | "roundEnd" | "help";

export interface HoleResult {
  hole: number;
  par: number;
  strokes: number;
  putts: number;
  fairwayHit: boolean | null;
  gir: boolean;
  penalties: number;
}

export interface PlayerProfile {
  name: string;
  hometown: string;
  eventsPlayed: number;
  careerMoney: number;
  bestToPar: number | null;
  lastToPar: number | null;
}

export interface Tournament {
  id: string;
  name: string;
  purse: number;
  courseId: string;
  blurb: string;
}
