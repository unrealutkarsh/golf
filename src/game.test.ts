import { describe, expect, it } from "vitest";
import { GameSession } from "./game";
import { toPar, totalStrokes } from "./scoring";

describe("tour session", () => {
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

  it("records a live hole finish", () => {
    const game = new GameSession(2);
    game.startTournament();
    game.completeHoleForTest(3);
    expect(game.screen).toBe("holeEnd");
    expect(game.results[0]?.strokes).toBe(3);
    expect(game.results[0]?.par).toBe(4);
  });
});
