import * as THREE from "three";

export const GOLFER_MESH_COUNT = 42;
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
  const slacks = new THREE.MeshStandardMaterial({ map: twill, color: 0x6e828c, roughness: 0.82 });
  const shirt = new THREE.MeshStandardMaterial({ map: pique, color: 0xeee8dc, roughness: 0.64 });
  const shirtShade = new THREE.MeshStandardMaterial({ map: pique, color: 0xcfc8ba, roughness: 0.68 });
  const glove = new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.6 });
  const skin = new THREE.MeshPhysicalMaterial({
    color: 0xb8926c,
    roughness: 0.52,
    metalness: 0,
    sheen: 0.28,
    sheenColor: new THREE.Color(0xdcba96),
    sheenRoughness: 0.66,
  });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.5 });
  const sole = new THREE.MeshStandardMaterial({ color: 0x242422, roughness: 0.74 });
  const cap = new THREE.MeshStandardMaterial({ color: 0x24343a, roughness: 0.5 });
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

  const lFoot = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.16, 6, 12), shoe));
  lFoot.position.set(-0.2, 0.046, 0.16);
  lFoot.rotation.z = Math.PI / 2;
  lFoot.scale.set(1.05, 0.48, 0.82);
  const lSole = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.15, 4, 10), sole));
  lSole.position.set(-0.2, 0.018, 0.16);
  lSole.rotation.z = Math.PI / 2;
  lSole.scale.set(1.05, 0.2, 0.82);
  const rFoot = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.16, 6, 12), shoe));
  rFoot.position.set(0.2, 0.046, -0.04);
  rFoot.rotation.z = Math.PI / 2;
  rFoot.scale.set(1.05, 0.48, 0.82);
  const rSole = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.15, 4, 10), sole));
  rSole.position.set(0.2, 0.018, -0.04);
  rSole.rotation.z = Math.PI / 2;
  rSole.scale.set(1.05, 0.2, 0.82);

  const lShin = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.32, 8, 14), slacks));
  span(lShin, -0.16, 0.48, 0.1, -0.2, 0.1, 0.15, 0.32);
  const rShin = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.32, 8, 14), slacks));
  span(rShin, 0.16, 0.48, -0.02, 0.2, 0.1, -0.04, 0.32);

  const lThigh = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.34, 8, 14), slacks));
  span(lThigh, -0.12, 0.88, 0.02, -0.16, 0.48, 0.1, 0.34);
  const rThigh = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.34, 8, 14), slacks));
  span(rThigh, 0.13, 0.88, -0.02, 0.16, 0.48, -0.02, 0.34);

  const lCrease = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.26, 4, 8), slacks));
  lCrease.position.set(-0.17, 0.58, 0.09);
  lCrease.rotation.x = 0.2;
  const rCrease = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.26, 4, 8), slacks));
  rCrease.position.set(0.17, 0.58, 0.0);
  rCrease.rotation.x = 0.1;
  const hips = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), slacks));
  hips.position.set(0.0, 0.9, -0.01);
  hips.scale.set(1.2, 0.58, 0.78);
  const seat = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), slacks));
  seat.position.set(0.0, 0.84, -0.07);
  seat.scale.set(1.15, 0.48, 0.64);
  const beltMesh = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.168, 0.038, 18), belt));
  beltMesh.position.set(0.0, 0.98, 0.01);
  beltMesh.scale.set(1, 1, 0.68);
  const buckle = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.024, 0.01), steel));
  buckle.position.set(0.0, 0.98, 0.12);

  const torsoGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.155, 0),
      new THREE.Vector2(0.185, 0.12),
      new THREE.Vector2(0.215, 0.28),
      new THREE.Vector2(0.2, 0.4),
      new THREE.Vector2(0.125, 0.48),
    ],
    22,
  );
  const torso = add(body, new THREE.Mesh(torsoGeo, shirt));
  torso.position.set(0.0, 0.98, 0.03);
  torso.scale.set(1.18, 1.04, 0.98);
  torso.rotation.x = 0.32;
  torso.rotation.z = 0.12;
  const yoke = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), shirtShade));
  yoke.position.set(-0.01, 1.36, 0.04);
  yoke.scale.set(1.05, 0.42, 0.72);
  yoke.rotation.x = 0.28;
  const shoulders = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.34, 8, 14), shirt));
  shoulders.position.set(-0.02, 1.4, 0.08);
  shoulders.scale.set(1.15, 1, 1.15);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.rotation.y = 0.08;
  shoulders.rotation.x = 0.16;
  const hem = add(body, new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 8, 18), shirtShade));
  hem.position.set(0.0, 1.0, 0.03);
  hem.rotation.x = Math.PI / 2;
  hem.scale.set(1, 0.72, 1);

  const neck = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.09, 12), skin));
  neck.position.set(-0.01, 1.52, 0.18);
  neck.rotation.x = 0.32;
  const head = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.092, 20, 16), skin));
  head.name = "head";
  head.position.set(-0.015, 1.64, 0.24);
  head.scale.set(1.02, 1.08, 1.02);
  const jaw = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 10), skin));
  jaw.position.set(-0.015, 1.57, 0.26);
  jaw.scale.set(0.92, 0.55, 0.78);
  const hairMesh = add(body, new THREE.Mesh(new THREE.SphereGeometry(0.088, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hair));
  hairMesh.position.set(-0.015, 1.68, 0.23);

  const hat = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.104, 0.08, 16), cap));
  hat.position.set(-0.015, 1.75, 0.21);
  hat.rotation.x = 0.08;
  const brim = add(body, new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.014, 18), cap));
  brim.position.set(-0.015, 1.71, 0.24);
  brim.scale.set(1, 1, 1.2);

  const lShoulder = { x: -0.18, y: 1.38, z: 0.1 };
  const rShoulder = { x: 0.15, y: 1.36, z: 0.12 };
  const lElbow = { x: -0.08, y: 1.06, z: 0.3 };
  const rElbow = { x: 0.07, y: 1.04, z: 0.32 };
  const lWrist = { x: -0.012, y: 0.82, z: 0.47 };
  const rWrist = { x: 0.02, y: 0.8, z: 0.48 };
  const lUpper = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.24, 8, 12), shirt));
  span(lUpper, lShoulder.x, lShoulder.y, lShoulder.z, lElbow.x, lElbow.y, lElbow.z, 0.24);
  const rUpper = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.24, 8, 12), shirt));
  span(rUpper, rShoulder.x, rShoulder.y, rShoulder.z, rElbow.x, rElbow.y, rElbow.z, 0.24);
  const lFore = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.2, 8, 12), skin));
  span(lFore, lElbow.x, lElbow.y, lElbow.z, lWrist.x, lWrist.y, lWrist.z, 0.2);
  const rFore = add(body, new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.2, 8, 12), skin));
  span(rFore, rElbow.x, rElbow.y, rElbow.z, rWrist.x, rWrist.y, rWrist.z, 0.2);
  const lCuff = add(body, new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 12), shirt));
  lCuff.position.set(lElbow.x, lElbow.y, lElbow.z);
  lCuff.rotation.x = 0.9;
  const rCuff = add(body, new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 12), shirt));
  rCuff.position.set(rElbow.x, rElbow.y, rElbow.z);
  rCuff.rotation.x = 0.88;
  const collar = add(body, new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.014, 8, 14, Math.PI), shirt));
  collar.position.set(-0.01, 1.48, 0.18);
  collar.rotation.x = 1.12;
  const placket = add(body, new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.2, 0.01), shirtShade));
  placket.position.set(-0.01, 1.24, 0.17);
  placket.rotation.x = 0.32;
  placket.rotation.z = 0.12;

  const club = new THREE.Group();
  club.name = "club";
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.015, 0.86, 8), steel);
  shaft.name = "shaft";
  shaft.position.set(0.01, 0.44, 0.52);
  shaft.rotation.x = 0.3;
  shaft.rotation.z = 0.04;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.18, 8), grip);
  handle.position.set(0.01, 0.8, 0.475);
  handle.rotation.x = 0.3;
  handle.rotation.z = 0.04;
  const clubhead = new THREE.Group();
  clubhead.name = "clubhead";
  clubhead.position.set(0.025, 0.025, 0.6);
  const putterHead = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.024, 0.04), putterFace);
  putterHead.name = "putter-head";
  const woodHead = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), steel);
  woodHead.name = "wood-head";
  woodHead.scale.set(1.2, 0.5, 0.88);
  woodHead.visible = false;
  const ironHead = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.036, 0.026), steel);
  ironHead.name = "iron-head";
  ironHead.visible = false;
  clubhead.add(putterHead, woodHead, ironHead);

  const lHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.06, 6, 10), glove);
  lHand.position.set(-0.008, 0.8, 0.478);
  lHand.rotation.x = 0.95;
  const rHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.06, 6, 10), skin);
  rHand.position.set(0.02, 0.785, 0.485);
  rHand.rotation.x = 0.95;
  const gloveCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.02, 10), glove);
  gloveCuff.position.set(-0.008, 0.835, 0.46);
  gloveCuff.rotation.x = 0.85;
  const lThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.026, 4, 8), glove);
  lThumb.position.set(-0.026, 0.79, 0.5);
  lThumb.rotation.z = 0.55;
  const rThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.026, 4, 8), skin);
  rThumb.position.set(0.036, 0.775, 0.505);
  rThumb.rotation.z = -0.55;
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
