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
    expect(suggestedShotPower(1, clubById("putter"), "green")).toBeCloseTo(0.5, 2);
    expect(suggestedShotPower(12, clubById("putter"), "green")).toBeCloseTo(0.5, 2);
  });

  it("ignores a click next to the ball so a swing tap cannot aim off the hole", () => {
    const game = new GameSession(2026);
    game.startTournament();
    const pinAim = game.aim;
    game.aimAt({ x: game.ball.pos.x + 3, y: game.ball.pos.y + 2 });
    expect(game.aim).toBeCloseTo(pinAim, 5);
    expect(game.aimExplicit).toBe(false);
    game.aim = pinAim + 1.2;
    game.power = game.suggestedPower();
    game.accuracy = 0;
    game.swingPhase = "accuracy";
    game.meter = 0.5;
    game.tap();
    expect(game.aim).toBeCloseTo(pinAim, 5);
    for (let i = 0; i < 900; i++) game.update(1 / 60);
    expect(game.screen).toBe("play");
    expect(game.penalties).toBe(0);
    expect(game.lie === "fairway" || game.lie === "rough" || game.lie === "green").toBe(true);
    const travel = Math.hypot(game.ball.pos.x - game.hole().tee.x, game.ball.pos.y - game.hole().tee.y);
    expect(travel).toBeGreaterThan(200);
    expect(travel).toBeLessThan(310);
  });

  it("holes a 1-yard and a 2-yard mid-meter putt instead of running past", () => {
    const playPutt = (offset: number) => {
      const game = new GameSession(9);
      game.startTournament();
      const hole = game.hole();
      game.ball = createBall({ x: hole.pin.x - offset, y: hole.pin.y });
      game.lie = "green";
      game.clubIndex = clubIndex("putter");
      game.aim = Math.atan2(hole.pin.y - game.ball.pos.y, hole.pin.x - game.ball.pos.x);
      game.aimExplicit = false;
      game.aimAt({ x: game.ball.pos.x + 0.4, y: game.ball.pos.y + 0.8 });
      expect(game.aimExplicit).toBe(false);
      game.swingPhase = "power";
      game.meter = 0.5;
      game.tap();
      game.meter = 0.5;
      game.tap();
      for (let i = 0; i < 360; i++) game.update(1 / 60);
      return game;
    };
    const one = playPutt(1);
    expect(one.screen).toBe("holeEnd");
    expect(one.results[0]?.putts).toBeGreaterThanOrEqual(1);
    const two = playPutt(2);
    expect(two.screen).toBe("holeEnd");
  });

  it("shows leftover-relative putt fill and numeric yardage", () => {
    const game = new GameSession(9);
    game.startTournament();
    const hole = game.hole();
    game.ball = createBall({ x: hole.pin.x - 1.15, y: hole.pin.y });
    game.lie = "green";
    game.clubIndex = clubIndex("putter");
    expect(game.meterFill()).toBeCloseTo(0.5, 2);
    expect(game.meterPercent()).toBe(50);
    expect(game.meterYards()).toBeGreaterThan(0.8);
    expect(game.meterYards()).toBeLessThan(1.6);
    game.startTournament();
    expect(game.meterPercent()).toBeGreaterThan(80);
    expect(game.meterYards()).toBeGreaterThan(200);
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
    game.aimExplicit = true;
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

  it("previews a leftover-relative putt instead of a full-meter smash", () => {
    const game = new GameSession(11);
    game.startTournament();
    const hole = game.hole();
    game.ball = createBall({ x: hole.pin.x - 6, y: hole.pin.y });
    game.lie = "green";
    game.clubIndex = clubIndex("putter");
    game.swingPhase = "aim";
    const preview = game.previewFlight();
    const travel = Math.hypot(preview[preview.length - 1].pos.x - game.ball.pos.x, preview[preview.length - 1].pos.y - game.ball.pos.y);
    expect(travel).toBeGreaterThan(3);
    expect(travel).toBeLessThan(10);
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

  it("eases preview power so the aim line does not snap with the meter", () => {
    const game = new GameSession(7);
    game.startTournament();
    game.clubIndex = clubIndex("putter");
    game.visualPower = 0.3;
    game.swingPhase = "power";
    game.meter = 0.9;
    game.update(1 / 60);
    expect(game.visualPower).toBeGreaterThan(0.3);
    expect(game.visualPower).toBeLessThan(0.85);
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

