import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GameSession } from "./game";
import { playHudHtml } from "./ui";
import { playHudMode, showClubTray, showSwingMeter, windArrowDegrees, yardageReadout } from "./hud";
import { createBall } from "./physics";
import { clubIndex } from "./clubs";

describe("launch monitor readout", () => {
  it("reads putts in feet and full shots in yards to the pin", () => {
    expect(yardageReadout(247.4, false)).toEqual({ value: "247", unit: "YDS", caption: "TO PIN" });
    expect(yardageReadout(8.24, false)).toEqual({ value: "8.2", unit: "YDS", caption: "TO PIN" });
    expect(yardageReadout(7.4, true)).toEqual({ value: "22", unit: "FT", caption: "TO HOLE" });
    expect(yardageReadout(2, true).value).toBe("6.0");
    expect(yardageReadout(2, true).caption).toBe("TO HOLE");
  });

  it("points the wind arrow east at dir 0 and north at a quarter turn the other way", () => {
    expect(windArrowDegrees(0)).toBeCloseTo(90);
    expect(windArrowDegrees(Math.PI / 2)).toBeCloseTo(180);
    expect(windArrowDegrees(Math.PI)).toBeCloseTo(270);
    expect(windArrowDegrees(-Math.PI / 2)).toBeCloseTo(0);
  });

  it("keeps swing chrome and the bag off the calm address view", () => {
    expect(showSwingMeter("aim")).toBe(false);
    expect(showSwingMeter("flight")).toBe(false);
    expect(showSwingMeter("settle")).toBe(false);
    expect(showSwingMeter("power")).toBe(true);
    expect(showSwingMeter("accuracy")).toBe(true);
    expect(showClubTray("aim", "closed")).toBe(false);
    expect(showClubTray("aim", "open")).toBe(true);
    expect(showClubTray("power", "open")).toBe(false);
    expect(playHudMode("aim", "closed")).toBe("address");
    expect(playHudMode("aim", "open")).toBe("bag");
    expect(playHudMode("accuracy", "open")).toBe("swing");
    expect(playHudMode("flight", "closed")).toBe("flight");
  });
});

describe("club bag disclosure", () => {
  it("stays closed at address until the player opens or changes club", () => {
    const game = new GameSession(4);
    game.startTournament();
    game.tipVisible = false;
    expect(game.clubTray).toBe("closed");
    const html = playHudHtml(game);
    expect(html).toContain('data-hud="address"');
    expect(html).toContain("TO PIN");
    expect(html).toContain("lm-yards");
    expect(html).toContain(">Driver<");
    expect(html).not.toContain("lm-bag");
    expect(html).not.toContain("lm-club-btn");
    expect(html).not.toContain("hud-dock");

    game.autoClub();
    expect(game.clubTray).toBe("closed");
  });

  it("flashes the bag on a club change, then tucks it at address", () => {
    const game = new GameSession(5);
    game.startTournament();
    game.tipVisible = false;
    const before = game.clubIndex;
    game.cycleClub(1);
    expect(game.clubIndex).not.toBe(before);
    expect(game.clubTray).toBe("open");
    expect(game.clubTrayLinger).toBeGreaterThan(2);
    expect(playHudHtml(game)).toContain('data-hud="bag"');
    expect(playHudHtml(game)).toContain("lm-club-btn");
    game.update(3);
    expect(game.clubTray).toBe("closed");
    expect(playHudHtml(game)).toContain('data-hud="address"');
  });

  it("pins the bag when opened, and a swing tucks it", () => {
    const game = new GameSession(6);
    game.startTournament();
    game.tipVisible = false;
    game.toggleClubTray();
    game.update(10);
    expect(game.clubTray).toBe("open");
    game.cycleClub(1);
    game.update(10);
    expect(game.clubTray).toBe("open");
    game.tap();
    expect(game.swingPhase).toBe("power");
    expect(game.clubTray).toBe("closed");
    const html = playHudHtml(game);
    expect(html).toContain('data-hud="swing"');
    expect(html).toContain("Set power");
    expect(html).not.toContain("lm-bag");
  });

  it("closes a pinned bag from the same control and from escape's helper", () => {
    const game = new GameSession(7);
    game.startTournament();
    game.toggleClubTray();
    game.toggleClubTray();
    expect(game.clubTray).toBe("closed");
    game.toggleClubTray();
    game.closeClubTray();
    expect(game.clubTray).toBe("closed");
  });

  it("does not open the bag from a new hole's suggested club", () => {
    const game = new GameSession(8);
    game.startTournament();
    game.toggleClubTray();
    game.resetHole(0, true);
    expect(game.clubTray).toBe("closed");
    expect(game.swingPhase).toBe("aim");
  });

  it("puts a quiet carry line on sand and rough and leaves a fairway readout bare", () => {
    const game = new GameSession(11);
    game.startTournament();
    game.tipVisible = false;
    expect(playHudHtml(game)).not.toContain("lm-lie-note");

    game.lie = "bunker";
    game.clubIndex = clubIndex("driver");
    expect(playHudHtml(game)).toContain("lm-lie-note");
    expect(playHudHtml(game)).toMatch(/half carry/i);

    game.clubIndex = clubIndex("sw");
    const wedge = playHudHtml(game);
    expect(wedge).toMatch(/Wedge/);
    expect(wedge).not.toMatch(/half carry/i);

    game.lie = "rough";
    game.clubIndex = clubIndex("iron7");
    expect(playHudHtml(game)).toMatch(/Smothered launch/i);

    game.lie = "green";
    game.clubIndex = clubIndex("putter");
    expect(playHudHtml(game)).not.toContain("lm-lie-note");
    game.swingPhase = "flight";
    game.lie = "bunker";
    expect(playHudHtml(game)).not.toContain("lm-lie-note");
  });

  it("reads a putt in feet to the hole without a club tray", () => {
    const game = new GameSession(9);
    game.startTournament();
    game.tipVisible = false;
    const hole = game.hole();
    game.ball = createBall({ x: hole.pin.x - 7.4, y: hole.pin.y });
    game.lie = "green";
    game.clubIndex = clubIndex("putter");
    const html = playHudHtml(game);
    expect(html).toContain("TO HOLE");
    expect(html).toContain(">FT<");
    expect(html).toContain(">Putter<");
    expect(html).not.toContain("lm-bag");
    expect(html).toContain('data-hud="address"');
  });
});

describe("swing meter gate", () => {
  it("draws the canvas meters only after the swing starts", () => {
    const src = readFileSync(new URL("./canvas-hud.ts", import.meta.url), "utf8");
    expect(src).toMatch(/if \(showSwingMeter\(session\.swingPhase\)\) drawMeters/);
    expect(src).not.toMatch(/ACCURACY[\s\S]*swingPhase === "aim"/);
  });
});
