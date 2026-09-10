import type { GameSession } from "./game";
import { grassTile, hashNoise, patternFrom, SUN } from "./look";
import { CUP_RADIUS, type FlightSample } from "./physics";
import { angleTo, clamp, dist, fromAngle, hashString, mulberry32, type Vec2 } from "./math";
import type { Ellipse, Hole, Tree } from "./types";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface TrailPoint {
  x: number;
  y: number;
  z: number;
}

interface LandRing {
  x: number;
  y: number;
  life: number;
  max: number;
}

const LIFT_X = 0.28;
const LIFT_Y = 2.25;

export function airborneOffset(z: number): Vec2 {
  const h = Math.max(0, z);
  return { x: h * LIFT_X, y: -h * LIFT_Y };
}

export function airbornePos(ground: Vec2, z: number): Vec2 {
  const lift = airborneOffset(z);
  return { x: ground.x + lift.x, y: ground.y + lift.y };
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  dpr = 1;
  particles: Particle[] = [];
  private staticCanvas: HTMLCanvasElement;
  private staticCtx: CanvasRenderingContext2D;
  private staticHole = -1;
  private time = 0;
  private trail: TrailPoint[] = [];
  private rings: LandRing[] = [];
  private trailShot = "";
  private prevZ = 0;
  private grainCache = new Map<string, CanvasPattern>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.staticCanvas = document.createElement("canvas");
    const sctx = this.staticCanvas.getContext("2d");
    if (!sctx) throw new Error("Offscreen canvas unavailable");
    this.staticCtx = sctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.staticHole = -1;
    this.grainCache.clear();
  }

  burst(pos: Vec2, color: string, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * speed;
      this.particles.push({
        x: pos.x,
        y: pos.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.45 + Math.random() * 0.4,
        max: 0.85,
        color,
        size: 0.6 + Math.random() * 1.1,
      });
    }
  }

  draw(session: GameSession, dt: number): void {
    this.time += dt;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawSky(ctx);
    const hole = session.hole();
    this.ensureStatic(hole);
    this.trackFlight(session, dt);
    this.updateCamera(session, dt);
    ctx.save();
    this.applyCamera(ctx, session);
    this.drawGroundscape(ctx, hole);
    ctx.drawImage(this.staticCanvas, hole.bounds.x, hole.bounds.y, hole.bounds.w, hole.bounds.h);
    this.drawFairwaySheen(ctx, session, hole);
    this.drawNearGrass(ctx, session, hole);
    this.drawWater(ctx, hole);
    this.drawGreen(ctx, hole);
    this.drawPin(ctx, hole);
    this.drawAim(ctx, session, hole);
    this.drawShotArc(ctx, session);
    this.updateParticles(dt);
    this.drawRings(ctx);
    this.drawParticles(ctx);
    this.drawBall(ctx, session);
    ctx.restore();
    this.drawAtmosphere(ctx);
    if (session.screen === "play") {
      this.drawMinimap(ctx, session);
      this.drawMeters(ctx, session);
    }
  }

  worldFromScreen(session: GameSession, sx: number, sy: number): Vec2 {
    return {
      x: (sx - this.w / 2) / session.cam.zoom + session.cam.x,
      y: (sy - this.h / 2) / session.cam.zoom + session.cam.y,
    };
  }

  private trackFlight(session: GameSession, dt: number): void {
    const key = `${session.holeIndex}-${session.strokes}`;
    if (key !== this.trailShot) {
      this.trail = [];
      this.trailShot = key;
      this.prevZ = session.ball.z;
    }
    const flying = session.swingPhase === "flight" || session.swingPhase === "settle";
    if (flying) {
      const b = session.ball;
      const last = this.trail[this.trail.length - 1];
      if (!last || dist(last, b.pos) > 0.35 || Math.abs(last.z - b.z) > 0.25) {
        this.trail.push({ x: b.pos.x, y: b.pos.y, z: b.z });
        if (this.trail.length > 110) this.trail.shift();
      }
      if (this.trail.length === 1 && b.z < 1.2) this.burst(b.pos, "#c6d89a", 14, 16);
      if (this.prevZ > 2.2 && b.z <= 0.08) {
        this.burst(b.pos, "#d8e8b0", 18, 14);
        this.rings.push({ x: b.pos.x, y: b.pos.y, life: 0.6, max: 0.6 });
      }
      this.prevZ = b.z;
    } else if (this.trail.length && session.swingPhase === "aim") {
      for (const p of this.trail) p.z *= 0.92;
      if (this.trail.every((p) => p.z < 0.08)) this.trail = [];
    }
    this.rings = this.rings.filter((r) => {
      r.life -= dt;
      return r.life > 0;
    });
  }

  private drawSky(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, "#1a3d68");
    g.addColorStop(0.28, "#3d7ca8");
    g.addColorStop(0.55, "#8ec4d4");
    g.addColorStop(0.72, "#d8c48a");
    g.addColorStop(1, "#6a8a4a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);

    const sunX = this.w * 0.8;
    const sunY = this.h * 0.18;
    const bloom = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, this.w * 0.5);
    bloom.addColorStop(0, "rgba(255, 236, 190, 0.85)");
    bloom.addColorStop(0.12, "rgba(255, 200, 120, 0.28)");
    bloom.addColorStop(1, "rgba(255, 200, 120, 0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.fillStyle = "#fff6d2";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.16)";
    this.drawCloud(ctx, this.w * 0.16, this.h * 0.14, 86);
    this.drawCloud(ctx, this.w * 0.4, this.h * 0.1, 110);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    this.drawCloud(ctx, this.w * 0.9, this.h * 0.2, 64);

    ctx.fillStyle = "#4a6a38";
    ctx.beginPath();
    ctx.moveTo(0, this.h * 0.62);
    ctx.quadraticCurveTo(this.w * 0.2, this.h * 0.54, this.w * 0.38, this.h * 0.6);
    ctx.quadraticCurveTo(this.w * 0.58, this.h * 0.66, this.w, this.h * 0.58);
    ctx.lineTo(this.w, this.h);
    ctx.lineTo(0, this.h);
    ctx.fill();
    ctx.fillStyle = "#3a582c";
    ctx.beginPath();
    ctx.moveTo(0, this.h * 0.7);
    ctx.quadraticCurveTo(this.w * 0.3, this.h * 0.64, this.w * 0.55, this.h * 0.72);
    ctx.quadraticCurveTo(this.w * 0.78, this.h * 0.78, this.w, this.h * 0.68);
    ctx.lineTo(this.w, this.h);
    ctx.lineTo(0, this.h);
    ctx.fill();
  }

  private drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.34, 0, 0, Math.PI * 2);
    ctx.ellipse(x - r * 0.42, y + 5, r * 0.52, r * 0.26, 0, 0, Math.PI * 2);
    ctx.ellipse(x + r * 0.38, y + 6, r * 0.46, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawGroundscape(ctx: CanvasRenderingContext2D, hole: Hole): void {
    const b = hole.bounds;
    const cx = b.x + b.w * 0.5;
    const cy = b.y + b.h * 0.5;
    const g = ctx.createRadialGradient(cx, cy, 30, cx, cy, Math.max(b.w, b.h) * 1.15);
    g.addColorStop(0, "#35562c");
    g.addColorStop(0.45, "#2a4524");
    g.addColorStop(1, "#1c3018");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, b.w * 0.82, b.h * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private grain(key: string, colors: string[], specks = 2200): CanvasPattern {
    const cached = this.grainCache.get(key);
    if (cached) return cached;
    const pattern = patternFrom(this.staticCtx, grassTile(key, colors, 128, specks));
    this.grainCache.set(key, pattern);
    return pattern;
  }

  private ensureStatic(hole: Hole): void {
    if (this.staticHole === hole.number) return;
    this.staticHole = hole.number;
    const pad = 8;
    const scale = hole.bounds.w < 280 ? 9 : hole.bounds.w < 420 ? 7.5 : 6.4;
    this.staticCanvas.width = Math.max(64, Math.ceil(hole.bounds.w * scale));
    this.staticCanvas.height = Math.max(64, Math.ceil(hole.bounds.h * scale));
    const ctx = this.staticCtx;
    ctx.setTransform(scale, 0, 0, scale, -hole.bounds.x * scale, -hole.bounds.y * scale);
    ctx.clearRect(hole.bounds.x - pad, hole.bounds.y - pad, hole.bounds.w + pad * 2, hole.bounds.h + pad * 2);
    this.drawRough(ctx, hole);
    this.drawFairway(ctx, hole);
    this.drawTee(ctx, hole);
    for (const bunker of hole.bunkers) this.drawBunker(ctx, bunker, hole.number);
    for (const tree of hole.trees) this.drawTree(ctx, tree);
  }

  private clipPolys(ctx: CanvasRenderingContext2D, polys: Vec2[][]): void {
    ctx.beginPath();
    for (const poly of polys) {
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
    }
    ctx.clip();
  }

  private drawRough(ctx: CanvasRenderingContext2D, hole: Hole): void {
    for (const poly of hole.rough) {
      this.pathPoly(ctx, poly);
      ctx.fillStyle = "#1c4020";
      ctx.fill();
    }
    ctx.save();
    this.clipPolys(ctx, hole.rough);
    ctx.fillStyle = this.grain(`rough-${hole.number}`, ["#1c4020", "#143218", "#2a5a28", "#0e2412", "#3a6a30"], 2800);
    ctx.fillRect(hole.bounds.x, hole.bounds.y, hole.bounds.w, hole.bounds.h);
    const rng = mulberry32(hashString(`tuft-${hole.number}`));
    ctx.strokeStyle = "rgba(8, 28, 12, 0.4)";
    ctx.lineWidth = 0.42;
    ctx.lineCap = "round";
    for (let i = 0; i < 420; i++) {
      const x = hole.bounds.x + rng() * hole.bounds.w;
      const y = hole.bounds.y + rng() * hole.bounds.h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 2.8, y - 1.6 - rng() * 1.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFairway(ctx: CanvasRenderingContext2D, hole: Hole): void {
    const heading = angleTo(hole.tee, hole.pin);
    for (const poly of hole.fairway) {
      this.pathPoly(ctx, poly);
      const minX = Math.min(...poly.map((p) => p.x));
      const maxX = Math.max(...poly.map((p) => p.x));
      const minY = Math.min(...poly.map((p) => p.y));
      const maxY = Math.max(...poly.map((p) => p.y));
      const base = ctx.createLinearGradient(minX, minY, maxX + 20, maxY + 10);
      base.addColorStop(0, "#4f9a46");
      base.addColorStop(0.4, "#7ed45f");
      base.addColorStop(1, "#3f8640");
      ctx.fillStyle = base;
      ctx.fill();
    }

    ctx.save();
    this.clipPolys(ctx, hole.fairway);
    ctx.fillStyle = this.grain(`fw-${hole.number}`, ["#68b85a", "#8ed66c", "#4e9a48", "#a8e878", "#3f8a40"], 2600);
    ctx.globalAlpha = 0.62;
    ctx.fillRect(hole.bounds.x, hole.bounds.y, hole.bounds.w, hole.bounds.h);
    ctx.globalAlpha = 1;

    const rng = mulberry32(hashString(`mottle-${hole.number}`));
    for (let i = 0; i < 28; i++) {
      const x = hole.bounds.x + rng() * hole.bounds.w;
      const y = hole.bounds.y + rng() * hole.bounds.h;
      const mott = ctx.createRadialGradient(x, y, 0.4, x, y, 8 + rng() * 10);
      mott.addColorStop(0, rng() > 0.5 ? "rgba(255, 230, 140, 0.16)" : "rgba(20, 70, 30, 0.16)");
      mott.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = mott;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    const stripeW = 7.2;
    const span = Math.hypot(hole.bounds.w, hole.bounds.h) + 90;
    ctx.translate((hole.tee.x + hole.pin.x) / 2, (hole.tee.y + hole.pin.y) / 2);
    ctx.rotate(heading);
    for (let i = -32; i < 32; i++) {
      const x0 = i * stripeW;
      const band = ctx.createLinearGradient(x0, 0, x0 + stripeW, 0);
      if (i % 2 === 0) {
        band.addColorStop(0, "rgba(255, 244, 180, 0.42)");
        band.addColorStop(0.4, "rgba(200, 230, 140, 0.08)");
        band.addColorStop(1, "rgba(18, 64, 28, 0.3)");
      } else {
        band.addColorStop(0, "rgba(16, 52, 24, 0.34)");
        band.addColorStop(0.55, "rgba(70, 120, 50, 0.05)");
        band.addColorStop(1, "rgba(255, 236, 170, 0.26)");
      }
      ctx.fillStyle = band;
      ctx.fillRect(x0, -span, stripeW, span * 2);
    }
    ctx.restore();

    ctx.save();
    ctx.shadowColor = "rgba(10, 28, 12, 0.5)";
    ctx.shadowBlur = 14;
    ctx.strokeStyle = "rgba(22, 58, 26, 0.0)";
    ctx.lineWidth = 4.5;
    for (const poly of hole.fairway) {
      this.pathPoly(ctx, poly);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(30, 70, 32, 0.35)";
    ctx.lineWidth = 2.2;
    for (const poly of hole.fairway) {
      this.pathPoly(ctx, poly);
      ctx.stroke();
    }
  }

  private drawFairwaySheen(ctx: CanvasRenderingContext2D, session: GameSession, hole: Hole): void {
    if (!hole.fairway.length) return;
    const heading = angleTo(hole.tee, hole.pin);
    const view = Math.atan2(session.cam.y - (hole.tee.y + hole.pin.y) * 0.5, session.cam.x - (hole.tee.x + hole.pin.x) * 0.5);
    const slide = Math.cos(heading - view + this.time * 0.12) * 0.5 + 0.5;
    ctx.save();
    this.clipPolys(ctx, hole.fairway);
    ctx.translate((hole.tee.x + hole.pin.x) / 2, (hole.tee.y + hole.pin.y) / 2);
    ctx.rotate(heading + 0.08);
    const span = Math.hypot(hole.bounds.w, hole.bounds.h);
    const sheen = ctx.createLinearGradient(-span, 0, span, 0);
    sheen.addColorStop(0, "rgba(10, 40, 16, 0.1)");
    sheen.addColorStop(clamp(0.25 + slide * 0.35, 0.1, 0.8), "rgba(255, 236, 170, 0.16)");
    sheen.addColorStop(1, "rgba(12, 40, 20, 0.12)");
    ctx.fillStyle = sheen;
    ctx.fillRect(-span, -span, span * 2, span * 2);
    ctx.restore();
  }

  private drawNearGrass(ctx: CanvasRenderingContext2D, session: GameSession, hole: Hole): void {
    const zoom = session.cam.zoom;
    if (zoom < 5.5 || session.lie === "green") return;
    const halfW = this.w / zoom / 2;
    const halfH = this.h / zoom / 2;
    const minX = session.cam.x - halfW;
    const minY = session.cam.y - halfH;
    ctx.save();
    this.clipPolys(ctx, hole.fairway);
    ctx.lineCap = "round";
    const density = 90;
    for (let i = 0; i < density; i++) {
      const x = minX + hashNoise(i * 1.7, 9.2) * halfW * 2;
      const y = minY + hashNoise(i * 3.1 + 4, 4.4) * halfH * 2;
      const n = hashNoise(x * 0.35, y * 0.35);
      ctx.globalAlpha = 0.08 + n * 0.14;
      ctx.strokeStyle = n > 0.55 ? "rgba(210, 240, 150, 0.7)" : "rgba(20, 60, 24, 0.55)";
      ctx.lineWidth = 0.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (n - 0.5) * 0.9, y - 0.45 - n * 0.35);
      ctx.stroke();
    }
    ctx.restore();
  }

  private pathPoly(ctx: CanvasRenderingContext2D, poly: Vec2[]): void {
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
  }

  private drawTee(ctx: CanvasRenderingContext2D, hole: Hole): void {
    ctx.save();
    ctx.translate(hole.tee.x, hole.tee.y);
    ctx.rotate(angleTo(hole.tee, hole.pin));
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    this.roundRect(ctx, -9.4, -6.2, 19, 14, 3);
    ctx.fill();
    const tee = ctx.createLinearGradient(-10, -8, 10, 8);
    tee.addColorStop(0, "#8ee070");
    tee.addColorStop(1, "#4ea04a");
    ctx.fillStyle = tee;
    this.roundRect(ctx, -9, -6.5, 18, 13, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 250, 210, 0.2)";
    ctx.fillRect(-8, -5.5, 16, 4);
    ctx.fillStyle = "#d4af37";
    ctx.fillRect(-6.2, -1.4, 2.4, 2.8);
    ctx.fillRect(3.8, -1.4, 2.4, 2.8);
    ctx.restore();
  }

  private drawGreen(ctx: CanvasRenderingContext2D, hole: Hole): void {
    const g = hole.green;
    const breakLen = Math.hypot(hole.greenBreak.x, hole.greenBreak.y) || 1;
    const bx = hole.greenBreak.x / breakLen;
    const by = hole.greenBreak.y / breakLen;
    ctx.save();
    ctx.translate(g.cx, g.cy);
    ctx.rotate(g.rotation);

    ctx.fillStyle = "rgba(20, 40, 16, 0.28)";
    ctx.beginPath();
    ctx.ellipse(0.8, 1.1, g.rx + 3.6, g.ry + 3.1, 0, 0, Math.PI * 2);
    ctx.fill();

    const collar = ctx.createRadialGradient(-2, -2, 2, 0, 0, Math.max(g.rx, g.ry) + 3);
    collar.addColorStop(0, "#6a9a40");
    collar.addColorStop(1, "#3d6a2c");
    ctx.fillStyle = collar;
    ctx.beginPath();
    ctx.ellipse(0, 0, g.rx + 3.4, g.ry + 3.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(30, 70, 24, 0.45)";
    ctx.lineWidth = 0.55;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, 0, g.rx, g.ry, 0, 0, Math.PI * 2);
    ctx.clip();
    const highX = -bx * g.rx * 0.6;
    const highY = -by * g.ry * 0.6;
    const body = ctx.createLinearGradient(highX, highY, bx * g.rx * 0.75, by * g.ry * 0.75);
    body.addColorStop(0, "#a8e8b4");
    body.addColorStop(0.35, "#3aaa72");
    body.addColorStop(0.7, "#1f7a4c");
    body.addColorStop(1, "#145534");
    ctx.fillStyle = body;
    ctx.fillRect(-g.rx - 2, -g.ry - 2, g.rx * 2 + 4, g.ry * 2 + 4);

    const bowl = ctx.createRadialGradient(highX * 0.35, highY * 0.35, 1, 0, 0, Math.max(g.rx, g.ry));
    bowl.addColorStop(0, "rgba(220, 255, 210, 0.18)");
    bowl.addColorStop(0.55, "rgba(40, 120, 70, 0.04)");
    bowl.addColorStop(1, "rgba(8, 40, 22, 0.32)");
    ctx.fillStyle = bowl;
    ctx.fillRect(-g.rx - 2, -g.ry - 2, g.rx * 2 + 4, g.ry * 2 + 4);

    ctx.fillStyle = this.grain(`green-${hole.number}`, ["#3faf6a", "#7ed88a", "#2a8a55", "#b8f0c0"], 3000);
    ctx.globalAlpha = 0.22;
    ctx.fillRect(-g.rx - 2, -g.ry - 2, g.rx * 2 + 4, g.ry * 2 + 4);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 0.16;
    for (let i = -18; i <= 18; i++) {
      ctx.beginPath();
      ctx.moveTo(-g.rx, i * 1.05 + bx * 0.8);
      ctx.lineTo(g.rx, i * 1.05 - bx * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawBunker(ctx: CanvasRenderingContext2D, b: Ellipse, holeNumber: number): void {
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.rotate(b.rotation);
    ctx.fillStyle = "rgba(40, 28, 10, 0.4)";
    ctx.beginPath();
    ctx.ellipse(0.8, 1.1, b.rx + 1.4, b.ry + 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a6a32";
    ctx.beginPath();
    ctx.ellipse(0, 0, b.rx + 0.85, b.ry + 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    const sand = ctx.createRadialGradient(-b.rx * 0.3, -b.ry * 0.35, 1, 0, 0, Math.max(b.rx, b.ry));
    sand.addColorStop(0, "#f6e6bc");
    sand.addColorStop(0.6, "#e2c888");
    sand.addColorStop(1, "#c4a05a");
    ctx.fillStyle = sand;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.rx, b.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    const rng = mulberry32(hashString(`bunker-${holeNumber}-${b.cx}-${b.cy}`));
    ctx.strokeStyle = "rgba(170, 130, 70, 0.35)";
    ctx.lineWidth = 0.26;
    for (let i = 0; i < 8; i++) {
      const y = (i / 7 - 0.5) * b.ry * 1.55;
      ctx.beginPath();
      ctx.moveTo(-b.rx * 0.88, y);
      ctx.quadraticCurveTo(0, y + (rng() - 0.5) * 2.4, b.rx * 0.88, y + (rng() - 0.5));
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawTree(ctx: CanvasRenderingContext2D, t: Tree): void {
    const rng = mulberry32(hashString(`tree-${t.x.toFixed(1)}-${t.y.toFixed(1)}`));
    ctx.save();
    ctx.fillStyle = "rgba(8, 14, 8, 0.28)";
    ctx.beginPath();
    ctx.ellipse(t.x + SUN.x * t.r * 1.15, t.y + SUN.y * t.r * 1.15, t.r * 1.15, t.r * 0.38, 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#3d2816";
    ctx.fillRect(t.x - 1.05, t.y - 0.2, 2.1, t.r * 0.55);

    const lobes = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < lobes; i++) {
      const ox = (rng() - 0.5) * t.r * 0.7;
      const oy = -t.r * 0.25 - rng() * t.r * 0.35;
      const rr = t.r * (0.42 + rng() * 0.42);
      const inner = rng() > 0.5 ? "rgba(46, 120, 58, 0.95)" : "rgba(22, 78, 38, 0.95)";
      const grad = ctx.createRadialGradient(t.x + ox - rr * 0.2, t.y + oy - rr * 0.25, rr * 0.1, t.x + ox, t.y + oy, rr);
      grad.addColorStop(0, inner);
      grad.addColorStop(0.7, "rgba(16, 58, 28, 0.88)");
      grad.addColorStop(1, "rgba(10, 36, 18, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(t.x + ox, t.y + oy, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    const hi = ctx.createRadialGradient(t.x - t.r * 0.2, t.y - t.r * 0.5, 0.2, t.x, t.y - t.r * 0.3, t.r * 0.45);
    hi.addColorStop(0, "rgba(190, 230, 150, 0.22)");
    hi.addColorStop(1, "rgba(190, 230, 150, 0)");
    ctx.fillStyle = hi;
    ctx.beginPath();
    ctx.arc(t.x - t.r * 0.15, t.y - t.r * 0.42, t.r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawWater(ctx: CanvasRenderingContext2D, hole: Hole): void {
    for (const water of hole.water) {
      ctx.save();
      this.pathPoly(ctx, water);
      ctx.clip();
      const minX = Math.min(...water.map((p) => p.x));
      const maxX = Math.max(...water.map((p) => p.x));
      const minY = Math.min(...water.map((p) => p.y));
      const maxY = Math.max(...water.map((p) => p.y));
      const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
      g.addColorStop(0, "#1d86b8");
      g.addColorStop(0.45, "#0c4f7a");
      g.addColorStop(1, "#08344f");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(210, 240, 255, 0.16)";
      ctx.lineWidth = 0.38;
      for (let y = minY; y < maxY; y += 3.2) {
        ctx.beginPath();
        for (let x = minX; x <= maxX; x += 2.4) {
          const yy = y + Math.sin(x * 0.2 + this.time * 2.1 + y * 0.12) * 1.05;
          if (x === minX) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      const spec = ctx.createLinearGradient(minX, minY, maxX, minY + 12);
      spec.addColorStop(0.35, "rgba(255,255,255,0)");
      spec.addColorStop(0.5, "rgba(255,255,255,0.22)");
      spec.addColorStop(0.65, "rgba(255,255,255,0)");
      ctx.fillStyle = spec;
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      ctx.restore();
      ctx.strokeStyle = "rgba(230, 245, 255, 0.4)";
      ctx.lineWidth = 0.9;
      this.pathPoly(ctx, water);
      ctx.stroke();
      ctx.strokeStyle = "rgba(190, 220, 160, 0.3)";
      ctx.lineWidth = 2.1;
      this.pathPoly(ctx, water);
      ctx.stroke();
    }
  }

  private drawPin(ctx: CanvasRenderingContext2D, hole: Hole): void {
    const p = hole.pin;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(p.x + 1.8, p.y + 1.4, 2.6, 1.15, 0.2, 0, Math.PI * 2);
    ctx.fill();

    const cup = ctx.createRadialGradient(p.x - 0.2, p.y - 0.25, 0.12, p.x, p.y, CUP_RADIUS * 1.05);
    cup.addColorStop(0, "#111");
    cup.addColorStop(0.62, "#070707");
    cup.addColorStop(0.82, "#cbb892");
    cup.addColorStop(1, "#efe4c4");
    ctx.fillStyle = cup;
    ctx.beginPath();
    ctx.arc(p.x, p.y, CUP_RADIUS * 0.78, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 246, 220, 0.9)";
    ctx.lineWidth = 0.26;
    ctx.stroke();

    ctx.strokeStyle = "#f8f4ea";
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y - 13);
    ctx.stroke();
    const wave = Math.sin(this.time * 3.1) * 0.9;
    ctx.fillStyle = "#d32f2f";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 13);
    ctx.lineTo(p.x + 7.4 + wave, p.y - 10.4);
    ctx.lineTo(p.x, p.y - 7.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#8e1f1f";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 10.5);
    ctx.lineTo(p.x + 7.4 + wave, p.y - 10.4);
    ctx.lineTo(p.x, p.y - 7.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawAim(ctx: CanvasRenderingContext2D, session: GameSession, hole: Hole): void {
    if (session.screen !== "play") return;
    if (session.swingPhase !== "aim" && session.swingPhase !== "power" && session.swingPhase !== "accuracy") return;
    const from = session.ball.pos;
    const dir = fromAngle(session.aim, 1);
    const preview = session.previewLanding();
    const path = session.previewFlight();
    ctx.save();
    ctx.strokeStyle = "rgba(244, 241, 232, 0.45)";
    ctx.setLineDash([2.2, 1.6]);
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(from.x + dir.x * 28, from.y + dir.y * 28);
    ctx.stroke();
    ctx.setLineDash([]);

    if (path.length > 1 && session.club().id !== "putter") {
      this.drawRibbon(ctx, path, 0.14);
      this.strokeFlight(ctx, path, "rgba(0,0,0,0.2)", true, 1.1);
      this.strokeFlight(ctx, path, "rgba(255, 228, 130, 0.95)", false, 1.2);
    } else {
      ctx.strokeStyle = "rgba(212, 175, 55, 0.85)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(preview.x, preview.y);
      ctx.stroke();
    }
    ctx.fillStyle = "#f0d78a";
    ctx.beginPath();
    ctx.arc(preview.x, preview.y, 1.25, 0, Math.PI * 2);
    ctx.fill();
    if (session.lie === "green") {
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 0.35;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(from.x + hole.greenBreak.x * 8, from.y + hole.greenBreak.y * 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawShotArc(ctx: CanvasRenderingContext2D, session: GameSession): void {
    if (session.swingPhase !== "flight" && session.swingPhase !== "settle") return;
    if (session.shotArc.length < 2) return;
    ctx.save();
    this.drawRibbon(ctx, session.shotArc, 0.28);
    this.strokeFlight(ctx, session.shotArc, "rgba(0,0,0,0.24)", true, 1.3);
    this.strokeFlight(ctx, session.shotArc, "rgba(255, 228, 130, 0.96)", false, 1.7);
    const apex = session.shotArc.reduce((best, s) => (s.z > best.z ? s : best), session.shotArc[0]);
    if (apex.z > 3) {
      const ap = airbornePos(apex.pos, apex.z);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 0.26;
      ctx.setLineDash([0.75, 0.5]);
      ctx.beginPath();
      ctx.moveTo(apex.pos.x, apex.pos.y);
      ctx.lineTo(ap.x, ap.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255, 250, 220, 0.95)";
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawRibbon(ctx: CanvasRenderingContext2D, path: FlightSample[], alpha: number): void {
    if (path.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(path[0].pos.x, path[0].pos.y);
    for (const sample of path) {
      const air = airbornePos(sample.pos, sample.z);
      ctx.lineTo(air.x, air.y);
    }
    for (let i = path.length - 1; i >= 0; i--) ctx.lineTo(path[i].pos.x, path[i].pos.y);
    ctx.closePath();
    ctx.fillStyle = `rgba(255, 214, 110, ${alpha})`;
    ctx.fill();
  }

  private strokeFlight(ctx: CanvasRenderingContext2D, path: FlightSample[], color: string, ground: boolean, width: number): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    path.forEach((sample, i) => {
      const p = ground ? sample.pos : airbornePos(sample.pos, sample.z);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  private drawBall(ctx: CanvasRenderingContext2D, session: GameSession): void {
    const b = session.ball;
    const air = Math.max(0, b.z);
    const ground = b.pos;
    const vis = airbornePos(ground, air);
    const flying = air > 0.08;
    if (this.trail.length > 1 && (session.swingPhase === "flight" || session.swingPhase === "settle" || this.trail.some((p) => p.z > 0.2))) {
      this.drawTrail(ctx);
    }

    ctx.save();
    const shadow = ctx.createRadialGradient(ground.x + air * 0.1, ground.y + 0.4, 0.2, ground.x, ground.y, 2.4 + air * 0.12);
    shadow.addColorStop(0, `rgba(0,0,0,${clamp(0.4 - air * 0.012, 0.12, 0.4)})`);
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(ground.x + 0.7, ground.y + 0.9, 1.8 + air * 0.1, 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    if (flying) {
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 0.2;
      ctx.setLineDash([0.65, 0.5]);
      ctx.beginPath();
      ctx.moveTo(ground.x, ground.y);
      ctx.lineTo(vis.x, vis.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const r = 1.22 + air * 0.06;
    const grad = ctx.createRadialGradient(vis.x - r * 0.38, vis.y - r * 0.42, r * 0.08, vis.x, vis.y, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.45, "#f4f0e6");
    grad.addColorStop(1, "#b8b2a4");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(vis.x, vis.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(40,40,40,0.22)";
    ctx.lineWidth = 0.12;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.arc(vis.x - r * 0.15, vis.y - r * 0.1, r * 0.55, 0.2, 2.2);
    ctx.stroke();
    ctx.restore();
  }

  private drawTrail(ctx: CanvasRenderingContext2D): void {
    if (this.trail.length < 2) return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      const pa = airbornePos(a, a.z);
      const pb = airbornePos(b, b.z);
      const t = i / this.trail.length;
      ctx.strokeStyle = `rgba(255, 236, 180, ${0.08 + t * 0.55})`;
      ctx.lineWidth = 0.35 + t * 0.9;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawRings(ctx: CanvasRenderingContext2D): void {
    for (const ring of this.rings) {
      const t = 1 - ring.life / ring.max;
      ctx.strokeStyle = `rgba(220, 240, 180, ${0.4 * (1 - t)})`;
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, 1.2 + t * 7, 0.7 + t * 3.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private updateParticles(dt: number): void {
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 6 * dt;
      return p.life > 0;
    });
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private applyCamera(ctx: CanvasRenderingContext2D, session: GameSession): void {
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(session.cam.zoom, session.cam.zoom);
    ctx.translate(-session.cam.x, -session.cam.y);
  }

  private updateCamera(session: GameSession, dt: number): void {
    if (session.camHold) return;
    const hole = session.hole();
    const putting = session.lie === "green";
    const fit = Math.min(this.w / (hole.bounds.w + 36), this.h / (hole.bounds.h + 72));
    const pinD = dist(session.ball.pos, hole.pin);
    const visual = airbornePos(session.ball.pos, session.ball.z);
    let tx = session.ball.pos.x;
    let ty = session.ball.pos.y;
    let zoomTarget = fit * 0.92;
    let follow = 0.002;
    if (session.screen !== "play") {
      tx = hole.bounds.x + hole.bounds.w * 0.55;
      ty = hole.bounds.y + hole.bounds.h * 0.5;
      zoomTarget = fit * 0.88;
    } else if (session.swingPhase === "flight" || session.swingPhase === "settle") {
      let minX = Math.min(session.lastShotPos.x, visual.x, session.ball.pos.x);
      let maxX = Math.max(session.lastShotPos.x, visual.x, session.ball.pos.x);
      let minY = Math.min(session.lastShotPos.y, visual.y, session.ball.pos.y);
      let maxY = Math.max(session.lastShotPos.y, visual.y, session.ball.pos.y);
      for (const sample of session.shotArc) {
        const air = airbornePos(sample.pos, sample.z);
        minX = Math.min(minX, sample.pos.x, air.x);
        maxX = Math.max(maxX, sample.pos.x, air.x);
        minY = Math.min(minY, sample.pos.y, air.y);
        maxY = Math.max(maxY, sample.pos.y, air.y);
      }
      tx = (minX + maxX) / 2;
      ty = (minY + maxY) / 2;
      const spanX = maxX - minX + 36;
      const spanY = maxY - minY + 40;
      zoomTarget = clamp(Math.min(this.w / spanX, this.h / spanY) * 0.82, 2.1, putting ? 8 : 5.4);
      follow = 0.00018;
    } else if (putting) {
      tx = (session.ball.pos.x + hole.pin.x) / 2;
      ty = (session.ball.pos.y + hole.pin.y) / 2;
      zoomTarget = clamp(Math.min(this.w, this.h) / Math.max(pinD * 2.4, 28), 6, 16);
    } else {
      tx = session.ball.pos.x * 0.45 + hole.pin.x * 0.55;
      ty = session.ball.pos.y * 0.45 + hole.pin.y * 0.55;
      const spanX = Math.abs(hole.pin.x - session.ball.pos.x) + 90;
      const spanY = Math.abs(hole.pin.y - session.ball.pos.y) + 90;
      zoomTarget = clamp(Math.min(this.w / spanX, this.h / spanY) * 0.88, 1.35, 5.2);
    }
    const k = 1 - Math.pow(follow, dt);
    session.cam.x += (tx - session.cam.x) * k;
    session.cam.y += (ty - session.cam.y) * k;
    session.cam.zoom += (zoomTarget - session.cam.zoom) * k;
  }

  private drawAtmosphere(ctx: CanvasRenderingContext2D): void {
    const haze = ctx.createLinearGradient(0, 0, 0, this.h);
    haze.addColorStop(0, "rgba(180, 210, 230, 0.1)");
    haze.addColorStop(0.45, "rgba(180, 210, 230, 0)");
    haze.addColorStop(1, "rgba(20, 30, 16, 0.12)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, this.w, this.h);
    const vig = ctx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.2, this.w / 2, this.h / 2, this.w * 0.78);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private drawMinimap(ctx: CanvasRenderingContext2D, session: GameSession): void {
    const hole = session.hole();
    const mw = 148;
    const mh = 88;
    const x = this.w - mw - 22;
    const y = 58;
    ctx.save();
    ctx.fillStyle = "rgba(6, 12, 10, 0.48)";
    this.roundRect(ctx, x - 6, y - 6, mw + 12, mh + 12, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const s = Math.min(mw / hole.bounds.w, mh / hole.bounds.h);
    ctx.translate(x + (mw - hole.bounds.w * s) / 2 - hole.bounds.x * s, y + (mh - hole.bounds.h * s) / 2 - hole.bounds.y * s);
    ctx.scale(s, s);
    ctx.fillStyle = "#1f4a28";
    for (const poly of hole.rough) {
      this.pathPoly(ctx, poly);
      ctx.fill();
    }
    ctx.fillStyle = "#6fbf62";
    for (const poly of hole.fairway) {
      this.pathPoly(ctx, poly);
      ctx.fill();
    }
    ctx.fillStyle = "#0c4f7a";
    for (const water of hole.water) {
      this.pathPoly(ctx, water);
      ctx.fill();
    }
    ctx.fillStyle = "#e2c888";
    for (const b of hole.bunkers) {
      ctx.beginPath();
      ctx.ellipse(b.cx, b.cy, b.rx, b.ry, b.rotation, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#3faf6a";
    ctx.beginPath();
    ctx.ellipse(hole.green.cx, hole.green.cy, hole.green.rx, hole.green.ry, hole.green.rotation, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c62828";
    ctx.beginPath();
    ctx.arc(hole.pin.x, hole.pin.y, 2.2 / s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(session.ball.pos.x, session.ball.pos.y, 2.3 / s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawMeters(ctx: CanvasRenderingContext2D, session: GameSession): void {
    const x = this.w - 36;
    const y = this.h * 0.28;
    const h = Math.min(240, this.h * 0.36);
    ctx.save();
    ctx.fillStyle = "rgba(6, 12, 10, 0.35)";
    this.roundRect(ctx, x - 10, y - 18, 28, h + 36, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "600 9px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PWR", x + 4, y - 6);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    this.roundRect(ctx, x, y, 8, h, 4);
    ctx.fill();
    const g = ctx.createLinearGradient(0, y + h, 0, y);
    g.addColorStop(0, "#2e7d32");
    g.addColorStop(0.7, "#d4af37");
    g.addColorStop(1, "#c62828");
    ctx.fillStyle = g;
    const fill = session.swingPhase === "aim" ? 0 : session.swingPhase === "power" ? session.meter : session.power;
    this.roundRect(ctx, x + 1, y + h - h * fill, 6, h * fill, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(x - 2, y + 8, 12, 2);
    ctx.restore();

    if (session.swingPhase !== "flight" && session.swingPhase !== "settle" && (session.swingPhase === "accuracy" || session.lockedAccuracy)) {
      const bx = this.w / 2 - 120;
      const by = this.h - 92;
      ctx.fillStyle = "rgba(6, 12, 10, 0.45)";
      this.roundRect(ctx, bx - 8, by - 8, 256, 28, 8);
      ctx.fill();
      ctx.fillStyle = "#222";
      this.roundRect(ctx, bx, by, 240, 10, 5);
      ctx.fill();
      ctx.fillStyle = "#2e7d32";
      ctx.fillRect(bx + 108, by, 24, 10);
      ctx.fillStyle = "#d4af37";
      ctx.fillRect(bx + 116, by, 8, 10);
      const t = session.swingPhase === "accuracy" ? session.meter * 2 - 1 : session.accuracy;
      const mx = bx + 120 + t * 120;
      ctx.fillStyle = "#f4f1e8";
      ctx.beginPath();
      ctx.moveTo(mx, by - 3);
      ctx.lineTo(mx - 4, by + 16);
      ctx.lineTo(mx + 4, by + 16);
      ctx.fill();
    }
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
