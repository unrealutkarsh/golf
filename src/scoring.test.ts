import { describe, expect, it } from "vitest";
import { formatToPar, prizeMoney, scoreName, toPar, totalStrokes } from "./scoring";
import type { HoleResult } from "./types";

function result(hole: number, par: number, strokes: number): HoleResult {
  return { hole, par, strokes, putts: 2, fairwayHit: true, gir: true, penalties: 0 };
}

describe("scoring", () => {
  it("names common scores", () => {
    expect(scoreName(3, 4)).toBe("Birdie");
    expect(scoreName(4, 4)).toBe("Par");
    expect(scoreName(5, 4)).toBe("Bogey");
    expect(scoreName(2, 4)).toBe("Eagle");
    expect(scoreName(1, 3)).toBe("Ace");
  });

  it("formats to-par and totals", () => {
    const results = [result(1, 4, 3), result(2, 3, 3), result(3, 5, 6)];
    expect(totalStrokes(results)).toBe(12);
    expect(toPar(results)).toBe(0);
    expect(formatToPar(0)).toBe("E");
    expect(formatToPar(-3)).toBe("-3");
    expect(formatToPar(2)).toBe("+2");
  });

  it("pays a purse slice for a solid round", () => {
    expect(prizeMoney(-4, 1_800_000)).toBeGreaterThan(100000);
    expect(prizeMoney(12, 1_800_000)).toBeLessThan(prizeMoney(-4, 1_800_000));
  });
});
