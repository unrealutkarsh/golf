import * as THREE from "three";
import { lieAt, nearOb } from "./course";
import { buildFringeBladeField, buildGreenBladeField, createBladeMaterial, createFringeBladeMaterial, updateFringeBladeLod, updateGreenBladeLod } from "./blades";
import { addCourseFoliage, createFoliageKit, type FoliageKit } from "./foliage";
import type { GameSession } from "./game";
import { buildAddressGolfer, golferMeshCount as countGolferMeshes, poseGolferClub, snapGolferToBall } from "./golfer";
import { hashNoise } from "./look";
import { dist, fromAngle, type Vec2 } from "./math";
import type { FlightSample } from "./physics";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { applyNapUniforms, bakeTurfMaps, buildGreenOverlay, createGreenMaterial, createTurfMaterial, makeGrassDetailNormal, makeGrassDetailTex } from "./turf";
import { groundHeight, isPuttingSituation, resolveCamView, surfaceColor, type ResolvedCam } from "./terrain";
import type { Hole } from "./types";

const MAX_PATH = 140;
const TRAIL_LEN = 80;
const BALL_RADIUS = 0.11;

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
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
    vec3 zenith = vec3(0.10, 0.38, 0.86);
    vec3 mid = vec3(0.36, 0.64, 0.96);
    vec3 horizon = vec3(0.70, 0.84, 0.96);
    vec3 ground = vec3(0.16, 0.28, 0.22);
    vec3 col = mix(ground, horizon, smoothstep(-0.18, 0.04, h));
    col = mix(col, mid, smoothstep(0.02, 0.38, h));
    col = mix(col, zenith, smoothstep(0.28, 0.94, h));
    float haze = pow(1.0 - clamp(h * 1.12 + 0.02, 0.0, 1.0), 1.65);
    col = mix(col, vec3(0.74, 0.86, 0.96), haze * 0.22);
    vec3 sunD = normalize(vec3(0.48, 0.72, 0.18));
    float glow = pow(max(dot(dir, sunD), 0.0), 18.0);
    float wash = pow(max(dot(dir, sunD), 0.0), 3.4);
    col += vec3(1.0, 0.94, 0.78) * glow * 0.55;
    col += vec3(1.0, 0.93, 0.80) * wash * 0.12;
    vec2 cuv = dir.xz / max(abs(h) + 0.32, 0.18);
    float cloud = fbm(cuv * 0.48 + vec2(0.22, 0.08));
    float wisps = fbm(cuv * 1.35 + 5.2);
    float mask = smoothstep(0.10, 0.36, h) * smoothstep(0.88, 0.28, h);
    float banks = smoothstep(0.56, 0.82, cloud + wisps * 0.18) * mask;
    float lit = 0.82 + 0.18 * max(dot(dir, sunD), 0.0);
    col = mix(col, vec3(0.96, 0.97, 0.98) * lit, banks * 0.42);
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
  private foliageKit: FoliageKit;
  private greenMat: THREE.MeshPhysicalMaterial;
  private bladeMat: THREE.MeshStandardMaterial;
  private fringeMat: THREE.MeshStandardMaterial;
  private greenBlades: THREE.InstancedMesh | null = null;
  private fringeBlades: THREE.InstancedMesh | null = null;
  private waterTime = { value: 0 };
  private ribbon: THREE.Mesh;
  private ribbonGeo: THREE.BufferGeometry;
  private time = 0;
  private w = 1;
  private h = 1;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x6aa0d4, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const software = isSoftwareGL(this.renderer);
    this.renderer.toneMapping = software ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = software ? 1.28 : 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xa8cce8, 1600, 5600);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.12, 6800);
    this.scene.add(this.holeGroup);
    this.sky = makeSky();
    this.scene.add(this.sky);

    this.scene.add(new THREE.AmbientLight(software ? 0xc8d4c8 : 0xb0c4dc, software ? 0.78 : 0.2));
    const hemi = new THREE.HemisphereLight(software ? 0xd8e8d4 : 0xd4ecff, software ? 0x3a6a28 : 0x1e3014, software ? 1.22 : 0.7);
    this.scene.add(hemi);
    const fill = new THREE.DirectionalLight(software ? 0xc4d8b8 : 0xc8d8f4, software ? 0.36 : 0.2);
    fill.position.set(-90, 48, 70);
    this.scene.add(fill);
    const bounce = new THREE.DirectionalLight(software ? 0x5a7a3c : 0x3e5c2a, software ? 0.14 : 0.12);
    bounce.position.set(40, 12, -30);
    this.scene.add(bounce);
    const wrap = new THREE.DirectionalLight(0xffe2b8, software ? 0.08 : 0.22);
    wrap.position.set(70, 28, 40);
    this.scene.add(wrap);
    this.sun = new THREE.DirectionalLight(0xfff1cc, software ? 1.55 : 1.78);
    this.sun.castShadow = true;
    const map = software ? 1024 : 4096;
    this.sun.shadow.mapSize.set(map, map);
    this.sun.shadow.bias = -0.00016;
    this.sun.shadow.normalBias = 0.14;
    this.sun.shadow.radius = software ? 6 : 24;
    this.sun.shadow.camera.near = 6;
    this.sun.shadow.camera.far = 520;
    this.sun.shadow.camera.left = -140;
    this.sun.shadow.camera.right = 140;
    this.sun.shadow.camera.top = 120;
    this.sun.shadow.camera.bottom = -120;
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

    const detail = makeGrassDetailTex();
    const detailN = makeGrassDetailNormal();
    this.turfMat = createTurfMaterial(detail, detailN);
    this.greenMat = createGreenMaterial(detail, detailN);
    this.bladeMat = createBladeMaterial();
    this.fringeMat = createFringeBladeMaterial();
    this.foliageKit = createFoliageKit();

    const puttGeo = new THREE.BufferGeometry();
    puttGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    this.puttAim = new THREE.Line(puttGeo, new THREE.LineBasicMaterial({ color: 0xf2e4b0, transparent: true, opacity: 0.42 }));
    this.scene.add(this.puttAim);

    this.ball = new THREE.Mesh(
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
        envMapIntensity: 1.15,
        vertexColors: true,
      }),
    );
    const ballMat = this.ball.material as THREE.MeshPhysicalMaterial;
    ballMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
         roughnessFactor = clamp(mix(0.07, 0.46, 1.0 - diffuseColor.r), 0.05, 0.7);`,
      );
    };
    ballMat.customProgramCacheKey = () => "ptg-ball-dimple-v1";
    this.ball.castShadow = true;
    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS * 1.55, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false }),
    );
    this.ball.add(this.halo);
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
    this.ball.add(marker);
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
    this.ball.add(outline);
    this.scene.add(this.ball);

    const softMap = new THREE.CanvasTexture(makeSoftShadowCard());
    this.shadow = new THREE.Mesh(
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
    this.shadow.rotation.x = -Math.PI / 2;
    this.softShadow = new THREE.Mesh(
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
    (this.trail.material as THREE.LineBasicMaterial).opacity = 1;
    this.trailGlow = makeLine(this.trailPos, 0xffd078);
    (this.trailGlow.material as THREE.LineBasicMaterial).opacity = 0.78;
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
        color: 0xfff8e0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.ribbon.visible = false;
    this.scene.add(this.ribbon);

    this.scene.add(this.pin, this.golfer, this.grid);
    this.buildGolfer();
    this.resize();
    if (!software) this.initComposer();
    window.addEventListener("resize", () => this.resize());
  }

  private initComposer(): void {
    try {
      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(this.w, this.h), 0.16, 0.42, 0.74);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      this.composer = composer;
      this.bloom = bloom;
    } catch (err) {
      console.warn("[ptg] post FX skip", err);
      this.composer = null;
    }
  }

  resize(): void {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.camera.aspect = this.w / Math.max(this.h, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.w, this.h, false);
    this.renderer.domElement.style.width = `${this.w}px`;
    this.renderer.domElement.style.height = `${this.h}px`;
    this.composer?.setSize(this.w, this.h);
    this.bloom?.setSize(this.w, this.h);
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
    this.waterTime.value = this.time;
    const camDist = this.camera.position.distanceTo(this.ball.position);
    const play = session.screen === "play";
    updateGreenBladeLod(this.greenBlades, putting && play, camDist);
    updateFringeBladeLod(this.fringeBlades, play && (putting || camDist < 26), camDist);
  }

  render(): void {
    this.sky.position.copy(this.camera.position);
    try {
      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    } catch {
      this.composer = null;
      this.renderer.render(this.scene, this.camera);
    }
  }

  private rebuildHole(hole: Hole, index: number): void {
    this.builtHole = index;
    this.holeGroup.clear();
    this.terrain = null;
    if (this.albedoTex) this.albedoTex.dispose();
    if (this.roughTex) this.roughTex.dispose();
    if (this.normalTex) this.normalTex.dispose();
    this.albedoTex = this.roughTex = this.normalTex = null;
    this.greenBlades = null;
    this.fringeBlades = null;
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
      const grain = 0.98 + 0.04 * hashNoise(x * 2.1, z * 2.1);
      const boost = lie === "green" ? 1.02 * grain : lie === "fairway" || lie === "tee" ? 1.06 * grain : 0.96;
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
    this.turfMat.normalScale.set(1.35, 1.35);
    this.turfMat.vertexColors = true;
    this.turfMat.needsUpdate = true;
    applyNapUniforms(this.turfMat, hole);
    const terrain = new THREE.Mesh(geo, this.turfMat);
    terrain.receiveShadow = true;
    this.terrain = terrain;
    this.holeGroup.add(terrain);
    this.holeGroup.add(buildGreenOverlay(hole, this.greenMat));
    this.greenBlades = buildGreenBladeField(hole, this.bladeMat);
    this.fringeBlades = buildFringeBladeField(hole, this.fringeMat);
    this.holeGroup.add(this.greenBlades, this.fringeBlades);

    this.addRollingCountry(hole, cx, cz);
    this.addWater(hole);
    this.addBunkerLips(hole);
    addCourseFoliage(this.holeGroup, this.foliageKit, hole, { lite: isSoftwareGL(this.renderer) });
    this.buildPin();
    this.buildGrid(hole);

    this.sun.position.set(cx + 160, 128, cz - 180);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.target.updateMatrixWorld();
  }

  private addWater(hole: Hole): void {
    const mat = createWaterMaterial(this.waterTime);
    for (const poly of hole.water) {
      if (poly.length < 3) continue;
      const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)));
      const geo = new THREE.ShapeGeometry(shape, 40);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = -0.14;
      mesh.receiveShadow = true;
      this.holeGroup.add(mesh);
    }
  }

  private addBunkerLips(hole: Hole): void {
    const sandMap = new THREE.CanvasTexture(makeSandCard());
    sandMap.wrapS = sandMap.wrapT = THREE.RepeatWrapping;
    sandMap.repeat.set(3.4, 3.4);
    sandMap.colorSpace = THREE.SRGBColorSpace;
    const sand = new THREE.MeshStandardMaterial({
      map: sandMap,
      color: 0xe4c894,
      roughness: 0.92,
      metalness: 0,
      envMapIntensity: 0.12,
    });
    const lip = new THREE.MeshStandardMaterial({ color: 0x7a7c50, roughness: 0.96 });
    const profile = [
      new THREE.Vector2(0, -0.34),
      new THREE.Vector2(0.22, -0.3),
      new THREE.Vector2(0.48, -0.2),
      new THREE.Vector2(0.7, -0.08),
      new THREE.Vector2(0.86, 0.02),
      new THREE.Vector2(0.96, 0.07),
      new THREE.Vector2(1.04, 0.05),
    ];
    for (const bunker of hole.bunkers) {
      const y = groundHeight(hole, bunker.cx, bunker.cy);
      const dish = new THREE.LatheGeometry(profile, 80);
      const pos = dish.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vz = pos.getZ(i);
        const a = Math.atan2(vz, vx);
        const jitter = 1 + Math.sin(a * 3.1 + bunker.cx) * 0.11 + Math.sin(a * 7.4 + bunker.cy) * 0.06 + (hashNoise(a * 5, bunker.cy) - 0.5) * 0.08;
        pos.setX(i, vx * jitter);
        pos.setZ(i, vz * jitter);
      }
      dish.computeVertexNormals();
      const bowl = new THREE.Mesh(dish, sand);
      bowl.scale.set(bunker.rx, 1, bunker.ry);
      bowl.rotation.y = bunker.rotation;
      bowl.position.set(bunker.cx, y + 0.06, bunker.cy);
      bowl.receiveShadow = true;
      const lobe = new THREE.Mesh(dish.clone(), sand);
      const ox = Math.cos(bunker.rotation) * bunker.rx * 0.22;
      const oz = Math.sin(bunker.rotation) * bunker.ry * 0.18;
      lobe.scale.set(bunker.rx * 0.62, 0.85, bunker.ry * 0.7);
      lobe.rotation.y = bunker.rotation + 0.4;
      lobe.position.set(bunker.cx + ox, y + 0.04, bunker.cy + oz);
      lobe.receiveShadow = true;
      const rimGeo = new THREE.TorusGeometry(1, 0.07, 10, 64);
      const rimPos = rimGeo.attributes.position;
      for (let i = 0; i < rimPos.count; i++) {
        const j = 1 + (hashNoise(i * 0.3, bunker.cx) - 0.5) * 0.12;
        rimPos.setX(i, rimPos.getX(i) * j);
        rimPos.setY(i, rimPos.getY(i) * j);
      }
      rimGeo.computeVertexNormals();
      const rim = new THREE.Mesh(rimGeo, lip);
      rim.scale.set(bunker.rx * 0.96, bunker.ry * 0.96, 0.7);
      rim.rotation.x = Math.PI / 2;
      rim.rotation.z = bunker.rotation;
      rim.position.set(bunker.cx, y + 0.1, bunker.cy);
      const collarGeo = new THREE.RingGeometry(0.92, 1.28, 64);
      const cpos = collarGeo.attributes.position;
      for (let i = 0; i < cpos.count; i++) {
        const j = 1 + (hashNoise(i, bunker.cy) - 0.5) * 0.1;
        cpos.setX(i, cpos.getX(i) * j);
        cpos.setY(i, cpos.getY(i) * j);
      }
      const collar = new THREE.Mesh(collarGeo, lip);
      collar.scale.set(bunker.rx, bunker.ry, 1);
      collar.rotation.x = -Math.PI / 2;
      collar.rotation.z = bunker.rotation;
      collar.position.set(bunker.cx, y + 0.07, bunker.cy);
      this.holeGroup.add(bowl, lobe, rim, collar);
    }
  }

  private addRollingCountry(hole: Hole, cx: number, cz: number): void {
    const grass = new THREE.MeshStandardMaterial({
      color: 0x2e4a22,
      roughness: 0.98,
      emissive: new THREE.Color(0x0a1408),
      emissiveIntensity: 0.012,
    });
    const far = new THREE.Mesh(new THREE.PlaneGeometry(4600, 4600, 80, 80), grass);
    far.rotation.x = -Math.PI / 2;
    const pos = far.geometry.attributes.position;
    const b = hole.bounds;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getY(i);
      const x = lx + cx;
      const z = lz + cz;
      const inPlay = x > b.x - 40 && x < b.x + b.w + 40 && z > b.y - 40 && z < b.y + b.h + 40;
      const dune = hashNoise(x * 0.008, z * 0.008) * 14 + hashNoise(x * 0.02, z * 0.02) * 6;
      pos.setZ(i, inPlay ? -2.4 : -1.8 + dune);
    }
    far.geometry.computeVertexNormals();
    far.position.set(cx, 0, cz);
    far.receiveShadow = true;
    this.holeGroup.add(far);
    const spots = [
      [b.x - 380, b.y - 340, 110, 0.1],
      [b.x + b.w + 360, b.y + 80, 120, 0.09],
      [b.x + 60, b.y - 460, 104, 0.08],
      [b.x + b.w * 0.55, b.y + b.h + 400, 130, 0.1],
      [b.x - 280, b.y + b.h + 320, 96, 0.09],
      [cx + 620, cz + 520, 150, 0.08],
      [cx - 660, cz - 500, 140, 0.08],
      [cx + 420, cz - 600, 160, 0.07],
    ];
    for (const [x, z, r, sy] of spots) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), grass);
      hill.scale.set(1 + hashNoise(x, z) * 0.22, sy, 0.85 + hashNoise(z, x) * 0.28);
      hill.position.set(x, r * sy * 0.05, z);
      hill.receiveShadow = true;
      this.holeGroup.add(hill);
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
    this.golfer.add(buildAddressGolfer());
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
    const tight = Math.max(0.1, 0.26 - air * 0.008);
    this.shadow.scale.setScalar(tight);
    this.softShadow.scale.setScalar(Math.max(0.55, 1.55 - air * 0.04));
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = air > 12 ? 0.02 : 0.07;
    (this.softShadow.material as THREE.MeshBasicMaterial).opacity = air > 12 ? 0.01 : 0.045;
    const halo = this.halo.material as THREE.MeshBasicMaterial;
    halo.opacity = air > 1.2 ? Math.min(0.72, 0.22 + air * 0.028) : 0.05;
    const marker = this.ball.getObjectByName("air-marker") as THREE.Sprite | undefined;
    if (marker) {
      const mat = marker.material as THREE.SpriteMaterial;
      mat.opacity = air > 1.2 ? Math.min(0.92, 0.4 + air * 0.028) : 0;
      const s = 0.38 + Math.min(0.72, air * 0.022);
      marker.scale.set(s, s, 1);
    }
    const outline = this.ball.getObjectByName("air-outline") as THREE.Sprite | undefined;
    if (outline) {
      const mat = outline.material as THREE.SpriteMaterial;
      mat.opacity = air > 1.2 ? Math.min(0.55, 0.22 + air * 0.012) : 0;
      const s = 0.58 + Math.min(0.95, air * 0.03);
      outline.scale.set(s, s, 1);
    }
  }

  private placePin(hole: Hole): void {
    this.pin.position.set(hole.pin.x, groundHeight(hole, hole.pin.x, hole.pin.y), hole.pin.y);
  }

  private placeGolfer(session: GameSession, view: ResolvedCam): void {
    const flying = session.swingPhase === "flight" || session.swingPhase === "settle";
    this.golfer.visible = session.screen === "play" && !flying;
    if (!this.golfer.visible) return;
    poseGolferClub(this.golfer, session.club().id);
    const p = session.ball.pos;
    const hole = session.hole();
    const aim = view === "putt" ? Math.atan2(hole.pin.y - p.y, hole.pin.x - p.x) : session.aim;
    snapGolferToBall(this.golfer, p.x, groundHeight(hole, p.x, p.y), p.y, aim);
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
    if (this.flightMesh) this.flightMesh.visible = false;
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
    const half = 0.16;
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
      const back = fromAngle(aim + Math.PI, 3.9 + Math.min(2.2, pinDist * 0.18));
      const side = fromAngle(aim + Math.PI / 2, 1.42);
      desired.set(ball.x + back.x + side.x, bh + 1.62 + Math.min(0.36, pinDist * 0.028), ball.y + back.y + side.y);
      look.set(ball.x * 0.18 + pin.x * 0.82, groundHeight(hole, pin.x, pin.y) + 0.26, ball.y * 0.18 + pin.y * 0.82);
      fov = 48;
    } else if (view === "follow") {
      const v = session.ball.vel;
      const heading = Math.hypot(v.x, v.y) > 0.35 ? Math.atan2(v.y, v.x) : session.aim;
      const back = fromAngle(heading + Math.PI, 22 + Math.min(16, session.ball.z * 0.42));
      const side = fromAngle(heading + Math.PI / 2, session.shape * -2.2);
      desired.set(ball.x + back.x + side.x, 8.6 + session.ball.z * 0.34, ball.y + back.y + side.y);
      look.set(ball.x + Math.cos(heading) * 20, bh + 0.55, ball.y + Math.sin(heading) * 20);
      fov = 52;
    } else {
      const back = fromAngle(aim + Math.PI, 5.05);
      const side = fromAngle(aim + Math.PI / 2, 1.6);
      desired.set(ball.x + back.x + side.x, bh + 1.7, ball.y + back.y + side.y);
      look.set(ball.x + Math.cos(aim) * 22, bh + 0.22, ball.y + Math.sin(aim) * 22);
      fov = 53;
    }
    const catchup = this.viewAge < 0.28 ? 0.55 : view === "follow" ? 0.36 : view === "putt" ? 0.18 : 0.14;
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

export function golferMeshCount(): number {
  return countGolferMeshes();
}

function isSoftwareGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    return /swiftshader|llvmpipe|software|microsoft basic render/i.test(name);
  } catch {
    return false;
  }
}

function createWaterMaterial(time: { value: number }): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x0a4a58,
    roughness: 0.18,
    metalness: 0.0,
    transmission: 0.38,
    thickness: 2.4,
    transparent: true,
    opacity: 0.88,
    ior: 1.333,
    envMapIntensity: 1.15,
    clearcoat: 0.28,
    clearcoatRoughness: 0.34,
    attenuationColor: new THREE.Color(0x063038),
    attenuationDistance: 4.5,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = `varying vec3 vWorldPos;\nuniform float uTime;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       float wt = uTime * 0.24;
       transformed.y += sin(position.x * 0.42 + wt * 1.5) * 0.03 + cos(position.z * 0.34 - wt) * 0.024;
       vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
    shader.fragmentShader = `varying vec3 vWorldPos;
uniform float uTime;
${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       vec2 w = vWorldPos.xz;
       float t = uTime * 0.22;
       float r1 = sin(w.x * 0.48 + t * 1.6) * cos(w.y * 0.38 - t);
       float r2 = sin(w.x * 1.05 - w.y * 0.72 + t * 2.0);
       float r3 = sin(length(w) * 0.16 - t * 0.65);
       float ripple = r1 * 0.42 + r2 * 0.34 + r3 * 0.24;
       vec3 deep = vec3(0.02, 0.16, 0.20);
       vec3 mid = vec3(0.05, 0.28, 0.30);
       vec3 shoal = vec3(0.10, 0.38, 0.34);
       vec3 foam = vec3(0.70, 0.84, 0.80);
       vec3 viewW = normalize(cameraPosition - vWorldPos);
       float fres = pow(1.0 - clamp(abs(viewW.y), 0.0, 1.0), 2.6);
       float depthHint = smoothstep(-0.4, 0.8, ripple);
       diffuseColor.rgb = mix(deep, mid, 0.35 + ripple * 0.2);
       diffuseColor.rgb = mix(diffuseColor.rgb, shoal, depthHint * 0.28);
       diffuseColor.rgb = mix(diffuseColor.rgb, foam, smoothstep(0.78, 0.96, ripple) * 0.1);
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.78, 0.82), fres * 0.28);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
       float rw = sin(vWorldPos.x * 0.62 + uTime * 0.35) * 0.5 + 0.5;
       roughnessFactor = clamp(0.12 + rw * 0.2, 0.08, 0.38);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
       float t = uTime * 0.3;
       vec2 w = vWorldPos.xz;
       float nx = cos(w.x * 0.78 + t * 1.5) * 0.22 + cos(w.y * 1.05 - t) * 0.12;
       float nz = sin(w.y * 0.64 - t * 1.2) * 0.2 + sin(w.x * 0.9 + t * 0.75) * 0.1;
       normal = normalize(normal + vec3(nx, 0.0, nz));`,
    );
  };
  mat.customProgramCacheKey = () => "ptg-water-v3";
  return mat;
}

function makeSky(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(4200, 4200, 4200),
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

function makeSandCard(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#e2c284";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) {
    const y = (i / 110) * 256;
    ctx.strokeStyle = `rgba(${176 + (i % 5) * 8},${136 + (i % 4) * 6},78,${0.07 + (i % 3) * 0.04})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(128, y + Math.sin(i * 0.7) * 8, 256, y + Math.cos(i * 0.5) * 6);
    ctx.stroke();
  }
  for (let i = 0; i < 3600; i++) {
    ctx.fillStyle = i % 4 === 0 ? "#c9a45c" : i % 4 === 1 ? "#f2d8a2" : i % 4 === 2 ? "#d8b46e" : "#b89050";
    ctx.fillRect(hashNoise(i, 2) * 256, hashNoise(i, 7) * 256, 1.6 + (i % 3) * 0.4, 1.2 + (i % 2));
  }
  return c;
}

function makeSoftShadowCard(): HTMLCanvasElement {
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
