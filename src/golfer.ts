import * as THREE from "three";

export const GOLFER_MESH_COUNT = 46;
export const GOLFER_BONE_COUNT = 14;

function clothPique(): THREE.DataTexture {
  const w = 64;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = ((x >> 2) + (y >> 2)) & 1;
      const n = ((x * 13 + y * 7) & 7) / 7;
      const v = cell ? 232 + n * 10 : 218 + n * 8;
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v - 3;
      data[i + 2] = v - 8;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 8);
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
      return (cell ? 0.62 : 0.38) + (((x * 13 + y * 7) & 7) / 7) * 0.12;
    }
    const diag = ((x + y) >> 2) & 1;
    return (diag ? 0.58 : 0.4) + (((x * 5 + y * 11) & 7) / 7) * 0.1;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (height(x - 1, y) - height(x + 1, y)) * 2.2;
      const ny = (height(x, y - 1) - height(x, y + 1)) * 2.2;
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
  tex.repeat.set(kind === "pique" ? 6 : 5, kind === "pique" ? 8 : 10);
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
      const v = 168 + n * 28;
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v - 18;
      data[i + 2] = v - 36;
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

function clothTwill(): THREE.DataTexture {
  const w = 64;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const diag = ((x + y) >> 2) & 1;
      const n = ((x * 5 + y * 11) & 7) / 7;
      const v = diag ? 26 + n * 8 : 18 + n * 6;
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v + 4;
      data[i + 2] = v + 8;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 10);
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

function add(parent: THREE.Group, mesh: THREE.Mesh): THREE.Mesh {
  parent.add(mesh);
  return mesh;
}

const Y_UP = new THREE.Vector3(0, 1, 0);
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _quat = new THREE.Quaternion();

/** Place a Y-aligned capsule so its ends sit on two joints. */
function span(mesh: THREE.Mesh, ax: number, ay: number, az: number, bx: number, by: number, bz: number, rest: number): void {
  _from.set(ax, ay, az);
  _to.set(bx, by, bz);
  _mid.addVectors(_from, _to).multiplyScalar(0.5);
  _dir.subVectors(_to, _from);
  const len = _dir.length() || rest;
  mesh.position.copy(_mid);
  mesh.scale.set(1, len / rest, 1);
  _dir.normalize();
  mesh.quaternion.copy(_quat.setFromUnitVectors(Y_UP, _dir));
}

/** Right-handed address figure. Visible meshes stay in one posed body; bones mark the skeleton. */
export function buildAddressGolfer(): THREE.Group {
  const root = new THREE.Group();
  root.name = "golfer";

  const pique = clothPique();
  const twill = clothTwill();
  const piqueN = fabricNormal("pique");
  const twillN = fabricNormal("twill");
  const leather = leatherGrain();
  const slacks = new THREE.MeshPhysicalMaterial({
    map: twill,
    normalMap: twillN,
    normalScale: new THREE.Vector2(0.45, 0.45),
    color: 0x6a7c88,
    roughness: 0.78,
    sheen: 0.22,
    sheenColor: new THREE.Color(0x8a9aa4),
    sheenRoughness: 0.7,
  });
  const shirt = new THREE.MeshPhysicalMaterial({
    map: pique,
    normalMap: piqueN,
    normalScale: new THREE.Vector2(0.55, 0.55),
    color: 0xf0ebe2,
    roughness: 0.58,
    sheen: 0.42,
    sheenColor: new THREE.Color(0xffffff),
    sheenRoughness: 0.55,
  });
  const shirtShade = new THREE.MeshPhysicalMaterial({
    map: pique,
    normalMap: piqueN,
    color: 0xc8c2b4,
    roughness: 0.64,
    sheen: 0.28,
    sheenColor: new THREE.Color(0xeee8dc),
    sheenRoughness: 0.62,
  });
  const glove = new THREE.MeshPhysicalMaterial({
    map: leather,
    color: 0xc8b89a,
    roughness: 0.52,
    sheen: 0.18,
    sheenColor: new THREE.Color(0xe8d8b8),
    sheenRoughness: 0.6,
  });
  const skin = new THREE.MeshPhysicalMaterial({
    color: 0xc49a78,
    roughness: 0.44,
    metalness: 0,
    sheen: 0.38,
    sheenColor: new THREE.Color(0xe8c4a4),
    sheenRoughness: 0.55,
    clearcoat: 0.08,
    clearcoatRoughness: 0.62,
  });
  const shoe = new THREE.MeshPhysicalMaterial({
    map: leather,
    color: 0xf2eee4,
    roughness: 0.42,
    sheen: 0.16,
    sheenColor: new THREE.Color(0xffffff),
    sheenRoughness: 0.5,
  });
  const saddle = new THREE.MeshPhysicalMaterial({ map: leather, color: 0x5a4030, roughness: 0.55 });
  const sole = new THREE.MeshStandardMaterial({ color: 0x1e1e1c, roughness: 0.78 });
  const cap = new THREE.MeshPhysicalMaterial({ color: 0x1c2e36, roughness: 0.42, sheen: 0.2, sheenColor: new THREE.Color(0x4a6070) });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.72 });
  const belt = new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.55 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x1a1a18, roughness: 0.74 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb0b6bc, roughness: 0.22, metalness: 0.7 });
  const putterFace = new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.3, metalness: 0.52 });

  const hipsB = makeBone("hips", 0.0, 0.9, 0.0);
  const spine = makeBone("spine", 0, 0.16, 0.03);
  const chest = makeBone("chest", 0, 0.2, 0.04);
  const neckB = makeBone("neck", 0, 0.16, 0.05);
  const headB = makeBone("headBone", 0, 0.13, 0.03);
  const lClav = makeBone("lClav", -0.15, 0.12, 0.06);
  const rClav = makeBone("rClav", 0.15, 0.12, 0.06);
  const lUpperB = makeBone("lUpper", 0, -0.14, 0.1);
  const rUpperB = makeBone("rUpper", 0, -0.14, 0.1);
  const lForeB = makeBone("lFore", 0, -0.2, 0.08);
  const rForeB = makeBone("rFore", 0, -0.2, 0.08);
  const lThighB = makeBone("lThigh", -0.12, -0.2, 0.03);
  const rThighB = makeBone("rThigh", 0.14, -0.2, -0.02);
  const lShinB = makeBone("lShin", 0, -0.3, 0.04);
  hipsB.add(spine, lThighB, rThighB);
  spine.add(chest);
  chest.add(neckB, lClav, rClav);
  neckB.add(headB);
  lClav.add(lUpperB);
  rClav.add(rUpperB);
  lUpperB.add(lForeB);
  rUpperB.add(rForeB);
  lThighB.add(lShinB);
  const bones = [hipsB, spine, chest, neckB, headB, lClav, rClav, lUpperB, rUpperB, lForeB, rForeB, lThighB, rThighB, lShinB];
  root.add(hipsB);
  root.userData.skeleton = new THREE.Skeleton(bones);
  root.userData.boneCount = bones.length;

  const body = new THREE.Group();
  body.name = "body";

  const lHip = { x: -0.1, y: 0.9, z: -0.02 };
  const rHip = { x: 0.1, y: 0.9, z: -0.04 };
  const lKnee = { x: -0.13, y: 0.5, z: 0.07 };
  const rKnee = { x: 0.14, y: 0.5, z: -0.01 };
  const lAnkle = { x: -0.15, y: 0.07, z: 0.1 };
  const rAnkle = { x: 0.16, y: 0.07, z: -0.06 };
  const lShoulder = { x: -0.19, y: 1.42, z: 0.06 };
  const rShoulder = { x: 0.19, y: 1.4, z: 0.04 };
  const lElbow = { x: -0.1, y: 1.1, z: 0.22 };
  const rElbow = { x: 0.09, y: 1.08, z: 0.24 };
  const hands = { x: 0.01, y: 0.78, z: 0.38 };
  const headPos = { x: 0, y: 1.62, z: 0.16 };

  const lFoot = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.22), shoe));
  lFoot.position.set(lAnkle.x, 0.03, lAnkle.z + 0.04);
  const rFoot = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.22), shoe));
  rFoot.position.set(rAnkle.x, 0.03, rAnkle.z + 0.04);
  const lSole = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.016, 0.21), sole));
  lSole.position.set(lAnkle.x, 0.01, lAnkle.z + 0.04);
  const rSole = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.016, 0.21), sole));
  rSole.position.set(rAnkle.x, 0.01, rAnkle.z + 0.04);
  const lSaddle = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.1), saddle));
  lSaddle.position.set(lAnkle.x, 0.046, lAnkle.z);
  const rSaddle = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.1), saddle));
  rSaddle.position.set(rAnkle.x, 0.046, rAnkle.z);

  const lShin = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.36, 6, 12), slacks));
  span(lShin, lKnee.x, lKnee.y, lKnee.z, lAnkle.x, lAnkle.y, lAnkle.z, 0.36);
  const rShin = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.36, 6, 12), slacks));
  span(rShin, rKnee.x, rKnee.y, rKnee.z, rAnkle.x, rAnkle.y, rAnkle.z, 0.36);
  const lThigh = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.34, 6, 12), slacks));
  span(lThigh, lHip.x, lHip.y, lHip.z, lKnee.x, lKnee.y, lKnee.z, 0.34);
  const rThigh = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.34, 6, 12), slacks));
  span(rThigh, rHip.x, rHip.y, rHip.z, rKnee.x, rKnee.y, rKnee.z, 0.34);
  const lKneeCap = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), slacks));
  lKneeCap.position.set(lKnee.x, lKnee.y, lKnee.z);
  const rKneeCap = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), slacks));
  rKneeCap.position.set(rKnee.x, rKnee.y, rKnee.z);

  const hips = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), slacks));
  hips.position.set(0, 0.9, -0.03);
  hips.scale.set(1.15, 0.55, 0.72);
  const seat = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), slacks));
  seat.position.set(0, 0.84, -0.08);
  seat.scale.set(1.05, 0.42, 0.58);
  const beltMesh = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.155, 0.036, 16), belt));
  beltMesh.position.set(0, 0.98, 0.0);
  beltMesh.scale.set(1, 1, 0.7);
  const buckle = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.022, 0.01), steel));
  buckle.position.set(0, 0.98, 0.11);

  const torso = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.34, 8, 14), shirt));
  torso.position.set(0, 1.2, 0.04);
  torso.scale.set(1.05, 1, 0.72);
  torso.rotation.x = 0.22;
  const shoulders = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 6, 12), shirt));
  shoulders.position.set(0, 1.41, 0.05);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.scale.set(1, 1, 1.05);
  const hem = add(body, new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.012, 8, 16), shirtShade));
  hem.position.set(0, 1.0, 0.01);
  hem.rotation.x = Math.PI / 2;
  hem.scale.set(1, 0.7, 1);
  const placket = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.22, 0.01), shirtShade));
  placket.position.set(0, 1.22, 0.14);
  placket.rotation.x = 0.22;

  const neck = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.046, 0.08, 10), skin));
  neck.position.set(0, 1.5, 0.12);
  neck.rotation.x = 0.18;
  const head = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 14), skin));
  head.name = "head";
  head.position.set(headPos.x, headPos.y, headPos.z);
  head.scale.set(0.95, 1.05, 0.98);
  const jaw = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skin));
  jaw.position.set(0, 1.55, 0.19);
  jaw.scale.set(0.85, 0.5, 0.7);
  const nose = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), skin));
  nose.position.set(0, 1.61, 0.25);
  const hairMesh = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair));
  hairMesh.position.set(0, 1.67, 0.15);
  const hat = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.096, 0.07, 14), cap));
  hat.position.set(0, 1.73, 0.14);
  const brim = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.012, 16), cap));
  brim.position.set(0, 1.695, 0.17);
  brim.scale.set(1, 1, 1.15);

  const lUpper = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.26, 6, 10), shirt));
  span(lUpper, lShoulder.x, lShoulder.y, lShoulder.z, lElbow.x, lElbow.y, lElbow.z, 0.26);
  const rUpper = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.26, 6, 10), shirt));
  span(rUpper, rShoulder.x, rShoulder.y, rShoulder.z, rElbow.x, rElbow.y, rElbow.z, 0.26);
  const lFore = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.24, 6, 10), skin));
  span(lFore, lElbow.x, lElbow.y, lElbow.z, hands.x - 0.02, hands.y, hands.z, 0.24);
  const rFore = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.24, 6, 10), skin));
  span(rFore, rElbow.x, rElbow.y, rElbow.z, hands.x + 0.02, hands.y - 0.02, hands.z, 0.24);
  const lShoulderCap = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), shirt));
  lShoulderCap.position.set(lShoulder.x, lShoulder.y, lShoulder.z);
  const rShoulderCap = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), shirt));
  rShoulderCap.position.set(rShoulder.x, rShoulder.y, rShoulder.z);
  const lElbowCap = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), shirt));
  lElbowCap.position.set(lElbow.x, lElbow.y, lElbow.z);
  const rElbowCap = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), shirt));
  rElbowCap.position.set(rElbow.x, rElbow.y, rElbow.z);
  const collar = add(body, new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 12, Math.PI), shirt));
  collar.position.set(0, 1.47, 0.12);
  collar.rotation.x = 1.05;

  const club = new THREE.Group();
  club.name = "club";
  const headPt = { x: 0.02, y: 0.03, z: 0.52 };
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.013, 0.82, 8), steel);
  shaft.name = "shaft";
  span(shaft, hands.x, hands.y + 0.06, hands.z - 0.02, headPt.x, headPt.y, headPt.z, 0.82);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.012, 0.16, 8), grip);
  span(handle, hands.x, hands.y + 0.08, hands.z - 0.02, hands.x, hands.y - 0.06, hands.z + 0.02, 0.16);
  const clubhead = new THREE.Group();
  clubhead.name = "clubhead";
  clubhead.position.set(headPt.x, headPt.y, headPt.z);
  const putterHead = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.036), putterFace);
  putterHead.name = "putter-head";
  const woodHead = new THREE.Mesh(new THREE.SphereGeometry(0.046, 10, 8), steel);
  woodHead.name = "wood-head";
  woodHead.scale.set(1.15, 0.48, 0.85);
  woodHead.visible = false;
  const ironHead = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.032, 0.024), steel);
  ironHead.name = "iron-head";
  ironHead.visible = false;
  clubhead.add(putterHead, woodHead, ironHead);

  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), glove);
  lHand.position.set(hands.x - 0.012, hands.y + 0.02, hands.z);
  lHand.scale.set(0.85, 1.15, 0.75);
  const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), skin);
  rHand.position.set(hands.x + 0.014, hands.y - 0.02, hands.z + 0.01);
  rHand.scale.set(0.85, 1.15, 0.75);
  const gloveCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.03, 10), glove);
  gloveCuff.position.set(hands.x - 0.02, hands.y + 0.05, hands.z - 0.01);
  gloveCuff.rotation.x = 0.7;
  const lThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.028, 4, 6), glove);
  lThumb.position.set(hands.x - 0.03, hands.y + 0.01, hands.z + 0.02);
  lThumb.rotation.z = 0.8;
  const rThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.028, 4, 6), skin);
  rThumb.position.set(hands.x + 0.032, hands.y - 0.02, hands.z + 0.02);
  rThumb.rotation.z = -0.8;
  club.add(shaft, handle, clubhead, lHand, rHand, gloveCuff, lThumb, rThumb);

  root.add(body, club);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
  root.userData.meshCount = countMeshes(root);
  return root;
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
  if (shaft) shaft.scale.y = isPutt ? 0.82 : 1;
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
