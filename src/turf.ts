import * as THREE from "three";
import { lieAt, onGreen } from "./course";
import { fbm, grassTile, hashNoise, heightToNormal, packNormalRgb } from "./look";
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
    return 0.91 + nap * 0.09 + grain * 0.05 + clump * 0.04;
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
      (0.28 + micro * 0.05 + n * 0.03) * nap,
      (0.44 + micro * 0.04 + n * 0.03) * nap,
      (0.18 + micro * 0.02) * nap,
    ];
  }
  if (band === "collar") {
    return [
      (0.3 + micro * 0.03) * nap,
      (0.42 + n * 0.03) * nap,
      (0.18 + micro * 0.02) * nap,
    ];
  }
  if (band === "fringe") {
    return [
      (0.34 + micro * 0.05 + clump * 0.04) * nap,
      (0.44 + n * 0.03 + micro * 0.02) * nap,
      (0.16 + micro * 0.02) * nap,
    ];
  }
  if (band === "fairway") {
    return [
      (0.38 + micro * 0.06 + n * 0.04 + clump * 0.03) * nap,
      (0.52 + micro * 0.05 + n * 0.04) * nap,
      (0.17 + micro * 0.02) * nap,
    ];
  }
  if (band === "tee") {
    return [0.36 + n * 0.04 + micro * 0.05, 0.5 + n * 0.04, 0.16 + micro * 0.02];
  }
  if (band === "rough") {
    return [0.2 + n * 0.07 + clump * 0.05, 0.3 + n * 0.05, 0.1 + n * 0.02];
  }
  if (band === "bunker") {
    return [0.74 + n * 0.1 + micro * 0.08, 0.6 + n * 0.07, 0.34 + n * 0.03];
  }
  if (band === "water") {
    return [0.07, 0.24, 0.32];
  }
  return [0.5 + n * 0.1, 0.44 + n * 0.06, 0.28 + n * 0.04];
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
    if (band === "green") return n * 0.05 + micro * 0.025;
    if (band === "collar") return n * 0.09 + micro * 0.05;
    if (band === "fringe") return n * 0.14 + micro * 0.08;
    if (band === "fairway" || band === "tee") return n * 0.16 + micro * 0.12;
    if (band === "rough") return n * 0.34 + micro * 0.22;
    if (band === "bunker") return n * 0.2;
    return n * 0.28;
  };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = ox + (i / (w - 1)) * tw;
      const z = oz + (j / (h - 1)) * th;
      const band = turfBand(hole, x, z);
      const wet = Math.max(0, 0.55 - fbm(x * 0.09 + 3, z * 0.09));
      const [r, g, b] = turfAlbedoRgb(band, x, z, napX, napZ);
      let rk = 0.92;
      if (band === "green") rk = 0.42 + wet * 0.16;
      else if (band === "collar") rk = 0.55 + wet * 0.12;
      else if (band === "fringe") rk = 0.72 + wet * 0.1;
      else if (band === "fairway" || band === "tee") rk = 0.64 + wet * 0.12;
      else if (band === "rough") rk = 0.94;
      else if (band === "bunker") rk = 0.96;
      else if (band === "water") rk = 0.1;
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
      const scale = band === "green" ? 3.2 : band === "fringe" ? 2.2 : 1.5;
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
  const tile = grassTile("ptg-grass-detail", ["#5a7040", "#6a8048", "#4a6034", "#7a8c52", "#546838", "#687848", "#8a9a5c"], 256, 7800);
  const tex = new THREE.CanvasTexture(tile);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function createTurfMaterial(detail: THREE.CanvasTexture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.1,
    vertexColors: true,
    emissive: new THREE.Color(0x1a2a10),
    emissiveIntensity: 0.03,
  });
  attachTurfShader(mat, detail, 72, true);
  return mat;
}

export function createGreenMaterial(detail: THREE.CanvasTexture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.54,
    metalness: 0,
    envMapIntensity: 0.1,
    emissive: new THREE.Color(0x142818),
    emissiveIntensity: 0.03,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  attachTurfShader(mat, detail, 28, false);
  return mat;
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

function attachTurfShader(
  mat: THREE.MeshStandardMaterial,
  detail: THREE.Texture,
  detailScale: number,
  courseWide: boolean,
): void {
  const napDir = { value: new THREE.Vector2(1, 0) };
  const greenCenter = { value: new THREE.Vector3(0, 0, 0) };
  const greenRadii = { value: new THREE.Vector3(16, 12, FRINGE_OUTER) };
  mat.userData.napDir = napDir;
  mat.userData.greenCenter = greenCenter;
  mat.userData.greenRadii = greenRadii;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: detail };
    shader.uniforms.uDetailScale = { value: detailScale };
    shader.uniforms.uNapDir = napDir;
    shader.uniforms.uGreenCenter = greenCenter;
    shader.uniforms.uGreenRadii = greenRadii;
    shader.uniforms.uCourseWide = { value: courseWide ? 1 : 0 };
    shader.vertexShader = `varying vec3 vWorldPos;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
    shader.fragmentShader = `varying vec3 vWorldPos;
uniform sampler2D uDetail;
uniform float uDetailScale;
uniform vec2 uNapDir;
uniform vec3 uGreenCenter;
uniform vec3 uGreenRadii;
uniform float uCourseWide;
${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       vec3 detail = texture2D(uDetail, vMapUv * uDetailScale).rgb;
       float detailMix = uCourseWide > 0.5 ? 0.26 : 0.16;
       diffuseColor.rgb *= mix(vec3(1.0), detail * 1.12, detailMix);
       vec2 world = vWorldPos.xz;
       vec2 d = world - uGreenCenter.xy;
       float ca = cos(-uGreenCenter.z);
       float sa = sin(-uGreenCenter.z);
       vec2 local = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);
       float radial = length(local / max(uGreenRadii.xy, vec2(0.001)));
       vec2 viewXZ = cameraPosition.xz - world;
       float vlen = max(length(viewXZ), 0.001);
       vec2 viewN = viewXZ / vlen;
       vec2 nap = normalize(uNapDir);
       float along = dot(viewN, nap);
       float across = local.x * -nap.y + local.y * nap.x;
       float grain = 0.5 + 0.5 * sin(across * 9.0 + along * 1.5);
       float clump = 0.5 + 0.5 * sin(world.x * 1.7 + world.y * 1.3);
       float onGreen = 1.0 - smoothstep(0.86, 1.02, radial);
       float onCollar = smoothstep(0.84, 0.94, radial) * (1.0 - smoothstep(1.0, 1.08, radial));
       float onFringe = smoothstep(0.96, 1.06, radial) * (1.0 - smoothstep(1.22, 1.34, radial));
       float napTerm = 0.97 + along * 0.035 + grain * 0.03;
       diffuseColor.rgb *= mix(vec3(1.0), vec3(0.98, 1.0, 0.95) * napTerm, onGreen);
       diffuseColor.rgb *= mix(vec3(1.0), vec3(1.02, 1.0, 0.9) * (0.97 + grain * 0.03), onCollar);
       diffuseColor.rgb *= mix(vec3(1.0), vec3(1.03, 1.0, 0.88) * (0.96 + clump * 0.04), onFringe);
       float fairway = (1.0 - onGreen) * (1.0 - onFringe) * (1.0 - onCollar);
       float fwGrain = 0.5 + 0.5 * sin(world.x * 2.4 + world.y * 1.8);
       float fwClump = 0.5 + 0.5 * sin(world.x * 0.55 + world.y * 0.42);
       diffuseColor.rgb *= mix(vec3(1.0), vec3(1.05, 1.02, 0.9) * (0.97 + fwGrain * 0.04 + fwClump * 0.035), fairway * uCourseWide);`
    );
  };
  mat.customProgramCacheKey = () => `turf-nap-v5-${detailScale}-${courseWide ? "w" : "g"}`;
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
  const cols = 72;
  const rows = 56;
  const geo = new THREE.PlaneGeometry(tw, th, cols, rows);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const ox = g.cx - tw / 2;
  const oz = g.cy - th / 2;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const x = g.cx + lx * Math.cos(g.rotation) - lz * Math.sin(g.rotation);
    const z = g.cy + lx * Math.sin(g.rotation) + lz * Math.cos(g.rotation);
    pos.setXYZ(i, x, groundHeight(hole, x, z) + 0.018, z);
    uv.setXY(i, (x - ox) / tw, (z - oz) / th);
  }
  geo.computeVertexNormals();
  const maps = bakeTurfMaps(hole, ox, oz, tw, th, 1024);
  mat.map = maps.albedo;
  mat.roughnessMap = maps.rough;
  mat.normalMap = maps.normal;
  mat.normalScale.set(1.55, 1.55);
  mat.needsUpdate = true;
  applyNapUniforms(mat, hole);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.userData.maps = maps;
  return mesh;
}
