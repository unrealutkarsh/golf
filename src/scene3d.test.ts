import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { golferMeshCount as addressGolferMeshCount } from "./golfer";
import { dimpleIndent, golferMeshCount, makeGolfBallGeometry } from "./scene3d";

const srcDir = dirname(fileURLToPath(import.meta.url));
const readSrc = (name: string) => readFileSync(resolve(srcDir, name), "utf8");

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

  it("builds a multi-part golfer instead of a three-mesh stick figure", () => {
    expect(golferMeshCount()).toBeGreaterThanOrEqual(12);
    expect(golferMeshCount()).toBe(addressGolferMeshCount());
  });
});

describe("merge leftovers", () => {
  it("keeps a single applyGreenGrip and a complete Ball launch", () => {
    const physics = readSrc("physics.ts");
    expect(physics.match(/export function applyGreenGrip/g)).toHaveLength(1);
    expect(physics).toMatch(/spinning: speed, curve: 0, lipped: false/);
  });

  it("does not keep the dead instanced-grass updater or a dummy cylinder golfer", () => {
    const scene = readSrc("scene3d.ts");
    expect(scene).not.toMatch(/updateGrass\s*\(/);
    expect(scene).not.toMatch(/this\.blades/);
    expect(scene).not.toMatch(/BLADE_COUNT/);
    expect(scene).not.toMatch(/this\.bladeGeo/);
    expect(scene.match(/type ResolvedCam/g)).toHaveLength(1);
    expect(scene).not.toMatch(/new THREE\.CylinderGeometry\([^)]+\),\s*m\.(skin|shirt|pants)/);
    expect(scene).not.toMatch(/buildDummyGolfer|dummyGolfer|stick figure/i);
  });

  it("exports leftover-relative putt constants used by the session", () => {
    const terrain = readSrc("terrain.ts");
    expect(terrain).toMatch(/export const PUTT_ROLL_YARDS = 42/);
    expect(terrain).toMatch(/export const PUTT_HOLE_FILL = 0\.5/);
  });
});
