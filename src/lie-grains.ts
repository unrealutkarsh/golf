import * as THREE from "three";
import type { GameSession } from "./game";
import { grainBurst, grainPose, lieRead, seedGrains, type GrainSeed } from "./lie-story";

const POOL = 84;

function softDisc(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.35, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Short grass clippings, so a rough shot does not read as sand grains. */
function grassFleck(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineCap = "round";
    const blades = [
      [18, 46, 24, 14],
      [32, 50, 30, 12],
      [44, 48, 40, 16],
    ];
    for (const [x1, y1, x2, y2] of blades) {
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo((x1 + x2) / 2 + 4, (y1 + y2) / 2, x2, y2);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Slot {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
}

/**
 * Sand splash, grass clippings, or a clean spark. Lives on its own clock so a
 * landing can replace the strike puff without rewriting the flight model.
 */
export class LieGrains {
  readonly group = new THREE.Group();
  private slots: Slot[] = [];
  private live: GrainSeed[] = [];
  private ages: number[] = [];
  private key = "";
  private shedStamp = -1;
  private shedCount = 0;
  private grainMap: THREE.CanvasTexture;
  private fleckMap: THREE.CanvasTexture;

  constructor() {
    this.grainMap = softDisc();
    this.fleckMap = grassFleck();
    this.group.name = "lie-grains";
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.grainMap,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 4;
      sprite.frustumCulled = false;
      this.group.add(sprite);
      this.slots.push({ sprite, mat });
    }
  }

  sync(session: GameSession, dt: number, groundAt: (x: number, z: number) => number): void {
    if (session.screen !== "play") {
      this.clear();
      return;
    }
    this.spawn(session, groundAt);
    if (!session.lieStill) {
      this.shed(session, groundAt);
      const step = Math.max(0, Math.min(dt, 0.05));
      for (let i = 0; i < this.ages.length; i++) this.ages[i] += step;
    }
    this.place(groundAt);
  }

  private clear(): void {
    this.live = [];
    this.ages = [];
    this.key = "";
    this.shedStamp = -1;
    this.shedCount = 0;
    for (const slot of this.slots) slot.sprite.visible = false;
  }

  private spawn(session: GameSession, groundAt: (x: number, z: number) => number): void {
    const burst = session.contactFx ?? session.landBurst;
    if (!burst) return;
    const key = `${burst.kind}:${burst.pos.x.toFixed(2)}:${burst.pos.y.toFixed(2)}`;
    if (key === this.key) return;
    this.key = key;
    this.shedStamp = -1;
    this.shedCount = 0;
    const spec = grainBurst(burst.lie, burst.kind, session.club().id);
    const origin = { x: burst.pos.x, y: groundAt(burst.pos.x, burst.pos.y) + 0.12, z: burst.pos.y };
    this.live = seedGrains(spec, session.aim, origin, burst.kind === "land" ? 2 : 1);
    const age = session.landBurst && session.landBurst.kind === burst.kind ? Math.max(0, session.landBurst.age) : 0;
    // A held contact (QA, or a freeze) opens the splash instead of leaving every grain on the ball.
    const shown = session.lieStill ? Math.max(age, spec.life * 0.34) : age;
    this.ages = this.live.map(() => shown);
    if (session.contactFx && session.contactFx.kind === burst.kind && session.contactFx.pos.x === burst.pos.x && session.contactFx.pos.y === burst.pos.y) {
      session.contactFx = null;
    }
  }

  /** Clippings and sand still coming off the ball for the first part of the flight. */
  private shed(session: GameSession, groundAt: (x: number, z: number) => number): void {
    if (session.swingPhase !== "flight" || session.hitStop > 0) return;
    const read = lieRead(session.launchLie);
    if (read !== "splash" && read !== "smother") return;
    if (session.flightTime > 0.62 || session.ball.z < 0.35 || this.shedCount >= 22) return;
    const stamp = Math.floor(session.flightTime * 16);
    if (stamp === this.shedStamp) return;
    this.shedStamp = stamp;
    this.shedCount += 1;
    const spec = grainBurst(session.launchLie, "strike", session.club().id);
    const speed = Math.hypot(session.ball.vel.x, session.ball.vel.y) || 1;
    const back = 0.5 + (this.shedCount % 5) * 0.18;
    this.live.push({
      x: session.ball.pos.x,
      y: groundAt(session.ball.pos.x, session.ball.pos.y) + session.ball.z,
      z: session.ball.pos.y,
      vx: (-session.ball.vel.x / speed) * back,
      vy: read === "splash" ? 0.8 + (this.shedCount % 4) * 0.35 : 0.25 + (this.shedCount % 3) * 0.2,
      vz: (-session.ball.vel.y / speed) * back,
      life: read === "splash" ? 0.55 : 0.42,
      size: spec.size * (read === "splash" ? 0.75 : 0.55),
      color: spec.colors[this.shedCount % spec.colors.length] ?? spec.cloudColor,
      gravity: spec.gravity * 0.65,
      shape: spec.shape,
    });
    this.ages.push(0);
    if (this.live.length > POOL) {
      this.live.splice(0, this.live.length - POOL);
      this.ages.splice(0, this.ages.length - POOL);
    }
  }

  private place(groundAt: (x: number, z: number) => number): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const grain = this.live[i];
      if (!grain) {
        slot.sprite.visible = false;
        continue;
      }
      const pose = grainPose(grain, this.ages[i] ?? 0);
      if (pose.opacity <= 0.02) {
        slot.sprite.visible = false;
        continue;
      }
      const ground = groundAt(pose.x, pose.z);
      const y = Math.max(ground + 0.04, pose.y);
      const settled = pose.y < ground + 0.05;
      slot.mat.map = grain.shape === "fleck" ? this.fleckMap : this.grainMap;
      slot.mat.color.setHex(grain.color);
      slot.mat.opacity = pose.opacity * (settled ? 0.55 : 1);
      const s = grain.size * (0.75 + pose.opacity * 0.45);
      slot.sprite.scale.set(grain.shape === "fleck" ? s * 1.35 : s, grain.shape === "fleck" ? s * 0.7 : s, 1);
      slot.sprite.position.set(pose.x, y, pose.z);
      slot.sprite.visible = true;
    }
  }
}
