import { describe, expect, it } from "vitest";
import {
  LEAF_CARDS_PER_TREE,
  MID_RANGE_CARDS_PER_TREE,
  OAK_CANOPY_BLOBS,
  PINE_CANOPY_LAYERS,
  SPRAY_CARDS_PER_TREE,
  treeKind,
  volumeTreeMeshCount,
} from "./foliage";

describe("volume foliage", () => {
  it("uses layered canopy volumes instead of a four-card silhouette", () => {
    expect(PINE_CANOPY_LAYERS).toBeGreaterThanOrEqual(6);
    expect(OAK_CANOPY_BLOBS).toBeGreaterThanOrEqual(8);
    expect(LEAF_CARDS_PER_TREE).toBeGreaterThanOrEqual(8);
    expect(SPRAY_CARDS_PER_TREE).toBeGreaterThanOrEqual(6);
    expect(MID_RANGE_CARDS_PER_TREE).toBeGreaterThanOrEqual(6);
    expect(volumeTreeMeshCount("pine")).toBeGreaterThanOrEqual(9);
    expect(volumeTreeMeshCount("oak")).toBeGreaterThanOrEqual(12);
  });

  it("picks pine and oak from position", () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 40; i++) kinds.add(treeKind(i * 7.3, i * 4.1));
    expect(kinds.has("pine")).toBe(true);
    expect(kinds.has("oak")).toBe(true);
    expect(kinds.has("maple")).toBe(true);
  });
});
