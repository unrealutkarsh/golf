import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { clubIndex } from "./clubs";
import { GameSession } from "./game";
import { clubById } from "./clubs";
import { HARBOR_DUNES } from "./course";
import { createBall, flatRollDistance, puttSpeedForRoll, sampleFlightPath } from "./physics";
import { scaledPuttPower, PUTT_HOLE_FILL } from "./terrain";
import { collectShared, disposeChildren } from "./scene-dispose";
import { spacedPoints } from "./scene-putt";
import { overlayScreen } from "./ui";

function puttSetup(seed: number, hole: number, dx: number, dy: number) {
  const game = new GameSession(seed);
  game.startTournament();
  game.audio.muted = true;
  game.resetHole(hole, false);
  const h = game.hole();
  game.ball = createBall({ x: h.pin.x + dx, y: h.pin.y + dy });
  game.lie = "green";
  game.clubIndex = clubIndex("putter");
  game.aim = Math.atan2(h.pin.y - game.ball.pos.y, h.pin.x - game.ball.pos.x);
  game.visualAim = game.aim;
  game.aimExplicit = true;
  game.visualPower = 0.5;
  return game;
}

/** Signed sideways distance of `p` from the line ball → pin (positive = left of the aim). */
function sideOfAim(game: GameSession, p: { x: number; y: number }) {
  const b = game.ball.pos;
  const pin = game.hole().pin;
  const len = Math.hypot(pin.x - b.x, pin.y - b.y) || 1;
  return (-(pin.y - b.y) * (p.x - b.x) + (pin.x - b.x) * (p.y - b.y)) / len;
}

describe("putt preview line", () => {
  it("bends with the green's slope instead of running straight at the hole", () => {
    // Hole 6 has the strongest break on the course. A 9-yard putt across it.
    const game = puttSetup(41, 5, -9, 0);
    const preview = game.previewPutt();
    expect(preview.path.length).toBeGreaterThan(10);
    const bend = Math.max(...preview.path.map((s) => Math.abs(sideOfAim(game, s.pos))));
    expect(bend).toBeGreaterThan(0.25);
    // It bends the way the slope runs.
    const br = game.hole().greenBreak;
    const aimDir = { x: Math.cos(game.aim), y: Math.sin(game.aim) };
    const breakSide = -aimDir.y * br.x + aimDir.x * br.y;
    // Judge the side at the widest point of the curve: a putt that drops finishes back on the line.
    const widest = preview.path.reduce((a, s) => (Math.abs(sideOfAim(game, s.pos)) > Math.abs(sideOfAim(game, a.pos)) ? s : a));
    expect(Math.sign(sideOfAim(game, widest.pos))).toBe(Math.sign(breakSide));
  });

  it("predicts exactly where the real putt finishes", () => {
    const game = puttSetup(42, 5, -9, 2);
    game.swingPhase = "power";
    game.meter = game.visualPower;
    const preview = game.previewPutt();
    const predicted = preview.path[preview.path.length - 1].pos;
    game.tap();
    game.meter = 0.5;
    game.tap();
    for (let i = 0; i < 900 && game.swingPhase !== "aim" && game.screen === "play"; i++) game.update(1 / 60);
    const finish = preview.holed ? game.hole().pin : game.ball.pos;
    expect(Math.hypot(finish.x - predicted.x, finish.y - predicted.y)).toBeLessThan(0.35);
  });

  it("lets the player aim a putt by dragging past the ball, but ignores a hover next to it", () => {
    const game = puttSetup(43, 0, -6, 0);
    const start = game.aim;
    game.aimAt({ x: game.ball.pos.x + 0.6, y: game.ball.pos.y + 0.6 });
    expect(game.aim).toBe(start);
    game.aimAt({ x: game.ball.pos.x + 6, y: game.ball.pos.y + 1.5 });
    expect(game.aim).not.toBe(start);
  });

  it("spaces dots by distance along the roll", () => {
    const path = [0, 0.1, 0.2, 1, 2.5].map((x) => ({ pos: { x, y: 0 }, z: 0 }));
    const pts = spacedPoints(path, 0.5, 50);
    expect(pts.map((p) => p.x)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
    expect(spacedPoints(path, 0.5, 3)).toHaveLength(3);
  });
});

describe("putt pace", () => {
  it("rolls a mid-meter putt the whole way to the hole at any length", () => {
    const hole = { ...HARBOR_DUNES.holes[0], greenBreak: { x: 0, y: 0 } };
    const g = hole.green;
    for (const yards of [2, 5, 8, 12]) {
      const from = { x: hole.pin.x - Math.cos(g.rotation) * yards, y: hole.pin.y - Math.sin(g.rotation) * yards };
      const aim = Math.atan2(hole.pin.y - from.y, hole.pin.x - from.x);
      const path = sampleFlightPath(
        from,
        { aim: aim + 0.2, power: scaledPuttPower(PUTT_HOLE_FILL, yards), accuracy: 0, club: clubById("putter"), lie: "green", wind: { speed: 0, dir: 0 } },
        hole,
      );
      const end = path[path.length - 1].pos;
      // Aimed off line on purpose so the cup cannot stop it: this measures pure pace.
      expect(Math.hypot(end.x - from.x, end.y - from.y), `${yards}y`).toBeGreaterThan(yards - 0.25);
      expect(Math.hypot(end.x - from.x, end.y - from.y), `${yards}y`).toBeLessThan(yards + 0.25);
    }
    expect(flatRollDistance(puttSpeedForRoll(6))).toBeCloseTo(6, 1);
  });

  it("sinks a breaking putt when the player reads the line", () => {
    const game = puttSetup(45, 0, -7, 2);
    const base = game.aim;
    let read: number | null = null;
    for (let i = -60; i <= 60 && read === null; i++) {
      game.visualAim = base + i * 0.004;
      if (game.previewPutt().holed) read = game.visualAim;
    }
    expect(read).not.toBeNull();
    // Played straight at the pin it misses: the break is real.
    game.visualAim = base;
    expect(game.previewPutt().holed).toBe(false);
    game.aim = read!;
    game.visualAim = read!;
    game.swingPhase = "power";
    game.meter = PUTT_HOLE_FILL;
    game.visualPower = PUTT_HOLE_FILL;
    game.tap();
    game.meter = 0.5;
    game.tap();
    for (let i = 0; i < 900 && game.screen === "play"; i++) game.update(1 / 60);
    expect(game.screen).toBe("holeEnd");
  });
});

describe("long and off-green putts", () => {
  /** Distance a putt at `fill` rolls from `back` yards out along the tee line, with the break and cup out of the way. */
  function paceFrom(courseEvent: string, holeIndex: number, back: number, fill: number) {
    const game = new GameSession(46);
    game.startTournament(courseEvent);
    game.audio.muted = true;
    game.resetHole(holeIndex, false);
    const hole = game.hole();
    const flat = { ...hole, greenBreak: { x: 0, y: 0 } };
    (game.course.holes as typeof game.course.holes)[holeIndex] = flat;
    const len = Math.hypot(hole.tee.x - hole.pin.x, hole.tee.y - hole.pin.y);
    const from = { x: hole.pin.x + ((hole.tee.x - hole.pin.x) / len) * back, y: hole.pin.y + ((hole.tee.y - hole.pin.y) / len) * back };
    game.ball = createBall(from);
    game.refreshLie();
    game.clubIndex = clubIndex("putter");
    // Aimed a touch off the cup so it measures pace, not whether it drops.
    game.aim = Math.atan2(hole.pin.y - from.y, hole.pin.x - from.x) + 0.12;
    game.visualAim = game.aim;
    game.aimExplicit = true;
    game.swingPhase = "power";
    game.visualPower = fill;
    const path = game.previewPutt().path;
    const end = path[path.length - 1].pos;
    return { lie: game.lie, rolled: Math.hypot(end.x - from.x, end.y - from.y) };
  }

  it("reaches the hole from 45 and 55 yards at mid-meter, well past the old 40-yard ceiling", () => {
    for (const back of [45, 55]) {
      const { rolled } = paceFrom("fog-belt-open", 8, back, PUTT_HOLE_FILL);
      expect(rolled, `${back}y`).toBeGreaterThan(back - 1.5);
      expect(rolled, `${back}y`).toBeLessThan(back + 1.5);
    }
  });

  it("keeps mid-meter pace honest from the fairway, where putts used to come up a third short", () => {
    for (const [holeIndex, back] of [[0, 20], [5, 30]] as const) {
      const { lie, rolled } = paceFrom("fog-belt-open", holeIndex, back, PUTT_HOLE_FILL);
      expect(lie).not.toBe("green");
      expect(rolled, `hole ${holeIndex + 1} ${back}y`).toBeGreaterThan(back - 1);
      expect(rolled, `hole ${holeIndex + 1} ${back}y`).toBeLessThan(back + 1);
    }
  });

  it("runs a full-meter putt well past the hole", () => {
    const { rolled } = paceFrom("harbor-invitational", 0, 30, 1);
    expect(rolled).toBeGreaterThan(30 * 1.45);
  });
});

describe("hole rebuild memory", () => {
  it("disposes a hole's own geometry and materials but keeps shared ones", () => {
    const sharedMat = new THREE.MeshBasicMaterial();
    const template = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const holeGroup = new THREE.Group();
    const ownGeo = new THREE.PlaneGeometry();
    const ownMat = new THREE.MeshBasicMaterial();
    holeGroup.add(new THREE.Mesh(ownGeo, sharedMat), new THREE.Mesh(ownGeo, ownMat), template.clone());
    const disposed = new Set<object>();
    for (const r of [ownGeo, ownMat, sharedMat, template.geometry, template.material as THREE.Material]) {
      r.addEventListener("dispose", () => disposed.add(r));
    }
    const counts = disposeChildren(holeGroup, collectShared([template], [sharedMat]));
    expect(holeGroup.children).toHaveLength(0);
    expect(counts).toEqual({ geometries: 1, materials: 1 });
    expect(disposed.has(ownGeo)).toBe(true);
    expect(disposed.has(ownMat)).toBe(true);
    expect(disposed.has(sharedMat)).toBe(false);
    expect(disposed.has(template.geometry)).toBe(false);
  });
});

describe("scorecard", () => {
  it("opens over the hole summary and the round summary, not just during play", () => {
    expect(overlayScreen("holeEnd", false, true)).toBe("scorecard");
    expect(overlayScreen("roundEnd", false, true)).toBe("scorecard");
    expect(overlayScreen("play", false, true)).toBe("scorecard");
    expect(overlayScreen("holeEnd", false, false)).toBe("holeEnd");
    expect(overlayScreen("title", false, true)).toBe("title");
    expect(overlayScreen("holeEnd", true, true)).toBe("help");
  });

  it("does not follow the player onto the next tee", () => {
    const game = new GameSession(44);
    game.startTournament();
    game.completeHoleForTest(4);
    game.scorecardOpen = true;
    game.nextAfterHole();
    expect(game.screen).toBe("play");
    expect(game.scorecardOpen).toBe(false);
  });
});
