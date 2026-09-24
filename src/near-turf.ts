import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ClubFamily } from "./clubs";
import { hashNoise } from "./look";
import { groundHeight } from "./terrain";
import { turfBand, type TurfBand } from "./turf";
import type { Hole, Lie } from "./types";

/** Carpet radius around the ball. Farther ground stays on the stylized course mesh. */
export const NEAR_TURF_RADIUS = 22;
/** Painted fiber disc, faded before the blade ring ends. */
export const NEAR_DETAIL_RADIUS = 16;
/** Rebuild the carpet after the ball moves this far, so a putt does not realloc every frame. */
export const NEAR_TURF_MOVE = 2.1;
export const NEAR_BLADE_BUDGET = 5400;
export const NEAR_BLADE_BUDGET_SOFTWARE = 4800;
/** Share of the budget allowed to become tall rough. The rest stays short grass. */
export const NEAR_ROUGH_SHARE = 0.42;
/** Full carpet while the lens is this close to the ball (address and putt). */
export const NEAR_TURF_FULL_CAM = 11;
/** Hide the carpet once the broadcast camera has pulled out. */
export const NEAR_TURF_HIDE_CAM = 28;

const UP = new THREE.Vector3(0, 1, 0);

export function nearBladeBudget(software: boolean): number {
  return software ? NEAR_BLADE_BUDGET_SOFTWARE : NEAR_BLADE_BUDGET;
}

export function nearTurfLod(camDistYards: number): { visible: boolean; density: number; detail: number } {
  if (camDistYards >= NEAR_TURF_HIDE_CAM) return { visible: false, density: 0, detail: 0 };
  if (camDistYards <= NEAR_TURF_FULL_CAM) return { visible: true, density: 1, detail: 1 };
  const t = 1 - (camDistYards - NEAR_TURF_FULL_CAM) / (NEAR_TURF_HIDE_CAM - NEAR_TURF_FULL_CAM);
  return { visible: true, density: 0.32 + 0.68 * t * t, detail: t };
}

/** Polar sample biased toward the ball so a cut in instance count keeps the carpet underfoot. */
export function nearBladeOffset(i: number, radius = NEAR_TURF_RADIUS): { x: number; z: number; dist: number } {
  const u = hashNoise(i * 1.17, 2.2);
  const v = hashNoise(i * 0.91, 5.7);
  const dist = radius * Math.pow(u, 1.35);
  const angle = v * Math.PI * 2;
  return { x: Math.cos(angle) * dist, z: Math.sin(angle) * dist, dist };
}

export function nearBladeMetrics(band: TurfBand): { height: number; width: number; lean: number } | null {
  switch (band) {
    case "green":
      return { height: 0.062, width: 0.036, lean: 0.4 };
    case "collar":
      return { height: 0.084, width: 0.042, lean: 0.46 };
    case "fringe":
      return { height: 0.12, width: 0.05, lean: 0.54 };
    case "tee":
      return { height: 0.12, width: 0.05, lean: 0.46 };
    case "fairway":
      return { height: 0.15, width: 0.056, lean: 0.52 };
    case "rough":
      return { height: 0.28, width: 0.064, lean: 0.78 };
    default:
      return null;
  }
}

export function nearBladeKeep(band: TurfBand, n: number): boolean {
  if (!nearBladeMetrics(band)) return false;
  if (band === "rough") return n > 0.48;
  return true;
}

export function nearBladeTint(band: TurfBand, n: number): number {
  const pick = (hexes: number[]) => hexes[Math.min(hexes.length - 1, Math.floor(n * hexes.length))];
  if (band === "green" || band === "collar") return pick([0x7fbe4e, 0x98d466, 0x6aaa3c, 0x8ed25c]);
  if (band === "fringe") return pick([0x5c9a38, 0x6eae48, 0x4e882e]);
  if (band === "rough") return pick([0x3d6e28, 0x2f5a1e, 0x4e8234, 0x355e22]);
  return pick([0x62a63c, 0x78bc4a, 0x548f32, 0x8bc85a]);
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

/** Mark left in the turf after the puff sprite has faded. Longer than the puff on purpose. */
export function scuffSpec(kind: "strike" | "land", lie: Lie, family: ClubFamily): ScuffSpec {
  if (lie === "water" || lie === "ob") {
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

export interface NearTurf {
  blades: THREE.InstancedMesh;
  detail: THREE.Mesh;
  time: { value: number };
  center: THREE.Vector2;
  anchorX: number;
  anchorZ: number;
  holeKey: string;
  placed: number;
  ready: boolean;
}

export function createNearTurf(software: boolean): NearTurf {
  const budget = nearBladeBudget(software);
  const time = { value: 0 };
  const center = new THREE.Vector2();
  const blades = new THREE.InstancedMesh(makeTuftGeometry(), createNearBladeMaterial(time), budget);
  blades.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(budget * 3), 3);
  blades.count = 0;
  blades.frustumCulled = false;
  blades.renderOrder = 2;
  blades.castShadow = false;
  blades.receiveShadow = false;
  blades.visible = false;
  const detail = createDetailDisc(center);
  return {
    blades,
    detail,
    time,
    center,
    anchorX: 1e9,
    anchorZ: 1e9,
    holeKey: "",
    placed: 0,
    ready: false,
  };
}

export function refreshNearTurf(
  field: NearTurf,
  hole: Hole,
  x: number,
  z: number,
  holeKey: string,
  camDist: number,
  lie: Lie,
): void {
  field.center.set(x, z);
  const lod = nearTurfLod(camDist);
  const showDetail = lod.visible && lod.detail > 0.05 && lie !== "bunker" && lie !== "water" && lie !== "ob";
  field.detail.visible = showDetail;
  if (showDetail) (field.detail.material as THREE.MeshBasicMaterial).opacity = lod.detail;
  if (!lod.visible) {
    field.blades.visible = false;
    return;
  }
  const moved = Math.hypot(x - field.anchorX, z - field.anchorZ);
  if (field.ready && field.holeKey === holeKey && moved < NEAR_TURF_MOVE) {
    field.blades.visible = field.placed > 0;
    field.blades.count = Math.max(field.placed > 0 ? 1 : 0, Math.floor(field.placed * lod.density));
    return;
  }
  rebuildNearTurf(field, hole, x, z, holeKey, lod.density);
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

function rebuildNearTurf(field: NearTurf, hole: Hole, ax: number, az: number, holeKey: string, density: number): void {
  const capacity = field.blades.instanceMatrix.count;
  const tries = capacity * 2;
  const roughCap = Math.floor(capacity * NEAR_ROUGH_SHARE);
  const sprouts: { dist: number; x: number; z: number; band: TurfBand; i: number }[] = [];
  let rough = 0;
  for (let i = 0; i < tries; i++) {
    const off = nearBladeOffset(i);
    const x = ax + off.x;
    const z = az + off.z;
    const band = turfBand(hole, x, z);
    const n = hashNoise(i, 4.4);
    if (!nearBladeKeep(band, n)) continue;
    if (band === "rough") {
      if (rough >= roughCap) continue;
      rough += 1;
    }
    sprouts.push({ dist: off.dist, x, z, band, i });
  }
  sprouts.sort((a, b) => a.dist - b.dist);
  const placed = Math.min(capacity, sprouts.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < placed; i++) {
    const s = sprouts[i];
    const metrics = nearBladeMetrics(s.band)!;
    const thatch = s.dist < 5.5 && hashNoise(s.i, 11.2) > 0.58;
    const h = metrics.height * (0.62 + hashNoise(s.i, 7.2) * 0.75) * (thatch ? 0.42 : 1);
    const w = metrics.width * (0.78 + hashNoise(s.i, 8.4) * 0.45) * (thatch ? 2.15 : 1);
    dummy.position.set(s.x, groundHeight(hole, s.x, s.z) + 0.012, s.z);
    dummy.rotation.set(
      (hashNoise(s.i, 2.2) - (thatch ? 0.15 : 0.42)) * metrics.lean,
      hashNoise(s.i, 3.3) * Math.PI * 2,
      (hashNoise(s.i, 5.5) - 0.5) * metrics.lean * 0.65,
    );
    dummy.scale.set(w, h, 1);
    dummy.updateMatrix();
    field.blades.setMatrixAt(i, dummy.matrix);
    color.setHex(nearBladeTint(s.band, hashNoise(s.i, 6.6)));
    if (thatch) color.multiplyScalar(0.82);
    field.blades.setColorAt(i, color);
  }
  field.placed = placed;
  field.blades.count = placed > 0 ? Math.max(1, Math.floor(placed * density)) : 0;
  field.blades.instanceMatrix.needsUpdate = true;
  if (field.blades.instanceColor) field.blades.instanceColor.needsUpdate = true;
  field.blades.visible = placed > 0;
  drapeDetail(field.detail.geometry as THREE.BufferGeometry, hole, ax, az);
  field.anchorX = ax;
  field.anchorZ = az;
  field.holeKey = holeKey;
  field.ready = true;
}

function drapeDetail(geo: THREE.BufferGeometry, hole: Hole, ax: number, az: number): void {
  const local = geo.userData.local as Float32Array;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = ax + local[i * 2];
    const z = az + local[i * 2 + 1];
    pos.setXYZ(i, x, groundHeight(hole, x, z) + 0.022, z);
  }
  pos.needsUpdate = true;
}

function makeTuftGeometry(): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(1, 1);
  a.translate(0, 0.5, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const geo = mergeGeometries([a, b], false);
  a.dispose();
  b.dispose();
  if (!geo) throw new Error("Near-turf tuft failed");
  return geo;
}

function createNearBladeMaterial(time: { value: number }): THREE.MeshStandardMaterial {
  const tex = new THREE.CanvasTexture(makeBladeCanvas());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.12,
    side: THREE.DoubleSide,
    roughness: 0.84,
    metalness: 0,
    depthWrite: false,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        float bladeH = length( (instanceMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz );
      #else
        float bladeH = 0.08;
      #endif
      float tip = uv.y * uv.y;
      float phase = mvPosition.x * 0.17 + mvPosition.z * 0.13;
      float amp = bladeH * 0.42;
      mvPosition.x += sin(uTime * 1.55 + phase) * amp * tip;
      mvPosition.z += cos(uTime * 1.15 + phase * 0.8) * amp * 0.55 * tip;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  mat.customProgramCacheKey = () => "ptg-near-blade-v1";
  return mat;
}

function createDetailDisc(center: THREE.Vector2): THREE.Mesh {
  const pad = NEAR_TURF_MOVE + 1;
  const size = (NEAR_DETAIL_RADIUS + pad) * 2;
  const geo = new THREE.PlaneGeometry(size, size, 34, 34);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const local = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    local[i * 2] = pos.getX(i);
    local[i * 2 + 1] = pos.getZ(i);
  }
  geo.userData.local = local;
  const tex = new THREE.CanvasTexture(makeFiberCanvas());
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const radius = { value: NEAR_DETAIL_RADIUS };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCenter = { value: center };
    shader.uniforms.uRadius = radius;
    shader.vertexShader = `uniform vec2 uCenter;\nuniform float uRadius;\nvarying float vFade;\nvarying vec3 vWorld;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
      vec3 wpos = (modelMatrix * vec4(position, 1.0)).xyz;
      vWorld = wpos;
      #ifdef USE_MAP
        vMapUv = wpos.xz * 1.35;
      #endif
      vFade = 1.0 - smoothstep(uRadius * 0.48, uRadius, distance(wpos.xz, uCenter));`,
    );
    shader.fragmentShader = `uniform vec2 uCenter;\nvarying float vFade;\nvarying vec3 vWorld;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      float press = smoothstep(0.62, 0.08, distance(vWorld.xz, uCenter));
      diffuseColor.rgb *= mix(1.0, 0.78, press);
      diffuseColor.a *= vFade;`,
    );
  };
  mat.customProgramCacheKey = () => "ptg-near-fiber-v1";
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.visible = false;
  return mesh;
}

function makeBladeCanvas(): HTMLCanvasElement {
  const w = 64;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, w, h);
  const blades = [
    { x: 32, lean: 0.02, width: 7.2, reach: 0.96 },
    { x: 21, lean: -0.16, width: 5.4, reach: 0.78 },
    { x: 44, lean: 0.14, width: 5.1, reach: 0.84 },
    { x: 28, lean: 0.06, width: 3.6, reach: 0.62 },
  ];
  for (const blade of blades) {
    ctx.save();
    ctx.translate(blade.x, h);
    ctx.rotate(blade.lean);
    const reach = h * blade.reach;
    const g = ctx.createLinearGradient(0, 0, 0, -reach);
    g.addColorStop(0, "rgba(214, 222, 196, 0.96)");
    g.addColorStop(0.42, "rgba(244, 248, 232, 0.92)");
    g.addColorStop(1, "rgba(255, 255, 246, 0.28)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-blade.width, 0);
    ctx.quadraticCurveTo(-blade.width * 0.35, -reach * 0.55, 0, -reach);
    ctx.quadraticCurveTo(blade.width * 0.28, -reach * 0.48, blade.width * 0.82, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  return canvas;
}

function makeFiberCanvas(): HTMLCanvasElement {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    const x = hashNoise(i, 1.2) * size;
    const y = hashNoise(i, 2.4) * size;
    const rx = 18 + hashNoise(i, 3.1) * 46;
    const ry = 10 + hashNoise(i, 4.2) * 28;
    ctx.fillStyle = `rgba(${28 + hashNoise(i, 5) * 24}, ${78 + hashNoise(i, 6) * 36}, 24, 0.07)`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, hashNoise(i, 7) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = "round";
  for (let i = 0; i < 1600; i++) {
    const x = hashNoise(i, 8.1) * size;
    const y = hashNoise(i, 9.2) * size;
    const len = 28 + hashNoise(i, 10.3) * 62;
    const lean = (hashNoise(i, 11.4) - 0.5) * 18;
    const dark = hashNoise(i, 12.5) > 0.62;
    ctx.strokeStyle = dark ? "rgba(20, 42, 12, 0.62)" : "rgba(232, 244, 206, 0.46)";
    ctx.lineWidth = dark ? 1.4 + hashNoise(i, 13) * 1.3 : 1.1 + hashNoise(i, 14) * 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + lean, y - len);
    ctx.stroke();
  }
  return canvas;
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
