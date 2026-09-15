import { describe, expect, it } from "vitest";
import { buildImportedCourse, COURSES, fitEllipse, FOG_BELT_LINKS, lieAt, onGreen } from "./course";
import { angleTo } from "./math";
import { convertOsmCourse, type OsmElement } from "./osm-course";
import { defaultAim } from "./physics";

/** ~1 yard in degrees near 37.8° N. */
const LAT_YD = 0.9144 / 111030;
const LON_YD = 0.9144 / 87930;
const BASE = { lat: 37.8, lon: -122.46 };

/** Lat/lon for a point given in yards east / north of BASE. */
const at = (east: number, north: number) => ({ lat: BASE.lat + north * LAT_YD, lon: BASE.lon + east * LON_YD });
const ring = (cx: number, cy: number, r: number) => {
  const pts = Array.from({ length: 12 }, (_, i) => at(cx + Math.cos((i / 12) * Math.PI * 2) * r, cy + Math.sin((i / 12) * Math.PI * 2) * r));
  return [...pts, pts[0]];
};

function fixture(): OsmElement[] {
  return [
    { type: "way", id: 1, tags: { leisure: "golf_course", name: "Test Links" }, geometry: [at(-50, 50), at(450, 50), at(450, -250), at(-50, -250), at(-50, 50)] },
    // Hole 1 runs due east. Hole 2 runs south and was drawn green → tee.
    { type: "way", id: 10, tags: { golf: "hole", ref: "1", par: "4" }, geometry: [at(0, 0), at(380, 0)] },
    { type: "way", id: 11, tags: { golf: "hole", ref: "2" }, geometry: [at(380, -200), at(380, -40)] },
    { type: "way", id: 20, tags: { golf: "green" }, geometry: ring(385, 0, 14) },
    { type: "way", id: 21, tags: { golf: "green" }, geometry: ring(380, -205, 12) },
    { type: "node", id: 30, tags: { golf: "pin" }, ...at(390, 3) },
    { type: "way", id: 40, tags: { golf: "bunker" }, geometry: ring(360, 22, 5) },
    { type: "way", id: 41, tags: { golf: "bunker" }, geometry: ring(400, -185, 4) },
    { type: "way", id: 50, tags: { golf: "fairway" }, geometry: [at(150, 15), at(330, 15), at(330, -15), at(150, -15), at(150, 15)] },
  ];
}

describe("OpenStreetMap course import", () => {
  const data = convertOsmCourse(fixture(), { id: "test-links", name: "Test Links", club: "Test", location: "Nowhere", fetched: "2026-09-14" });

  it("projects east to +x and north to -y, in yards", () => {
    const [h1] = data.holes;
    expect(h1.tee.x).toBeLessThan(h1.pin.x);
    expect(Math.abs(h1.pin.x - h1.tee.x)).toBeGreaterThan(380);
    expect(Math.abs(h1.pin.x - h1.tee.x)).toBeLessThan(400);
    // Hole 2's green lies south of its tee, so larger y.
    const h2 = data.holes[1];
    expect(h2.pin.y).toBeGreaterThan(h2.tee.y);
  });

  it("orients a hole drawn backwards and ends it on the mapped pin or green centre", () => {
    const h2 = data.holes[1];
    expect(h2.pin.y - h2.tee.y).toBeGreaterThan(150);
    const h1 = data.holes[0];
    // Hole 1 has a pin node inside its green.
    expect(h1.pin.x - data.holes[0].tee.x).toBeCloseTo(390, -1);
  });

  it("gives each hole its own bunkers and fairways, and infers par from length when untagged", () => {
    expect(data.holes[0].bunkers).toHaveLength(1);
    expect(data.holes[1].bunkers).toHaveLength(1);
    expect(data.holes[0].fairways).toHaveLength(1);
    expect(data.holes[1].fairways).toHaveLength(0);
    expect(data.holes[0].par).toBe(4);
    expect(data.holes[1].par).toBe(3);
    expect(data.source.license).toBe("ODbL-1.0");
    expect(data.source.osm).toBe("https://www.openstreetmap.org/way/1");
  });

  it("builds playable holes that use the real green and bunker outlines for lies", () => {
    const course = buildImportedCourse(data);
    const h1 = course.holes[0];
    expect(course.par).toBe(7);
    expect(lieAt(h1, h1.pin)).toBe("green");
    expect(lieAt(h1, h1.tee)).toBe("tee");
    const bunker = h1.bunkerShapes![0];
    const bx = bunker.reduce((s, p) => s + p.x, 0) / bunker.length;
    const by = bunker.reduce((s, p) => s + p.y, 0) / bunker.length;
    expect(lieAt(h1, { x: bx, y: by })).toBe("bunker");
    // No fairway polygon on hole 2: a corridor stands in so the line of play is still fairway.
    const h2 = course.holes[1];
    const mid = { x: (h2.tee.x + h2.pin.x) / 2, y: (h2.tee.y + h2.pin.y) / 2 };
    expect(lieAt(h2, mid)).toBe("fairway");
  });

  it("refuses a hole with no mapped green instead of inventing one", () => {
    const broken = fixture().filter((e) => e.id !== 21);
    expect(() => convertOsmCourse(broken, { id: "x", name: "x", club: "x", location: "x", fetched: "x" })).toThrow(/Hole 2 has no mapped green/);
  });
});

describe("dogleg aim", () => {
  it("aims a long tee shot at the corner of the line of play, and at the pin once in range", () => {
    const elements: OsmElement[] = [
      { type: "way", id: 1, tags: { leisure: "golf_course" }, geometry: [at(-50, 50), at(450, 50), at(450, -350), at(-50, -350), at(-50, 50)] },
      // Dogleg right: 260 yards east, then 150 yards south.
      { type: "way", id: 10, tags: { golf: "hole", ref: "1", par: "4" }, geometry: [at(0, 0), at(260, 0), at(260, -150)] },
      { type: "way", id: 20, tags: { golf: "green" }, geometry: ring(260, -155, 12) },
    ];
    const hole = buildImportedCourse(convertOsmCourse(elements, { id: "d", name: "d", club: "d", location: "d", fetched: "d" })).holes[0];
    const corner = hole.centerline![1];
    expect(defaultAim(hole.tee, hole)).toBeCloseTo(angleTo(hole.tee, corner), 5);
    const nearCorner = { x: corner.x - 10, y: corner.y + 5 };
    expect(defaultAim(nearCorner, hole)).toBeCloseTo(angleTo(nearCorner, hole.pin), 5);
  });
});

describe("ellipse fit", () => {
  it("recovers centre, radii and orientation of an elliptical outline", () => {
    const rot = 0.6;
    const poly = Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2;
      const x = Math.cos(a) * 15;
      const y = Math.sin(a) * 8;
      return { x: 100 + x * Math.cos(rot) - y * Math.sin(rot), y: 50 + x * Math.sin(rot) + y * Math.cos(rot) };
    });
    const e = fitEllipse(poly);
    expect(e.cx).toBeCloseTo(100, 0);
    expect(e.cy).toBeCloseTo(50, 0);
    expect(e.rx).toBeCloseTo(15, 0);
    expect(e.ry).toBeCloseTo(8, 0);
    expect(Math.abs(Math.cos(e.rotation - rot))).toBeGreaterThan(0.99);
  });
});

describe("Fog Belt Links (imported)", () => {
  it("is registered and plays as nine real holes", () => {
    expect(COURSES).toContain(FOG_BELT_LINKS);
    expect(FOG_BELT_LINKS.holes).toHaveLength(9);
    expect(FOG_BELT_LINKS.par).toBe(36);
  });

  it("puts every tee in play, every pin on its green, and the line of play inside the hole", () => {
    for (const hole of FOG_BELT_LINKS.holes) {
      const label = `hole ${hole.number}`;
      expect(lieAt(hole, hole.tee), label).toBe("tee");
      expect(onGreen(hole, hole.pin), label).toBe(true);
      expect(hole.yards, label).toBeGreaterThan(90);
      expect(hole.yards, label).toBeLessThan(620);
      for (let t = 0.2; t < 0.9; t += 0.1) {
        const p = { x: hole.tee.x + (hole.pin.x - hole.tee.x) * t, y: hole.tee.y + (hole.pin.y - hole.tee.y) * t };
        expect(lieAt(hole, p), `${label} at ${t.toFixed(1)}`).not.toBe("ob");
      }
    }
  });
});
