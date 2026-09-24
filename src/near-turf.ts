import * as THREE from "three";
import type { ClubFamily } from "./clubs";
import { hashNoise } from "./look";
import { groundHeight } from "./terrain";
import type { Hole, Lie } from "./types";

/**
 * Near surface detail is a shader on the course mesh, not a blade patch.
 * Full strength inside this camera distance (yards), gone by the end.
 * The ramp is wide so the foreground dissolves into the striped fairway.
 */
export const NEAR_FADE_START = 4;
export const NEAR_FADE_END = 36;

export interface NearGrain {
  /** World-space repeats per yard. Higher is a shorter nap. */
  scale: number;
  /** How far the close surface may leave the flat mesh color. */
  strength: number;
  /** Grazing sheen, kept small so the green stays matte. */
  sheen: number;
}

/** Short, even nap. Finer and quieter than the fairway. */
export const GREEN_NEAR_GRAIN: NearGrain = { scale: 4.4, strength: 0.42, sheen: 0.22 };
/** Living tee and fairway. Coarser, a little stronger, still one surface. */
export const FAIRWAY_NEAR_GRAIN: NearGrain = { scale: 1.7, strength: 0.72, sheen: 0.16 };

/** 1 at address, 0 once the camera has left the near turf. Smooth, no plateau cliff. */
export function nearSurfaceFade(dist: number): number {
  if (dist <= NEAR_FADE_START) return 1;
  if (dist >= NEAR_FADE_END) return 0;
  const t = (dist - NEAR_FADE_START) / (NEAR_FADE_END - NEAR_FADE_START);
  const s = t * t * (3 - 2 * t);
  return 1 - s;
}

let grainTex: THREE.CanvasTexture | null = null;

/**
 * Soft, tile-periodic color grain. Channels are data (centered on 0.5), not albedo:
 * R fine nap, G broad clumps, B soft height. No stick strokes.
 */
export function getNearGrainTexture(): THREE.CanvasTexture {
  if (grainTex) return grainTex;
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const img = ctx.createImageData(size, size);
    for (let j = 0; j < size; j++) {
      const v = (j / size) * Math.PI * 2;
      for (let i = 0; i < size; i++) {
        const u = (i / size) * Math.PI * 2;
        const fine =
          Math.sin(u * 17) * Math.cos(v * 13) * 0.45 +
          Math.sin(u * 29 + v * 7) * 0.35 +
          Math.cos(v * 23 + u * 5) * 0.2;
        const coarse =
          Math.sin(u * 3) * Math.cos(v * 2) * 0.5 +
          Math.sin(u * 5 + 1.3) * Math.cos(v * 4) * 0.35 +
          Math.sin((u + v) * 2) * 0.15;
        const height =
          Math.sin(u * 7) * Math.cos(v * 6) * 0.4 +
          Math.sin(u * 11 + v * 3) * 0.35 +
          Math.cos(v * 9) * 0.25;
        const nap = Math.sin(v * 8) * 0.15;
        const idx = (j * size + i) * 4;
        img.data[idx] = unitByte(0.5 + fine * 0.16 + nap * 0.03);
        img.data[idx + 1] = unitByte(0.5 + coarse * 0.2);
        img.data[idx + 2] = unitByte(0.5 + height * 0.22);
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  grainTex = tex;
  return tex;
}

function unitByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

export interface ScuffSpec {
  life: number;
  length: number;
  width: number;
  opacity: number;
  color: number;
  /** Yards to push the mark along aim so an iron divot starts at the ball. */
  forward: number;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Mark left in the turf after the puff sprite has faded. Longer than the puff on purpose. */
export function scuffSpec(kind: "strike" | "land", lie: Lie, family: ClubFamily): ScuffSpec {
  if (lie === "water" || lie === "ob" || family === "putter") {
    return { life: 0.2, length: 0.2, width: 0.2, opacity: 0, color: 0xffffff, forward: 0 };
  }
  const tint = lie === "bunker" ? 0xf2e6c8 : lie === "rough" ? 0xb7c6a4 : lie === "green" ? 0xf7fbf2 : 0xffffff;
  if (kind === "land") {
    const bunker = lie === "bunker";
    const green = lie === "green";
    return {
      life: 3.1,
      length: bunker ? 1.35 : green ? 0.4 : lie === "rough" ? 0.95 : 0.7,
      width: bunker ? 1.05 : green ? 0.32 : lie === "rough" ? 0.72 : 0.56,
      opacity: bunker ? 0.58 : green ? 0.55 : 0.62,
      color: tint,
      forward: 0,
    };
  }
  if (lie === "green") {
    return { life: 2.5, length: 0.46, width: 0.28, opacity: 0.52, color: tint, forward: 0.14 };
  }
  if (family === "iron" || family === "wedge") {
    const length = lie === "bunker" ? 0.9 : family === "wedge" ? 1.15 : 1.45;
    return {
      life: 3.6,
      length,
      width: lie === "bunker" ? 0.7 : 0.36,
      opacity: 0.72,
      color: tint,
      forward: length * 0.42,
    };
  }
  return { life: 2.6, length: 0.72, width: 0.52, opacity: 0.5, color: tint, forward: 0.18 };
}

/** Holds through the puff, then eases out. */
export function scuffOpacity(age: number, life: number, peak: number): number {
  if (!(age >= 0) || !(life > 0) || age >= life) return 0;
  const hold = Math.min(0.5, life * 0.22);
  if (age <= hold) return peak;
  const t = (age - hold) / (life - hold);
  return peak * (1 - t) * (1 - t);
}

export function createScuffDecal(): THREE.Mesh {
  const tex = new THREE.CanvasTexture(makeScuffCanvas());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

export function placeScuff(mesh: THREE.Mesh, hole: Hole, pos: { x: number; y: number }, aim: number, spec: ScuffSpec): void {
  const x = pos.x + Math.cos(aim) * spec.forward;
  const z = pos.y + Math.sin(aim) * spec.forward;
  mesh.position.set(x, groundHeight(hole, x, z) + 0.024, z);
  mesh.rotation.set(0, 0, 0);
  mesh.rotateX(-Math.PI / 2);
  mesh.rotateOnWorldAxis(UP, -aim);
  mesh.scale.set(Math.max(0.08, spec.length), Math.max(0.08, spec.width), 1);
  (mesh.material as THREE.MeshBasicMaterial).color.setHex(spec.color);
  mesh.visible = spec.opacity > 0;
}

function makeScuffCanvas(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / (size - 1)) * 2 - 1;
      const v = (y / (size - 1)) * 2 - 1;
      const n = hashNoise(x * 0.37, y * 0.33);
      const edge = 0.1 * (n - 0.5);
      const e = Math.hypot(u / (0.86 + edge), v / (0.58 + edge * 0.6));
      if (e > 1.05) continue;
      const soil = Math.max(0, 1 - e * 1.45);
      const lip = Math.max(0, 1 - Math.abs(e - 0.68) * 3.4);
      const alpha = Math.max(0, 1 - smooth01(Math.max(0, e - 0.72) / 0.33)) * (0.72 + n * 0.28);
      const r = 62 * soil + 150 * (1 - soil) + lip * 18;
      const g = 48 * soil + 168 * (1 - soil) + lip * 12;
      const b = 28 * soil + 78 * (1 - soil);
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, r));
      img.data[i + 1] = Math.max(0, Math.min(255, g));
      img.data[i + 2] = Math.max(0, Math.min(255, b));
      img.data[i + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 245);
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = "rgba(86, 64, 36, 0.55)";
  for (let i = 0; i < 18; i++) {
    const a = hashNoise(i, 15) * Math.PI * 2;
    const rad = 28 + hashNoise(i, 16) * 70;
    ctx.beginPath();
    ctx.ellipse(128 + Math.cos(a) * rad, 128 + Math.sin(a) * rad * 0.62, 4 + hashNoise(i, 17) * 7, 2.2, a, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

function smooth01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}
