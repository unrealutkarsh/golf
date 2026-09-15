import { describe, expect, it } from "vitest";
import { clubById, clubIndex, liePowerMul, suggestedShotPower } from "./clubs";
import { GameSession } from "./game";
import { createBall, launchBall, stepBall } from "./physics";
import type { ClubId, Hole, Lie } from "./types";

/** Flat hole along +x: the landing zone is fairway, rough, or a big bunker; the cup is far away. */
function testHole(landing: "fairway" | "rough" | "bunker"): Hole {
  const all = [{ x: -50, y: -200 }, { x: 600, y: -200 }, { x: 600, y: 200 }, { x: -50, y: 200 }];
  const teeStrip = [{ x: -50, y: -30 }, { x: 20, y: -30 }, { x: 20, y: 30 }, { x: -50, y: 30 }];
  return {
    number: 1,
    name: "test",
    par: 4,
    yards: 400,
    tee: { x: 0, y: 0 },
    pin: { x: 5000, y: 0 },
    fairway: [landing === "fairway" ? all : teeStrip],
    rough: [all],
    green: { cx: 5000, cy: 0, rx: 10, ry: 10, rotation: 0 },
    greenBreak: { x: 0, y: 0 },
    bunkers: landing === "bunker" ? [{ cx: 170, cy: 0, rx: 60, ry: 60, rotation: 0 }] : [],
    water: [],
    trees: [],
    bounds: { x: -50, y: -200, w: 650, h: 400 },
  };
}

function play(clubId: ClubId, landing: "fairway" | "rough" | "bunker", fromLie: Lie = "fairway", shape = 0) {
  const hole = testHole(landing);
  const club = clubById(clubId);
  const wind = { speed: 0, dir: 0 };
  let ball = launchBall({ x: 0, y: 0 }, { aim: 0, power: 1, accuracy: 0, club, lie: fromLie, wind, shape });
  let carry: number | null = null;
  for (let i = 0; i < 2000; i++) {
    const step = stepBall(ball, hole, wind, 1 / 60, club.bounce);
    if (carry === null && step.events.some((e) => e.type === "bounce")) carry = step.ball.pos.x;
    ball = step.ball;
    if (!step.flying) break;
  }
  return { carry: carry ?? ball.pos.x, total: ball.pos.x, side: ball.pos.y };
}

describe("tougher lies", () => {
  it("lets a drive run out on the fairway but smothers it in the rough", () => {
    const fairway = play("driver", "fairway");
    const rough = play("driver", "rough");
    expect(fairway.total - fairway.carry).toBeGreaterThan(10);
    expect(rough.total - rough.carry).toBeLessThan(3);
  });

  it("stops a ball that lands in a bunker almost where it lands", () => {
    const sand = play("iron7", "bunker");
    expect(sand.total - sand.carry).toBeLessThan(1);
  });

  it("costs distance from the rough, and much more from sand unless it is a wedge", () => {
    const clean = play("iron7", "fairway").carry;
    expect(play("iron7", "fairway", "rough").carry).toBeLessThan(clean * 0.85);
    expect(play("iron7", "fairway", "bunker").carry).toBeLessThan(clean * 0.6);
    const sw = play("sw", "fairway").carry;
    expect(play("sw", "fairway", "bunker").carry).toBeGreaterThan(sw * 0.7);
    expect(liePowerMul("bunker", "sw")).toBeGreaterThan(liePowerMul("bunker", "iron5"));
  });

  it("sprays a mistimed strike wider from the rough than from the fairway", () => {
    const shot = (lie: Lie) => launchBall({ x: 0, y: 0 }, { aim: 0, power: 1, accuracy: 0.5, club: clubById("iron7"), lie, wind: { speed: 0, dir: 0 } });
    const angle = (lie: Lie) => Math.abs(Math.atan2(shot(lie).vel.y, shot(lie).vel.x));
    expect(angle("rough")).toBeGreaterThan(angle("fairway") * 1.4);
  });
});

describe("shot shape", () => {
  it("bends a driver draw to the player's left and a fade to the right, by a visible amount", () => {
    // Facing +x, the player's left is -y (+y is south, to the right).
    const draw = play("driver", "fairway", "tee", 1);
    const fade = play("driver", "fairway", "tee", -1);
    expect(draw.side).toBeLessThan(-12);
    expect(draw.side).toBeGreaterThan(-30);
    expect(fade.side).toBeGreaterThan(12);
    expect(fade.side).toBeLessThan(30);
  });
});

describe("free club choice", () => {
  it("plays a wedge from the green as a real shot, with aim, shape and a preview", () => {
    const game = new GameSession(51);
    game.startTournament();
    const hole = game.hole();
    game.ball = createBall({ x: hole.pin.x - 12, y: hole.pin.y });
    game.refreshLie();
    game.clubIndex = clubIndex("sw");
    expect(game.putting()).toBe(false);
    expect(game.canShape()).toBe(true);
    expect(game.previewFlight().length).toBeGreaterThan(5);
    // A short chip can be aimed with a short drag.
    const before = game.aim;
    game.aimAt({ x: game.ball.pos.x + 6, y: game.ball.pos.y + 4 });
    expect(game.aim).not.toBe(before);
  });

  it("suggests a short swing for a short shot with any club", () => {
    expect(suggestedShotPower(30, clubById("driver"), "fairway")).toBeLessThan(0.2);
    expect(suggestedShotPower(12, clubById("sw"), "fairway")).toBeLessThan(0.2);
  });
});
