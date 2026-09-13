import * as THREE from "three";
import { lieAt } from "./course";
import { fbm, hashNoise } from "./look";
import { groundHeight } from "./terrain";
import type { Hole } from "./types";

export const PINE_CANOPY_LAYERS = 6;
export const OAK_CANOPY_BLOBS = 8;
export const VOLUME_TREE_PARTS = 12;

export type TreeKind = "pine" | "oak";

export function treeKind(x: number, z: number): TreeKind {
  return fbm(x * 0.17, z * 0.17) > 0.34 ? "pine" : "oak";
}

export interface FoliageKit {
  pine: THREE.MeshStandardMaterial;
  oak: THREE.MeshStandardMaterial;
  pineCard: THREE.MeshStandardMaterial;
  oakCard: THREE.MeshStandardMaterial;
  bush: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  impostor: THREE.MeshStandardMaterial;
  pineCone: THREE.BufferGeometry;
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
  ctx.fillStyle = `rgb(${tones[0][0]},${tones[0][1]},${tones[0][2]})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.36, h * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  const stamps = needles ? 720 : 520;
  for (let i = 0; i < stamps; i++) {
    const u = hashNoise(seed + i, 1.7);
    const v = hashNoise(seed + i, 4.2);
    const ang = u * Math.PI * 2;
    const rad = Math.pow(v, 0.62) * (needles ? 0.42 : 0.4);
    const x = cx + Math.cos(ang) * rad * w;
    const y = cy + Math.sin(ang) * rad * h * (needles ? 1.02 : 0.9);
    const tone = tones[(i + Math.floor(u * 8)) % tones.length];
    ctx.fillStyle = `rgba(${tone[0]},${tone[1]},${tone[2]},0.92)`;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + (hashNoise(i, 3) - 0.5) * 1.2);
    if (needles) {
      ctx.fillRect(-2.2, -10 - hashNoise(i, 5) * 8, 4.2, 16 + hashNoise(i, 6) * 10);
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, 7 + hashNoise(i, 2) * 8, 9 + hashNoise(i, 8) * 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalCompositeOperation = "destination-in";
  const falloff = ctx.createRadialGradient(cx, cy, w * 0.22, cx, cy, w * 0.48);
  falloff.addColorStop(0, "rgba(255,255,255,1)");
  falloff.addColorStop(0.72, "rgba(255,255,255,1)");
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
    [18, 44, 24],
    [32, 68, 36],
    [14, 36, 20],
    [44, 82, 42],
    [24, 56, 28],
    [38, 74, 40],
  ];
  const oak: Array<[number, number, number]> = [
    [28, 62, 30],
    [46, 88, 42],
    [20, 48, 24],
    [58, 102, 50],
    [34, 70, 34],
    [16, 40, 20],
  ];
  paintLeafCluster(ctx, 384, 384, needles ? pine : oak, seed, needles);
  return c;
}

function makeImpostorCard(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 320;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.clearRect(0, 0, 256, 320);
  ctx.fillStyle = "#3d2c20";
  ctx.beginPath();
  ctx.moveTo(116, 150);
  ctx.lineTo(140, 150);
  ctx.lineTo(148, 314);
  ctx.lineTo(108, 314);
  ctx.closePath();
  ctx.fill();
  const pine = hashNoise(7, 2) > 0.4;
  const tones: Array<[number, number, number]> = pine
    ? [
        [22, 52, 26],
        [36, 74, 34],
        [16, 40, 20],
        [48, 86, 42],
      ]
    : [
        [30, 64, 30],
        [46, 88, 40],
        [20, 48, 24],
        [58, 98, 48],
      ];
  if (pine) {
    for (let row = 0; row < 6; row++) {
      const t = row / 5;
      const y = 40 + t * 175;
      const rx = 22 + t * 58;
      ctx.fillStyle = `rgb(${tones[row % tones.length][0]},${tones[row % tones.length][1]},${tones[row % tones.length][2]})`;
      ctx.beginPath();
      ctx.ellipse(128, y, rx, 22 + t * 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = `rgb(${tones[0][0]},${tones[0][1]},${tones[0][2]})`;
    ctx.beginPath();
    ctx.ellipse(128, 118, 78, 64, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 10; i++) {
      const tone = tones[i % tones.length];
      ctx.fillStyle = `rgb(${tone[0]},${tone[1]},${tone[2]})`;
      ctx.beginPath();
      ctx.ellipse(128 + (hashNoise(i, 3) - 0.5) * 90, 100 + hashNoise(i, 4) * 70, 28 + hashNoise(i, 5) * 18, 24 + hashNoise(i, 6) * 14, 0, 0, Math.PI * 2);
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
  ctx.fillStyle = "#4a3828";
  ctx.fillRect(0, 0, 96, 192);
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = i % 3 === 0 ? "#3a2c20" : i % 3 === 1 ? "#5a4634" : "#2e2218";
    ctx.fillRect(hashNoise(i, 1) * 96, i * 2.6, 2 + hashNoise(i, 2) * 5, 16 + hashNoise(i, 3) * 10);
  }
  return c;
}

function cutout(canvas: HTMLCanvasElement, alphaTest = 0.28): THREE.MeshStandardMaterial {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    alphaTest,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0,
    depthWrite: true,
    emissive: new THREE.Color(0x142010),
    emissiveIntensity: 0.05,
  });
}

function solidFoliage(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
    emissive: new THREE.Color(color).multiplyScalar(0.12),
    emissiveIntensity: 0.22,
  });
}

export function createFoliageKit(): FoliageKit {
  const pine = solidFoliage(0x2a5628);
  const oak = solidFoliage(0x3a6a30);
  const bush = solidFoliage(0x355828);
  const pineCard = cutout(makeFoliageCard(true, 11), 0.2);
  const oakCard = cutout(makeFoliageCard(false, 27), 0.2);
  const impostor = cutout(makeImpostorCard(), 0.12);
  const barkMap = new THREE.CanvasTexture(makeBarkCard());
  barkMap.colorSpace = THREE.SRGBColorSpace;
  const bark = new THREE.MeshStandardMaterial({
    map: barkMap,
    roughness: 0.94,
    metalness: 0,
  });
  return {
    pine,
    oak,
    pineCard,
    oakCard,
    bush,
    bark,
    impostor,
    pineCone: new THREE.ConeGeometry(1, 1, 8),
    oakBlob: new THREE.IcosahedronGeometry(1, 1),
    trunk: new THREE.CylinderGeometry(0.22, 0.4, 1, 8),
    card: new THREE.PlaneGeometry(1, 1),
    branch: new THREE.CylinderGeometry(0.06, 0.11, 1, 6),
  };
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
  if (kind === "pine") addPine(group, r, kit, shadow, compact);
  else addOak(group, r, kit, shadow, compact);
  group.position.set(x, ground, z);
  group.rotation.y = fbm(x, z) * Math.PI * 2;
  group.scale.y = 0.9 + fbm(z, x) * 0.24;
  group.userData.kind = kind;
  group.userData.volume = true;
  return group;
}

function addPine(group: THREE.Group, r: number, kit: FoliageKit, shadow: boolean, compact: boolean): void {
  const h = 12.8 + (r - 7) * 0.95;
  const w = r * 1.05;
  const trunk = new THREE.Mesh(kit.trunk, kit.bark);
  trunk.scale.set(0.85, h * 0.62, 0.85);
  trunk.position.y = h * 0.3;
  trunk.castShadow = shadow;
  group.add(trunk);
  const layers = compact ? 4 : PINE_CANOPY_LAYERS;
  for (let i = 0; i < layers; i++) {
    const t = i / Math.max(layers - 1, 1);
    const cone = new THREE.Mesh(kit.pineCone, kit.pine);
    const cw = w * (0.42 + t * 0.72);
    const ch = h * (0.22 + (1 - t) * 0.06);
    cone.scale.set(cw, ch, cw * (0.92 + fbm(i, r) * 0.12));
    cone.position.set((fbm(i + 2, r) - 0.5) * 0.7, h * (0.86 - t * 0.52), (fbm(r, i + 4) - 0.5) * 0.7);
    cone.rotation.y = t * 0.7;
    cone.rotation.z = (fbm(i, 3) - 0.5) * 0.08;
    cone.castShadow = shadow && i < 3;
    group.add(cone);
  }
  if (!compact) {
    for (let i = 0; i < 2; i++) {
      const card = new THREE.Mesh(kit.card, kit.pineCard);
      card.scale.set(w * 1.35, h * 0.95, 1);
      card.position.y = h * 0.52;
      card.rotation.y = (i * Math.PI) / 2 + 0.18;
      card.castShadow = false;
      group.add(card);
    }
  }
}

function addOak(group: THREE.Group, r: number, kit: FoliageKit, shadow: boolean, compact: boolean): void {
  const h = 9.6 + (r - 7) * 0.58;
  const w = r * 1.35;
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
  const blobs = compact ? 5 : OAK_CANOPY_BLOBS;
  for (let i = 0; i < blobs; i++) {
    const blob = new THREE.Mesh(kit.oakBlob, kit.oak);
    const a = (i / blobs) * Math.PI * 2;
    const lift = 0.55 + (i % 3) * 0.08;
    const rad = w * (0.22 + (i % 4) * 0.05);
    blob.scale.set(rad * (0.85 + (i % 2) * 0.18), rad * 0.72, rad * (0.8 + (i % 3) * 0.12));
    blob.position.set(Math.cos(a) * w * 0.28, h * lift, Math.sin(a) * w * 0.26);
    blob.rotation.y = a;
    blob.castShadow = shadow && i < 4;
    group.add(blob);
  }
  if (!compact) {
    for (let i = 0; i < 2; i++) {
      const card = new THREE.Mesh(kit.card, kit.oakCard);
      card.scale.set(w * 1.55, h * 0.85, 1);
      card.position.y = h * 0.58;
      card.rotation.y = (i * Math.PI) / 2 + 0.3;
      group.add(card);
    }
  }
}

export function makeBush(x: number, z: number, r: number, ground: number, kit: FoliageKit): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const blob = new THREE.Mesh(kit.oakBlob, kit.bush);
    const a = (i / 3) * Math.PI * 2;
    blob.scale.set(r * 0.55, r * 0.38, r * 0.5);
    blob.position.set(Math.cos(a) * r * 0.28, r * 0.32, Math.sin(a) * r * 0.28);
    group.add(blob);
  }
  group.position.set(x, ground, z);
  return group;
}

export function addCourseFoliage(parent: THREE.Group, kit: FoliageKit, hole: Hole): void {
  for (const tree of hole.trees) {
    parent.add(makeVolumeTree(tree.x, tree.y, tree.r * 1.28, groundHeight(hole, tree.x, tree.y), kit));
    if (fbm(tree.x, tree.y) > 0.42) {
      const jx = tree.x + (fbm(tree.x + 2, tree.y) - 0.5) * 9;
      const jz = tree.y + (fbm(tree.x, tree.y + 3) - 0.5) * 9;
      if (lieAt(hole, { x: jx, y: jz }) !== "fairway" && lieAt(hole, { x: jx, y: jz }) !== "green") {
        parent.add(makeVolumeTree(jx, jz, tree.r * 0.88, groundHeight(hole, jx, jz), kit, { compact: true }));
      }
    }
    if (fbm(tree.x * 0.3, tree.y) > 0.52) {
      parent.add(makeBush(tree.x + 3.2, tree.y - 2.4, 2.2, groundHeight(hole, tree.x + 3.2, tree.y - 2.4), kit));
    }
  }
  addInstancedWoods(parent, kit, hole);
  addImpostorRing(parent, kit, hole);
}

function addInstancedWoods(parent: THREE.Group, kit: FoliageKit, hole: Hole): void {
  const b = hole.bounds;
  const pineTrunks: THREE.Matrix4[] = [];
  const pineCanopy: THREE.Matrix4[] = [];
  const oakTrunks: THREE.Matrix4[] = [];
  const oakCanopy: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < 280 && n < 190; i++) {
    const t = i / 280;
    const side = i % 2 === 0 ? -1 : 1;
    const x = b.x - 40 + t * (b.w + 80) + (fbm(i, 4) - 0.5) * 18;
    const z = side < 0 ? b.y - 16 - fbm(i, 1) * 52 : b.y + b.h + 12 + fbm(i, 2) * 52;
    const lie = lieAt(hole, { x, y: z });
    if (lie === "fairway" || lie === "green" || lie === "tee" || lie === "water") continue;
    const ground = groundHeight(hole, x, z);
    const kind = treeKind(x + 1, z);
    const r = 7.6 + (i % 7) * 0.5;
    const h = kind === "pine" ? 12.2 + (r - 7) * 0.8 : 9.4 + (r - 7) * 0.5;
    dummy.position.set(x, ground + h * (kind === "pine" ? 0.3 : 0.24), z);
    dummy.rotation.set(0, fbm(x, z) * 6, 0);
    dummy.scale.set(kind === "pine" ? 0.8 : 1.1, h * (kind === "pine" ? 0.6 : 0.48), kind === "pine" ? 0.8 : 1.1);
    dummy.updateMatrix();
    (kind === "pine" ? pineTrunks : oakTrunks).push(dummy.matrix.clone());
    dummy.position.set(x, ground + h * (kind === "pine" ? 0.58 : 0.62), z);
    dummy.scale.set(kind === "pine" ? r * 1.05 : r * 1.3, kind === "pine" ? h * 0.55 : r * 0.85, kind === "pine" ? r * 1.05 : r * 1.2);
    dummy.updateMatrix();
    (kind === "pine" ? pineCanopy : oakCanopy).push(dummy.matrix.clone());
    n += 1;
  }
  parent.add(makeInstanced(kit.trunk, kit.bark, pineTrunks, false));
  parent.add(makeInstanced(kit.pineCone, kit.pine, pineCanopy, false));
  parent.add(makeInstanced(kit.trunk, kit.bark, oakTrunks, false));
  parent.add(makeInstanced(kit.oakBlob, kit.oak, oakCanopy, false));
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

function addImpostorRing(parent: THREE.Group, kit: FoliageKit, hole: Hole): void {
  const b = hole.bounds;
  const cx = b.x + b.w / 2;
  const cz = b.y + b.h / 2;
  const radius = Math.hypot(b.w, b.h) * 0.62 + 90;
  const dummy = new THREE.Object3D();
  const mats: THREE.Matrix4[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2 + hashNoise(i, 2) * 0.08;
    const jitter = 8 + hashNoise(i, 5) * 22;
    const x = cx + Math.cos(a) * (radius + jitter);
    const z = cz + Math.sin(a) * (radius + jitter);
    const ground = groundHeight(hole, x, z);
    const s = 14 + hashNoise(i, 7) * 8;
    dummy.position.set(x, ground + s * 0.48, z);
    dummy.lookAt(cx, ground + 4, cz);
    dummy.scale.set(s * 0.85, s, 1);
    dummy.updateMatrix();
    mats.push(dummy.matrix.clone());
  }
  parent.add(makeInstanced(kit.card, kit.impostor, mats, false));
}

export function volumeTreeMeshCount(kind: TreeKind = "oak"): number {
  if (kind === "pine") return 1 + PINE_CANOPY_LAYERS + 2;
  return 1 + 3 + OAK_CANOPY_BLOBS + 2;
}
