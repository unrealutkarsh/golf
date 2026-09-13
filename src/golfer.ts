import * as THREE from "three";

export const GOLFER_MESH_COUNT = 39;

/** Right-handed address figure. Clubhead group sits at the ball after snap. */
export function buildAddressGolfer(): THREE.Group {
  const root = new THREE.Group();
  root.name = "golfer";

  const slacks = new THREE.MeshStandardMaterial({ color: 0x1a2c38, roughness: 0.76 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: 0.48 });
  const shirtShade = new THREE.MeshStandardMaterial({ color: 0xe4ddd2, roughness: 0.52 });
  const glove = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.55 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc49a74, roughness: 0.46 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: 0.4 });
  const sole = new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.7 });
  const cap = new THREE.MeshStandardMaterial({ color: 0x243c30, roughness: 0.48 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.7 });
  const belt = new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.55 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x1c1c1a, roughness: 0.72 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb4bac0, roughness: 0.2, metalness: 0.68 });
  const putterFace = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.55 });

  const body = new THREE.Group();
  body.name = "body";

  const lFoot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.055, 0.24), shoe);
  lFoot.position.set(-0.17, 0.055, 0.12);
  const lSole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.016, 0.24), sole);
  lSole.position.set(-0.17, 0.02, 0.12);
  const rFoot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.055, 0.24), shoe);
  rFoot.position.set(0.2, 0.055, -0.05);
  const rSole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.016, 0.24), sole);
  rSole.position.set(0.2, 0.02, -0.05);

  const lShin = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 3, 8), slacks);
  lShin.position.set(-0.16, 0.3, 0.1);
  lShin.rotation.x = 0.18;
  const rShin = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 3, 8), slacks);
  rShin.position.set(0.19, 0.3, -0.02);
  rShin.rotation.x = 0.08;

  const lThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.32, 3, 8), slacks);
  lThigh.position.set(-0.14, 0.64, 0.05);
  lThigh.rotation.x = 0.28;
  lThigh.rotation.z = 0.06;
  const rThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.32, 3, 8), slacks);
  rThigh.position.set(0.16, 0.64, -0.04);
  rThigh.rotation.x = 0.16;
  rThigh.rotation.z = -0.05;

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.22), slacks);
  hips.position.set(0.01, 0.86, -0.01);
  hips.rotation.x = 0.12;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.18), slacks);
  seat.position.set(0.01, 0.8, -0.08);
  const lCrease = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.28, 0.04), slacks);
  lCrease.position.set(-0.16, 0.58, 0.08);
  lCrease.rotation.x = 0.22;
  const rCrease = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.28, 0.04), slacks);
  rCrease.position.set(0.18, 0.58, -0.02);
  rCrease.rotation.x = 0.12;
  const beltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.045, 0.21), belt);
  beltMesh.position.set(0.01, 0.95, 0.0);

  const torsoGeo = new THREE.LatheGeometry(
    [new THREE.Vector2(0.17, 0), new THREE.Vector2(0.2, 0.14), new THREE.Vector2(0.23, 0.3), new THREE.Vector2(0.2, 0.42), new THREE.Vector2(0.13, 0.5)],
    14,
  );
  const torso = new THREE.Mesh(torsoGeo, shirt);
  torso.position.set(0.0, 0.96, 0.02);
  torso.scale.set(1.08, 1, 0.78);
  torso.rotation.x = 0.38;
  torso.rotation.z = 0.18;
  const poloBack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.03), shirtShade);
  poloBack.position.set(0.0, 1.38, 0.02);
  poloBack.rotation.x = 0.35;

  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.42, 3, 8), shirt);
  shoulders.position.set(-0.02, 1.4, 0.12);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.rotation.y = 0.1;
  shoulders.rotation.x = 0.18;

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), skin);
  neck.position.set(-0.01, 1.5, 0.2);
  neck.rotation.x = 0.35;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 12), skin);
  head.name = "head";
  head.position.set(-0.02, 1.62, 0.26);
  head.scale.set(0.92, 1.05, 0.95);
  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairMesh.position.set(-0.02, 1.66, 0.25);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), skin);
  nose.position.set(-0.02, 1.6, 0.36);
  const lEar = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), skin);
  lEar.position.set(-0.11, 1.62, 0.26);
  const rEar = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), skin);
  rEar.position.set(0.07, 1.62, 0.26);

  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), cap);
  hat.position.set(-0.02, 1.7, 0.25);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.018, 12), cap);
  brim.position.set(-0.02, 1.652, 0.3);

  const lUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.28, 3, 7), shirt);
  lUpper.position.set(-0.2, 1.22, 0.26);
  lUpper.rotation.x = 1.0;
  lUpper.rotation.z = 0.38;
  const rUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.27, 3, 7), shirt);
  rUpper.position.set(0.18, 1.2, 0.28);
  rUpper.rotation.x = 0.92;
  rUpper.rotation.z = -0.32;
  const lCuff = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.01, 6, 10), shirt);
  lCuff.position.set(-0.12, 1.04, 0.4);
  lCuff.rotation.x = 1.1;
  const rCuff = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.01, 6, 10), shirt);
  rCuff.position.set(0.1, 1.02, 0.42);
  rCuff.rotation.x = 1.05;

  const lFore = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.22, 3, 7), skin);
  lFore.position.set(-0.1, 1.0, 0.42);
  lFore.rotation.x = 0.72;
  lFore.rotation.z = 0.15;
  const rFore = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.22, 3, 7), skin);
  rFore.position.set(0.08, 0.98, 0.44);
  rFore.rotation.x = 0.7;
  rFore.rotation.z = -0.1;

  const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.11), glove);
  lHand.position.set(-0.04, 0.9, 0.5);
  lHand.rotation.x = 0.4;
  const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.11), skin);
  rHand.position.set(0.02, 0.88, 0.52);
  rHand.rotation.x = 0.4;
  const gloveCuff = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.03, 0.08), glove);
  gloveCuff.position.set(-0.04, 0.94, 0.46);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.016, 6, 10, Math.PI), shirt);
  collar.position.set(-0.01, 1.46, 0.2);
  collar.rotation.x = 1.15;

  body.add(
    lFoot,
    lSole,
    rFoot,
    rSole,
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
    poloBack,
    shoulders,
    neck,
    head,
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
    collar,
  );

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

export function countMeshes(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) n += 1;
  });
  return n;
}

export function golferHeight(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return box.max.y - box.min.y;
}
