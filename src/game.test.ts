import { describe, expect, it } from "vitest";
import { clubById, clubIndex, recommendClub, suggestedShotPower } from "./clubs";
import { GameSession } from "./game";
import { createBall } from "./physics";
import { scaledPuttPower } from "./terrain";
import { toPar, totalStrokes } from "./scoring";

describe("tour session", () => {
  it("picks a club and swing fill that match leftover yards", () => {
    expect(recommendClub(270, "tee").id).toBe("driver");
    expect(recommendClub(230, "tee").id).toBe("wood3");
    expect(recommendClub(155, "fairway").id).toBe("iron7");
    expect(recommendClub(20, "fairway").id).toBe("putter");
    const pw = clubById("pw");
    const fill = suggestedShotPower(80, pw, "fairway");
    expect(fill).toBeGreaterThan(0.55);
    expect(fill).toBeLessThan(0.85);
    expect(suggestedShotPower(110, pw, "fairway")).toBeGreaterThan(0.85);
  });

  it("can sign a complete nine-hole card", () => {
    const game = new GameSession(1);
    game.startTournament();
    expect(game.screen).toBe("play");
    expect(game.course.holes).toHaveLength(9);
    game.playThroughForTest();
    expect(game.screen).toBe("roundEnd");
    expect(game.results).toHaveLength(9);
    expect(totalStrokes(game.results)).toBe(36);
    expect(toPar(game.results)).toBe(0);
    expect(game.lastMoney).toBeGreaterThan(0);
    expect(game.profile.eventsPlayed).toBeGreaterThan(0);
  });

  it("stores a lofted shot arc when the ball is struck", () => {
    const game = new GameSession(3);
    game.startTournament();
    game.power = 1;
    game.accuracy = 0;
    game.swingPhase = "accuracy";
    game.meter = 0.5;
    game.tap();
    expect(game.swingPhase).toBe("flight");
    expect(game.shotArc.length).toBeGreaterThan(8);
    expect(Math.max(...game.shotArc.map((s) => s.z))).toBeGreaterThan(10);
  });

  it("records a live hole finish", () => {
    const game = new GameSession(2);
    game.startTournament();
    game.completeHoleForTest(3);
    expect(game.screen).toBe("holeEnd");
    expect(game.results[0]?.strokes).toBe(3);
    expect(game.results[0]?.par).toBe(4);
  });

  it("returns to aim after a missed putt on the green", () => {
    const game = new GameSession(4);
    game.startTournament();
    const hole = game.hole();
    game.ball = createBall({ x: hole.pin.x - 8.2, y: hole.pin.y + 3.4 });
    game.lie = "green";
    game.clubIndex = clubIndex("putter");
    game.aim = Math.atan2(hole.pin.y - game.ball.pos.y, hole.pin.x - game.ball.pos.x) + 0.75;
    game.power = 0.3;
    game.accuracy = 0;
    game.swingPhase = "accuracy";
    game.meter = 0.5;
    game.tap();
    expect(game.swingPhase).toBe("flight");
    for (let i = 0; i < 480; i++) game.update(1 / 60);
    expect(game.screen).toBe("play");
    expect(game.swingPhase).toBe("aim");
    expect(game.club().id).toBe("putter");
    expect(game.putting()).toBe(true);
  });

  it("lets the player set draw or fade except on the green", () => {
    const game = new GameSession(6);
    game.startTournament();
    expect(game.canShape()).toBe(true);
    game.setShape(1);
    expect(game.shape).toBe(1);
    game.setShape(-1);
    expect(game.shape).toBe(-1);
    const hole = game.hole();
    game.ball = createBall({ x: hole.pin.x - 4, y: hole.pin.y });
    game.lie = "green";
    game.clubIndex = clubIndex("putter");
    game.setShape(1);
    expect(game.shape).toBe(0);
    expect(game.canShape()).toBe(false);
  });

  it("labels the lie Green as soon as the ball is on the putting surface", () => {
    const game = new GameSession(8);
    game.startTournament();
    expect(game.lie).toBe("tee");
    const hole = game.hole();
    game.ball.pos = { x: hole.green.cx, y: hole.green.cy };
    game.ball.z = 0;
    game.update(1 / 60);
    expect(game.lie).toBe("green");
    expect(game.putting()).toBe(true);
  });

  it("holes a mid-meter tap-in instead of blasting through the cup", () => {
    const game = new GameSession(9);
    game.startTournament();
    const hole = game.hole();
    game.ball = createBall({ x: hole.pin.x - 1.15, y: hole.pin.y });
    game.lie = "green";
    game.clubIndex = clubIndex("putter");
    game.aim = Math.atan2(hole.pin.y - game.ball.pos.y, hole.pin.x - game.ball.pos.x);
    game.swingPhase = "power";
    game.meter = 0.55;
    game.tap();
    game.meter = 0.5;
    game.tap();
    for (let i = 0; i < 300; i++) game.update(1 / 60);
    expect(game.screen).toBe("holeEnd");
  });

  it("holes a tap-in from the putting view", () => {
    const game = new GameSession(5);
    game.startTournament();
    const hole = game.hole();
    game.ball = createBall({ x: hole.pin.x - 0.7, y: hole.pin.y });
    game.lie = "green";
    game.clubIndex = clubIndex("putter");
    game.aim = Math.atan2(hole.pin.y - game.ball.pos.y, hole.pin.x - game.ball.pos.x);
    game.power = scaledPuttPower(0.55, 0.7);
    game.accuracy = 0;
    game.swingPhase = "accuracy";
    game.meter = 0.5;
    game.tap();
    for (let i = 0; i < 240; i++) game.update(1 / 60);
    expect(game.screen).toBe("holeEnd");
    expect(game.results[0]?.putts).toBeGreaterThanOrEqual(1);
  });
});

