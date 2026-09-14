import { describe, expect, it } from "vitest";
import { fbm, hashNoise, heightToNormal, packNormalRgb, SCENE_TONE } from "./look";
import { angleApproach, expApproach, wrapAngle } from "./math";

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

describe("scene tone", () => {
  it("keeps hardware lighting below the washed-out PBR merge", () => {
    expect(SCENE_TONE.sunHardware).toBeLessThan(1.35);
    expect(SCENE_TONE.exposureHardware).toBeLessThan(0.9);
    expect(SCENE_TONE.hemiHardware).toBeLessThan(0.3);
    expect(SCENE_TONE.bloomStrength).toBeLessThan(0.1);
    expect(SCENE_TONE.backgroundIntensity).toBeLessThan(0.75);
    expect(SCENE_TONE.skyZenith[2]).toBeLessThan(0.55);
    expect(SCENE_TONE.greenSheen).toBeLessThan(0.3);
    expect(SCENE_TONE.sunSoftware).toBeGreaterThan(0.9);
    expect(SCENE_TONE.exposureSoftware).toBeGreaterThan(0.95);
  });

  it("eases values instead of snapping", () => {
    const stepped = expApproach(0.3, 0.9, 0.08, 1 / 60);
    expect(stepped).toBeGreaterThan(0.3);
    expect(stepped).toBeLessThan(0.55);
    const turned = angleApproach(2.8, -2.8, 0.07, 1 / 60);
    expect(Math.abs(wrapAngle(turned - 2.8))).toBeLessThan(0.4);
  });
});
