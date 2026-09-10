export type Vec2 = { x: number; y: number };

export const TAU = Math.PI * 2;

export function vec(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function clone(v: Vec2): Vec2 {
  return { x: v.x, y: v.y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function len(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function norm(a: Vec2): Vec2 {
  const l = len(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export function dot(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x * b.x, y: a.y * b.y };
}

export function heading(a: Vec2): number {
  return Math.atan2(a.y, a.x);
}

export function fromAngle(angle: number, magnitude = 1): Vec2 {
  return { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function angleTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInEllipse(
  p: Vec2,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation: number,
): boolean {
  const dx = p.x - cx;
  const dy = p.y - cy;
  const c = Math.cos(-rotation);
  const s = Math.sin(-rotation);
  const x = dx * c - dy * s;
  const y = dx * s + dy * c;
  return (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1;
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a);
  const t = clamp(dot1(sub(p, a), ab) / (dot1(ab, ab) || 1), 0, 1);
  return add(a, scale(ab, t));
}

function dot1(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function closestPointOnPolygon(p: Vec2, poly: Vec2[]): Vec2 {
  let best = poly[0];
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const q = closestPointOnSegment(p, poly[i], poly[(i + 1) % poly.length]);
    const d = dist(p, q);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

export function offsetCorridor(centerline: Vec2[], halfWidth: number | ((t: number) => number)): Vec2[] {
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < centerline.length; i++) {
    const prev = centerline[Math.max(0, i - 1)];
    const next = centerline[Math.min(centerline.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    const t = centerline.length === 1 ? 0 : i / (centerline.length - 1);
    const w = typeof halfWidth === "number" ? halfWidth : halfWidth(t);
    left.push({ x: centerline[i].x + nx * w, y: centerline[i].y + ny * w });
    right.push({ x: centerline[i].x - nx * w, y: centerline[i].y - ny * w });
  }
  return [...left, ...right.reverse()];
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function yardsLabel(n: number): string {
  return `${Math.round(n)}`;
}
