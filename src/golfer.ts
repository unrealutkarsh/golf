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

function bone(name: string, y: number): THREE.Bone {
  const b = new THREE.Bone();
  b.name = name;
  b.position.y = y;
  return b;
}

/** Right-handed address figure on a 14-bone skeleton. Clubhead snaps to the ball. */
export function buildAddressGolfer(): THREE.Group {
  const root = new THREE.Group();
  root.name = "golfer";

  const pique = clothPique();
  const twill = clothTwill();
  const slacks = new THREE.MeshStandardMaterial({ map: twill, color: 0x8aa0b0, roughness: 0.78 });
  const shirt = new THREE.MeshStandardMaterial({ map: pique, color: 0xf6f2ea, roughness: 0.52 });
  const shirtShade = new THREE.MeshStandardMaterial({ map: pique, color: 0xddd6cb, roughness: 0.56 });
  const glove = new THREE.MeshStandardMaterial({ color: 0xe6e0d6, roughness: 0.58 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc49a74, roughness: 0.48 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.42 });
  const sole = new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.72 });
  const cap = new THREE.MeshStandardMaterial({ color: 0x1e3840, roughness: 0.5 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.72 });
  const belt = new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.55 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x1c1c1a, roughness: 0.72 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb4bac0, roughness: 0.2, metalness: 0.68 });
  const putterFace = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.55 });

  const hips = bone("hips", 0.86);
  const spine = bone("spine", 0.16);
  const chest = bone("chest", 0.22);
  const neckB = bone("neck", 0.2);
  const headB = bone("headBone", 0.12);
  const lClav = bone("lClav", 0);
  const rClav = bone("rClav", 0);
  const lUpperB = bone("lUpper", 0);
  const rUpperB = bone("rUpper", 0);
  const lForeB = bone("lFore", 0);
  const rForeB = bone("rFore", 0);
  const lThighB = bone("lThigh", 0);
  const rThighB = bone("rThigh", 0);
  const lShinB = bone("lShin", 0);
  hips.add(spine, lThighB, rThighB);
  spine.add(chest);
  chest.add(neckB, lClav, rClav);
  neckB.add(headB);
  lClav.add(lUpperB);
  rClav.add(rUpperB);
  lUpperB.add(lForeB);
  rUpperB.add(rForeB);
  lThighB.add(lShinB);
  const bones = [hips, spine, chest, neckB, headB, lClav, rClav, lUpperB, rUpperB, lForeB, rForeB, lThighB, rThighB, lShinB];
  const skeleton = new THREE.Skeleton(bones);
  root.add(hips);
  root.userData.skeleton = skeleton;
  root.userData.boneCount = bones.length;

  hips.rotation.x = 0.14;
  spine.rotation.x = 0.2;
  spine.rotation.z = 0.12;
  chest.rotation.x = 0.16;
  neckB.rotation.x = 0.18;
  lClav.position.set(-0.16, 0.16, 0.08);
  rClav.position.set(0.16, 0.16, 0.08);
  lUpperB.position.set(-0.04, -0.04, 0.12);
  lUpperB.rotation.set(1.02, 0, 0.34);
  rUpperB.position.set(0.04, -0.04, 0.12);
  rUpperB.rotation.set(0.96, 0, -0.28);
  lForeB.position.set(0, -0.26, 0.02);
  lForeB.rotation.x = 0.28;
  rForeB.position.set(0, -0.26, 0.02);
  rForeB.rotation.x = 0.26;
  lThighB.position.set(-0.14, -0.04, 0.04);
  lThighB.rotation.x = 0.22;
  rThighB.position.set(0.16, -0.04, -0.03);
  rThighB.rotation.x = 0.12;
  lShinB.position.set(0, -0.34, 0.02);
  lShinB.rotation.x = 0.08;

  const lFoot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.23), shoe);
  lFoot.position.set(-0.17, 0.05, 0.11);
  const lSole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.014, 0.23), sole);
  lSole.position.set(-0.17, 0.018, 0.11);
  const rFoot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.23), shoe);
  rFoot.position.set(0.2, 0.05, -0.04);
  const rSole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.014, 0.23), sole);
  rSole.position.set(0.2, 0.018, -0.04);
  const lSock = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.04, 0.08, 8), shirt);
  lSock.position.set(-0.16, 0.1, 0.1);
  const rSock = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.04, 0.08, 8), shirt);
  rSock.position.set(0.19, 0.1, -0.02);

  const lShin = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.3, 4, 10), slacks);
  lShin.position.set(0, -0.16, 0);
  lShinB.add(lShin);
  const rShin = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.3, 4, 10), slacks);
  rShin.position.set(0.19, 0.3, -0.02);
  rShin.rotation.x = 0.08;
  const lThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 10), slacks);
  lThigh.position.set(0, -0.16, 0);
  lThighB.add(lThigh);
  const rThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 10), slacks);
  rThigh.position.set(0, -0.16, 0);
  rThighB.add(rThigh);
  const lCuff = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.01, 6, 10), slacks);
  lCuff.position.set(-0.16, 0.16, 0.1);
  lCuff.rotation.x = 1.2;
  const rCuff = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.01, 6, 10), slacks);
  rCuff.position.set(0.19, 0.16, -0.02);
  rCuff.rotation.x = 1.1;

  const hipMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), slacks);
  hipMesh.scale.set(1.22, 0.62, 0.78);
  hips.add(hipMesh);
  const seat = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), slacks);
  seat.position.set(0, -0.04, -0.08);
  seat.scale.set(1.35, 0.7, 0.7);
  hips.add(seat);
  const beltMesh = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 6, 16), belt);
  beltMesh.rotation.x = Math.PI / 2;
  beltMesh.position.y = 0.06;
  hips.add(beltMesh);

  const torsoGeo = new THREE.LatheGeometry(
    [new THREE.Vector2(0.15, 0), new THREE.Vector2(0.18, 0.12), new THREE.Vector2(0.2, 0.26), new THREE.Vector2(0.175, 0.38), new THREE.Vector2(0.12, 0.46)],
    16,
  );
  const torso = new THREE.Mesh(torsoGeo, shirt);
  torso.scale.set(1.05, 1, 0.72);
  torso.position.y = -0.02;
  spine.add(torso);
  const drape = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.06), shirtShade);
  drape.position.set(0, 0.02, -0.08);
  drape.rotation.x = 0.2;
  spine.add(drape);
  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.02), shirtShade);
  placket.position.set(0.01, 0.18, 0.14);
  chest.add(placket);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 14, Math.PI * 1.2), shirt);
  hem.position.set(0, -0.02, 0.02);
  hem.rotation.x = 1.2;
  spine.add(hem);

  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.38, 4, 10), shirt);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.set(0, 0.14, 0.04);
  chest.add(shoulders);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.1, 10), skin);
  neck.position.y = 0.04;
  neckB.add(neck);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 12, Math.PI), shirt);
  collar.position.set(0, 0.02, 0.04);
  collar.rotation.x = 1.05;
  neckB.add(collar);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 14), skin);
  head.name = "head";
  head.scale.set(0.9, 1.04, 0.94);
  headB.add(head);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), skin);
  jaw.position.set(0, -0.05, 0.03);
  jaw.scale.set(0.95, 0.7, 0.85);
  headB.add(jaw);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.04), skin);
  brow.position.set(0, 0.03, 0.08);
  headB.add(brow);
  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.096, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairMesh.position.set(0, 0.04, -0.01);
  headB.add(hairMesh);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), skin);
  nose.position.set(0, -0.01, 0.1);
  headB.add(nose);
  const lEar = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), skin);
  lEar.position.set(-0.09, 0, 0);
  const rEar = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), skin);
  rEar.position.set(0.09, 0, 0);
  headB.add(lEar, rEar);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.112, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), cap);
  hat.position.set(0, 0.08, -0.01);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.016, 14), cap);
  brim.position.set(0, 0.03, 0.04);
  headB.add(hat, brim);

  const lUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.22, 4, 8), shirt);
  lUpper.position.set(0, -0.12, 0);
  lUpperB.add(lUpper);
  const rUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.22, 4, 8), shirt);
  rUpper.position.set(0, -0.12, 0);
  rUpperB.add(rUpper);
  const lSleeve = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.01, 6, 10), shirt);
  lSleeve.position.set(0, -0.24, 0);
  lSleeve.rotation.x = 1.2;
  lUpperB.add(lSleeve);
  const rSleeve = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.01, 6, 10), shirt);
  rSleeve.position.set(0, -0.24, 0);
  rSleeve.rotation.x = 1.2;
  rUpperB.add(rSleeve);
  const lFore = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.2, 4, 8), skin);
  lFore.position.set(0, -0.12, 0);
  lForeB.add(lFore);
  const rFore = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.2, 4, 8), skin);
  rFore.position.set(0, -0.12, 0);
  rForeB.add(rFore);

  const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.075, 0.1), glove);
  lHand.position.set(0, -0.24, 0.02);
  lForeB.add(lHand);
  const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.075, 0.1), skin);
  rHand.position.set(0, -0.24, 0.02);
  rForeB.add(rHand);
  const lThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.04, 3, 6), glove);
  lThumb.position.set(-0.03, -0.26, 0.04);
  lThumb.rotation.z = 0.6;
  lForeB.add(lThumb);
  const rThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.04, 3, 6), skin);
  rThumb.position.set(0.03, -0.26, 0.04);
  rThumb.rotation.z = -0.6;
  rForeB.add(rThumb);

  root.add(lFoot, lSole, rFoot, rSole, lSock, rSock, rShin, lCuff, rCuff);

  const club = new THREE.Group();
  club.name = "club";
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 1.05, 8), steel);
  shaft.name = "shaft";
  shaft.position.set(-0.01, 0.52, 0.58);
  shaft.rotation.x = 0.22;
  shaft.rotation.z = 0.18;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8), grip);
  handle.position.set(-0.02, 0.92, 0.52);
  handle.rotation.x = 0.22;
  handle.rotation.z = 0.18;
  const clubhead = new THREE.Group();
  clubhead.name = "clubhead";
  clubhead.position.set(0.02, 0.03, 0.68);
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
  root.add(club);

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
