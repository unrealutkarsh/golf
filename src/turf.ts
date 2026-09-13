import * as THREE from "three";
import { lieAt, onGreen } from "./course";
import { fbm, grassNormalTile, grassTile, hashNoise, heightToNormal, packNormalRgb } from "./look";
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
      (0.13 + micro * 0.018 + n * 0.012) * nap,
      (0.44 + micro * 0.028 + n * 0.022) * nap,
      (0.16 + micro * 0.014) * nap,
    ];
  }
  if (band === "collar") {
    return [
      (0.18 + micro * 0.02) * nap,
      (0.40 + n * 0.022) * nap,
      (0.16 + micro * 0.012) * nap,
    ];
  }
  if (band === "fringe") {
    return [
      (0.30 + micro * 0.03 + clump * 0.025) * nap,
      (0.40 + n * 0.022 + micro * 0.018) * nap,
      (0.14 + micro * 0.012) * nap,
    ];
  }
  if (band === "fairway") {
    return [
      (0.22 + micro * 0.03 + n * 0.02 + clump * 0.02) * nap,
      (0.52 + micro * 0.03 + n * 0.028) * nap,
      (0.11 + micro * 0.01) * nap,
    ];
  }
  if (band === "tee") {
    return [0.22 + n * 0.025 + micro * 0.02, 0.44 + n * 0.028, 0.14 + micro * 0.012];
  }
  if (band === "rough") {
    return [0.18 + n * 0.04 + clump * 0.03, 0.32 + n * 0.035, 0.10 + n * 0.016];
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
      if (band === "green") rk = 0.16 + wet * 0.14 + micro * 0.07;
      else if (band === "collar") rk = 0.36 + wet * 0.16 + micro * 0.08;
      else if (band === "fringe") rk = 0.54 + wet * 0.14 + micro * 0.1;
      else if (band === "fairway" || band === "tee") rk = 0.5 + wet * 0.22 + micro * 0.12;
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
  const tile = grassTile("ptg-grass-detail", ["#2f5c28", "#3d7040", "#245022", "#4a7c38", "#326434", "#3a6830", "#2a5424"], 256, 6400);
  const tex = new THREE.CanvasTexture(tile);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function makeGrassDetailNormal(): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(grassNormalTile("ptg-grass-n", 128));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function createTurfMaterial(detail: THREE.CanvasTexture, detailN: THREE.CanvasTexture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.84,
    metalness: 0,
    envMapIntensity: 0.24,
    vertexColors: true,
    emissive: new THREE.Color(0x142818),
    emissiveIntensity: 0.016,
  });
  attachTurfShader(mat, detail, detailN, 72, true);
  return mat;
}

export function createGreenMaterial(detail: THREE.CanvasTexture, detailN: THREE.CanvasTexture): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    roughness: 0.38,
    metalness: 0,
    envMapIntensity: 0.36,
    sheen: 0.78,
    sheenColor: new THREE.Color(0x4a8a3c),
    sheenRoughness: 0.52,
    clearcoat: 0.07,
    clearcoatRoughness: 0.62,
    ior: 1.22,
    emissive: new THREE.Color(0x08140c),
    emissiveIntensity: 0.01,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  attachTurfShader(mat, detail, detailN, 22, false);
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
  detailN: THREE.Texture,
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
    shader.uniforms.uDetailN = { value: detailN };
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
uniform sampler2D uDetailN;
uniform float uDetailScale;
uniform vec2 uNapDir;
uniform vec3 uGreenCenter;
uniform vec3 uGreenRadii;
uniform float uCourseWide;
${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       vec2 world = vWorldPos.xz;
       float h1 = fract(sin(dot(world, vec2(127.1, 311.7))) * 43758.5453);
       float h2 = fract(sin(dot(world * 2.37, vec2(269.5, 183.3))) * 15731.2);
       float h3 = fract(sin(dot(world * 5.13, vec2(419.2, 371.9))) * 97321.1);
       float clump = h1 * 0.42 + h2 * 0.36 + h3 * 0.22;
       vec2 warp = vec2(
         sin(world.x * 0.061 + world.y * 0.093 + h1 * 6.1),
         cos(world.x * 0.077 - world.y * 0.049 + h2 * 5.3)
       ) * (1.65 + h3);
       vec2 wUv = world * 0.071 + warp * 0.28 + vec2(h1, h2) * 0.19;
       vec2 wUv2 = vec2(wUv.y * 0.69 - wUv.x * 0.73, wUv.x * 0.61 + wUv.y * 0.79) * 1.28 + 4.2;
       vec3 detail = (texture2D(uDetail, wUv).rgb + texture2D(uDetail, wUv2).rgb) * 0.5;
       float detailMix = uCourseWide > 0.5 ? 0.08 : 0.06;
       diffuseColor.rgb *= mix(vec3(1.0), detail, detailMix);
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
       float onGreen = 1.0 - smoothstep(0.86, 1.02, radial);
       float onCollar = smoothstep(0.84, 0.94, radial) * (1.0 - smoothstep(1.0, 1.08, radial));
       float onFringe = smoothstep(0.96, 1.06, radial) * (1.0 - smoothstep(1.22, 1.34, radial));
       float prox = 1.0 - smoothstep(3.2, 24.0, vlen);
       float napTerm = 0.95 + along * 0.07 + clump * 0.03;
       float wet = onGreen * smoothstep(0.22, 0.74, h2);
       diffuseColor.rgb *= mix(vec3(1.0), vec3(0.82, 1.14, 0.88) * napTerm, onGreen);
       diffuseColor.rgb *= mix(vec3(1.0), vec3(0.70, 0.86, 0.78), wet * (0.22 + prox * 0.2));
       diffuseColor.rgb *= mix(vec3(1.0), vec3(0.96, 1.06, 0.86) * (0.96 + clump * 0.04), onCollar);
       diffuseColor.rgb *= mix(vec3(1.0), vec3(1.02, 1.08, 0.78) * (0.94 + clump * 0.06 + prox * 0.06), onFringe);
       float fairway = (1.0 - onGreen) * (1.0 - onFringe) * (1.0 - onCollar);
       diffuseColor.rgb *= mix(vec3(1.0), vec3(0.96, 1.08, 0.86) * (0.97 + clump * 0.035), fairway * uCourseWide);
       float nearMix = mix(detailMix, min(0.34, detailMix + 0.24), prox * (onGreen + onFringe + onCollar));
       diffuseColor.rgb *= mix(vec3(1.0), detail, max(0.0, nearMix - detailMix));`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
       float rGrain = fract(sin(dot(vWorldPos.xz, vec2(19.1, 47.3))) * 43758.5);
       float vlenR = max(length(cameraPosition.xz - vWorldPos.xz), 0.001);
       float proxR = 1.0 - smoothstep(3.2, 24.0, vlenR);
       float wetR = smoothstep(0.28, 0.78, fract(sin(dot(vWorldPos.xz * 2.37, vec2(269.5, 183.3))) * 15731.2));
       roughnessFactor = clamp(roughnessFactor * (0.74 + rGrain * 0.18) - wetR * proxR * 0.22, 0.1, 1.0);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
       vec2 nWarp = vec2(
         sin(vWorldPos.x * 0.061 + vWorldPos.z * 0.093),
         cos(vWorldPos.x * 0.077 - vWorldPos.z * 0.049)
       ) * 1.4;
       vec2 nUv = vWorldPos.xz * 0.09 + nWarp * 0.22;
       vec2 nUv2 = vec2(nUv.y * 0.67 - nUv.x * 0.74, nUv.x * 0.58 + nUv.y * 0.81) * 1.22 + 2.4;
       vec3 dn = mix(texture2D(uDetailN, nUv).xyz, texture2D(uDetailN, nUv2).xyz, 0.5) * 2.0 - 1.0;
       float nProx = 1.0 - smoothstep(3.2, 22.0, length(cameraPosition.xz - vWorldPos.xz));
       float nAmt = (uCourseWide > 0.5 ? 0.22 : 0.56) + nProx * 0.36;
       normal = normalize(normal + dn * nAmt);`
    );
  };
  mat.customProgramCacheKey = () => `turf-nap-v13-${detailScale}-${courseWide ? "w" : "g"}`;
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
  const cols = 96;
  const rows = 72;
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
  mat.normalScale.set(2.25, 2.25);
  mat.needsUpdate = true;
  applyNapUniforms(mat, hole);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.userData.maps = maps;
  return mesh;
}
