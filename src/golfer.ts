import * as THREE from "three";

export const GOLFER_MESH_COUNT = 53;
export const GOLFER_BONE_COUNT = 14;

function clothPique(): THREE.DataTexture {
  const w = 64;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = ((x >> 2) + (y >> 2)) & 1;
      const n = ((x * 13 + y * 7) & 7) / 7;
      const v = cell ? 236 + n * 12 : 222 + n * 10;
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v - 4;
      data[i + 2] = v - 10;
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
      const v = diag ? 28 + n * 10 : 20 + n * 8;
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v + 6;
      data[i + 2] = v + 12;
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

/** Right-handed address figure. Visible meshes stay in one posed body; bones mark the skeleton. */
export function buildAddressGolfer(): THREE.Group {
  const root = new THREE.Group();
  root.name = "golfer";

  const pique = clothPique();
  const twill = clothTwill();
  const slacks = new THREE.MeshStandardMaterial({ map: twill, color: 0x7e96a4, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ map: pique, color: 0xf4efe6, roughness: 0.62 });
  const shirtShade = new THREE.MeshStandardMaterial({ map: pique, color: 0xd8d0c4, roughness: 0.66 });
  const glove = new THREE.MeshStandardMaterial({ color: 0xe4e0d6, roughness: 0.58 });
  const skin = new THREE.MeshPhysicalMaterial({
    color: 0xc49a74,
    roughness: 0.5,
    metalness: 0,
    sheen: 0.32,
    sheenColor: new THREE.Color(0xe8c4a0),
    sheenRoughness: 0.62,
  });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.46 });
  const sole = new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.7 });
  const cap = new THREE.MeshStandardMaterial({ color: 0x1e3840, roughness: 0.48 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.7 });
  const belt = new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.55 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x1c1c1a, roughness: 0.72 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb4bac0, roughness: 0.2, metalness: 0.68 });
  const putterFace = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.55 });

  const hipsB = makeBone("hips", 0.01, 0.86, -0.01);
  const spine = makeBone("spine", 0, 0.16, 0.02);
  const chest = makeBone("chest", 0, 0.22, 0.04);
  const neckB = makeBone("neck", 0, 0.18, 0.06);
  const headB = makeBone("headBone", 0, 0.14, 0.04);
  const lClav = makeBone("lClav", -0.16, 0.14, 0.08);
  const rClav = makeBone("rClav", 0.16, 0.14, 0.08);
  const lUpperB = makeBone("lUpper", 0, -0.12, 0.1);
  const rUpperB = makeBone("rUpper", 0, -0.12, 0.1);
  const lForeB = makeBone("lFore", 0, -0.22, 0.08);
  const rForeB = makeBone("rFore", 0, -0.22, 0.08);
  const lThighB = makeBone("lThigh", -0.14, -0.2, 0.04);
  const rThighB = makeBone("rThigh", 0.16, -0.2, -0.02);
  const lShinB = makeBone("lShin", 0, -0.32, 0.04);
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

  const lFoot = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.14, 6, 12), shoe);
  lFoot.position.set(-0.17, 0.05, 0.12);
  lFoot.rotation.z = Math.PI / 2;
  lFoot.scale.set(1, 0.55, 0.85);
  const lSole = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.14, 4, 10), sole);
  lSole.position.set(-0.17, 0.02, 0.12);
  lSole.rotation.z = Math.PI / 2;
  lSole.scale.set(1, 0.22, 0.85);
  const rFoot = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.14, 6, 12), shoe);
  rFoot.position.set(0.2, 0.05, -0.05);
  rFoot.rotation.z = Math.PI / 2;
  rFoot.scale.set(1, 0.55, 0.85);
  const rSole = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.14, 4, 10), sole);
  rSole.position.set(0.2, 0.02, -0.05);
  rSole.rotation.z = Math.PI / 2;
  rSole.scale.set(1, 0.22, 0.85);
  const lSock = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.04, 0.07, 12), shirt);
  lSock.position.set(-0.16, 0.1, 0.1);
  const rSock = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.04, 0.07, 12), shirt);
  rSock.position.set(0.19, 0.1, -0.03);

  const lShin = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 8, 16), slacks);
  lShin.position.set(-0.16, 0.3, 0.1);
  lShin.rotation.x = 0.18;
  const rShin = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 8, 16), slacks);
  rShin.position.set(0.19, 0.3, -0.02);
  rShin.rotation.x = 0.08;

  const lThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.32, 8, 16), slacks);
  lThigh.position.set(-0.14, 0.64, 0.05);
  lThigh.rotation.x = 0.28;
  lThigh.rotation.z = 0.06;
  const rThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.32, 8, 16), slacks);
  rThigh.position.set(0.16, 0.64, -0.04);
  rThigh.rotation.x = 0.16;
  rThigh.rotation.z = -0.05;

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), slacks);
  hips.position.set(0.01, 0.86, -0.01);
  hips.scale.set(1.18, 0.58, 0.72);
  const seat = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), slacks);
  seat.position.set(0.01, 0.8, -0.08);
  seat.scale.set(1.2, 0.55, 0.7);
  const lCrease = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.24, 4, 8), slacks);
  lCrease.position.set(-0.16, 0.58, 0.08);
  lCrease.rotation.x = 0.22;
  const rCrease = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.24, 4, 8), slacks);
  rCrease.position.set(0.18, 0.58, -0.02);
  rCrease.rotation.x = 0.12;
  const beltMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.185, 0.042, 20), belt);
  beltMesh.position.set(0.01, 0.95, 0.0);
  beltMesh.scale.set(1, 1, 0.7);

  const torsoGeo = new THREE.LatheGeometry(
    [new THREE.Vector2(0.17, 0), new THREE.Vector2(0.2, 0.14), new THREE.Vector2(0.23, 0.3), new THREE.Vector2(0.2, 0.42), new THREE.Vector2(0.13, 0.5)],
    24,
  );
  const torso = new THREE.Mesh(torsoGeo, shirt);
  torso.position.set(0.0, 0.96, 0.02);
  torso.scale.set(1.08, 1, 0.78);
  torso.rotation.x = 0.38;
  torso.rotation.z = 0.18;
  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.38, 8, 16), shirt);
  shoulders.position.set(-0.02, 1.38, 0.1);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.rotation.y = 0.1;
  shoulders.rotation.x = 0.18;

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 14), skin);
  neck.position.set(-0.01, 1.5, 0.2);
  neck.rotation.x = 0.35;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 22, 18), skin);
  head.name = "head";
  head.position.set(-0.02, 1.62, 0.26);
  head.scale.set(0.92, 1.05, 0.95);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 12), skin);
  jaw.position.set(-0.02, 1.54, 0.28);
  jaw.scale.set(0.95, 0.62, 0.8);
  const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.1, 4, 8), skin);
  brow.position.set(-0.02, 1.66, 0.34);
  brow.rotation.z = Math.PI / 2;
  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairMesh.position.set(-0.02, 1.66, 0.25);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), skin);
  nose.position.set(-0.02, 1.6, 0.36);
  const lEar = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), skin);
  lEar.position.set(-0.11, 1.62, 0.26);
  const rEar = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), skin);
  rEar.position.set(0.07, 1.62, 0.26);

  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.118, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), cap);
  hat.position.set(-0.02, 1.7, 0.25);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.018, 20), cap);
  brim.position.set(-0.02, 1.652, 0.3);

  const lUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.26, 8, 14), shirt);
  lUpper.position.set(-0.14, 1.16, 0.22);
  lUpper.rotation.x = 0.72;
  lUpper.rotation.z = 0.22;
  const rUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.25, 8, 14), shirt);
  rUpper.position.set(0.12, 1.14, 0.24);
  rUpper.rotation.x = 0.7;
  rUpper.rotation.z = -0.2;
  const lCuff = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.009, 8, 14), shirt);
  lCuff.position.set(-0.06, 0.98, 0.36);
  lCuff.rotation.x = 0.9;
  const rCuff = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.009, 8, 14), shirt);
  rCuff.position.set(0.05, 0.96, 0.38);
  rCuff.rotation.x = 0.88;

  const lFore = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.2, 8, 14), skin);
  lFore.position.set(-0.05, 0.92, 0.4);
  lFore.rotation.x = 0.48;
  lFore.rotation.z = 0.08;
  const rFore = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.2, 8, 14), skin);
  rFore.position.set(0.04, 0.9, 0.42);
  rFore.rotation.x = 0.46;
  rFore.rotation.z = -0.06;

  const lHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.055, 6, 10), glove);
  lHand.position.set(-0.015, 0.8, 0.46);
  lHand.rotation.x = 0.95;
  const rHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.055, 6, 10), skin);
  rHand.position.set(0.018, 0.785, 0.47);
  rHand.rotation.x = 0.95;
  const gloveCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.028, 0.024, 10), glove);
  gloveCuff.position.set(-0.015, 0.84, 0.44);
  gloveCuff.rotation.x = 0.85;
  const lThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.032, 4, 8), glove);
  lThumb.position.set(-0.035, 0.79, 0.48);
  lThumb.rotation.z = 0.55;
  const rThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.032, 4, 8), skin);
  rThumb.position.set(0.038, 0.775, 0.49);
  rThumb.rotation.z = -0.55;

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.016, 8, 16, Math.PI), shirt);
  collar.position.set(-0.01, 1.46, 0.2);
  collar.rotation.x = 1.15;

  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.22, 0.012), shirtShade);
  placket.position.set(-0.01, 1.22, 0.18);
  placket.rotation.x = 0.38;
  placket.rotation.z = 0.16;
  const btn1 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 8), shirt);
  btn1.position.set(-0.01, 1.28, 0.2);
  btn1.rotation.x = 1.2;
  const btn2 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 8), shirt);
  btn2.position.set(-0.005, 1.16, 0.22);
  btn2.rotation.x = 1.2;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.028, 0.012), steel);
  buckle.position.set(0.01, 0.95, 0.12);

  const lEye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), hair);
  lEye.position.set(-0.045, 1.62, 0.35);
  const rEye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), hair);
  rEye.position.set(0.01, 1.62, 0.35);
  const mouth = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.028, 4, 8), skin);
  mouth.position.set(-0.018, 1.545, 0.35);
  mouth.rotation.z = Math.PI / 2;
  mouth.scale.set(1, 0.45, 0.7);

  const lToe = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), shoe);
  lToe.position.set(-0.17, 0.042, 0.22);
  lToe.scale.set(1.1, 0.55, 0.9);
  const rToe = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), shoe);
  rToe.position.set(0.2, 0.042, 0.05);
  rToe.scale.set(1.1, 0.55, 0.9);

  body.add(
    lFoot,
    lSole,
    rFoot,
    rSole,
    lSock,
    rSock,
    lShin,
    rShin,
    lThigh,
    rThigh,
    hips,
    seat,
    lCrease,
    rCrease,
    beltMesh,
    torso,
    shoulders,
    neck,
    head,
    jaw,
    brow,
    hairMesh,
    nose,
    lEar,
    rEar,
    hat,
    brim,
    lUpper,
    rUpper,
    lCuff,
    rCuff,
    lFore,
    rFore,
    lHand,
    rHand,
    gloveCuff,
    lThumb,
    rThumb,
    collar,
    placket,
    btn1,
    btn2,
    buckle,
    lEye,
    rEye,
    mouth,
    lToe,
    rToe,
  );

  const club = new THREE.Group();
  club.name = "club";
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.82, 8), steel);
  shaft.name = "shaft";
  shaft.position.set(0.0, 0.42, 0.5);
  shaft.rotation.x = 0.28;
  shaft.rotation.z = 0.04;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.18, 8), grip);
  handle.position.set(0.0, 0.8, 0.46);
  handle.rotation.x = 0.28;
  handle.rotation.z = 0.04;
  const clubhead = new THREE.Group();
  clubhead.name = "clubhead";
  clubhead.position.set(0.02, 0.03, 0.58);
  const putterHead = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.028, 0.042), putterFace);
  putterHead.name = "putter-head";
  const woodHead = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), steel);
  woodHead.name = "wood-head";
  woodHead.scale.set(1.15, 0.55, 0.85);
  woodHead.visible = false;
  const ironHead = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.028), steel);
  ironHead.name = "iron-head";
  ironHead.visible = false;
  clubhead.add(putterHead, woodHead, ironHead);
  club.add(shaft, handle, clubhead);
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
  if (shaft) shaft.scale.y = isPutt ? 0.86 : 1;
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
