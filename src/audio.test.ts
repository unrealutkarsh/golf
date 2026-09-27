import { describe, expect, it } from "vitest";
import { AudioBus, STRIKE_VOICE, hushBedGain, windBedGain } from "./audio";
import { clubFamily } from "./clubs";

describe("club contact voices", () => {
  it("groups the bag into wood, iron, wedge, and putter", () => {
    expect(clubFamily("driver")).toBe("wood");
    expect(clubFamily("wood3")).toBe("wood");
    expect(clubFamily("iron7")).toBe("iron");
    expect(clubFamily("pw")).toBe("wedge");
    expect(clubFamily("sw")).toBe("wedge");
    expect(clubFamily("putter")).toBe("putter");
  });

  it("keeps the driver heavier and lower than a wedge, and the putter quieter than both", () => {
    expect(STRIKE_VOICE.wood.bodyHz).toBeLessThan(STRIKE_VOICE.iron.bodyHz);
    expect(STRIKE_VOICE.iron.bodyHz).toBeLessThan(STRIKE_VOICE.wedge.bodyHz);
    expect(STRIKE_VOICE.wood.whooshFrom).toBeLessThan(STRIKE_VOICE.wedge.whooshFrom);
    expect(STRIKE_VOICE.putter.crackVol).toBeLessThan(STRIKE_VOICE.iron.crackVol);
    expect(STRIKE_VOICE.putter.whooshVol).toBeLessThan(STRIKE_VOICE.wood.whooshVol);
    expect(STRIKE_VOICE.wood.crackVol).toBeLessThan(0.35);
    expect(STRIKE_VOICE.wood.whooshVol).toBeGreaterThan(0.02);
  });
});

describe("ambience", () => {
  it("stays a quiet bed and ducks on the green", () => {
    expect(windBedGain(4, false)).toBeGreaterThan(0.008);
    expect(windBedGain(14, false)).toBeGreaterThan(windBedGain(4, false));
    expect(windBedGain(20, false)).toBeLessThan(0.04);
    expect(windBedGain(14, true)).toBeLessThan(windBedGain(14, false));
    expect(hushBedGain(true)).toBeGreaterThan(0);
    expect(hushBedGain(true)).toBeLessThan(0.02);
    expect(hushBedGain(false)).toBe(0);
  });

  it("respects mute and does not throw without an audio device", () => {
    const bus = new AudioBus();
    const started = bus.muted;
    expect(bus.toggle()).toBe(!started);
    expect(bus.muted).toBe(!started);
    expect(bus.toggle()).toBe(started);
    bus.muted = true;
    expect(() => bus.swing("driver", 1, "perfect")).not.toThrow();
    expect(() => bus.swing("putter", 0.4, "good")).not.toThrow();
    expect(() => bus.setAmbience(8, true)).not.toThrow();
    expect(() => bus.land("green")).not.toThrow();
    bus.muted = false;
    expect(() => bus.swing("sw", 0.7, "miss")).not.toThrow();
    expect(() => bus.setAmbience(0, false)).not.toThrow();
  });
});
