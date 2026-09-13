import * as THREE from "three";
import { hashNoise } from "./look";
import { groundHeight } from "./terrain";
import { greenRadial, turfBand } from "./turf";
import type { Hole } from "./types";

/** Show full blade field inside this camera distance (yards). */
export const GREEN_BLADE_NEAR = 8;
/** Hide blades beyond this camera distance (yards). */
export const GREEN_BLADE_FAR = 22;
/** Max instanced blade cards on a green (two crossed cards per tuft). */
export const GREEN_BLADE_MAX = 6400;

export function greenBladeLod(camDistYards: number): { visible: boolean; opacity: number; density: number } {
  if (camDistYards >= GREEN_BLADE_FAR) return { visible: false, opacity: 0, density: 0 };
  if (camDistYards <= GREEN_BLADE_NEAR) return { visible: true, opacity: 0.94, density: 1 };
  const t = 1 - (camDistYards - GREEN_BLADE_NEAR) / (GREEN_BLADE_FAR - GREEN_BLADE_NEAR);
  return { visible: true, opacity: 0.28 + t * 0.66, density: t * t };
}

export function shouldShowGreenBlades(putting: boolean, camDistYards: number): boolean {
  return putting && camDistYards < GREEN_BLADE_FAR;
}

function makeBladeCard(): THREE.DataTexture {
  const w = 32;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w - 0.5;
      const v = (y + 0.5) / h;
      const taper = 0.42 * (1 - v * 0.78);
      const edge = Math.max(0, 1 - Math.abs(u) / Math.max(taper, 0.04));
      const vein = 1 - Math.min(1, Math.abs(u) * 3.2);
      const n = hashNoise(x * 0.7, y * 0.55);
      const a = edge > 0.08 ? Math.min(1, edge * 1.15) * (0.78 + n * 0.22) : 0;
      const g = 88 + vein * 40 + n * 24;
      const r = 48 + n * 18;
      const b = 24 + n * 10;
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createBladeMaterial(): THREE.MeshStandardMaterial {
  const map = makeBladeCard();
  return new THREE.MeshStandardMaterial({
    map,
    color: 0x6e8c50,
    transparent: true,
    alphaTest: 0.28,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0,
    depthWrite: false,
    emissive: new THREE.Color(0x142414),
    emissiveIntensity: 0.04,
  });
}

export function buildGreenBladeField(hole: Hole, mat: THREE.MeshStandardMaterial): THREE.InstancedMesh {
  const g = hole.green;
  const dummy = new THREE.Object3D();
  const mats: THREE.Matrix4[] = [];
  const tufts = Math.floor(GREEN_BLADE_MAX / 2);
  const tries = tufts * 3;
  for (let i = 0; i < tries && mats.length < GREEN_BLADE_MAX - 1; i++) {
    const u = (hashNoise(i, 1.2) - 0.5) * 2.05;
    const v = (hashNoise(i, 4.8) - 0.5) * 2.05;
    const lx = u * g.rx;
    const lz = v * g.ry;
    const x = g.cx + lx * Math.cos(g.rotation) - lz * Math.sin(g.rotation);
    const z = g.cy + lx * Math.sin(g.rotation) + lz * Math.cos(g.rotation);
    if (greenRadial(hole, x, z) > 0.98) continue;
    const band = turfBand(hole, x, z);
    if (band !== "green" && band !== "collar") continue;
    const y = groundHeight(hole, x, z) + 0.01;
    const hgt = 0.05 + hashNoise(i, 7) * 0.045;
    const w = 0.028 + hashNoise(i, 9) * 0.02;
    const yaw = hashNoise(i, 3) * Math.PI * 2;
    const lean = (hashNoise(i, 5) - 0.5) * 0.22;
    dummy.position.set(x, y + hgt * 0.5, z);
    dummy.rotation.set(0, yaw, lean);
    dummy.scale.set(w, hgt, 1);
    dummy.updateMatrix();
    mats.push(dummy.matrix.clone());
    dummy.rotation.set(0, yaw + Math.PI * 0.5, lean * 0.6);
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
  mesh.count = Math.max(160, Math.floor(max * lod.density));
  const mat = mesh.material as THREE.MeshStandardMaterial;
  mat.opacity = lod.opacity;
}
