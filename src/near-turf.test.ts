import { describe, expect, it } from "vitest";
import { BALL_RADIUS, ballCenterLift, contactShadowPose } from "./scene-ball";
import { FAIRWAY_NEAR_GRAIN, GREEN_NEAR_GRAIN, NEAR_FADE_END, NEAR_FADE_START, nearSurfaceFade, scuffOpacity, scuffSpec } from "./near-turf";

describe("near-ball turf", () => {
  it("fades the surface grain across a wide camera range with no cliff", () => {
    expect(NEAR_FADE_END - NEAR_FADE_START).toBeGreaterThanOrEqual(18);
    expect(nearSurfaceFade(0)).toBe(1);
    expect(nearSurfaceFade(NEAR_FADE_START)).toBe(1);
    expect(nearSurfaceFade(NEAR_FADE_END)).toBe(0);
    expect(nearSurfaceFade(NEAR_FADE_END + 14)).toBe(0);
    const mid = (NEAR_FADE_START + NEAR_FADE_END) * 0.5;
    expect(nearSurfaceFade(mid)).toBeCloseTo(0.5, 5);
    let prev = nearSurfaceFade(NEAR_FADE_START);
    for (let d = NEAR_FADE_START + 1; d <= NEAR_FADE_END; d++) {
      const next = nearSurfaceFade(d);
      expect(next).toBeLessThan(prev);
      prev = next;
    }
  });

  it("keeps the green nap finer and quieter than the fairway", () => {
    expect(GREEN_NEAR_GRAIN.scale).toBeGreaterThan(FAIRWAY_NEAR_GRAIN.scale);
    expect(GREEN_NEAR_GRAIN.strength).toBeLessThan(FAIRWAY_NEAR_GRAIN.strength);
    expect(GREEN_NEAR_GRAIN.strength).toBeGreaterThan(0);
    expect(FAIRWAY_NEAR_GRAIN.strength).toBeLessThan(1.2);
    expect(GREEN_NEAR_GRAIN.sheen).toBeGreaterThan(0);
    expect(FAIRWAY_NEAR_GRAIN.sheen).toBeGreaterThan(0);
  });
});

describe("turf scuff", () => {
  it("outlasts the impact puff and cuts a longer mark with an iron", () => {
    const iron = scuffSpec("strike", "fairway", "iron");
    const wood = scuffSpec("strike", "fairway", "wood");
    const land = scuffSpec("land", "fairway", "iron");
    const bunker = scuffSpec("land", "bunker", "wedge");
    const green = scuffSpec("land", "green", "wedge");
    expect(iron.length).toBeGreaterThan(wood.length);
    expect(iron.forward).toBeGreaterThan(wood.forward);
    expect(iron.life).toBeGreaterThan(0.34);
    expect(land.life).toBeGreaterThan(0.7);
    expect(land.forward).toBe(0);
    expect(bunker.color).not.toBe(land.color);
    expect(green.length).toBeLessThan(land.length);
    expect(scuffSpec("strike", "water", "iron").opacity).toBe(0);
    expect(scuffSpec("strike", "green", "putter").opacity).toBe(0);
    expect(scuffOpacity(0, iron.life, iron.opacity)).toBeCloseTo(iron.opacity);
    expect(scuffOpacity(iron.life * 0.85, iron.life, iron.opacity)).toBeLessThan(iron.opacity * 0.5);
    expect(scuffOpacity(iron.life + 0.01, iron.life, iron.opacity)).toBe(0);
  });
});

describe("ball contact shadow", () => {
  it("pools under a sitting ball and shrinks in the air", () => {
    const sit = contactShadowPose(0);
    const air = contactShadowPose(6);
    expect(sit.coreOpacity).toBeGreaterThan(air.coreOpacity);
    expect(sit.softScale).toBeGreaterThan(air.softScale);
    expect(sit.offset).toBeLessThan(air.offset);
    expect(ballCenterLift(0)).toBeGreaterThan(BALL_RADIUS);
    expect(ballCenterLift(0)).toBeLessThan(ballCenterLift(2));
    expect(ballCenterLift(2)).toBeCloseTo(BALL_RADIUS + 0.05, 5);
  });
});
