import * as THREE from "three";
import { lieAt } from "./course";
import { fbm, hashNoise } from "./look";
import { groundHeight } from "./terrain";
import type { Hole } from "./types";

export const PINE_CANOPY_LAYERS = 6;
export const OAK_CANOPY_BLOBS = 10;
export const LEAF_CARDS_PER_TREE = 4;
export const VOLUME_TREE_PARTS = 16;

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
  oakCard: THREE.MeshStandardMaterial;
  bush: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  impostor: THREE.MeshStandardMaterial;
  pineBlob: THREE.BufferGeometry;
  oakBlob: THREE.BufferGeometry;
  trunk: THREE.BufferGeometry;
  card: THREE.BufferGeometry;
  branch: THREE.BufferGeometry;
}

function paintLeafCluster(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tones: Array<[number, number, number]>,
  seed: number,
  needles: boolean,
): void {
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.5;
  const base = ctx.createRadialGradient(cx, cy * 0.92, w * 0.08, cx, cy, w * 0.48);
  base.addColorStop(0, `rgb(${tones[1][0]},${tones[1][1]},${tones[1][2]})`);
  base.addColorStop(0.55, `rgb(${tones[0][0]},${tones[0][1]},${tones[0][2]})`);
  base.addColorStop(1, `rgb(${tones[2][0]},${tones[2][1]},${tones[2][2]})`);
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.4, h * (needles ? 0.42 : 0.38), 0, 0, Math.PI * 2);
  ctx.fill();
  const stamps = needles ? 980 : 760;
  for (let i = 0; i < stamps; i++) {
    const u = hashNoise(seed + i, 1.7);
    const v = hashNoise(seed + i, 4.2);
    const ang = u * Math.PI * 2;
    const rad = Math.pow(v, 0.55) * (needles ? 0.46 : 0.44);
    const x = cx + Math.cos(ang) * rad * w;
    const y = cy + Math.sin(ang) * rad * h * (needles ? 1.05 : 0.92);
    const tone = tones[(i + Math.floor(u * 8)) % tones.length];
    ctx.fillStyle = `rgba(${tone[0]},${tone[1]},${tone[2]},0.88)`;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + (hashNoise(i, 3) - 0.5) * 1.15);
    if (needles) {
      ctx.fillRect(-1.8, -12 - hashNoise(i, 5) * 10, 3.6, 18 + hashNoise(i, 6) * 12);
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, 6 + hashNoise(i, 2) * 9, 8 + hashNoise(i, 8) * 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalCompositeOperation = "destination-in";
  const falloff = ctx.createRadialGradient(cx, cy, w * 0.18, cx, cy, w * 0.49);
  falloff.addColorStop(0, "rgba(255,255,255,1)");
  falloff.addColorStop(0.78, "rgba(255,255,255,1)");
  falloff.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = falloff;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}

function makeFoliageCard(needles: boolean, seed: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 384;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const pine: Array<[number, number, number]> = [
    [46, 92, 40],
    [68, 122, 52],
    [32, 72, 30],
    [86, 140, 62],
    [54, 104, 44],
    [40, 84, 36],
  ];
  const oak: Array<[number, number, number]> = [
    [58, 108, 44],
    [84, 140, 58],
    [42, 86, 34],
    [102, 156, 70],
    [70, 122, 50],
    [50, 96, 40],
  ];
  paintLeafCluster(ctx, 384, 384, needles ? pine : oak, seed, needles);
  return c;
}

function makeImpostorCard(seed: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 320;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.clearRect(0, 0, 256, 320);
  ctx.fillStyle = "#4a3424";
  ctx.beginPath();
  ctx.moveTo(118, 168);
  ctx.lineTo(138, 168);
  ctx.lineTo(146, 314);
  ctx.lineTo(110, 314);
  ctx.closePath();
  ctx.fill();
  const pine = hashNoise(seed, 2) > 0.55;
  const tones: Array<[number, number, number]> = pine
    ? [
        [42, 86, 36],
        [64, 114, 48],
        [30, 68, 28],
        [78, 128, 56],
        [52, 98, 42],
      ]
    : [
        [56, 104, 44],
        [80, 132, 56],
        [40, 82, 34],
        [96, 148, 66],
        [68, 118, 50],
      ];
  if (pine) {
    for (let row = 0; row < 7; row++) {
      const t = row / 6;
      const y = 36 + t * 188;
      const rx = 18 + t * 64 + (hashNoise(seed + row, 4) - 0.5) * 10;
      ctx.fillStyle = `rgb(${tones[row % tones.length][0]},${tones[row % tones.length][1]},${tones[row % tones.length][2]})`;
      ctx.beginPath();
      ctx.ellipse(128 + (hashNoise(row, 8) - 0.5) * 8, y, rx, 20 + t * 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = `rgb(${tones[0][0]},${tones[0][1]},${tones[0][2]})`;
    ctx.beginPath();
    ctx.ellipse(128, 124, 82, 70, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 14; i++) {
      const tone = tones[i % tones.length];
      ctx.fillStyle = `rgb(${tone[0]},${tone[1]},${tone[2]})`;
      ctx.beginPath();
      ctx.ellipse(128 + (hashNoise(seed + i, 3) - 0.5) * 96, 96 + hashNoise(seed + i, 4) * 78, 26 + hashNoise(i, 5) * 20, 22 + hashNoise(i, 6) * 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c;
}

function makeBarkCard(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 192;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#5a4430";
  ctx.fillRect(0, 0, 96, 192);
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = i % 3 === 0 ? "#463424" : i % 3 === 1 ? "#6a5440" : "#3a2c20";
    ctx.fillRect(hashNoise(i, 1) * 96, i * 2.4, 2 + hashNoise(i, 2) * 5, 16 + hashNoise(i, 3) * 10);
  }
  return c;
}

function cutout(canvas: HTMLCanvasElement, alphaTest = 0.28): THREE.MeshStandardMaterial {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return new THREE.MeshStandardMaterial({
    map,
    color: 0x4e7e38,
    transparent: true,
    alphaTest,
    side: THREE.DoubleSide,
    roughness: 0.84,
    metalness: 0,
    depthWrite: true,
    emissive: new THREE.Color(0x1a3014),
    emissiveIntensity: 0.08,
  });
}

function solidFoliage(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0,
    flatShading: false,
    emissive: new THREE.Color(color).multiplyScalar(0.14),
    emissiveIntensity: 0.16,
  });
}

function displaceBlob(detail: number, seed: number, flatten = 0.78): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 0.82 + hashNoise(x * 3.1 + seed, z * 3.4 + seed) * 0.28 + hashNoise(y * 5 + seed, x * 2) * 0.1;
    pos.setXYZ(i, x * n, y * n * flatten, z * n);
  }
  geo.computeVertexNormals();
  return geo;
}

export function createFoliageKit(): FoliageKit {
  const pine = solidFoliage(0x3d6a30);
  const pineLit = solidFoliage(0x6aaa46);
  const oak = solidFoliage(0x4a7834);
  const oakLit = solidFoliage(0x86b84e);
  const bush = solidFoliage(0x3e6a2c);
  const pineCard = cutout(makeFoliageCard(true, 11), 0.18);
  const oakCard = cutout(makeFoliageCard(false, 27), 0.18);
  const impostor = cutout(makeImpostorCard(9), 0.1);
  const barkMap = new THREE.CanvasTexture(makeBarkCard());
  barkMap.colorSpace = THREE.SRGBColorSpace;
  const bark = new THREE.MeshStandardMaterial({
    map: barkMap,
    roughness: 0.94,
    metalness: 0,
  });
  return {
    pine,
    pineLit,
    oak,
    oakLit,
    pineCard,
    oakCard,
    bush,
    bark,
    impostor,
    pineBlob: displaceBlob(1, 2.2, 0.62),
    oakBlob: displaceBlob(1, 7.4, 0.8),
    trunk: new THREE.CylinderGeometry(0.22, 0.4, 1, 8),
    card: new THREE.PlaneGeometry(1, 1),
    branch: new THREE.CylinderGeometry(0.06, 0.11, 1, 6),
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
  w: number,
  h: number,
  y: number,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const card = new THREE.Mesh(kit.card, cardMat);
    card.scale.set(w * (1.45 + (i % 2) * 0.25), h * (1.02 + (i % 3) * 0.08), 1);
    card.position.y = y;
    card.rotation.y = (i / count) * Math.PI + 0.16;
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
  trunk.scale.set(0.85, h * 0.62, 0.85);
  trunk.position.y = h * 0.3;
  trunk.castShadow = shadow;
  group.add(trunk);
  const layers = compact ? 4 : PINE_CANOPY_LAYERS;
  for (let i = 0; i < layers; i++) {
    const t = i / Math.max(layers - 1, 1);
    const blob = new THREE.Mesh(kit.pineBlob, mat);
    const cw = w * (0.26 + t * 0.92);
    const ch = h * (0.14 + (1 - t) * 0.08);
    blob.scale.set(cw, ch, cw * (0.78 + fbm(i, r) * 0.28));
    blob.position.set((fbm(i + 2, r) - 0.5) * 1.8, h * (0.92 - t * 0.58), (fbm(r, i + 4) - 0.5) * 1.8);
    blob.rotation.set(fbm(i, 2) * 0.35, t * 1.2, (fbm(i, 3) - 0.5) * 0.2);
    blob.castShadow = shadow && i < 3;
    group.add(blob);
  }
  addLeafCards(group, kit, kit.pineCard, w * 1.28, h * 0.92, h * 0.54, compact ? 2 : LEAF_CARDS_PER_TREE);
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
  trunk.scale.set(1.15, h * 0.5, 1.15);
  trunk.position.y = h * 0.24;
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
    blob.scale.set(rad * (0.72 + (i % 3) * 0.22), rad * (0.52 + (i % 2) * 0.18), rad * (0.7 + (i % 4) * 0.16));
    blob.position.set(Math.cos(a) * w * 0.42, h * lift, Math.sin(a) * w * 0.4);
    blob.rotation.set(hashNoise(i, 2) * 0.8, a, hashNoise(i, 4) * 0.6);
    blob.castShadow = shadow && i < 5;
    group.add(blob);
  }
  addLeafCards(group, kit, kit.oakCard, w * 1.48, h * 0.86, h * 0.58, compact ? 2 : LEAF_CARDS_PER_TREE);
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
  const cards: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < 260 && n < 168; i++) {
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
        dummy.scale.set(r * (0.32 + t * 0.95), h * (0.12 + (1 - t) * 0.08), r * (0.3 + t * 0.88));
        dummy.updateMatrix();
        (lit ? pineLit : pineDark).push(dummy.matrix.clone());
      } else {
        const a = (k / layers) * Math.PI * 2 + hashNoise(i + k, 3);
        dummy.position.set(x + Math.cos(a) * r * 0.38, ground + h * (0.48 + (k % 3) * 0.1), z + Math.sin(a) * r * 0.34);
        dummy.rotation.set(hashNoise(k, 2) * 0.9, a, hashNoise(k, 6) * 0.5);
        dummy.scale.set(r * (0.48 + (k % 2) * 0.12), r * 0.38, r * 0.46);
        dummy.updateMatrix();
        (lit ? oakLit : oakDark).push(dummy.matrix.clone());
      }
    }
    dummy.position.set(x, ground + h * 0.52, z);
    dummy.lookAt(x + 4, ground + 4, z + 2);
    dummy.scale.set(r * 1.7, h * 0.85, 1);
    dummy.updateMatrix();
    cards.push(dummy.matrix.clone());
    dummy.rotation.y += Math.PI * 0.4;
    dummy.updateMatrix();
    cards.push(dummy.matrix.clone());
    n += 1;
  }
  parent.add(makeInstanced(kit.trunk, kit.bark, pineTrunks, false));
  parent.add(makeInstanced(kit.pineBlob, kit.pine, pineDark, false));
  parent.add(makeInstanced(kit.pineBlob, kit.pineLit, pineLit, false));
  parent.add(makeInstanced(kit.trunk, kit.bark, oakTrunks, false));
  parent.add(makeInstanced(kit.oakBlob, kit.oak, oakDark, false));
  parent.add(makeInstanced(kit.oakBlob, kit.oakLit, oakLit, false));
  parent.add(makeInstanced(kit.card, kit.oakCard, cards, false));
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
  if (kind === "pine") return 1 + PINE_CANOPY_LAYERS + LEAF_CARDS_PER_TREE;
  return 1 + 3 + OAK_CANOPY_BLOBS + LEAF_CARDS_PER_TREE;
}
