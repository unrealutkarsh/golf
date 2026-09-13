import * as THREE from "three";
import { lieAt } from "./course";
import { fbm, hashNoise } from "./look";
import { groundHeight } from "./terrain";
import type { Hole } from "./types";

export const PINE_CANOPY_LAYERS = 6;
export const OAK_CANOPY_BLOBS = 10;
export const LEAF_CARDS_PER_TREE = 16;
export const SPRAY_CARDS_PER_TREE = 12;
export const MID_RANGE_CARDS_PER_TREE = 12;
export const VOLUME_TREE_PARTS = 24;

export type TreeKind = "pine" | "oak";

export function treeKind(x: number, z: number): TreeKind {
  return fbm(x * 0.17, z * 0.17) > 0.62 ? "pine" : "oak";
}

export interface FoliageKit {
  pine: THREE.MeshStandardMaterial;
  pineLit: THREE.MeshStandardMaterial;
  oak: THREE.MeshStandardMaterial;
  oakLit: THREE.MeshStandardMaterial;
  pineCard: THREE.MeshStandardMaterial;
  pineCardB: THREE.MeshStandardMaterial;
  oakCard: THREE.MeshStandardMaterial;
  oakCardB: THREE.MeshStandardMaterial;
  bush: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  impostor: THREE.MeshStandardMaterial;
  pineBlob: THREE.BufferGeometry;
  oakBlob: THREE.BufferGeometry;
  trunk: THREE.BufferGeometry;
  card: THREE.BufferGeometry;
  branch: THREE.BufferGeometry;
}

function makeLeafCardTex(needles: boolean, seed: number): THREE.DataTexture {
  const w = 128;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  const pine: Array<[number, number, number]> = [
    [48, 82, 40],
    [62, 100, 50],
    [40, 70, 34],
    [70, 110, 54],
  ];
  const oak: Array<[number, number, number]> = [
    [56, 90, 44],
    [72, 112, 54],
    [46, 78, 36],
    [82, 122, 60],
  ];
  const tones = needles ? pine : oak;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w - 0.5;
      const v = (y + 0.5) / h - 0.5;
      const rr = Math.hypot(u / (needles ? 0.44 : 0.48), v / (needles ? 0.52 : 0.42));
      const n = hashNoise(x * 0.37 + seed, y * 0.41 + seed);
      const tone = tones[(x + y + Math.floor(n * 8)) % tones.length];
      const a = rr >= 1 ? 0 : Math.min(1, (1 - rr) * 2.4) * (0.72 + n * 0.28);
      const i = (y * w + x) * 4;
      data[i] = tone[0];
      data[i + 1] = tone[1];
      data[i + 2] = tone[2];
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeBarkTex(): THREE.DataTexture {
  const w = 64;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = hashNoise(x * 0.8, y * 0.35);
      const ridge = ((x + Math.floor(n * 4)) % 7) / 7;
      const v = 58 + ridge * 28 + n * 18;
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v * 0.72;
      data[i + 2] = v * 0.48;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function leafMat(map: THREE.DataTexture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    color: 0x4a6e38,
    transparent: true,
    alphaTest: 0.28,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0,
    depthWrite: true,
    emissive: new THREE.Color(0x101810),
    emissiveIntensity: 0.03,
  });
}

function solidFoliage(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.86,
    metalness: 0,
    flatShading: false,
    emissive: new THREE.Color(color).multiplyScalar(0.06),
    emissiveIntensity: 0.05,
  });
}

function displaceBlob(detail: number, seed: number, flatten = 0.78): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 0.86 + hashNoise(x * 2.4 + seed, z * 2.6 + seed) * 0.2 + hashNoise(y * 3.2 + seed, x * 1.6) * 0.08;
    pos.setXYZ(i, x * n, y * n * flatten, z * n);
  }
  geo.computeVertexNormals();
  return geo;
}

export function createFoliageKit(): FoliageKit {
  const pine = solidFoliage(0x3a5e2e);
  const pineLit = solidFoliage(0x547844);
  const oak = solidFoliage(0x446634);
  const oakLit = solidFoliage(0x5c8046);
  const bush = solidFoliage(0x3a5c2c);
  const pineCard = leafMat(makeLeafCardTex(true, 11));
  const pineCardB = leafMat(makeLeafCardTex(true, 41));
  const oakCard = leafMat(makeLeafCardTex(false, 27));
  const oakCardB = leafMat(makeLeafCardTex(false, 63));
  const impostor = leafMat(makeLeafCardTex(false, 9));
  const bark = new THREE.MeshStandardMaterial({
    map: makeBarkTex(),
    roughness: 0.96,
    metalness: 0,
  });
  return {
    pine,
    pineLit,
    oak,
    oakLit,
    pineCard,
    pineCardB,
    oakCard,
    oakCardB,
    bush,
    bark,
    impostor,
    pineBlob: displaceBlob(2, 2.2, 0.68),
    oakBlob: displaceBlob(2, 7.4, 0.84),
    trunk: new THREE.CylinderGeometry(0.18, 0.36, 1, 12),
    card: new THREE.PlaneGeometry(1, 1),
    branch: new THREE.CylinderGeometry(0.05, 0.1, 1, 8),
  };
}

function canopyMat(kind: TreeKind, x: number, z: number, kit: FoliageKit): THREE.MeshStandardMaterial {
  const lit = hashNoise(x, z) > 0.45;
  if (kind === "pine") return lit ? kit.pineLit : kit.pine;
  return lit ? kit.oakLit : kit.oak;
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
  const shadow = opts?.shadow ?? true;
  const compact = opts?.compact ?? false;
  const mat = canopyMat(kind, x, z, kit);
  if (kind === "pine") addPine(group, r, kit, mat, shadow, compact);
  else addOak(group, r, kit, mat, shadow, compact);
  group.position.set(x, ground, z);
  group.rotation.y = fbm(x, z) * Math.PI * 2;
  group.scale.y = 0.7 + fbm(z, x) * 0.95;
  group.scale.x = 0.82 + hashNoise(x, 3) * 0.45;
  group.scale.z = 0.8 + hashNoise(z, 5) * 0.42;
  group.userData.kind = kind;
  group.userData.volume = true;
  return group;
}

function addLeafCards(
  group: THREE.Group,
  kit: FoliageKit,
  cardMat: THREE.MeshStandardMaterial,
  alt: THREE.MeshStandardMaterial,
  w: number,
  h: number,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const card = new THREE.Mesh(kit.card, i % 2 === 0 ? cardMat : alt);
    const ring = i < count / 2 ? 0 : 1;
    const t = (i % Math.ceil(count / 2)) / Math.max(Math.ceil(count / 2) - 1, 1);
    card.scale.set(w * (0.72 + (i % 3) * 0.14), h * (0.56 + ring * 0.14), 1);
    card.position.set((hashNoise(i, 2) - 0.5) * w * 0.34, h * (0.38 + ring * 0.2 + t * 0.05), (hashNoise(i, 6) - 0.5) * w * 0.34);
    card.rotation.y = (i / count) * Math.PI * 2 + 0.2;
    card.rotation.x = (hashNoise(i, 4) - 0.5) * 0.18;
    card.castShadow = false;
    group.add(card);
  }
}

function addSprayCards(
  group: THREE.Group,
  kit: FoliageKit,
  cardMat: THREE.MeshStandardMaterial,
  w: number,
  h: number,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const card = new THREE.Mesh(kit.card, cardMat);
    card.scale.set(w * 0.46, h * 0.4, 1);
    card.position.set(Math.cos(a) * w * 0.38, h * (0.46 + (i % 3) * 0.07), Math.sin(a) * w * 0.38);
    card.rotation.y = a + 0.4;
    card.castShadow = false;
    group.add(card);
  }
}

function addPine(
  group: THREE.Group,
  r: number,
  kit: FoliageKit,
  mat: THREE.MeshStandardMaterial,
  shadow: boolean,
  compact: boolean,
): void {
  const h = 12.2 + (r - 7) * 0.95;
  const w = r * 1.08;
  const trunk = new THREE.Mesh(kit.trunk, kit.bark);
  const lean = (hashNoise(r, 2) - 0.5) * 0.08;
  trunk.scale.set(0.7 + hashNoise(r, 3) * 0.35, h * 0.64, 0.7 + hashNoise(r, 5) * 0.3);
  trunk.position.y = h * 0.3;
  trunk.rotation.z = lean;
  trunk.castShadow = shadow;
  group.add(trunk);
  const layers = compact ? 4 : PINE_CANOPY_LAYERS;
  for (let i = 0; i < layers; i++) {
    const t = i / Math.max(layers - 1, 1);
    const blob = new THREE.Mesh(kit.pineBlob, mat);
    const cw = w * (0.2 + t * 0.7);
    const ch = h * (0.1 + (1 - t) * 0.06);
    blob.scale.set(cw * 0.58, ch * 0.7, cw * (0.52 + fbm(i, r) * 0.16));
    blob.position.set((fbm(i + 2, r) - 0.5) * 1.1, h * (0.86 - t * 0.5), (fbm(r, i + 4) - 0.5) * 1.1);
    blob.rotation.set(fbm(i, 2) * 0.28, t * 1.2, (fbm(i, 3) - 0.5) * 0.16);
    blob.castShadow = shadow && i < 2;
    group.add(blob);
  }
  addLeafCards(group, kit, kit.pineCard, kit.pineCardB, w * 1.22, h * 0.9, compact ? 4 : LEAF_CARDS_PER_TREE);
  if (!compact) addSprayCards(group, kit, kit.pineCardB, w * 1.15, h * 0.88, SPRAY_CARDS_PER_TREE);
}

function addOak(
  group: THREE.Group,
  r: number,
  kit: FoliageKit,
  mat: THREE.MeshStandardMaterial,
  shadow: boolean,
  compact: boolean,
): void {
  const h = 9.4 + (r - 7) * 0.62;
  const w = r * 1.42;
  const trunk = new THREE.Mesh(kit.trunk, kit.bark);
  trunk.scale.set(1.05 + hashNoise(r, 8) * 0.35, h * 0.52, 1.05 + hashNoise(r, 9) * 0.28);
  trunk.position.y = h * 0.24;
  trunk.rotation.z = (hashNoise(r, 4) - 0.5) * 0.1;
  trunk.castShadow = shadow;
  group.add(trunk);
  const branches = compact ? 2 : 3;
  for (let i = 0; i < branches; i++) {
    const br = new THREE.Mesh(kit.branch, kit.bark);
    const a = (i / branches) * Math.PI * 2 + 0.4;
    br.scale.set(1, h * 0.32, 1);
    br.position.set(Math.cos(a) * 0.35, h * 0.42, Math.sin(a) * 0.35);
    br.rotation.z = Math.cos(a) * 0.7;
    br.rotation.x = -Math.sin(a) * 0.7;
    group.add(br);
  }
  const blobs = compact ? 6 : OAK_CANOPY_BLOBS;
  for (let i = 0; i < blobs; i++) {
    const blob = new THREE.Mesh(kit.oakBlob, mat);
    const a = (i / blobs) * Math.PI * 2 + hashNoise(i, r) * 0.5;
    const lift = 0.5 + (i % 4) * 0.09;
    const rad = w * (0.2 + (i % 5) * 0.045);
    blob.scale.set(rad * (0.42 + (i % 3) * 0.12), rad * (0.32 + (i % 2) * 0.1), rad * (0.4 + (i % 4) * 0.1));
    blob.position.set(Math.cos(a) * w * 0.34, h * lift, Math.sin(a) * w * 0.32);
    blob.rotation.set(hashNoise(i, 2) * 0.8, a, hashNoise(i, 4) * 0.6);
    blob.castShadow = shadow && i < 5;
    group.add(blob);
  }
  addLeafCards(group, kit, kit.oakCard, kit.oakCardB, w * 1.4, h * 0.84, compact ? 4 : LEAF_CARDS_PER_TREE);
  if (!compact) addSprayCards(group, kit, kit.oakCardB, w * 1.32, h * 0.8, SPRAY_CARDS_PER_TREE);
}

export function makeBush(x: number, z: number, r: number, ground: number, kit: FoliageKit): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const blob = new THREE.Mesh(kit.oakBlob, kit.bush);
    const a = (i / 4) * Math.PI * 2;
    blob.scale.set(r * (0.48 + (i % 2) * 0.12), r * 0.36, r * 0.46);
    blob.position.set(Math.cos(a) * r * 0.3, r * 0.3, Math.sin(a) * r * 0.3);
    group.add(blob);
  }
  group.position.set(x, ground, z);
  return group;
}

export function addCourseFoliage(parent: THREE.Group, kit: FoliageKit, hole: Hole): void {
  for (const tree of hole.trees) {
    parent.add(makeVolumeTree(tree.x, tree.y, tree.r * 1.32, groundHeight(hole, tree.x, tree.y), kit));
    if (fbm(tree.x, tree.y) > 0.36) {
      const jx = tree.x + (fbm(tree.x + 2, tree.y) - 0.5) * 11;
      const jz = tree.y + (fbm(tree.x, tree.y + 3) - 0.5) * 11;
      if (lieAt(hole, { x: jx, y: jz }) !== "fairway" && lieAt(hole, { x: jx, y: jz }) !== "green") {
        parent.add(makeVolumeTree(jx, jz, tree.r * 0.9, groundHeight(hole, jx, jz), kit, { compact: true }));
      }
    }
    if (fbm(tree.x * 0.3, tree.y) > 0.48) {
      parent.add(makeBush(tree.x + 3.2, tree.y - 2.4, 2.3, groundHeight(hole, tree.x + 3.2, tree.y - 2.4), kit));
    }
  }
  addInstancedWoods(parent, kit, hole);
}

function playableLie(lie: ReturnType<typeof lieAt>): boolean {
  return lie === "fairway" || lie === "green" || lie === "tee" || lie === "water";
}

function addInstancedWoods(parent: THREE.Group, kit: FoliageKit, hole: Hole): void {
  const b = hole.bounds;
  const pineTrunks: THREE.Matrix4[] = [];
  const pineDark: THREE.Matrix4[] = [];
  const pineLit: THREE.Matrix4[] = [];
  const oakTrunks: THREE.Matrix4[] = [];
  const oakDark: THREE.Matrix4[] = [];
  const oakLit: THREE.Matrix4[] = [];
  const midCards: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < 320 && n < 200; i++) {
    const cluster = Math.floor(i / 5);
    const ang = hashNoise(cluster, 0.7) * Math.PI * 2;
    const rad = 58 + hashNoise(cluster, 2.2) * 118;
    const cx = b.x + b.w * 0.5 + Math.cos(ang) * rad + (hashNoise(cluster, 3) - 0.5) * 24;
    const cz = b.y + b.h * 0.5 + Math.sin(ang) * rad + (hashNoise(cluster, 4) - 0.5) * 24;
    const x = cx + (hashNoise(i, 8) - 0.5) * 36;
    const z = cz + (hashNoise(i, 9) - 0.5) * 32;
    if (playableLie(lieAt(hole, { x, y: z }))) continue;
    const ground = groundHeight(hole, x, z);
    const kind = treeKind(x + 1, z);
    const r = 4.8 + hashNoise(i, 11) * 8.4;
    const h = kind === "pine" ? 7 + r * 0.55 + hashNoise(i, 12) * 14 : 6 + r * 0.42 + hashNoise(i, 13) * 10;
    dummy.position.set(x, ground + h * (kind === "pine" ? 0.28 : 0.22), z);
    dummy.rotation.set(0, fbm(x, z) * 6, 0);
    dummy.scale.set(kind === "pine" ? 0.75 : 1.05, h * (kind === "pine" ? 0.58 : 0.46), kind === "pine" ? 0.75 : 1.05);
    dummy.updateMatrix();
    (kind === "pine" ? pineTrunks : oakTrunks).push(dummy.matrix.clone());
    const lit = hashNoise(i, 17) > 0.48;
    const layers = kind === "pine" ? 4 : 5;
    for (let k = 0; k < layers; k++) {
      const t = k / Math.max(layers - 1, 1);
      if (kind === "pine") {
        dummy.position.set(x + (fbm(k, x) - 0.5) * 1.2, ground + h * (0.84 - t * 0.32), z + (fbm(z, k) - 0.5) * 1.2);
        dummy.rotation.set(fbm(k, 2) * 0.4, t * 1.4, (fbm(k, 5) - 0.5) * 0.2);
        dummy.scale.set(r * (0.24 + t * 0.72), h * (0.1 + (1 - t) * 0.06), r * (0.22 + t * 0.66));
        dummy.updateMatrix();
        (lit ? pineLit : pineDark).push(dummy.matrix.clone());
      } else {
        const a = (k / layers) * Math.PI * 2 + hashNoise(i + k, 3);
        dummy.position.set(x + Math.cos(a) * r * 0.38, ground + h * (0.48 + (k % 3) * 0.1), z + Math.sin(a) * r * 0.34);
        dummy.rotation.set(hashNoise(k, 2) * 0.9, a, hashNoise(k, 6) * 0.5);
        dummy.scale.set(r * (0.36 + (k % 2) * 0.1), r * 0.3, r * 0.34);
        dummy.updateMatrix();
        (lit ? oakLit : oakDark).push(dummy.matrix.clone());
      }
    }
    for (let c = 0; c < MID_RANGE_CARDS_PER_TREE; c++) {
      const a = (c / MID_RANGE_CARDS_PER_TREE) * Math.PI + 0.15;
      dummy.position.set(x + Math.cos(a * 2) * r * 0.2, ground + h * (0.4 + (c % 3) * 0.08), z + Math.sin(a * 2) * r * 0.2);
      dummy.rotation.set((hashNoise(c, 2) - 0.5) * 0.12, a, 0);
      dummy.scale.set(r * 0.7, h * 0.36, 1);
      dummy.updateMatrix();
      midCards.push(dummy.matrix.clone());
    }
    n += 1;
  }
  parent.add(makeInstanced(kit.trunk, kit.bark, pineTrunks, false));
  parent.add(makeInstanced(kit.pineBlob, kit.pine, pineDark, false));
  parent.add(makeInstanced(kit.pineBlob, kit.pineLit, pineLit, false));
  parent.add(makeInstanced(kit.trunk, kit.bark, oakTrunks, false));
  parent.add(makeInstanced(kit.oakBlob, kit.oak, oakDark, false));
  parent.add(makeInstanced(kit.oakBlob, kit.oakLit, oakLit, false));
  parent.add(makeInstanced(kit.card, kit.oakCard, midCards, false));
}

function makeInstanced(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  matrices: THREE.Matrix4[],
  shadows: boolean,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(matrices.length, 1));
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = shadows;
  mesh.frustumCulled = false;
  if (matrices.length === 0) mesh.count = 0;
  return mesh;
}

export function volumeTreeMeshCount(kind: TreeKind = "oak"): number {
  if (kind === "pine") return 1 + PINE_CANOPY_LAYERS + LEAF_CARDS_PER_TREE + SPRAY_CARDS_PER_TREE;
  return 1 + 3 + OAK_CANOPY_BLOBS + LEAF_CARDS_PER_TREE + SPRAY_CARDS_PER_TREE;
}
