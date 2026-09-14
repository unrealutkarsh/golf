import { describe, expect, it } from "vitest";
import { fbm, hashNoise, heightToNormal, packNormalRgb } from "./look";

describe("look noise", () => {
  it("stays in a usable 0-1 range", () => {
    for (let i = 0; i < 40; i++) {
      const n = hashNoise(i * 1.7, i * 3.1);
      const f = fbm(i * 0.4, i * 0.9);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1.2);
    }
  });

  it("turns height slopes into unit normals", () => {
    const [nx, ny, nz] = heightToNormal(0.4, 0.1, 0.2, 0.2);
    expect(nx).toBeGreaterThan(0);
    expect(ny).toBeGreaterThan(0.5);
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
    const [r, g, b] = packNormalRgb(0, 1, 0);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });
});
