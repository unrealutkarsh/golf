import { fbm, hashNoise } from "./look";
import type { Hole } from "./types";
import { turfBand, type TurfBand } from "./turf";

/**
 * Stylized course palette (sRGB hex). One flat, saturated look that matches the low-poly trees:
 * every surface a player needs to read — fairway, rough, green, sand — is a clearly different color.
 */
export const COURSE_PALETTE = {
  green: 0x8ccf52,
  greenStripe: 0x7cc048,
  collar: 0x62a43a,
  fringe: 0x4f8c2f,
  tee: 0x7cbd49,
  teeStripe: 0x6dad3f,
  fairway: 0x6aab3e,
  fairwayStripe: 0x5a9934,
  rough: 0x2f5f24,
  waste: 0x284f20,
  bunker: 0xeedcaa,
  water: 0x3b8fb8,
  country: 0x3a6a2b,
} as const;

/** Width of one mowing stripe, yards. */
export const FAIRWAY_STRIPE_YARDS = 7;
export const GREEN_STRIPE_YARDS = 2.4;

export function hexToLinear(hex: number): [number, number, number] {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255)];
}

export function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 0 or 1: which mowing stripe a point falls in, cut across the tee → pin line. */
export function mowStripe(hole: Hole, x: number, z: number, width = FAIRWAY_STRIPE_YARDS): 0 | 1 {
  const dx = hole.pin.x - hole.tee.x;
  const dz = hole.pin.y - hole.tee.y;
  const len = Math.hypot(dx, dz) || 1;
  const along = ((x - hole.tee.x) * dx + (z - hole.tee.y) * dz) / len;
  return Math.floor(along / width) % 2 === 0 ? 0 : 1;
}

/** Green stripes run along the green's long axis so they read from the approach. */
export function greenStripe(hole: Hole, x: number, z: number): 0 | 1 {
  const g = hole.green;
  const across = -(x - g.cx) * Math.sin(g.rotation) + (z - g.cy) * Math.cos(g.rotation);
  return Math.floor(across / GREEN_STRIPE_YARDS + 1000) % 2 === 0 ? 0 : 1;
}

export function bandHex(band: TurfBand, stripe: 0 | 1): number {
  const p = COURSE_PALETTE;
  switch (band) {
    case "green":
      return stripe ? p.greenStripe : p.green;
    case "collar":
      return p.collar;
    case "fringe":
      return p.fringe;
    case "tee":
      return stripe ? p.teeStripe : p.tee;
    case "fairway":
      return stripe ? p.fairwayStripe : p.fairway;
    case "rough":
      return p.rough;
    case "bunker":
      return p.bunker;
    case "water":
      return p.water;
    default:
      return p.waste;
  }
}

/** Linear vertex color for a point on the hole: palette band, mowing stripe, and a gentle low-frequency mottle. */
export function courseColor(hole: Hole, x: number, z: number): [number, number, number] {
  const band = turfBand(hole, x, z);
  const stripe = band === "green" || band === "collar" ? greenStripe(hole, x, z) : mowStripe(hole, x, z);
  const [r, g, b] = hexToLinear(bandHex(band, stripe));
  // Large soft patches keep big flat areas from looking like plastic; kept small so bands stay distinct.
  const mottle = band === "bunker" ? 0.97 + hashNoise(x * 0.9, z * 0.9) * 0.05 : 0.93 + fbm(x * 0.045, z * 0.045) * 0.12;
  return [r * mottle, g * mottle, b * mottle];
}

/** World scale for a billboard so it keeps roughly the same on-screen size at any distance. */
export function screenConstantScale(cameraDistance: number, perYard: number, min: number): number {
  return Math.max(min, cameraDistance * perYard);
}

/** Show the far pin marker only when the real flag is too small to find. */
export function pinMarkerOpacity(cameraDistance: number): number {
  const fadeIn = 40;
  const full = 70;
  if (cameraDistance <= fadeIn) return 0;
  if (cameraDistance >= full) return 1;
  return (cameraDistance - fadeIn) / (full - fadeIn);
}

/** Render pixel ratio, capped so 3× phones do not render 9× the pixels. */
export function renderPixelRatio(devicePixelRatio: number | undefined): number {
  return Math.min(Math.max(devicePixelRatio || 1, 1), 2);
}
