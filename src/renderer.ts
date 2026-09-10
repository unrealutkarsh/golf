import type { GameSession } from "./game";
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

const LIFT_X = 0.2;
const LIFT_Y = 0.98;

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
    ctx.drawImage(
      this.staticCanvas,
      hole.bounds.x,
      hole.bounds.y,
      hole.bounds.w,
      hole.bounds.h,
    );
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
    this.drawVignette(ctx);
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
      if (this.trail.length === 1 && b.z < 1.2) {
        this.burst(b.pos, "#c6d89a", 12, 16);
      }
      if (this.prevZ > 2.2 && b.z <= 0.08) {
        this.burst(b.pos, "#d8e8b0", 16, 14);
        this.rings.push({ x: b.pos.x, y: b.pos.y, life: 0.55, max: 0.55 });
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
    g.addColorStop(0, "#16324a");
    g.addColorStop(0.38, "#24586a");
    g.addColorStop(0.72, "#2f6a4a");
    g.addColorStop(1, "#163221");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);

    const sunX = this.w * 0.78;
    const sunY = this.h * 0.16;
    const sun = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, this.w * 0.42);
    sun.addColorStop(0, "rgba(255, 228, 160, 0.55)");
    sun.addColorStop(0.18, "rgba(255, 200, 110, 0.18)");
    sun.addColorStop(1, "rgba(255, 200, 110, 0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.fillStyle = "rgba(255, 236, 190, 0.9)";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(236, 246, 255, 0.1)";
    this.drawCloud(ctx, this.w * 0.18, this.h * 0.12, 70);
    this.drawCloud(ctx, this.w * 0.42, this.h * 0.08, 90);
    this.drawCloud(ctx, this.w * 0.88, this.h * 0.2, 54);
  }

  private drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.38, 0, 0, Math.PI * 2);
    ctx.ellipse(x - r * 0.45, y + 4, r * 0.55, r * 0.28, 0, 0, Math.PI * 2);
    ctx.ellipse(x + r * 0.4, y + 6, r * 0.48, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private ensureStatic(hole: Hole): void {
    if (this.staticHole === hole.number) return;
    this.staticHole = hole.number;
    const pad = 6;
    const scale = hole.bounds.w < 300 ? 7 : 5.5;
    this.staticCanvas.width = Math.max(64, Math.ceil(hole.bounds.w * scale));
    this.staticCanvas.height = Math.max(64, Math.ceil(hole.bounds.h * scale));
    const ctx = this.staticCtx;
    ctx.setTransform(scale, 0, 0, scale, -hole.bounds.x * scale, -hole.bounds.y * scale);
    this.drawOutOfBounds(ctx, hole, pad);
    this.drawRough(ctx, hole);
    this.drawFairway(ctx, hole);
    this.drawTee(ctx, hole);
    for (const b of hole.bunkers) this.drawBunker(ctx, b, hole.number);
    for (const t of hole.trees) this.drawTree(ctx, t);
    this.drawLightWash(ctx, hole);
  }

  private drawOutOfBounds(ctx: CanvasRenderingContext2D, hole: Hole, pad: number): void {
    const g = ctx.createLinearGradient(hole.bounds.x, hole.bounds.y, hole.bounds.x, hole.bounds.y + hole.bounds.h);
    g.addColorStop(0, "#102016");
    g.addColorStop(1, "#0a160f");
    ctx.fillStyle = g;
    ctx.fillRect(hole.bounds.x - pad, hole.bounds.y - pad, hole.bounds.w + pad * 2, hole.bounds.h + pad * 2);
  }

  private grain(ctx: CanvasRenderingContext2D, key: string, colors: string[], seed: number): CanvasPattern {
    const cached = this.grainCache.get(key);
    if (cached) return cached;
    const tile = document.createElement("canvas");
    tile.width = 64;
    tile.height = 64;
    const t = tile.getContext("2d");
    if (!t) throw new Error("Grain canvas unavailable");
    const rng = mulberry32(seed);
    t.fillStyle = colors[0];
    t.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 520; i++) {
      t.globalAlpha = 0.12 + rng() * 0.38;
      t.fillStyle = colors[1 + Math.floor(rng() * (colors.length - 1))];
      const w = 0.7 + rng() * 2.2;
      const h = 0.5 + rng() * 1.8;
      t.fillRect(rng() * 64, rng() * 64, w, h);
    }
    t.globalAlpha = 1;
    const pattern = ctx.createPattern(tile, "repeat");
    if (!pattern) throw new Error("Grain pattern unavailable");
    this.grainCache.set(key, pattern);
    return pattern;
  }

  private drawRough(ctx: CanvasRenderingContext2D, hole: Hole): void {
    const pattern = this.grain(ctx, `rough-${hole.number}`, ["#245628", "#1b4520", "#326a30", "#16381a", "#3d7a36"], hashString(`rough-${hole.number}`));
    for (const poly of hole.rough) {
      this.pathPoly(ctx, poly);
      ctx.fillStyle = "#1f4d24";
      ctx.fill();
      ctx.fillStyle = pattern;
      ctx.globalAlpha = 0.72;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#1c3f20";
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
    const rng = mulberry32(hashString(`tuft-${hole.number}`));
    ctx.save();
    for (const poly of hole.rough) {
      this.pathPoly(ctx, poly);
      ctx.clip();
    }
    ctx.strokeStyle = "rgba(20, 48, 22, 0.28)";
    ctx.lineWidth = 0.35;
    for (let i = 0; i < 220; i++) {
      const x = hole.bounds.x + rng() * hole.bounds.w;
      const y = hole.bounds.y + rng() * hole.bounds.h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 2.4, y - 1.1 - rng());
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFairway(ctx: CanvasRenderingContext2D, hole: Hole): void {
    const heading = angleTo(hole.tee, hole.pin);
    const pattern = this.grain(ctx, `fw-${hole.number}`, ["#6fbf5f", "#8ed46c", "#57a852", "#79c864", "#9adf78"], hashString(`fw-${hole.number}`));
    for (const poly of hole.fairway) {
      this.pathPoly(ctx, poly);
      const minX = Math.min(...poly.map((p) => p.x));
      const maxX = Math.max(...poly.map((p) => p.x));
      const minY = Math.min(...poly.map((p) => p.y));
      const maxY = Math.max(...poly.map((p) => p.y));
      const base = ctx.createLinearGradient(minX, minY, maxX, maxY);
      base.addColorStop(0, "#5eae55");
      base.addColorStop(0.45, "#86d06a");
      base.addColorStop(1, "#4e9a4c");
      ctx.fillStyle = base;
      ctx.fill();
      ctx.fillStyle = pattern;
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.save();
    for (const poly of hole.fairway) {
      this.pathPoly(ctx, poly);
      ctx.clip();
    }
    const stripeW = 6.4;
    const span = Math.hypot(hole.bounds.w, hole.bounds.h) + 80;
    ctx.translate((hole.tee.x + hole.pin.x) / 2, (hole.tee.y + hole.pin.y) / 2);
    ctx.rotate(heading);
    for (let i = -28; i < 28; i++) {
      const even = i % 2 === 0;
      ctx.fillStyle = even ? "rgba(255, 250, 190, 0.34)" : "rgba(12, 52, 22, 0.28)";
      ctx.fillRect(i * stripeW - span, -span, stripeW, span * 2);
    }
    const sheen = ctx.createLinearGradient(-span, 0, span, 0);
    sheen.addColorStop(0, "rgba(10, 40, 18, 0.22)");
    sheen.addColorStop(0.42, "rgba(255, 236, 170, 0.22)");
    sheen.addColorStop(1, "rgba(12, 42, 20, 0.24)");
    ctx.fillStyle = sheen;
    ctx.fillRect(-span, -span, span * 2, span * 2);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = "rgba(12, 32, 14, 0.45)";
    ctx.shadowBlur = 10;
    ctx.strokeStyle = "rgba(28, 72, 32, 0.55)";
    ctx.lineWidth = 2.4;
    for (const poly of hole.fairway) {
      this.pathPoly(ctx, poly);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(170, 210, 120, 0.28)";
    ctx.lineWidth = 0.7;
    for (const poly of hole.fairway) {
      this.pathPoly(ctx, poly);
      ctx.stroke();
    }
  }

  private drawLightWash(ctx: CanvasRenderingContext2D, hole: Hole): void {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    const g = ctx.createLinearGradient(hole.bounds.x, hole.bounds.y, hole.bounds.x + hole.bounds.w, hole.bounds.y + hole.bounds.h);
    g.addColorStop(0, "rgba(255, 232, 170, 0.38)");
    g.addColorStop(0.55, "rgba(200, 220, 180, 0.1)");
    g.addColorStop(1, "rgba(30, 50, 70, 0.22)");
    ctx.fillStyle = g;
    ctx.fillRect(hole.bounds.x, hole.bounds.y, hole.bounds.w, hole.bounds.h);
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
    const tee = ctx.createLinearGradient(-10, -8, 10, 8);
    tee.addColorStop(0, "#7ad46f");
    tee.addColorStop(1, "#4fa24c");
    ctx.fillStyle = tee;
    this.roundRect(ctx, -9, -6.5, 18, 13, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 245, 200, 0.18)";
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

    ctx.fillStyle = "#5d8f3c";
    ctx.beginPath();
    ctx.ellipse(0, 0, g.rx + 3.1, g.ry + 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7aad4e";
    ctx.beginPath();
    ctx.ellipse(0, 0, g.rx + 2.15, g.ry + 1.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(40, 80, 28, 0.4)";
    ctx.lineWidth = 0.7;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, 0, g.rx, g.ry, 0, 0, Math.PI * 2);
    ctx.clip();
    const highX = -bx * g.rx * 0.55;
    const highY = -by * g.ry * 0.55;
    const lowX = bx * g.rx * 0.7;
    const lowY = by * g.ry * 0.7;
    const body = ctx.createLinearGradient(highX, highY, lowX, lowY);
    body.addColorStop(0, "#b6f09a");
    body.addColorStop(0.38, "#62c868");
    body.addColorStop(1, "#246e3c");
    ctx.fillStyle = body;
    ctx.fillRect(-g.rx - 2, -g.ry - 2, g.rx * 2 + 4, g.ry * 2 + 4);

    const bowl = ctx.createRadialGradient(highX * 0.4, highY * 0.4, 1.2, 0, 0, Math.max(g.rx, g.ry));
    bowl.addColorStop(0, "rgba(210, 255, 190, 0.22)");
    bowl.addColorStop(0.55, "rgba(80, 160, 90, 0.04)");
    bowl.addColorStop(1, "rgba(10, 50, 24, 0.28)");
    ctx.fillStyle = bowl;
    ctx.fillRect(-g.rx - 2, -g.ry - 2, g.rx * 2 + 4, g.ry * 2 + 4);

    ctx.globalAlpha = 0.16;
    ctx.fillStyle = this.grain(ctx, `green-${hole.number}`, ["#6fc86a", "#8edc80", "#4aa058", "#b8f0a4"], hashString(`green-${hole.number}`));
    ctx.fillRect(-g.rx - 2, -g.ry - 2, g.rx * 2 + 4, g.ry * 2 + 4);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 0.28;
    for (let i = 1; i <= 5; i++) {
      ctx.beginPath();
      ctx.ellipse(bx * i * 1.15, by * i * 1.15, g.rx * (1 - i * 0.13), g.ry * (1 - i * 0.13), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(20, 60, 30, 0.12)";
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-g.rx, i * 2.1);
      ctx.lineTo(g.rx, i * 2.1 + bx * 1.4);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(230, 250, 200, 0.22)";
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.ellipse(g.cx, g.cy, g.rx, g.ry, g.rotation, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawBunker(ctx: CanvasRenderingContext2D, b: Ellipse, holeNumber: number): void {
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.rotate(b.rotation);
    ctx.fillStyle = "rgba(90, 70, 32, 0.35)";
    ctx.beginPath();
    ctx.ellipse(0.6, 0.8, b.rx + 1.1, b.ry + 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    const sand = ctx.createRadialGradient(-b.rx * 0.25, -b.ry * 0.3, 1, 0, 0, Math.max(b.rx, b.ry));
    sand.addColorStop(0, "#f3e4b8");
    sand.addColorStop(0.65, "#e0c888");
    sand.addColorStop(1, "#c4a05a");
    ctx.fillStyle = sand;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.rx, b.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    const rng = mulberry32(hashString(`bunker-${holeNumber}-${b.cx}-${b.cy}`));
    ctx.strokeStyle = "rgba(176, 140, 80, 0.35)";
    ctx.lineWidth = 0.28;
    for (let i = 0; i < 7; i++) {
      const y = (i / 6 - 0.5) * b.ry * 1.5;
      ctx.beginPath();
      ctx.moveTo(-b.rx * 0.85, y);
      ctx.quadraticCurveTo(0, y + (rng() - 0.5) * 2.2, b.rx * 0.85, y + (rng() - 0.5));
      ctx.stroke();
    }
    ctx.strokeStyle = "#a8884a";
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.rx, b.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawTree(ctx: CanvasRenderingContext2D, t: Tree): void {
    const rng = mulberry32(hashString(`tree-${t.x.toFixed(1)}-${t.y.toFixed(1)}`));
    ctx.save();
    ctx.fillStyle = "rgba(8, 16, 10, 0.34)";
    ctx.beginPath();
    ctx.ellipse(t.x + 5.4, t.y + 4.8, t.r * 1.1, t.r * 0.4, 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a2e18";
    ctx.fillRect(t.x - 1.2, t.y - 0.4, 2.4, t.r * 0.62);
    ctx.fillStyle = "#0f3f22";
    ctx.beginPath();
    ctx.arc(t.x, t.y - t.r * 0.2, t.r * (0.92 + rng() * 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c6d34";
    ctx.beginPath();
    ctx.arc(t.x - t.r * (0.22 + rng() * 0.12), t.y - t.r * 0.42, t.r * 0.56, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2f8f48";
    ctx.beginPath();
    ctx.arc(t.x + t.r * (0.12 + rng() * 0.12), t.y - t.r * 0.5, t.r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(180, 230, 150, 0.16)";
    ctx.beginPath();
    ctx.arc(t.x - t.r * 0.18, t.y - t.r * 0.48, t.r * 0.22, 0, Math.PI * 2);
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
      g.addColorStop(0, "#1a7eae");
      g.addColorStop(0.45, "#0f5a86");
      g.addColorStop(1, "#0a3d62");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(210, 240, 255, 0.2)";
      ctx.lineWidth = 0.4;
      for (let y = minY; y < maxY; y += 3.4) {
        ctx.beginPath();
        for (let x = minX; x <= maxX; x += 2.6) {
          const yy = y + Math.sin(x * 0.2 + this.time * 2.2 + y * 0.12) * 1.05;
          if (x === minX) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      for (let i = 0; i < 6; i++) {
        const sx = minX + ((i * 37 + this.time * 18) % Math.max(8, maxX - minX));
        const sy = minY + ((i * 19 + this.time * 9) % Math.max(8, maxY - minY));
        ctx.beginPath();
        ctx.ellipse(sx, sy, 1.6, 0.45, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(220, 240, 255, 0.4)";
      ctx.lineWidth = 0.85;
      this.pathPoly(ctx, water);
      ctx.stroke();
      ctx.strokeStyle = "rgba(180, 210, 160, 0.28)";
      ctx.lineWidth = 1.6;
      this.pathPoly(ctx, water);
      ctx.stroke();
    }
  }

  private drawPin(ctx: CanvasRenderingContext2D, hole: Hole): void {
    const p = hole.pin;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(p.x + 1.6, p.y + 1.3, 2.4, 1.15, 0.15, 0, Math.PI * 2);
    ctx.fill();

    const cup = ctx.createRadialGradient(p.x - 0.15, p.y - 0.2, 0.15, p.x, p.y, CUP_RADIUS * 0.95);
    cup.addColorStop(0, "#1a1a1a");
    cup.addColorStop(0.65, "#0b0b0b");
    cup.addColorStop(1, "#d7c7a1");
    ctx.fillStyle = cup;
    ctx.beginPath();
    ctx.arc(p.x, p.y, CUP_RADIUS * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(244, 236, 210, 0.85)";
    ctx.lineWidth = 0.28;
    ctx.stroke();

    ctx.strokeStyle = "#f7f3e8";
    ctx.lineWidth = 0.42;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y - 12.4);
    ctx.stroke();
    const wave = Math.sin(this.time * 3.1) * 0.85;
    ctx.fillStyle = "#c62828";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 12.4);
    ctx.lineTo(p.x + 7.1 + wave, p.y - 10.1);
    ctx.lineTo(p.x, p.y - 7.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#8e1c1c";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 10.1);
    ctx.lineTo(p.x + 7.1 + wave, p.y - 10.1);
    ctx.lineTo(p.x, p.y - 7.7);
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
    ctx.strokeStyle = "rgba(244, 241, 232, 0.55)";
    ctx.setLineDash([2.2, 1.6]);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(from.x + dir.x * 34, from.y + dir.y * 34);
    ctx.stroke();
    ctx.setLineDash([]);

    if (path.length > 1 && session.club().id !== "putter") {
      this.strokeFlight(ctx, path, "rgba(0,0,0,0.18)", true, 1.15);
      this.strokeFlight(ctx, path, "rgba(255, 232, 140, 0.92)", false, 0.85);
      const apex = path.reduce((best, s) => (s.z > best.z ? s : best), path[0]);
      const ap = airbornePos(apex.pos, apex.z);
      ctx.fillStyle = "rgba(255, 248, 210, 0.9)";
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, 1.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 0.28;
      ctx.beginPath();
      ctx.moveTo(apex.pos.x, apex.pos.y);
      ctx.lineTo(ap.x, ap.y);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(212, 175, 55, 0.85)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(preview.x, preview.y);
      ctx.stroke();
    }

    ctx.fillStyle = "#d4af37";
    ctx.beginPath();
    ctx.arc(preview.x, preview.y, 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 0.28;
    ctx.stroke();
    if (session.lie === "green") {
      const b = hole.greenBreak;
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(from.x + b.x * 8, from.y + b.y * 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawShotArc(ctx: CanvasRenderingContext2D, session: GameSession): void {
    if (session.swingPhase !== "flight" && session.swingPhase !== "settle") return;
    if (session.shotArc.length < 2) return;
    ctx.save();
    this.strokeFlight(ctx, session.shotArc, "rgba(0,0,0,0.22)", true, 1.25);
    this.strokeFlight(ctx, session.shotArc, "rgba(255, 226, 120, 0.88)", false, 1.15);
    const apex = session.shotArc.reduce((best, s) => (s.z > best.z ? s : best), session.shotArc[0]);
    if (apex.z > 3) {
      const ap = airbornePos(apex.pos, apex.z);
      ctx.strokeStyle = "rgba(255,255,255,0.32)";
      ctx.lineWidth = 0.28;
      ctx.setLineDash([0.8, 0.55]);
      ctx.beginPath();
      ctx.moveTo(apex.pos.x, apex.pos.y);
      ctx.lineTo(ap.x, ap.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255, 248, 210, 0.95)";
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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
    const shadowAlpha = clamp(0.34 - air * 0.012, 0.1, 0.34);
    ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(ground.x + 0.9 + air * 0.12, ground.y + 1.05 + air * 0.08, 1.55 + air * 0.09, 0.72 + air * 0.02, 0, 0, Math.PI * 2);
    ctx.fill();

    if (flying) {
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 0.22;
      ctx.setLineDash([0.7, 0.55]);
      ctx.beginPath();
      ctx.moveTo(ground.x, ground.y);
      ctx.lineTo(vis.x, vis.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const r = 1.18 + air * 0.055;
    const grad = ctx.createRadialGradient(vis.x - r * 0.35, vis.y - r * 0.4, r * 0.12, vis.x, vis.y, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.55, "#f2efe6");
    grad.addColorStop(1, "#c8c3b6");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(vis.x, vis.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(40,40,40,0.28)";
    ctx.lineWidth = 0.14;
    ctx.stroke();
    if (flying) {
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 0.18;
      ctx.beginPath();
      ctx.arc(vis.x, vis.y, r + 0.35, 0, Math.PI * 1.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawTrail(ctx: CanvasRenderingContext2D): void {
    if (this.trail.length < 2) return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.16)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    this.trail.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      const pa = airbornePos(a, a.z);
      const pb = airbornePos(b, b.z);
      const t = i / this.trail.length;
      ctx.strokeStyle = `rgba(255, 236, 170, ${0.15 + t * 0.7})`;
      ctx.lineWidth = 0.45 + t * 1.15;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    const apex = this.trail.reduce((best, p) => (p.z > best.z ? p : best), this.trail[0]);
    if (apex.z > 4) {
      const ap = airbornePos(apex, apex.z);
      ctx.fillStyle = "rgba(255, 250, 220, 0.55)";
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawRings(ctx: CanvasRenderingContext2D): void {
    for (const ring of this.rings) {
      const t = 1 - ring.life / ring.max;
      ctx.strokeStyle = `rgba(220, 240, 180, ${0.45 * (1 - t)})`;
      ctx.lineWidth = 0.45;
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

  private drawMinimap(ctx: CanvasRenderingContext2D, session: GameSession): void {
    const hole = session.hole();
    const mw = 196;
    const mh = 118;
    const x = this.w - mw - 18;
    const y = 86;
    ctx.save();
    ctx.fillStyle = "rgba(8, 16, 12, 0.78)";
    this.roundRect(ctx, x - 8, y - 8, mw + 16, mh + 16, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(212, 175, 55, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const sx = mw / hole.bounds.w;
    const sy = mh / hole.bounds.h;
    const s = Math.min(sx, sy);
    const ox = x + (mw - hole.bounds.w * s) / 2 - hole.bounds.x * s;
    const oy = y + (mh - hole.bounds.h * s) / 2 - hole.bounds.y * s;
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    ctx.fillStyle = "#2a5c2e";
    for (const poly of hole.rough) {
      this.pathPoly(ctx, poly);
      ctx.fill();
    }
    ctx.fillStyle = "#6fbf62";
    for (const poly of hole.fairway) {
      this.pathPoly(ctx, poly);
      ctx.fill();
    }
    ctx.fillStyle = "#0f5a86";
    for (const water of hole.water) {
      this.pathPoly(ctx, water);
      ctx.fill();
    }
    ctx.fillStyle = "#e0c888";
    for (const b of hole.bunkers) {
      ctx.beginPath();
      ctx.ellipse(b.cx, b.cy, b.rx, b.ry, b.rotation, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#6a9a48";
    ctx.beginPath();
    ctx.ellipse(hole.green.cx, hole.green.cy, hole.green.rx + 2, hole.green.ry + 2, hole.green.rotation, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7ed67c";
    ctx.beginPath();
    ctx.ellipse(hole.green.cx, hole.green.cy, hole.green.rx, hole.green.ry, hole.green.rotation, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c62828";
    ctx.beginPath();
    ctx.arc(hole.pin.x, hole.pin.y, 2.4 / s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(session.ball.pos.x, session.ball.pos.y, 2.6 / s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#d4af37";
    ctx.font = "600 10px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`HOLE ${hole.number} MAP`, x, y - 14);
  }

  private drawVignette(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.18, this.w / 2, this.h / 2, this.w * 0.74);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.72, "rgba(0,0,0,0.08)");
    g.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private drawMeters(ctx: CanvasRenderingContext2D, session: GameSession): void {
    const x = this.w - 54;
    const y = this.h * 0.22;
    const h = Math.min(280, this.h * 0.42);
    ctx.save();
    ctx.fillStyle = "rgba(8, 16, 12, 0.62)";
    this.roundRect(ctx, x - 18, y - 28, 50, h + 64, 10);
    ctx.fill();
    ctx.fillStyle = "#d4af37";
    ctx.font = "600 11px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("POWER", x + 7, y - 10);
    ctx.fillStyle = "#1a1a1a";
    this.roundRect(ctx, x, y, 14, h, 6);
    ctx.fill();
    const g = ctx.createLinearGradient(0, y + h, 0, y);
    g.addColorStop(0, "#2e7d32");
    g.addColorStop(0.7, "#d4af37");
    g.addColorStop(1, "#c62828");
    ctx.fillStyle = g;
    const fill = session.swingPhase === "aim" ? 0 : session.swingPhase === "power" ? session.meter : session.power;
    this.roundRect(ctx, x + 1, y + h - h * fill, 12, h * fill, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(x - 3, y + 8, 20, 3);
    if (session.swingPhase === "power" || session.swingPhase === "accuracy") {
      const my = y + h - h * (session.swingPhase === "power" ? session.meter : session.power);
      ctx.fillStyle = "#f4f1e8";
      ctx.beginPath();
      ctx.moveTo(x - 8, my);
      ctx.lineTo(x - 2, my - 4);
      ctx.lineTo(x - 2, my + 4);
      ctx.fill();
    }
    ctx.restore();

    if (session.swingPhase !== "flight" && session.swingPhase !== "settle" && (session.swingPhase === "accuracy" || session.lockedAccuracy)) {
      const bx = this.w / 2 - 130;
      const by = this.h - 118;
      ctx.fillStyle = "rgba(8, 16, 12, 0.7)";
      this.roundRect(ctx, bx - 10, by - 18, 280, 46, 8);
      ctx.fill();
      ctx.fillStyle = "#d4af37";
      ctx.font = "600 11px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ACCURACY", this.w / 2, by - 4);
      ctx.fillStyle = "#222";
      this.roundRect(ctx, bx, by + 6, 260, 12, 6);
      ctx.fill();
      ctx.fillStyle = "#2e7d32";
      ctx.fillRect(bx + 118, by + 6, 24, 12);
      ctx.fillStyle = "#d4af37";
      ctx.fillRect(bx + 126, by + 6, 8, 12);
      const t = session.swingPhase === "accuracy" ? session.meter * 2 - 1 : session.accuracy;
      const mx = bx + 130 + t * 130;
      ctx.fillStyle = "#f4f1e8";
      ctx.beginPath();
      ctx.moveTo(mx, by + 2);
      ctx.lineTo(mx - 5, by + 22);
      ctx.lineTo(mx + 5, by + 22);
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
