import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clubById, clubIndex } from "./clubs";
import { HARBOR_DUNES, lieAt } from "./course";
import { GameSession } from "./game";
import { dist } from "./math";
import { applyGreenGrip, createBall, launchBall, sampleFlightPath, stepBall } from "./physics";
import { formatToPar, scoreName, toPar, totalStrokes } from "./scoring";
import { ballRollAxis, ballRollRadians } from "./scene3d";
import { camFraming, camLabel, resolveCamView, suggestedPuttPower } from "./terrain";

const srcDir = dirname(fileURLToPath(import.meta.url));
const readSrc = (name: string) => readFileSync(resolve(srcDir, name), "utf8");

function previewTravel(game: GameSession): number {
  const path = game.previewFlight();
  const last = path[path.length - 1];
  return Math.hypot(last.pos.x - game.ball.pos.x, last.pos.y - game.ball.pos.y);
}

function settlePutt(from: { x: number; y: number }, power: number) {
  const hole = HARBOR_DUNES.holes[0];
  const wind = { speed: 0, dir: 0 };
  const club = clubById("putter");
  let ball = launchBall(from, {
    aim: Math.atan2(hole.pin.y - from.y, hole.pin.x - from.x),
    power,
    accuracy: 0,
    club,
    lie: "green",
    wind,
  });
  let holed = false;
  for (let i = 0; i < 600; i++) {
    const step = stepBall(ball, hole, wind, 1 / 60, club.bounce);
    ball = step.ball;
    if (step.holed) {
      holed = true;
      break;
    }
    if (!step.flying) break;
  }
  return { ball, holed, hole, from };
}

describe("dummy golfer stays gone", () => {
  it("does not define buildGolfer, placeGolfer, or a scene golfer group", () => {
    const sceneFiles = [
      "scene3d.ts",
      "scene-ball.ts",
      "scene-camera.ts",
      "scene-course.ts",
      "scene-lights.ts",
      "scene-sky.ts",
      "scene-water.ts",
      "main.ts",
      "ui.ts",
      "renderer.ts",
    ];
    for (const name of sceneFiles) {
      const scene = readSrc(name);
      expect(scene).not.toMatch(/\bbuildGolfer\b/);
      expect(scene).not.toMatch(/\bplaceGolfer\b/);
      expect(scene).not.toMatch(/private golfer\s*=/);
      expect(scene).not.toMatch(/this\.scene\.add\([^)]*this\.golfer/);
      expect(scene).not.toMatch(/new THREE\.CylinderGeometry\(0\.13,\s*0\.15,\s*0\.82/);
      expect(scene).not.toMatch(/new THREE\.SphereGeometry\(0\.13,\s*10,\s*8\)/);
      expect(scene).not.toMatch(/buildAddressGolfer|snapGolferToBall|poseGolferClub/);
      expect(scene).not.toMatch(/root\.name\s*=\s*"golfer"/);
      expect(scene).not.toMatch(/golferMeshCount/);
    }
    expect(existsSync(resolve(srcDir, "golfer.ts"))).toBe(false);
    expect(existsSync(resolve(srcDir, "golfer.test.ts"))).toBe(false);
  });

  it("does not mention a dummy player mesh in HUD or boot", () => {
    const ui = readSrc("ui.ts");
    const main = readSrc("main.ts");
    expect(ui).not.toMatch(/\bbuildGolfer\b|\bplaceGolfer\b/);
    expect(main).not.toMatch(/\bbuildGolfer\b|\bplaceGolfer\b/);
    expect(ui).toMatch(/no player mesh/);
    expect(ui).toMatch(/over the ball/);
  });

  it("does not frame cameras around dummy clearance", () => {
    const putt = camFraming("putt");
    const address = camFraming("player");
    expect(putt.side).toBeLessThan(0.55);
    expect(address.side).toBeLessThan(0.3);
    expect(camLabel("player")).toBe("address");
  });
});

describe("tour-sim cameras", () => {
  it("uses over-the-ball putt, follow in flight, and address off the green", () => {
    expect(resolveCamView("auto", "aim", true)).toBe("putt");
    expect(resolveCamView("player", "aim", true)).toBe("putt");
    expect(resolveCamView("auto", "flight", false)).toBe("follow");
    expect(resolveCamView("auto", "aim", false)).toBe("player");
    expect(camFraming("follow").lookAhead).toBe(0);
    expect(camFraming("putt").lookAhead).toBeGreaterThan(0.65);
    expect(camFraming("follow").back).toBeGreaterThan(camFraming("player").back);
  });

  it("resolves play cameras from the live session without a dummy frame", () => {
    const game = new GameSession(31);
    game.startTournament();
    game.camMode = "auto";
    expect(game.putting()).toBe(false);
    expect(game.resolvedCam()).toBe("player");
    expect(camLabel(game.resolvedCam())).toBe("address");

    const hole = game.hole();
    game.ball = createBall({ x: hole.pin.x - 6, y: hole.pin.y });
    game.lie = "green";
    game.clubIndex = clubIndex("putter");
    expect(game.putting()).toBe(true);
    expect(game.resolvedCam()).toBe("putt");

    game.startTournament();
    game.power = 1;
    game.accuracy = 0;
    game.swingPhase = "accuracy";
    game.meter = 0.5;
    game.tap();
    expect(game.swingPhase).toBe("flight");
    expect(game.resolvedCam()).toBe("follow");
  });
});

describe("putting grip and roll", () => {
  it("launches putts already rolling", () => {
    const hole = HARBOR_DUNES.holes[0];
    const ball = launchBall({ x: hole.pin.x - 6, y: hole.pin.y }, {
      aim: 0,
      power: 0.28,
      accuracy: 0,
      club: clubById("putter"),
      lie: "green",
      wind: { speed: 0, dir: 0 },
    });
    expect(ball.spinning).toBeGreaterThan(Math.hypot(ball.vel.x, ball.vel.y) * 0.95);
  });

  it("bites a slider harder than a roller", () => {
    const slide = applyGreenGrip({ pos: { x: 0, y: 0 }, vel: { x: 12, y: 0 }, z: 0, vz: 0, spinning: 0, curve: 0, lipped: false }, 1 / 60);
    const roll = applyGreenGrip({ pos: { x: 0, y: 0 }, vel: { x: 12, y: 0 }, z: 0, vz: 0, spinning: 12, curve: 0, lipped: false }, 1 / 60);
    expect(Math.hypot(slide.vel.x, slide.vel.y)).toBeLessThan(Math.hypot(roll.vel.x, roll.vel.y) - 0.4);
  });

  it("dies a suggested lag putt near the hole", () => {
    const from = { x: HARBOR_DUNES.holes[0].pin.x - 10, y: HARBOR_DUNES.holes[0].pin.y };
    const { ball, holed, hole } = settlePutt(from, suggestedPuttPower(10));
    const leftover = dist(ball.pos, hole.pin);
    expect(holed || leftover < 4.2).toBe(true);
    expect(dist(ball.pos, from)).toBeLessThan(14);
    expect(dist(ball.pos, from)).toBeGreaterThan(6);
  });

  it("rotates the 3D ball about the travel-normal axis", () => {
    const axis = ballRollAxis(8, 0);
    expect(axis).toEqual({ x: 0, y: 0, z: -1 });
    const diag = ballRollAxis(3, 4);
    expect(diag).toBeTruthy();
    expect(diag!.x * 3 + diag!.z * 4).toBeCloseTo(0, 8);
    expect(diag!.y).toBe(0);
    expect(ballRollAxis(0, 0)).toBeNull();
    expect(ballRollRadians(8, 1 / 60)).toBeGreaterThan(0.8);
    expect(ballRollRadians(0, 1 / 60)).toBe(0);
  });
});

describe("eased power preview", () => {
  it("does not snap the aim preview to a raw meter tick", () => {
    const game = new GameSession(21);
    game.startTournament();
    const hole = game.hole();
    game.ball = createBall({ x: hole.pin.x - 8, y: hole.pin.y });
    game.lie = "green";
    game.clubIndex = clubIndex("putter");
    game.swingPhase = "power";
    game.visualPower = 0.3;
    game.meter = 0.3;
    game.update(1 / 60);
    const before = previewTravel(game);
    game.meter = 0.95;
    game.update(1 / 60);
    const after = previewTravel(game);
    expect(Math.abs(after - before)).toBeLessThan(4);
    expect(game.visualPower).toBeLessThan(0.7);
  });

  it("keeps the HUD meter live while visualPower lags", () => {
    const game = new GameSession(22);
    game.startTournament();
    game.swingPhase = "power";
    game.meter = 0.88;
    game.visualPower = 0.3;
    game.update(1 / 60);
    expect(game.meter).toBeGreaterThan(0.8);
    expect(game.visualPower).toBeLessThan(game.meter - 0.2);
  });
});

describe("flight still carries", () => {
  it("keeps a full driver in the tour window", () => {
    const hole = HARBOR_DUNES.holes[0];
    const path = sampleFlightPath(hole.tee, {
      aim: Math.atan2(hole.pin.y - hole.tee.y, hole.pin.x - hole.tee.x),
      power: 1,
      accuracy: 0,
      club: clubById("driver"),
      lie: "tee",
      wind: { speed: 0, dir: 0 },
    }, hole, true);
    const last = path[path.length - 1];
    const travel = dist(last.pos, hole.tee);
    expect(travel).toBeGreaterThan(210);
    expect(travel).toBeLessThan(310);
    expect(Math.max(...path.map((s) => s.z))).toBeGreaterThan(10);
  });
});

describe("soft preview line", () => {
  it("keeps the 2D aim stroke faded instead of a gold road", () => {
    const overlays = readSrc("canvas-overlays.ts");
    expect(overlays).toMatch(/rgba\(212, 175, 55, 0\.38\)/);
    expect(overlays).not.toMatch(/rgba\(212, 175, 55, 0\.85\)/);
    expect(overlays).toMatch(/rgba\(230, 212, 160, 0\.55\)/);
  });

  it("keeps the 3D putt tube and pin line faded", () => {
    const scene = readSrc("scene3d.ts");
    expect(scene).toMatch(/LineDashedMaterial/);
    expect(scene).toMatch(/puttingLine \? 0\.28 : 0\.46/);
    expect(scene).toMatch(/putter" \? 0\.02 : 0\.09/);
  });
});

describe("course, lies, and scoring still hold", () => {
  it("keeps Harbor Dunes a par-36 nine with green pins", () => {
    expect(HARBOR_DUNES.holes).toHaveLength(9);
    expect(HARBOR_DUNES.par).toBe(36);
    for (const hole of HARBOR_DUNES.holes) {
      expect(lieAt(hole, hole.pin)).toBe("green");
      expect(["tee", "fairway"]).toContain(lieAt(hole, hole.tee));
    }
  });

  it("still names scores and signs a card", () => {
    expect(scoreName(3, 4)).toBe("Birdie");
    expect(scoreName(1, 3)).toBe("Ace");
    const game = new GameSession(40);
    game.startTournament();
    game.playThroughForTest();
    expect(totalStrokes(game.results)).toBe(36);
    expect(toPar(game.results)).toBe(0);
    expect(formatToPar(0)).toBe("E");
    expect(game.screen).toBe("roundEnd");
  });
});
