import * as THREE from "three";
import { hashNoise } from "./look";
import { groundHeight } from "./terrain";
import { greenRadial, turfBand } from "./turf";
import type { Hole } from "./types";

/** Full nap only inside this camera distance (yards). */
export const GREEN_BLADE_NEAR = 6;
/** Hide blades beyond this camera distance (yards). */
export const GREEN_BLADE_FAR = 14;
/** Fine nap tufts — short, wide, overlapping. */
export const GREEN_BLADE_MAX = 4800;
/** Collar / fringe tufts around the putting surface. */
export const FRINGE_BLADE_MAX = 2200;
export const FRINGE_BLADE_FAR = 26;

export function greenBladeLod(camDistYards: number): { visible: boolean; opacity: number; density: number } {
  if (camDistYards >= GREEN_BLADE_FAR) return { visible: false, opacity: 0, density: 0 };
  if (camDistYards <= GREEN_BLADE_NEAR) return { visible: true, opacity: 0.86, density: 1 };
  const t = 1 - (camDistYards - GREEN_BLADE_NEAR) / (GREEN_BLADE_FAR - GREEN_BLADE_NEAR);
  return { visible: true, opacity: 0.28 + t * 0.58, density: t * t };
}

export function shouldShowGreenBlades(putting: boolean, camDistYards: number): boolean {
  return putting && camDistYards < GREEN_BLADE_FAR;
}

function makeNapCard(): THREE.DataTexture {
  const w = 24;
  const h = 20;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w - 0.5;
      const v = (y + 0.5) / h - 0.15;
      const n = hashNoise(x * 0.8, y * 0.7);
      const ellipse = Math.hypot(u / 0.46, v / 0.38);
      const edge = Math.max(0, 1 - ellipse);
      const a = edge > 0.08 ? Math.min(1, edge * 1.15) * (0.35 + n * 0.22) : 0;
      const i = (y * w + x) * 4;
      data[i] = 118 + n * 18;
      data[i + 1] = 176 + n * 18;
      data[i + 2] = 76 + n * 12;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createBladeMaterial(): THREE.MeshStandardMaterial {
  const map = makeNapCard();
  return new THREE.MeshStandardMaterial({
    map,
    color: 0xd8f0c0,
    transparent: true,
    opacity: 0.7,
    alphaTest: 0.1,
    side: THREE.DoubleSide,
    roughness: 0.72,
    metalness: 0,
    depthWrite: false,
    emissive: new THREE.Color(0x0e180c),
    emissiveIntensity: 0.02,
  });
}

export function createFringeBladeMaterial(): THREE.MeshStandardMaterial {
  const map = makeNapCard();
  return new THREE.MeshStandardMaterial({
    map,
    color: 0xb8d8a0,
    transparent: true,
    opacity: 0.58,
    alphaTest: 0.12,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0,
    depthWrite: false,
    emissive: new THREE.Color(0x10140a),
    emissiveIntensity: 0.012,
  });
}

export function buildGreenBladeField(hole: Hole, mat: THREE.MeshStandardMaterial): THREE.InstancedMesh {
  const g = hole.green;
  const dummy = new THREE.Object3D();
  const mats: THREE.Matrix4[] = [];
  const tries = GREEN_BLADE_MAX * 3;
  for (let i = 0; i < tries && mats.length < GREEN_BLADE_MAX; i++) {
    const u = (hashNoise(i, 1.2) - 0.5) * 2.05;
    const v = (hashNoise(i, 4.8) - 0.5) * 2.05;
    const lx = u * g.rx;
    const lz = v * g.ry;
    const x = g.cx + lx * Math.cos(g.rotation) - lz * Math.sin(g.rotation);
    const z = g.cy + lx * Math.sin(g.rotation) + lz * Math.cos(g.rotation);
    if (greenRadial(hole, x, z) > 0.96) continue;
    const band = turfBand(hole, x, z);
    if (band !== "green") continue;
    const y = groundHeight(hole, x, z) + 0.004;
    const hgt = 0.0032 + hashNoise(i, 7) * 0.0042;
    const w = 0.014 + hashNoise(i, 9) * 0.012;
    dummy.position.set(x, y + hgt * 0.35, z);
    dummy.rotation.set((hashNoise(i, 2) - 0.5) * 0.55, hashNoise(i, 3) * Math.PI * 2, (hashNoise(i, 5) - 0.5) * 0.35);
    dummy.scale.set(w, hgt, 1);
    dummy.updateMatrix();
    mats.push(dummy.matrix.clone());
  }
  const geo = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(mats.length, 1));
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.userData.maxCount = mats.length;
  mesh.count = mats.length;
  mesh.visible = false;
  return mesh;
}

export function updateGreenBladeLod(
  mesh: THREE.InstancedMesh | null,
  putting: boolean,
  camDistYards: number,
): void {
  if (!mesh) return;
  const lod = greenBladeLod(camDistYards);
  const show = shouldShowGreenBlades(putting, camDistYards);
  mesh.visible = show && lod.visible;
  if (!mesh.visible) return;
  const max = (mesh.userData.maxCount as number) || mesh.count;
  mesh.count = Math.max(120, Math.floor(max * lod.density));
  const mat = mesh.material as THREE.MeshStandardMaterial;
  mat.opacity = lod.opacity;
}

export function buildFringeBladeField(hole: Hole, mat: THREE.MeshStandardMaterial): THREE.InstancedMesh {
  const g = hole.green;
  const dummy = new THREE.Object3D();
  const mats: THREE.Matrix4[] = [];
  const tries = FRINGE_BLADE_MAX * 4;
  for (let i = 0; i < tries && mats.length < FRINGE_BLADE_MAX; i++) {
    const u = (hashNoise(i, 2.2) - 0.5) * 2.6;
    const v = (hashNoise(i, 5.7) - 0.5) * 2.6;
    const lx = u * g.rx;
    const lz = v * g.ry;
    const x = g.cx + lx * Math.cos(g.rotation) - lz * Math.sin(g.rotation);
    const z = g.cy + lx * Math.sin(g.rotation) + lz * Math.cos(g.rotation);
    const band = turfBand(hole, x, z);
    if (band !== "fringe" && band !== "collar") continue;
    const y = groundHeight(hole, x, z) + 0.006;
    const hgt = 0.016 + hashNoise(i, 8) * 0.024;
    const w = 0.032 + hashNoise(i, 10) * 0.028;
    dummy.position.set(x, y + hgt * 0.4, z);
    dummy.rotation.set((hashNoise(i, 2) - 0.5) * 0.7, hashNoise(i, 3) * Math.PI * 2, (hashNoise(i, 5) - 0.5) * 0.45);
    dummy.scale.set(w, hgt, 1);
    dummy.updateMatrix();
    mats.push(dummy.matrix.clone());
  }
  const geo = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(mats.length, 1));
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.userData.maxCount = mats.length;
  mesh.count = mats.length;
  mesh.visible = false;
  return mesh;
}

export function updateFringeBladeLod(
  mesh: THREE.InstancedMesh | null,
  show: boolean,
  camDistYards: number,
): void {
  if (!mesh) return;
  if (!show || camDistYards >= FRINGE_BLADE_FAR) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  const max = (mesh.userData.maxCount as number) || mesh.count;
  const t = 1 - Math.max(0, camDistYards - 6) / Math.max(1, FRINGE_BLADE_FAR - 6);
  mesh.count = Math.max(120, Math.floor(max * (0.4 + t * 0.6)));
  const mat = mesh.material as THREE.MeshStandardMaterial;
  mat.opacity = 0.32 + t * 0.36;
}
