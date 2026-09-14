import { describe, expect, it } from "vitest";
import { HARBOR_DUNES, inWater } from "./course";
import {
  bladeHeight,
  bladeKeepChance,
  bladeWidth,
  grassBudget,
  groundHeight,
  camFraming,
  camLabel,
  resolveCamView,
  shapeLabel,
  suggestedPuttPower,
  surfaceColor,
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
    const [r, g, b] = surfaceColor(hole, hole.green.cx, hole.green.cy);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
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
    expect(address.back).toBeLessThan(8);
    expect(address.height).toBeGreaterThan(2.4);
    expect(address.side).toBeLessThan(0.25);
    expect(putt.side).toBeLessThan(0.28);
    expect(putt.back).toBeLessThan(address.back);
    expect(putt.lookAhead).toBeGreaterThan(0.7);
    expect(follow.lookAhead).toBe(0);
    expect(follow.back).toBeGreaterThan(address.back);
    expect(bladeHeight("green")).toBeLessThan(bladeHeight("fairway") * 0.25);
    expect(bladeHeight("fairway")).toBeLessThan(bladeHeight("rough"));
    expect(bladeWidth("green")).toBeLessThan(bladeWidth("fairway"));
    expect(turfLush("green")).toBeLessThan(turfLush("fairway"));
    expect(turfLush("fairway")).toBeLessThan(turfLush("rough"));
    expect(bladeKeepChance("green")).toBeLessThan(bladeKeepChance("fairway"));
    expect(grassBudget("green", 11000)).toBeLessThan(grassBudget("fairway", 11000) * 0.25);
  });

  it("scales putt power with leftover distance", () => {
    expect(suggestedPuttPower(6)).toBeLessThan(suggestedPuttPower(18));
    expect(suggestedPuttPower(6)).toBeGreaterThan(0.13);
    expect(suggestedPuttPower(80)).toBeLessThanOrEqual(0.64);
    expect(shapeLabel(0.8)).toBe("Draw");
    expect(shapeLabel(-0.8)).toBe("Fade");
  });
});
