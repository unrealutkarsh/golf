import * as THREE from "three";

export const GOLFER_MESH_COUNT = 72;
export const GOLFER_BONE_COUNT = 16;

const Y_UP = new THREE.Vector3(0, 1, 0);
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _quat = new THREE.Quaternion();

function clothPique(): THREE.DataTexture {
  const w = 64;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = ((x >> 2) + (y >> 2)) & 1;
      const n = ((x * 13 + y * 7) & 7) / 7;
      const v = cell ? 236 + n * 8 : 224 + n * 6;
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v - 2;
      data[i + 2] = v - 6;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 7);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function clothTwill(): THREE.DataTexture {
  const w = 64;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const diag = ((x + y) >> 2) & 1;
      const n = ((x * 5 + y * 11) & 7) / 7;
      const v = diag ? 38 + n * 10 : 28 + n * 8;
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v + 6;
      data[i + 2] = v + 12;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function fabricNormal(kind: "pique" | "twill"): THREE.DataTexture {
  const w = 64;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  const height = (x: number, y: number) => {
    if (kind === "pique") {
      const cell = ((x >> 2) + (y >> 2)) & 1;
      return (cell ? 0.6 : 0.4) + (((x * 13 + y * 7) & 7) / 7) * 0.1;
    }
    const diag = ((x + y) >> 2) & 1;
    return (diag ? 0.56 : 0.42) + (((x * 5 + y * 11) & 7) / 7) * 0.08;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (height(x - 1, y) - height(x + 1, y)) * 1.8;
      const ny = (height(x, y - 1) - height(x, y + 1)) * 1.8;
      const len = Math.hypot(nx, 1, ny) || 1;
      const i = (y * w + x) * 4;
      data[i] = Math.round((nx / len) * 127 + 128);
      data[i + 1] = Math.round((1 / len) * 127 + 128);
      data[i + 2] = Math.round((ny / len) * 127 + 128);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(kind === "pique" ? 5 : 4, kind === "pique" ? 7 : 8);
  tex.needsUpdate = true;
  return tex;
}

function leatherGrain(): THREE.DataTexture {
  const w = 64;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = ((x * 17 + y * 11) & 15) / 15;
      const v = 172 + n * 24;
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v - 16;
      data[i + 2] = v - 32;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeBone(name: string, x: number, y: number, z: number): THREE.Bone {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(x, y, z);
  return b;
}

function add(parent: THREE.Object3D, mesh: THREE.Mesh): THREE.Mesh {
  parent.add(mesh);
  return mesh;
}

function lathe(profile: Array<[number, number]>, segs = 14): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segs,
  );
}

/** Tapered limb whose Y axis runs from A to B. */
function limb(
  parent: THREE.Object3D,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  radii: number[],
  mat: THREE.Material,
  segs = 12,
): THREE.Mesh {
  _from.set(ax, ay, az);
  _to.set(bx, by, bz);
  _dir.subVectors(_to, _from);
  const len = _dir.length() || 0.1;
  const profile: Array<[number, number]> = radii.map((r, i) => [r, (i / Math.max(radii.length - 1, 1)) * len]);
  const mesh = new THREE.Mesh(lathe(profile, segs), mat);
  mesh.position.copy(_from);
  mesh.quaternion.copy(_quat.setFromUnitVectors(Y_UP, _dir.normalize()));
  parent.add(mesh);
  return mesh;
}

function ball(parent: THREE.Object3D, r: number, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

type Joint = { x: number; y: number; z: number };

function makeHand(mat: THREE.Material, side: 1 | -1): THREE.Group {
  const g = new THREE.Group();
  g.name = side < 0 ? "left-hand" : "right-hand";
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.07, 0.028), mat);
  palm.position.set(0, 0, 0);
  g.add(palm);
  const heel = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), mat);
  heel.position.set(0, -0.03, 0);
  heel.scale.set(1.05, 0.7, 0.85);
  g.add(heel);
  for (let i = 0; i < 4; i++) {
    const t = (i - 1.5) / 3;
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0065, 0.038, 4, 6), mat);
    finger.position.set(t * 0.028, 0.042, 0.01);
    finger.rotation.x = 1.15;
    finger.rotation.z = t * -0.12;
    g.add(finger);
    const tip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0055, 0.022, 3, 6), mat);
    tip.position.set(t * 0.026, 0.052, 0.032);
    tip.rotation.x = 1.85;
    g.add(tip);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.028, 4, 6), mat);
  thumb.position.set(side * 0.024, 0.004, 0.016);
  thumb.rotation.z = side * -0.85;
  thumb.rotation.x = 0.55;
  g.add(thumb);
  return g;
}

function kit() {
  const pique = clothPique();
  const twill = clothTwill();
  const piqueN = fabricNormal("pique");
  const twillN = fabricNormal("twill");
  const leather = leatherGrain();
  return {
    slacks: new THREE.MeshPhysicalMaterial({
      map: twill,
      normalMap: twillN,
      normalScale: new THREE.Vector2(0.35, 0.35),
      color: 0x4a5864,
      roughness: 0.82,
      sheen: 0.16,
      sheenColor: new THREE.Color(0x7a8894),
      sheenRoughness: 0.72,
    }),
    shirt: new THREE.MeshPhysicalMaterial({
      map: pique,
      normalMap: piqueN,
      normalScale: new THREE.Vector2(0.4, 0.4),
      color: 0xf4efe6,
      roughness: 0.56,
      sheen: 0.38,
      sheenColor: new THREE.Color(0xffffff),
      sheenRoughness: 0.58,
    }),
    shirtShade: new THREE.MeshPhysicalMaterial({
      map: pique,
      color: 0xd4cfc4,
      roughness: 0.62,
      sheen: 0.22,
    }),
    glove: new THREE.MeshPhysicalMaterial({
      map: leather,
      color: 0xe8dcc4,
      roughness: 0.5,
      sheen: 0.14,
    }),
    skin: new THREE.MeshPhysicalMaterial({
      color: 0xc49a78,
      roughness: 0.46,
      metalness: 0,
      sheen: 0.32,
      sheenColor: new THREE.Color(0xe8c4a4),
      sheenRoughness: 0.58,
      clearcoat: 0.06,
      clearcoatRoughness: 0.7,
    }),
    shoe: new THREE.MeshPhysicalMaterial({
      map: leather,
      color: 0xf4f0e8,
      roughness: 0.4,
      sheen: 0.12,
    }),
    saddle: new THREE.MeshPhysicalMaterial({ map: leather, color: 0x5a4030, roughness: 0.55 }),
    sole: new THREE.MeshStandardMaterial({ color: 0x1c1c1a, roughness: 0.82 }),
    cap: new THREE.MeshPhysicalMaterial({ color: 0x1a2c36, roughness: 0.4, sheen: 0.18, sheenColor: new THREE.Color(0x3a5060) }),
    hair: new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.74 }),
    belt: new THREE.MeshStandardMaterial({ color: 0x32241c, roughness: 0.55 }),
    grip: new THREE.MeshStandardMaterial({ color: 0x1a1a18, roughness: 0.78 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb4bac0, roughness: 0.22, metalness: 0.72 }),
    putterFace: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.55 }),
    iris: new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.35 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.35 }),
  };
}

/**
 * Right-handed address figure. Lathed limbs and a posed torso — not a capsule stack.
 * Local space faces +Z (the ball). snapGolferToBall rotates onto the aim line.
 */
export function buildAddressGolfer(): THREE.Group {
  const root = new THREE.Group();
  root.name = "golfer";
  const m = kit();

  const lHip: Joint = { x: -0.1, y: 0.92, z: 0.0 };
  const rHip: Joint = { x: 0.1, y: 0.92, z: -0.04 };
  const lKnee: Joint = { x: -0.15, y: 0.5, z: 0.1 };
  const rKnee: Joint = { x: 0.16, y: 0.5, z: -0.02 };
  const lAnkle: Joint = { x: -0.17, y: 0.075, z: 0.12 };
  const rAnkle: Joint = { x: 0.18, y: 0.075, z: -0.06 };
  const lShoulder: Joint = { x: -0.2, y: 1.45, z: 0.08 };
  const rShoulder: Joint = { x: 0.2, y: 1.43, z: 0.05 };
  const lElbow: Joint = { x: -0.09, y: 1.12, z: 0.26 };
  const rElbow: Joint = { x: 0.1, y: 1.1, z: 0.28 };
  const hands: Joint = { x: 0.02, y: 0.8, z: 0.4 };
  const headPos: Joint = { x: 0.0, y: 1.64, z: 0.17 };
  const headPt: Joint = { x: 0.03, y: 0.034, z: 0.55 };

  const hipsB = makeBone("hips", 0, 0.92, -0.02);
  const spine = makeBone("spine", 0, 0.16, 0.04);
  const chest = makeBone("chest", 0, 0.2, 0.05);
  const neckB = makeBone("neck", 0, 0.14, 0.05);
  const headB = makeBone("headBone", 0, 0.14, 0.03);
  const lClav = makeBone("lClav", -0.16, 0.1, 0.05);
  const rClav = makeBone("rClav", 0.16, 0.1, 0.05);
  const lUpperB = makeBone("lUpper", 0, -0.16, 0.1);
  const rUpperB = makeBone("rUpper", 0, -0.16, 0.1);
  const lForeB = makeBone("lFore", 0, -0.2, 0.08);
  const rForeB = makeBone("rFore", 0, -0.2, 0.08);
  const lThighB = makeBone("lThigh", -0.1, -0.2, 0.04);
  const rThighB = makeBone("rThigh", 0.12, -0.2, -0.02);
  const lShinB = makeBone("lShin", 0, -0.28, 0.05);
  const rShinB = makeBone("rShin", 0, -0.28, 0.02);
  hipsB.add(spine, lThighB, rThighB);
  spine.add(chest);
  chest.add(neckB, lClav, rClav);
  neckB.add(headB);
  lClav.add(lUpperB);
  rClav.add(rUpperB);
  lUpperB.add(lForeB);
  rUpperB.add(rForeB);
  lThighB.add(lShinB);
  rThighB.add(rShinB);
  const bones = [hipsB, spine, chest, neckB, headB, lClav, rClav, lUpperB, rUpperB, lForeB, rForeB, lThighB, rThighB, lShinB, rShinB];
  root.add(hipsB);
  root.userData.skeleton = new THREE.Skeleton(bones);
  root.userData.boneCount = bones.length;

  const body = new THREE.Group();
  body.name = "body";

  addShoe(body, lAnkle, m, 0.04);
  addShoe(body, rAnkle, m, 0.04);

  limb(body, lHip.x, lHip.y, lHip.z, lKnee.x, lKnee.y, lKnee.z, [0.072, 0.07, 0.058, 0.05], m.slacks);
  limb(body, rHip.x, rHip.y, rHip.z, rKnee.x, rKnee.y, rKnee.z, [0.072, 0.07, 0.058, 0.05], m.slacks);
  limb(body, lKnee.x, lKnee.y, lKnee.z, lAnkle.x, lAnkle.y, lAnkle.z, [0.048, 0.046, 0.042, 0.034], m.slacks);
  limb(body, rKnee.x, rKnee.y, rKnee.z, rAnkle.x, rAnkle.y, rAnkle.z, [0.048, 0.046, 0.042, 0.034], m.slacks);
  ball(body, 0.046, m.slacks, lKnee.x, lKnee.y, lKnee.z, 1.05, 0.85, 0.95);
  ball(body, 0.046, m.slacks, rKnee.x, rKnee.y, rKnee.z, 1.05, 0.85, 0.95);

  const pelvis = add(body, new THREE.Mesh(lathe([[0.11, -0.07], [0.14, -0.02], [0.15, 0.04], [0.128, 0.1], [0.11, 0.14]], 16), m.slacks));
  pelvis.position.set(0, 0.92, -0.02);
  pelvis.scale.set(1.12, 1, 0.78);
  pelvis.rotation.x = 0.18;
  const seat = ball(body, 0.1, m.slacks, 0, 0.86, -0.07, 1.15, 0.42, 0.7);
  void seat;
  const beltMesh = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.15, 0.034, 16), m.belt));
  beltMesh.position.set(0, 1.0, 0.02);
  beltMesh.scale.set(1.02, 1, 0.72);
  beltMesh.rotation.x = 0.16;
  const buckle = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.02, 0.01), m.steel));
  buckle.position.set(0, 1.0, 0.125);
  buckle.rotation.x = 0.16;

  const torso = add(
    body,
    new THREE.Mesh(
      lathe(
        [
          [0.12, 0.0],
          [0.145, 0.06],
          [0.155, 0.16],
          [0.168, 0.28],
          [0.175, 0.4],
          [0.16, 0.48],
          [0.09, 0.54],
        ],
        18,
      ),
      m.shirt,
    ),
  );
  torso.position.set(0, 1.02, 0.02);
  torso.scale.set(1.08, 1, 0.74);
  torso.rotation.x = 0.28;
  const shoulders = add(body, new THREE.Mesh(lathe([[0.05, -0.18], [0.062, -0.08], [0.064, 0.08], [0.05, 0.18]], 12), m.shirt));
  shoulders.position.set(0, 1.44, 0.07);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.scale.set(1, 1, 1.05);
  const hem = add(body, new THREE.Mesh(new THREE.TorusGeometry(0.148, 0.012, 8, 18), m.shirtShade));
  hem.position.set(0, 1.03, 0.03);
  hem.rotation.x = Math.PI / 2 + 0.16;
  hem.scale.set(1.08, 0.72, 1);
  const placket = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.26, 0.008), m.shirtShade));
  placket.position.set(0, 1.24, 0.155);
  placket.rotation.x = 0.28;
  const collar = add(body, new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.013, 8, 14, Math.PI * 1.15), m.shirt));
  collar.position.set(0, 1.5, 0.13);
  collar.rotation.x = 1.15;

  limb(body, lShoulder.x, lShoulder.y, lShoulder.z, lElbow.x, lElbow.y, lElbow.z, [0.052, 0.05, 0.044, 0.038], m.shirt);
  limb(body, rShoulder.x, rShoulder.y, rShoulder.z, rElbow.x, rElbow.y, rElbow.z, [0.052, 0.05, 0.044, 0.038], m.shirt);
  limb(body, lElbow.x, lElbow.y, lElbow.z, hands.x - 0.018, hands.y + 0.02, hands.z, [0.034, 0.032, 0.028, 0.024], m.skin);
  limb(body, rElbow.x, rElbow.y, rElbow.z, hands.x + 0.02, hands.y - 0.02, hands.z + 0.01, [0.034, 0.032, 0.028, 0.024], m.skin);
  ball(body, 0.054, m.shirt, lShoulder.x, lShoulder.y, lShoulder.z, 1.15, 0.9, 1.05);
  ball(body, 0.054, m.shirt, rShoulder.x, rShoulder.y, rShoulder.z, 1.15, 0.9, 1.05);
  ball(body, 0.032, m.skin, lElbow.x, lElbow.y, lElbow.z);
  ball(body, 0.032, m.skin, rElbow.x, rElbow.y, rElbow.z);

  const neck = add(body, new THREE.Mesh(lathe([[0.038, 0], [0.042, 0.03], [0.04, 0.07]], 10), m.skin));
  neck.position.set(0, 1.5, 0.13);
  neck.rotation.x = 0.22;

  const head = new THREE.Group();
  head.name = "head";
  head.position.set(headPos.x, headPos.y, headPos.z);
  const cranium = add(head, new THREE.Mesh(new THREE.SphereGeometry(0.098, 20, 16), m.skin));
  cranium.scale.set(0.94, 1.06, 0.98);
  const jaw = add(head, new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), m.skin));
  jaw.position.set(0, -0.07, 0.03);
  jaw.scale.set(0.88, 0.55, 0.72);
  const earL = add(head, new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), m.skin));
  earL.position.set(-0.09, -0.01, 0.0);
  earL.scale.set(0.55, 1.1, 0.8);
  const earR = add(head, new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), m.skin));
  earR.position.set(0.09, -0.01, 0.0);
  earR.scale.set(0.55, 1.1, 0.8);
  const nose = add(head, new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), m.skin));
  nose.position.set(0, -0.01, 0.092);
  nose.scale.set(0.7, 1.05, 1.15);
  const eyeL = add(head, new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), m.white));
  eyeL.position.set(-0.028, 0.01, 0.082);
  eyeL.scale.set(1, 0.7, 0.55);
  const eyeR = add(head, new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), m.white));
  eyeR.position.set(0.028, 0.01, 0.082);
  eyeR.scale.set(1, 0.7, 0.55);
  const irisL = add(head, new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), m.iris));
  irisL.position.set(-0.028, 0.006, 0.09);
  const irisR = add(head, new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), m.iris));
  irisR.position.set(0.028, 0.006, 0.09);
  const hairMesh = add(head, new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), m.hair));
  hairMesh.position.set(0, 0.03, -0.008);
  hairMesh.scale.set(0.96, 1.02, 1.0);
  const hat = add(head, new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.096, 0.068, 16), m.cap));
  hat.position.set(0, 0.1, -0.012);
  hat.rotation.x = -0.08;
  const brim = add(head, new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.01, 18), m.cap));
  brim.position.set(0, 0.068, 0.02);
  brim.scale.set(1, 1, 1.18);
  brim.rotation.x = -0.12;
  const button = add(head, new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), m.cap));
  button.position.set(0, 0.136, -0.012);
  head.rotation.x = 0.18;
  body.add(head);

  const club = new THREE.Group();
  club.name = "club";
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.011, 0.86, 10), m.steel);
  shaft.name = "shaft";
  limbPlace(shaft, hands.x, hands.y + 0.08, hands.z - 0.02, headPt.x, headPt.y, headPt.z, 0.86);
  shaft.userData.restScaleY = shaft.scale.y;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.011, 0.17, 10), m.grip);
  limbPlace(handle, hands.x, hands.y + 0.09, hands.z - 0.02, hands.x, hands.y - 0.07, hands.z + 0.02, 0.17);
  const clubhead = new THREE.Group();
  clubhead.name = "clubhead";
  clubhead.position.set(headPt.x, headPt.y, headPt.z);
  const putterHead = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.034), m.putterFace);
  putterHead.name = "putter-head";
  const woodHead = new THREE.Mesh(new THREE.SphereGeometry(0.044, 12, 8), m.steel);
  woodHead.name = "wood-head";
  woodHead.scale.set(1.2, 0.46, 0.88);
  woodHead.visible = false;
  const ironHead = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.03, 0.022), m.steel);
  ironHead.name = "iron-head";
  ironHead.visible = false;
  clubhead.add(putterHead, woodHead, ironHead);

  const lHand = makeHand(m.glove, -1);
  lHand.position.set(hands.x - 0.01, hands.y + 0.025, hands.z);
  lHand.rotation.set(1.05, 0.15, -0.35);
  const rHand = makeHand(m.skin, 1);
  rHand.position.set(hands.x + 0.014, hands.y - 0.022, hands.z + 0.012);
  rHand.rotation.set(1.12, -0.12, 0.4);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.028, 10), m.glove);
  cuff.position.set(hands.x - 0.016, hands.y + 0.055, hands.z - 0.008);
  cuff.rotation.x = 0.75;
  club.add(shaft, handle, clubhead, lHand, rHand, cuff);

  root.add(body, club);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
  root.userData.meshCount = countMeshes(root);
  return root;
}

function limbPlace(mesh: THREE.Mesh, ax: number, ay: number, az: number, bx: number, by: number, bz: number, rest: number): void {
  _from.set(ax, ay, az);
  _to.set(bx, by, bz);
  _dir.subVectors(_to, _from);
  const len = _dir.length() || rest;
  mesh.position.addVectors(_from, _to).multiplyScalar(0.5);
  mesh.scale.set(1, len / rest, 1);
  mesh.quaternion.copy(_quat.setFromUnitVectors(Y_UP, _dir.normalize()));
}

function addShoe(parent: THREE.Object3D, ankle: Joint, m: ReturnType<typeof kit>, toe: number): void {
  const shoe = add(parent, new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.048, 0.22), m.shoe));
  shoe.position.set(ankle.x, 0.032, ankle.z + toe);
  const toeCap = ball(parent, 0.042, m.shoe, ankle.x, 0.034, ankle.z + toe + 0.08, 1.05, 0.7, 1.15);
  void toeCap;
  const sole = add(parent, new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.014, 0.21), m.sole));
  sole.position.set(ankle.x, 0.01, ankle.z + toe);
  const saddle = add(parent, new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.028, 0.09), m.saddle));
  saddle.position.set(ankle.x, 0.048, ankle.z + 0.01);
}

export function poseGolferClub(golfer: THREE.Group, clubId: string): void {
  const putter = golfer.getObjectByName("putter-head");
  const wood = golfer.getObjectByName("wood-head");
  const iron = golfer.getObjectByName("iron-head");
  const shaft = golfer.getObjectByName("shaft");
  const isPutt = clubId === "putter";
  const isWood = clubId === "driver" || clubId === "wood3" || clubId === "wood5";
  if (putter) putter.visible = isPutt;
  if (wood) wood.visible = isWood;
  if (iron) iron.visible = !isPutt && !isWood;
  if (shaft) {
    const rest = typeof shaft.userData.restScaleY === "number" ? shaft.userData.restScaleY : 1;
    shaft.scale.y = rest * (isPutt ? 0.82 : 1);
  }
}

export function snapGolferToBall(golfer: THREE.Group, ballX: number, groundY: number, ballZ: number, aim: number): void {
  golfer.position.set(ballX, groundY, ballZ);
  golfer.rotation.y = -aim + Math.PI / 2;
  golfer.updateMatrixWorld(true);
  const head = golfer.getObjectByName("clubhead");
  if (!head) return;
  const tmp = new THREE.Vector3();
  head.getWorldPosition(tmp);
  golfer.position.x += ballX - tmp.x;
  golfer.position.z += ballZ - tmp.z;
  golfer.position.y += groundY + 0.02 - tmp.y;
}

export function golferMeshCount(): number {
  return GOLFER_MESH_COUNT;
}

export function golferBoneCount(): number {
  return GOLFER_BONE_COUNT;
}

export function countMeshes(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) n += 1;
  });
  return n;
}

export function countBones(root: THREE.Object3D): number {
  const listed = root.userData.boneCount;
  if (typeof listed === "number") return listed;
  let n = 0;
  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) n += 1;
  });
  return n;
}

export function golferHeight(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return box.max.y - box.min.y;
}

export function golferAddressMetrics(root: THREE.Object3D): {
  height: number;
  clubheadY: number;
  handGap: number;
  stanceWidth: number;
} {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const head = root.getObjectByName("clubhead");
  const lHand = root.getObjectByName("left-hand");
  const rHand = root.getObjectByName("right-hand");
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  let clubheadY = 0.04;
  if (head) {
    head.getWorldPosition(tmp);
    clubheadY = tmp.y;
  }
  let handGap = 0.04;
  if (lHand && rHand) {
    lHand.getWorldPosition(tmp);
    rHand.getWorldPosition(tmp2);
    handGap = tmp.distanceTo(tmp2);
  }
  return {
    height: box.max.y - box.min.y,
    clubheadY,
    handGap,
    stanceWidth: box.max.x - box.min.x,
  };
}
