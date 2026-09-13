import { describe, expect, it } from "vitest";
import {
  buildAddressGolfer,
  countBones,
  countMeshes,
  golferAddressMetrics,
  golferBoneCount,
  golferHeight,
  golferMeshCount,
  poseGolferClub,
} from "./golfer";

describe("address golfer", () => {
  it("builds a human-scale figure with a grounded club", () => {
    const golfer = buildAddressGolfer();
    expect(countMeshes(golfer)).toBeGreaterThanOrEqual(40);
    expect(golferMeshCount()).toBeGreaterThanOrEqual(40);
    expect(countBones(golfer)).toBeGreaterThanOrEqual(12);
    expect(golferBoneCount()).toBeGreaterThanOrEqual(12);
    expect(golfer.getObjectByName("head")).toBeTruthy();
    expect(golfer.getObjectByName("clubhead")).toBeTruthy();
    expect(golfer.getObjectByName("left-hand")).toBeTruthy();
    expect(golfer.getObjectByName("right-hand")).toBeTruthy();
    const height = golferHeight(golfer);
    expect(height).toBeGreaterThan(1.5);
    expect(height).toBeLessThan(2.0);
    const m = golferAddressMetrics(golfer);
    expect(m.clubheadY).toBeLessThan(0.12);
    expect(m.handGap).toBeLessThan(0.12);
    expect(m.stanceWidth).toBeGreaterThan(0.28);
    expect(m.stanceWidth).toBeLessThan(0.7);
  });

  it("swaps putter and wood heads", () => {
    const golfer = buildAddressGolfer();
    poseGolferClub(golfer, "putter");
    expect(golfer.getObjectByName("putter-head")?.visible).toBe(true);
    poseGolferClub(golfer, "driver");
    expect(golfer.getObjectByName("putter-head")?.visible).toBe(false);
    expect(golfer.getObjectByName("wood-head")?.visible).toBe(true);
  });
});
