import * as THREE from "three";

export const BALL_RADIUS = 0.11;
export const BALL_ROLL_RADIUS = 0.16;

const DIMPLE_COUNT = 336;
const DIMPLE_RADIUS = 0.09;
const DIMPLE_DEPTH_RATIO = 0.078;

/** World-space roll axis for a ground-travel velocity. Null when the ball is not moving. */
export function ballRollAxis(vx: number, vy: number): { x: number; y: number; z: number } | null {
  const speed = Math.hypot(vx, vy);
  if (speed <= 0.04) return null;
  return { x: vy / speed, y: 0, z: -vx / speed };
}

export function ballRollRadians(speed: number, dt: number, radius = BALL_ROLL_RADIUS): number {
  return (speed * dt) / radius;
}

function fibonacciSphere(count: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - ((i + 0.5) / count) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    pts.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r));
  }
  return pts;
}

/** Spherical-cap indent in [0, 1] for a unit-sphere sample against packed dimple centers. */
export function dimpleIndent(nx: number, ny: number, nz: number, centers: Array<Pick<THREE.Vector3, "x" | "y" | "z">>, dimpleR = DIMPLE_RADIUS): number {
  let dent = 0;
  const minDot = 1 - (dimpleR * dimpleR) * 0.5;
  for (const c of centers) {
    const dot = nx * c.x + ny * c.y + nz * c.z;
    if (dot < minDot) continue;
    const dist = Math.hypot(nx - c.x, ny - c.y, nz - c.z);
    if (dist >= dimpleR) continue;
    const t = dist / dimpleR;
    const bowl = 0.5 + 0.5 * Math.cos(Math.PI * t);
    dent = Math.max(dent, bowl * bowl);
  }
  return dent;
}

export function makeGolfBallGeometry(radius = BALL_RADIUS): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(radius, 144, 96);
  const pos = geo.attributes.position;
  const dimples = fibonacciSphere(DIMPLE_COUNT);
  const depth = radius * DIMPLE_DEPTH_RATIO;
  const colors = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const dent = dimpleIndent(n.x, n.y, n.z, dimples);
    const r = radius - dent * depth;
    pos.setXYZ(i, n.x * r, n.y * r, n.z * r);
    const shade = 1 - dent * 0.34;
    colors[i * 3] = 0.995 * shade;
    colors[i * 3 + 1] = 0.99 * shade;
    colors[i * 3 + 2] = 0.97 * shade;
  }
  pos.needsUpdate = true;
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export function makeSoftShadowCard(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const g = ctx.createRadialGradient(64, 64, 3, 64, 64, 62);
  g.addColorStop(0, "rgba(28, 34, 18, 0.38)");
  g.addColorStop(0.28, "rgba(28, 34, 18, 0.16)");
  g.addColorStop(0.62, "rgba(28, 34, 18, 0.05)");
  g.addColorStop(1, "rgba(28, 34, 18, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

export function makeDiscSprite(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.45, "rgba(255,240,190,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return c;
}

export function createGolfBallMesh(): THREE.Mesh {
  const ball = new THREE.Mesh(
    makeGolfBallGeometry(BALL_RADIUS),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.12,
      metalness: 0.04,
      clearcoat: 0.82,
      clearcoatRoughness: 0.08,
        sheen: 0.22,
        sheenRoughness: 0.32,
        sheenColor: new THREE.Color(0xffffff),
        emissive: new THREE.Color(0xf2efe6),
        emissiveIntensity: 0.12,
        envMapIntensity: 1.55,
        vertexColors: true,
    }),
  );
  const ballMat = ball.material as THREE.MeshPhysicalMaterial;
  ballMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
         roughnessFactor = clamp(mix(0.07, 0.46, 1.0 - diffuseColor.r), 0.05, 0.7);`,
    );
  };
  ballMat.customProgramCacheKey = () => "ptg-ball-dimple-v1";
  ball.castShadow = true;
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS * 1.55, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }),
  );
  ball.add(halo);
  const marker = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(makeDiscSprite()),
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  marker.name = "air-marker";
  marker.scale.set(0.32, 0.32, 1);
  ball.add(marker);
  const outline = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(makeDiscSprite()),
      color: 0x142028,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  outline.name = "air-outline";
  outline.scale.set(0.48, 0.48, 1);
  ball.add(outline);
  return ball;
}

export function createBallContactShadows(): { shadow: THREE.Mesh; softShadow: THREE.Mesh } {
  const softMap = new THREE.CanvasTexture(makeSoftShadowCard());
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: softMap,
      color: 0x2c341c,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  const softShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: softMap,
      color: 0x3a4424,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  softShadow.rotation.x = -Math.PI / 2;
  return { shadow, softShadow };
}

/** Additive glow sprite for the ball in flight. */
export function createBallGlow(): THREE.Sprite {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.18, "rgba(255,250,230,0.9)");
    g.addColorStop(0.45, "rgba(255,230,170,0.28)");
    g.addColorStop(1, "rgba(255,220,150,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, color: 0xfff4d6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  sprite.visible = false;
  return sprite;
}

/** Flag icon billboard for the hole: white stick, red pennant, dark outline so it reads on sky or trees. */
export function createPinMarker(): THREE.Sprite {
  const w = 62;
  const h = 100;
  const canvas = document.createElement("canvas");
  canvas.width = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.scale(2, 2);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const pennant = () => {
      ctx.beginPath();
      ctx.moveTo(14, 10);
      ctx.lineTo(56, 24);
      ctx.lineTo(14, 38);
      ctx.closePath();
    };
    ctx.strokeStyle = "rgba(10, 20, 12, 0.75)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(14, 8);
    ctx.lineTo(14, 96);
    ctx.stroke();
    pennant();
    ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(14, 8);
    ctx.lineTo(14, 96);
    ctx.stroke();
    pennant();
    ctx.fillStyle = "#ff3b2f";
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    // Drawn over the scenery on purpose: it is a broadcast-style graphic, not a physical object.
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }),
  );
  sprite.renderOrder = 10;
  sprite.visible = false;
  return sprite;
}
