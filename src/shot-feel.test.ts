import { describe, expect, it } from "vitest";
import { clubIndex } from "./clubs";
import { lieAt } from "./course";
import { GameSession } from "./game";
import { dist } from "./math";
import { SIM_DT } from "./physics";
import { landingCamSpot, shotCamStage } from "./terrain";

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
