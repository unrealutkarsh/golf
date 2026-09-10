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

const MAX_PATH = 140;
const BLADE_COUNT = 7800;

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
  uniform vec3 cameraPos;
  uniform sampler2D grassMap;
  varying vec3 vColor;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(cameraPos - vWorld);
    float stripe = 0.94 + 0.08 * sin(vWorld.x * 1.05 + vWorld.z * 0.06);
    float mottling = 0.9 + 0.12 * texture2D(grassMap, vWorld.xz * 0.42).r;
    float blades = 0.88 + 0.16 * texture2D(grassMap, vWorld.xz * 1.15).g;
    float ndl = max(dot(n, sunDir), 0.0);
    float wrap = ndl * 0.55 + 0.45;
    vec3 halfV = normalize(sunDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), 36.0) * 0.22 * (0.35 + ndl);
    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0) * 0.12;
    vec3 col = vColor * stripe * mottling * blades;
    vec3 lit = col * (ambient + sunColor * wrap) + sunColor * spec + vec3(0.55, 0.7, 0.45) * rim;
    gl_FragColor = vec4(lit, 1.0);
  }
`;

const BLADE_VERT = /* glsl */ `
  uniform float time;
  varying vec3 vColor;
  void main() {
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = vec3(0.28, 0.5, 0.22);
    #endif
    vec3 p = position;
    float sway = sin(time * 1.6 + instanceMatrix[3][0] * 0.4 + instanceMatrix[3][2] * 0.3) * 0.16;
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

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 zenith = vec3(0.28, 0.52, 0.78);
    vec3 mid = vec3(0.62, 0.78, 0.92);
    vec3 horizon = vec3(0.86, 0.88, 0.82);
    vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.18, h));
    col = mix(col, zenith, smoothstep(0.12, 0.72, h));
    float sun = pow(max(dot(normalize(vDir), normalize(vec3(0.42, 0.62, 0.38))), 0.0), 180.0);
    col += vec3(1.0, 0.92, 0.7) * sun * 0.85;
    float cloud = sin(vDir.x * 8.0 + vDir.z * 6.0) * sin(vDir.x * 3.5 - vDir.z * 4.2);
    cloud = smoothstep(0.35, 0.8, cloud) * smoothstep(0.08, 0.45, h) * 0.16;
    col = mix(col, vec3(0.95, 0.96, 0.94), cloud);
    gl_FragColor = vec4(col, 1.0);
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
  private flightMesh: THREE.Mesh | null = null;
  private flightMat: THREE.MeshBasicMaterial;
  private groundLine: THREE.Line;
  private groundPos: Float32Array;
  private blades: THREE.InstancedMesh | null = null;
  private bladeMat: THREE.ShaderMaterial;
  private turfMat: THREE.ShaderMaterial;
  private raycaster = new THREE.Raycaster();
  private terrain: THREE.Mesh | null = null;
  private camPos = new THREE.Vector3(80, 24, 80);
  private camLook = new THREE.Vector3(200, 1, 140);
  private grassAt: Vec2 = { x: 9999, y: 9999 };
  private builtHole = -1;
  private pathKey = "";
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
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xc2d2dc, 180, 720);
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.08, 1200);
    this.scene.add(this.holeGroup);
    this.scene.add(makeSky());

    const hemi = new THREE.HemisphereLight(0xc5ddf0, 0x6a7a48, 1.05);
    this.scene.add(hemi);
    const fill = new THREE.DirectionalLight(0xa8c4e0, 0.35);
    fill.position.set(-80, 40, 60);
    this.scene.add(fill);
    this.sun = new THREE.DirectionalLight(0xfff1d0, 1.55);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 4;
    this.sun.shadow.camera.far = 420;
    this.sun.shadow.camera.left = -170;
    this.sun.shadow.camera.right = 170;
    this.sun.shadow.camera.top = 130;
    this.sun.shadow.camera.bottom = -130;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const grassMap = new THREE.CanvasTexture(makeGrassMap());
    grassMap.wrapS = THREE.RepeatWrapping;
    grassMap.wrapT = THREE.RepeatWrapping;
    this.turfMat = new THREE.ShaderMaterial({
      vertexShader: TURF_VERT,
      fragmentShader: TURF_FRAG,
      uniforms: {
        sunDir: { value: new THREE.Vector3(0.42, 0.78, 0.46).normalize() },
        sunColor: { value: new THREE.Color(0xfff3d4) },
        ambient: { value: new THREE.Color(0x4a5840) },
        cameraPos: { value: this.camPos },
        grassMap: { value: grassMap },
      },
    });
    this.bladeMat = new THREE.ShaderMaterial({
      vertexShader: BLADE_VERT,
      fragmentShader: BLADE_FRAG,
      uniforms: { time: { value: 0 } },
      side: THREE.DoubleSide,
    });

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 28, 20),
      new THREE.MeshStandardMaterial({ color: 0xf7f4ec, roughness: 0.22, metalness: 0.08 }),
    );
    this.ball.castShadow = true;
    this.scene.add(this.ball);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.26, 22),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);

    this.landing = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.05, 28),
      new THREE.MeshBasicMaterial({ color: 0xf0d78a, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    );
    this.landing.rotation.x = -Math.PI / 2;
    this.scene.add(this.landing);

    this.flightMat = new THREE.MeshBasicMaterial({ color: 0xf3d27a, transparent: true, opacity: 0.92 });
    this.groundPos = new Float32Array(MAX_PATH * 3);
    this.groundLine = makeLine(this.groundPos, 0x111111);
    this.scene.add(this.groundLine);

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
    this.placeGolfer(session, view);
    this.updatePath(session);
    this.updateGrid(session, putting);
    this.updateGrass(session, hole, view);
    this.updateCamera(session, hole, view, putting, dt);
    this.turfMat.uniforms.cameraPos.value.copy(this.camera.position);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private rebuildHole(hole: Hole, index: number): void {
    this.builtHole = index;
    this.holeGroup.clear();
    this.terrain = null;
    if (this.blades) {
      this.scene.remove(this.blades);
      this.blades = null;
    }
    this.grassAt = { x: 9999, y: 9999 };

    const b = hole.bounds;
    const pad = 90;
    const tw = b.w + pad * 2;
    const th = b.h + pad * 2;
    const cols = Math.max(70, Math.round(tw / 1.45));
    const rows = Math.max(48, Math.round(th / 1.45));
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
    this.sun.position.set(cx + 110, 78, cz - 130);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.target.updateMatrixWorld();
  }

  private addWater(hole: Hole): void {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x247a96,
      roughness: 0.12,
      metalness: 0.28,
      transparent: true,
      opacity: 0.9,
    });
    for (const poly of hole.water) {
      if (poly.length < 3) continue;
      const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = -0.55;
      this.holeGroup.add(mesh);
    }
  }

  private addBunkerLips(hole: Hole): void {
    const sand = new THREE.MeshStandardMaterial({ color: 0xedcfa0, roughness: 0.94 });
    for (const bunker of hole.bunkers) {
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 32), sand);
      mesh.scale.set(bunker.rx, bunker.ry, 1);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = bunker.rotation;
      mesh.position.set(bunker.cx, groundHeight(hole, bunker.cx, bunker.cy) + 0.03, bunker.cy);
      mesh.receiveShadow = true;
      this.holeGroup.add(mesh);
    }
  }

  private addTrees(hole: Hole): void {
    for (const tree of hole.trees) {
      this.holeGroup.add(makeTree(tree.x, tree.y, tree.r, groundHeight(hole, tree.x, tree.y)));
    }
  }

  private addHills(hole: Hole): void {
    const mats = [
      new THREE.MeshStandardMaterial({ color: 0x7d8b52, roughness: 0.96 }),
      new THREE.MeshStandardMaterial({ color: 0x8a7a4e, roughness: 0.96 }),
    ];
    const b = hole.bounds;
    const spots = [
      [b.x - 48, b.y - 36, 56],
      [b.x + b.w + 44, b.y + 16, 64],
      [b.x + 90, b.y - 62, 46],
      [b.x + b.w * 0.55, b.y + b.h + 54, 70],
      [b.x - 20, b.y + b.h + 30, 40],
    ];
    spots.forEach(([x, z, r], i) => {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mats[i % 2]);
      hill.scale.y = 0.2;
      hill.position.set(x, -r * 0.1, z);
      this.holeGroup.add(hill);
    });
  }

  private buildPin(): void {
    this.pin.clear();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 1.85, 8),
      new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.32 }),
    );
    pole.position.y = 0.95;
    pole.castShadow = true;
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xd32f2f, side: THREE.DoubleSide, roughness: 0.5 }),
    );
    flag.position.set(0.32, 1.68, 0);
    const cup = new THREE.Mesh(new THREE.CircleGeometry(0.28, 22), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
    cup.rotation.x = -Math.PI / 2;
    cup.position.y = 0.02;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.38, 22),
      new THREE.MeshBasicMaterial({ color: 0xddd6c4, side: THREE.DoubleSide }),
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
      ctx.strokeStyle = "rgba(18, 46, 28, 0.28)";
      ctx.lineWidth = 1.4;
      for (let i = 1; i < 10; i++) {
        const t = (i / 10) * 256;
        ctx.beginPath();
        ctx.moveTo(t, 8);
        ctx.lineTo(t, 248);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(8, t);
        ctx.lineTo(248, t);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(240, 210, 110, 0.55)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(128, 128);
      ctx.lineTo(128 + hole.greenBreak.x * 56, 128 + hole.greenBreak.y * 56);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(g.rx * 2.02, g.ry * 2.02),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = g.rotation;
    mesh.position.set(g.cx, groundHeight(hole, g.cx, g.cy) + 0.06, g.cy);
    this.grid.add(mesh);
  }

  private buildGolfer(): void {
    this.golfer.clear();
    const slacks = new THREE.MeshStandardMaterial({ color: 0x243028, roughness: 0.72 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xece7dc, roughness: 0.58 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc4a882, roughness: 0.52 });
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.82, 8), slacks);
    legs.position.y = 0.42;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.58, 8), shirt);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skin);
    head.position.y = 1.48;
    const club = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 1.02, 6),
      new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.3, metalness: 0.45 }),
    );
    club.position.set(0.22, 0.72, 0.1);
    club.rotation.z = 0.32;
    this.golfer.add(legs, torso, head, club);
  }

  private placeBall(session: GameSession): void {
    const p = session.ball.pos;
    const gh = groundHeight(session.hole(), p.x, p.y);
    this.ball.position.set(p.x, gh + Math.max(session.ball.z, 0) + 0.16, p.y);
    this.shadow.position.set(p.x, gh + 0.025, p.y);
    const air = Math.max(0.1, 0.26 - session.ball.z * 0.01);
    this.shadow.scale.setScalar(air);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = session.ball.z > 8 ? 0.12 : 0.36;
  }

  private placePin(hole: Hole): void {
    this.pin.position.set(hole.pin.x, groundHeight(hole, hole.pin.x, hole.pin.y), hole.pin.y);
  }

  private placeGolfer(session: GameSession, view: ResolvedCam): void {
    const flying = session.swingPhase === "flight" || session.swingPhase === "settle";
    this.golfer.visible = session.screen === "play" && !flying && view !== "putt";
    const p = session.ball.pos;
    const back = fromAngle(session.aim + Math.PI, 1.2);
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
    this.groundLine.visible = show;
    this.landing.visible = show && aiming;
    if (this.flightMesh) this.flightMesh.visible = show;
    if (!show) return;
    const hole = session.hole();
    const n = Math.min(path.length, MAX_PATH);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const s = path[Math.round((i / Math.max(n - 1, 1)) * (path.length - 1))];
      const gh = groundHeight(hole, s.pos.x, s.pos.y);
      pts.push(new THREE.Vector3(s.pos.x, gh + Math.max(s.z, 0.05) + 0.16, s.pos.y));
      this.groundPos[i * 3] = s.pos.x;
      this.groundPos[i * 3 + 1] = gh + 0.04;
      this.groundPos[i * 3 + 2] = s.pos.y;
    }
    setLine(this.groundLine, n);
    const last = path[path.length - 1];
    const key = `${n}:${last.pos.x.toFixed(1)}:${last.pos.y.toFixed(1)}:${last.z.toFixed(1)}`;
    if (key !== this.pathKey) {
      this.pathKey = key;
      this.setFlightTube(pts);
    }
    const warn = nearOb(hole, last.pos) || lieAt(hole, last.pos) === "ob";
    this.landing.position.set(last.pos.x, groundHeight(hole, last.pos.x, last.pos.y) + 0.05, last.pos.y);
    (this.landing.material as THREE.MeshBasicMaterial).color.set(warn ? 0xc62828 : 0xf0d78a);
  }

  private setFlightTube(pts: THREE.Vector3[]): void {
    if (this.flightMesh) {
      this.flightMesh.geometry.dispose();
      this.scene.remove(this.flightMesh);
      this.flightMesh = null;
    }
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, Math.min(90, pts.length * 2), 0.13, 7, false);
    this.flightMesh = new THREE.Mesh(geo, this.flightMat);
    this.scene.add(this.flightMesh);
  }

  private updateGrid(session: GameSession, putting: boolean): void {
    this.grid.visible = session.screen === "play" && session.puttGrid && putting;
  }

  private updateGrass(session: GameSession, hole: Hole, view: ResolvedCam): void {
    const focus = session.ball.pos;
    const radius = view === "putt" ? 9 : view === "player" ? 14 : 9;
    if (this.blades && dist(focus, this.grassAt) < 2.2) return;
    this.grassAt = { ...focus };
    if (this.blades) this.scene.remove(this.blades);
    const geo = new THREE.PlaneGeometry(0.038, 1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, this.bladeMat, BLADE_COUNT);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let written = 0;
    for (let i = 0; i < BLADE_COUNT * 3 && written < BLADE_COUNT; i++) {
      const a = fbm(focus.x * 0.3 + i * 1.7, focus.y * 0.3 + i) * Math.PI * 2;
      const r = Math.sqrt(fbm(i * 0.37, focus.x + i * 0.11)) * radius;
      const x = focus.x + Math.cos(a) * r;
      const z = focus.y + Math.sin(a) * r;
      const lie = lieAt(hole, { x, y: z });
      const h = bladeHeight(lie);
      if (h <= 0) continue;
      dummy.position.set(x, groundHeight(hole, x, z), z);
      dummy.rotation.set(0, a, (fbm(x, z) - 0.5) * 0.28);
      dummy.scale.set(0.75 + fbm(z, x) * 0.7, h * (0.9 + fbm(x * 2, z * 2) * 0.5), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(written, dummy.matrix);
      const c = surfaceColor(hole, x, z);
      color.setRGB(Math.min(1, c[0] * 0.9 + 0.04), Math.min(1, c[1] * 1.12), c[2] * 0.85);
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
    const desired = new THREE.Vector3();
    const look = new THREE.Vector3();
    let fov = 54;
    if (session.screen !== "play") {
      const t = this.time * 0.1;
      desired.set((hole.tee.x + pin.x) * 0.5 + Math.cos(t) * 70, 28, (hole.tee.y + pin.y) * 0.5 + Math.sin(t) * 48);
      look.set((hole.tee.x + pin.x) * 0.55, 1.2, (hole.tee.y + pin.y) * 0.55);
      fov = 50;
    } else if (view === "putt") {
      const back = fromAngle(aim + Math.PI, 2.35);
      const side = fromAngle(aim + Math.PI / 2, 0.42);
      desired.set(ball.x + back.x + side.x, bh + 0.78, ball.y + back.y + side.y);
      look.set(pin.x, groundHeight(hole, pin.x, pin.y) + 0.22, pin.y);
      fov = 46;
    } else if (view === "follow") {
      const v = session.ball.vel;
      const heading = Math.hypot(v.x, v.y) > 0.4 ? Math.atan2(v.y, v.x) : session.aim;
      const back = fromAngle(heading + Math.PI, 14);
      desired.set(ball.x + back.x, bh + 5.2 + session.ball.z * 0.18, ball.y + back.y);
      look.set(ball.x, bh + 0.9, ball.y);
      fov = 52;
    } else {
      const back = fromAngle(aim + Math.PI, putting ? 5 : 9.5);
      desired.set(ball.x + back.x, bh + (putting ? 1.8 : 2.7), ball.y + back.y);
      look.set(ball.x * 0.35 + pin.x * 0.65, 0.9, ball.y * 0.35 + pin.y * 0.65);
      fov = 58;
    }
    const follow = view === "follow" ? 0.00022 : view === "putt" ? 0.0012 : 0.0005;
    const k = 1 - Math.pow(follow, Math.max(dt, 0.001));
    if (this.camPos.distanceTo(desired) > 70) {
      this.camPos.copy(desired);
      this.camLook.copy(look);
    } else {
      this.camPos.lerp(desired, Math.min(1, k + 0.1));
      this.camLook.lerp(look, Math.min(1, k + 0.08));
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.fov += (fov - this.camera.fov) * 0.12;
    this.camera.updateProjectionMatrix();
  }
}

function makeSky(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(520, 40, 24),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  return mesh;
}

function makeGrassMap(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#3d6a32";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.globalAlpha = 0.15 + Math.random() * 0.4;
    ctx.fillStyle = Math.random() > 0.5 ? "#6ea84c" : "#2b4f24";
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Math.random() - 0.5) * 0.8);
    ctx.fillRect(-0.6, -3.4, 1.1 + Math.random(), 4 + Math.random() * 4);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  return c;
}

function makeTree(x: number, z: number, r: number, ground: number): THREE.Group {
  const group = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: 0x5a4332, roughness: 0.9 });
  const leafA = new THREE.MeshStandardMaterial({ color: 0x4f8a3c, roughness: 0.78 });
  const leafB = new THREE.MeshStandardMaterial({ color: 0x3d6f30, roughness: 0.8 });
  const h = 6.4 + (r - 7) * 0.4;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, h * 0.5, 7), bark);
  trunk.position.y = h * 0.24;
  trunk.castShadow = true;
  const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.62, 1), leafA);
  c1.position.set(0.2, h * 0.58, -0.15);
  c1.scale.set(1, 0.72, 1.05);
  c1.castShadow = true;
  const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.48, 1), leafB);
  c2.position.set(-0.35, h * 0.7, 0.25);
  c2.scale.set(1.05, 0.68, 0.95);
  c2.castShadow = true;
  group.add(trunk, c1, c2);
  group.position.set(x, ground, z);
  return group;
}

function makeLine(data: Float32Array, color: number): THREE.Line {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(data, 3));
  geo.setDrawRange(0, 0);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 }));
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
