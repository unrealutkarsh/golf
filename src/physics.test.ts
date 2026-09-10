import { describe, expect, it } from "vitest";
import { clubById } from "./clubs";
import { HARBOR_DUNES, lieAt } from "./course";
import { createBall, flightApex, launchBall, sampleFlightPath, stepBall } from "./physics";

function settle(from = HARBOR_DUNES.holes[0].tee, clubId = "driver", power = 1, accuracy = 0) {
  const hole = HARBOR_DUNES.holes[0];
  const wind = { speed: 0, dir: 0 };
  const club = clubById(clubId as "driver");
  let ball = launchBall(from, {
    aim: Math.atan2(hole.pin.y - from.y, hole.pin.x - from.x),
    power,
    accuracy,
    club,
    lie: lieAt(hole, from),
    wind,
  });
  let holed = false;
  let penalty: string | null = null;
  for (let i = 0; i < 600; i++) {
    const step = stepBall(ball, hole, wind, 1 / 60, club.bounce);
    ball = step.ball;
    if (step.penaltyKind) {
      penalty = step.penaltyKind;
      break;
    }
    if (step.holed) {
      holed = true;
      break;
    }
    if (!step.flying) break;
  }
  return { ball, holed, penalty, hole };
}

describe("shot physics", () => {
  it("sends a full driver a realistic tour distance", () => {
    const { ball, hole } = settle(HARBOR_DUNES.holes[0].tee, "driver", 1, 0);
    const travel = Math.hypot(ball.pos.x - hole.tee.x, ball.pos.y - hole.tee.y);
    expect(travel).toBeGreaterThan(210);
    expect(travel).toBeLessThan(310);
  });

  it("holes out a tap-in on the green", () => {
    const hole = HARBOR_DUNES.holes[0];
    const from = { x: hole.pin.x + 0.6, y: hole.pin.y };
    const wind = { speed: 0, dir: 0 };
    const club = clubById("putter");
    let ball = createBall(from);
    ball = launchBall(from, {
      aim: Math.atan2(hole.pin.y - from.y, hole.pin.x - from.x),
      power: 0.12,
      accuracy: 0,
      club,
      lie: "green",
      wind,
    });
    let holed = false;
    for (let i = 0; i < 240; i++) {
      const step = stepBall(ball, hole, wind, 1 / 60, club.bounce);
      ball = step.ball;
      if (step.holed) {
        holed = true;
        break;
      }
      if (!step.flying) break;
    }
    expect(holed).toBe(true);
  });

  it("stops a rolling ball", () => {
    const { ball } = settle(HARBOR_DUNES.holes[0].tee, "iron7", 0.7, 0);
    expect(Math.hypot(ball.vel.x, ball.vel.y)).toBeLessThan(0.6);
  });

  it("flies with a visible apex that grows with loft", () => {
    const hole = HARBOR_DUNES.holes[0];
    const from = hole.tee;
    const aim = Math.atan2(hole.pin.y - from.y, hole.pin.x - from.x);
    const wind = { speed: 0, dir: 0 };
    const pathOf = (id: "driver" | "iron7" | "sw") =>
      sampleFlightPath(from, {
        aim,
        power: 1,
        accuracy: 0,
        club: clubById(id),
        lie: "tee",
        wind,
      }, hole);
    const driver = pathOf("driver");
    const iron = pathOf("iron7");
    const wedge = pathOf("sw");
    const driverApex = flightApex(driver);
    const ironApex = flightApex(iron);
    const wedgeApex = flightApex(wedge);
    expect(driverApex).toBeGreaterThan(10);
    expect(ironApex).toBeGreaterThan(driverApex + 8);
    expect(wedgeApex).toBeGreaterThan(ironApex + 8);
    const mid = driver[Math.floor(driver.length / 2)];
    expect(mid.z).toBeGreaterThan(4);
    expect(wedge.filter((s) => s.z > 0.5).length).toBeGreaterThan(driver.filter((s) => s.z > 0.5).length);
  });

  it("curves a draw left of a straight shot", () => {
    const hole = HARBOR_DUNES.holes[0];
    const from = { x: hole.tee.x + 24, y: hole.tee.y };
    const aim = 0;
    const wind = { speed: 0, dir: 0 };
    const shot = {
      aim,
      power: 0.92,
      accuracy: 0,
      club: clubById("iron7"),
      lie: "fairway" as const,
      wind,
    };
    const straight = sampleFlightPath(from, { ...shot, shape: 0 }, hole);
    const draw = sampleFlightPath(from, { ...shot, shape: 1 }, hole);
    const fade = sampleFlightPath(from, { ...shot, shape: -1 }, hole);
    const mid = (path: typeof straight) => path[Math.floor(path.length * 0.6)];
    expect(mid(draw).pos.y).toBeGreaterThan(mid(straight).pos.y + 3);
    expect(mid(fade).pos.y).toBeLessThan(mid(straight).pos.y - 3);
  });

  it("lets a missed putt come to rest instead of creeping on the break", () => {
    const hole = HARBOR_DUNES.holes[0];
    const from = { x: hole.pin.x - 8.5, y: hole.pin.y + 3.2 };
    const wind = { speed: 0, dir: 0 };
    const club = clubById("putter");
    let ball = launchBall(from, {
      aim: Math.atan2(hole.pin.y - from.y, hole.pin.x - from.x) + 0.7,
      power: 0.32,
      accuracy: 0,
      club,
      lie: "green",
      wind,
    });
    let holed = false;
    let stopped = false;
    for (let i = 0; i < 480; i++) {
      const step = stepBall(ball, hole, wind, 1 / 60, club.bounce);
      ball = step.ball;
      if (step.holed) {
        holed = true;
        break;
      }
      if (!step.flying) {
        stopped = true;
        break;
      }
    }
    expect(holed).toBe(false);
    expect(stopped).toBe(true);
    expect(Math.hypot(ball.vel.x, ball.vel.y)).toBeLessThan(0.6);
  });
});

