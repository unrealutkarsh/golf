import { describe, expect, it } from "vitest";
import { dimpleIndent, makeGolfBallGeometry } from "./scene3d";

describe("golf ball dimples", () => {
  it("indents vertices that sit on a dimple center", () => {
    const centers = [{ x: 0, y: 1, z: 0 }];
    expect(dimpleIndent(0, 1, 0, centers)).toBeGreaterThan(0.9);
    expect(dimpleIndent(1, 0, 0, centers)).toBe(0);
  });

  it("dents the mesh so the ball is not a smooth sphere", () => {
    const radius = 0.16;
    const geo = makeGolfBallGeometry(radius);
    const pos = geo.attributes.position;
    let minR = Infinity;
    let maxR = 0;
    let dented = 0;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
      if (r < radius * 0.99) dented += 1;
    }
    expect(maxR).toBeGreaterThan(radius * 0.99);
    expect(maxR).toBeLessThan(radius * 1.01);
    expect(minR).toBeLessThan(radius * 0.96);
    expect(dented).toBeGreaterThan(pos.count * 0.2);
    expect(dented).toBeLessThan(pos.count * 0.85);
    expect(geo.getAttribute("color")).toBeTruthy();
    geo.dispose();
  });
});
