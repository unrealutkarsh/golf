import type { GameSession } from "./game";
import { CUP_RADIUS } from "./physics";
import { clamp, dist, fromAngle, type Vec2 } from "./math";
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
    this.drawPin(ctx, hole);
    this.drawAim(ctx, session, hole);
    this.updateParticles(dt);
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

  private drawSky(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, "#163528");
    g.addColorStop(0.45, "#1c4a32");
    g.addColorStop(1, "#0d2418");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private ensureStatic(hole: Hole): void {
    if (this.staticHole === hole.number) return;
    this.staticHole = hole.number;
    const pad = 4;
    const scale = 4;
    this.staticCanvas.width = Math.max(64, Math.ceil(hole.bounds.w * scale));
    this.staticCanvas.height = Math.max(64, Math.ceil(hole.bounds.h * scale));
    const ctx = this.staticCtx;
    ctx.setTransform(scale, 0, 0, scale, -hole.bounds.x * scale, -hole.bounds.y * scale);
    ctx.fillStyle = "#0c1c12";
    ctx.fillRect(hole.bounds.x - pad, hole.bounds.y - pad, hole.bounds.w + pad * 2, hole.bounds.h + pad * 2);
    this.fillPolys(ctx, hole.rough, "#3d7a36");
    this.strokePolys(ctx, hole.rough, "#2b5827", 1.4);
    this.fillPolys(ctx, hole.fairway, "#7bc86a");
    this.drawFairwayStripes(ctx, hole);
    this.strokePolys(ctx, hole.fairway, "#3d8d49", 0.8);
    this.drawTee(ctx, hole);
    this.drawGreen(ctx, hole);
    for (const b of hole.bunkers) this.drawBunker(ctx, b);
    for (const t of hole.trees) this.drawTree(ctx, t);
  }

  private fillPolys(ctx: CanvasRenderingContext2D, polys: Vec2[][], color: string): void {
    ctx.fillStyle = color;
    for (const poly of polys) {
      this.pathPoly(ctx, poly);
      ctx.fill();
    }
  }

  private strokePolys(ctx: CanvasRenderingContext2D, polys: Vec2[][], color: string, width: number): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (const poly of polys) {
      this.pathPoly(ctx, poly);
      ctx.stroke();
    }
  }

  private pathPoly(ctx: CanvasRenderingContext2D, poly: Vec2[]): void {
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
  }

  private drawFairwayStripes(ctx: CanvasRenderingContext2D, hole: Hole): void {
    ctx.save();
    for (const poly of hole.fairway) {
      this.pathPoly(ctx, poly);
      ctx.clip();
    }
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#4e9a4a";
    ctx.lineWidth = 3.2;
    const minX = hole.bounds.x;
    const maxX = hole.bounds.x + hole.bounds.w;
    const minY = hole.bounds.y;
    const maxY = hole.bounds.y + hole.bounds.h;
    for (let x = minX - 40; x < maxX + 40; x += 7) {
      ctx.beginPath();
      ctx.moveTo(x, minY);
      ctx.lineTo(x + (maxY - minY) * 0.15, maxY);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawTee(ctx: CanvasRenderingContext2D, hole: Hole): void {
    ctx.save();
    ctx.translate(hole.tee.x, hole.tee.y);
    ctx.fillStyle = "#6dcc6f";
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 6, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d4af37";
    ctx.fillRect(-5.5, -1.2, 2.2, 2.4);
    ctx.fillRect(3.3, -1.2, 2.2, 2.4);
    ctx.restore();
  }

  private drawGreen(ctx: CanvasRenderingContext2D, hole: Hole): void {
    const g = hole.green;
    ctx.save();
    ctx.translate(g.cx, g.cy);
    ctx.rotate(g.rotation);
    const grad = ctx.createRadialGradient(-g.rx * 0.2, -g.ry * 0.2, 2, 0, 0, Math.max(g.rx, g.ry));
    grad.addColorStop(0, "#7ed67c");
    grad.addColorStop(1, "#4fb15a");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, g.rx, g.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 0.35;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.ellipse(hole.greenBreak.x * i * 0.6, hole.greenBreak.y * i * 0.6, g.rx * (1 - i * 0.16), g.ry * (1 - i * 0.16), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawBunker(ctx: CanvasRenderingContext2D, b: Ellipse): void {
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.rotate(b.rotation);
    ctx.fillStyle = "#e6d2a2";
    ctx.beginPath();
    ctx.ellipse(0, 0, b.rx, b.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(176, 140, 80, 0.25)";
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      ctx.arc((Math.random() - 0.5) * b.rx * 1.6, (Math.random() - 0.5) * b.ry * 1.6, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#c4a56a";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
  }

  private drawTree(ctx: CanvasRenderingContext2D, t: Tree): void {
    ctx.save();
    ctx.fillStyle = "rgba(10, 20, 12, 0.28)";
    ctx.beginPath();
    ctx.ellipse(t.x + 3.5, t.y + 3.2, t.r * 0.85, t.r * 0.45, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a3820";
    ctx.fillRect(t.x - 1.1, t.y - 1, 2.2, t.r * 0.55);
    ctx.fillStyle = "#1f6b34";
    ctx.beginPath();
    ctx.arc(t.x, t.y - t.r * 0.15, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2f8a46";
    ctx.beginPath();
    ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.3, t.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawWater(ctx: CanvasRenderingContext2D, hole: Hole): void {
    for (const water of hole.water) {
      ctx.save();
      this.pathPoly(ctx, water);
      ctx.clip();
      const g = ctx.createLinearGradient(water[0].x, water[0].y, water[0].x + 40, water[0].y + 30);
      g.addColorStop(0, "#1d6d9a");
      g.addColorStop(1, "#14567c");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(210, 240, 255, 0.22)";
      ctx.lineWidth = 0.45;
      const minX = Math.min(...water.map((p) => p.x));
      const maxX = Math.max(...water.map((p) => p.x));
      const minY = Math.min(...water.map((p) => p.y));
      const maxY = Math.max(...water.map((p) => p.y));
      for (let y = minY; y < maxY; y += 4) {
        ctx.beginPath();
        for (let x = minX; x <= maxX; x += 3) {
          const yy = y + Math.sin(x * 0.18 + this.time * 2.4 + y * 0.1) * 1.1;
          if (x === minX) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(180, 220, 240, 0.35)";
      ctx.lineWidth = 0.7;
      this.pathPoly(ctx, water);
      ctx.stroke();
    }
  }

  private drawPin(ctx: CanvasRenderingContext2D, hole: Hole): void {
    const p = hole.pin;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(p.x + 1.2, p.y + 1.1, 2.1, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f4f1e8";
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y - 11);
    ctx.stroke();
    const wave = Math.sin(this.time * 3) * 0.8;
    ctx.fillStyle = "#c62828";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 11);
    ctx.lineTo(p.x + 6.5 + wave, p.y - 9);
    ctx.lineTo(p.x, p.y - 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(p.x, p.y, CUP_RADIUS * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawAim(ctx: CanvasRenderingContext2D, session: GameSession, hole: Hole): void {
    if (session.screen !== "play") return;
    if (session.swingPhase !== "aim" && session.swingPhase !== "power" && session.swingPhase !== "accuracy") return;
    const from = session.ball.pos;
    const dir = fromAngle(session.aim, 1);
    const preview = session.previewLanding();
    ctx.save();
    ctx.strokeStyle = "rgba(244, 241, 232, 0.7)";
    ctx.setLineDash([2.2, 1.6]);
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(from.x + dir.x * 36, from.y + dir.y * 36);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(212, 175, 55, 0.85)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(preview.x, preview.y);
    ctx.stroke();
    ctx.fillStyle = "#d4af37";
    ctx.beginPath();
    ctx.arc(preview.x, preview.y, 1.3, 0, Math.PI * 2);
    ctx.fill();
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

  private drawBall(ctx: CanvasRenderingContext2D, session: GameSession): void {
    const b = session.ball;
    const air = Math.min(b.z, 20);
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.28 - air * 0.01})`;
    ctx.beginPath();
    ctx.ellipse(b.pos.x + 1.1 + air * 0.08, b.pos.y + 1.1 + air * 0.08, 1.5 + air * 0.04, 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    const r = 1.15 + air * 0.03;
    const grad = ctx.createRadialGradient(b.pos.x - 0.4, b.pos.y - 0.5, 0.2, b.pos.x, b.pos.y, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, "#d5d2c8");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(40,40,40,0.25)";
    ctx.lineWidth = 0.15;
    ctx.stroke();
    ctx.restore();
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
    let tx = session.ball.pos.x;
    let ty = session.ball.pos.y;
    let zoomTarget = fit * 0.92;
    if (session.screen !== "play") {
      tx = hole.bounds.x + hole.bounds.w * 0.55;
      ty = hole.bounds.y + hole.bounds.h * 0.5;
      zoomTarget = fit * 0.88;
    } else if (session.swingPhase === "flight") {
      tx = session.ball.pos.x;
      ty = session.ball.pos.y;
      zoomTarget = clamp(putting ? 8 : 4.2, 2.4, 8);
    } else if (putting) {
      tx = (session.ball.pos.x + hole.pin.x) / 2;
      ty = (session.ball.pos.y + hole.pin.y) / 2;
      zoomTarget = clamp(Math.min(this.w, this.h) / Math.max(pinD * 2.4, 28), 6, 16);
    } else {
      tx = (session.ball.pos.x * 0.45 + hole.pin.x * 0.55);
      ty = (session.ball.pos.y * 0.45 + hole.pin.y * 0.55);
      const spanX = Math.abs(hole.pin.x - session.ball.pos.x) + 90;
      const spanY = Math.abs(hole.pin.y - session.ball.pos.y) + 90;
      zoomTarget = clamp(Math.min(this.w / spanX, this.h / spanY) * 0.88, 1.35, 5.2);
    }
    const k = 1 - Math.pow(0.002, dt);
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
    ctx.fillStyle = "#2f6a32";
    for (const poly of hole.rough) {
      this.pathPoly(ctx, poly);
      ctx.fill();
    }
    ctx.fillStyle = "#6fbf66";
    for (const poly of hole.fairway) {
      this.pathPoly(ctx, poly);
      ctx.fill();
    }
    ctx.fillStyle = "#1d6d9a";
    for (const water of hole.water) {
      this.pathPoly(ctx, water);
      ctx.fill();
    }
    ctx.fillStyle = "#e6d2a2";
    for (const b of hole.bunkers) {
      ctx.beginPath();
      ctx.ellipse(b.cx, b.cy, b.rx, b.ry, b.rotation, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#8be28b";
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
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.2, this.w / 2, this.h / 2, this.w * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.38)");
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

    if (session.swingPhase === "accuracy" || session.lockedAccuracy) {
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

