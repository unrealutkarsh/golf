import { describe, expect, it } from "vitest";
import { clubById, clubIndex } from "./clubs";
import { HARBOR_DUNES, lieAt } from "./course";
import { GameSession } from "./game";
import { dist } from "./math";
import { launchBall, SIM_DT, stepBall } from "./physics";
import { flightCamPose, groundHeight, landingCamSpot, shotCamStage, type FlightCamPose } from "./terrain";

function teeShot(seed: number, meter = 0.5) {
  const game = new GameSession(seed);
  game.startTournament();
  game.audio.muted = true;
  game.wind = { speed: 9, dir: 1.1 };
  game.clubIndex = clubIndex("driver");
  game.power = 0.9;
  game.swingPhase = "accuracy";
  game.meter = meter;
  game.tap();
  return game;
}

describe("shot feel", () => {
  it("lands the live ball exactly where the launch simulation said, even with uneven frame times", () => {
    const game = teeShot(31);
    const promised = game.landingPos!;
    expect(promised).not.toBeNull();
    let touchdown: { x: number; y: number } | null = null;
    const frames = [1 / 144, 1 / 30, 1 / 60, 0.033, 1 / 90];
    for (let i = 0; i < 2400 && game.swingPhase === "flight"; i++) {
      game.update(frames[i % frames.length]);
      if (!touchdown && game.shotCarry !== null) touchdown = { ...game.ball.pos };
    }
    expect(touchdown).not.toBeNull();
    // Touchdown is detected one fixed step after the preview's last airborne sample.
    expect(dist(touchdown!, promised)).toBeLessThan(2);
  });

  it("freezes the ball for a beat on contact, then shakes the camera", () => {
    const game = teeShot(32);
    expect(game.hitStop).toBeGreaterThan(0.05);
    expect(game.impact).toBeGreaterThan(0.5);
    const start = { ...game.ball.pos };
    game.update(1 / 60);
    expect(game.ball.pos).toEqual(start);
    for (let i = 0; i < 12; i++) game.update(1 / 60);
    expect(dist(game.ball.pos, start)).toBeGreaterThan(1);
    for (let i = 0; i < 40; i++) game.update(1 / 60);
    expect(game.impact).toBe(0);
  });

  it("calls out a pure strike, then carry and roll when the ball stops", () => {
    const game = teeShot(33, 0.5);
    expect(game.strike).toBe("perfect");
    expect(game.callout?.title).toBe("Pure strike");
    for (let i = 0; i < 1200 && game.swingPhase === "flight"; i++) game.update(1 / 60);
    expect(game.swingPhase).toBe("settle");
    expect(game.shotCarry).toBeGreaterThan(150);
    expect(game.callout?.tone).toBe("info");
    expect(game.callout?.detail).toMatch(/^Carry \d+ · Roll \d+ · \d+ to pin$/);
    const rest = { ...game.ball.pos };
    for (let i = 0; i < 60; i++) game.update(1 / 60);
    expect(game.swingPhase).toBe("settle");
    expect(game.ball.pos).toEqual(rest);
    for (let i = 0; i < 30; i++) game.update(1 / 60);
    expect(game.swingPhase).toBe("aim");
  });

  it("flags a mishit when the accuracy marker is stopped at the edge", () => {
    const game = teeShot(34, 0.98);
    expect(game.strike).toBe("miss");
    expect(game.callout?.tone).toBe("miss");
  });

  it("sequences the shot camera: launch, chase, then a landing cut before touchdown", () => {
    expect(shotCamStage(0.2, 5.5, false)).toBe("launch");
    expect(shotCamStage(2.5, 5.5, false)).toBe("chase");
    expect(shotCamStage(4.1, 5.5, false)).toBe("landing");
    expect(shotCamStage(5.8, 5.5, true)).toBe("landing");
    // Short chips never cut away.
    expect(shotCamStage(1.2, 1.6, true)).toBe("chase");
  });

  it("parks the landing camera clear of trees and out of bounds", () => {
    const game = new GameSession(35);
    for (const hole of game.course.holes) {
      const heading = Math.atan2(hole.pin.y - hole.tee.y, hole.pin.x - hole.tee.x);
      const landing = { x: hole.tee.x + Math.cos(heading) * 180, y: hole.tee.y + Math.sin(heading) * 180 };
      const spot = landingCamSpot(hole, landing, heading);
      expect(lieAt(hole, spot), `hole ${hole.number}`).not.toBe("ob");
      for (const tree of hole.trees) expect(dist(spot, tree), `hole ${hole.number}`).toBeGreaterThan(tree.r);
    }
  });

  it("keeps the landing camera on short grass for an approach into the green", () => {
    const game = new GameSession(37);
    for (const hole of game.course.holes) {
      const from = hole.tee;
      const land = { x: hole.green.cx, y: hole.green.cy };
      const heading = Math.atan2(land.y - from.y, land.x - from.x);
      const spot = landingCamSpot(hole, land, heading, 2);
      const lie = lieAt(hole, spot);
      expect(["green", "fairway", "rough"], `hole ${hole.number} got ${lie}`).toContain(lie);
    }
  });

  it("plays a driver back in a few seconds instead of hanging through a long flight", () => {
    const game = teeShot(38);
    expect(game.timeScale()).toBeGreaterThan(1.7);
    let frames = 0;
    let airFrames = 0;
    while (game.swingPhase !== "aim" && frames < 900) {
      game.update(1 / 60);
      frames++;
      if (game.ball.z > 0.45) airFrames++;
    }
    expect(game.swingPhase).toBe("aim");
    expect(airFrames / 60).toBeLessThan(3.6);
    expect(airFrames / 60).toBeGreaterThan(1.6);
    expect(frames / 60).toBeLessThan(7.5);
  });

  it("keeps the flight camera on the turf, with the ball and the fairway ahead in frame", () => {
    const hole = HARBOR_DUNES.holes[0];
    const from = hole.tee;
    const club = clubById("driver");
    const aim = Math.atan2(hole.pin.y - from.y, hole.pin.x - from.x);
    let ball = launchBall(from, { aim, power: 1, accuracy: 0, club, lie: "tee", wind: { speed: 7, dir: 0 } });
    const landing = { x: from.x + Math.cos(aim) * 230, y: from.y + Math.sin(aim) * 230 };
    const spot = landingCamSpot(hole, landing, aim, 12);
    let sawAir = false;
    for (let i = 0; i < 500; i++) {
      const step = stepBall(ball, hole, { speed: 7, dir: 0 }, SIM_DT, club.bounce);
      ball = step.ball;
      if (ball.z < 4 && i > 10 && !sawAir) continue;
      if (ball.z > 4) sawAir = true;
      if (!step.flying) break;
      const stage = i < 18 ? "launch" : ball.z > 2 ? "chase" : "landing";
      if (i % 12 !== 0) continue;
      const heading = Math.hypot(ball.vel.x, ball.vel.y) > 0.4 ? Math.atan2(ball.vel.y, ball.vel.x) : aim;
      const pose = flightCamPose(hole, ball.pos, ball.z, stage === "launch" ? aim : heading, stage, stage === "landing" ? spot : from);
      const ground = groundHeight(hole, pose.x, pose.z);
      expect(pose.y, `clearance at t=${i}`).toBeGreaterThan(ground + 3.2);
      expect(seesTurf(pose), `turf at t=${i} z=${ball.z.toFixed(1)} stage=${stage}`).toBe(true);
      const bh = groundHeight(hole, ball.pos.x, ball.pos.y) + ball.z;
      const ballAngle = viewAngle(pose, ball.pos.x, bh + 0.2, ball.pos.y);
      expect(ballAngle, `ball in frame at t=${i}`).toBeLessThan(pose.fov * 0.5 - 1);
      if (stage !== "landing") {
        const ahead = { x: ball.pos.x + Math.cos(heading) * 55, y: ball.pos.y + Math.sin(heading) * 55 };
        const fairway = viewAngle(pose, ahead.x, groundHeight(hole, ahead.x, ahead.y) + 0.4, ahead.y);
        expect(fairway, `fairway ahead at t=${i} stage=${stage}`).toBeLessThan(pose.fov * 0.5);
      }
    }
    expect(sawAir).toBe(true);
  });

  it("slows time while an approach rolls out near the cup", () => {
    const game = new GameSession(36);
    game.startTournament();
    const pin = game.hole().pin;
    game.clubIndex = clubIndex("pw");
    game.ball = { ...game.ball, pos: { x: pin.x - 3, y: pin.y }, vel: { x: 4, y: 0 }, z: 0 };
    expect(game.timeScale()).toBeLessThan(1);
    game.ball = { ...game.ball, pos: { x: pin.x - 30, y: pin.y } };
    expect(game.timeScale()).toBe(1);
    expect(SIM_DT).toBeCloseTo(1 / 60, 10);
  });
});

/** Lower portion of the lens hits the ground nearby, instead of the skybox under a horizon sliver. */
function seesTurf(pose: FlightCamPose): boolean {
  const dx = pose.lookX - pose.x;
  const dy = pose.lookY - pose.y;
  const dz = pose.lookZ - pose.z;
  const lookPitch = Math.atan2(dy, Math.hypot(dx, dz));
  const pitch = lookPitch - ((pose.fov * Math.PI) / 180) * 0.38;
  if (pitch > -0.12) return false;
  const hit = Math.max(0, pose.y) / Math.tan(-pitch);
  return hit < 48;
}

function viewAngle(pose: FlightCamPose, x: number, y: number, z: number): number {
  const lx = pose.lookX - pose.x;
  const ly = pose.lookY - pose.y;
  const lz = pose.lookZ - pose.z;
  const bx = x - pose.x;
  const by = y - pose.y;
  const bz = z - pose.z;
  const ln = Math.hypot(lx, ly, lz) || 1;
  const bn = Math.hypot(bx, by, bz) || 1;
  const dot = (lx * bx + ly * by + lz * bz) / (ln * bn);
  return (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
}
