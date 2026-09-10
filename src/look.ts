import { hashString, mulberry32 } from "./math";

export const SUN = {
  x: 0.62,
  y: 0.38,
};

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

export function grassTile(seed: string, colors: string[], size = 128, specks = 2400): HTMLCanvasElement {
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext("2d");
  if (!ctx) throw new Error("Grass tile unavailable");
  const rng = mulberry32(hashString(seed));
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < specks; i++) {
    const px = rng() * size;
    const py = rng() * size;
    const tone = colors[1 + Math.floor(rng() * (colors.length - 1))];
    ctx.globalAlpha = 0.1 + rng() * 0.42;
    ctx.fillStyle = tone;
    const w = 0.6 + rng() * 2.4;
    const h = 1.1 + rng() * 3.4;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((rng() - 0.5) * 0.7);
    ctx.fillRect(-w * 0.5, -h, w, h);
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
