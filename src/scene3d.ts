import * as THREE from "three";
import { lieAt, nearOb } from "./course";
import { createBladeMaterial, createFringeBladeMaterial, updateFringeBladeLod, updateGreenBladeLod } from "./blades";
import { bindFoliageArt, createFoliageKit, type FoliageKit } from "./foliage";
import type { GameSession } from "./game";
import { dressStandard, loadArtKit } from "./kit";
import { type Vec2 } from "./math";
import type { FlightSample } from "./physics";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BALL_RADIUS, ballRollAxis, ballRollRadians, createBallContactShadows, createGolfBallMesh } from "./scene-ball";
import { updateSceneCamera, type CameraRig } from "./scene-camera";
import { populateHoleGroup } from "./scene-course";
import { addOutdoorLights, aimSunAt, configureWebGLRenderer, isSoftwareGL } from "./scene-lights";
import { makeSky } from "./scene-sky";
import { createWaterMaterial } from "./scene-water";
import { createCountryMaterial, createGreenMaterial, createSandMaterial, createTurfMaterial } from "./turf";
import { groundHeight, isPuttingSituation, resolveCamView, type ResolvedCam } from "./terrain";
import type { Hole } from "./types";

export { ballRollAxis, ballRollRadians, dimpleIndent, makeGolfBallGeometry } from "./scene-ball";

const MAX_PATH = 140;
const TRAIL_LEN = 80;

export class CourseScene implements CameraRig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  lastView: ResolvedCam | "" = "";
  viewAge = 1;
  time = 0;
  camPos = new THREE.Vector3(80, 24, 80);
  camLook = new THREE.Vector3(200, 1, 140);
  private holeGroup = new THREE.Group();
  private ball: THREE.Mesh;
  private shadow: THREE.Mesh;
  private softShadow: THREE.Mesh;
  private pin = new THREE.Group();
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
  private sandMat: THREE.MeshStandardMaterial;
  private countryMat: THREE.MeshStandardMaterial;
  private waterMat: THREE.MeshPhysicalMaterial;
  private raycaster = new THREE.Raycaster();
  private terrain: THREE.Mesh | null = null;
  private builtHole = -1;
  private pathKey = "";
  private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh;
  private foliageKit: FoliageKit;
  private greenMat: THREE.MeshPhysicalMaterial;
  private bladeMat: THREE.MeshStandardMaterial;
  private fringeMat: THREE.MeshStandardMaterial;
  private greenBlades: THREE.InstancedMesh | null = null;
  private fringeBlades: THREE.InstancedMesh | null = null;
  private pendingArtRebuild = false;
  private waterTime = { value: 0 };
  private ribbon: THREE.Mesh;
  private ribbonGeo: THREE.BufferGeometry;
  private w = 1;
  private h = 1;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    const software = isSoftwareGL(this.renderer);
    configureWebGLRenderer(this.renderer, software);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x8eb6d4, 2200, 6400);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.12, 6800);
    this.scene.add(this.holeGroup);
    this.sky = makeSky();
    this.scene.add(this.sky);
    this.sun = addOutdoorLights(this.scene, software);

    this.turfMat = createTurfMaterial();
    this.greenMat = createGreenMaterial();
    this.sandMat = createSandMaterial();
    this.countryMat = createCountryMaterial();
    this.waterMat = createWaterMaterial(this.waterTime, software);
    this.bladeMat = createBladeMaterial();
    this.fringeMat = createFringeBladeMaterial();
    this.foliageKit = createFoliageKit();
    void this.loadCourseArt(software);

    const puttGeo = new THREE.BufferGeometry();
    puttGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    this.puttAim = new THREE.Line(
      puttGeo,
      new THREE.LineDashedMaterial({
        color: 0xd4c49a,
        transparent: true,
        opacity: 0.32,
        dashSize: 0.38,
        gapSize: 0.28,
      }),
    );
    this.scene.add(this.puttAim);

    this.ball = createGolfBallMesh();
    this.scene.add(this.ball);
    const shadows = createBallContactShadows();
    this.shadow = shadows.shadow;
    this.softShadow = shadows.softShadow;
    this.scene.add(this.shadow, this.softShadow);

    this.landing = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.05, 28),
      new THREE.MeshBasicMaterial({ color: 0xe6d4a0, side: THREE.DoubleSide, transparent: true, opacity: 0.42, depthWrite: false }),
    );
    this.landing.rotation.x = -Math.PI / 2;
    this.scene.add(this.landing);

    this.flightMat = new THREE.MeshBasicMaterial({ color: 0xe6d4a0, transparent: true, opacity: 0.4, depthWrite: false });
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

    this.scene.add(this.pin, this.grid);
    this.resize();
    if (!software) this.initComposer();
    window.addEventListener("resize", () => this.resize());
  }

  private async loadCourseArt(lite: boolean): Promise<void> {
    try {
      const kit = await loadArtKit(this.renderer, lite);
      bindFoliageArt(this.foliageKit, kit);
      dressStandard(this.turfMat, kit.fairway, { roughness: 0.84, env: 0.36, normalScale: 1.05 });
      dressStandard(this.greenMat, kit.green, { roughness: 0.3, env: 0.78, normalScale: 0.72 });
      this.greenMat.clearcoat = 0.08;
      this.greenMat.clearcoatRoughness = 0.52;
      this.greenMat.sheen = 0.48;
      dressStandard(this.sandMat, kit.sand, { roughness: 0.95, env: 0.2, normalScale: 1.4 });
      dressStandard(this.countryMat, kit.rough, { roughness: 0.92, env: 0.3, normalScale: 1.1 });
      if (kit.env) {
        this.scene.environment = kit.env;
        this.waterMat.envMapIntensity = 1.55;
        (this.ball.material as THREE.MeshPhysicalMaterial).envMapIntensity = 1.5;
      }
      if (kit.background && !lite) {
        this.scene.background = kit.background;
        this.scene.backgroundBlurriness = 0.045;
        this.scene.backgroundIntensity = 1.05;
        this.sky.visible = false;
        this.scene.fog = new THREE.Fog(0x8eb6d4, 2400, 6400);
      }
      this.pendingArtRebuild = true;
    } catch (err) {
      console.warn("[ptg] art kit skip", err);
    }
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
    const flying = session.swingPhase === "flight" || session.swingPhase === "settle";
    if (this.pendingArtRebuild && !flying) {
      this.pendingArtRebuild = false;
      this.builtHole = -1;
    }
    if (this.builtHole !== session.holeIndex) this.rebuildHole(hole, session.holeIndex);

    const putting = isPuttingSituation(session.lie, session.toPin(), session.club().id, hole, session.ball.pos);
    const view = resolveCamView(session.camMode, session.swingPhase, putting);
    this.placeBall(session, dt);
    this.placePin(hole);
    this.updatePath(session);
    this.updateTrail(session);
    this.updateGrid(session, putting);
    this.updatePuttAim(session, hole, putting);
    updateSceneCamera(this, session, hole, view, putting, dt);
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
    this.greenBlades = null;
    this.fringeBlades = null;
    this.trailCount = 0;
    const built = populateHoleGroup(
      this.holeGroup,
      hole,
      {
        turf: this.turfMat,
        green: this.greenMat,
        blade: this.bladeMat,
        fringe: this.fringeMat,
        country: this.countryMat,
        sand: this.sandMat,
        water: this.waterMat,
      },
      this.foliageKit,
      isSoftwareGL(this.renderer),
      this.pin,
      this.grid,
    );
    this.terrain = built.terrain;
    this.greenBlades = built.greenBlades;
    this.fringeBlades = built.fringeBlades;
    aimSunAt(this.sun, built.focus.cx, built.focus.cz);
  }

  private placeBall(session: GameSession, dt: number): void {
    const p = session.ball.pos;
    const gh = groundHeight(session.hole(), p.x, p.y);
    this.ball.position.set(p.x, gh + Math.max(session.ball.z, 0) + 0.16, p.y);
    this.shadow.position.set(p.x, gh + 0.025, p.y);
    const air = Math.max(0.1, 0.26 - session.ball.z * 0.01);
    this.shadow.scale.setScalar(air);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = session.ball.z > 8 ? 0.12 : 0.36;
    const speed = Math.hypot(session.ball.vel.x, session.ball.vel.y);
    const axis = ballRollAxis(session.ball.vel.x, session.ball.vel.y);
    if (axis) {
      this.ball.rotateOnWorldAxis(new THREE.Vector3(axis.x, axis.y, axis.z), ballRollRadians(speed, dt));
    }
  }

  private placePin(hole: Hole): void {
    this.pin.position.set(hole.pin.x, groundHeight(hole, hole.pin.x, hole.pin.y), hole.pin.y);
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
    const puttingLine = session.club().id === "putter" || session.lie === "green";
    const shape = session.swingPhase === "flight" || session.swingPhase === "settle" ? Math.sign(session.ball.curve) : session.shape;
    this.flightMat.color.set(shape > 0.2 ? 0x8eb8d8 : shape < -0.2 ? 0xe0b080 : 0xe6d4a0);
    this.flightMat.opacity = puttingLine ? 0.28 : 0.46;
    (this.groundLine.material as THREE.LineBasicMaterial).opacity = puttingLine ? 0.12 : 0.2;
    (this.landing.material as THREE.MeshBasicMaterial).opacity = puttingLine ? 0.28 : 0.4;
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
      const radius = session.club().id === "putter" ? 0.02 : 0.09;
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
    this.puttAim.computeLineDistances();
  }
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
