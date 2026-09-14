import * as THREE from "three";
import { lieAt } from "./course";
import type { ArtKit } from "./kit";
import { TREE_ASSET_COUNT } from "./kit";
import { fbm, hashNoise } from "./look";
import { groundHeight } from "./terrain";
import type { Hole } from "./types";

export { TREE_ASSET_COUNT };
export const PINE_CANOPY_LAYERS = 8;
export const PINE_CLUSTERS_PER_LAYER = 2;
export const OAK_CANOPY_BLOBS = 32;
export const MAPLE_CANOPY_BLOBS = 24;
export const OAK_BRANCHES = 5;
export const LEAF_CARDS_PER_TREE = 22;
export const SPRAY_CARDS_PER_TREE = 16;
export const MID_RANGE_CARDS_PER_TREE = 14;
export const TRUNK_PARTS = 2;
export const VOLUME_TREE_PARTS = 28;

export type TreeKind = "pine" | "oak" | "maple";

export function treeKind(x: number, z: number): TreeKind {
  const n = fbm(x * 0.17, z * 0.17);
  if (n > 0.68) return "pine";
  if (n < 0.28) return "maple";
  return "oak";
}

export interface FoliageKit {
  trees: THREE.Group[];
  leaf: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  contact: THREE.MeshBasicMaterial;
  impostor: THREE.MeshStandardMaterial;
  card: THREE.PlaneGeometry;
  ready: boolean;
}

export function createFoliageKit(): FoliageKit {
  return {
    trees: [],
    leaf: new THREE.MeshStandardMaterial({
      color: 0x4a6a32,
      transparent: true,
      alphaTest: 0.28,
      side: THREE.DoubleSide,
      roughness: 0.74,
      depthWrite: false,
    }),
    bark: new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.92 }),
    contact: new THREE.MeshBasicMaterial({
      color: 0x1a2014,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      toneMapped: false,
    }),
    impostor: new THREE.MeshStandardMaterial({
      color: 0x3a5228,
      transparent: true,
      opacity: 0.92,
      roughness: 0.86,
    }),
    card: new THREE.PlaneGeometry(1, 1),
    ready: false,
  };
}

export function bindFoliageArt(kit: FoliageKit, art: ArtKit): void {
  kit.trees = art.trees;
  kit.leaf.map = art.leaf.map;
  kit.leaf.alphaMap = art.leaf.alpha;
  kit.leaf.normalMap = art.leaf.normal;
  kit.leaf.color.set(0x8aaa58);
  kit.leaf.alphaTest = 0.32;
  kit.leaf.depthWrite = true;
  kit.leaf.needsUpdate = true;
  kit.bark.map = art.bark.map;
  kit.bark.normalMap = art.bark.normal;
  kit.bark.needsUpdate = true;
  kit.impostor.map = art.leaf.map;
  kit.impostor.alphaMap = art.leaf.alpha;
  kit.impostor.transparent = true;
  kit.impostor.alphaTest = 0.22;
  kit.impostor.side = THREE.DoubleSide;
  kit.impostor.needsUpdate = true;
  kit.ready = art.trees.length > 0;
}

function pickTemplate(kit: FoliageKit, kind: TreeKind, x: number, z: number): THREE.Group | null {
  if (!kit.trees.length) return null;
  const pines = kit.trees.filter((_, i) => i >= 5);
  const oaks = kit.trees.filter((_, i) => i < 5);
  const pool = kind === "pine" ? (pines.length ? pines : kit.trees) : oaks.length ? oaks : kit.trees;
  return pool[Math.floor(hashNoise(x, z) * pool.length) % pool.length];
}

function addLeafSpray(group: THREE.Group, kit: FoliageKit, r: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const card = new THREE.Mesh(kit.card, kit.leaf);
    const a = (i / count) * Math.PI * 2 + hashNoise(i, r) * 0.5;
    const lift = 0.42 + (i % 6) * 0.1;
    const rad = r * (0.18 + (i % 5) * 0.1);
    card.position.set(Math.cos(a) * rad, r * lift * 0.28, Math.sin(a) * rad * 0.9);
    card.rotation.set((hashNoise(i, 2) - 0.5) * 0.7, a + 0.4, (hashNoise(i, 4) - 0.5) * 0.4);
    card.scale.set(r * 0.4, r * 0.5, 1);
    card.castShadow = false;
    group.add(card);
  }
}

export function makeVolumeTree(
  x: number,
  z: number,
  r: number,
  ground: number,
  kit: FoliageKit,
  opts?: { shadow?: boolean; compact?: boolean },
): THREE.Group {
  const group = new THREE.Group();
  const kind = treeKind(x, z);
  const compact = opts?.compact ?? false;
  const src = pickTemplate(kit, kind, x, z);
  if (src) {
    const tree = src.clone(true);
    const box = new THREE.Box3().setFromObject(tree);
    const h = Math.max(0.2, box.max.y - box.min.y);
    const target = (kind === "pine" ? 18 : 15) * (0.75 + hashNoise(x, 3) * 0.5);
    tree.scale.setScalar(target / h);
    tree.position.y = -box.min.y * (target / h);
    tree.rotation.y = fbm(x, z) * Math.PI * 2;
    group.add(tree);
  } else {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.38, r * 1.15, 10), kit.bark);
    trunk.position.y = r * 0.52;
    trunk.castShadow = true;
    group.add(trunk);
  }
  if (!src && !compact) addLeafSpray(group, kit, r, kind === "pine" ? 12 : 16);
  const pad = new THREE.Mesh(kit.card, kit.contact);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.02;
  pad.scale.set(r * 0.55, r * 0.42, 1);
  group.add(pad);
  group.position.set(x, ground, z);
  group.scale.x = 0.9 + hashNoise(x, 3) * 0.28;
  group.scale.z = 0.88 + hashNoise(z, 5) * 0.3;
  group.userData.kind = kind;
  group.userData.volume = true;
  return group;
}

export function makeBush(x: number, z: number, r: number, ground: number, kit: FoliageKit): THREE.Group {
  const group = new THREE.Group();
  const src = kit.trees[0];
  if (src) {
    const bush = src.clone(true);
    bush.scale.setScalar(0.28 + r * 0.04);
    group.add(bush);
  }
  addLeafSpray(group, kit, r, 6);
  group.position.set(x, ground, z);
  return group;
}

export function addCourseFoliage(parent: THREE.Group, kit: FoliageKit, hole: Hole, opts?: { lite?: boolean }): void {
  const lite = opts?.lite ?? false;
  for (const tree of hole.trees) {
    parent.add(makeVolumeTree(tree.x, tree.y, tree.r * 1.42, groundHeight(hole, tree.x, tree.y), kit, { compact: lite }));
    if (!lite && fbm(tree.x, tree.y) > 0.42) {
      const jx = tree.x + (fbm(tree.x + 2, tree.y) - 0.5) * 14;
      const jz = tree.y + (fbm(tree.x, tree.y + 3) - 0.5) * 14;
      if (lieAt(hole, { x: jx, y: jz }) !== "fairway" && lieAt(hole, { x: jx, y: jz }) !== "green") {
        parent.add(makeVolumeTree(jx, jz, tree.r * 0.82, groundHeight(hole, jx, jz), kit, { compact: true }));
      }
    }
    if (!lite && fbm(tree.x * 0.3, tree.y) > 0.4) {
      parent.add(makeBush(tree.x + 3.2, tree.y - 2.4, 2.1, groundHeight(hole, tree.x + 3.2, tree.y - 2.4), kit));
    }
  }
  addGreenGallery(parent, kit, hole, lite);
  addTeeGallery(parent, kit, hole, lite);
  if (!lite) {
    addCorridorWalls(parent, kit, hole, lite);
    addHorizonImpostors(parent, kit, hole);
  }
}

function playableLie(lie: ReturnType<typeof lieAt>): boolean {
  return lie === "fairway" || lie === "green" || lie === "tee" || lie === "water";
}

function plantIfRough(parent: THREE.Group, kit: FoliageKit, hole: Hole, x: number, z: number, r: number, compact: boolean): boolean {
  const lie = lieAt(hole, { x, y: z });
  if (playableLie(lie) || lie === "bunker") return false;
  parent.add(makeVolumeTree(x, z, r, groundHeight(hole, x, z), kit, { compact, shadow: !compact }));
  return true;
}

function addGreenGallery(parent: THREE.Group, kit: FoliageKit, hole: Hole, lite = false): void {
  const g = hole.green;
  const toTee = Math.atan2(hole.tee.y - g.cy, hole.tee.x - g.cx);
  const back = toTee + Math.PI;
  const px = Math.cos(back);
  const pz = Math.sin(back);
  const sx = Math.cos(back + Math.PI / 2);
  const sz = Math.sin(back + Math.PI / 2);
  const nearCount = lite ? 10 : 22;
  for (let i = 0; i < nearCount; i++) {
    const lateral = ((i + 0.5) / nearCount - 0.5) * 38;
    const depth = 14 + hashNoise(i, 8) * 18 + (i % 4) * 2.6;
    plantIfRough(parent, kit, hole, g.cx + px * depth + sx * lateral, g.cy + pz * depth + sz * lateral, 7.4 + hashNoise(i, 3) * 3.2, i % 3 !== 0);
  }
  for (let i = 0; i < (lite ? 6 : 12); i++) {
    const lateral = ((i + 0.5) / 12 - 0.5) * 48;
    const depth = 42 + hashNoise(i, 11) * 28;
    plantIfRough(parent, kit, hole, g.cx + px * depth + sx * lateral, g.cy + pz * depth + sz * lateral, 9.2 + (i % 4), i % 2 === 0);
  }
}

function addTeeGallery(parent: THREE.Group, kit: FoliageKit, hole: Hole, lite = false): void {
  const aim = Math.atan2(hole.pin.y - hole.tee.y, hole.pin.x - hole.tee.x);
  const fx = Math.cos(aim);
  const fz = Math.sin(aim);
  const sx = Math.cos(aim + Math.PI / 2);
  const sz = Math.sin(aim + Math.PI / 2);
  for (let i = 0; i < (lite ? 8 : 16); i++) {
    const back = 6 + (i % 8) * 3.6;
    const side = (i % 2 === 0 ? 1 : -1) * (18 + (i % 5) * 3.1);
    plantIfRough(parent, kit, hole, hole.tee.x - fx * back + sx * side, hole.tee.y - fz * back + sz * side, 7.2 + (i % 3), true);
  }
  for (let i = 0; i < (lite ? 10 : 24); i++) {
    const t = 0.08 + (i / 24) * 0.78;
    const x0 = hole.tee.x + (hole.pin.x - hole.tee.x) * t;
    const z0 = hole.tee.y + (hole.pin.y - hole.tee.y) * t;
    const side = (i % 2 === 0 ? 1 : -1) * (26 + hashNoise(i, 2) * 8 + (i % 5));
    plantIfRough(parent, kit, hole, x0 + sx * side, z0 + sz * side, 8.0 + hashNoise(i, 4) * 2.6, i % 3 !== 0);
  }
}

function addCorridorWalls(parent: THREE.Group, kit: FoliageKit, hole: Hole, lite = false): void {
  const reach = Math.hypot(hole.pin.x - hole.tee.x, hole.pin.y - hole.tee.y) || 1;
  const fx = (hole.pin.x - hole.tee.x) / reach;
  const fz = (hole.pin.y - hole.tee.y) / reach;
  const sx = -fz;
  const sz = fx;
  const count = lite ? 14 : 24;
  for (let i = 0; i < count; i++) {
    const t = 0.05 + (i / count) * 0.9;
    const x0 = hole.tee.x + fx * reach * t;
    const z0 = hole.tee.y + fz * reach * t;
    const side = (i % 2 === 0 ? 1 : -1) * (24 + (i % 5) * 2.1 + hashNoise(i, 7) * 3.4);
    plantIfRough(parent, kit, hole, x0 + sx * side, z0 + sz * side, 8.4 + hashNoise(i, 3) * 2.8, true);
  }
}

function addHorizonImpostors(parent: THREE.Group, kit: FoliageKit, hole: Hole): void {
  const cx = (hole.tee.x + hole.pin.x) * 0.5;
  const cz = (hole.tee.y + hole.pin.y) * 0.5;
  const dummy = new THREE.Object3D();
  const mats: THREE.Matrix4[] = [];
  for (let i = 0; i < 80; i++) {
    const a = (i / 80) * Math.PI * 2 + hashNoise(i, 2) * 0.08;
    const rad = 118 + hashNoise(i, 5) * 72 + (i % 5) * 6;
    const x = cx + Math.cos(a) * rad;
    const z = cz + Math.sin(a) * rad;
    if (playableLie(lieAt(hole, { x, y: z }))) continue;
    const ground = groundHeight(hole, x, z);
    const h = 16 + hashNoise(i, 9) * 14;
    const w = 10 + hashNoise(i, 11) * 8;
    dummy.position.set(x, ground + h * 0.46, z);
    dummy.rotation.set(0, a + 0.4, (hashNoise(i, 4) - 0.5) * 0.08);
    dummy.scale.set(w, h, 1);
    dummy.updateMatrix();
    mats.push(dummy.matrix.clone());
  }
  const mesh = new THREE.InstancedMesh(kit.card, kit.impostor, Math.max(mats.length, 1));
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  if (mats.length === 0) mesh.count = 0;
  parent.add(mesh);
}

export function volumeTreeMeshCount(kind: TreeKind = "oak"): number {
  const extra = LEAF_CARDS_PER_TREE + (kind === "pine" ? 8 : 12);
  return TRUNK_PARTS + extra;
}
