import { dropNear, inWater, lieAt, onGreen, treeHit } from "./course";
import {
  add,
  angleTo,
  clamp,
  clone,
  dist,
  fromAngle,
  len,
  scale,
  type Vec2,
} from "./math";
import type { Ball, Club, Hole, Lie, Wind } from "./types";

export const CUP_RADIUS = 0.5;
export const GIMME_RADIUS = 0.36;
export const STOP_SPEED = 0.5;
export const CAPTURE_SPEED = 7.4;
export const LIP_SPEED = 9.6;
export const MAX_HOLE_STROKES = 10;
export const GRAVITY = 28;
/** Fixed simulation step. The live game and every preview integrate at this rate so they agree. */
export const SIM_DT = 1 / 60;

export interface FlightSample {
  pos: Vec2;
  z: number;
}

export interface ShotInput {
  aim: number;
  power: number;
  accuracy: number;
  club: Club;
  lie: Lie;
  wind: Wind;
  /** -1 fade, 0 straight, +1 draw (curves left of the aim line). */
  shape?: number;
}

export interface SimEvent {
  type: "bounce" | "splash" | "ob" | "tree" | "hole" | "lip" | "stop";
  pos: Vec2;
}

export interface StepResult {
  ball: Ball;
  flying: boolean;
  events: SimEvent[];
  lie: Lie;
  holed: boolean;
  penaltyDrop: Vec2 | null;
  penaltyKind: "water" | "ob" | null;
}

const FRICTION: Record<Lie, number> = {
  tee: 0.986,
  fairway: 0.984,
  rough: 0.955,
  green: 0.963,
  bunker: 0.88,
  water: 0.4,
  ob: 0.97,
};

const GREEN_SLIDE_FRICTION = 0.9;
const GREEN_DIE_FRICTION = 0.93;
const GREEN_DIE_SPEED = 2.4;
const GREEN_CATCH = 0.55;

const RESTITUTION: Record<Lie, number> = {
  tee: 0.36,
  fairway: 0.34,
  rough: 0.2,
  green: 0.16,
  bunker: 0.08,
  water: 0,
  ob: 0.22,
};

const LIE_POWER: Record<Lie, number> = {
  tee: 1,
  fairway: 1,
  rough: 0.88,
  green: 1,
  bunker: 0.7,
  water: 0.4,
  ob: 0.7,
};

export function createBall(pos: Vec2): Ball {
  return { pos: clone(pos), vel: { x: 0, y: 0 }, z: 0, vz: 0, spinning: 0, curve: 0, lipped: false };
}

export function launchBall(from: Vec2, shot: ShotInput): Ball {
  const lieMul = LIE_POWER[shot.lie];
  const power = clamp(shot.power, shot.club.id === "putter" ? 0.005 : 0.08, 1.05);
  const acc = clamp(shot.accuracy, -1, 1);
  const spray = (1 - shot.club.accuracy) * acc * 0.1 + acc * 0.016;
  const aim = shot.aim + spray;
  const shape = shot.club.id === "putter" ? 0 : clamp(shot.shape ?? 0, -1, 1);
  // Lateral curve distance at full swing ≈ curve / 2 yards; divided by hang² at launch to become an acceleration.
  const curve = shape * (1.1 - shot.club.loft / 80) * (0.55 + power * 0.7) * 26;

  if (shot.club.id === "putter") {
    const roll = shot.club.roll * power * lieMul * (shot.lie === "green" ? 1 : 0.55);
    const speed = puttSpeedForRoll(roll);
    // Putts start rolling, not sliding — unmatched spin is what makes the ball skate.
    return { pos: clone(from), vel: fromAngle(aim, speed), z: 0, vz: 0, spinning: speed, curve: 0, lipped: false };
  }

  const profile = flightProfile(shot.club, power, lieMul);
  const { hang, apex, drag, rise } = profile;
  const carry = shot.club.carry * power * lieMul;
  // Horizontal speed decays with drag, so solve for the launch speed that still carries `carry` in `hang` seconds.
  const horiz = drag > 0 ? (carry * drag) / (1 - Math.exp(-drag * hang)) : carry / hang;
  // The ball climbs for `rise` of the flight and falls faster than it rose — that is what gives the steep descent.
  const tUp = hang * rise;
  const tDown = hang - tUp;
  const flight = { gUp: (2 * apex) / (tUp * tUp), gDown: (2 * apex) / (tDown * tDown), drag };
  const vz = (2 * apex) / tUp;
  return { pos: clone(from), vel: fromAngle(aim, horiz), z: 0.2, vz, spinning: shot.club.roll * power, curve: curve / (hang * hang), lipped: false, flight };
}

/** Hang time, apex, and drag for a swing. Partial swings fly lower and land sooner. */
export function flightProfile(club: Club, power: number, lieMul = 1): { hang: number; apex: number; drag: number; rise: number } {
  const p = clamp(power, 0.08, 1.05);
  let hang = club.hang * (0.6 + 0.4 * p);
  let apex = club.apex * (0.45 + 0.55 * p) * (0.85 + 0.15 * lieMul);
  const carry = club.carry * p * lieMul;
  if (carry < 80) {
    // Short pitches and chips stay low and quick, so a 30y wedge is not a moon-ball.
    apex = Math.min(apex, 3.2 + carry * 0.24);
    hang = Math.min(hang, 1 + carry * 0.04);
  }
  return { hang, apex, drag: club.drag, rise: 0.58 - (club.loft - 11) * 0.0007 };
}

/** Launch speed that rolls about `yards` on a flat green. */
export function puttSpeedForRoll(yards: number): number {
  const y = Math.max(0.2, yards);
  // Short tap-ins need a floor so green die-off cannot stall them short of the cup.
  if (y < 3.5) return y * 2.4 + 1.1;
  return y * 1.62;
}

/** Grass grab on the putting surface: sliding friction bites harder than rolling. */
export function applyGreenGrip(ball: Ball, dt: number): { vel: Vec2; spinning: number } {
  const speed = len(ball.vel);
  if (speed < 1e-6) return { vel: { x: 0, y: 0 }, spinning: 0 };
  const rolling = Math.min(Math.max(ball.spinning, 0), speed);
  const slipping = speed - rolling;
  const rollKeep = Math.pow(FRICTION.green, dt * 60);
  const slideKeep = Math.pow(GREEN_SLIDE_FRICTION, dt * 60);
  const keep = (rolling * rollKeep + slipping * slideKeep) / speed;
  let vel = scale(ball.vel, keep);
  let nextSpeed = len(vel);
  const spinning = rolling + slipping * (1 - Math.pow(GREEN_CATCH, dt * 60));
  if (nextSpeed < GREEN_DIE_SPEED) {
    vel = scale(vel, Math.pow(GREEN_DIE_FRICTION, dt * 60));
    nextSpeed = len(vel);
  }
  return { vel, spinning: Math.min(nextSpeed * 1.05, spinning) };
}

export function windAccel(wind: Wind, z: number): Vec2 {
  if (z <= 0.2) return { x: 0, y: 0 };
  const mph = wind.speed;
  const k = 0.12 * mph * (0.5 + (Math.min(z, 30) / 30) * 0.8);
  return fromAngle(wind.dir, k);
}

export function stepBall(ball: Ball, hole: Hole, wind: Wind, dt: number, clubBounce: number): StepResult {
  const events: SimEvent[] = [];
  const flight = ball.flight;
  const gravity = flight ? (ball.vz > 0 ? flight.gUp : flight.gDown) : GRAVITY;
  const airKeep = flight ? Math.exp(-flight.drag * dt) : 1;
  let next: Ball = {
    pos: add(ball.pos, scale(ball.vel, dt)),
    vel: add(scale(ball.vel, airKeep), scale(windAccel(wind, ball.z), dt)),
    z: ball.z + ball.vz * dt,
    vz: ball.vz - gravity * dt,
    spinning: ball.spinning,
    curve: ball.curve,
    lipped: ball.lipped,
    flight,
  };

  if (next.z > 0.35 && Math.abs(ball.curve) > 0.01) {
    const speed = len(next.vel) || 1;
    next.vel = {
      x: next.vel.x + (-next.vel.y / speed) * ball.curve * dt,
      y: next.vel.y + (next.vel.x / speed) * ball.curve * dt,
    };
  }

  const tree = treeHit(hole, next.pos, next.z);
  if (tree) {
    const n = { x: next.pos.x - tree.x, y: next.pos.y - tree.y };
    const nl = len(n) || 1;
    const nx = n.x / nl;
    const ny = n.y / nl;
    const vn = next.vel.x * nx + next.vel.y * ny;
    if (vn > 0) {
      next.vel = { x: (next.vel.x - 1.6 * vn * nx) * 0.35, y: (next.vel.y - 1.6 * vn * ny) * 0.35 };
    } else {
      next.vel = scale(next.vel, -0.25);
    }
    next.pos = { x: tree.x + nx * (tree.r * 0.74 + 0.4), y: tree.y + ny * (tree.r * 0.74 + 0.4) };
    next.vz *= 0.4;
    events.push({ type: "tree", pos: clone(next.pos) });
  }

  if (next.z <= 0) {
    next.z = 0;
    // Bounces after touchdown use plain gravity so the ball does not float back up.
    next.flight = undefined;
    const lie = lieAt(hole, next.pos);
    if (lie === "water" || (inWater(hole, next.pos) && next.z <= 0.05)) {
      events.push({ type: "splash", pos: clone(next.pos) });
      const drop = dropNear(hole, next.pos, hole.tee);
      return {
        ball: createBall(drop),
        flying: false,
        events,
        lie: lieAt(hole, drop),
        holed: false,
        penaltyDrop: drop,
        penaltyKind: "water",
      };
    }
    if (lie === "ob") {
      events.push({ type: "ob", pos: clone(next.pos) });
      return {
        ball: createBall(ball.pos),
        flying: false,
        events,
        lie: lieAt(hole, ball.pos),
        holed: false,
        penaltyDrop: clone(ball.pos),
        penaltyKind: "ob",
      };
    }

    if (Math.abs(ball.vz) > 2.2) {
      next.vz = -ball.vz * RESTITUTION[lie] * (0.64 + clubBounce * 0.42);
      const rollKeep = 0.22 + Math.min(0.42, (ball.spinning / 28) * 0.45);
      next.vel = scale(next.vel, rollKeep);
      next.spinning *= 0.35;
      events.push({ type: "bounce", pos: clone(next.pos) });
    } else {
      next.vz = 0;
      if (lie === "green") {
        const gripped = applyGreenGrip(next, dt);
        next.vel = gripped.vel;
        next.spinning = gripped.spinning;
        // Break only while the ball is still rolling. Applying it at rest
        // kept putts creeping forever and blocked the next stroke.
        if (len(next.vel) > STOP_SPEED * 1.2) {
          next.vel = add(next.vel, scale(hole.greenBreak, dt * 2.4));
        }
      } else {
        next.vel = scale(next.vel, Math.pow(FRICTION[lie], dt * 60));
        if (lie === "bunker") {
          next.vel = scale(next.vel, Math.pow(0.82, dt * 60));
        }
      }
    }
  }

  const speed = len(next.vel);
  const lie = lieAt(hole, next.pos);
  const pinDist = dist(next.pos, hole.pin);
  let holed = false;

  if (onGreen(hole, next.pos) && next.z <= 0.05) {
    if (pinDist < CUP_RADIUS) {
      if (!ball.lipped && speed < CAPTURE_SPEED) {
        holed = true;
      } else if (speed >= LIP_SPEED && !ball.lipped) {
        next.lipped = true;
        const away = angleTo(hole.pin, next.pos);
        next.pos = add(next.pos, fromAngle(away, CUP_RADIUS + 0.14));
        next.vel = fromAngle(away, Math.min(speed * 0.2, 2.1));
        events.push({ type: "lip", pos: clone(next.pos) });
      } else if (!ball.lipped) {
        const toward = angleTo(next.pos, hole.pin);
        next.vel = add(next.vel, fromAngle(toward, dt * 2.8));
        next.vel = scale(next.vel, Math.pow(0.93, dt * 60));
      }
    } else if (!ball.lipped && pinDist < GIMME_RADIUS && speed < STOP_SPEED) {
      holed = true;
    }
    if (holed) {
      next.vel = { x: 0, y: 0 };
      next.vz = 0;
      next.pos = clone(hole.pin);
      events.push({ type: "hole", pos: clone(next.pos) });
    }
  }

  const dyingOnGreen = lie === "green" && next.z <= 0 && speed < 0.78 && pinDist > CUP_RADIUS;
  const flying = !holed && !dyingOnGreen && (next.z > 0.05 || speed > STOP_SPEED);
  if (!flying && !holed) {
    next.vel = { x: 0, y: 0 };
    next.vz = 0;
    events.push({ type: "stop", pos: clone(next.pos) });
  }

  return {
    ball: next,
    flying,
    events,
    lie,
    holed,
    penaltyDrop: null,
    penaltyKind: null,
  };
}

/** Drop samples that fold back toward the ball so the preview cannot close a loop. */
export function forwardFlightPath(path: FlightSample[], aim: number): FlightSample[] {
  if (path.length < 2) return path;
  const dirx = Math.cos(aim);
  const diry = Math.sin(aim);
  const origin = path[0].pos;
  const out: FlightSample[] = [{ pos: clone(path[0].pos), z: path[0].z }];
  let last = 0;
  for (let i = 1; i < path.length; i++) {
    const along = (path[i].pos.x - origin.x) * dirx + (path[i].pos.y - origin.y) * diry;
    if (along < last - 0.08) break;
    if (along < last + 0.01) continue;
    out.push({ pos: clone(path[i].pos), z: path[i].z });
    last = along;
  }
  return out.length >= 2 ? out : path.slice(0, 2);
}

export function samplePathPoint(path: FlightSample[], t: number): FlightSample {
  if (path.length === 0) return { pos: { x: 0, y: 0 }, z: 0 };
  if (path.length === 1) return { pos: clone(path[0].pos), z: path[0].z };
  const x = clamp(t, 0, 1) * (path.length - 1);
  const i = Math.min(Math.floor(x), path.length - 2);
  const f = x - i;
  const a = path[i];
  const b = path[i + 1];
  return {
    pos: { x: a.pos.x + (b.pos.x - a.pos.x) * f, y: a.pos.y + (b.pos.y - a.pos.y) * f },
    z: a.z + (b.z - a.z) * f,
  };
}

export function sampleFlightPath(from: Vec2, shot: ShotInput, hole: Hole, untilRest = false): FlightSample[] {
  let ball = launchBall(from, shot);
  const samples: FlightSample[] = [{ pos: clone(from), z: ball.z }];
  let airborne = ball.z > 0.05;
  for (let i = 0; i < 900; i++) {
    const step = stepBall(ball, hole, shot.wind, SIM_DT, shot.club.bounce);
    samples.push({ pos: clone(step.ball.pos), z: step.ball.z });
    if (step.penaltyKind || step.holed) break;
    if (!untilRest && airborne && step.ball.z <= 0.05) break;
    if (!step.flying) break;
    if (step.ball.z > 0.05) airborne = true;
    ball = step.ball;
  }
  return samples;
}

export function predictedLanding(from: Vec2, shot: ShotInput, hole: Hole): Vec2 {
  const path = sampleFlightPath(from, shot, hole, true);
  return path.length ? clone(path[path.length - 1].pos) : clone(from);
}

export function flightApex(samples: FlightSample[]): number {
  return samples.reduce((max, sample) => Math.max(max, sample.z), 0);
}

export function defaultAim(from: Vec2, hole: Hole): number {
  return angleTo(from, hole.pin);
}

export function surfaceLabel(lie: Lie): string {
  switch (lie) {
    case "tee":
      return "Tee";
    case "fairway":
      return "Fairway";
    case "rough":
      return "Rough";
    case "green":
      return "Green";
    case "bunker":
      return "Bunker";
    case "water":
      return "Water";
    case "ob":
      return "Out of bounds";
  }
}

export function windLabel(wind: Wind): { mph: string; arrow: string } {
  const deg = ((wind.dir * 180) / Math.PI + 360) % 360;
  const dirs = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
  const idx = Math.round(deg / 45) % 8;
  return { mph: `${Math.round(wind.speed)} mph`, arrow: dirs[idx] };
}

