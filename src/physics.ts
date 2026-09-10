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

export const CUP_RADIUS = 1.35;
export const GIMME_RADIUS = 1.15;
export const STOP_SPEED = 0.55;
export const MAX_HOLE_STROKES = 8;

export interface ShotInput {
  aim: number;
  power: number;
  accuracy: number;
  club: Club;
  lie: Lie;
  wind: Wind;
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
  green: 0.978,
  bunker: 0.88,
  water: 0.4,
  ob: 0.97,
};

const RESTITUTION: Record<Lie, number> = {
  tee: 0.32,
  fairway: 0.3,
  rough: 0.18,
  green: 0.14,
  bunker: 0.08,
  water: 0,
  ob: 0.22,
};

const LIE_POWER: Record<Lie, number> = {
  tee: 1,
  fairway: 1,
  rough: 0.78,
  green: 1,
  bunker: 0.62,
  water: 0.4,
  ob: 0.7,
};

export function createBall(pos: Vec2): Ball {
  return { pos: clone(pos), vel: { x: 0, y: 0 }, z: 0, vz: 0, spinning: 0 };
}

export function launchBall(from: Vec2, shot: ShotInput): Ball {
  const lieMul = LIE_POWER[shot.lie];
  const power = clamp(shot.power, 0.08, 1.05);
  const acc = clamp(shot.accuracy, -1, 1);
  const spray = (1 - shot.club.accuracy) * acc * 0.22 + acc * 0.045;
  const aim = shot.aim + spray;

  if (shot.club.id === "putter") {
    const roll = shot.club.roll * power * lieMul * (shot.lie === "green" ? 1 : 0.55);
    const speed = roll * 1.62;
    return { pos: clone(from), vel: fromAngle(aim, speed), z: 0, vz: 0, spinning: 0 };
  }

  const carry = shot.club.carry * power * lieMul;
  const loftRad = (shot.club.loft * Math.PI) / 180;
  const flightTime = 1.22 + loftRad * 2.35;
  const horiz = carry / flightTime;
  const vz = (flightTime * 28) / 2;
  return { pos: clone(from), vel: fromAngle(aim, horiz), z: 0.15, vz, spinning: shot.club.roll * power };
}

export function windAccel(wind: Wind, z: number): Vec2 {
  if (z <= 0.2) return { x: 0, y: 0 };
  const mph = wind.speed;
  const k = 0.085 * mph * (0.45 + Math.min(z, 18) / 18);
  return fromAngle(wind.dir, k);
}

export function stepBall(ball: Ball, hole: Hole, wind: Wind, dt: number, clubBounce: number): StepResult {
  const events: SimEvent[] = [];
  let next: Ball = {
    pos: add(ball.pos, scale(ball.vel, dt)),
    vel: add(ball.vel, scale(windAccel(wind, ball.z), dt)),
    z: ball.z + ball.vz * dt,
    vz: ball.vz - 28 * dt,
    spinning: ball.spinning,
  };

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
      next.vz = -ball.vz * RESTITUTION[lie] * (0.55 + clubBounce * 0.4);
      const rollKeep = 0.12 + Math.min(0.22, (ball.spinning / 28) * 0.18);
      next.vel = scale(next.vel, rollKeep);
      next.spinning *= 0.35;
      events.push({ type: "bounce", pos: clone(next.pos) });
    } else {
      next.vz = 0;
      next.vel = scale(next.vel, Math.pow(FRICTION[lie], dt * 60));
      if (lie === "green") {
        next.vel = add(next.vel, scale(hole.greenBreak, dt * 2.4));
      }
      if (lie === "bunker") {
        next.vel = scale(next.vel, Math.pow(0.82, dt * 60));
      }
    }
  }

  const speed = len(next.vel);
  const lie = lieAt(hole, next.pos);
  const pinDist = dist(next.pos, hole.pin);
  let holed = false;

  if (onGreen(hole, next.pos) && next.z <= 0.05) {
    if (pinDist < CUP_RADIUS && speed < 6.2) {
      holed = true;
      next.vel = { x: 0, y: 0 };
      next.pos = clone(hole.pin);
      events.push({ type: "hole", pos: clone(next.pos) });
    } else if (pinDist < CUP_RADIUS && speed >= 6.2) {
      const away = angleTo(hole.pin, next.pos);
      next.vel = fromAngle(away, speed * 0.45);
      events.push({ type: "lip", pos: clone(next.pos) });
    } else if (pinDist < GIMME_RADIUS && speed < STOP_SPEED) {
      holed = true;
      next.pos = clone(hole.pin);
      next.vel = { x: 0, y: 0 };
      events.push({ type: "hole", pos: clone(next.pos) });
    }
  }

  const flying = next.z > 0.05 || speed > STOP_SPEED;
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

export function predictedLanding(from: Vec2, shot: ShotInput, hole: Hole): Vec2 {
  let ball = launchBall(from, shot);
  let last = clone(from);
  for (let i = 0; i < 240; i++) {
    const step = stepBall(ball, hole, shot.wind, 1 / 30, shot.club.bounce);
    last = clone(step.ball.pos);
    if (step.penaltyKind || step.holed || !step.flying) return last;
    ball = step.ball;
  }
  return last;
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

