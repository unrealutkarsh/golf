import { describe, expect, it } from "vitest";
import { lieStrikeMix } from "./audio";
import { clubIndex } from "./clubs";
import { GameSession } from "./game";
import { grainBurst, grainPose, lieCarryNote, lieRead, seedGrains, strikeCallout, trailLook } from "./lie-story";

function meanHeight(lie: "bunker" | "rough" | "fairway" | "green", club: "driver" | "sw" | "iron7" | "putter", kind: "strike" | "land" = "strike"): number {
  const spec = grainBurst(lie, kind, club);
  const grains = seedGrains(spec, 0.4, { x: 0, y: 0.2, z: 0 }, 4);
  const ys = grains.map((g) => grainPose(g, 0.24).y);
  return ys.reduce((a, b) => a + b, 0) / ys.length;
}

function spread(lie: "bunker" | "rough" | "fairway", club: "driver" | "iron7"): number {
  const spec = grainBurst(lie, "strike", club);
  const grains = seedGrains(spec, 0.2, { x: 10, y: 0.2, z: -4 }, 6);
  let max = 0;
  for (const g of grains) {
    const p = grainPose(g, 0.3);
    max = Math.max(max, Math.hypot(p.x - 10, p.z + 4));
  }
  return max;
}

describe("lie storytelling", () => {
  it("reads bunker, rough, fairway, and green as different contacts", () => {
    expect(lieRead("bunker")).toBe("splash");
    expect(lieRead("rough")).toBe("smother");
    expect(lieRead("fairway")).toBe("clean");
    expect(lieRead("tee")).toBe("clean");
    expect(lieRead("green")).toBe("quiet");

    const dug = grainBurst("bunker", "strike", "driver");
    const wedge = grainBurst("bunker", "strike", "sw");
    const rough = grainBurst("rough", "strike", "iron7");
    const fair = grainBurst("fairway", "strike", "iron7");
    const green = grainBurst("green", "strike", "putter");
    const sandLand = grainBurst("bunker", "land", "iron7");
    const fairLand = grainBurst("fairway", "land", "driver");
    const greenLand = grainBurst("green", "land", "sw");

    expect(dug.count).toBeGreaterThan(wedge.count);
    expect(wedge.count).toBeGreaterThan(rough.count);
    expect(rough.count).toBeGreaterThan(fair.count);
    expect(fair.count).toBeGreaterThan(green.count);
    expect(wedge.rise).toBeGreaterThan(dug.rise);
    expect(dug.rise).toBeGreaterThan(rough.rise);
    expect(rough.rise).toBeGreaterThan(fair.rise);
    expect(fair.cloud).toBeGreaterThan(green.cloud);
    expect(sandLand.cloud).toBeGreaterThan(fairLand.cloud);
    expect(greenLand.cloudOpacity).toBeLessThan(fairLand.cloudOpacity);
    expect(green.puffs).toBe(0);
    expect(dug.puffs).toBeGreaterThan(0);
    expect(rough.shape).toBe("fleck");
    expect(dug.shape).toBe("grain");
    expect(fair.shape).toBe("spark");

    for (const color of dug.colors) {
      const r = (color >> 16) & 255;
      const g = (color >> 8) & 255;
      const b = color & 255;
      expect(r).toBeGreaterThan(180);
      expect(g).toBeGreaterThan(140);
      expect(r).toBeGreaterThan(b);
    }
    for (const color of rough.colors) {
      const r = (color >> 16) & 255;
      const g = (color >> 8) & 255;
      expect(g).toBeGreaterThan(r);
      expect(g).toBeLessThan(170);
    }
    expect(fair.cloudColor).not.toBe(dug.cloudColor);
    expect(green.cloudColor).not.toBe(dug.cloudColor);
    expect(greenLand.colors).not.toContain(dug.cloudColor);
  });

  it("throws sand higher and wider than a fairway strike, and keeps rough low", () => {
    const sand = meanHeight("bunker", "driver");
    const rough = meanHeight("rough", "iron7");
    const fair = meanHeight("fairway", "iron7");
    const green = meanHeight("green", "putter");
    expect(sand).toBeGreaterThan(rough);
    expect(rough).toBeGreaterThan(fair);
    expect(green).toBeLessThan(0.45);
    expect(spread("bunker", "driver")).toBeGreaterThan(spread("fairway", "iron7") * 1.6);
    expect(spread("rough", "iron7")).toBeGreaterThan(spread("fairway", "iron7"));
  });

  it("shortens and dulls the tracer out of rough and a dug bunker", () => {
    const fair = trailLook("fairway", "iron7");
    const rough = trailLook("rough", "iron7");
    const dug = trailLook("bunker", "driver");
    const wedge = trailLook("bunker", "sw");
    const green = trailLook("green", "putter");
    expect(fair.keep).toBe(1);
    expect(fair.opacity).toBeGreaterThan(rough.opacity);
    expect(rough.keep).toBeLessThan(fair.keep);
    expect(dug.keep).toBeLessThan(wedge.keep);
    expect(wedge.keep).toBeLessThan(fair.keep);
    expect(green.opacity).toBeLessThan(fair.opacity);
    expect(rough.color).not.toBe(fair.color);
    expect(dug.color).not.toBe(rough.color);
  });

  it("tells the bag what the lie will cost, and stays quiet on a clean lie", () => {
    expect(lieCarryNote("fairway", "iron7")).toBe("");
    expect(lieCarryNote("tee", "driver")).toBe("");
    expect(lieCarryNote("green", "putter")).toBe("");
    expect(lieCarryNote("bunker", "driver")).toMatch(/half/i);
    expect(lieCarryNote("bunker", "iron5")).toMatch(/half/i);
    expect(lieCarryNote("bunker", "sw")).toMatch(/wedge/i);
    expect(lieCarryNote("bunker", "pw")).not.toMatch(/half/i);
    expect(lieCarryNote("rough", "wood3")).toMatch(/smother/i);

    expect(strikeCallout("tee", "driver", "perfect", "Driver", 90)).toMatchObject({ title: "Pure strike", tone: "perfect" });
    expect(strikeCallout("bunker", "driver", "perfect", "Driver", 80)?.title).toBe("Sand splash");
    expect(strikeCallout("bunker", "sw", "perfect", "Sand Wedge", 70)?.detail).toMatch(/wedge/i);
    expect(strikeCallout("rough", "iron7", "perfect", "7-Iron", 80)?.title).toBe("Smothered");
    expect(strikeCallout("fairway", "iron7", "good", "7-Iron", 80)).toBeNull();
    expect(strikeCallout("bunker", "driver", "miss", "Driver", 80)).toBeNull();
  });
});

describe("lie contact in a round", () => {
  it("splashes a bunker strike and smothers a rough one without a divot on a putt", () => {
    const sand = new GameSession(41);
    sand.startTournament();
    sand.audio.muted = true;
    sand.tipVisible = false;
    const bunker = sand.hole().bunkers[0];
    sand.ball.pos = { x: bunker.cx, y: bunker.cy };
    sand.ball.z = 0;
    sand.refreshLie();
    expect(sand.lie).toBe("bunker");
    sand.clubIndex = clubIndex("driver");
    sand.power = 0.8;
    sand.swingPhase = "accuracy";
    sand.meter = 0.5;
    sand.tap();
    expect(sand.launchLie).toBe("bunker");
    expect(sand.landBurst?.kind).toBe("strike");
    expect(sand.landBurst?.lie).toBe("bunker");
    expect(sand.callout?.title).toBe("Sand splash");

    const rough = new GameSession(42);
    rough.startTournament();
    rough.audio.muted = true;
    const hole = rough.hole();
    const ax = hole.pin.x - hole.tee.x;
    const ay = hole.pin.y - hole.tee.y;
    const len = Math.hypot(ax, ay) || 1;
    rough.ball.pos = { x: hole.tee.x + (ax / len) * 40 + (-ay / len) * 34, y: hole.tee.y + (ay / len) * 40 + (ax / len) * 34 };
    rough.ball.z = 0;
    rough.refreshLie();
    expect(rough.lie).toBe("rough");
    rough.clubIndex = clubIndex("iron7");
    rough.power = 0.8;
    rough.swingPhase = "accuracy";
    rough.meter = 0.5;
    rough.tap();
    expect(rough.callout?.title).toBe("Smothered");
    expect(rough.launchLie).toBe("rough");
  });
});

describe("lie contact mix", () => {
  it("scrapes sand, rustles rough, and leaves a fairway strike clean", () => {
    const sand = lieStrikeMix("bunker");
    const rough = lieStrikeMix("rough");
    const fair = lieStrikeMix("fairway");
    const green = lieStrikeMix("green");
    expect(sand.sand).toBeGreaterThan(0.1);
    expect(sand.crack).toBeLessThan(fair.crack);
    expect(sand.grass).toBe(0);
    expect(rough.grass).toBeGreaterThan(0);
    expect(rough.sand).toBe(0);
    expect(rough.crack).toBeLessThan(fair.crack);
    expect(fair.sand).toBe(0);
    expect(fair.grass).toBe(0);
    expect(fair.crack).toBe(1);
    expect(green.sand).toBe(0);
    expect(green.grass).toBe(0);
    expect(green.crack).toBeLessThanOrEqual(fair.crack);
  });
});
