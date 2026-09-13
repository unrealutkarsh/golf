import * as THREE from "three";
import { lieAt } from "./course";
import { fbm, hashNoise } from "./look";
import { groundHeight } from "./terrain";
import type { Hole } from "./types";

export const PINE_CANOPY_LAYERS = 8;
export const PINE_CLUSTERS_PER_LAYER = 2;
export const OAK_CANOPY_BLOBS = 20;
export const OAK_BRANCHES = 5;
export const LEAF_CARDS_PER_TREE = 12;
export const SPRAY_CARDS_PER_TREE = 8;
export const MID_RANGE_CARDS_PER_TREE = 8;
export const TRUNK_PARTS = 2;
export const VOLUME_TREE_PARTS = 28;

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
  midBlob: THREE.BufferGeometry;
  trunk: THREE.BufferGeometry;
  flare: THREE.BufferGeometry;
  card: THREE.BufferGeometry;
  branch: THREE.BufferGeometry;
}

/** Ragged leaf-mass card — not a circular lollipop. */
function makeLeafCardTex(needles: boolean, seed: number): THREE.DataTexture {
  const w = 128;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  const pine: Array<[number, number, number]> = [
    [74, 86, 52],
    [88, 96, 58],
    [64, 76, 46],
    [96, 102, 64],
    [70, 80, 48],
  ];
  const oak: Array<[number, number, number]> = [
    [86, 92, 56],
    [98, 102, 62],
    [72, 82, 50],
    [108, 108, 68],
    [80, 88, 54],
  ];
  const tones = needles ? pine : oak;
  const clumps: Array<[number, number, number, number]> = [];
  for (let k = 0; k < (needles ? 9 : 11); k++) {
    const a = (k / 10) * Math.PI * 2 + seed * 0.2;
    const rad = 0.12 + hashNoise(k + seed, 3) * 0.28;
    clumps.push([
      Math.cos(a) * rad * 0.55,
      Math.sin(a) * rad * 0.5 + (hashNoise(k, 8) - 0.5) * 0.12,
      0.1 + hashNoise(k, 5) * 0.16,
      0.7 + hashNoise(k, 9) * 0.55,
    ]);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w - 0.5;
      const v = (y + 0.5) / h - 0.5;
      const n = hashNoise(x * 0.37 + seed, y * 0.33 + seed);
      let cover = 0;
      for (const [cx, cy, cr, wgt] of clumps) {
        const e = Math.hypot((u - cx) / cr, (v - cy) / (cr * (needles ? 1.35 : 0.92)));
        if (e < 1) cover += (1 - e) * wgt;
      }
      const holes = hashNoise(x * 2.1 + seed, y * 1.8) > (needles ? 0.16 : 0.2) ? 1 : 0.08;
      const a = Math.min(1, cover * 0.85) * holes * (0.72 + n * 0.28);
      const tone = tones[(x + y * 3 + Math.floor(n * 8)) % tones.length];
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
      const v = 52 + ht * 38 + n * 14;
      const i = (y * w + x) * 4;
      color[i] = v;
      color[i + 1] = v * 0.72;
      color[i + 2] = v * 0.5;
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
    color: 0x6a7048,
    transparent: true,
    alphaTest: 0.22,
    side: THREE.DoubleSide,
    roughness: 0.92,
    metalness: 0,
    depthWrite: true,
    emissive: new THREE.Color(0x0e1008),
    emissiveIntensity: 0.015,
  });
}

function solidFoliage(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0,
    flatShading: false,
    vertexColors: true,
    emissive: new THREE.Color(color).multiplyScalar(0.03),
    emissiveIntensity: 0.02,
  });
}

function paintBlobColors(geo: THREE.BufferGeometry, seed: number, lit: boolean): void {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const n = hashNoise(pos.getX(i) * 4.2 + seed, pos.getZ(i) * 3.8 + seed);
    const lift = lit ? 1.06 : 0.94;
    colors[i * 3] = (0.78 + n * 0.22) * lift;
    colors[i * 3 + 1] = (0.86 + n * 0.14) * lift;
    colors[i * 3 + 2] = (0.62 + n * 0.12) * lift;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function displaceBlob(detail: number, seed: number, flatten = 0.7): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n1 = hashNoise(x * 2.8 + seed, z * 3.1 + seed);
    const n2 = hashNoise(y * 4.4 + seed, x * 2.6);
    const n3 = hashNoise(z * 5.2 + seed, y * 3.7);
    let n = 0.58 + n1 * 0.38 + n2 * 0.16 + n3 * 0.1;
    if (n3 > 0.82) n *= 0.62;
    if (n1 < 0.18) n *= 0.74;
    pos.setXYZ(i, x * n, y * n * flatten, z * n * (0.88 + n2 * 0.2));
  }
  geo.computeVertexNormals();
  paintBlobColors(geo, seed, true);
  return geo;
}

function makeTrunkGeo(): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    [new THREE.Vector2(0.38, 0), new THREE.Vector2(0.26, 0.1), new THREE.Vector2(0.19, 0.48), new THREE.Vector2(0.14, 1)],
    16,
  );
}

export function createFoliageKit(): FoliageKit {
  const pine = solidFoliage(0x4a5836);
  const pineLit = solidFoliage(0x5a6840);
  const oak = solidFoliage(0x556238);
  const oakLit = solidFoliage(0x667446);
  const bush = solidFoliage(0x4a542e);
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
    pineBlob: displaceBlob(2, 2.2, 0.48),
    oakBlob: displaceBlob(2, 7.4, 0.68),
    midBlob: displaceBlob(1, 4.1, 0.62),
    trunk: makeTrunkGeo(),
    flare: new THREE.CylinderGeometry(0.4, 0.68, 0.2, 12),
    card: new THREE.PlaneGeometry(1, 1),
    branch: new THREE.CylinderGeometry(0.04, 0.095, 1, 8),
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
  group.scale.y = 0.78 + fbm(z, x) * 0.85;
  group.scale.x = 0.86 + hashNoise(x, 3) * 0.38;
  group.scale.z = 0.84 + hashNoise(z, 5) * 0.36;
  group.userData.kind = kind;
  group.userData.volume = true;
  return group;
}

function addEdgeCards(
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
    const a = (i / count) * Math.PI * 2 + hashNoise(i, 3) * 0.4;
    const lift = 0.42 + (i % 5) * 0.09 + hashNoise(i, 7) * 0.05;
    const rad = w * (0.28 + (i % 4) * 0.06);
    card.scale.set(w * (0.22 + (i % 5) * 0.04), h * (0.16 + (i % 3) * 0.03), 1);
    card.position.set(Math.cos(a) * rad, h * lift, Math.sin(a) * rad * 0.92);
    card.rotation.y = a + 0.55;
    card.rotation.x = (hashNoise(i, 4) - 0.5) * 0.35;
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
  const h = 13.4 + (r - 7) * 0.95;
  const w = r * 1.02;
  const trunk = new THREE.Mesh(kit.trunk, kit.bark);
  const lean = (hashNoise(r, 2) - 0.5) * 0.08;
  trunk.scale.set(0.72 + hashNoise(r, 3) * 0.28, h * 0.78, 0.7 + hashNoise(r, 5) * 0.24);
  trunk.position.y = h * 0.02;
  trunk.rotation.z = lean;
  trunk.castShadow = shadow;
  const flare = new THREE.Mesh(kit.flare, kit.bark);
  flare.position.y = 0.08;
  flare.scale.set(0.72 + hashNoise(r, 6) * 0.22, 1, 0.7);
  flare.castShadow = shadow;
  group.add(trunk, flare);
  const layers = compact ? 5 : PINE_CANOPY_LAYERS;
  const per = compact ? 1 : PINE_CLUSTERS_PER_LAYER;
  for (let i = 0; i < layers; i++) {
    const t = i / Math.max(layers - 1, 1);
    for (let c = 0; c < per; c++) {
      const blob = new THREE.Mesh(kit.pineBlob, mat);
      const cw = w * (0.16 + t * 0.58) * (0.72 + (c % 2) * 0.22);
      const ch = h * (0.055 + (1 - t) * 0.04);
      const a = (c / per) * Math.PI + t * 1.7 + hashNoise(i + c, r) * 0.8;
      blob.scale.set(cw * 0.38, ch * 0.55, cw * (0.3 + fbm(i, r) * 0.12));
      blob.position.set(
        Math.cos(a) * w * (0.08 + t * 0.16),
        h * (0.92 - t * 0.58) + (c % 2) * h * 0.02,
        Math.sin(a) * w * (0.08 + t * 0.15),
      );
      blob.rotation.set(fbm(i, 2) * 0.22, a, (fbm(i + c, 3) - 0.5) * 0.2);
      blob.castShadow = shadow && i < 3 && c === 0;
      group.add(blob);
    }
  }
  addEdgeCards(group, kit, kit.pineCard, kit.pineCardB, w * 0.95, h * 0.92, compact ? 4 : LEAF_CARDS_PER_TREE);
  if (!compact) addEdgeCards(group, kit, kit.pineCardB, kit.pineCard, w * 0.82, h * 0.86, SPRAY_CARDS_PER_TREE);
}

function addOak(
  group: THREE.Group,
  r: number,
  kit: FoliageKit,
  mat: THREE.MeshStandardMaterial,
  shadow: boolean,
  compact: boolean,
): void {
  const h = 10.2 + (r - 7) * 0.58;
  const w = r * 1.55;
  const trunk = new THREE.Mesh(kit.trunk, kit.bark);
  trunk.scale.set(1.28 + hashNoise(r, 8) * 0.36, h * 0.62, 1.2 + hashNoise(r, 9) * 0.28);
  trunk.position.y = h * 0.02;
  trunk.rotation.z = (hashNoise(r, 4) - 0.5) * 0.1;
  trunk.castShadow = shadow;
  const flare = new THREE.Mesh(kit.flare, kit.bark);
  flare.position.y = 0.1;
  flare.scale.set(1.2, 1, 1.1);
  flare.castShadow = shadow;
  group.add(trunk, flare);
  const branches = compact ? 3 : OAK_BRANCHES;
  for (let i = 0; i < branches; i++) {
    const br = new THREE.Mesh(kit.branch, kit.bark);
    const a = (i / branches) * Math.PI * 2 + 0.35 + hashNoise(i, r) * 0.4;
    const lift = 0.34 + (i % 3) * 0.08;
    br.scale.set(1, h * (0.22 + (i % 3) * 0.06), 1);
    br.position.set(Math.cos(a) * 0.42, h * lift, Math.sin(a) * 0.4);
    br.rotation.z = Math.cos(a) * 0.85;
    br.rotation.x = -Math.sin(a) * 0.8;
    group.add(br);
  }
  const blobs = compact ? 8 : OAK_CANOPY_BLOBS;
  for (let i = 0; i < blobs; i++) {
    const blob = new THREE.Mesh(kit.oakBlob, mat);
    const a = i * 2.399 + hashNoise(i, r) * 1.4;
    const lift = 0.4 + (i % 7) * 0.055 + hashNoise(i, 8) * 0.05;
    const rad = w * (0.1 + hashNoise(i, 3) * 0.12);
    const spread = 0.16 + (i % 6) * 0.035 + hashNoise(i, 11) * 0.04;
    blob.scale.set(rad * (0.34 + (i % 4) * 0.05), rad * (0.22 + (i % 3) * 0.04), rad * (0.3 + (i % 5) * 0.04));
    blob.position.set(Math.cos(a) * w * spread, h * lift, Math.sin(a) * w * spread * 0.92);
    blob.rotation.set(hashNoise(i, 2) * 0.9, a, hashNoise(i, 4) * 0.7);
    blob.castShadow = shadow && i < 6;
    group.add(blob);
  }
  addEdgeCards(group, kit, kit.oakCard, kit.oakCardB, w * 1.05, h * 0.86, compact ? 4 : LEAF_CARDS_PER_TREE);
  if (!compact) addEdgeCards(group, kit, kit.oakCardB, kit.oakCard, w * 0.92, h * 0.8, SPRAY_CARDS_PER_TREE);
}

export function makeBush(x: number, z: number, r: number, ground: number, kit: FoliageKit): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const blob = new THREE.Mesh(kit.oakBlob, kit.bush);
    const a = (i / 5) * Math.PI * 2;
    blob.scale.set(r * (0.38 + (i % 2) * 0.1), r * 0.28, r * 0.36);
    blob.position.set(Math.cos(a) * r * 0.28, r * 0.26, Math.sin(a) * r * 0.28);
    group.add(blob);
  }
  group.position.set(x, ground, z);
  return group;
}

export function addCourseFoliage(parent: THREE.Group, kit: FoliageKit, hole: Hole): void {
  for (const tree of hole.trees) {
    parent.add(makeVolumeTree(tree.x, tree.y, tree.r * 1.28, groundHeight(hole, tree.x, tree.y), kit));
    if (fbm(tree.x, tree.y) > 0.42) {
      const jx = tree.x + (fbm(tree.x + 2, tree.y) - 0.5) * 14;
      const jz = tree.y + (fbm(tree.x, tree.y + 3) - 0.5) * 14;
      if (lieAt(hole, { x: jx, y: jz }) !== "fairway" && lieAt(hole, { x: jx, y: jz }) !== "green") {
        parent.add(makeVolumeTree(jx, jz, tree.r * 0.82, groundHeight(hole, jx, jz), kit, { compact: true }));
      }
    }
    if (fbm(tree.x * 0.3, tree.y) > 0.52) {
      parent.add(makeBush(tree.x + 3.2, tree.y - 2.4, 2.1, groundHeight(hole, tree.x + 3.2, tree.y - 2.4), kit));
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
  const oakTrunks: THREE.Matrix4[] = [];
  const pineCanopy: THREE.Matrix4[] = [];
  const oakCanopy: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < 360 && n < 140; i++) {
    const cluster = Math.floor(i / 4);
    const ang = hashNoise(cluster, 0.7) * Math.PI * 2;
    const rad = 64 + hashNoise(cluster, 2.2) * 132;
    const cx = b.x + b.w * 0.5 + Math.cos(ang) * rad + (hashNoise(cluster, 3) - 0.5) * 36;
    const cz = b.y + b.h * 0.5 + Math.sin(ang) * rad + (hashNoise(cluster, 4) - 0.5) * 36;
    const x = cx + (hashNoise(i, 8) - 0.5) * 42;
    const z = cz + (hashNoise(i, 9) - 0.5) * 38;
    if (playableLie(lieAt(hole, { x, y: z }))) continue;
    if (hashNoise(i, 1.4) < 0.18) continue;
    const ground = groundHeight(hole, x, z);
    const kind = treeKind(x + 1, z);
    const r = 4.2 + hashNoise(i, 11) * 7.2;
    const h = kind === "pine" ? 5 + r * 0.55 + hashNoise(i, 12) * 16 : 4.2 + r * 0.42 + hashNoise(i, 13) * 12;
    dummy.position.set(x, ground + 0.04, z);
    dummy.rotation.set(0, fbm(x, z) * 6, (hashNoise(i, 14) - 0.5) * 0.1);
    dummy.scale.set(kind === "pine" ? 0.62 : 0.95, h * (kind === "pine" ? 0.68 : 0.54), kind === "pine" ? 0.62 : 0.95);
    dummy.updateMatrix();
    (kind === "pine" ? pineTrunks : oakTrunks).push(dummy.matrix.clone());
    for (let c = 0; c < MID_RANGE_CARDS_PER_TREE; c++) {
      const a = (c / MID_RANGE_CARDS_PER_TREE) * Math.PI * 2 + hashNoise(i + c, 3);
      const lift = 0.38 + (c % 5) * 0.09 + hashNoise(c, 6) * 0.06;
      const spread = r * (0.12 + (c % 4) * 0.07);
      dummy.position.set(x + Math.cos(a) * spread, ground + h * lift, z + Math.sin(a) * spread * 0.9);
      dummy.rotation.set((hashNoise(c, 2) - 0.5) * 0.5, a + hashNoise(c, 7), (hashNoise(c, 9) - 0.5) * 0.35);
      dummy.scale.set(r * (0.28 + (c % 5) * 0.08), h * (0.1 + (c % 4) * 0.035), r * (0.24 + (c % 3) * 0.06));
      dummy.updateMatrix();
      (kind === "pine" ? pineCanopy : oakCanopy).push(dummy.matrix.clone());
    }
    n += 1;
  }
  parent.add(makeInstanced(kit.trunk, kit.bark, pineTrunks, false));
  parent.add(makeInstanced(kit.trunk, kit.bark, oakTrunks, false));
  parent.add(makeInstanced(kit.midBlob, kit.oak, oakCanopy, false));
  parent.add(makeInstanced(kit.midBlob, kit.pine, pineCanopy, false));
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
  if (kind === "pine") {
    return TRUNK_PARTS + PINE_CANOPY_LAYERS * PINE_CLUSTERS_PER_LAYER + LEAF_CARDS_PER_TREE + SPRAY_CARDS_PER_TREE;
  }
  return TRUNK_PARTS + OAK_BRANCHES + OAK_CANOPY_BLOBS + LEAF_CARDS_PER_TREE + SPRAY_CARDS_PER_TREE;
}
