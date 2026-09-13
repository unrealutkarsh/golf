import { describe, expect, it } from "vitest";
import { HARBOR_DUNES } from "./course";
import { greenRadial, napContrast, napShade, turfAlbedoRgb, turfBand } from "./turf";

describe("turf bands and nap", () => {
  const hole = HARBOR_DUNES.holes[0];

  it("keeps the putting surface separate from fringe and fairway", () => {
    expect(turfBand(hole, hole.green.cx, hole.green.cy)).toBe("green");
    const fringe = {
      x: hole.green.cx + hole.green.rx * 1.12,
      y: hole.green.cy,
    };
    expect(greenRadial(hole, fringe.x, fringe.y)).toBeGreaterThan(1);
    expect(greenRadial(hole, fringe.x, fringe.y)).toBeLessThan(1.3);
    expect(turfBand(hole, fringe.x, fringe.y)).toBe("fringe");
    const [gr, gg, gb] = turfAlbedoRgb("green", hole.green.cx, hole.green.cy, 1, 0);
    const [fr, fg] = turfAlbedoRgb("fringe", fringe.x, fringe.y, 1, 0);
    const [wr] = turfAlbedoRgb("fairway", hole.tee.x + 40, hole.tee.y, 1, 0);
    expect(gg).toBeGreaterThan(gr);
    expect(gg).toBeGreaterThan(gb);
    expect(gg / gr).toBeGreaterThan(fg / fr);
    expect(wr).toBeGreaterThan(gr);
  });

  it("has readable green directionality", () => {
    const contrast = napContrast(hole, hole.green.cx, hole.green.cy);
    expect(contrast).toBeGreaterThan(0.04);
    expect(napShade("green", 0, 0, 1, 0)).not.toBe(napShade("green", 1.2, 0.1, 1, 0));
    expect(napShade("green", 0, 0, 1, 0)).toBeGreaterThan(0.65);
  });
});
