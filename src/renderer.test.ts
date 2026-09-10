import { describe, expect, it } from "vitest";
import { airborneOffset, airbornePos } from "./renderer";

describe("2.5D ball lift", () => {
  it("raises the drawn ball above its ground shadow", () => {
    const ground = { x: 100, y: 80 };
    const low = airbornePos(ground, 2);
    const high = airbornePos(ground, 16);
    expect(airborneOffset(16).y).toBeLessThan(airborneOffset(2).y);
    expect(high.y).toBeLessThan(low.y);
    expect(high.y).toBeLessThan(ground.y - 28);
    expect(low.x).toBeGreaterThan(ground.x);
  });
});
