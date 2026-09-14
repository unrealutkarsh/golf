import type { Vec2 } from "./math";

const LIFT_X = 0.28;
const LIFT_Y = 2.25;

export function airborneOffset(z: number): Vec2 {
  const h = Math.max(0, z);
  return { x: h * LIFT_X, y: -h * LIFT_Y };
}

export function airbornePos(ground: Vec2, z: number): Vec2 {
  const lift = airborneOffset(z);
  return { x: ground.x + lift.x, y: ground.y + lift.y };
}
