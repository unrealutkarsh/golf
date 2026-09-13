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

/** Tiled grass-blade normal from a height-speckle field. */
export function grassNormalTile(seed: string, size = 128): HTMLCanvasElement {
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext("2d");
  if (!ctx) throw new Error("Grass normal unavailable");
  const rng = mulberry32(hashString(seed));
  const height = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) height[i] = 0.42;
  for (let i = 0; i < 2400; i++) {
    const px = Math.floor(rng() * size);
    const py = Math.floor(rng() * size);
    const h = 0.35 + rng() * 0.65;
    const w = 1 + Math.floor(rng() * 2);
    const len = 3 + Math.floor(rng() * 7);
    const tilt = Math.floor((rng() - 0.5) * 3);
    for (let k = 0; k < len; k++) {
      const x = (px + tilt * (k / len) + size) % size;
      const y = (py - k + size) % size;
      for (let t = 0; t < w; t++) {
        const xx = (x + t) % size;
        height[y * size + xx] = Math.max(height[y * size + xx], h * (1 - k / len));
      }
    }
  }
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = height[y * size + ((x + size - 1) % size)];
      const hR = height[y * size + ((x + 1) % size)];
      const hD = height[((y + size - 1) % size) * size + x];
      const hU = height[((y + 1) % size) * size + x];
      const [nx, ny, nz] = heightToNormal(hL, hR, hD, hU, 2.4);
      const packed = packNormalRgb(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = Math.round(packed[0] * 255);
      img.data[i + 1] = Math.round(packed[1] * 255);
      img.data[i + 2] = Math.round(packed[2] * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return tile;
}
