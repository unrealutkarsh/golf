import { describe, expect, it } from "vitest";
import { GREEN_BLADE_FAR, GREEN_BLADE_NEAR, greenBladeLod, shouldShowGreenBlades } from "./blades";

describe("green blade LOD", () => {
  it("is dense at putt distance and gone from the tee", () => {
    expect(GREEN_BLADE_NEAR).toBeLessThan(GREEN_BLADE_FAR);
    const near = greenBladeLod(3);
    expect(near.visible).toBe(true);
    expect(near.density).toBe(1);
    expect(near.opacity).toBeGreaterThan(0.8);
    const mid = greenBladeLod((GREEN_BLADE_NEAR + GREEN_BLADE_FAR) * 0.5);
    expect(mid.visible).toBe(true);
    expect(mid.density).toBeLessThan(near.density);
    expect(greenBladeLod(GREEN_BLADE_FAR + 1).visible).toBe(false);
    expect(shouldShowGreenBlades(true, 4)).toBe(true);
    expect(shouldShowGreenBlades(false, 4)).toBe(false);
    expect(shouldShowGreenBlades(true, 40)).toBe(false);
  });
});
