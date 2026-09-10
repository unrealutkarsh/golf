import { describe, expect, it } from "vitest";
import { HARBOR_DUNES, PLAYABLE_MARGIN, lieAt, nearOb } from "./course";
import { dist } from "./math";

describe("Harbor Dunes", () => {
  it("is a full nine at par 36", () => {
    expect(HARBOR_DUNES.holes).toHaveLength(9);
    expect(HARBOR_DUNES.par).toBe(36);
    expect(HARBOR_DUNES.holes.reduce((s, h) => s + h.par, 0)).toBe(36);
    const pars = HARBOR_DUNES.holes.map((h) => h.par);
    expect(pars).toContain(3);
    expect(pars).toContain(4);
    expect(pars).toContain(5);
  });

  it("keeps tees playable and pins on greens", () => {
    for (const hole of HARBOR_DUNES.holes) {
      const teeLie = lieAt(hole, hole.tee);
      expect(["tee", "fairway"]).toContain(teeLie);
      expect(lieAt(hole, hole.pin)).toBe("green");
      expect(hole.yards).toBeGreaterThan(140);
      expect(Math.round(dist(hole.tee, hole.pin))).toBe(hole.yards);
    }
  });

  it("keeps slight misses and tree lies in play instead of OB", () => {
    const hole = HARBOR_DUNES.holes[0];
    expect(lieAt(hole, { x: hole.tee.x, y: hole.tee.y - 48 })).not.toBe("ob");
    const tree = hole.trees[0];
    expect(lieAt(hole, { x: tree.x + tree.r + 3, y: tree.y })).toBe("rough");
    expect(lieAt(hole, { x: hole.tee.x, y: hole.tee.y - 220 })).toBe("ob");
    expect(PLAYABLE_MARGIN).toBeGreaterThanOrEqual(16);
    expect(nearOb(hole, { x: hole.tee.x, y: hole.tee.y - 220 })).toBe(false);
  });
});
