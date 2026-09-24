import * as THREE from "three";
import { lieAt, nearOb } from "./course";
import { CLOSE_STICK_HIDE, createBladeMaterial, createFringeBladeMaterial, updateFringeBladeLod, updateGreenBladeLod } from "./blades";
import { clubFamily } from "./clubs";
import { bindFoliageArt, createFoliageKit, type FoliageKit } from "./foliage";
import type { GameSession } from "./game";
import { loadArtKit } from "./kit";
import { atmosphereForCourse, SCENE_TONE } from "./look";
import { lerp, type Vec2 } from "./math";
import { samplePathPoint, type FlightSample } from "./physics";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { pinMarkerOpacity, renderPixelRatio, screenConstantScale } from "./art";
import { BALL_RADIUS, ballCenterLift, ballRollAxis, ballRollRadians, CONTACT_SHADOW_DIR, contactShadowPose, createBallContactShadows, createBallGlow, createGolfBallMesh, createPinMarker, createTurfBurst } from "./scene-ball";
import { updateSceneCamera, type CameraRig } from "./scene-camera";
import { populateHoleGroup } from "./scene-course";
import { collectShared, disposeChildren } from "./scene-dispose";
import { createPuttLine, writePuttLine, type PuttLine } from "./scene-putt";
import { addOutdoorLights, aimSunAt, configureWebGLRenderer, isSoftwareGL } from "./scene-lights";
import { applySkyAtmosphere, makeSky } from "./scene-sky";
import { createWaterMaterial } from "./scene-water";
import { createScuffDecal, placeScuff, scuffOpacity, scuffSpec } from "./near-turf";
import { createCountryMaterial, createGreenMaterial, createSandMaterial, createTurfMaterial } from "./turf";
import { groundHeight, isPuttingSituation, resolveCamView, type BroadcastCamStage, type ResolvedCam } from "./terrain";
import type { Hole } from "./types";

export { ballRollAxis, ballRollRadians, dimpleIndent, makeGolfBallGeometry } from "./scene-ball";

const MAX_PATH = 140;
/** Enough points for a full driver flight at 60 fps, so the tracer draws the whole shot. */
const TRAIL_LEN = 720;
export const AIM_RIBBON_SEGS = 48;

export function aimRibbonHalfWidth(putting: boolean, t: number): number {
  const base = putting ? 0.038 : 0.1;
  const fade = 0.6 + 0.4 * (1 - t) * (1 - t);
  return base * fade;
}

export class CourseScene implements CameraRig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  lastView: ResolvedCam | "" = "";
  viewAge = 1;
  time = 0;
  camPos = new THREE.Vector3(80, 24, 80);
  camLook = new THREE.Vector3(200, 1, 140);
  shotStage: BroadcastCamStage | "" = "";
  landingSpot: { key: string; pos: Vec2 } | null = null;
  private holeGroup = new THREE.Group();
  private ball: THREE.Mesh;
  /** Soft glow that keeps a tiny ball readable against sky and turf while it flies. */
  private ballGlow: THREE.Sprite;
  private turfBurst: THREE.Sprite;
  private shadow: THREE.Mesh;
  private softShadow: THREE.Mesh;
  private pin = new THREE.Group();
  /** Screen-sized flag icon over the hole, so the target reads from the tee through trees and haze. */
  private pinMarker: THREE.Sprite;
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
  /** Dotted putt preview that bends with the green's slope. */
  private puttLine: PuttLine;
  private turfMat: THREE.MeshStandardMaterial;
  private sandMat: THREE.MeshStandardMaterial;
  private countryMat: THREE.MeshStandardMaterial;
  private waterMat: THREE.MeshPhysicalMaterial;
  private raycaster = new THREE.Raycaster();
  private terrain: THREE.Mesh | null = null;
  /** The hole the scene was built for. Compared by identity: hole indexes repeat across courses. */
  private builtHole: Hole | null = null;
  private pathKey = "";
  private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh;
  private foliageKit: FoliageKit;
  private greenMat: THREE.MeshPhysicalMaterial;
  private bladeMat: THREE.MeshStandardMaterial;
  private fringeMat: THREE.MeshStandardMaterial;
  private greenBlades: THREE.InstancedMesh | null = null;
  private fringeBlades: THREE.InstancedMesh | null = null;
  private scuffSlots: { mesh: THREE.Mesh; age: number; life: number; peak: number; active: boolean }[] = [];
  private scuffSeen = "";
  private pendingArtRebuild = false;
  private waterTime = { value: 0 };
  private ribbon: THREE.Mesh;
  private ribbonGeo: THREE.BufferGeometry;
  private aimRibbon: THREE.Mesh;
  private aimRibbonGeo: THREE.BufferGeometry;
  private aimCenter = new Float32Array(AIM_RIBBON_SEGS * 3);
  private aimRibbonReady = false;
  private landColor = new THREE.Color(SCENE_TONE.landCream);
  private landTarget = new THREE.Color(SCENE_TONE.landCream);
  private landPos = new THREE.Vector3();
  private landPosTarget = new THREE.Vector3();
  private w = 1;
  private h = 1;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private software = false;
  private atmoId = "";

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    const software = isSoftwareGL(this.renderer);
    this.software = software;
    configureWebGLRenderer(this.renderer, software);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SCENE_TONE.fogColor, SCENE_TONE.fogNear, SCENE_TONE.fogFar);
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

    this.puttLine = createPuttLine();
    this.scene.add(this.puttLine.dots, this.puttLine.stop);

    this.ball = createGolfBallMesh();
    this.ballGlow = createBallGlow();
    this.turfBurst = createTurfBurst();
    this.scene.add(this.ball, this.ballGlow, this.turfBurst);
    const shadows = createBallContactShadows();
    this.shadow = shadows.shadow;
    this.softShadow = shadows.softShadow;
    this.scene.add(this.shadow, this.softShadow);
    this.scuffSlots = [0, 1].map(() => ({
      mesh: createScuffDecal(),
      age: 0,
      life: 1,
      peak: 0,
      active: false,
    }));
    for (const slot of this.scuffSlots) this.scene.add(slot.mesh);

    this.landing = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 1.05, 40),
      new THREE.MeshBasicMaterial({
        color: SCENE_TONE.landCream,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    );
    this.landing.rotation.x = -Math.PI / 2;
    this.scene.add(this.landing);

    this.flightMat = new THREE.MeshBasicMaterial({
      color: SCENE_TONE.aimRibbon,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
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
        color: SCENE_TONE.aimRibbon,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.ribbon.visible = false;
    this.scene.add(this.ribbon);
    this.aimRibbonGeo = new THREE.BufferGeometry();
    this.aimRibbonGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(AIM_RIBBON_SEGS * 2 * 3), 3));
    const aimIdx: number[] = [];
    for (let i = 0; i < AIM_RIBBON_SEGS - 1; i++) {
      const a = i * 2;
      aimIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.aimRibbonGeo.setIndex(aimIdx);
    this.aimRibbon = new THREE.Mesh(
      this.aimRibbonGeo,
      new THREE.MeshBasicMaterial({
        color: SCENE_TONE.aimRibbon,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: SCENE_TONE.aimRibbonOpacity,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.aimRibbon.visible = false;
    this.scene.add(this.aimRibbon);

    this.pinMarker = createPinMarker();
    this.scene.add(this.pin, this.grid, this.pinMarker);
    this.resize();
    watchPixelRatio(() => this.resize());
    if (!software) this.initComposer();
    window.addEventListener("resize", () => this.resize());
  }

  private async loadCourseArt(lite: boolean): Promise<void> {
    try {
      const kit = await loadArtKit(this.renderer, lite);
      bindFoliageArt(this.foliageKit, kit);
      // Turf, green and sand stay on the flat stylized palette; the HDRI only lights reflective bits (ball, water).
      if (kit.env) {
        this.scene.environment = kit.env;
        this.waterMat.envMapIntensity = 1.05;
        (this.ball.material as THREE.MeshPhysicalMaterial).envMapIntensity = 1.55;
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
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(this.w, this.h),
        SCENE_TONE.bloomStrength,
        SCENE_TONE.bloomRadius,
        SCENE_TONE.bloomThreshold,
      );
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
    // Re-read the ratio every time: dragging to another display or zooming changes it without a size change.
    const ratio = renderPixelRatio(window.devicePixelRatio);
    if (this.renderer.getPixelRatio() !== ratio) {
      this.renderer.setPixelRatio(ratio);
      this.composer?.setPixelRatio(ratio);
    }
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
    this.applyCourseAtmosphere(session.course.id);
    const hole = session.hole();
    const flying = session.swingPhase === "flight" || session.swingPhase === "settle";
    if (this.pendingArtRebuild && !flying) {
      this.pendingArtRebuild = false;
      this.builtHole = null;
    }
    if (this.builtHole !== hole) this.rebuildHole(hole);

    // An approach that rolls onto the green stays on the shot camera until it stops.
    const fullShotInAir = flying && session.club().id !== "putter";
    const putting = !fullShotInAir && isPuttingSituation(session.lie, session.toPin(), session.club().id, hole, session.ball.pos);
    const view = resolveCamView(session.camMode, session.swingPhase, putting);
    this.placeBall(session, dt);
    this.placeTurfBurst(session);
    this.updateScuffs(session, dt);
    this.placePin(hole);
    this.updatePath(session, dt);
    this.updateTrail(session);
    this.updateGrid(session, putting);
    this.updatePuttAim(session, hole, putting);
    updateSceneCamera(this, session, hole, view, putting, dt);
    this.updatePinMarker(session, putting);
    this.waterTime.value = this.time;
    const camDist = this.camera.position.distanceTo(this.ball.position);
    const play = session.screen === "play";
    updateGreenBladeLod(this.greenBlades, putting && play && camDist > CLOSE_STICK_HIDE, camDist);
    updateFringeBladeLod(this.fringeBlades, play && camDist > CLOSE_STICK_HIDE, camDist);
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

  private applyCourseAtmosphere(courseId: string): void {
    if (this.atmoId === courseId) return;
    this.atmoId = courseId;
    const atmo = atmosphereForCourse(courseId);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(atmo.fogColor);
    fog.near = atmo.fogNear;
    fog.far = atmo.fogFar;
    this.renderer.setClearColor(atmo.clearColor, 1);
    applySkyAtmosphere(this.sky, atmo);
    const baseSun = this.software ? SCENE_TONE.sunSoftware : SCENE_TONE.sunHardware;
    this.sun.intensity = baseSun * atmo.sunScale;
    const baseExposure = this.software ? SCENE_TONE.exposureSoftware : SCENE_TONE.exposureHardware;
    this.renderer.toneMappingExposure = baseExposure * atmo.exposureScale;
  }

  private rebuildHole(hole: Hole): void {
    this.builtHole = hole;
    // Free the previous hole's GPU buffers; only the materials and tree templates reused by every hole survive.
    const kit = this.foliageKit;
    const shared = collectShared(kit.trees, [
      this.turfMat, this.greenMat, this.bladeMat, this.fringeMat, this.countryMat, this.sandMat, this.waterMat,
      kit.leaf, kit.bark, kit.contact, kit.impostor, kit.card,
    ]);
    disposeChildren(this.holeGroup, shared);
    this.terrain = null;
    this.greenBlades = null;
    this.fringeBlades = null;
    this.trailCount = 0;
    this.pathKey = "";
    this.aimRibbonReady = false;
    this.aimRibbon.visible = false;
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
    this.scuffSeen = "";
    for (const slot of this.scuffSlots) {
      slot.active = false;
      slot.mesh.visible = false;
    }
    aimSunAt(this.sun, built.focus.cx, built.focus.cz);
  }

  private placeBall(session: GameSession, dt: number): void {
    const p = session.ball.pos;
    const gh = groundHeight(session.hole(), p.x, p.y);
    const lift = ballCenterLift(session.ball.z);
    this.ball.position.set(p.x, gh + Math.max(session.ball.z, 0) + lift, p.y);
    const pose = contactShadowPose(session.ball.z);
    const ox = CONTACT_SHADOW_DIR.x * pose.offset;
    const oz = CONTACT_SHADOW_DIR.z * pose.offset;
    this.shadow.position.set(p.x + ox, gh + 0.027, p.y + oz);
    this.shadow.scale.setScalar(pose.coreScale);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = pose.coreOpacity;
    this.softShadow.position.set(p.x + ox * 0.35, gh + 0.023, p.y + oz * 0.35);
    this.softShadow.scale.set(pose.softScale * 1.08, pose.softScale * 0.86, 1);
    (this.softShadow.material as THREE.MeshBasicMaterial).opacity = pose.softOpacity;
    const halo = this.ball.getObjectByName("sit-halo") as THREE.Mesh | undefined;
    if (halo) {
      const air = Math.max(0, session.ball.z);
      (halo.material as THREE.MeshBasicMaterial).opacity = air > 0.8 ? 0.16 : 0.03 + Math.min(1, air / 0.8) * 0.13;
    }
    const inFlight = session.swingPhase === "flight" && session.ball.z > 0.4;
    this.ballGlow.visible = inFlight;
    if (inFlight) {
      this.ballGlow.position.copy(this.ball.position);
      this.ballGlow.scale.setScalar(Math.max(0.7, this.camera.position.distanceTo(this.ball.position) * 0.05));
    }
    const speed = Math.hypot(session.ball.vel.x, session.ball.vel.y);
    const axis = ballRollAxis(session.ball.vel.x, session.ball.vel.y);
    if (axis) {
      this.ball.rotateOnWorldAxis(new THREE.Vector3(axis.x, axis.y, axis.z), ballRollRadians(speed, dt));
    }
  }

  private placeTurfBurst(session: GameSession): void {
    const burst = session.landBurst;
    const show = Boolean(burst) && session.screen === "play";
    this.turfBurst.visible = show;
    if (!burst || !show) return;
    const life = burst.kind === "strike" ? 0.34 : 0.7;
    const t = Math.min(1, burst.age / life);
    const gh = groundHeight(session.hole(), burst.pos.x, burst.pos.y);
    const rise = burst.kind === "land" ? 0.9 : 0.4;
    this.turfBurst.position.set(burst.pos.x, gh + 0.12 + t * rise, burst.pos.y);
    const spread = burst.lie === "bunker" ? 2.6 : burst.lie === "rough" ? 1.7 : burst.kind === "strike" ? 0.85 : 1.25;
    const s = spread * (0.4 + t * 1.15);
    this.turfBurst.scale.set(s, s * 0.62, 1);
    const mat = this.turfBurst.material as THREE.SpriteMaterial;
    mat.opacity = (1 - t) * (burst.lie === "bunker" ? 0.62 : 0.46);
    const color = burst.lie === "bunker" ? 0xd2c4a2 : burst.lie === "rough" ? 0x3f5c2c : burst.lie === "green" ? 0x9dcc78 : 0x7eb85a;
    mat.color.setHex(color);
  }

  private updateScuffs(session: GameSession, dt: number): void {
    const burst = session.landBurst;
    if (burst && session.screen === "play") {
      const key = `${burst.kind}:${burst.pos.x.toFixed(2)}:${burst.pos.y.toFixed(2)}`;
      if (key !== this.scuffSeen) {
        this.scuffSeen = key;
        const spec = scuffSpec(burst.kind, burst.lie, clubFamily(session.club().id));
        if (spec.opacity > 0) {
          const free = this.scuffSlots.find((slot) => !slot.active) ?? this.scuffSlots.reduce((a, b) => (a.age >= b.age ? a : b));
          free.active = true;
          free.age = 0;
          free.life = spec.life;
          free.peak = spec.opacity;
          const aim =
            burst.kind === "strike"
              ? session.aim
              : Math.atan2(burst.pos.y - session.lastShotPos.y, burst.pos.x - session.lastShotPos.x);
          placeScuff(free.mesh, session.hole(), burst.pos, aim, spec);
        }
      }
    }
    for (const slot of this.scuffSlots) {
      if (!slot.active) continue;
      slot.age += dt;
      const opacity = scuffOpacity(slot.age, slot.life, slot.peak);
      slot.mesh.visible = opacity > 0.02;
      (slot.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
      if (opacity <= 0) slot.active = false;
    }
  }

  private placePin(hole: Hole): void {
    this.pin.position.set(hole.pin.x, groundHeight(hole, hole.pin.x, hole.pin.y), hole.pin.y);
  }

  private updatePinMarker(session: GameSession, putting: boolean): void {
    const d = this.camera.position.distanceTo(this.pin.position);
    const opacity = session.screen === "play" && !putting ? pinMarkerOpacity(d) : 0;
    this.pinMarker.visible = opacity > 0;
    if (!this.pinMarker.visible) return;
    const scale = screenConstantScale(d, 0.06, 2.2);
    (this.pinMarker.material as THREE.SpriteMaterial).opacity = opacity;
    this.pinMarker.scale.set(scale * 0.62, scale, 1);
    // Anchor the icon's foot on the cup and lift it above the real stick.
    this.pinMarker.position.set(this.pin.position.x, this.pin.position.y + 2.6 + scale * 0.5, this.pin.position.z);
  }

  private updatePath(session: GameSession, dt: number): void {
    const aiming = session.swingPhase === "aim" || session.swingPhase === "power" || session.swingPhase === "accuracy";
    const flying = session.swingPhase === "flight" || session.swingPhase === "settle";
    const play = session.screen === "play";
    if (aiming && play) {
      const onPutt = session.club().id === "putter";
      const path = session.previewFlight();
      const show = path.length > 1 && !onPutt;
      this.aimRibbon.visible = show;
      this.groundLine.visible = show;
      this.landing.visible = show;
      if (this.flightMesh) this.flightMesh.visible = false;
      if (show) this.writeAimRibbon(session, path, dt);
      else this.aimRibbonReady = false;
      return;
    }
    this.aimRibbon.visible = false;
    this.aimRibbonReady = false;
    this.groundLine.visible = false;
    this.landing.visible = false;
    if (flying && play && session.shotArc.length > 1) {
      const path = session.shotArc;
      const last = path[path.length - 1];
      const key = `arc:${path.length}:${last.pos.x.toFixed(2)}:${last.pos.y.toFixed(2)}`;
      if (key !== this.pathKey) {
        this.pathKey = key;
        const hole = session.hole();
        const pts = path.slice(0, MAX_PATH).map((s) => {
          const gh = groundHeight(hole, s.pos.x, s.pos.y);
          return new THREE.Vector3(s.pos.x, gh + Math.max(s.z, 0.05) + BALL_RADIUS, s.pos.y);
        });
        this.setFlightTube(pts, 0.07);
      }
      if (this.flightMesh) this.flightMesh.visible = true;
      return;
    }
    if (this.flightMesh) this.flightMesh.visible = false;
  }

  private writeAimRibbon(session: GameSession, path: FlightSample[], dt: number): void {
    const n = AIM_RIBBON_SEGS;
    const putting = session.club().id === "putter" || session.lie === "green";
    const hole = session.hole();
    const k = this.aimRibbonReady ? 1 - Math.pow(0.5, Math.max(dt, 0) / 0.055) : 1;
    const pos = this.aimRibbonGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      const s = samplePathPoint(path, i / Math.max(n - 1, 1));
      const gh = groundHeight(hole, s.pos.x, s.pos.y);
      const ix = i * 3;
      this.aimCenter[ix] = lerp(this.aimCenter[ix], s.pos.x, k);
      this.aimCenter[ix + 1] = lerp(this.aimCenter[ix + 1], gh + Math.max(s.z, 0.04) + BALL_RADIUS, k);
      this.aimCenter[ix + 2] = lerp(this.aimCenter[ix + 2], s.pos.y, k);
    }
    this.aimRibbonReady = true;
    for (let i = 0; i < n; i++) {
      const x = this.aimCenter[i * 3];
      const y = this.aimCenter[i * 3 + 1];
      const z = this.aimCenter[i * 3 + 2];
      let dx = 0;
      let dz = 1;
      if (i < n - 1) {
        dx = this.aimCenter[(i + 1) * 3] - x;
        dz = this.aimCenter[(i + 1) * 3 + 2] - z;
      } else {
        dx = x - this.aimCenter[(i - 1) * 3];
        dz = z - this.aimCenter[(i - 1) * 3 + 2];
      }
      const len = Math.hypot(dx, dz) || 1;
      const half = aimRibbonHalfWidth(putting, i / Math.max(n - 1, 1));
      const px = (-dz / len) * half;
      const pz = (dx / len) * half;
      pos.setXYZ(i * 2, x - px, y, z - pz);
      pos.setXYZ(i * 2 + 1, x + px, y + 0.014, z + pz);
      this.groundPos[i * 3] = x;
      this.groundPos[i * 3 + 1] = groundHeight(hole, x, z) + 0.04;
      this.groundPos[i * 3 + 2] = z;
    }
    pos.needsUpdate = true;
    this.aimRibbonGeo.setDrawRange(0, (n - 1) * 6);
    setLine(this.groundLine, n);
    (this.groundLine.material as THREE.LineBasicMaterial).opacity = putting ? 0.1 : 0.18;
    const lastX = this.aimCenter[(n - 1) * 3];
    const lastZ = this.aimCenter[(n - 1) * 3 + 2];
    const raw = samplePathPoint(path, 1);
    const warn = nearOb(hole, raw.pos) || lieAt(hole, raw.pos) === "ob";
    this.landTarget.setHex(warn ? SCENE_TONE.landWarn : SCENE_TONE.landCream);
    this.landColor.lerp(this.landTarget, k);
    (this.landing.material as THREE.MeshBasicMaterial).color.copy(this.landColor);
    (this.landing.material as THREE.MeshBasicMaterial).opacity = putting ? 0.3 : 0.75;
    this.landPosTarget.set(lastX, groundHeight(hole, lastX, lastZ) + 0.05, lastZ);
    this.landPos.lerp(this.landPosTarget, k);
    this.landing.position.copy(this.landPos);
    // The ring is ~2 yd wide in the world; grow it with distance so a 250-yard target is still a clear mark.
    this.landing.scale.setScalar(putting ? 1 : screenConstantScale(this.camera.position.distanceTo(this.landPos), 0.03, 1));
  }

  private updateTrail(session: GameSession): void {
    const flying = session.swingPhase === "flight" || session.swingPhase === "settle";
    const inAir = session.ball.z > 0.2;
    // Keep the tracer for the whole shot, including the roll-out, so you can read the flight you just hit.
    const show = session.screen === "play" && flying && (inAir || this.trailCount > 1);
    this.trail.visible = show;
    this.trailGlow.visible = show;
    if (!show) {
      this.trailCount = 0;
      this.ribbon.visible = false;
      return;
    }
    if (!inAir) {
      this.updateRibbon();
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
    const cam = this.camera.position;
    const tangent = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const x = this.trailPos[i * 3];
      const y = this.trailPos[i * 3 + 1];
      const z = this.trailPos[i * 3 + 2];
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      tangent.set(this.trailPos[b * 3] - this.trailPos[a * 3], this.trailPos[b * 3 + 1] - this.trailPos[a * 3 + 1], this.trailPos[b * 3 + 2] - this.trailPos[a * 3 + 2]);
      toCam.set(cam.x - x, cam.y - y, cam.z - z);
      // Face the camera and widen with distance so the tracer stays a readable stroke far downrange.
      const camDist = toCam.length();
      side.crossVectors(tangent, toCam).normalize();
      if (!Number.isFinite(side.x)) side.set(1, 0, 0);
      const age = i / Math.max(n - 1, 1);
      const half = Math.max(0.05, camDist * 0.0032) * (0.55 + 0.45 * age);
      pos.setXYZ(i * 2, x - side.x * half, y - side.y * half, z - side.z * half);
      pos.setXYZ(i * 2 + 1, x + side.x * half, y + side.y * half, z + side.z * half);
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
    const aiming = session.swingPhase === "aim" || session.swingPhase === "power" || session.swingPhase === "accuracy";
    const show = session.screen === "play" && putting && aiming && session.club().id === "putter";
    if (!show) {
      this.puttLine.dots.visible = false;
      this.puttLine.stop.visible = false;
      return;
    }
    writePuttLine(this.puttLine, hole, session.previewPutt());
  }
}

/** Calls `onChange` whenever devicePixelRatio changes (display switch, browser zoom). */
function watchPixelRatio(onChange: () => void): void {
  if (typeof window.matchMedia !== "function") return;
  const listen = () => {
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener(
      "change",
      () => {
        onChange();
        listen();
      },
      { once: true },
    );
  };
  listen();
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
