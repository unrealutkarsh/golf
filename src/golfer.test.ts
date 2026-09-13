import { describe, expect, it } from "vitest";
import { buildAddressGolfer, countMeshes, golferHeight, golferMeshCount, poseGolferClub } from "./golfer";

describe("address golfer", () => {
  it("builds a human-scale figure with a grounded club", () => {
    const golfer = buildAddressGolfer();
    expect(countMeshes(golfer)).toBeGreaterThanOrEqual(28);
    expect(golferMeshCount()).toBeGreaterThanOrEqual(28);
    expect(golfer.getObjectByName("head")).toBeTruthy();
    expect(golfer.getObjectByName("clubhead")).toBeTruthy();
    const height = golferHeight(golfer);
    expect(height).toBeGreaterThan(1.45);
    expect(height).toBeLessThan(2.1);
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
