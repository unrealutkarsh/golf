import { describe, expect, it } from "vitest";
import { clubById, clubIndex } from "./clubs";
import {
  FOG_BELT_PLAY,
  HARBOR_DUNES_PLAY,
  ambienceMph,
  characterForCourse,
  crossShare,
  hazeForHole,
  windForCharacter,
  type CourseCharacter,
} from "./course-character";
import { GameSession } from "./game";
import { playHudHtml } from "./ui";
import { hashString, mulberry32 } from "./math";
import { launchBall, SIM_DT, stepBall, windAccel, type GroundPlay } from "./physics";
import type { Hole, Lie, Wind } from "./types";

function flatHole(landing: Lie): Hole {
  const all = [
    { x: -80, y: -180 },
    { x: 700, y: -180 },
    { x: 700, y: 180 },
    { x: -80, y: 180 },
  ];
  const teeOnly = [
    { x: -40, y: -20 },
    { x: 30, y: -20 },
    { x: 30, y: 20 },
    { x: -40, y: 20 },
  ];
  return {
    number: 1,
    name: "flat",
    par: 4,
    yards: 500,
    tee: { x: 0, y: 0 },
    pin: { x: 9000, y: 0 },
    fairway: [landing === "fairway" ? all : teeOnly],
    rough: [all],
    green:
      landing === "green"
        ? { cx: 180, cy: 0, rx: 260, ry: 80, rotation: 0 }
        : { cx: 9000, cy: 0, rx: 12, ry: 12, rotation: 0 },
    greenBreak: { x: 0, y: 0 },
    bunkers: landing === "bunker" ? [{ cx: 200, cy: 0, rx: 80, ry: 40, rotation: 0 }] : [],
    water: [],
    trees: [],
    bounds: { x: -80, y: -180, w: 780, h: 360 },
  };
}

function mean(xs: number[]): number {
  return xs.reduce((sum, n) => sum + n, 0) / xs.length;
}

function holeWinds(play: CourseCharacter, aim = 0.35) {
  const winds: Wind[] = [];
  for (let hole = 0; hole < 18; hole++) {
    const rng = mulberry32(hashString(`${play.id}-wind-${hole}`));
    winds.push(windForCharacter(play, rng, aim));
  }
  return winds;
}

interface Finish {
  carry: number;
  total: number;
  side: number;
  hop: number;
}

function finishDrive(wind: Wind, ground: GroundPlay | undefined, landing: Lie = "fairway"): Finish {
  const hole = flatHole(landing);
  const club = clubById("driver");
  let ball = launchBall({ x: 0, y: 0 }, { aim: 0, power: 1, accuracy: 0, club, lie: "tee", wind, ground });
  let carry = 0;
  let hopped = false;
  let hop = 0;
  for (let i = 0; i < 2600; i++) {
    const step = stepBall(ball, hole, wind, SIM_DT, club.bounce, ground);
    if (!hopped && step.events.some((event) => event.type === "bounce")) {
      hopped = true;
      carry = step.ball.pos.x;
    } else if (hopped && step.ball.z > hop) {
      hop = step.ball.z;
    }
    ball = step.ball;
    if (!step.flying || step.penaltyKind) break;
  }
  return { carry, total: ball.pos.x, side: ball.pos.y, hop };
}

const still: Wind = { speed: 0, dir: 0 };

describe("course wind", () => {
  it("gives Fog Belt a stronger, steadier cross than Harbor's gust", () => {
    const aim = 0.35;
    const fog = holeWinds(FOG_BELT_PLAY, aim);
    const harbor = holeWinds(HARBOR_DUNES_PLAY, aim);
    expect(mean(fog.map((w) => w.speed))).toBeGreaterThan(mean(harbor.map((w) => w.speed)) + 4);
    expect(Math.min(...fog.map((w) => crossShare(w.dir, aim)))).toBeGreaterThan(0.8);
    expect(mean(fog.map((w) => crossShare(w.dir, aim)))).toBeGreaterThan(mean(harbor.map((w) => crossShare(w.dir, aim))));
    expect(mean(harbor.map((w) => crossShare(w.dir, aim)))).toBeGreaterThan(0.75);
    expect(FOG_BELT_PLAY.gust).toBeLessThan(2);
    expect(HARBOR_DUNES_PLAY.gust).toBeGreaterThan(FOG_BELT_PLAY.gust + 4);
    expect(HARBOR_DUNES_PLAY.shear).toBeGreaterThan(0.25);
    expect(FOG_BELT_PLAY.shear).toBe(0);
  });

  it("keeps a plain breeze on the old push, and lets a gust swell and shear aloft", () => {
    const climb = 15 / 30;
    const stock = 0.12 * 10 * (0.5 + climb * 0.8);
    const plain = windAccel({ speed: 10, dir: 0 }, 15);
    expect(plain.x).toBeCloseTo(stock, 5);
    expect(plain.y).toBeCloseTo(0, 5);

    const gusty = windAccel({ speed: 5, dir: 0, gust: 6.5, influence: 1, shear: 0.4 }, 15);
    const low = windAccel({ speed: 5, dir: 0, gust: 6.5, influence: 1, shear: 0.4 }, 1);
    expect(Math.hypot(gusty.x, gusty.y)).toBeGreaterThan(Math.hypot(low.x, low.y) * 1.5);
    expect(Math.abs(Math.atan2(gusty.y, gusty.x))).toBeGreaterThan(0.25);

    const steady = windAccel({ speed: 12, dir: 0.4, gust: 1.1, influence: 1.38, shear: 0 }, 15);
    expect(Math.atan2(steady.y, steady.x)).toBeCloseTo(0.4, 2);
    expect(Math.hypot(steady.x, steady.y)).toBeGreaterThan(Math.hypot(plain.x, plain.y));
  });

  it("asks for a bigger start line on Fog Belt than Harbor's gust does", () => {
    const cross = Math.PI / 2;
    const fogWind = {
      speed: FOG_BELT_PLAY.windMin + FOG_BELT_PLAY.windSpan / 2,
      dir: cross,
      gust: FOG_BELT_PLAY.gust,
      influence: FOG_BELT_PLAY.influence,
      shear: FOG_BELT_PLAY.shear,
    };
    const harborWind = {
      speed: HARBOR_DUNES_PLAY.windMin + HARBOR_DUNES_PLAY.windSpan / 2,
      dir: cross,
      gust: HARBOR_DUNES_PLAY.gust,
      influence: HARBOR_DUNES_PLAY.influence,
      shear: HARBOR_DUNES_PLAY.shear,
    };
    const fog = finishDrive(fogWind, { roll: FOG_BELT_PLAY.roll, hop: FOG_BELT_PLAY.hop });
    const harbor = finishDrive(harborWind, { roll: HARBOR_DUNES_PLAY.roll, hop: HARBOR_DUNES_PLAY.hop });
    // Enough to change the start line, and still inside a wide links corridor.
    expect(Math.abs(fog.side)).toBeGreaterThan(Math.abs(harbor.side) + 12);
    expect(Math.abs(fog.side)).toBeGreaterThan(18);
    expect(Math.abs(fog.side)).toBeLessThan(48);
    expect(Math.abs(harbor.side)).toBeGreaterThan(8);
    expect(Math.abs(harbor.side)).toBeLessThan(28);
  });
});

describe("course firmness", () => {
  it("lets Fog Belt run farther and Harbor kick higher off the same fairway", () => {
    const fog = finishDrive(still, { roll: FOG_BELT_PLAY.roll, hop: FOG_BELT_PLAY.hop });
    const harbor = finishDrive(still, { roll: HARBOR_DUNES_PLAY.roll, hop: HARBOR_DUNES_PLAY.hop });
    const stock = finishDrive(still, undefined);
    expect(fog.total - fog.carry).toBeGreaterThan(harbor.total - harbor.carry + 6);
    expect(harbor.total - harbor.carry).toBeGreaterThan(stock.total - stock.carry + 1);
    expect(harbor.hop).toBeGreaterThan(fog.hop + 0.4);
    expect(Math.abs(fog.carry - harbor.carry)).toBeLessThan(2);
  });

  it("leaves green, rough, and sand on their own lies", () => {
    const firm = { roll: FOG_BELT_PLAY.roll, hop: FOG_BELT_PLAY.hop };
    for (const lie of ["green", "rough", "bunker"] as const) {
      const played = finishDrive(still, firm, lie);
      const stock = finishDrive(still, undefined, lie);
      expect(Math.abs(played.total - stock.total)).toBeLessThan(0.5);
    }
  });
});

describe("course readout", () => {
  it("softens Fog Belt yardage in the haze and keeps Harbor exact", () => {
    const haze = hazeForHole(FOG_BELT_PLAY, "fog-belt-links", 3);
    expect(haze).not.toBeNull();
    expect(hazeForHole(HARBOR_DUNES_PLAY, "harbor-dunes", 3)).toBeNull();
    expect(characterForCourse("fog-belt-links").cue).toMatch(/Firm/);
    expect(characterForCourse("harbor-dunes").cue).toMatch(/kick/i);
    expect(ambienceMph({ speed: 5, gust: 6 })).toBeGreaterThan(5);
    expect(ambienceMph({ speed: 12, gust: 1 })).toBeGreaterThan(ambienceMph({ speed: 5, gust: 6 }));
  });

  it("shows the venue and the wind character on the quiet monitor", () => {
    const fog = new GameSession(4);
    fog.startTournament("fog-belt-open");
    fog.tipVisible = false;
    fog.messageTime = 0;
    const fogHtml = playHudHtml(fog);
    expect(fogHtml).toContain("Firm run");
    expect(fogHtml).toContain("Steady");
    expect(fogHtml).toContain("HAZY");
    expect(fogHtml).toContain("is-hazy");
    expect(fog.wind.speed).toBeGreaterThanOrEqual(FOG_BELT_PLAY.windMin);
    expect(fog.wind.influence).toBe(FOG_BELT_PLAY.influence);

    const harbor = new GameSession(4);
    harbor.startTournament("harbor-invitational");
    harbor.tipVisible = false;
    harbor.messageTime = 0;
    const harborHtml = playHudHtml(harbor);
    expect(harborHtml).toContain("Dune kick");
    expect(harborHtml).toContain("Gust");
    expect(harborHtml).toContain("TO PIN");
    expect(harborHtml).not.toContain("HAZY");
    expect(harbor.wind.gust).toBe(HARBOR_DUNES_PLAY.gust);
    expect(harbor.wind.speed).toBeLessThan(fog.wind.speed);
  });

  it("lands the live ball where the course wind and firmness said it would", () => {
    const game = new GameSession(44);
    game.startTournament("fog-belt-open");
    game.audio.muted = true;
    game.tipVisible = false;
    game.clubIndex = clubIndex("driver");
    game.power = 1;
    game.accuracy = 0;
    game.swingPhase = "accuracy";
    game.meter = 0.5;
    game.tap();
    const promised = game.landingPos;
    expect(promised).not.toBeNull();
    let touchdown: { x: number; y: number } | null = null;
    for (let i = 0; i < 4000 && game.swingPhase === "flight"; i++) {
      game.update(1 / 60);
      if (!touchdown && game.shotCarry !== null) touchdown = { ...game.ball.pos };
    }
    expect(touchdown).not.toBeNull();
    const dx = touchdown!.x - promised!.x;
    const dy = touchdown!.y - promised!.y;
    expect(Math.hypot(dx, dy)).toBeLessThan(2);
  });
});
