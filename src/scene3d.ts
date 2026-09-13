import * as THREE from "three";
import { lieAt, lieId, nearOb } from "./course";
import type { GameSession } from "./game";
import { fbm } from "./look";
import { dist, fromAngle, type Vec2 } from "./math";
import type { FlightSample } from "./physics";
import {
  bladeHeight,
  bladeKeepChance,
  bladeWidth,
  grassBudget,
  groundHeight,
  isPuttingSituation,
  resolveCamView,
  type ResolvedCam,
} from "./terrain";
import type { Hole } from "./types";

const MAX_PATH = 140;
const BLADE_COUNT = 9000;
const TRAIL_LEN = 72;
const BALL_RADIUS = 0.11;

const TURF_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
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
  uniform sampler2D surfaceMap;
  uniform sampler2D detailMap;
  uniform vec2 mapOrigin;
  uniform vec2 mapSize;
  varying vec3 vWorld;
  varying vec3 vNormal;

  vec3 albedoFor(float id, float n, vec3 world) {
    float stripe = 0.5 + 0.5 * sin(world.x * 0.38 + world.z * 0.045);
    if (id < 1.5) {
      return vec3(0.30, 0.50, 0.21) * (0.93 + n * 0.08);
    }
    if (id < 2.5) {
      float sheen = 0.97 + stripe * 0.03;
      return vec3(0.33, 0.51, 0.19) * sheen * (0.9 + n * 0.1);
    }
    if (id < 3.5) {
      return vec3(0.23, 0.33, 0.11) * (0.8 + n * 0.22);
    }
    if (id < 4.5) {
      float nap = 0.975 + stripe * 0.03;
      return vec3(0.15, 0.47, 0.31) * nap * (0.97 + n * 0.04);
    }
    if (id < 5.5) {
      return vec3(0.82, 0.70, 0.46) * (0.9 + n * 0.1);
    }
    if (id < 6.5) {
      return vec3(0.08, 0.27, 0.36);
    }
    return vec3(0.50, 0.44, 0.28) * (0.86 + n * 0.16);
  }

  void main() {
    vec2 uv = (vWorld.xz - mapOrigin) / mapSize;
    vec4 samp = texture2D(surfaceMap, clamp(uv, 0.0, 1.0));
    float id = samp.r * 255.0;
    float n = samp.g;
    vec3 detail = texture2D(detailMap, vWorld.xz * 0.48).rgb;
    vec3 col = albedoFor(id, n, vWorld);
    float detailMix = id > 3.5 && id < 4.5 ? 0.07 : id > 2.5 && id < 3.5 ? 0.28 : 0.16;
    col *= mix(vec3(1.0), detail, detailMix);

    vec3 nrm = normalize(mix(vec3(0.0, 1.0, 0.0), normalize(vNormal), 0.58));
    vec3 viewDir = normalize(cameraPos - vWorld);
    float ndl = max(dot(nrm, sunDir), 0.0);
    float wrap = ndl * 0.48 + 0.52;
    float specPower = id > 3.5 && id < 4.5 ? 52.0 : 20.0;
    float specAmt = id > 3.5 && id < 4.5 ? 0.14 : id < 2.5 ? 0.05 : 0.03;
    vec3 halfV = normalize(sunDir + viewDir);
    float spec = pow(max(dot(nrm, halfV), 0.0), specPower) * specAmt * ndl;
    float ao = 0.84 + 0.16 * clamp(vWorld.y + 0.15, 0.0, 1.0);
    vec3 lit = col * (ambient + sunColor * wrap) * ao + sunColor * spec;
    lit = max(lit, col * 0.28);
    gl_FragColor = vec4(lit, 1.0);
  }
`;

const BLADE_VERT = /* glsl */ `
  uniform float time;
  varying vec3 vColor;
  varying vec2 vUv;
  void main() {
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = vec3(0.28, 0.46, 0.18);
    #endif
    vUv = uv;
    vec3 p = position;
    float sway = sin(time * 1.15 + instanceMatrix[3][0] * 0.38 + instanceMatrix[3][2] * 0.3) * 0.07;
    p.x += sway * p.y;
    p.z += sway * 0.28 * p.y;
    vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BLADE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying vec2 vUv;
  void main() {
    float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
    float tip = 1.0 - smoothstep(0.55, 1.0, vUv.y);
    float alpha = edge * (0.35 + 0.65 * tip);
    if (alpha < 0.32) discard;
    vec3 col = mix(vColor * 0.55, vColor * 1.12, vUv.y);
    float lit = 0.62 + 0.38 * vUv.y;
    gl_FragColor = vec4(col * lit, alpha);
  }
`;

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 zenith = vec3(0.22, 0.46, 0.76);
    vec3 mid = vec3(0.55, 0.74, 0.9);
    vec3 horizon = vec3(0.78, 0.82, 0.8);
    vec3 haze = vec3(0.9, 0.86, 0.74);
    vec3 col = mix(haze, horizon, smoothstep(-0.08, 0.04, h));
    col = mix(col, mid, smoothstep(0.02, 0.22, h));
    col = mix(col, zenith, smoothstep(0.18, 0.78, h));
    vec3 sunD = normalize(vec3(0.46, 0.58, 0.4));
    float sun = pow(max(dot(normalize(vDir), sunD), 0.0), 220.0);
    float glow = pow(max(dot(normalize(vDir), sunD), 0.0), 12.0);
    col += vec3(1.0, 0.9, 0.68) * sun * 1.15;
    col += vec3(1.0, 0.78, 0.45) * glow * 0.22;
    float cloud = sin(vDir.x * 7.2 + vDir.z * 5.4) * sin(vDir.x * 2.8 - vDir.z * 3.6);
    cloud = smoothstep(0.42, 0.82, cloud) * smoothstep(0.1, 0.42, h) * 0.14;
    col = mix(col, vec3(0.96, 0.97, 0.95), cloud);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class CourseScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  private holeGroup = new THREE.Group();
  private ball: THREE.Mesh;
  private halo: THREE.Mesh;
  private shadow: THREE.Mesh;
  private pin = new THREE.Group();
  private golfer = new THREE.Group();
  private grid = new THREE.Group();
  private landing: THREE.Mesh;
  private flightMesh: THREE.Mesh | null = null;
  private flightMat: THREE.MeshBasicMaterial;
  private groundLine: THREE.Line;
  private groundPos: Float32Array;
  private trail: THREE.Line;
  private trailPos: Float32Array;
  private trailCount = 0;
  private blades: THREE.InstancedMesh | null = null;
  private bladeGeo: THREE.BufferGeometry;
  private bladeMat: THREE.ShaderMaterial;
  private puttAim: THREE.Line;
  private turfMat: THREE.ShaderMaterial;
  private surfaceTex: THREE.DataTexture | null = null;
  private raycaster = new THREE.Raycaster();
  private terrain: THREE.Mesh | null = null;
  private camPos = new THREE.Vector3(80, 24, 80);
  private camLook = new THREE.Vector3(200, 1, 140);
  private grassAt: Vec2 = { x: 9999, y: 9999 };
  private builtHole = -1;
  private pathKey = "";
  private lastView: ResolvedCam | "" = "";
  private viewAge = 1;
  private sun: THREE.DirectionalLight;
  private time = 0;
  private w = 1;
  private h = 1;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x8aa4b4, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x9bb0bc, 220, 860);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.12, 1600);
    this.scene.add(this.holeGroup);
    this.scene.add(makeSky());

    const hemi = new THREE.HemisphereLight(0xc8def0, 0x6d7a4c, 0.95);
    this.scene.add(hemi);
    const fill = new THREE.DirectionalLight(0xb7cce0, 0.42);
    fill.position.set(-90, 48, 70);
    this.scene.add(fill);
    this.sun = new THREE.DirectionalLight(0xfff1d2, 1.72);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.045;
    this.sun.shadow.camera.near = 4;
    this.sun.shadow.camera.far = 460;
    this.sun.shadow.camera.left = -180;
    this.sun.shadow.camera.right = 180;
    this.sun.shadow.camera.top = 140;
    this.sun.shadow.camera.bottom = -140;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const detailMap = new THREE.CanvasTexture(makeGrassMap());
    detailMap.wrapS = THREE.RepeatWrapping;
    detailMap.wrapT = THREE.RepeatWrapping;
    this.turfMat = new THREE.ShaderMaterial({
      vertexShader: TURF_VERT,
      fragmentShader: TURF_FRAG,
      uniforms: {
        sunDir: { value: new THREE.Vector3(0.46, 0.74, 0.48).normalize() },
        sunColor: { value: new THREE.Color(0xfff2d6) },
        ambient: { value: new THREE.Color(0x5a6750) },
        cameraPos: { value: this.camPos },
        surfaceMap: { value: null },
        detailMap: { value: detailMap },
        mapOrigin: { value: new THREE.Vector2(0, 0) },
        mapSize: { value: new THREE.Vector2(1, 1) },
      },
    });
    this.bladeGeo = makeGrassTuftGeo();
    this.bladeMat = new THREE.ShaderMaterial({
      vertexShader: BLADE_VERT,
      fragmentShader: BLADE_FRAG,
      uniforms: { time: { value: 0 } },
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    const puttGeo = new THREE.BufferGeometry();
    puttGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    this.puttAim = new THREE.Line(puttGeo, new THREE.LineBasicMaterial({ color: 0xf2e4b0, transparent: true, opacity: 0.72 }));
    this.scene.add(this.puttAim);

    this.ball = new THREE.Mesh(
      makeGolfBallGeometry(BALL_RADIUS),
      new THREE.MeshStandardMaterial({
        color: 0xfffdf8,
        roughness: 0.26,
        metalness: 0.03,
        emissive: 0x2c2a20,
        emissiveIntensity: 0.22,
        vertexColors: true,
      }),
    );
    this.ball.castShadow = true;
    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS * 1.55, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false }),
    );
    this.ball.add(this.halo);
    this.scene.add(this.ball);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 22),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);

    this.landing = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.05, 28),
      new THREE.MeshBasicMaterial({ color: 0xf0d78a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    this.landing.rotation.x = -Math.PI / 2;
    this.scene.add(this.landing);

    this.flightMat = new THREE.MeshBasicMaterial({ color: 0xf4e08a, transparent: true, opacity: 0.88 });
    this.groundPos = new Float32Array(MAX_PATH * 3);
    this.groundLine = makeLine(this.groundPos, 0x111111);
    this.scene.add(this.groundLine);
    this.trailPos = new Float32Array(TRAIL_LEN * 3);
    this.trail = makeLine(this.trailPos, 0xffffff);
    (this.trail.material as THREE.LineBasicMaterial).opacity = 0.92;
    this.scene.add(this.trail);

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
    this.updateTrail(session);
    this.updateGrid(session, putting);
    this.updatePuttAim(session, hole, putting);
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
    if (this.surfaceTex) {
      this.surfaceTex.dispose();
      this.surfaceTex = null;
    }
    this.grassAt = { x: 9999, y: 9999 };
    this.trailCount = 0;

    const b = hole.bounds;
    const pad = 110;
    const tw = b.w + pad * 2;
    const th = b.h + pad * 2;
    const ox = b.x - pad;
    const oz = b.y - pad;
    const cols = Math.max(96, Math.round(tw / 1.15));
    const rows = Math.max(68, Math.round(th / 1.15));
    const geo = new THREE.PlaneGeometry(tw, th, cols, rows);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cx = b.x + b.w / 2;
    const cz = b.y + b.h / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx;
      const z = pos.getZ(i) + cz;
      pos.setXYZ(i, x, groundHeight(hole, x, z), z);
    }
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, this.turfMat);
    terrain.receiveShadow = true;
    this.terrain = terrain;
    this.holeGroup.add(terrain);

    const surface = bakeSurfaceMap(hole, ox, oz, tw, th);
    this.surfaceTex = surface;
    this.turfMat.uniforms.surfaceMap.value = surface;
    this.turfMat.uniforms.mapOrigin.value.set(ox, oz);
    this.turfMat.uniforms.mapSize.value.set(tw, th);

    const underlay = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ color: 0x7a7348, roughness: 1 }),
    );
    underlay.rotation.x = -Math.PI / 2;
    underlay.position.set(cx, -0.55, cz);
    underlay.receiveShadow = true;
    this.holeGroup.add(underlay);

    this.addWater(hole);
    this.addBunkerLips(hole);
    this.addTrees(hole);
    this.addDunes(hole);
    this.buildPin();
    this.buildGrid(hole);

    this.sun.position.set(cx + 120, 92, cz - 140);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.target.updateMatrixWorld();
  }

  private addWater(hole: Hole): void {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1d6d86,
      roughness: 0.16,
      metalness: 0.22,
      transparent: true,
      opacity: 0.88,
    });
    for (const poly of hole.water) {
      if (poly.length < 3) continue;
      const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = -0.16;
      this.holeGroup.add(mesh);
    }
  }

  private addBunkerLips(hole: Hole): void {
    const sand = new THREE.MeshStandardMaterial({ color: 0xe6c896, roughness: 0.96 });
    for (const bunker of hole.bunkers) {
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 36), sand);
      mesh.scale.set(bunker.rx, bunker.ry, 1);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = bunker.rotation;
      mesh.position.set(bunker.cx, groundHeight(hole, bunker.cx, bunker.cy) + 0.02, bunker.cy);
      mesh.receiveShadow = true;
      this.holeGroup.add(mesh);
    }
  }

  private addTrees(hole: Hole): void {
    for (const tree of hole.trees) {
      this.holeGroup.add(makeTree(tree.x, tree.y, tree.r, groundHeight(hole, tree.x, tree.y)));
    }
  }

  private addDunes(hole: Hole): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b8458, roughness: 0.98 });
    const b = hole.bounds;
    const spots = [
      [b.x - 70, b.y - 48, 48],
      [b.x + b.w + 62, b.y + 20, 54],
      [b.x + 100, b.y - 78, 40],
      [b.x + b.w * 0.55, b.y + b.h + 68, 58],
      [b.x - 28, b.y + b.h + 40, 36],
    ];
    for (const [x, z, r] of spots) {
      const dune = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
      dune.scale.y = 0.16;
      dune.position.set(x, -r * 0.04, z);
      dune.receiveShadow = true;
      this.holeGroup.add(dune);
    }
  }

  private buildPin(): void {
    this.pin.clear();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.02, 1.7, 8),
      new THREE.MeshStandardMaterial({ color: 0xf6f2ea, roughness: 0.3 }),
    );
    pole.position.y = 0.88;
    pole.castShadow = true;
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xc62828, side: THREE.DoubleSide, roughness: 0.48 }),
    );
    flag.position.set(0.3, 1.56, 0);
    const cup = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshBasicMaterial({ color: 0x0b0b0b }));
    cup.rotation.x = -Math.PI / 2;
    cup.position.y = 0.015;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.28, 24),
      new THREE.MeshBasicMaterial({ color: 0xddd4c0, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.pin.add(pole, flag, cup, ring);
  }

  private buildGrid(hole: Hole): void {
    this.grid.clear();
    const g = hole.green;
    const rot = g.rotation;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const pts: number[] = [];
    const toWorld = (lx: number, ly: number) => {
      const x = g.cx + lx * cos - ly * sin;
      const z = g.cy + lx * sin + ly * cos;
      return { x, z, y: groundHeight(hole, x, z) + 0.035 };
    };
    for (let i = -3; i <= 3; i++) {
      const u = (i / 3) * g.rx * 0.86;
      const a = toWorld(u, -g.ry * 0.86);
      const b = toWorld(u, g.ry * 0.86);
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    for (let i = -3; i <= 3; i++) {
      const v = (i / 3) * g.ry * 0.86;
      const a = toWorld(-g.rx * 0.86, v);
      const b = toWorld(g.rx * 0.86, v);
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.grid.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xd8e4cc, transparent: true, opacity: 0.16 })));
  }

  private buildGolfer(): void {
    this.golfer.clear();
    const slacks = new THREE.MeshStandardMaterial({ color: 0x243028, roughness: 0.72 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xece7dc, roughness: 0.58 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc4a882, roughness: 0.52 });
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.78, 8), slacks);
    legs.position.y = 0.4;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.54, 8), shirt);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin);
    head.position.y = 1.4;
    const club = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.018, 0.92, 6),
      new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.3, metalness: 0.45 }),
    );
    club.position.set(0.2, 0.66, 0.08);
    club.rotation.z = 0.3;
    this.golfer.add(legs, torso, head, club);
  }

  private placeBall(session: GameSession): void {
    const p = session.ball.pos;
    const gh = groundHeight(session.hole(), p.x, p.y);
    const air = Math.max(session.ball.z, 0);
    this.ball.position.set(p.x, gh + air + BALL_RADIUS, p.y);
    this.ball.rotation.x += air > 0.2 ? 0.08 : 0;
    this.shadow.position.set(p.x, gh + 0.02, p.y);
    const scale = Math.max(0.08, 0.2 - air * 0.008);
    this.shadow.scale.setScalar(scale);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = air > 10 ? 0.1 : 0.3;
    const halo = this.halo.material as THREE.MeshBasicMaterial;
    halo.opacity = air > 1.2 ? Math.min(0.38, 0.08 + air * 0.018) : 0.04;
  }

  private placePin(hole: Hole): void {
    this.pin.position.set(hole.pin.x, groundHeight(hole, hole.pin.x, hole.pin.y), hole.pin.y);
  }

  private placeGolfer(session: GameSession, view: ResolvedCam): void {
    const flying = session.swingPhase === "flight" || session.swingPhase === "settle";
    this.golfer.visible = session.screen === "play" && !flying;
    const p = session.ball.pos;
    const hole = session.hole();
    const aim = view === "putt" ? Math.atan2(hole.pin.y - p.y, hole.pin.x - p.x) : session.aim;
    const back = fromAngle(aim + Math.PI, view === "putt" ? 1.55 : 1.25);
    const left = fromAngle(aim - Math.PI / 2, view === "putt" ? 0.95 : 0.08);
    this.golfer.position.set(p.x + back.x + left.x, groundHeight(hole, p.x, p.y), p.y + back.y + left.y);
    this.golfer.rotation.y = -aim + Math.PI / 2;
    this.golfer.scale.setScalar(view === "putt" ? 0.86 : 1);
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
    const shape = session.swingPhase === "flight" || session.swingPhase === "settle" ? Math.sign(session.ball.curve) : session.shape;
    this.flightMat.color.set(shape > 0.2 ? 0x8fd0ff : shape < -0.2 ? 0xffb56a : 0xf6e08c);
    const hole = session.hole();
    const n = Math.min(path.length, MAX_PATH);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const s = path[Math.round((i / Math.max(n - 1, 1)) * (path.length - 1))];
      const gh = groundHeight(hole, s.pos.x, s.pos.y);
      pts.push(new THREE.Vector3(s.pos.x, gh + Math.max(s.z, 0.05) + BALL_RADIUS, s.pos.y));
      this.groundPos[i * 3] = s.pos.x;
      this.groundPos[i * 3 + 1] = gh + 0.04;
      this.groundPos[i * 3 + 2] = s.pos.y;
    }
    setLine(this.groundLine, n);
    const last = path[path.length - 1];
    const key = `${n}:${last.pos.x.toFixed(1)}:${last.pos.y.toFixed(1)}:${last.z.toFixed(1)}`;
    if (key !== this.pathKey) {
      this.pathKey = key;
      const radius = session.club().id === "putter" ? 0.035 : 0.11;
      this.setFlightTube(pts, radius);
    }
    const warn = nearOb(hole, last.pos) || lieAt(hole, last.pos) === "ob";
    this.landing.position.set(last.pos.x, groundHeight(hole, last.pos.x, last.pos.y) + 0.05, last.pos.y);
    (this.landing.material as THREE.MeshBasicMaterial).color.set(warn ? 0xc62828 : 0xf0d78a);
  }

  private updateTrail(session: GameSession): void {
    const flying = session.swingPhase === "flight" || session.swingPhase === "settle";
    this.trail.visible = session.screen === "play" && flying && session.ball.z > 0.25;
    if (!this.trail.visible) {
      this.trailCount = 0;
      return;
    }
    const hole = session.hole();
    const p = session.ball.pos;
    const y = groundHeight(hole, p.x, p.y) + Math.max(session.ball.z, 0) + BALL_RADIUS;
    if (this.trailCount < TRAIL_LEN) {
      this.trailPos[this.trailCount * 3] = p.x;
      this.trailPos[this.trailCount * 3 + 1] = y;
      this.trailPos[this.trailCount * 3 + 2] = p.y;
      this.trailCount += 1;
    } else {
      this.trailPos.copyWithin(0, 3);
      this.trailPos[(TRAIL_LEN - 1) * 3] = p.x;
      this.trailPos[(TRAIL_LEN - 1) * 3 + 1] = y;
      this.trailPos[(TRAIL_LEN - 1) * 3 + 2] = p.y;
    }
    setLine(this.trail, this.trailCount);
  }

  private setFlightTube(pts: THREE.Vector3[], radius: number): void {
    if (this.flightMesh) {
      this.flightMesh.geometry.dispose();
      this.scene.remove(this.flightMesh);
      this.flightMesh = null;
    }
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, Math.min(96, pts.length * 2), radius, 6, false);
    this.flightMesh = new THREE.Mesh(geo, this.flightMat);
    this.scene.add(this.flightMesh);
  }

  private updateGrid(session: GameSession, putting: boolean): void {
    this.grid.visible = session.screen === "play" && session.puttGrid && putting;
  }

  private updatePuttAim(session: GameSession, hole: Hole, putting: boolean): void {
    const show = session.screen === "play" && putting && session.swingPhase !== "flight";
    this.puttAim.visible = show;
    if (!show) return;
    const from = session.ball.pos;
    const to = hole.pin;
    const attr = this.puttAim.geometry.getAttribute("position") as THREE.BufferAttribute;
    attr.setXYZ(0, from.x, groundHeight(hole, from.x, from.y) + 0.08, from.y);
    attr.setXYZ(1, to.x, groundHeight(hole, to.x, to.y) + 0.08, to.y);
    attr.needsUpdate = true;
  }

  private updateGrass(session: GameSession, hole: Hole, view: ResolvedCam): void {
    const focus = session.ball.pos;
    if (this.blades && dist(focus, this.grassAt) < 2.2) return;
    this.grassAt = { ...focus };
    if (this.blades) this.scene.remove(this.blades);
    const focusLie = lieAt(hole, focus);
    const budget = grassBudget(focusLie, BLADE_COUNT);
    if (budget <= 0) {
      this.blades = null;
      return;
    }
    const mesh = new THREE.InstancedMesh(this.bladeGeo, this.bladeMat, budget);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let written = 0;
    for (let i = 0; i < budget * 7 && written < budget; i++) {
      const close = written < budget * 0.55;
      const span = view === "putt" ? (close ? 5 : 12) : view === "player" ? (close ? 7 : 16) : (close ? 6 : 13);
      const a = fbm(focus.x * 0.3 + i * 1.7, focus.y * 0.3 + i) * Math.PI * 2;
      const r = Math.sqrt(fbm(i * 0.37, focus.x + i * 0.11)) * span;
      const x = focus.x + Math.cos(a) * r;
      const z = focus.y + Math.sin(a) * r;
      const lie = lieAt(hole, { x, y: z });
      const h = bladeHeight(lie);
      if (h <= 0) continue;
      if (fbm(x * 5.3 + 2.1, z * 5.3) > bladeKeepChance(lie)) continue;
      dummy.position.set(x, groundHeight(hole, x, z), z);
      dummy.rotation.set(0, a, (fbm(x, z) - 0.5) * (lie === "rough" ? 0.22 : 0.06));
      const lean = 0.9 + fbm(x * 2, z * 2) * 0.18;
      dummy.scale.set(bladeWidth(lie), h * lean, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(written, dummy.matrix);
      if (lie === "rough") color.setRGB(0.2, 0.32, 0.12);
      else if (lie === "tee") color.setRGB(0.28, 0.48, 0.2);
      else color.setRGB(0.3, 0.47, 0.17);
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
    if (this.lastView !== view) {
      this.lastView = view;
      this.viewAge = 0;
    }
    this.viewAge += dt;
    const ball = session.ball.pos;
    const pin = hole.pin;
    const aim = putting ? Math.atan2(pin.y - ball.y, pin.x - ball.x) : session.aim;
    const bh = groundHeight(hole, ball.x, ball.y) + session.ball.z;
    const desired = new THREE.Vector3();
    const look = new THREE.Vector3();
    let fov = 52;
    if (session.screen !== "play") {
      const t = this.time * 0.1;
      desired.set((hole.tee.x + pin.x) * 0.5 + Math.cos(t) * 70, 30, (hole.tee.y + pin.y) * 0.5 + Math.sin(t) * 48);
      look.set((hole.tee.x + pin.x) * 0.55, 1.2, (hole.tee.y + pin.y) * 0.55);
      fov = 48;
    } else if (view === "putt") {
      const pinDist = Math.max(2, dist(ball, pin));
      const back = fromAngle(aim + Math.PI, 5.1 + Math.min(7.2, pinDist * 0.28));
      const side = fromAngle(aim + Math.PI / 2, 0.35);
      desired.set(ball.x + back.x + side.x, bh + 2.15 + Math.min(1.5, pinDist * 0.06), ball.y + back.y + side.y);
      look.set(ball.x * 0.38 + pin.x * 0.62, groundHeight(hole, pin.x, pin.y) + 0.12, ball.y * 0.38 + pin.y * 0.62);
      fov = 46;
    } else if (view === "follow") {
      const v = session.ball.vel;
      const heading = Math.hypot(v.x, v.y) > 0.35 ? Math.atan2(v.y, v.x) : session.aim;
      const landing = session.shotArc[session.shotArc.length - 1];
      const back = fromAngle(heading + Math.PI, 17 + session.ball.z * 0.22);
      const curve = session.ball.curve || session.shape * 24;
      const side = fromAngle(heading + Math.PI / 2, -Math.max(-1, Math.min(1, curve / 24)) * 6);
      desired.set(ball.x + back.x + side.x, 5.4 + session.ball.z * 0.38, ball.y + back.y + side.y);
      const lx = landing ? ball.x * 0.55 + landing.pos.x * 0.45 : ball.x + Math.cos(heading) * 16;
      const lz = landing ? ball.y * 0.55 + landing.pos.y * 0.45 : ball.y + Math.sin(heading) * 16;
      look.set(lx, Math.max(1.1, session.ball.z * 0.42), lz);
      fov = 50;
    } else {
      const back = fromAngle(aim + Math.PI, putting ? 6.2 : 10.2);
      desired.set(ball.x + back.x, bh + (putting ? 2.3 : 3.1), ball.y + back.y);
      look.set(ball.x * 0.32 + pin.x * 0.68, 1.0, ball.y * 0.32 + pin.y * 0.68);
      fov = 54;
    }
    const catchup = this.viewAge < 0.28 ? 0.55 : view === "follow" ? 0.22 : view === "putt" ? 0.18 : 0.14;
    const k = 1 - Math.exp(-catchup * 18 * Math.max(dt, 0.001));
    if (this.camPos.distanceTo(desired) > 90 || this.viewAge < 0.02) {
      this.camPos.copy(desired);
      this.camLook.copy(look);
    } else {
      this.camPos.lerp(desired, Math.min(1, k));
      this.camLook.lerp(look, Math.min(1, k * 0.9));
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.fov += (fov - this.camera.fov) * 0.16;
    this.camera.updateProjectionMatrix();
  }
}

const DIMPLE_COUNT = 336;
const DIMPLE_RADIUS = 0.09;
const DIMPLE_DEPTH_RATIO = 0.078;

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
    const shade = 1 - dent * 0.16;
    colors[i * 3] = 0.99 * shade;
    colors[i * 3 + 1] = 0.985 * shade;
    colors[i * 3 + 2] = 0.96 * shade;
  }
  pos.needsUpdate = true;
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function makeGrassTuftGeo(): THREE.BufferGeometry {
  const w = 0.5;
  const positions = new Float32Array([
    -w, 0, 0, w, 0, 0, w, 1, 0, -w, 0, 0, w, 1, 0, -w, 1, 0,
    0, 0, -w, 0, 0, w, 0, 1, w, 0, 0, -w, 0, 1, w, 0, 1, -w,
  ]);
  const uvs = new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return geo;
}

function makeSky(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(780, 48, 28),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
}

function makeGrassMap(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#4a6d38";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.globalAlpha = 0.12 + Math.random() * 0.32;
    ctx.fillStyle = Math.random() > 0.5 ? "#6f9a4e" : "#2f4c26";
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Math.random() - 0.5) * 0.7);
    ctx.fillRect(-0.5, -2.2, 0.9 + Math.random(), 3.2 + Math.random() * 2.4);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  return c;
}

function bakeSurfaceMap(hole: Hole, ox: number, oz: number, tw: number, th: number): THREE.DataTexture {
  const w = 640;
  const h = 640;
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = ox + (i / (w - 1)) * tw;
      const z = oz + (j / (h - 1)) * th;
      const lie = lieAt(hole, { x, y: z });
      const idx = (j * w + i) * 4;
      data[idx] = lieId(lie);
      data[idx + 1] = Math.floor(fbm(x * 0.16, z * 0.16) * 255);
      data[idx + 2] = 0;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

function makeTree(x: number, z: number, r: number, ground: number): THREE.Group {
  const group = new THREE.Group();
  const pine = fbm(x * 0.17, z * 0.17) > 0.42;
  const bark = new THREE.MeshStandardMaterial({ color: pine ? 0x4a3a2c : 0x5a4332, roughness: 0.92 });
  const h = pine ? 8.4 + (r - 7) * 0.55 : 6.8 + (r - 7) * 0.35;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(pine ? 0.14 : 0.2, pine ? 0.28 : 0.34, h * (pine ? 0.62 : 0.48), 7), bark);
  trunk.position.y = h * (pine ? 0.3 : 0.24);
  trunk.castShadow = true;
  group.add(trunk);
  if (pine) {
    const greens = [0x2f5a28, 0x3a6a30, 0x274a22];
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const mat = new THREE.MeshStandardMaterial({ color: greens[i % greens.length], roughness: 0.82 });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r * (0.7 - t * 0.36), h * 0.3, 8), mat);
      cone.position.set((fbm(x + i, z) - 0.5) * 0.35, h * (0.4 + t * 0.15), (fbm(z + i, x) - 0.5) * 0.3);
      cone.castShadow = true;
      cone.receiveShadow = true;
      group.add(cone);
    }
  } else {
    const leafA = new THREE.MeshStandardMaterial({ color: 0x3f6e32, roughness: 0.8 });
    const leafB = new THREE.MeshStandardMaterial({ color: 0x2f5428, roughness: 0.84 });
    const clusters = [
      [0.15, 0.62, -0.1, r * 0.58, 0.7],
      [-0.38, 0.72, 0.22, r * 0.46, 0.64],
      [0.32, 0.78, 0.18, r * 0.4, 0.6],
      [-0.1, 0.88, -0.28, r * 0.36, 0.55],
      [0.05, 0.54, 0.32, r * 0.34, 0.58],
    ] as const;
    clusters.forEach(([cx, cy, cz, rad, sy], i) => {
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(rad, 8, 6), i % 2 ? leafB : leafA);
      canopy.position.set(cx, h * cy, cz);
      canopy.scale.set(1.15, sy, 1.05);
      canopy.castShadow = true;
      canopy.receiveShadow = true;
      group.add(canopy);
    });
  }
  group.position.set(x, ground, z);
  group.rotation.y = fbm(x, z) * Math.PI * 2;
  return group;
}

function makeLine(data: Float32Array, color: number): THREE.Line {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(data, 3));
  geo.setDrawRange(0, 0);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.34 }));
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
