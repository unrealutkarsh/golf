import { describe, expect, it } from "vitest";
import { HARBOR_DUNES, lieAt } from "./course";
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
});
