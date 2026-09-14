import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import physicsSrc from "./physics.ts?raw";
import { AIM_RIBBON_SEGS, aimRibbonHalfWidth, dimpleIndent, makeGolfBallGeometry } from "./scene3d";
import cameraSrc from "./scene-camera.ts?raw";
import sceneSrc from "./scene3d.ts?raw";
import terrainSrc from "./terrain.ts?raw";

const srcDir = dirname(fileURLToPath(import.meta.url));

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

describe("merge leftovers", () => {
  it("keeps a single applyGreenGrip and a complete Ball launch", () => {
    expect(physicsSrc.match(/export function applyGreenGrip/g)).toHaveLength(1);
    expect(physicsSrc).toMatch(/spinning: speed, curve: 0, lipped: false/);
  });

  it("does not keep the dead instanced-grass updater or a dummy cylinder golfer", () => {
    expect(sceneSrc).not.toMatch(/updateGrass\s*\(/);
    expect(sceneSrc).not.toMatch(/this\.blades/);
    expect(sceneSrc).not.toMatch(/BLADE_COUNT/);
    expect(sceneSrc).not.toMatch(/this\.bladeGeo/);
    expect(sceneSrc.match(/type ResolvedCam/g)).toHaveLength(1);
    expect(sceneSrc).not.toMatch(/new THREE\.CylinderGeometry\([^)]+\),\s*m\.(skin|shirt|pants)/);
    expect(sceneSrc).not.toMatch(/buildDummyGolfer|dummyGolfer|stick figure/i);
    expect(sceneSrc).not.toMatch(/\bbuildGolfer\s*\(/);
    expect(sceneSrc).not.toMatch(/\bplaceGolfer\s*\(/);
    expect(sceneSrc).not.toMatch(/private golfer\s*=/);
    expect(sceneSrc).not.toMatch(/this\.golfer/);
    expect(sceneSrc).not.toMatch(/buildAddressGolfer\s*\(/);
    expect(sceneSrc).not.toMatch(/golferMeshCount/);
    expect(sceneSrc).not.toMatch(/from ["']\.\/golfer["']/);
    expect(existsSync(resolve(srcDir, "golfer.ts"))).toBe(false);
  });

  it("exports leftover-relative putt constants used by the session", () => {
    expect(terrainSrc).toMatch(/export const PUTT_ROLL_YARDS = 42/);
    expect(terrainSrc).toMatch(/export const PUTT_HOLE_FILL = 0\.5/);
  });
});

describe("aim ribbon", () => {
  it("keeps a fixed cream strip instead of rebuilding a tube while aiming", () => {
    expect(sceneSrc).toMatch(/writeAimRibbon/);
    expect(sceneSrc).toMatch(/aimRibbonGeo/);
    expect(sceneSrc).not.toMatch(/flightMat\.color\.set\(shape/);
    expect(sceneSrc).not.toMatch(/warn \? 0xc62828 : 0xf0d78a/);
    expect(sceneSrc).toMatch(/onPutt/);
    expect(sceneSrc).toMatch(/updateSceneCamera/);
    expect(cameraSrc).toMatch(/playCamFraming/);
    expect(cameraSrc).toMatch(/cameraHeightAboveGround/);
    expect(AIM_RIBBON_SEGS).toBeGreaterThanOrEqual(32);
    expect(aimRibbonHalfWidth(false, 0)).toBeGreaterThan(aimRibbonHalfWidth(false, 1));
    expect(aimRibbonHalfWidth(true, 0.5)).toBeLessThan(aimRibbonHalfWidth(false, 0.5));
  });
});
