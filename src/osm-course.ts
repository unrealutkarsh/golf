import { closestPointOnPolygon, dist, distToPolyline, hashString, mulberry32, pointInPolygon, type Vec2 } from "./math";
import type { Tree } from "./types";

/** Subset of an Overpass `out tags geom;` element. */
export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
}

/** One imported hole in local yards: +x east, +y south (so a north-up map reads the same as the game). */
export interface HoleData {
  number: number;
  par: 3 | 4 | 5;
  name: string;
  tee: Vec2;
  pin: Vec2;
  /** Tee → green line of play, including dogleg bends. */
  centerline: Vec2[];
  /** Mapped fairway outlines; empty when the course has none for this hole. */
  fairways: Vec2[][];
  green: Vec2[];
  bunkers: Vec2[][];
  water: Vec2[][];
  trees: Tree[];
}

export interface CourseData {
  id: string;
  name: string;
  club: string;
  location: string;
  source: {
    osm: string;
    license: "ODbL-1.0";
    attribution: string;
    fetched: string;
  };
  holes: HoleData[];
}

export interface ConvertOptions {
  id: string;
  name: string;
  club: string;
  location: string;
  /** Hole `ref`s to keep, in play order. Defaults to every mapped hole. */
  holes?: number[];
  fetched: string;
}

const YARDS_PER_METER = 1 / 0.9144;
/** Features further than this from a hole's line of play belong to some other hole. */
const HOLE_REACH = 60;
/** How far a hole line may stop short of its green and still be matched to it, yards. */
const GREEN_SNAP = 25;

export function convertOsmCourse(elements: readonly OsmElement[], opts: ConvertOptions): CourseData {
  const course = elements.find((e) => e.tags?.leisure === "golf_course");
  if (!course) throw new Error("No leisure=golf_course element in the Overpass result");
  const boundary = outerRings(course)[0];
  if (!boundary?.length) throw new Error("Golf course has no geometry; query it with `out geom`");
  const origin = centroidLatLon(boundary);
  const project = (p: { lat: number; lon: number }): Vec2 => ({
    x: round1((p.lon - origin.lon) * metersPerDegLon(origin.lat) * YARDS_PER_METER),
    y: round1(-(p.lat - origin.lat) * metersPerDegLat(origin.lat) * YARDS_PER_METER),
  });
  const polygons = (golf: string) =>
    elements
      .filter((e) => e.type === "way" && e.tags?.golf === golf && e.geometry && e.geometry.length >= 3)
      .map((e) => simplify(e.geometry!.map(project)));

  const greens = polygons("green");
  const fairways = polygons("fairway");
  const bunkers = polygons("bunker");
  const water = [
    ...polygons("water_hazard"),
    ...polygons("lateral_water_hazard"),
    ...elements
      .filter((e) => e.type === "way" && (e.tags?.natural === "water" || e.tags?.water) && e.geometry && e.geometry.length >= 3)
      .map((e) => simplify(e.geometry!.map(project))),
  ];
  const pins = elements.filter((e) => e.type === "node" && e.tags?.golf === "pin" && e.lat !== undefined).map((e) => project(e as { lat: number; lon: number }));
  const treeNodes = elements
    .filter((e) => e.type === "node" && e.tags?.natural === "tree" && e.lat !== undefined)
    .map((e) => project(e as { lat: number; lon: number }));
  const woods = elements
    .filter((e) => e.type === "way" && (e.tags?.natural === "wood" || e.tags?.landuse === "forest") && e.geometry && e.geometry.length >= 3)
    .map((e) => simplify(e.geometry!.map(project)));

  const holeWays = elements
    .filter((e) => e.type === "way" && e.tags?.golf === "hole" && e.geometry && e.geometry.length >= 2)
    .map((e) => ({ ref: Number.parseInt(e.tags?.ref ?? "", 10), tags: e.tags ?? {}, line: e.geometry!.map(project) }))
    .filter((h) => Number.isFinite(h.ref));
  const wanted = opts.holes ?? [...new Set(holeWays.map((h) => h.ref))].sort((a, b) => a - b);

  // Resolve each hole's line and green first, so shared features can go to the closest hole.
  const oriented = wanted.map((ref) => {
    const way = holeWays.find((h) => h.ref === ref);
    if (!way) throw new Error(`Hole ${ref} is not mapped (no golf=hole way with ref=${ref})`);
    let line = way.line;
    // golf=hole is drawn tee → green, but not every mapper does; orient it by the nearest green.
    if (nearestPolygonDistance(line[0], greens) < nearestPolygonDistance(line[line.length - 1], greens)) line = [...line].reverse();
    return { ref, way, line };
  });
  // Greens that contain some hole's end point are claimed outright; a hole may only fall back to an unclaimed green.
  const claimed = new Set(oriented.map((h) => greens.find((g) => pointInPolygon(h.line[h.line.length - 1], g))).filter(Boolean));
  const lines = oriented.map(({ ref, way, line }) => {
    const end = line[line.length - 1];
    const green =
      greens.find((g) => pointInPolygon(end, g)) ??
      nearestPolygon(end, greens.filter((g) => !claimed.has(g)), GREEN_SNAP);
    if (!green) throw new Error(`Hole ${ref} has no mapped green near the end of its line`);
    claimed.add(green);
    const pin = pins.find((p) => pointInPolygon(p, green)) ?? polygonCentroid(green);
    return { ref, way, line: [...line.slice(0, -1), pin], green, pin };
  });
  const closestHole = (p: Vec2) => {
    let best = -1;
    let bestD = Infinity;
    lines.forEach((h, i) => {
      const d = distToPolyline(p, h.line);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return { index: best, distance: bestD };
  };
  const ownedBy = (i: number, poly: Vec2[]) => {
    const owner = closestHole(polygonCentroid(poly));
    return owner.index === i && owner.distance <= HOLE_REACH;
  };

  const holes: HoleData[] = lines.map((h, i) => {
    const tee = h.line[0];
    const pin = h.pin;
    const length = polylineLength(h.line);
    const parTag = Number.parseInt(h.way.tags.par ?? "", 10);
    const par = (parTag >= 3 && parTag <= 5 ? parTag : length < 250 ? 3 : length < 470 ? 4 : 5) as 3 | 4 | 5;
    const near = (p: Vec2, reach: number) => distToPolyline(p, h.line) <= reach;
    const trees: Tree[] = [
      ...treeNodes.filter((t) => near(t, 90) && closestHole(t).index === i).map((t) => ({ ...t, r: 6.5 })),
      ...woods.flatMap((w) => sampleWood(w, 16)).filter((t) => near(t, 90) && !near(t, 14) && closestHole(t).index === i).map((t) => ({ ...t, r: 7 })),
    ].slice(0, 160);
    return {
      number: i + 1,
      par,
      name: h.way.tags.name ?? `Hole ${i + 1}`,
      tee,
      pin,
      centerline: h.line,
      fairways: fairways.filter((f) => ownedBy(i, f)),
      green: h.green,
      bunkers: bunkers.filter((b) => ownedBy(i, b)),
      water: water.filter((w) => w.some((p) => near(p, 110))),
      trees,
    };
  });

  return {
    id: opts.id,
    name: opts.name,
    club: opts.club,
    location: opts.location,
    source: {
      osm: `https://www.openstreetmap.org/${course.type}/${course.id}`,
      license: "ODbL-1.0",
      attribution: "Course geometry © OpenStreetMap contributors, available under the Open Database License (ODbL)",
      fetched: opts.fetched,
    },
    holes,
  };
}

/** Deterministic green slope for imported holes until real elevation data is wired in. */
export function placeholderBreak(courseId: string, hole: number): Vec2 {
  const rng = mulberry32(hashString(`${courseId}-break-${hole}`));
  const angle = rng() * Math.PI * 2;
  const strength = 0.3 + rng() * 0.55;
  return { x: Math.round(Math.cos(angle) * strength * 100) / 100, y: Math.round(Math.sin(angle) * strength * 100) / 100 };
}

function outerRings(e: OsmElement): { lat: number; lon: number }[][] {
  if (e.type === "way") return e.geometry ? [e.geometry] : [];
  return (e.members ?? []).filter((m) => m.role === "outer" && m.geometry).map((m) => m.geometry!);
}

function metersPerDegLat(lat: number): number {
  const r = (lat * Math.PI) / 180;
  return 111132.92 - 559.82 * Math.cos(2 * r) + 1.175 * Math.cos(4 * r);
}

function metersPerDegLon(lat: number): number {
  const r = (lat * Math.PI) / 180;
  return 111412.84 * Math.cos(r) - 93.5 * Math.cos(3 * r);
}

function centroidLatLon(ring: { lat: number; lon: number }[]): { lat: number; lon: number } {
  const n = ring.length;
  return { lat: ring.reduce((s, p) => s + p.lat, 0) / n, lon: ring.reduce((s, p) => s + p.lon, 0) / n };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Drop vertices closer than `minGap` yards and the duplicate closing vertex OSM rings carry. */
export function simplify(points: Vec2[], minGap = 1.5): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    if (!out.length || dist(out[out.length - 1], p) >= minGap) out.push(p);
  }
  if (out.length > 3 && dist(out[0], out[out.length - 1]) < minGap) out.pop();
  return out;
}

export function polygonCentroid(poly: readonly Vec2[]): Vec2 {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    return { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

function polylineLength(line: readonly Vec2[]): number {
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) total += dist(line[i], line[i + 1]);
  return total;
}

function nearestPolygonDistance(p: Vec2, polys: readonly Vec2[][]): number {
  let best = Infinity;
  for (const poly of polys) best = Math.min(best, pointInPolygon(p, poly) ? 0 : dist(p, closestPointOnPolygon(p, poly)));
  return best;
}

function nearestPolygon(p: Vec2, polys: readonly Vec2[][], maxDistance: number): Vec2[] | null {
  let best: Vec2[] | null = null;
  let bestD = maxDistance;
  for (const poly of polys) {
    const d = dist(p, closestPointOnPolygon(p, poly));
    if (d <= bestD) {
      bestD = d;
      best = poly;
    }
  }
  return best;
}

/** Grid points inside a wood polygon, used as collision trees. */
function sampleWood(poly: readonly Vec2[], step: number): Vec2[] {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const out: Vec2[] = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) {
      const p = { x: round1(x + ((x * 7) % 5)), y: round1(y + ((y * 3) % 5)) };
      if (pointInPolygon(p, poly as Vec2[])) out.push(p);
    }
  }
  return out;
}
