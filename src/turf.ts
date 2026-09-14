import * as THREE from "three";
import { lieAt, onGreen } from "./course";
import { COURSE_PALETTE, courseColor } from "./art";
import { fbm, grassTile, hashNoise, heightToNormal, NEUTRAL_DETAIL_COLORS, packNormalRgb } from "./look";
import { ellipseRadial } from "./math";
import { groundHeight } from "./terrain";
import type { Hole } from "./types";

/** Visual collar just inside the painted edge. */
export const COLLAR_INNER = 0.88;
/** Fringe starts at the putting-surface edge. */
export const FRINGE_INNER = 0.98;
/** Fringe fades into fairway / rough. */
export const FRINGE_OUTER = 1.3;

export type TurfBand = "green" | "collar" | "fringe" | "tee" | "fairway" | "rough" | "bunker" | "water" | "waste";

export function greenRadial(hole: Hole, x: number, z: number): number {
  return ellipseRadial({ x, y: z }, hole.green.cx, hole.green.cy, hole.green.rx, hole.green.ry, hole.green.rotation);
}

export function turfBand(hole: Hole, x: number, z: number): TurfBand {
  const p = { x, y: z };
  const lie = lieAt(hole, p);
  const radial = greenRadial(hole, x, z);
  if (lie === "water") return "water";
  if (lie === "bunker") return "bunker";
  if (lie === "green" || onGreen(hole, p)) {
    if (radial >= FRINGE_INNER) return "collar";
    if (radial >= COLLAR_INNER) return "collar";
    return "green";
  }
  if (radial < FRINGE_OUTER && lie !== "ob") return "fringe";
  if (lie === "tee") return "tee";
  if (lie === "fairway") return "fairway";
  if (lie === "rough") return "rough";
  return "waste";
}

/** View-independent nap / grain term. Subtle on purpose — mower stripes read as neon banding. */
export function napShade(band: TurfBand, x: number, z: number, napX: number, napZ: number): number {
  const across = x * -napZ + z * napX;
  if (band === "green") {
    const nap = 0.5 + 0.5 * Math.sin(across * 3.6);
    const grain = hashNoise(x * 4.2, z * 4.2);
    const clump = fbm(x * 1.6, z * 1.6);
    return 0.90 + nap * 0.08 + grain * 0.045 + clump * 0.035;
  }
  if (band === "collar") {
    const grain = hashNoise(x * 3.1, z * 3.1);
    return 0.94 + grain * 0.06;
  }
  if (band === "fringe") {
    const clump = fbm(x * 0.7, z * 0.7);
    return 0.9 + clump * 0.08;
  }
  if (band === "fairway" || band === "tee") {
    const clump = fbm(x * 0.85, z * 0.85);
    const grain = hashNoise(x * 3.8, z * 3.8);
    return 0.93 + clump * 0.06 + grain * 0.04;
  }
  return 0.94;
}

export function turfAlbedoRgb(band: TurfBand, x: number, z: number, napX: number, napZ: number): [number, number, number] {
  const n = fbm(x * 0.18, z * 0.18);
  const micro = hashNoise(x * 7.2, z * 7.2);
  const clump = fbm(x * 0.55, z * 0.55);
  const nap = napShade(band, x, z, napX, napZ);
  if (band === "green") {
    return [
      (0.16 + micro * 0.016 + n * 0.01) * nap,
      (0.32 + micro * 0.02 + n * 0.016) * nap,
      (0.14 + micro * 0.012) * nap,
    ];
  }
  if (band === "collar") {
    return [
      (0.2 + micro * 0.018) * nap,
      (0.34 + n * 0.018) * nap,
      (0.14 + micro * 0.01) * nap,
    ];
  }
  if (band === "fringe") {
    return [
      (0.28 + micro * 0.026 + clump * 0.02) * nap,
      (0.36 + n * 0.02 + micro * 0.014) * nap,
      (0.13 + micro * 0.01) * nap,
    ];
  }
  if (band === "fairway") {
    return [
      (0.2 + micro * 0.024 + n * 0.016 + clump * 0.016) * nap,
      (0.4 + micro * 0.024 + n * 0.02) * nap,
      (0.11 + micro * 0.01) * nap,
    ];
  }
  if (band === "tee") {
    return [0.2 + n * 0.02 + micro * 0.016, 0.38 + n * 0.022, 0.13 + micro * 0.01];
  }
  if (band === "rough") {
    return [0.16 + n * 0.035 + clump * 0.025, 0.28 + n * 0.03, 0.09 + n * 0.014];
  }
  if (band === "bunker") {
    return [0.74 + n * 0.1 + micro * 0.08, 0.6 + n * 0.07, 0.34 + n * 0.03];
  }
  if (band === "water") {
    return [0.07, 0.24, 0.32];
  }
  return [0.28 + n * 0.06, 0.34 + n * 0.05, 0.16 + n * 0.03];
}

export function napDirection(hole: Hole): [number, number] {
  const br = hole.greenBreak;
  const len = Math.hypot(br.x, br.y);
  if (len < 0.05) {
    const a = hole.green.rotation;
    return [Math.cos(a), Math.sin(a)];
  }
  return [br.x / len, br.y / len];
}

export function napContrast(hole: Hole, x: number, z: number): number {
  const [nx, nz] = napDirection(hole);
  const a = napShade("green", x, z, nx, nz);
  const b = napShade("green", x + 0.9, z + 0.2, nx, nz);
  return Math.abs(a - b);
}

export interface TurfMaps {
  albedo: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
}

export function bakeTurfMaps(hole: Hole, ox: number, oz: number, tw: number, th: number, res = 896): TurfMaps {
  const w = res;
  const h = res;
  const color = document.createElement("canvas");
  color.width = w;
  color.height = h;
  const rough = document.createElement("canvas");
  rough.width = w;
  rough.height = h;
  const norm = document.createElement("canvas");
  norm.width = w;
  norm.height = h;
  const cctx = color.getContext("2d");
  const rctx = rough.getContext("2d");
  const nctx = norm.getContext("2d");
  if (!cctx || !rctx || !nctx) {
    return {
      albedo: new THREE.CanvasTexture(color),
      rough: new THREE.CanvasTexture(rough),
      normal: new THREE.CanvasTexture(norm),
    };
  }
  const cimg = cctx.createImageData(w, h);
  const rimg = rctx.createImageData(w, h);
  const nimg = nctx.createImageData(w, h);
  const [napX, napZ] = napDirection(hole);
  const heightAt = (x: number, z: number) => {
    const band = turfBand(hole, x, z);
    const n = fbm(x * 0.22, z * 0.22);
    const micro = hashNoise(x * 6.4, z * 6.4);
    const blade = hashNoise(x * 18.4, z * 17.1);
    if (band === "green") return n * 0.1 + micro * 0.07 + blade * 0.045;
    if (band === "collar") return n * 0.16 + micro * 0.11 + blade * 0.055;
    if (band === "fringe") return n * 0.28 + micro * 0.18 + blade * 0.08;
    if (band === "fairway" || band === "tee") return n * 0.26 + micro * 0.2 + blade * 0.08;
    if (band === "rough") return n * 0.5 + micro * 0.34 + blade * 0.12;
    if (band === "bunker") return n * 0.34 + micro * 0.18 + hashNoise(x * 22, z * 19) * 0.1;
    return n * 0.28;
  };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = ox + (i / (w - 1)) * tw;
      const z = oz + (j / (h - 1)) * th;
      const band = turfBand(hole, x, z);
      const wet = Math.max(0, 0.62 - fbm(x * 0.07 + 3, z * 0.07)) * (0.55 + hashNoise(x * 1.3, z * 1.1) * 0.45);
      const micro = hashNoise(x * 7.2, z * 7.2);
      const [r, g, b] = turfAlbedoRgb(band, x, z, napX, napZ);
      let rk = 0.92;
      if (band === "green") rk = 0.42 + wet * 0.12 + micro * 0.08;
      else if (band === "collar") rk = 0.5 + wet * 0.14 + micro * 0.08;
      else if (band === "fringe") rk = 0.62 + wet * 0.12 + micro * 0.1;
      else if (band === "fairway" || band === "tee") rk = 0.58 + wet * 0.18 + micro * 0.1;
      else if (band === "rough") rk = 0.82 + wet * 0.08 + micro * 0.1;
      else if (band === "bunker") rk = 0.78 + micro * 0.14 + wet * 0.06;
      else if (band === "water") rk = 0.08;
      const idx = (j * w + i) * 4;
      cimg.data[idx] = Math.round(Math.min(1, r) * 255);
      cimg.data[idx + 1] = Math.round(Math.min(1, g) * 255);
      cimg.data[idx + 2] = Math.round(Math.min(1, b) * 255);
      cimg.data[idx + 3] = 255;
      const rv = Math.round(rk * 255);
      rimg.data[idx] = rv;
      rimg.data[idx + 1] = rv;
      rimg.data[idx + 2] = rv;
      rimg.data[idx + 3] = 255;
      const eps = tw / w;
      const scale = band === "green" ? 6.2 : band === "fringe" ? 4.6 : band === "collar" ? 5.0 : band === "rough" ? 2.4 : 2.1;
      const [nx, ny, nz] = heightToNormal(heightAt(x - eps, z), heightAt(x + eps, z), heightAt(x, z - eps), heightAt(x, z + eps), scale);
      const packed = packNormalRgb(nx, ny, nz);
      nimg.data[idx] = Math.round(packed[0] * 255);
      nimg.data[idx + 1] = Math.round(packed[1] * 255);
      nimg.data[idx + 2] = Math.round(packed[2] * 255);
      nimg.data[idx + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  nctx.putImageData(nimg, 0, 0);
  const albedo = new THREE.CanvasTexture(color);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.flipY = false;
  albedo.anisotropy = 8;
  albedo.needsUpdate = true;
  const roughTex = new THREE.CanvasTexture(rough);
  roughTex.flipY = false;
  roughTex.needsUpdate = true;
  const normal = new THREE.CanvasTexture(norm);
  normal.flipY = false;
  normal.anisotropy = 4;
  normal.needsUpdate = true;
  return { albedo, rough: roughTex, normal };
}

export function makeGrassDetailTex(): THREE.CanvasTexture {
  const tile = grassTile("ptg-grass-detail", [...NEUTRAL_DETAIL_COLORS], 256, 6400);
  const tex = new THREE.CanvasTexture(tile);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function createTurfMaterial(): THREE.MeshStandardMaterial {
  // Flat, matte turf: color comes from the baked palette in the vertex colors, the map only adds speckle.
  const mat = new THREE.MeshStandardMaterial({
    map: makeGrassDetailTex(),
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.05,
    vertexColors: true,
  });
  attachWorldUv(mat, 0.05);
  return mat;
}

export function createCountryMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: makeGrassDetailTex(),
    color: COURSE_PALETTE.country,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.05,
  });
  attachWorldUv(mat, 0.022);
  return mat;
}

export function createSandMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: COURSE_PALETTE.bunker,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.05,
  });
  attachWorldUv(mat, 0.09);
  return mat;
}

export function createGreenMaterial(): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    map: makeGrassDetailTex(),
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.05,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  attachWorldUv(mat, 0.12);
  return mat;
}

/** Repeat albedo / normal / roughness in world XZ so a hole-sized mesh does not stretch one tile. */
function attachWorldUv(mat: THREE.MeshStandardMaterial, scale: number): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWorldScale = { value: scale };
    shader.vertexShader = `uniform float uWorldScale;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
       vec2 worldUv = (modelMatrix * vec4(position, 1.0)).xz * uWorldScale;
       #ifdef USE_MAP
         vMapUv = worldUv;
       #endif
       #ifdef USE_NORMALMAP
         vNormalMapUv = worldUv;
       #endif
       #ifdef USE_ROUGHNESSMAP
         vRoughnessMapUv = worldUv;
       #endif
       #ifdef USE_AOMAP
         vAoMapUv = worldUv;
       #endif`,
    );
  };
  mat.customProgramCacheKey = () => `ptg-world-uv-v2-${scale}`;
}

export interface NapUniforms {
  napDir: THREE.Vector2;
  greenCenter: THREE.Vector3;
  greenRadii: THREE.Vector3;
}

export function createNapUniforms(hole: Hole): NapUniforms {
  const [nx, nz] = napDirection(hole);
  return {
    napDir: new THREE.Vector2(nx, nz),
    greenCenter: new THREE.Vector3(hole.green.cx, hole.green.cy, hole.green.rotation),
    greenRadii: new THREE.Vector3(hole.green.rx, hole.green.ry, FRINGE_OUTER),
  };
}

export function applyNapUniforms(mat: THREE.MeshStandardMaterial, hole: Hole): void {
  const [nx, nz] = napDirection(hole);
  const napDir = mat.userData.napDir as { value: THREE.Vector2 } | undefined;
  const greenCenter = mat.userData.greenCenter as { value: THREE.Vector3 } | undefined;
  const greenRadii = mat.userData.greenRadii as { value: THREE.Vector3 } | undefined;
  if (napDir) napDir.value.set(nx, nz);
  if (greenCenter) greenCenter.value.set(hole.green.cx, hole.green.cy, hole.green.rotation);
  if (greenRadii) greenRadii.value.set(hole.green.rx, hole.green.ry, FRINGE_OUTER);
}

export function buildGreenOverlay(hole: Hole, mat: THREE.MeshStandardMaterial): THREE.Mesh {
  const g = hole.green;
  const pad = 1.55;
  const tw = g.rx * 2 * pad;
  const th = g.ry * 2 * pad;
  const cols = 64;
  const rows = 48;
  const geo = new THREE.PlaneGeometry(tw, th, cols, rows);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const x = g.cx + lx * Math.cos(g.rotation) - lz * Math.sin(g.rotation);
    const z = g.cy + lx * Math.sin(g.rotation) + lz * Math.cos(g.rotation);
    pos.setXYZ(i, x, groundHeight(hole, x, z) + 0.018, z);
  }
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const [r, gr, b] = courseColor(hole, pos.getX(i), pos.getZ(i));
    colors.set([r, gr, b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}
