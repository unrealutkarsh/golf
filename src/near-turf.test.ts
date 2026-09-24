import { describe, expect, it } from "vitest";
import { BALL_RADIUS, ballCenterLift, contactShadowPose } from "./scene-ball";
import {
  NEAR_BLADE_BUDGET,
  NEAR_ROUGH_SHARE,
  NEAR_TURF_FULL_CAM,
  NEAR_TURF_HIDE_CAM,
  NEAR_TURF_RADIUS,
  nearBladeBudget,
  nearBladeKeep,
  nearBladeMetrics,
  nearBladeOffset,
  nearTurfLod,
  scuffOpacity,
  scuffSpec,
} from "./near-turf";

describe("near-ball turf", () => {
  it("stays rich at address distance and drops out with the broadcast camera", () => {
    expect(NEAR_TURF_RADIUS).toBeGreaterThanOrEqual(15);
    expect(NEAR_TURF_RADIUS).toBeLessThanOrEqual(25);
    expect(NEAR_TURF_FULL_CAM).toBeLessThan(NEAR_TURF_HIDE_CAM);
    const address = nearTurfLod(4);
    expect(address.visible).toBe(true);
    expect(address.density).toBe(1);
    expect(address.detail).toBe(1);
    const mid = nearTurfLod((NEAR_TURF_FULL_CAM + NEAR_TURF_HIDE_CAM) * 0.5);
    expect(mid.visible).toBe(true);
    expect(mid.density).toBeLessThan(address.density);
    expect(mid.detail).toBeLessThan(1);
    expect(nearTurfLod(NEAR_TURF_HIDE_CAM + 2).visible).toBe(false);
  });

  it("packs blades around the ball and keeps rough as a minority", () => {
    const n = 2400;
    const dists: number[] = [];
    let within6 = 0;
    for (let i = 0; i < n; i++) {
      const sample = nearBladeOffset(i);
      expect(sample.dist).toBeLessThanOrEqual(NEAR_TURF_RADIUS + 1e-6);
      expect(Math.hypot(sample.x, sample.z)).toBeCloseTo(sample.dist, 5);
      dists.push(sample.dist);
      if (sample.dist <= 6) within6 += 1;
    }
    dists.sort((a, b) => a - b);
    expect(within6 / n).toBeGreaterThan(0.25);
    expect(dists[n / 2]).toBeLessThan(NEAR_TURF_RADIUS * 0.62);
    expect(nearBladeBudget(true)).toBeLessThan(nearBladeBudget(false));
    expect(nearBladeBudget(false)).toBe(NEAR_BLADE_BUDGET);
    expect(NEAR_BLADE_BUDGET).toBeLessThan(8000);
    expect(NEAR_ROUGH_SHARE).toBeLessThan(0.6);
  });

  it("grows a short green nap and a taller rough", () => {
    const green = nearBladeMetrics("green");
    const fairway = nearBladeMetrics("fairway");
    const rough = nearBladeMetrics("rough");
    expect(green && fairway && rough).toBeTruthy();
    expect(green!.height).toBeLessThan(fairway!.height);
    expect(fairway!.height).toBeLessThan(rough!.height);
    expect(nearBladeMetrics("bunker")).toBeNull();
    expect(nearBladeMetrics("water")).toBeNull();
    expect(nearBladeKeep("green", 0.1)).toBe(true);
    expect(nearBladeKeep("rough", 0.2)).toBe(false);
    expect(nearBladeKeep("rough", 0.8)).toBe(true);
    expect(nearBladeKeep("bunker", 0.9)).toBe(false);
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
