import { inWater, lieAt, onGreen } from "./course";
import { fbm } from "./look";
import { clamp, dist, fromAngle, type Vec2 } from "./math";
import { MAX_PUTT_POWER } from "./physics";
import type { CamMode, Hole, Lie } from "./types";

export type ResolvedCam = "player" | "follow" | "putt";

export const PUTT_ROLL_YARDS = 42;
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

/** Address/putt framing that stays above turf on short leftover. */
export function playCamFraming(view: ResolvedCam, leftoverYards: number): CamFraming {
  const base = camFraming(view);
  if (view === "putt") {
    return { ...base, back: 2.72, height: 1.95 };
  }
  if (view === "player" && leftoverYards < 100) {
    const t = clamp((100 - leftoverYards) / 75, 0, 1);
    return {
      ...base,
      back: base.back + t * 3.5,
      height: base.height + t * 2.35,
      lookAhead: 0.58,
      fov: 52,
    };
  }
  return base;
}

export function cameraHeightAboveGround(groundY: number, desiredY: number, clearance = 1.7): number {
  return Math.max(desiredY, groundY + clearance);
}

export function addressLookDistance(leftover: number, lookAhead: number): number {
  if (leftover < 100) return clamp(leftover * 0.7, 8, leftover + 1.5);
  return clamp(leftover * lookAhead + 10, 12, 38);
}

export type ShotCamStage = "launch" | "chase" | "landing";
/** Address hold through contact, then the flight stages. */
export type BroadcastCamStage = "hitch" | ShotCamStage;

export interface FlightCamPose {
  /** World position. y is up; z is the course's horizontal y. */
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  fov: number;
}

/**
 * Broadcast follow for an airborne shot.
 * The lens sits above the ball and aims below it, so the fairway and landing
 * area fill the frame. A camera at ball height looking down the line turns the
 * course into a thin horizon band with the skybox showing underneath.
 */
export function flightCamPose(
  hole: Hole,
  ball: Vec2,
  ballZ: number,
  heading: number,
  stage: ShotCamStage,
  anchor: Vec2,
  /** Yards to the player's right. A draw is filmed from that side so the ball works across the frame. */
  outside = 0,
): FlightCamPose {
  const zBall = Math.max(0, ballZ);
  const ballGround = groundHeight(hole, ball.x, ball.y);
  const bh = ballGround + zBall;
  if (stage === "launch") {
    // Just behind the ball, high enough that the fairway corridor and a strip of sky
    // share the frame. A lens in the turf turns the hole into a dark horizon band.
    const back = fromAngle(heading + Math.PI, 17);
    const side = fromAngle(heading + Math.PI / 2, 2.8);
    const x = anchor.x + back.x + side.x;
    const z = anchor.y + back.y + side.y;
    const y = groundHeight(hole, x, z) + 11.6;
    const ahead = fromAngle(heading, 90);
    const lookX = (anchor.x + ahead.x) * 0.62 + ball.x * 0.38;
    const lookZ = (anchor.y + ahead.y) * 0.62 + ball.y * 0.38;
    const groundAhead = groundHeight(hole, anchor.x + ahead.x, anchor.y + ahead.y);
    const lookY = Math.min(bh * 0.35 + groundAhead * 0.65, groundAhead + 0.8);
    return { x, y, z, lookX, lookY, lookZ, fov: 48 };
  }

  const landing = stage === "landing";
  let x: number;
  let z: number;
  if (landing) {
    x = anchor.x;
    z = anchor.y;
    // The ball rolls toward this spot. Keep the lens ahead of it so it cannot pass under the camera.
    const awayX = x - ball.x;
    const awayZ = z - ball.y;
    const away = Math.hypot(awayX, awayZ);
    const minDist = 22;
    if (away < minDist) {
      const ux = away > 0.4 ? awayX / away : -Math.cos(heading);
      const uz = away > 0.4 ? awayZ / away : -Math.sin(heading);
      x = ball.x + ux * minDist;
      z = ball.y + uz * minDist;
    }
  } else {
    const backDist = 16 + Math.min(zBall, 16) * 0.1;
    const back = fromAngle(heading + Math.PI, backDist);
    const side = fromAngle(heading + Math.PI / 2, 4.2 + outside);
    x = ball.x + back.x + side.x;
    z = ball.y + back.y + side.y;
  }
  const camGround = groundHeight(hole, x, z);
  // Above the ball, aimed down the landing corridor, with sky above the tree line.
  const y = landing ? Math.max(camGround + 10.5, bh + 4.2) : Math.max(camGround + 6.2, bh + 5.6);
  const dx = ball.x - x;
  const dz = ball.y - z;
  const horiz = Math.hypot(dx, dz) || 1;
  const ballPitch = Math.atan2(bh - y, horiz);
  const fov = 50;
  const half = ((fov * Math.PI) / 180) * 0.5;
  // As the ball rolls up to the lens, look at it. While it is still out, look down the corridor.
  const close = landing ? clamp((28 - horiz) / 28, 0, 1) : 0;
  const lookDown = landing ? 0.22 * (1 - close) + 0.04 * close : 0.055 + Math.min(zBall, 18) * 0.0025;
  let lookPitch = ballPitch - lookDown;
  const maxSep = half * 0.68;
  if (ballPitch - lookPitch > maxSep) lookPitch = ballPitch - maxSep;
  // Past straight down, tan() flips and the lens aims at the sky.
  lookPitch = Math.max(-1.05, Math.min(0.45, lookPitch));
  const dist = Math.max(26, horiz + 18);
  return {
    x,
    y,
    z,
    lookX: x + (dx / horiz) * dist,
    lookY: y + Math.tan(lookPitch) * dist,
    lookZ: z + (dz / horiz) * dist,
    fov,
  };
}

/** Broadcast-style sequence for a full shot: watch it leave, chase it, then cut to where it lands. */
export function shotCamStage(flightTime: number, landingTime: number, touchedDown: boolean): ShotCamStage {
  // Chips and punch shots are over too quickly for a cut to read.
  const cutsToLanding = landingTime > 2.2;
  if (cutsToLanding && (touchedDown || flightTime >= landingTime - 1.35)) return "landing";
  return flightTime < 0.55 ? "launch" : "chase";
}

/**
 * Auto flight camera: hold the address lens through the contact hitch, then launch, chase, and landing.
 * `flightTime` does not advance during the hitch, so this stays on address until the ball is let go.
 */
export function broadcastCamStage(hitStop: number, flightTime: number, landingTime: number, touchedDown: boolean): BroadcastCamStage {
  if (hitStop > 0.001 && flightTime < 0.02 && !touchedDown) return "hitch";
  return shotCamStage(flightTime, landingTime, touchedDown);
}

/** Ground spot for the landing camera: ahead of or beside the touchdown, clear of trees, hazards and OB. */
export function landingCamSpot(hole: Hole, landing: Vec2, heading: number, rollYards = 0): Vec2 {
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  const options = [
    // Stay near the line of play: decorative woods crowd the corridor edges.
    { ahead: 30, side: 7 },
    { ahead: 30, side: -7 },
    { ahead: 38, side: 0 },
    { ahead: 22, side: 10 },
    { ahead: 22, side: -10 },
    // Beside the landing, for approaches: galleries of trees stand behind greens.
    { ahead: 8, side: 16 },
    { ahead: 8, side: -16 },
  ];
  let best = landing;
  let bestScore = -Infinity;
  for (const [i, o] of options.entries()) {
    // Sit beyond the expected roll-out so the ball finishes in front of the lens, not under it.
    const ahead = o.ahead + rollYards;
    const p = { x: landing.x + fx * ahead - fy * o.side, y: landing.y + fy * ahead + fx * o.side };
    let clearance = 40;
    for (const tree of hole.trees) clearance = Math.min(clearance, dist(p, tree) - tree.r);
    const lie = lieAt(hole, p);
    const hazard = lie === "ob" || inWater(hole, p) ? 30 : 0;
    // Short grass sits inside the tree lines, so the view down the hole is open.
    const open = lie === "fairway" || lie === "green" ? 14 : 0;
    // Slight preference for the earlier (ahead-and-right) framings when everything is clear.
    const score = Math.min(clearance, 24) + open - hazard - i * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

export function camLabel(view: ResolvedCam): string {
  if (view === "player") return "address";
  return view;
}

export function suggestedPuttPower(yardsToPin: number): number {
  return scaledPuttPower(PUTT_HOLE_FILL, yardsToPin);
}

/** Mid-meter should die at the hole; a full smash only runs about 1.5× leftover. */
export function scaledPuttPower(meter: number, yardsToPin: number): number {
  const fill = Math.max(0.05, Math.min(1, meter));
  const leftover = Math.max(0.2, yardsToPin);
  const factor = 0.38 + fill * 1.24;
  return Math.max(0.006, Math.min(MAX_PUTT_POWER, (leftover * factor) / PUTT_ROLL_YARDS));
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

/** Putting view and putt line only when the player is actually holding the putter; a wedge off the green is a normal shot. */
export function isPuttingSituation(lie: Lie, pinDist: number, clubId: string, hole: Hole, pos: Vec2): boolean {
  return clubId === "putter" && (lie === "green" || onGreen(hole, pos) || pinDist < 24);
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
