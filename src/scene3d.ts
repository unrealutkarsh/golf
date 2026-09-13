import * as THREE from "three";
import { lieAt, nearOb } from "./course";
import type { GameSession } from "./game";
import { fbm, grassTile, hashNoise, heightToNormal, packNormalRgb } from "./look";
import { dist, fromAngle, type Vec2 } from "./math";
import type { FlightSample } from "./physics";
import { groundHeight, isPuttingSituation, resolveCamView, surfaceColor, type ResolvedCam } from "./terrain";
import type { Hole } from "./types";

const MAX_PATH = 140;
const TRAIL_LEN = 80;
const BALL_RADIUS = 0.11;

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p) {
    return noise(p) * 0.52 + noise(p * 2.13 + 4.1) * 0.28 + noise(p * 4.7 + 9.2) * 0.14 + noise(p * 9.1) * 0.06;
  }
  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;
    vec3 zenith = vec3(0.12, 0.32, 0.68);
    vec3 mid = vec3(0.42, 0.64, 0.88);
    vec3 horizon = vec3(0.78, 0.82, 0.86);
    vec3 haze = vec3(0.90, 0.84, 0.70);
    vec3 col = mix(haze, horizon, smoothstep(-0.18, 0.04, h));
    col = mix(col, mid, smoothstep(0.0, 0.32, h));
    col = mix(col, zenith, smoothstep(0.24, 0.88, h));
    vec3 sunD = normalize(vec3(0.52, 0.48, 0.38));
    float sun = pow(max(dot(dir, sunD), 0.0), 340.0);
    float glow = pow(max(dot(dir, sunD), 0.0), 6.0);
    float wash = pow(max(dot(dir, sunD), 0.0), 1.6);
    col += vec3(1.0, 0.94, 0.72) * sun * 1.8;
    col += vec3(1.0, 0.72, 0.38) * glow * 0.42;
    col += vec3(1.0, 0.78, 0.5) * wash * 0.1;
    vec2 cuv = dir.xz / max(abs(h) + 0.22, 0.12);
    float cloud = fbm(cuv * 1.15 + vec2(0.4, 0.1));
    float wisps = fbm(cuv * 2.8 + 6.0);
    float mask = smoothstep(0.08, 0.34, h) * smoothstep(0.78, 0.28, h);
    float banks = smoothstep(0.46, 0.72, cloud + wisps * 0.22) * mask;
    float thick = smoothstep(0.6, 0.86, cloud) * mask;
    col = mix(col, vec3(0.93, 0.94, 0.96), banks * 0.72);
    col = mix(col, vec3(0.99, 0.99, 0.98), thick * 0.55);
    col = mix(col, vec3(0.86, 0.82, 0.78), thick * wash * 0.18);
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
  private softShadow: THREE.Mesh;
  private pin = new THREE.Group();
  private golfer = new THREE.Group();
  private grid = new THREE.Group();
  private landing: THREE.Mesh;
  private flightMesh: THREE.Mesh | null = null;
  private flightMat: THREE.MeshBasicMaterial;
  private groundLine: THREE.Line;
  private groundPos: Float32Array;
  private trail: THREE.Line;
  private trailGlow: THREE.Line;
  private trailPos: Float32Array;
  private trailCount = 0;
  private puttAim: THREE.Line;
  private turfMat: THREE.MeshStandardMaterial;
  private albedoTex: THREE.CanvasTexture | null = null;
  private roughTex: THREE.CanvasTexture | null = null;
  private normalTex: THREE.CanvasTexture | null = null;
  private barkMat: THREE.MeshStandardMaterial;
  private raycaster = new THREE.Raycaster();
  private terrain: THREE.Mesh | null = null;
  private camPos = new THREE.Vector3(80, 24, 80);
  private camLook = new THREE.Vector3(200, 1, 140);
  private builtHole = -1;
  private pathKey = "";
  private lastView: ResolvedCam | "" = "";
  private viewAge = 1;
  private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh;
  private pineMat: THREE.MeshStandardMaterial;
  private oakMat: THREE.MeshStandardMaterial;
  private horizonMat: THREE.MeshStandardMaterial;
  private ribbon: THREE.Mesh;
  private ribbonGeo: THREE.BufferGeometry;
  private time = 0;
  private w = 1;
  private h = 1;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x7e96a6, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xa8b8b4, 0.00072);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.12, 6200);
    this.scene.add(this.holeGroup);
    this.sky = makeSky();
    this.scene.add(this.sky);

    const hemi = new THREE.HemisphereLight(0xd4e4f0, 0x5a6240, 0.92);
    this.scene.add(hemi);
    const fill = new THREE.DirectionalLight(0xc5d4e0, 0.55);
    fill.position.set(-90, 48, 70);
    this.scene.add(fill);
    const bounce = new THREE.DirectionalLight(0x8a9a58, 0.22);
    bounce.position.set(40, 12, -30);
    this.scene.add(bounce);
    this.sun = new THREE.DirectionalLight(0xffe8c4, 1.15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.08;
    this.sun.shadow.radius = 4.5;
    this.sun.shadow.camera.near = 4;
    this.sun.shadow.camera.far = 540;
    this.sun.shadow.camera.left = -210;
    this.sun.shadow.camera.right = 210;
    this.sun.shadow.camera.top = 170;
    this.sun.shadow.camera.bottom = -170;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const env = pmrem.fromScene(this.scene, 0.04);
      this.scene.environment = env.texture;
      pmrem.dispose();
    } catch (err) {
      console.warn("[ptg] PMREM env skip", err);
    }

    this.turfMat = new THREE.MeshStandardMaterial({
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.18,
    });
    attachDetailMap(this.turfMat, makeGrassDetailTex(), 72);
    this.pineMat = makeCutoutMat(makePineCard());
    this.oakMat = makeCutoutMat(makeOakCard());
    this.horizonMat = makeCutoutMat(makeHorizonCard());
    this.horizonMat.alphaTest = 0.12;
    this.barkMat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(makeBarkCard()),
      roughness: 0.94,
      metalness: 0,
    });
    if (this.barkMat.map) this.barkMat.map.colorSpace = THREE.SRGBColorSpace;

    const puttGeo = new THREE.BufferGeometry();
    puttGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    this.puttAim = new THREE.Line(puttGeo, new THREE.LineBasicMaterial({ color: 0xf2e4b0, transparent: true, opacity: 0.42 }));
    this.scene.add(this.puttAim);

    this.ball = new THREE.Mesh(
      makeGolfBallGeometry(BALL_RADIUS),
      new THREE.MeshPhysicalMaterial({
        color: 0xfffef8,
        roughness: 0.15,
        metalness: 0.02,
        clearcoat: 0.62,
        clearcoatRoughness: 0.1,
        sheen: 0.18,
        sheenRoughness: 0.4,
        sheenColor: new THREE.Color(0xffffff),
        envMapIntensity: 0.85,
        vertexColors: true,
      }),
    );
    this.ball.castShadow = true;
    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS * 1.55, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false }),
    );
    this.ball.add(this.halo);
    const marker = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(makeDiscSprite()),
        color: 0xfff6d8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    marker.name = "air-marker";
    marker.scale.set(0.32, 0.32, 1);
    this.ball.add(marker);
    this.scene.add(this.ball);

    const softMap = new THREE.CanvasTexture(makeSoftShadowCard());
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: softMap, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.softShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: softMap, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false }),
    );
    this.softShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow, this.softShadow);

    this.landing = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 0.95, 28),
      new THREE.MeshBasicMaterial({ color: 0xf0d78a, side: THREE.DoubleSide, transparent: true, opacity: 0.82 }),
    );
    this.landing.rotation.x = -Math.PI / 2;
    this.scene.add(this.landing);

    this.flightMat = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.28, toneMapped: false, depthWrite: false });
    this.groundPos = new Float32Array(MAX_PATH * 3);
    this.groundLine = makeLine(this.groundPos, 0x1a1a14);
    (this.groundLine.material as THREE.LineBasicMaterial).opacity = 0.22;
    this.scene.add(this.groundLine);
    this.trailPos = new Float32Array(TRAIL_LEN * 3);
    this.trail = makeLine(this.trailPos, 0xffffff);
    (this.trail.material as THREE.LineBasicMaterial).opacity = 0.95;
    this.trailGlow = makeLine(this.trailPos, 0xffc85a);
    (this.trailGlow.material as THREE.LineBasicMaterial).opacity = 0.5;
    this.scene.add(this.trail, this.trailGlow);
    this.ribbonGeo = new THREE.BufferGeometry();
    this.ribbonGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL_LEN * 2 * 3), 3));
    const ribbonIdx: number[] = [];
    for (let i = 0; i < TRAIL_LEN - 1; i++) {
      const a = i * 2;
      ribbonIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.ribbonGeo.setIndex(ribbonIdx);
    this.ribbon = new THREE.Mesh(
      this.ribbonGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfff4d2,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.ribbon.visible = false;
    this.scene.add(this.ribbon);

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
    this.updateCamera(session, hole, view, putting, dt);
  }

  render(): void {
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  private rebuildHole(hole: Hole, index: number): void {
    this.builtHole = index;
    this.holeGroup.clear();
    this.terrain = null;
    if (this.albedoTex) this.albedoTex.dispose();
    if (this.roughTex) this.roughTex.dispose();
    if (this.normalTex) this.normalTex.dispose();
    this.albedoTex = this.roughTex = this.normalTex = null;
    this.trailCount = 0;

    const b = hole.bounds;
    const pad = 110;
    const tw = b.w + pad * 2;
    const th = b.h + pad * 2;
    const ox = b.x - pad;
    const oz = b.y - pad;
    const cols = Math.max(100, Math.round(tw / 1.1));
    const rows = Math.max(72, Math.round(th / 1.1));
    const geo = new THREE.PlaneGeometry(tw, th, cols, rows);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const cx = b.x + b.w / 2;
    const cz = b.y + b.h / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx;
      const z = pos.getZ(i) + cz;
      pos.setXYZ(i, x, groundHeight(hole, x, z), z);
      uv.setXY(i, (x - ox) / tw, (z - oz) / th);
    }
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const lie = lieAt(hole, { x, y: z });
      const [cr, cg, cb] = surfaceColor(hole, x, z);
      const stripe = 0.78 + 0.22 * Math.sin(x * 0.38 + z * 0.05);
      const boost = lie === "fairway" || lie === "tee" || lie === "green" ? stripe : 0.72;
      colors[i * 3] = cr * boost;
      colors[i * 3 + 1] = cg * boost;
      colors[i * 3 + 2] = cb * boost;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const maps = bakeTurfMaps(hole, ox, oz, tw, th);
    this.albedoTex = maps.albedo;
    this.roughTex = maps.rough;
    this.normalTex = maps.normal;
    this.turfMat.map = maps.albedo;
    this.turfMat.roughnessMap = maps.rough;
    this.turfMat.normalMap = maps.normal;
    this.turfMat.normalScale.set(0.95, 0.95);
    this.turfMat.vertexColors = true;
    this.turfMat.needsUpdate = true;
    const terrain = new THREE.Mesh(geo, this.turfMat);
    terrain.receiveShadow = true;
    this.terrain = terrain;
    this.holeGroup.add(terrain);

    const underMat = new THREE.MeshStandardMaterial({
      map: makeGrassDetailTex(),
      color: 0x6a6848,
      roughness: 1,
    });
    if (underMat.map) {
      underMat.map.wrapS = underMat.map.wrapT = THREE.RepeatWrapping;
      underMat.map.repeat.set(90, 90);
    }
    const underlay = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), underMat);
    underlay.rotation.x = -Math.PI / 2;
    underlay.position.set(cx, -0.55, cz);
    underlay.receiveShadow = true;
    this.holeGroup.add(underlay);

    this.addWater(hole);
    this.addBunkerLips(hole);
    this.addTrees(hole);
    this.addForest(hole);
    this.addHorizon(hole);
    this.addDunes(hole);
    this.buildPin();
    this.buildGrid(hole);

    this.sun.position.set(cx + 130, 98, cz - 150);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.target.updateMatrixWorld();
  }

  private addWater(hole: Hole): void {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x1a6580,
      roughness: 0.08,
      metalness: 0.12,
      transmission: 0.18,
      transparent: true,
      opacity: 0.86,
      envMapIntensity: 0.9,
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
    const sandMap = new THREE.CanvasTexture(makeSandCard());
    sandMap.wrapS = sandMap.wrapT = THREE.RepeatWrapping;
    sandMap.repeat.set(3.2, 3.2);
    sandMap.colorSpace = THREE.SRGBColorSpace;
    const sand = new THREE.MeshStandardMaterial({ map: sandMap, roughness: 0.94, metalness: 0, envMapIntensity: 0.08 });
    const lip = new THREE.MeshStandardMaterial({ color: 0x6a5830, roughness: 0.98 });
    for (const bunker of hole.bunkers) {
      const y = groundHeight(hole, bunker.cx, bunker.cy);
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 40), sand);
      mesh.scale.set(bunker.rx, bunker.ry, 1);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = bunker.rotation;
      mesh.position.set(bunker.cx, y + 0.025, bunker.cy);
      mesh.receiveShadow = true;
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.08, 40), lip);
      rim.scale.set(bunker.rx, bunker.ry, 1);
      rim.rotation.x = -Math.PI / 2;
      rim.rotation.z = bunker.rotation;
      rim.position.set(bunker.cx, y + 0.04, bunker.cy);
      this.holeGroup.add(mesh, rim);
    }
  }

  private addTrees(hole: Hole): void {
    for (const tree of hole.trees) {
      this.holeGroup.add(makeTree(tree.x, tree.y, tree.r * 1.35, groundHeight(hole, tree.x, tree.y), this.pineMat, this.oakMat, this.barkMat));
      if (fbm(tree.x, tree.y) > 0.38) {
        const jx = tree.x + (fbm(tree.x + 2, tree.y) - 0.5) * 10;
        const jz = tree.y + (fbm(tree.x, tree.y + 3) - 0.5) * 10;
        this.holeGroup.add(makeTree(jx, jz, tree.r * 0.92, groundHeight(hole, jx, jz), this.pineMat, this.oakMat, this.barkMat));
      }
      if (fbm(tree.x * 0.3, tree.y) > 0.5) {
        this.holeGroup.add(makeBush(tree.x + 3.2, tree.y - 2.4, 2.1, groundHeight(hole, tree.x + 3.2, tree.y - 2.4), this.oakMat));
      }
    }
  }

  private addForest(hole: Hole): void {
    const b = hole.bounds;
    let n = 0;
    for (let i = 0; i < 220 && n < 160; i++) {
      const t = i / 220;
      const side = i % 2 === 0 ? -1 : 1;
      const x = b.x - 36 + t * (b.w + 72);
      const z = side < 0 ? b.y - 18 - fbm(i, 1) * 46 : b.y + b.h + 14 + fbm(i, 2) * 46;
      const lie = lieAt(hole, { x, y: z });
      if (lie === "fairway" || lie === "green" || lie === "tee") continue;
      this.holeGroup.add(makeTree(x, z, 8.4 + (i % 7) * 0.55, groundHeight(hole, x, z), this.pineMat, this.oakMat, this.barkMat));
      n += 1;
    }
  }

  private addHorizon(hole: Hole): void {
    const b = hole.bounds;
    const cx = b.x + b.w / 2;
    const cz = b.y + b.h / 2;
    const radius = Math.hypot(b.w, b.h) * 0.72 + 160;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.02, 14, 48, 1, true), this.horizonMat);
    wall.position.set(cx, 6.5, cz);
    wall.renderOrder = -1;
    this.horizonMat.depthWrite = false;
    this.holeGroup.add(wall);
  }

  private addDunes(hole: Hole): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x857e54, roughness: 0.98 });
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
      new THREE.CylinderGeometry(0.014, 0.018, 1.85, 10),
      new THREE.MeshStandardMaterial({ color: 0xf7f3ec, roughness: 0.28, metalness: 0.08 }),
    );
    pole.position.y = 0.96;
    pole.castShadow = true;
    const ferrule = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8),
      new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.4 }),
    );
    ferrule.position.y = 1.86;
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xc62828, side: THREE.DoubleSide, roughness: 0.46 }),
    );
    flag.position.set(0.33, 1.68, 0);
    const well = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.17, 0.16, 20),
      new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9 }),
    );
    well.position.y = -0.02;
    const liner = new THREE.Mesh(
      new THREE.RingGeometry(0.19, 0.27, 26),
      new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.45, side: THREE.DoubleSide }),
    );
    liner.rotation.x = -Math.PI / 2;
    liner.position.y = 0.018;
    this.pin.add(pole, ferrule, flag, well, liner);
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
      return { x, z, y: groundHeight(hole, x, z) + 0.03 };
    };
    for (let i = -3; i <= 3; i++) {
      const u = (i / 3) * g.rx * 0.84;
      const a = toWorld(u, -g.ry * 0.84);
      const b = toWorld(u, g.ry * 0.84);
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    for (let i = -3; i <= 3; i++) {
      const v = (i / 3) * g.ry * 0.84;
      const a = toWorld(-g.rx * 0.84, v);
      const b = toWorld(g.rx * 0.84, v);
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const br = hole.greenBreak;
    const bl = Math.hypot(br.x, br.y) || 1;
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const o = toWorld((i / 2) * g.rx * 0.55, (j / 2) * g.ry * 0.55);
        const tip = toWorld((i / 2) * g.rx * 0.55 + (br.x / bl) * 1.4, (j / 2) * g.ry * 0.55 + (br.y / bl) * 1.4);
        pts.push(o.x, o.y + 0.01, o.z, tip.x, tip.y + 0.01, tip.z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.grid.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xdce8d0, transparent: true, opacity: 0.2 })));
  }

  private buildGolfer(): void {
    this.golfer.clear();
    const slacks = new THREE.MeshStandardMaterial({ color: 0x1a2420, roughness: 0.78 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.52 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc49a74, roughness: 0.48 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: 0.38 });
    const cap = new THREE.MeshStandardMaterial({ color: 0x243c30, roughness: 0.5 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x222220, roughness: 0.7 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xb0b6bc, roughness: 0.22, metalness: 0.62 });

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.18), slacks);
    hips.position.set(0, 0.84, 0.02);
    const lThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.068, 0.4, 8), slacks);
    lThigh.position.set(-0.1, 0.62, 0.06);
    lThigh.rotation.x = 0.18;
    const rThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.068, 0.4, 8), slacks);
    rThigh.position.set(0.11, 0.62, -0.02);
    rThigh.rotation.x = -0.08;
    const lShin = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.38, 8), slacks);
    lShin.position.set(-0.11, 0.28, 0.1);
    const rShin = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.38, 8), slacks);
    rShin.position.set(0.12, 0.28, 0.02);
    const lFoot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.18), shoe);
    lFoot.position.set(-0.11, 0.07, 0.14);
    const rFoot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.18), shoe);
    rFoot.position.set(0.12, 0.07, 0.06);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.175, 0.46, 10), shirt);
    torso.position.set(0.01, 1.12, 0.06);
    torso.rotation.x = 0.28;
    torso.rotation.z = 0.04;
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.14), shirt);
    shoulders.position.set(0.0, 1.32, 0.1);
    shoulders.rotation.x = 0.22;
    const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.42, 7), shirt);
    lArm.position.set(-0.12, 1.08, 0.22);
    lArm.rotation.x = 1.05;
    lArm.rotation.z = 0.18;
    const rArm = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.4, 7), skin);
    rArm.position.set(0.14, 1.04, 0.24);
    rArm.rotation.x = 0.95;
    rArm.rotation.z = -0.12;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), skin);
    head.position.set(0.02, 1.5, 0.16);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 10, Math.PI), shirt);
    collar.position.set(0.02, 1.36, 0.14);
    collar.rotation.x = 1.2;
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), cap);
    hat.position.set(0.02, 1.56, 0.16);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.014, 0.13), cap);
    brim.position.set(0.02, 1.525, 0.26);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.014, 1.02, 6), steel);
    shaft.position.set(0.08, 0.68, 0.28);
    shaft.rotation.x = 0.18;
    shaft.rotation.z = 0.22;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 6), grip);
    handle.position.set(0.02, 1.08, 0.3);
    handle.rotation.x = 0.18;
    handle.rotation.z = 0.22;
    const headClub = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.045), steel);
    headClub.position.set(0.16, 0.22, 0.32);
    this.golfer.add(hips, lThigh, rThigh, lShin, rShin, lFoot, rFoot, torso, shoulders, collar, lArm, rArm, head, hat, brim, shaft, handle, headClub);
  }

  private placeBall(session: GameSession): void {
    const p = session.ball.pos;
    const gh = groundHeight(session.hole(), p.x, p.y);
    const air = Math.max(session.ball.z, 0);
    this.ball.position.set(p.x, gh + air + BALL_RADIUS, p.y);
    const spin = Math.hypot(session.ball.vel.x, session.ball.vel.y);
    this.ball.rotation.x += (air > 0.15 ? 0.12 : spin * 0.02);
    this.shadow.position.set(p.x, gh + 0.018, p.y);
    this.softShadow.position.set(p.x, gh + 0.012, p.y);
    const tight = Math.max(0.07, 0.18 - air * 0.007);
    this.shadow.scale.setScalar(tight);
    this.softShadow.scale.setScalar(Math.max(0.35, 1.15 - air * 0.03));
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = air > 12 ? 0.04 : 0.2;
    (this.softShadow.material as THREE.MeshBasicMaterial).opacity = air > 12 ? 0.02 : 0.1;
    const halo = this.halo.material as THREE.MeshBasicMaterial;
    halo.opacity = air > 1.4 ? Math.min(0.42, 0.1 + air * 0.016) : 0.03;
    const marker = this.ball.getObjectByName("air-marker") as THREE.Sprite | undefined;
    if (marker) {
      const mat = marker.material as THREE.SpriteMaterial;
      mat.opacity = air > 2 ? Math.min(0.62, 0.18 + air * 0.016) : 0;
      const s = 0.24 + Math.min(0.4, air * 0.014);
      marker.scale.set(s, s, 1);
    }
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
    const back = fromAngle(aim + Math.PI, view === "putt" ? 1.45 : 1.15);
    const left = fromAngle(aim - Math.PI / 2, view === "putt" ? 0.86 : 0.22);
    this.golfer.position.set(p.x + back.x + left.x, groundHeight(hole, p.x, p.y), p.y + back.y + left.y);
    this.golfer.rotation.y = -aim + Math.PI / 2;
    this.golfer.scale.setScalar(view === "putt" ? 0.92 : 1.08);
  }

  private updatePath(session: GameSession): void {
    const aiming = session.swingPhase === "aim" || session.swingPhase === "power" || session.swingPhase === "accuracy";
    const flying = session.swingPhase === "flight" || session.swingPhase === "settle";
    let path: FlightSample[] = [];
    if (aiming && session.screen === "play") path = session.previewFlight();
    else if (flying) path = session.shotArc;
    const show = session.screen === "play" && path.length > 1;
    this.groundLine.visible = show && aiming;
    this.landing.visible = show && aiming && session.club().id !== "putter";
    if (this.flightMesh) this.flightMesh.visible = show && aiming && session.club().id !== "putter";
    if (!show) return;
    const shape = session.swingPhase === "flight" || session.swingPhase === "settle" ? Math.sign(session.ball.curve) : session.shape;
    this.flightMat.color.set(shape > 0.2 ? 0x7ec8ff : shape < -0.2 ? 0xff9a4a : 0xffe27a);
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
      const radius = session.club().id === "putter" ? 0.012 : 0.028;
      this.setFlightTube(pts, radius);
    }
    const warn = nearOb(hole, last.pos) || lieAt(hole, last.pos) === "ob";
    this.landing.position.set(last.pos.x, groundHeight(hole, last.pos.x, last.pos.y) + 0.05, last.pos.y);
    (this.landing.material as THREE.MeshBasicMaterial).color.set(warn ? 0xc62828 : 0xf0d78a);
  }

  private updateTrail(session: GameSession): void {
    const flying = session.swingPhase === "flight" || session.swingPhase === "settle";
    const show = session.screen === "play" && flying && session.ball.z > 0.2;
    this.trail.visible = show;
    this.trailGlow.visible = show;
    if (!show) {
      this.trailCount = 0;
      this.ribbon.visible = false;
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
    setLine(this.trailGlow, this.trailCount);
    this.updateRibbon();
  }

  private updateRibbon(): void {
    const n = this.trailCount;
    this.ribbon.visible = n > 2;
    if (n < 3) return;
    const pos = this.ribbonGeo.getAttribute("position") as THREE.BufferAttribute;
    const half = 0.11;
    for (let i = 0; i < n; i++) {
      const x = this.trailPos[i * 3];
      const y = this.trailPos[i * 3 + 1];
      const z = this.trailPos[i * 3 + 2];
      let dx = 0;
      let dz = 1;
      if (i < n - 1) {
        dx = this.trailPos[(i + 1) * 3] - x;
        dz = this.trailPos[(i + 1) * 3 + 2] - z;
      } else {
        dx = x - this.trailPos[(i - 1) * 3];
        dz = z - this.trailPos[(i - 1) * 3 + 2];
      }
      const len = Math.hypot(dx, dz) || 1;
      const px = (-dz / len) * half;
      const pz = (dx / len) * half;
      const fade = 0.45 + 0.55 * (i / Math.max(n - 1, 1));
      pos.setXYZ(i * 2, x - px, y, z - pz);
      pos.setXYZ(i * 2 + 1, x + px * fade, y + 0.02, z + pz * fade);
    }
    pos.needsUpdate = true;
    this.ribbonGeo.setDrawRange(0, Math.max(0, n - 1) * 6);
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
      const back = fromAngle(aim + Math.PI, 4.4 + Math.min(5.4, pinDist * 0.22));
      const side = fromAngle(aim + Math.PI / 2, 0.55);
      desired.set(ball.x + back.x + side.x, bh + 1.42 + Math.min(0.85, pinDist * 0.04), ball.y + back.y + side.y);
      look.set(ball.x * 0.38 + pin.x * 0.62, groundHeight(hole, pin.x, pin.y) + 0.1, ball.y * 0.38 + pin.y * 0.62);
      fov = 48;
    } else if (view === "follow") {
      const v = session.ball.vel;
      const heading = Math.hypot(v.x, v.y) > 0.35 ? Math.atan2(v.y, v.x) : session.aim;
      const landing = session.shotArc[session.shotArc.length - 1];
      const back = fromAngle(heading + Math.PI, 18);
      const curve = session.ball.curve || session.shape * 24;
      const side = fromAngle(heading + Math.PI / 2, -Math.max(-1, Math.min(1, curve / 24)) * 3.4);
      desired.set(ball.x + back.x + side.x, 7.6, ball.y + back.y + side.y);
      const toLand = landing ? Math.hypot(landing.pos.x - ball.x, landing.pos.y - ball.y) : 40;
      const ahead = Math.min(64, Math.max(22, toLand * 0.5));
      look.set(ball.x + Math.cos(heading) * ahead, 0.55, ball.y + Math.sin(heading) * ahead);
      fov = 46;
    } else {
      const back = fromAngle(aim + Math.PI, 6.05);
      const side = fromAngle(aim + Math.PI / 2, 1.12);
      desired.set(ball.x + back.x + side.x, bh + 1.68, ball.y + back.y + side.y);
      look.set(ball.x + Math.cos(aim) * 58, 0.7, ball.y + Math.sin(aim) * 58);
      fov = 50;
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
    const shade = 1 - dent * 0.2;
    colors[i * 3] = 0.995 * shade;
    colors[i * 3 + 1] = 0.99 * shade;
    colors[i * 3 + 2] = 0.97 * shade;
  }
  pos.needsUpdate = true;
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export function golferMeshCount(): number {
  return 18;
}

function makeSky(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(2800, 64, 36),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
}

function makeCutoutMat(canvas: HTMLCanvasElement): THREE.MeshStandardMaterial {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    alphaTest: 0.22,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
    depthWrite: true,
  });
}

function attachDetailMap(mat: THREE.MeshStandardMaterial, tex: THREE.Texture, scale: number): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: tex };
    shader.uniforms.uDetailScale = { value: scale };
    shader.fragmentShader = `uniform sampler2D uDetail;\nuniform float uDetailScale;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       vec3 detail = texture2D(uDetail, vMapUv * uDetailScale).rgb;
       diffuseColor.rgb *= mix(vec3(1.0), detail * 1.15, 0.48);`,
    );
  };
  mat.customProgramCacheKey = () => `turf-detail-${scale}`;
}

function makeGrassDetailTex(): THREE.CanvasTexture {
  const tile = grassTile("ptg-grass-detail", ["#355224", "#4a6e30", "#2a3f1c", "#6a8a3c", "#1e3014", "#587838"], 256, 5200);
  const tex = new THREE.CanvasTexture(tile);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function makeSandCard(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#d7b57a";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const y = (i / 90) * 256;
    ctx.strokeStyle = `rgba(${160 + (i % 5) * 8},${120 + (i % 4) * 6},70,${0.08 + (i % 3) * 0.04})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(128, y + Math.sin(i * 0.7) * 8, 256, y + Math.cos(i * 0.5) * 6);
    ctx.stroke();
  }
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = i % 3 === 0 ? "#c9a468" : i % 3 === 1 ? "#e8d09a" : "#b89058";
    ctx.fillRect(hashNoise(i, 2) * 256, hashNoise(i, 7) * 256, 1.2, 1.2);
  }
  return c;
}

function makeSoftShadowCard(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(0,0,0,0.45)");
  g.addColorStop(0.35, "rgba(0,0,0,0.18)");
  g.addColorStop(0.7, "rgba(0,0,0,0.05)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

function stampClump(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rgb: [number, number, number], seed: number): void {
  ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  ctx.beginPath();
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const j = 0.72 + hashNoise(seed + i, x * 0.1) * 0.5;
    const px = x + Math.cos(a) * rx * j;
    const py = y + Math.sin(a) * ry * j;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function makeDiscSprite(): HTMLCanvasElement {
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

function makePineCard(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 420;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.clearRect(0, 0, 320, 420);
  ctx.fillStyle = "#4a3828";
  ctx.fillRect(148, 280, 22, 130);
  ctx.fillStyle = "#3a2c20";
  ctx.fillRect(154, 280, 6, 130);
  const tones: Array<[number, number, number]> = [
    [22, 52, 28],
    [36, 72, 38],
    [18, 40, 22],
    [48, 86, 44],
    [28, 60, 32],
  ];
  for (let row = 0; row < 7; row++) {
    const y = 36 + row * 38;
    const spread = 28 + row * 14;
    const count = 5 + row;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const x = 160 + (t - 0.5) * spread * 2;
      const tone = tones[(row + i) % tones.length];
      stampClump(ctx, x, y + hashNoise(row, i) * 10, 16 + row * 1.4, 14 + row, tone, row * 10 + i);
    }
  }
  ctx.fillStyle = "rgba(200,220,150,0.12)";
  stampClump(ctx, 148, 70, 22, 18, [70, 110, 60], 99);
  return c;
}

function makeOakCard(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 360;
  c.height = 360;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.clearRect(0, 0, 360, 360);
  ctx.fillStyle = "#4a3828";
  ctx.beginPath();
  ctx.moveTo(168, 188);
  ctx.lineTo(198, 188);
  ctx.lineTo(210, 348);
  ctx.lineTo(154, 348);
  ctx.closePath();
  ctx.fill();
  const clumps: Array<[number, number, number, number, [number, number, number], number]> = [
    [180, 120, 78, 64, [28, 58, 32], 1],
    [128, 140, 58, 48, [40, 74, 40], 2],
    [230, 136, 62, 50, [22, 48, 26], 3],
    [160, 88, 52, 42, [52, 90, 48], 4],
    [208, 92, 48, 38, [24, 44, 24], 5],
    [140, 178, 50, 34, [34, 62, 34], 6],
    [220, 176, 48, 32, [18, 40, 22], 7],
    [180, 158, 44, 30, [60, 98, 52], 8],
    [112, 168, 36, 28, [30, 54, 30], 9],
    [248, 160, 34, 26, [26, 50, 28], 10],
  ];
  for (const [x, y, rx, ry, rgb, seed] of clumps) stampClump(ctx, x, y, rx, ry, rgb, seed);
  return c;
}

function makeHorizonCard(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 512;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.clearRect(0, 0, 2048, 512);
  for (let i = 0; i < 48; i++) {
    const x = 16 + (i / 48) * 2048;
    const h = 150 + hashNoise(i, 1) * 140;
    const w = 28 + hashNoise(i, 3) * 34;
    const oak = hashNoise(i, 8) > 0.45;
    if (oak) {
      stampClump(ctx, x, 512 - h * 0.42, w, h * 0.38, i % 2 === 0 ? [24, 48, 28] : [18, 38, 22], i);
      ctx.fillStyle = "#3a2c20";
      ctx.fillRect(x - 4, 512 - h * 0.28, 8, h * 0.28);
    } else {
      for (let row = 0; row < 4; row++) {
        stampClump(
          ctx,
          x + (hashNoise(i, row) - 0.5) * 10,
          512 - h + row * (h * 0.18),
          w * (0.45 + row * 0.14),
          22,
          row % 2 === 0 ? [20, 42, 24] : [30, 58, 32],
          i * 4 + row,
        );
      }
    }
  }
  return c;
}

function makeBarkCard(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#4a3828";
  ctx.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#3a2c20" : "#5a4634";
    ctx.fillRect(hashNoise(i, 1) * 64, i * 3, 2 + hashNoise(i, 2) * 4, 18);
  }
  return c;
}

function bakeTurfMaps(hole: Hole, ox: number, oz: number, tw: number, th: number): {
  albedo: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
} {
  const w = 1024;
  const h = 1024;
  const color = document.createElement("canvas");
  color.width = w;
  color.height = h;
  const rough = document.createElement("canvas");
  rough.width = w;
  rough.height = h;
  const norm = document.createElement("canvas");
  norm.width = w;
  norm.height = h;
  const cctx = color.getContext("2d");
  const rctx = rough.getContext("2d");
  const nctx = norm.getContext("2d");
  if (!cctx || !rctx || !nctx) {
    return {
      albedo: new THREE.CanvasTexture(color),
      rough: new THREE.CanvasTexture(rough),
      normal: new THREE.CanvasTexture(norm),
    };
  }
  const cimg = cctx.createImageData(w, h);
  const rimg = rctx.createImageData(w, h);
  const nimg = nctx.createImageData(w, h);
  const heightAt = (x: number, z: number) => {
    const lie = lieAt(hole, { x, y: z });
    const n = fbm(x * 0.22, z * 0.22);
    const micro = hashNoise(x * 6.4, z * 6.4);
    if (lie === "green") return n * 0.08 + micro * 0.04;
    if (lie === "fairway" || lie === "tee") return n * 0.16 + micro * 0.12;
    if (lie === "rough") return n * 0.34 + micro * 0.22;
    if (lie === "bunker") return n * 0.2;
    return n * 0.28;
  };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = ox + (i / (w - 1)) * tw;
      const z = oz + (j / (h - 1)) * th;
      const lie = lieAt(hole, { x, y: z });
      const n = fbm(x * 0.18, z * 0.18);
      const micro = hashNoise(x * 7.2, z * 7.2);
      const clump = fbm(x * 0.55, z * 0.55);
      const stripe = 0.5 + 0.5 * Math.sin(x * 0.32 + z * 0.045);
      const wet = Math.max(0, 0.55 - fbm(x * 0.09 + 3, z * 0.09));
      let r = 0.48;
      let g = 0.42;
      let b = 0.26;
      let rk = 0.92;
      if (lie === "green") {
        const nap = 0.82 + stripe * 0.22;
        r = (0.1 + micro * 0.03) * nap;
        g = (0.32 + n * 0.04) * nap;
        b = (0.22 + micro * 0.02) * nap;
        rk = 0.52 + wet * 0.18;
      } else if (lie === "fairway") {
        const sheen = 0.7 + stripe * 0.36 + n * 0.06;
        r = (0.2 + micro * 0.06) * sheen;
        g = (0.38 + micro * 0.05) * sheen;
        b = (0.12 + micro * 0.03) * sheen;
        rk = 0.66 + wet * 0.12 + clump * 0.08;
      } else if (lie === "tee") {
        r = 0.18 + n * 0.03 + micro * 0.04;
        g = 0.4 + n * 0.04 + stripe * 0.06;
        b = 0.14;
        rk = 0.6;
      } else if (lie === "rough") {
        r = 0.16 + n * 0.07 + clump * 0.06 + micro * 0.04;
        g = 0.2 + n * 0.05 + micro * 0.03;
        b = 0.08 + n * 0.02;
        rk = 0.93;
      } else if (lie === "bunker") {
        r = 0.72 + n * 0.1 + micro * 0.08;
        g = 0.58 + n * 0.07 + micro * 0.04;
        b = 0.32 + n * 0.03;
        rk = 0.96;
      } else if (lie === "water") {
        r = 0.06;
        g = 0.22;
        b = 0.3;
        rk = 0.1;
      } else {
        r = 0.48 + n * 0.1;
        g = 0.42 + n * 0.06;
        b = 0.25 + n * 0.04;
        rk = 0.96;
      }
      const idx = (j * w + i) * 4;
      cimg.data[idx] = Math.round(r * 255);
      cimg.data[idx + 1] = Math.round(g * 255);
      cimg.data[idx + 2] = Math.round(b * 255);
      cimg.data[idx + 3] = 255;
      const rv = Math.round(rk * 255);
      rimg.data[idx] = rv;
      rimg.data[idx + 1] = rv;
      rimg.data[idx + 2] = rv;
      rimg.data[idx + 3] = 255;
      const eps = tw / w;
      const [nx, ny, nz] = heightToNormal(heightAt(x - eps, z), heightAt(x + eps, z), heightAt(x, z - eps), heightAt(x, z + eps), lie === "green" ? 2.4 : 1.5);
      const packed = packNormalRgb(nx, ny, nz);
      nimg.data[idx] = Math.round(packed[0] * 255);
      nimg.data[idx + 1] = Math.round(packed[1] * 255);
      nimg.data[idx + 2] = Math.round(packed[2] * 255);
      nimg.data[idx + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  nctx.putImageData(nimg, 0, 0);
  const albedo = new THREE.CanvasTexture(color);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.flipY = false;
  albedo.anisotropy = 8;
  albedo.needsUpdate = true;
  const roughTex = new THREE.CanvasTexture(rough);
  roughTex.flipY = false;
  roughTex.needsUpdate = true;
  const normal = new THREE.CanvasTexture(norm);
  normal.flipY = false;
  normal.needsUpdate = true;
  return { albedo, rough: roughTex, normal };
}

function makeTree(
  x: number,
  z: number,
  r: number,
  ground: number,
  pineMat: THREE.MeshStandardMaterial,
  oakMat: THREE.MeshStandardMaterial,
  bark: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group();
  const pine = fbm(x * 0.17, z * 0.17) > 0.34;
  const foliage = pine ? pineMat : oakMat;
  const h = pine ? 13.5 + (r - 7) * 0.95 : 10.2 + (r - 7) * 0.62;
  const w = pine ? r * 1.15 : r * 1.55;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(pine ? 0.16 : 0.22, pine ? 0.34 : 0.42, h * (pine ? 0.62 : 0.48), 8),
    bark,
  );
  trunk.position.y = h * (pine ? 0.3 : 0.24);
  trunk.castShadow = false;
  group.add(trunk);
  for (let i = 0; i < 4; i++) {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(w * (0.92 + (i % 2) * 0.12), h * (0.9 + (i % 3) * 0.05)), foliage);
    card.position.y = h * (0.5 + (i % 2) * 0.04);
    card.position.x = (fbm(x + i, z) - 0.5) * 0.8;
    card.rotation.y = (i / 4) * Math.PI + fbm(x, i) * 0.2;
    card.castShadow = false;
    group.add(card);
  }
  group.position.set(x, ground, z);
  group.rotation.y = fbm(x, z) * Math.PI * 2;
  group.scale.y = 0.92 + fbm(z, x) * 0.22;
  return group;
}

function makeBush(x: number, z: number, r: number, ground: number, foliage: THREE.MeshStandardMaterial): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.4, r * 0.9), foliage);
    card.position.set((i % 2 === 0 ? 0.2 : -0.2) * r, r * 0.35, (i < 2 ? 0.15 : -0.15) * r);
    card.rotation.y = i * 0.9;
    group.add(card);
  }
  group.position.set(x, ground, z);
  return group;
}

function makeLine(data: Float32Array, color: number): THREE.Line {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(data, 3));
  geo.setDrawRange(0, 0);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.36 }));
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
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ""}` : String(err);
    console.error("[ptg] 3D init failed", err);
    (window as unknown as { __ptg3dError?: string }).__ptg3dError = message;
    return null;
  }
}
