import { describe, expect, it } from "vitest";
import { clubById } from "./clubs";
import { HARBOR_DUNES, lieAt } from "./course";
import { applyGreenGrip, createBall, flightApex, flightProfile, forwardFlightPath, launchBall, puttSpeedForRoll, sampleFlightPath, samplePathPoint, stepBall, type FlightSample } from "./physics";
import { scaledPuttPower, suggestedPuttPower } from "./terrain";

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
      power: scaledPuttPower(0.5, 0.6),
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

  it("flies every club to a tour-like apex, with drivers hanging longest and wedges landing steepest", () => {
    const hole = HARBOR_DUNES.holes[0];
    const from = hole.tee;
    const aim = Math.atan2(hole.pin.y - from.y, hole.pin.x - from.x);
    const wind = { speed: 0, dir: 0 };
    const pathOf = (id: "driver" | "iron7" | "sw") =>
      sampleFlightPath(from, { aim, power: 1, accuracy: 0, club: clubById(id), lie: "tee", wind }, hole);
    const hang = (path: FlightSample[]) => (path.length - 1) / 60;
    const descent = (path: FlightSample[]) => {
      const a = path[path.length - 3];
      const b = path[path.length - 1];
      return Math.atan2(a.z - b.z, Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y));
    };
    const driver = pathOf("driver");
    const iron = pathOf("iron7");
    const wedge = pathOf("sw");
    for (const path of [driver, iron, wedge]) {
      expect(flightApex(path)).toBeGreaterThan(20);
      expect(flightApex(path)).toBeLessThan(36);
    }
    expect(hang(driver)).toBeGreaterThan(5);
    expect(hang(driver)).toBeGreaterThan(hang(iron));
    expect(hang(iron)).toBeGreaterThan(hang(wedge));
    expect(descent(wedge)).toBeGreaterThan(descent(driver) + 0.2);
  });

  it("matches a club's authored carry, apex and hang on a flat, windless shot", () => {
    const club = clubById("iron7");
    const profile = flightProfile(club, 1);
    const path = sampleFlightPath({ x: 0, y: 0 }, { aim: 0, power: 1, accuracy: 0, club, lie: "fairway", wind: { speed: 0, dir: 0 } }, {
      ...HARBOR_DUNES.holes[0],
      trees: [],
    });
    const land = path[path.length - 1];
    expect(Math.abs((path.length - 1) / 60 - profile.hang)).toBeLessThan(0.15);
    expect(Math.abs(flightApex(path) - profile.apex)).toBeLessThan(1.5);
    expect(Math.abs(Math.hypot(land.pos.x, land.pos.y) - club.carry)).toBeLessThan(6);
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
    const end = (path: typeof straight) => path[path.length - 1];
    // Aim 0 faces +x (east). +y is south, which is the player's right, so a draw ends at smaller y.
    expect(end(draw).pos.y).toBeLessThan(end(straight).pos.y - 5);
    expect(end(fade).pos.y).toBeGreaterThan(end(straight).pos.y + 5);
    // A shaped iron bends, it does not hook into the next fairway.
    expect(end(straight).pos.y - end(draw).pos.y).toBeLessThan(20);
  });

  it("lips a fast putt once, then holes the tap-in", () => {
    const hole = HARBOR_DUNES.holes[0];
    const from = { x: hole.pin.x - 2.4, y: hole.pin.y };
    const wind = { speed: 0, dir: 0 };
    const club = clubById("putter");
    let ball = launchBall(from, {
      aim: 0,
      power: 0.58,
      accuracy: 0,
      club,
      lie: "green",
      wind,
    });
    let lipped = false;
    let holed = false;
    for (let i = 0; i < 240; i++) {
      const step = stepBall(ball, hole, wind, 1 / 60, club.bounce);
      ball = step.ball;
      if (step.events.some((e) => e.type === "lip")) lipped = true;
      if (step.holed) {
        holed = true;
        break;
      }
      if (!step.flying) break;
    }
    expect(lipped).toBe(true);
    expect(holed).toBe(false);
    expect(ball.lipped).toBe(true);
    const rest = { ...ball.pos };
    expect(Math.hypot(rest.x - hole.pin.x, rest.y - hole.pin.y)).toBeLessThan(3.5);
    ball = launchBall(rest, {
      aim: Math.atan2(hole.pin.y - rest.y, hole.pin.x - rest.x),
      power: scaledPuttPower(0.55, Math.hypot(rest.x - hole.pin.x, rest.y - hole.pin.y)),
      accuracy: 0,
      club,
      lie: "green",
      wind,
    });
    for (let i = 0; i < 360; i++) {
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

  it("holes a 1-yard and 2-yard putt aimed at the pin", () => {
    const hole = HARBOR_DUNES.holes[0];
    const wind = { speed: 0, dir: 0 };
    const club = clubById("putter");
    for (const yards of [1, 2]) {
      const from = { x: hole.pin.x - yards, y: hole.pin.y };
      let ball = launchBall(from, {
        aim: Math.atan2(hole.pin.y - from.y, hole.pin.x - from.x),
        power: scaledPuttPower(0.5, yards),
        accuracy: 0,
        club,
        lie: "green",
        wind,
      });
      let holed = false;
      for (let i = 0; i < 360; i++) {
        const step = stepBall(ball, hole, wind, 1 / 60, club.bounce);
        ball = step.ball;
        if (step.holed) {
          holed = true;
          break;
        }
        if (!step.flying) break;
      }
      expect(holed, `${yards}y putt`).toBe(true);
      expect(Math.hypot(ball.pos.x - hole.pin.x, ball.pos.y - hole.pin.y)).toBeLessThan(0.3);
    }
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

  it("launches every stroke with lipped cleared", () => {
    const hole = HARBOR_DUNES.holes[0];
    const from = { x: hole.pin.x - 4, y: hole.pin.y };
    const putt = launchBall(from, {
      aim: 0,
      power: 0.2,
      accuracy: 0,
      club: clubById("putter"),
      lie: "green",
      wind: { speed: 0, dir: 0 },
    });
    const drive = launchBall(hole.tee, {
      aim: 0,
      power: 0.9,
      accuracy: 0,
      club: clubById("driver"),
      lie: "tee",
      wind: { speed: 0, dir: 0 },
    });
    expect(putt.lipped).toBe(false);
    expect(drive.lipped).toBe(false);
    expect(createBall(from).lipped).toBe(false);
    expect(Math.hypot(putt.vel.x, putt.vel.y)).toBeCloseTo(puttSpeedForRoll(clubById("putter").roll * 0.2), 5);
    expect(putt.spinning).toBeGreaterThan(Math.hypot(putt.vel.x, putt.vel.y) * 0.95);
  });

  it("starts a putt already rolling instead of sliding", () => {
    const hole = HARBOR_DUNES.holes[0];
    const from = { x: hole.pin.x - 6, y: hole.pin.y };
    const ball = launchBall(from, {
      aim: 0,
      power: 0.28,
      accuracy: 0,
      club: clubById("putter"),
      lie: "green",
      wind: { speed: 0, dir: 0 },
    });
    const speed = Math.hypot(ball.vel.x, ball.vel.y);
    expect(ball.spinning).toBeGreaterThan(speed * 0.95);
  });

  it("grabs a sliding ball on the green harder than a rolling one", () => {
    const slide = applyGreenGrip({ pos: { x: 0, y: 0 }, vel: { x: 12, y: 0 }, z: 0, vz: 0, spinning: 0, curve: 0, lipped: false }, 1 / 60);
    const roll = applyGreenGrip({ pos: { x: 0, y: 0 }, vel: { x: 12, y: 0 }, z: 0, vz: 0, spinning: 12, curve: 0, lipped: false }, 1 / 60);
    expect(Math.hypot(slide.vel.x, slide.vel.y)).toBeLessThan(Math.hypot(roll.vel.x, roll.vel.y) - 0.4);
    expect(slide.spinning).toBeGreaterThan(0.4);
  });

  it("stops a lag putt near the hole instead of skating past", () => {
    const hole = HARBOR_DUNES.holes[0];
    const from = { x: hole.pin.x - 10, y: hole.pin.y };
    const { ball, holed } = settlePutt(from, suggestedPuttPower(10), 0);
    const leftover = Math.hypot(ball.pos.x - hole.pin.x, ball.pos.y - hole.pin.y);
    expect(holed || leftover < 4.2).toBe(true);
    const travel = Math.hypot(ball.pos.x - from.x, ball.pos.y - from.y);
    expect(travel).toBeLessThan(14);
    expect(travel).toBeGreaterThan(6);
  });

  it("keeps a short SW chip as a forward arc instead of a moon-ball loop", () => {
    const hole = HARBOR_DUNES.holes[1];
    const from = { x: hole.pin.x - 27, y: hole.pin.y + 8 };
    const aim = Math.atan2(hole.pin.y - from.y, hole.pin.x - from.x);
    const path = forwardFlightPath(
      sampleFlightPath(
        from,
        {
          aim,
          power: 0.38,
          accuracy: 0,
          club: clubById("sw"),
          lie: "rough",
          wind: { speed: 0, dir: 0 },
        },
        hole,
      ),
      aim,
    );
    const last = path[path.length - 1];
    const travel = Math.hypot(last.pos.x - from.x, last.pos.y - from.y);
    const dirx = Math.cos(aim);
    const diry = Math.sin(aim);
    let prev = 0;
    for (const sample of path) {
      const along = (sample.pos.x - from.x) * dirx + (sample.pos.y - from.y) * diry;
      expect(along).toBeGreaterThanOrEqual(prev - 0.05);
      prev = along;
    }
    expect(travel).toBeGreaterThan(12);
    expect(travel).toBeLessThan(55);
    expect(flightApex(path)).toBeLessThan(18);
    expect(flightApex(path)).toBeGreaterThan(2);
    expect(flightProfile(clubById("sw"), 0.38, 0.88).hang).toBeLessThan(2.2);
    expect(flightProfile(clubById("sw"), 1).hang).toBeGreaterThan(3.2);
  });

  it("samples a flight path without jumping to a raw vertex", () => {
    const path = [
      { pos: { x: 0, y: 0 }, z: 0 },
      { pos: { x: 10, y: 0 }, z: 4 },
      { pos: { x: 20, y: 0 }, z: 0 },
    ];
    const mid = samplePathPoint(path, 0.25);
    expect(mid.pos.x).toBeCloseTo(5, 5);
    expect(mid.z).toBeCloseTo(2, 5);
  });
});

function settlePutt(from: { x: number; y: number }, power: number, aimNudge = 0) {
  const hole = HARBOR_DUNES.holes[0];
  const wind = { speed: 0, dir: 0 };
  const club = clubById("putter");
  let ball = launchBall(from, {
    aim: Math.atan2(hole.pin.y - from.y, hole.pin.x - from.x) + aimNudge,
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
  return { ball, holed, hole };
}

