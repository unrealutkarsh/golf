import {
  angleTo,
  clone,
  dist,
  offsetCorridor,
  pointInEllipse,
  pointInPolygon,
  type Vec2,
} from "./math";
import type { Course, Ellipse, Hole, Lie, Tree } from "./types";

interface HoleSpec {
  number: number;
  name: string;
  par: 3 | 4 | 5;
  tee: Vec2;
  pin: Vec2;
  centerline: Vec2[];
  fairwayHalf: number | ((t: number) => number);
  roughExtra: number;
  green: Ellipse;
  greenBreak: Vec2;
  bunkers?: Ellipse[];
  water?: Vec2[][];
  trees?: Tree[];
}

function aabb(polys: Vec2[][], extras: Vec2[], pad: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (p: Vec2) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const poly of polys) for (const p of poly) consider(p);
  for (const p of extras) consider(p);
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

function buildHole(spec: HoleSpec): Hole {
  const fairwayHalf = spec.fairwayHalf;
  const fairway = [offsetCorridor(spec.centerline, fairwayHalf)];
  const roughHalf =
    typeof fairwayHalf === "number"
      ? fairwayHalf + spec.roughExtra
      : (t: number) => fairwayHalf(t) + spec.roughExtra;
  const rough = [offsetCorridor(spec.centerline, roughHalf)];
  const extras: Vec2[] = [spec.tee, spec.pin, ...spec.centerline];
  for (const b of spec.bunkers ?? []) extras.push({ x: b.cx + b.rx, y: b.cy + b.ry }, { x: b.cx - b.rx, y: b.cy - b.ry });
  for (const w of spec.water ?? []) extras.push(...w);
  for (const t of spec.trees ?? []) extras.push({ x: t.x + t.r, y: t.y + t.r }, { x: t.x - t.r, y: t.y - t.r });
  extras.push({ x: spec.green.cx + spec.green.rx, y: spec.green.cy + spec.green.ry });
  extras.push({ x: spec.green.cx - spec.green.rx, y: spec.green.cy - spec.green.ry });
  return {
    number: spec.number,
    name: spec.name,
    par: spec.par,
    yards: Math.round(dist(spec.tee, spec.pin)),
    tee: clone(spec.tee),
    pin: clone(spec.pin),
    fairway,
    rough,
    green: spec.green,
    greenBreak: spec.greenBreak,
    bunkers: spec.bunkers ?? [],
    water: spec.water ?? [],
    trees: spec.trees ?? [],
    bounds: aabb([...fairway, ...rough, ...(spec.water ?? [])], extras, 28),
  };
}

function lineTrees(a: Vec2, b: Vec2, count: number, side: number, r = 7): Tree[] {
  const trees: Tree[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const ang = angleTo(a, b) + Math.PI / 2;
    trees.push({
      x: x + Math.cos(ang) * side + (i % 2 === 0 ? 2 : -2),
      y: y + Math.sin(ang) * side,
      r: r + (i % 3),
    });
  }
  return trees;
}

function pond(cx: number, cy: number, rx: number, ry: number, steps = 18): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

const hole1 = buildHole({
  number: 1,
  name: "Opening Lane",
  par: 4,
  tee: { x: 36, y: 168 },
  pin: { x: 398, y: 142 },
  centerline: [
    { x: 36, y: 168 },
    { x: 150, y: 170 },
    { x: 260, y: 158 },
    { x: 398, y: 142 },
  ],
  fairwayHalf: (t) => 22 - t * 4,
  roughExtra: 26,
  green: { cx: 398, cy: 142, rx: 16, ry: 12, rotation: -0.25 },
  greenBreak: { x: 0.35, y: 0.55 },
  bunkers: [
    { cx: 378, cy: 160, rx: 10, ry: 6, rotation: 0.4 },
    { cx: 414, cy: 128, rx: 8, ry: 5, rotation: -0.3 },
  ],
  trees: [
    ...lineTrees({ x: 80, y: 168 }, { x: 360, y: 142 }, 8, -38, 8),
    ...lineTrees({ x: 90, y: 168 }, { x: 340, y: 142 }, 6, 40, 7),
  ],
});

const hole2 = buildHole({
  number: 2,
  name: "Harbor Shelf",
  par: 3,
  tee: { x: 40, y: 130 },
  pin: { x: 208, y: 118 },
  centerline: [
    { x: 40, y: 130 },
    { x: 120, y: 126 },
    { x: 208, y: 118 },
  ],
  fairwayHalf: 16,
  roughExtra: 18,
  green: { cx: 208, cy: 118, rx: 14, ry: 11, rotation: 0.15 },
  greenBreak: { x: -0.4, y: 0.8 },
  bunkers: [
    { cx: 222, cy: 104, rx: 7, ry: 5, rotation: 0.5 },
    { cx: 194, cy: 132, rx: 8, ry: 5, rotation: -0.2 },
  ],
  water: [pond(150, 148, 42, 22)],
  trees: [
    { x: 70, y: 88, r: 8 },
    { x: 100, y: 84, r: 9 },
    { x: 240, y: 88, r: 8 },
    { x: 70, y: 176, r: 7 },
  ],
});

const hole3 = buildHole({
  number: 3,
  name: "Long Meadow",
  par: 5,
  tee: { x: 28, y: 210 },
  pin: { x: 548, y: 168 },
  centerline: [
    { x: 28, y: 210 },
    { x: 180, y: 200 },
    { x: 320, y: 188 },
    { x: 440, y: 176 },
    { x: 548, y: 168 },
  ],
  fairwayHalf: (t) => 26 - t * 6,
  roughExtra: 30,
  green: { cx: 548, cy: 168, rx: 17, ry: 13, rotation: -0.1 },
  greenBreak: { x: 0.2, y: -0.7 },
  bunkers: [
    { cx: 300, cy: 214, rx: 12, ry: 7, rotation: 0.1 },
    { cx: 530, cy: 188, rx: 10, ry: 6, rotation: 0.4 },
    { cx: 562, cy: 154, rx: 8, ry: 5, rotation: -0.4 },
  ],
  water: [pond(250, 154, 36, 18)],
  trees: [
    ...lineTrees({ x: 70, y: 210 }, { x: 500, y: 168 }, 10, -48, 8),
    ...lineTrees({ x: 90, y: 210 }, { x: 480, y: 168 }, 7, 46, 7),
  ],
});

const hole4 = buildHole({
  number: 4,
  name: "Pine Corridor",
  par: 4,
  tee: { x: 32, y: 150 },
  pin: { x: 438, y: 188 },
  centerline: [
    { x: 32, y: 150 },
    { x: 170, y: 154 },
    { x: 300, y: 168 },
    { x: 438, y: 188 },
  ],
  fairwayHalf: (t) => 15 + (t > 0.7 ? 4 : 0),
  roughExtra: 16,
  green: { cx: 438, cy: 188, rx: 15, ry: 12, rotation: 0.35 },
  greenBreak: { x: -0.6, y: 0.25 },
  bunkers: [
    { cx: 418, cy: 172, rx: 9, ry: 5, rotation: 0.2 },
    { cx: 452, cy: 206, rx: 8, ry: 5, rotation: -0.5 },
  ],
  trees: [
    ...lineTrees({ x: 60, y: 150 }, { x: 410, y: 188 }, 12, -28, 8),
    ...lineTrees({ x: 70, y: 150 }, { x: 400, y: 188 }, 12, 28, 8),
  ],
});

const hole5 = buildHole({
  number: 5,
  name: "Cape Turn",
  par: 4,
  tee: { x: 40, y: 220 },
  pin: { x: 352, y: 96 },
  centerline: [
    { x: 40, y: 220 },
    { x: 150, y: 210 },
    { x: 230, y: 160 },
    { x: 300, y: 118 },
    { x: 352, y: 96 },
  ],
  fairwayHalf: (t) => 20 - t * 3,
  roughExtra: 22,
  green: { cx: 352, cy: 96, rx: 15, ry: 12, rotation: -0.6 },
  greenBreak: { x: 0.7, y: 0.35 },
  bunkers: [
    { cx: 336, cy: 114, rx: 9, ry: 6, rotation: 0.6 },
    { cx: 366, cy: 82, rx: 7, ry: 5, rotation: -0.2 },
  ],
  water: [
    [
      { x: 120, y: 120 },
      { x: 280, y: 40 },
      { x: 340, y: 48 },
      { x: 360, y: 70 },
      { x: 300, y: 150 },
      { x: 180, y: 188 },
      { x: 110, y: 176 },
    ],
  ],
  trees: [
    ...lineTrees({ x: 50, y: 220 }, { x: 250, y: 200 }, 5, 32, 7),
    { x: 380, y: 130, r: 8 },
    { x: 390, y: 70, r: 7 },
  ],
});

const hole6 = buildHole({
  number: 6,
  name: "Ridge Pin",
  par: 3,
  tee: { x: 34, y: 140 },
  pin: { x: 228, y: 108 },
  centerline: [
    { x: 34, y: 140 },
    { x: 130, y: 126 },
    { x: 228, y: 108 },
  ],
  fairwayHalf: 14,
  roughExtra: 20,
  green: { cx: 228, cy: 108, rx: 13, ry: 10, rotation: 0.2 },
  greenBreak: { x: -0.9, y: 0.4 },
  bunkers: [
    { cx: 210, cy: 96, rx: 8, ry: 5, rotation: 0.3 },
    { cx: 242, cy: 122, rx: 9, ry: 5, rotation: -0.4 },
    { cx: 236, cy: 90, rx: 6, ry: 4, rotation: 0.1 },
  ],
  trees: [
    { x: 80, y: 88, r: 8 },
    { x: 160, y: 78, r: 9 },
    { x: 90, y: 188, r: 8 },
    { x: 190, y: 168, r: 7 },
    { x: 260, y: 150, r: 8 },
  ],
});

const hole7 = buildHole({
  number: 7,
  name: "Dunes Reach",
  par: 5,
  tee: { x: 30, y: 120 },
  pin: { x: 560, y: 230 },
  centerline: [
    { x: 30, y: 120 },
    { x: 180, y: 128 },
    { x: 300, y: 150 },
    { x: 420, y: 196 },
    { x: 560, y: 230 },
  ],
  fairwayHalf: (t) => 24 - Math.abs(t - 0.5) * 6,
  roughExtra: 28,
  green: { cx: 560, cy: 230, rx: 16, ry: 13, rotation: 0.4 },
  greenBreak: { x: -0.25, y: -0.55 },
  bunkers: [
    { cx: 290, cy: 128, rx: 11, ry: 6, rotation: 0.2 },
    { cx: 540, cy: 248, rx: 10, ry: 6, rotation: 0.5 },
    { cx: 576, cy: 214, rx: 8, ry: 5, rotation: -0.3 },
  ],
  water: [pond(360, 214, 40, 16)],
  trees: [
    ...lineTrees({ x: 60, y: 120 }, { x: 520, y: 230 }, 9, -44, 8),
    ...lineTrees({ x: 80, y: 120 }, { x: 500, y: 230 }, 7, 42, 7),
  ],
});

const hole8 = buildHole({
  number: 8,
  name: "West Wind",
  par: 4,
  tee: { x: 28, y: 160 },
  pin: { x: 458, y: 148 },
  centerline: [
    { x: 28, y: 160 },
    { x: 170, y: 154 },
    { x: 310, y: 150 },
    { x: 458, y: 148 },
  ],
  fairwayHalf: (t) => 20 + (t > 0.6 ? -3 : 2),
  roughExtra: 24,
  green: { cx: 458, cy: 148, rx: 16, ry: 12, rotation: 0.05 },
  greenBreak: { x: 0.15, y: 0.85 },
  bunkers: [
    { cx: 250, cy: 176, rx: 12, ry: 7, rotation: 0 },
    { cx: 440, cy: 166, rx: 9, ry: 6, rotation: 0.3 },
    { cx: 472, cy: 132, rx: 8, ry: 5, rotation: -0.2 },
  ],
  trees: [
    ...lineTrees({ x: 70, y: 160 }, { x: 420, y: 148 }, 8, -40, 8),
    ...lineTrees({ x: 90, y: 160 }, { x: 400, y: 148 }, 6, 44, 8),
  ],
});

const hole9 = buildHole({
  number: 9,
  name: "Home Flag",
  par: 4,
  tee: { x: 34, y: 190 },
  pin: { x: 412, y: 132 },
  centerline: [
    { x: 34, y: 190 },
    { x: 160, y: 184 },
    { x: 280, y: 160 },
    { x: 412, y: 132 },
  ],
  fairwayHalf: (t) => 21 - t * 3,
  roughExtra: 24,
  green: { cx: 412, cy: 132, rx: 16, ry: 13, rotation: -0.35 },
  greenBreak: { x: 0.45, y: 0.5 },
  bunkers: [
    { cx: 394, cy: 150, rx: 10, ry: 6, rotation: 0.45 },
    { cx: 428, cy: 116, rx: 8, ry: 5, rotation: -0.2 },
  ],
  water: [pond(360, 188, 32, 16)],
  trees: [
    ...lineTrees({ x: 70, y: 190 }, { x: 380, y: 132 }, 8, -40, 8),
    ...lineTrees({ x: 90, y: 190 }, { x: 340, y: 132 }, 5, 38, 7),
    { x: 440, y: 168, r: 8 },
    { x: 450, y: 100, r: 7 },
  ],
});

export const HARBOR_DUNES: Course = {
  id: "harbor-dunes",
  name: "Harbor Dunes Club",
  club: "Harbor Dunes",
  location: "Cape Meridian",
  par: 36,
  holes: [hole1, hole2, hole3, hole4, hole5, hole6, hole7, hole8, hole9],
};

export const COURSES: Course[] = [HARBOR_DUNES];

export function courseById(id: string): Course {
  const course = COURSES.find((c) => c.id === id);
  if (!course) throw new Error(`Unknown course ${id}`);
  return course;
}

export function lieAt(hole: Hole, p: Vec2): Lie {
  for (const water of hole.water) {
    if (pointInPolygon(p, water)) return "water";
  }
  for (const bunker of hole.bunkers) {
    if (pointInEllipse(p, bunker.cx, bunker.cy, bunker.rx, bunker.ry, bunker.rotation)) return "bunker";
  }
  if (pointInEllipse(p, hole.green.cx, hole.green.cy, hole.green.rx, hole.green.ry, hole.green.rotation)) {
    return "green";
  }
  if (dist(p, hole.tee) < 9) return "tee";
  for (const fairway of hole.fairway) {
    if (pointInPolygon(p, fairway)) return "fairway";
  }
  for (const rough of hole.rough) {
    if (pointInPolygon(p, rough)) return "rough";
  }
  return "ob";
}

export function onGreen(hole: Hole, p: Vec2): boolean {
  return pointInEllipse(p, hole.green.cx, hole.green.cy, hole.green.rx, hole.green.ry, hole.green.rotation);
}

export function treeHit(hole: Hole, p: Vec2, z: number): Tree | null {
  if (z > 14) return null;
  for (const tree of hole.trees) {
    if (dist(p, tree) < tree.r * 0.72) return tree;
  }
  return null;
}

export function inWater(hole: Hole, p: Vec2): boolean {
  return hole.water.some((w) => pointInPolygon(p, w));
}

export function dropNear(hole: Hole, from: Vec2, toward: Vec2): Vec2 {
  const dir = { x: toward.x - from.x, y: toward.y - from.y };
  const l = Math.hypot(dir.x, dir.y) || 1;
  let p = { x: from.x, y: from.y };
  for (let i = 0; i < 40; i++) {
    p = { x: from.x - (dir.x / l) * i * 2, y: from.y - (dir.y / l) * i * 2 };
    const lie = lieAt(hole, p);
    if (lie !== "water" && lie !== "ob") return p;
  }
  return clone(hole.tee);
}
