import { describe, expect, it } from "vitest";
import { HARBOR_DUNES, inWater } from "./course";
import { GREEN_FALL, MAX_PUTT_POWER } from "./physics";
import {
  bladeHeight,
  bladeKeepChance,
  bladeWidth,
  grassBudget,
  groundHeight,
  addressLookDistance,
  cameraHeightAboveGround,
  camFraming,
  playCamFraming,
  camLabel,
  PUTT_HOLE_FILL,
  PUTT_ROLL_YARDS,
  puttMeterYards,
  puttPowerToMeterFill,
  resolveCamView,
  shapeLabel,
  scaledPuttPower,
  suggestedPuttPower,
  turfLush,
} from "./terrain";

describe("course terrain", () => {
  it("raises the putting surface above bunkers and water", () => {
    const hole = HARBOR_DUNES.holes[1];
    const green = groundHeight(hole, hole.green.cx, hole.green.cy);
    const bunker = hole.bunkers[0];
    const sand = groundHeight(hole, bunker.cx, bunker.cy);
    const pond = hole.water[0][0];
    expect(inWater(hole, pond)).toBe(true);
    expect(green).toBeGreaterThan(sand + 0.2);
    expect(green).toBeGreaterThan(groundHeight(hole, pond.x, pond.y) + 0.4);
  });

  it("falls in the direction the ball breaks", () => {
    const hole = HARBOR_DUNES.holes[5];
    const br = hole.greenBreak;
    const c = hole.green;
    const high = groundHeight(hole, c.cx - br.x * 6, c.cy - br.y * 6);
    const low = groundHeight(hole, c.cx + br.x * 6, c.cy + br.y * 6);
    expect(low).toBeLessThan(high - 0.08);
    expect(GREEN_FALL).toBeGreaterThan(0.01);
    expect(GREEN_FALL).toBeLessThan(0.04);
  });

  it("picks player, follow, and putting cameras", () => {
    expect(resolveCamView("auto", "aim", true)).toBe("putt");
    expect(resolveCamView("player", "aim", true)).toBe("putt");
    expect(resolveCamView("auto", "flight", true)).toBe("putt");
    expect(resolveCamView("auto", "flight", false)).toBe("follow");
    expect(resolveCamView("auto", "aim", false)).toBe("player");
    expect(resolveCamView("follow", "aim", true)).toBe("follow");
    expect(camLabel("player")).toBe("address");
    expect(camLabel("follow")).toBe("follow");
    expect(camLabel("putt")).toBe("putt");
    const address = camFraming("player");
    const putt = camFraming("putt");
    const follow = camFraming("follow");
    expect(address.back).toBeLessThan(6);
    expect(address.height).toBeGreaterThan(1.8);
    expect(address.side).toBeLessThan(0.25);
    expect(putt.side).toBeLessThan(0.5);
    expect(putt.side).toBeGreaterThan(0.2);
    expect(putt.back).toBeLessThan(address.back);
    expect(putt.height).toBeGreaterThan(1.4);
    expect(putt.lookAhead).toBeGreaterThan(0.7);
    expect(follow.lookAhead).toBe(0);
    expect(follow.back).toBeGreaterThan(address.back);
    const short = playCamFraming("player", 29);
    expect(short.height).toBeGreaterThan(address.height + 0.8);
    expect(short.back).toBeGreaterThan(address.back);
    expect(cameraHeightAboveGround(0.4, 0.2, 1.7)).toBeGreaterThanOrEqual(2.1);
    expect(addressLookDistance(29, 0.38)).toBeLessThan(29);
    expect(addressLookDistance(29, 0.38)).toBeGreaterThan(8);
    expect(bladeHeight("green")).toBeLessThan(bladeHeight("fairway") * 0.25);
    expect(bladeHeight("fairway")).toBeLessThan(bladeHeight("rough"));
    expect(bladeWidth("green")).toBeLessThan(bladeWidth("fairway"));
    expect(turfLush("green")).toBeLessThan(turfLush("fairway"));
    expect(turfLush("fairway")).toBeLessThan(turfLush("rough"));
    expect(bladeKeepChance("green")).toBeLessThan(bladeKeepChance("fairway"));
    expect(grassBudget("green", 11000)).toBeLessThan(grassBudget("fairway", 11000) * 0.25);
  });

  it("scales putt power with leftover distance", () => {
    expect(PUTT_ROLL_YARDS).toBe(42);
    expect(PUTT_HOLE_FILL).toBe(0.5);
    expect(suggestedPuttPower(6)).toBeLessThan(suggestedPuttPower(18));
    expect(suggestedPuttPower(6)).toBeGreaterThan(0.08);
    // Long putts are not capped short of the hole: 60 yards needs more than 40 does.
    expect(suggestedPuttPower(60)).toBeGreaterThan(suggestedPuttPower(40));
    expect(suggestedPuttPower(80)).toBeLessThanOrEqual(MAX_PUTT_POWER);
    expect(suggestedPuttPower(8)).toBeCloseTo(scaledPuttPower(PUTT_HOLE_FILL, 8), 8);
    expect(scaledPuttPower(0.5, 1.2)).toBeLessThan(0.12);
    expect(scaledPuttPower(0.5, 1.2)).toBeGreaterThan(0.02);
    expect(scaledPuttPower(1, 8)).toBeGreaterThan(scaledPuttPower(0.4, 8));
    expect(puttMeterYards(PUTT_HOLE_FILL, 10)).toBeCloseTo(10, 5);
    expect(puttPowerToMeterFill(scaledPuttPower(0.42, 7), 7)).toBeCloseTo(0.42, 5);
    expect(puttPowerToMeterFill(scaledPuttPower(0.8, 14), 14)).toBeCloseTo(0.8, 5);
    expect(shapeLabel(0.8)).toBe("Draw");
    expect(shapeLabel(-0.8)).toBe("Fade");
  });
});
