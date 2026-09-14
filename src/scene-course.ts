import * as THREE from "three";
import { buildFringeBladeField, buildGreenBladeField } from "./blades";
import { addCourseFoliage, type FoliageKit } from "./foliage";
import { courseColor } from "./art";
import { disposeChildren } from "./scene-dispose";
import { hashNoise } from "./look";
import { groundHeight } from "./terrain";
import { buildGreenOverlay } from "./turf";
import type { Hole } from "./types";

export function addHoleWater(group: THREE.Group, hole: Hole, mat: THREE.MeshPhysicalMaterial): void {
  for (const poly of hole.water) {
    if (poly.length < 3) continue;
    const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)));
    const geo = new THREE.ShapeGeometry(shape, 40);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -0.14;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

export function addBunkerLips(
  group: THREE.Group,
  hole: Hole,
  sand: THREE.MeshStandardMaterial,
  countryMat: THREE.MeshStandardMaterial,
): void {
  const lip = new THREE.MeshStandardMaterial({ color: 0x5f9f37, roughness: 1, map: countryMat.map ?? undefined });
  const profile = [
    new THREE.Vector2(0, -0.34),
    new THREE.Vector2(0.22, -0.3),
    new THREE.Vector2(0.48, -0.2),
    new THREE.Vector2(0.7, -0.08),
    new THREE.Vector2(0.86, 0.02),
    new THREE.Vector2(0.96, 0.07),
    new THREE.Vector2(1.04, 0.05),
  ];
  for (const bunker of hole.bunkers) {
    const y = groundHeight(hole, bunker.cx, bunker.cy);
    const dish = new THREE.LatheGeometry(profile, 80);
    const pos = dish.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const a = Math.atan2(vz, vx);
      const jitter = 1 + Math.sin(a * 3.1 + bunker.cx) * 0.11 + Math.sin(a * 7.4 + bunker.cy) * 0.06 + (hashNoise(a * 5, bunker.cy) - 0.5) * 0.08;
      pos.setX(i, vx * jitter);
      pos.setZ(i, vz * jitter);
    }
    dish.computeVertexNormals();
    const bowl = new THREE.Mesh(dish, sand);
    bowl.scale.set(bunker.rx, 1, bunker.ry);
    bowl.rotation.y = bunker.rotation;
    bowl.position.set(bunker.cx, y + 0.06, bunker.cy);
    bowl.receiveShadow = true;
    const lobe = new THREE.Mesh(dish.clone(), sand);
    const ox = Math.cos(bunker.rotation) * bunker.rx * 0.22;
    const oz = Math.sin(bunker.rotation) * bunker.ry * 0.18;
    lobe.scale.set(bunker.rx * 0.62, 0.85, bunker.ry * 0.7);
    lobe.rotation.y = bunker.rotation + 0.4;
    lobe.position.set(bunker.cx + ox, y + 0.04, bunker.cy + oz);
    lobe.receiveShadow = true;
    const rimGeo = new THREE.TorusGeometry(1, 0.07, 10, 64);
    const rimPos = rimGeo.attributes.position;
    for (let i = 0; i < rimPos.count; i++) {
      const j = 1 + (hashNoise(i * 0.3, bunker.cx) - 0.5) * 0.12;
      rimPos.setX(i, rimPos.getX(i) * j);
      rimPos.setY(i, rimPos.getY(i) * j);
    }
    rimGeo.computeVertexNormals();
    const rim = new THREE.Mesh(rimGeo, lip);
    rim.scale.set(bunker.rx * 0.96, bunker.ry * 0.96, 0.7);
    rim.rotation.x = Math.PI / 2;
    rim.rotation.z = bunker.rotation;
    rim.position.set(bunker.cx, y + 0.1, bunker.cy);
    const collarGeo = new THREE.RingGeometry(0.92, 1.28, 64);
    const cpos = collarGeo.attributes.position;
    for (let i = 0; i < cpos.count; i++) {
      const j = 1 + (hashNoise(i, bunker.cy) - 0.5) * 0.1;
      cpos.setX(i, cpos.getX(i) * j);
      cpos.setY(i, cpos.getY(i) * j);
    }
    const collar = new THREE.Mesh(collarGeo, lip);
    collar.scale.set(bunker.rx, bunker.ry, 1);
    collar.rotation.x = -Math.PI / 2;
    collar.rotation.z = bunker.rotation;
    collar.position.set(bunker.cx, y + 0.07, bunker.cy);
    group.add(bowl, lobe, rim, collar);
  }
}

export function addRollingCountry(group: THREE.Group, hole: Hole, cx: number, cz: number, grass: THREE.MeshStandardMaterial): void {
  const far = new THREE.Mesh(new THREE.PlaneGeometry(4600, 4600, 80, 80), grass);
  far.rotation.x = -Math.PI / 2;
  const pos = far.geometry.attributes.position;
  const b = hole.bounds;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getY(i);
    const x = lx + cx;
    const z = lz + cz;
    const inPlay = x > b.x - 40 && x < b.x + b.w + 40 && z > b.y - 40 && z < b.y + b.h + 40;
    const dune = hashNoise(x * 0.008, z * 0.008) * 14 + hashNoise(x * 0.02, z * 0.02) * 6;
    pos.setZ(i, inPlay ? -2.4 : -1.8 + dune);
  }
  far.geometry.computeVertexNormals();
  far.position.set(cx, 0, cz);
  far.receiveShadow = true;
  group.add(far);
  const spots = [
    [b.x - 380, b.y - 340, 110, 0.1],
    [b.x + b.w + 360, b.y + 80, 120, 0.09],
    [b.x + 60, b.y - 460, 104, 0.08],
    [b.x + b.w * 0.55, b.y + b.h + 400, 130, 0.1],
    [b.x - 280, b.y + b.h + 320, 96, 0.09],
    [cx + 620, cz + 520, 150, 0.08],
    [cx - 660, cz - 500, 140, 0.08],
    [cx + 420, cz - 600, 160, 0.07],
  ];
  for (const [x, z, r, sy] of spots) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), grass);
    hill.scale.set(1 + hashNoise(x, z) * 0.22, sy, 0.85 + hashNoise(z, x) * 0.28);
    hill.position.set(x, r * sy * 0.05, z);
    hill.receiveShadow = true;
    group.add(hill);
  }
}

export function rebuildPin(pin: THREE.Group): void {
  disposeChildren(pin);
  // A regulation-height stick (~7 ft) with a flag that stays saturated in any light.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.024, 2.4, 10),
    new THREE.MeshStandardMaterial({ color: 0xfaf7ef, roughness: 0.4 }),
  );
  pole.position.y = 1.2;
  pole.castShadow = true;
  const ferrule = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.35 }),
  );
  ferrule.position.y = 2.42;
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.6),
    new THREE.MeshBasicMaterial({ color: 0xff3b2f, side: THREE.DoubleSide, toneMapped: false }),
  );
  flag.position.set(0.5, 2.1, 0);
  flag.castShadow = true;
  const well = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.17, 0.16, 20),
    new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9 }),
  );
  well.position.y = -0.02;
  const liner = new THREE.Mesh(
    new THREE.RingGeometry(0.19, 0.27, 26),
    new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.45, side: THREE.DoubleSide }),
  );
  liner.rotation.x = -Math.PI / 2;
  liner.position.y = 0.018;
  pin.add(pole, ferrule, flag, well, liner);
}

export function rebuildPuttGrid(grid: THREE.Group, hole: Hole): void {
  disposeChildren(grid);
  const g = hole.green;
  const rot = g.rotation;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const pts: number[] = [];
  const toWorld = (lx: number, ly: number) => {
    const x = g.cx + lx * cos - ly * sin;
    const z = g.cy + lx * sin + ly * cos;
    return { x, z, y: groundHeight(hole, x, z) + 0.03 };
  };
  for (let i = -3; i <= 3; i++) {
    const u = (i / 3) * g.rx * 0.84;
    const a = toWorld(u, -g.ry * 0.84);
    const b = toWorld(u, g.ry * 0.84);
    pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  for (let i = -3; i <= 3; i++) {
    const v = (i / 3) * g.ry * 0.84;
    const a = toWorld(-g.rx * 0.84, v);
    const b = toWorld(g.rx * 0.84, v);
    pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const br = hole.greenBreak;
  const bl = Math.hypot(br.x, br.y) || 1;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const o = toWorld((i / 2) * g.rx * 0.55, (j / 2) * g.ry * 0.55);
      const tip = toWorld((i / 2) * g.rx * 0.55 + (br.x / bl) * 1.4, (j / 2) * g.ry * 0.55 + (br.y / bl) * 1.4);
      pts.push(o.x, o.y + 0.01, o.z, tip.x, tip.y + 0.01, tip.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  grid.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xdce8d0, transparent: true, opacity: 0.2 })));
}

export function buildPlayableTerrain(hole: Hole, turfMat: THREE.MeshStandardMaterial): THREE.Mesh {
  const b = hole.bounds;
  const pad = 110;
  const tw = b.w + pad * 2;
  const th = b.h + pad * 2;
  const ox = b.x - pad;
  const oz = b.y - pad;
  const cols = Math.max(100, Math.round(tw / 1.1));
  const rows = Math.max(72, Math.round(th / 1.1));
  const geo = new THREE.PlaneGeometry(tw, th, cols, rows);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const cx = b.x + b.w / 2;
  const cz = b.y + b.h / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx;
    const z = pos.getZ(i) + cz;
    pos.setXYZ(i, x, groundHeight(hole, x, z), z);
    uv.setXY(i, (x - ox) / tw, (z - oz) / th);
  }
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colors.set(courseColor(hole, pos.getX(i), pos.getZ(i)), i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, turfMat);
  terrain.receiveShadow = true;
  return terrain;
}

export interface HoleBuild {
  terrain: THREE.Mesh;
  greenBlades: THREE.InstancedMesh;
  fringeBlades: THREE.InstancedMesh;
  focus: { cx: number; cz: number };
}

export function populateHoleGroup(
  group: THREE.Group,
  hole: Hole,
  mats: {
    turf: THREE.MeshStandardMaterial;
    green: THREE.MeshPhysicalMaterial;
    blade: THREE.MeshStandardMaterial;
    fringe: THREE.MeshStandardMaterial;
    country: THREE.MeshStandardMaterial;
    sand: THREE.MeshStandardMaterial;
    water: THREE.MeshPhysicalMaterial;
  },
  foliageKit: FoliageKit,
  lite: boolean,
  pin: THREE.Group,
  grid: THREE.Group,
): HoleBuild {
  const b = hole.bounds;
  const cx = b.x + b.w / 2;
  const cz = b.y + b.h / 2;
  const terrain = buildPlayableTerrain(hole, mats.turf);
  group.add(terrain);
  group.add(buildGreenOverlay(hole, mats.green));
  const greenBlades = buildGreenBladeField(hole, mats.blade);
  const fringeBlades = buildFringeBladeField(hole, mats.fringe);
  group.add(greenBlades, fringeBlades);
  addRollingCountry(group, hole, cx, cz, mats.country);
  addHoleWater(group, hole, mats.water);
  addBunkerLips(group, hole, mats.sand, mats.country);
  addCourseFoliage(group, foliageKit, hole, { lite });
  rebuildPin(pin);
  rebuildPuttGrid(grid, hole);
  return { terrain, greenBlades, fringeBlades, focus: { cx, cz } };
}
