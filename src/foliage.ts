import * as THREE from "three";
import { lieAt } from "./course";
import { fbm, hashNoise } from "./look";
import { groundHeight } from "./terrain";
import type { Hole } from "./types";

export const PINE_CANOPY_LAYERS = 6;
export const OAK_CANOPY_BLOBS = 14;
export const LEAF_CARDS_PER_TREE = 22;
export const SPRAY_CARDS_PER_TREE = 16;
export const MID_RANGE_CARDS_PER_TREE = 16;
export const TRUNK_PARTS = 2;
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
  flare: THREE.BufferGeometry;
  card: THREE.BufferGeometry;
  branch: THREE.BufferGeometry;
}

function makeLeafCardTex(needles: boolean, seed: number): THREE.DataTexture {
  const w = 160;
  const h = 160;
  const data = new Uint8Array(w * h * 4);
  const pine: Array<[number, number, number]> = [
    [44, 74, 36],
    [58, 90, 46],
    [36, 64, 30],
    [66, 100, 50],
  ];
  const oak: Array<[number, number, number]> = [
    [52, 82, 40],
    [68, 102, 50],
    [42, 70, 34],
    [78, 112, 56],
  ];
  const tones = needles ? pine : oak;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w - 0.5;
      const v = (y + 0.5) / h - 0.5;
      const ang = Math.atan2(v, u);
      const rad = Math.hypot(u, v);
      const n = hashNoise(x * 0.31 + seed, y * 0.29 + seed);
      const lobe = needles
        ? 0.2 + 0.26 * (0.55 + 0.45 * Math.cos(ang * 5 + seed)) + n * 0.08
        : 0.28 + 0.2 * hashNoise(Math.cos(ang * 3 + seed), Math.sin(ang * 4)) + 0.1 * Math.sin(ang * 7 + seed);
      const inside = rad < lobe ? Math.min(1, (1 - rad / Math.max(lobe, 0.05)) * 2.1) : 0;
      const speckle = hashNoise(x * 1.7 + seed, y * 1.4) > (needles ? 0.22 : 0.18) ? 1 : 0.15;
      const a = inside * speckle * (0.7 + n * 0.3);
      const tone = tones[(x + y + Math.floor(n * 8)) % tones.length];
      const i = (y * w + x) * 4;
      data[i] = tone[0];
      data[i + 1] = tone[1];
      data[i + 2] = tone[2];
      data[i + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeBarkMaps(): { color: THREE.DataTexture; normal: THREE.DataTexture; rough: THREE.DataTexture } {
  const w = 64;
  const h = 128;
  const color = new Uint8Array(w * h * 4);
  const normal = new Uint8Array(w * h * 4);
  const rough = new Uint8Array(w * h * 4);
  const height = (x: number, y: number) => {
    const ridge = ((x + Math.floor(hashNoise(x, y * 0.2) * 3)) % 8) / 8;
    return ridge * 0.7 + hashNoise(x * 0.9, y * 0.4) * 0.3;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = hashNoise(x * 0.8, y * 0.35);
      const ht = height(x, y);
      const v = 48 + ht * 42 + n * 16;
      const i = (y * w + x) * 4;
      color[i] = v;
      color[i + 1] = v * 0.7;
      color[i + 2] = v * 0.46;
      color[i + 3] = 255;
      const nx = (height(x - 1, y) - height(x + 1, y)) * 2.4;
      const ny = (height(x, y - 1) - height(x, y + 1)) * 2.4;
      const len = Math.hypot(nx, 1, ny) || 1;
      normal[i] = Math.round((nx / len) * 127 + 128);
      normal[i + 1] = Math.round((1 / len) * 127 + 128);
      normal[i + 2] = Math.round((ny / len) * 127 + 128);
      normal[i + 3] = 255;
      const rk = 0.72 + ht * 0.22 + n * 0.08;
      rough[i] = rough[i + 1] = rough[i + 2] = Math.round(rk * 255);
      rough[i + 3] = 255;
    }
  }
  const colorTex = new THREE.DataTexture(color, w, h);
  colorTex.wrapS = colorTex.wrapT = THREE.RepeatWrapping;
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.needsUpdate = true;
  const normalTex = new THREE.DataTexture(normal, w, h);
  normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
  normalTex.needsUpdate = true;
  const roughTex = new THREE.DataTexture(rough, w, h);
  roughTex.wrapS = roughTex.wrapT = THREE.RepeatWrapping;
  roughTex.needsUpdate = true;
  return { color: colorTex, normal: normalTex, rough: roughTex };
}

function leafMat(map: THREE.DataTexture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    color: 0x4a6a36,
    transparent: true,
    alphaTest: 0.2,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
    depthWrite: true,
    emissive: new THREE.Color(0x0c140c),
    emissiveIntensity: 0.02,
  });
}

function solidFoliage(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0,
    flatShading: false,
    emissive: new THREE.Color(color).multiplyScalar(0.04),
    emissiveIntensity: 0.03,
  });
}

function displaceBlob(detail: number, seed: number, flatten = 0.78): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 0.78 + hashNoise(x * 3.6 + seed, z * 3.8 + seed) * 0.32 + hashNoise(y * 5.1 + seed, x * 2.2) * 0.12;
    pos.setXYZ(i, x * n, y * n * flatten, z * n);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeTrunkGeo(): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    [new THREE.Vector2(0.34, 0), new THREE.Vector2(0.24, 0.08), new THREE.Vector2(0.18, 0.45), new THREE.Vector2(0.15, 1)],
    14,
  );
}

export function createFoliageKit(): FoliageKit {
  const pine = solidFoliage(0x38582c);
  const pineLit = solidFoliage(0x4e703e);
  const oak = solidFoliage(0x416032);
  const oakLit = solidFoliage(0x567844);
  const bush = solidFoliage(0x38562a);
  const pineCard = leafMat(makeLeafCardTex(true, 11));
  const pineCardB = leafMat(makeLeafCardTex(true, 41));
  const oakCard = leafMat(makeLeafCardTex(false, 27));
  const oakCardB = leafMat(makeLeafCardTex(false, 63));
  const impostor = leafMat(makeLeafCardTex(false, 9));
  const barkMaps = makeBarkMaps();
  const bark = new THREE.MeshStandardMaterial({
    map: barkMaps.color,
    normalMap: barkMaps.normal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: barkMaps.rough,
    roughness: 0.94,
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
    pineBlob: displaceBlob(2, 2.2, 0.58),
    oakBlob: displaceBlob(2, 7.4, 0.72),
    trunk: makeTrunkGeo(),
    flare: new THREE.CylinderGeometry(0.38, 0.62, 0.18, 10),
    card: new THREE.PlaneGeometry(1, 1),
    branch: new THREE.CylinderGeometry(0.045, 0.1, 1, 8),
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
    card.scale.set(w * (0.55 + (i % 5) * 0.1), h * (0.42 + ring * 0.16 + (i % 4) * 0.04), 1);
    card.position.set((hashNoise(i, 2) - 0.5) * w * 0.42, h * (0.34 + ring * 0.22 + t * 0.06), (hashNoise(i, 6) - 0.5) * w * 0.4);
    card.rotation.y = (i / count) * Math.PI * 2 + hashNoise(i, 8) * 0.7;
    card.rotation.x = (hashNoise(i, 4) - 0.5) * 0.28;
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
    const jitter = 0.72 + hashNoise(i, 9) * 0.45;
    card.scale.set(w * 0.38 * jitter, h * 0.34 * jitter, 1);
    card.position.set(Math.cos(a) * w * 0.44, h * (0.4 + (i % 4) * 0.08), Math.sin(a) * w * 0.42);
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
  const lean = (hashNoise(r, 2) - 0.5) * 0.1;
  trunk.scale.set(0.85 + hashNoise(r, 3) * 0.4, h * 0.7, 0.85 + hashNoise(r, 5) * 0.32);
  trunk.position.y = h * 0.02;
  trunk.rotation.z = lean;
  trunk.castShadow = shadow;
  const flare = new THREE.Mesh(kit.flare, kit.bark);
  flare.position.y = 0.08;
  flare.scale.set(0.9 + hashNoise(r, 6) * 0.3, 1, 0.9);
  flare.castShadow = shadow;
  group.add(trunk, flare);
  const layers = compact ? 4 : PINE_CANOPY_LAYERS;
  for (let i = 0; i < layers; i++) {
    const t = i / Math.max(layers - 1, 1);
    const blob = new THREE.Mesh(kit.pineBlob, mat);
    const cw = w * (0.2 + t * 0.7);
    const ch = h * (0.1 + (1 - t) * 0.06);
    blob.scale.set(cw * 0.48, ch * 0.62, cw * (0.4 + fbm(i, r) * 0.2));
    blob.position.set((fbm(i + 2, r) - 0.5) * w * 0.22, h * (0.88 - t * 0.52), (fbm(r, i + 4) - 0.5) * w * 0.22);
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
  trunk.scale.set(1.2 + hashNoise(r, 8) * 0.4, h * 0.56, 1.15 + hashNoise(r, 9) * 0.32);
  trunk.position.y = h * 0.02;
  trunk.rotation.z = (hashNoise(r, 4) - 0.5) * 0.12;
  trunk.castShadow = shadow;
  const flare = new THREE.Mesh(kit.flare, kit.bark);
  flare.position.y = 0.09;
  flare.scale.set(1.15, 1, 1.05);
  flare.castShadow = shadow;
  group.add(trunk, flare);
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
    const a = i * 2.399 + hashNoise(i, r) * 1.1;
    const lift = 0.38 + (i % 6) * 0.07 + hashNoise(i, 8) * 0.06;
    const rad = w * (0.14 + hashNoise(i, 3) * 0.16);
    blob.scale.set(rad * (0.7 + (i % 3) * 0.12), rad * (0.48 + (i % 2) * 0.1), rad * (0.62 + (i % 4) * 0.1));
    blob.position.set(Math.cos(a) * w * (0.22 + (i % 5) * 0.04), h * lift, Math.sin(a) * w * (0.2 + (i % 4) * 0.04));
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
        dummy.scale.set(r * (0.18 + t * 0.55), h * (0.08 + (1 - t) * 0.05), r * (0.16 + t * 0.5));
        dummy.updateMatrix();
        (lit ? pineLit : pineDark).push(dummy.matrix.clone());
      } else {
        const a = (k / layers) * Math.PI * 2 + hashNoise(i + k, 3);
        dummy.position.set(x + Math.cos(a) * r * 0.38, ground + h * (0.48 + (k % 3) * 0.1), z + Math.sin(a) * r * 0.34);
        dummy.rotation.set(hashNoise(k, 2) * 0.9, a, hashNoise(k, 6) * 0.5);
        dummy.scale.set(r * (0.22 + (k % 3) * 0.08), r * (0.18 + (k % 2) * 0.06), r * 0.22);
        dummy.updateMatrix();
        (lit ? oakLit : oakDark).push(dummy.matrix.clone());
      }
    }
    for (let c = 0; c < MID_RANGE_CARDS_PER_TREE; c++) {
      const a = (c / MID_RANGE_CARDS_PER_TREE) * Math.PI + 0.15;
      dummy.position.set(x + Math.cos(a * 2) * r * 0.28, ground + h * (0.36 + (c % 5) * 0.07), z + Math.sin(a * 2) * r * 0.26);
      dummy.rotation.set((hashNoise(c, 2) - 0.5) * 0.22, a + hashNoise(c, 7), 0);
      dummy.scale.set(r * (0.55 + (c % 3) * 0.12), h * (0.28 + (c % 4) * 0.06), 1);
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
  parent.add(makeInstanced(kit.card, kit.pineCard, midCards.filter((_, i) => i % 2 === 0), false));
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
  if (kind === "pine") return TRUNK_PARTS + PINE_CANOPY_LAYERS + LEAF_CARDS_PER_TREE + SPRAY_CARDS_PER_TREE;
  return TRUNK_PARTS + 3 + OAK_CANOPY_BLOBS + LEAF_CARDS_PER_TREE + SPRAY_CARDS_PER_TREE;
}
