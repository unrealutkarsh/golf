import { describe, expect, it } from "vitest";
import {
  bandHex,
  courseColor,
  COURSE_PALETTE,
  hexToLinear,
  luminance,
  mowStripe,
  pinMarkerOpacity,
  renderPixelRatio,
  screenConstantScale,
} from "./art";
import { HARBOR_DUNES } from "./course";

describe("stylized course palette", () => {
  it("keeps fairway, rough, green and sand clearly apart in brightness", () => {
    const lum = (hex: number) => luminance(hexToLinear(hex));
    const p = COURSE_PALETTE;
    // Rough must be obviously darker than the short grass it borders.
    expect(lum(p.fairway) / lum(p.rough)).toBeGreaterThan(1.8);
    expect(lum(p.green)).toBeGreaterThan(lum(p.fairway));
    expect(lum(p.fringe)).toBeLessThan(lum(p.collar));
    expect(lum(p.bunker)).toBeGreaterThan(lum(p.green) * 1.3);
  });

  it("paints alternating mowing stripes along the hole, not across it", () => {
    const hole = HARBOR_DUNES.holes[0];
    const dx = hole.pin.x - hole.tee.x;
    const dz = hole.pin.y - hole.tee.y;
    const len = Math.hypot(dx, dz);
    const at = (along: number, side: number) => ({
      x: hole.tee.x + (dx / len) * along - (dz / len) * side,
      z: hole.tee.y + (dz / len) * along + (dx / len) * side,
    });
    const a = at(101, 0);
    const b = at(108, 0);
    const beside = at(101, 5);
    expect(mowStripe(hole, a.x, a.z)).not.toBe(mowStripe(hole, b.x, b.z));
    expect(mowStripe(hole, a.x, a.z)).toBe(mowStripe(hole, beside.x, beside.z));
    expect(bandHex("fairway", 0)).not.toBe(bandHex("fairway", 1));
  });

  it("colors the real course: green on the green, rough off the fairway", () => {
    const hole = HARBOR_DUNES.holes[0];
    const green = courseColor(hole, hole.green.cx, hole.green.cy);
    expect(green[1]).toBeGreaterThan(green[0]);
    expect(green[1]).toBeGreaterThan(green[2]);
    const bunker = hole.bunkers[0];
    const sand = courseColor(hole, bunker.cx, bunker.cy);
    expect(luminance(sand)).toBeGreaterThan(luminance(green));
  });
});

describe("readability helpers", () => {
  it("keeps billboards a constant on-screen size, with a floor up close", () => {
    expect(screenConstantScale(300, 0.06, 2.2)).toBeCloseTo(18, 5);
    expect(screenConstantScale(10, 0.06, 2.2)).toBe(2.2);
  });

  it("only shows the pin marker once the real flag is too far to find", () => {
    expect(pinMarkerOpacity(20)).toBe(0);
    expect(pinMarkerOpacity(55)).toBeGreaterThan(0);
    expect(pinMarkerOpacity(55)).toBeLessThan(1);
    expect(pinMarkerOpacity(300)).toBe(1);
  });

  it("caps render pixel ratio between 1 and 2", () => {
    expect(renderPixelRatio(undefined)).toBe(1);
    expect(renderPixelRatio(0.5)).toBe(1);
    expect(renderPixelRatio(1.5)).toBe(1.5);
    expect(renderPixelRatio(3)).toBe(2);
  });
});
