import * as THREE from "three";
import { lieAt, nearOb } from "./course";
import type { GameSession } from "./game";
import { fbm } from "./look";
import { dist, fromAngle, type Vec2 } from "./math";
import type { FlightSample } from "./physics";
import {
  bladeHeight,
  groundHeight,
  isPuttingSituation,
  resolveCamView,
  surfaceColor,
  type ResolvedCam,
} from "./terrain";
import type { Hole } from "./types";

const MAX_PATH = 160;
const BLADE_COUNT = 5200;

const TURF_VERT = /* glsl */ `
  attribute vec3 color;
  varying vec3 vColor;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vColor = color;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const TURF_FRAG = /* glsl */ `
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform vec3 ambient;
  varying vec3 vColor;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec3 n = normalize(vNormal);
    float stripe = 0.9 + 0.18 * sin(vWorld.x * 2.35 + vWorld.z * 0.18);
    float blades = 0.88 + 0.14 * fract(sin(dot(vWorld.xz, vec2(12.9898, 78.233))) * 43758.5453);
    float ndl = max(dot(n, sunDir), 0.0);
    float wrap = ndl * 0.68 + 0.32;
    vec3 halfV = normalize(sunDir + vec3(0.12, 1.0, 0.08));
    float spec = pow(max(dot(n, halfV), 0.0), 40.0) * 0.28;
    vec3 col = vColor * stripe * blades;
    vec3 lit = col * (ambient + sunColor * wrap) + sunColor * spec * col;
    gl_FragColor = vec4(lit, 1.0);
  }
`;

const BLADE_VERT = /* glsl */ `
  attribute vec3 instanceColor;
  uniform float time;
  varying vec3 vColor;
  void main() {
    vColor = instanceColor;
    vec3 p = position;
    float sway = sin(time * 1.4 + instanceMatrix[3][0] * 0.35 + instanceMatrix[3][2] * 0.28) * 0.12;
    p.x += sway * p.y;
    vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BLADE_FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

export class CourseScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  private holeGroup = new THREE.Group();
  private ball: THREE.Mesh;
  private shadow: THREE.Mesh;
  private pin = new THREE.Group();
  private golfer = new THREE.Group();
  private grid = new THREE.Group();
  private landing: THREE.Mesh;
  private airLine: THREE.Line;
  private groundLine: THREE.Line;
  private airPos: Float32Array;
  private groundPos: Float32Array;
  private blades: THREE.InstancedMesh | null = null;
  private bladeMat: THREE.ShaderMaterial;
  private turfMat: THREE.ShaderMaterial;
  private raycaster = new THREE.Raycaster();
  private terrain: THREE.Mesh | null = null;
  private camPos = new THREE.Vector3(40, 18, 40);
  private camLook = new THREE.Vector3(80, 0, 40);
  private grassAt: Vec2 = { x: 0, y: 0 };
  private builtHole = -1;
  private sun: THREE.DirectionalLight;
  private time = 0;
  private w = 1;
  private h = 1;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x79a9cc);
    this.scene.fog = new THREE.Fog(0x9bb6c6, 90, 560);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.12, 900);
    this.scene.add(this.holeGroup);

    const hemi = new THREE.HemisphereLight(0xb7d4ea, 0x3d5330, 0.78);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d4, 1.42);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 4;
    this.sun.shadow.camera.far = 420;
    this.sun.shadow.camera.left = -160;
    this.sun.shadow.camera.right = 160;
    this.sun.shadow.camera.top = 120;
    this.sun.shadow.camera.bottom = -120;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.turfMat = new THREE.ShaderMaterial({
      vertexShader: TURF_VERT,
      fragmentShader: TURF_FRAG,
      uniforms: {
        sunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
        sunColor: { value: new THREE.Color(0xfff3d8) },
        ambient: { value: new THREE.Color(0x3d4d3a) },
      },
    });
    this.bladeMat = new THREE.ShaderMaterial({
      vertexShader: BLADE_VERT,
      fragmentShader: BLADE_FRAG,
      uniforms: { time: { value: 0 } },
    });

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 24, 18),
      new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.28, metalness: 0.04 }),
    );
    this.ball.castShadow = true;
    this.scene.add(this.ball);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);

    this.landing = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xf0d78a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    this.landing.rotation.x = -Math.PI / 2;
    this.scene.add(this.landing);

    this.airPos = new Float32Array(MAX_PATH * 3);
    this.groundPos = new Float32Array(MAX_PATH * 3);
    this.airLine = makeLine(this.airPos, 0xffe27a);
    this.groundLine = makeLine(this.groundPos, 0x111111);
    this.scene.add(this.airLine, this.groundLine);

    this.scene.add(this.pin, this.golfer, this.grid);
    this.buildGolfer();
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.camera.aspect = this.w / Math.max(this.h, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.w, this.h, false);
    this.renderer.domElement.style.width = `${this.w}px`;
    this.renderer.domElement.style.height = `${this.h}px`;
  }

  worldFromScreen(sx: number, sy: number): Vec2 {
    const ndc = new THREE.Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.terrain) {
      const hits = this.raycaster.intersectObject(this.terrain);
      if (hits[0]) return { x: hits[0].point.x, y: hits[0].point.z };
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, hit);
    return { x: hit.x, y: hit.z };
  }

  sync(session: GameSession, dt: number): void {
    this.time += dt;
    this.bladeMat.uniforms.time.value = this.time;
    const hole = session.hole();
    if (this.builtHole !== session.holeIndex) this.rebuildHole(hole, session.holeIndex);

    const putting = isPuttingSituation(session.lie, session.toPin(), session.club().id, hole, session.ball.pos);
    const view = resolveCamView(session.camMode, session.swingPhase, putting);
    this.placeBall(session);
    this.placePin(hole);
    this.placeGolfer(session);
    this.updatePath(session);
    this.updateGrid(session, putting);
    this.updateGrass(session, hole, view);
    this.updateCamera(session, hole, view, putting, dt);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private rebuildHole(hole: Hole, index: number): void {
    this.builtHole = index;
    this.holeGroup.clear();
    this.terrain = null;
    this.blades = null;

    const b = hole.bounds;
    const pad = 70;
    const tw = b.w + pad * 2;
    const th = b.h + pad * 2;
    const cols = Math.max(48, Math.round(tw / 2.05));
    const rows = Math.max(36, Math.round(th / 2.05));
    const geo = new THREE.PlaneGeometry(tw, th, cols, rows);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const ox = b.x + b.w / 2;
    const oz = b.y + b.h / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + ox;
      const z = pos.getZ(i) + oz;
      pos.setXYZ(i, x, groundHeight(hole, x, z), z);
      const c = surfaceColor(hole, x, z);
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, this.turfMat);
    terrain.receiveShadow = true;
    this.terrain = terrain;
    this.holeGroup.add(terrain);

    this.addWater(hole);
    this.addBunkerLips(hole);
    this.addTrees(hole);
    this.addHills(hole);
    this.buildPin();
    this.buildGrid(hole);

    const cx = b.x + b.w * 0.55;
    const cz = b.y + b.h * 0.45;
    this.sun.position.set(cx + 90, 70, cz - 110);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.target.updateMatrixWorld();
  }

  private addWater(hole: Hole): void {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1b6a88,
      roughness: 0.18,
      metalness: 0.22,
      transparent: true,
      opacity: 0.92,
    });
    for (const poly of hole.water) {
      if (poly.length < 3) continue;
      const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = -0.62;
      this.holeGroup.add(mesh);
    }
  }

  private addBunkerLips(hole: Hole): void {
    const sand = new THREE.MeshStandardMaterial({ color: 0xe6cf96, roughness: 0.92 });
    for (const bunker of hole.bunkers) {
      const geo = new THREE.CircleGeometry(1, 28);
      const mesh = new THREE.Mesh(geo, sand);
      mesh.scale.set(bunker.rx, bunker.ry, 1);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = bunker.rotation;
      mesh.position.set(bunker.cx, groundHeight(hole, bunker.cx, bunker.cy) + 0.02, bunker.cy);
      mesh.receiveShadow = true;
      this.holeGroup.add(mesh);
    }
  }

  private addTrees(hole: Hole): void {
    const bark = new THREE.MeshStandardMaterial({ color: 0x4a3424, roughness: 0.9 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x2f6a38, roughness: 0.72 });
    for (const tree of hole.trees) {
      const group = new THREE.Group();
      const h = 7.2 + (tree.r - 7) * 0.45;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, h * 0.45, 6), bark);
      trunk.position.y = h * 0.22;
      trunk.castShadow = true;
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(tree.r * 0.72, 10, 8), leaf);
      canopy.position.y = h * 0.62;
      canopy.scale.y = 0.78;
      canopy.castShadow = true;
      group.add(trunk, canopy);
      group.position.set(tree.x, groundHeight(hole, tree.x, tree.y), tree.y);
      this.holeGroup.add(group);
    }
  }

  private addHills(hole: Hole): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a8a4e, roughness: 0.95 });
    const b = hole.bounds;
    const spots = [
      [b.x - 40, b.y - 30, 48],
      [b.x + b.w + 36, b.y + 20, 56],
      [b.x + 80, b.y - 50, 40],
      [b.x + b.w * 0.6, b.y + b.h + 46, 62],
    ];
    for (const [x, z, r] of spots) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
      hill.scale.y = 0.22;
      hill.position.set(x, -r * 0.12, z);
      this.holeGroup.add(hill);
    }
  }

  private buildPin(): void {
    this.pin.clear();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.04, 2.55, 8),
      new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.35 }),
    );
    pole.position.y = 1.28;
    pole.castShadow = true;
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 0.62),
      new THREE.MeshStandardMaterial({ color: 0xc62828, side: THREE.DoubleSide, roughness: 0.55 }),
    );
    flag.position.set(0.58, 2.22, 0);
    const cup = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 20),
      new THREE.MeshBasicMaterial({ color: 0x0b0b0b }),
    );
    cup.rotation.x = -Math.PI / 2;
    cup.position.y = 0.02;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.5, 20),
      new THREE.MeshBasicMaterial({ color: 0xe8e4d8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.pin.add(pole, flag, cup, ring);
  }

  private buildGrid(hole: Hole): void {
    this.grid.clear();
    const g = hole.green;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 256, 256);
      ctx.strokeStyle = "rgba(210, 240, 220, 0.55)";
      ctx.lineWidth = 2;
      for (let i = 1; i < 8; i++) {
        const t = (i / 8) * 256;
        ctx.beginPath();
        ctx.moveTo(t, 0);
        ctx.lineTo(t, 256);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, t);
        ctx.lineTo(256, t);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255, 230, 140, 0.7)";
      ctx.beginPath();
      ctx.moveTo(128, 128);
      ctx.lineTo(128 + hole.greenBreak.x * 70, 128 + hole.greenBreak.y * 70);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(g.rx * 2.05, g.ry * 2.05),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = g.rotation;
    mesh.position.set(g.cx, groundHeight(hole, g.cx, g.cy) + 0.07, g.cy);
    this.grid.add(mesh);
  }

  private buildGolfer(): void {
    this.golfer.clear();
    const cloth = new THREE.MeshStandardMaterial({ color: 0x1c2a22, roughness: 0.7 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9b08a, roughness: 0.55 });
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.95, 8), cloth);
    legs.position.y = 0.5;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 }));
    torso.position.y = 1.25;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skin);
    head.position.y = 1.74;
    const club = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.03, 1.15, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.35, metalness: 0.4 }),
    );
    club.position.set(0.28, 0.85, 0.12);
    club.rotation.z = 0.35;
    this.golfer.add(legs, torso, head, club);
  }

  private placeBall(session: GameSession): void {
    const p = session.ball.pos;
    const h = Math.max(groundHeight(session.hole(), p.x, p.y), 0) + session.ball.z;
    this.ball.position.set(p.x, h + 0.2, p.y);
    this.shadow.position.set(p.x, groundHeight(session.hole(), p.x, p.y) + 0.03, p.y);
    const air = Math.max(0.12, 0.28 - session.ball.z * 0.012);
    this.shadow.scale.setScalar(air);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = session.ball.z > 8 ? 0.14 : 0.32;
  }

  private placePin(hole: Hole): void {
    const h = groundHeight(hole, hole.pin.x, hole.pin.y);
    this.pin.position.set(hole.pin.x, h, hole.pin.y);
  }

  private placeGolfer(session: GameSession): void {
    const flying = session.swingPhase === "flight" || session.swingPhase === "settle";
    this.golfer.visible = session.screen === "play" && !flying;
    const p = session.ball.pos;
    const back = fromAngle(session.aim + Math.PI, 1.35);
    this.golfer.position.set(p.x + back.x, groundHeight(session.hole(), p.x, p.y), p.y + back.y);
    this.golfer.rotation.y = -session.aim + Math.PI / 2;
  }

  private updatePath(session: GameSession): void {
    const aiming = session.swingPhase === "aim" || session.swingPhase === "power" || session.swingPhase === "accuracy";
    const flying = session.swingPhase === "flight" || session.swingPhase === "settle";
    let path: FlightSample[] = [];
    if (aiming && session.screen === "play") path = session.previewFlight();
    else if (flying) path = session.shotArc;
    const show = session.screen === "play" && path.length > 1;
    this.airLine.visible = show;
    this.groundLine.visible = show;
    this.landing.visible = show && aiming;
    if (!show) return;
    const n = Math.min(path.length, MAX_PATH);
    const hole = session.hole();
    for (let i = 0; i < n; i++) {
      const s = path[Math.round((i / Math.max(n - 1, 1)) * (path.length - 1))];
      const gh = groundHeight(hole, s.pos.x, s.pos.y);
      this.airPos[i * 3] = s.pos.x;
      this.airPos[i * 3 + 1] = gh + Math.max(s.z, 0.08) + 0.2;
      this.airPos[i * 3 + 2] = s.pos.y;
      this.groundPos[i * 3] = s.pos.x;
      this.groundPos[i * 3 + 1] = gh + 0.05;
      this.groundPos[i * 3 + 2] = s.pos.y;
    }
    setLine(this.airLine, n);
    setLine(this.groundLine, n);
    const last = path[path.length - 1];
    const warn = nearOb(hole, last.pos) || lieAt(hole, last.pos) === "ob";
    this.landing.position.set(last.pos.x, groundHeight(hole, last.pos.x, last.pos.y) + 0.06, last.pos.y);
    (this.landing.material as THREE.MeshBasicMaterial).color.set(warn ? 0xc62828 : 0xf0d78a);
  }

  private updateGrid(session: GameSession, putting: boolean): void {
    this.grid.visible = session.screen === "play" && session.puttGrid && putting;
  }

  private updateGrass(session: GameSession, hole: Hole, view: ResolvedCam): void {
    const focus = view === "follow" ? session.ball.pos : session.ball.pos;
    if (this.blades && dist(focus, this.grassAt) < 2.4) return;
    this.grassAt = { ...focus };
    if (this.blades) this.scene.remove(this.blades);
    const geo = new THREE.PlaneGeometry(0.045, 1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, this.bladeMat, BLADE_COUNT);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const radius = view === "putt" ? 11 : view === "player" ? 16 : 10;
    let written = 0;
    for (let i = 0; i < BLADE_COUNT * 2 && written < BLADE_COUNT; i++) {
      const a = fbm(focus.x * 0.3 + i * 1.7, focus.y * 0.3 + i) * Math.PI * 2;
      const r = Math.sqrt(fbm(i * 0.37, focus.x + i * 0.11)) * radius;
      const x = focus.x + Math.cos(a) * r;
      const z = focus.y + Math.sin(a) * r;
      const lie = lieAt(hole, { x, y: z });
      const h = bladeHeight(lie);
      if (h <= 0) continue;
      const gh = groundHeight(hole, x, z);
      dummy.position.set(x, gh, z);
      dummy.rotation.set(0, a, (fbm(x, z) - 0.5) * 0.25);
      dummy.scale.set(0.7 + fbm(z, x) * 0.6, h * (0.85 + fbm(x * 2, z * 2) * 0.4), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(written, dummy.matrix);
      const c = surfaceColor(hole, x, z);
      color.setRGB(c[0] * 0.85, c[1] * 1.05, c[2] * 0.8);
      mesh.setColorAt(written, color);
      written += 1;
    }
    mesh.count = written;
    mesh.frustumCulled = false;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.blades = mesh;
    this.scene.add(mesh);
  }

  private updateCamera(session: GameSession, hole: Hole, view: ResolvedCam, putting: boolean, dt: number): void {
    const ball = session.ball.pos;
    const pin = hole.pin;
    const aim = putting ? Math.atan2(pin.y - ball.y, pin.x - ball.x) : session.aim;
    const bh = groundHeight(hole, ball.x, ball.y) + session.ball.z;
    let desired = new THREE.Vector3();
    let look = new THREE.Vector3();
    let fov = 52;
    if (session.screen !== "play") {
      const t = this.time * 0.12;
      desired.set(hole.green.cx + Math.cos(t) * 38, 16, hole.green.cy + Math.sin(t) * 38);
      look.set(hole.green.cx, 0.4, hole.green.cy);
      fov = 48;
    } else if (view === "putt") {
      const back = fromAngle(aim + Math.PI, 3.1);
      desired.set(ball.x + back.x, bh + 1.12, ball.y + back.y);
      look.set(pin.x, groundHeight(hole, pin.x, pin.y) + 0.35, pin.y);
      fov = 48;
    } else if (view === "follow") {
      const v = session.ball.vel;
      const heading = Math.hypot(v.x, v.y) > 0.4 ? Math.atan2(v.y, v.x) : session.aim;
      const back = fromAngle(heading + Math.PI, 18);
      desired.set(ball.x + back.x, bh + 7.5 + session.ball.z * 0.22, ball.y + back.y);
      look.set(ball.x, bh + 1.2, ball.y);
      fov = 50;
    } else {
      const back = fromAngle(aim + Math.PI, putting ? 6 : 16);
      desired.set(ball.x + back.x, bh + (putting ? 2.4 : 5.4), ball.y + back.y);
      look.set(pin.x * 0.55 + ball.x * 0.45, 1.2, pin.y * 0.55 + ball.y * 0.45);
      fov = 54;
    }
    const follow = view === "follow" ? 0.00025 : view === "putt" ? 0.0008 : 0.00045;
    const k = 1 - Math.pow(follow, Math.max(dt, 0.001));
    this.camPos.lerp(desired, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.fov += (fov - this.camera.fov) * k;
    this.camera.updateProjectionMatrix();
  }
}

function makeLine(data: Float32Array, color: number): THREE.Line {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(data, 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: color === 0x111111 ? 0.28 : 0.95 });
  return new THREE.Line(geo, mat);
}

function setLine(line: THREE.Line, count: number): void {
  const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
  attr.needsUpdate = true;
  line.geometry.setDrawRange(0, count);
}

export function createCourseScene(canvas: HTMLCanvasElement): CourseScene | null {
  try {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    return new CourseScene(renderer);
  } catch {
    return null;
  }
}
