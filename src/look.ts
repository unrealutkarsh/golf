import { hashString, mulberry32 } from "./math";

export const SUN = {
  x: 0.62,
  y: 0.38,
};

/** Clear-day presentation for the stylized course: bright, saturated, crisp shadows, light haze only far out. */
export const SCENE_TONE = {
  clearColor: 0xb9d9ee,
  fogColor: 0xc4dcea,
  fogNear: 260,
  fogFar: 1900,
  exposureHardware: 0.86,
  exposureSoftware: 1.05,
  sunColor: 0xfff0d2,
  sunHardware: 2.1,
  sunSoftware: 2,
  hemiSkyHardware: 0xcfe6ff,
  hemiGroundHardware: 0x4f7334,
  hemiHardware: 0.85,
  hemiSkySoftware: 0xcfe6ff,
  hemiGroundSoftware: 0x4f7334,
  hemiSoftware: 1,
  ambientHardware: 0xffffff,
  ambientHardwareInt: 0,
  ambientSoftware: 0xffffff,
  ambientSoftwareInt: 0.1,
  fillSoftware: 0xdfe8d6,
  fillSoftwareInt: 0.25,
  bloomStrength: 0.04,
  bloomRadius: 0.4,
  bloomThreshold: 0.96,
  skyZenith: [0.17, 0.42, 0.8] as const,
  skyMid: [0.36, 0.6, 0.88] as const,
  skyHorizon: [0.7, 0.83, 0.92] as const,
  skyGround: [0.3, 0.44, 0.26] as const,
  skyHaze: [0.78, 0.87, 0.93] as const,
  sunGlow: 0.35,
  sunWash: 0.08,
  cloudMix: 0.55,
  aimRibbon: 0xfff2d4,
  aimRibbonOpacity: 0.68,
  landCream: 0xfff0b8,
  landWarn: 0xe0553a,
} as const;

/** Near-white speckle that breaks up flat vertex color without tinting it. */
export const NEUTRAL_DETAIL_COLORS = ["#f4f4f0", "#e9eae4", "#dfe0d9", "#ffffff", "#e4e5de"];

export const GRASS_TILE_COLORS = ["#2a4a28", "#355434", "#243c22", "#3c5830", "#2c482c", "#334c2a", "#263e22"];

export function hashNoise(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function fbm(x: number, y: number): number {
  return (
    hashNoise(x, y) * 0.5 +
    hashNoise(x * 2.1 + 8.2, y * 2.1) * 0.28 +
    hashNoise(x * 4.3 + 3.7, y * 4.3) * 0.15 +
    hashNoise(x * 8.1, y * 8.1) * 0.07
  );
}

/** Tangent-space-ish normal from four height samples. Y is up. */
export function heightToNormal(hL: number, hR: number, hD: number, hU: number, scale = 1.6): [number, number, number] {
  const nx = (hL - hR) * scale;
  const nz = (hD - hU) * scale;
  const len = Math.hypot(nx, 1, nz) || 1;
  return [nx / len, 1 / len, nz / len];
}

export function packNormalRgb(nx: number, ny: number, nz: number): [number, number, number] {
  return [nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5];
}

export function grassTile(seed: string, colors: string[], size = 128, specks = 2400): HTMLCanvasElement {
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext("2d");
  if (!ctx) throw new Error("Grass tile unavailable");
  const rng = mulberry32(hashString(seed));
  const img = ctx.createImageData(size, size);
  const parsed = colors.map((hex) => {
    const n = hex.startsWith("#") ? hex.slice(1) : hex;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  });
  const mix = (a: number[], b: number[], t: number) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n =
        hashNoise(x * 0.07 + rng() * 0.01, y * 0.07) * 0.45 +
        hashNoise(x * 0.19, y * 0.17) * 0.32 +
        hashNoise(x * 0.41, y * 0.38) * 0.23;
      const i0 = Math.floor(n * (parsed.length - 1));
      const t = n * (parsed.length - 1) - i0;
      const c = mix(parsed[i0], parsed[Math.min(parsed.length - 1, i0 + 1)], t);
      const i = (y * size + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < specks; i++) {
    const px = rng() * size;
    const py = rng() * size;
    const tone = colors[1 + Math.floor(rng() * (colors.length - 1))];
    ctx.globalAlpha = 0.08 + rng() * 0.28;
    ctx.fillStyle = tone;
    const w = 0.35 + rng() * 1.1;
    const h = 1.4 + rng() * 3.4;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rng() * Math.PI * 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  return tile;
}

export function patternFrom(ctx: CanvasRenderingContext2D, tile: HTMLCanvasElement): CanvasPattern {
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) throw new Error("Pattern unavailable");
  return pattern;
}
