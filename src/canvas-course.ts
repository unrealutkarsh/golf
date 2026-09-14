import { clipPolys, pathPoly, roundRect } from "./canvas-draw";
import type { GameSession } from "./game";
import { grassTile, hashNoise, patternFrom, SUN } from "./look";
import { CUP_RADIUS } from "./physics";
import { angleTo, clamp, hashString, mulberry32 } from "./math";
import type { Ellipse, Hole, Tree } from "./types";

export class CoursePainter {
  private staticCanvas: HTMLCanvasElement;
  private staticCtx: CanvasRenderingContext2D;
  private staticHole = -1;
  private grainCache = new Map<string, CanvasPattern>();

  constructor() {
    this.staticCanvas = document.createElement("canvas");
    const sctx = this.staticCanvas.getContext("2d");
    if (!sctx) throw new Error("Offscreen canvas unavailable");
    this.staticCtx = sctx;
  }

  resetCache(): void {
    this.staticHole = -1;
    this.grainCache.clear();
  }

  drawSky(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1a3d68");
    g.addColorStop(0.28, "#3d7ca8");
    g.addColorStop(0.55, "#8ec4d4");
    g.addColorStop(0.72, "#d8c48a");
    g.addColorStop(1, "#6a8a4a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const sunX = w * 0.8;
    const sunY = h * 0.18;
    const bloom = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, w * 0.5);
    bloom.addColorStop(0, "rgba(255, 236, 190, 0.85)");
    bloom.addColorStop(0.12, "rgba(255, 200, 120, 0.28)");
    bloom.addColorStop(1, "rgba(255, 200, 120, 0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff6d2";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.16)";
    drawCloud(ctx, w * 0.16, h * 0.14, 86);
    drawCloud(ctx, w * 0.4, h * 0.1, 110);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    drawCloud(ctx, w * 0.9, h * 0.2, 64);

    ctx.fillStyle = "#4a6a38";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.62);
    ctx.quadraticCurveTo(w * 0.2, h * 0.54, w * 0.38, h * 0.6);
    ctx.quadraticCurveTo(w * 0.58, h * 0.66, w, h * 0.58);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();
    ctx.fillStyle = "#3a582c";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.7);
    ctx.quadraticCurveTo(w * 0.3, h * 0.64, w * 0.55, h * 0.72);
    ctx.quadraticCurveTo(w * 0.78, h * 0.78, w, h * 0.68);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();
  }

  drawGroundscape(ctx: CanvasRenderingContext2D, hole: Hole): void {
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

  paintStatic(hole: Hole): HTMLCanvasElement {
    this.ensureStatic(hole);
    return this.staticCanvas;
  }

  drawLive(ctx: CanvasRenderingContext2D, session: GameSession, hole: Hole, time: number, viewW: number, viewH: number): void {
    this.drawFairwaySheen(ctx, session, hole, time);
    this.drawNearGrass(ctx, session, hole, viewW, viewH);
    this.drawWater(ctx, hole, time);
    this.drawGreen(ctx, hole);
    this.drawPin(ctx, hole, time);
  }

  drawAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const haze = ctx.createLinearGradient(0, 0, 0, h);
    haze.addColorStop(0, "rgba(180, 210, 230, 0.1)");
    haze.addColorStop(0.45, "rgba(180, 210, 230, 0)");
    haze.addColorStop(1, "rgba(20, 30, 16, 0.12)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);
    const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.78);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
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

  private drawRough(ctx: CanvasRenderingContext2D, hole: Hole): void {
    for (const poly of hole.rough) {
      pathPoly(ctx, poly);
      ctx.fillStyle = "#1c4020";
      ctx.fill();
    }
    ctx.save();
    clipPolys(ctx, hole.rough);
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
      pathPoly(ctx, poly);
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
    clipPolys(ctx, hole.fairway);
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
      pathPoly(ctx, poly);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(30, 70, 32, 0.35)";
    ctx.lineWidth = 2.2;
    for (const poly of hole.fairway) {
      pathPoly(ctx, poly);
      ctx.stroke();
    }
  }

  private drawFairwaySheen(ctx: CanvasRenderingContext2D, session: GameSession, hole: Hole, time: number): void {
    if (!hole.fairway.length) return;
    const heading = angleTo(hole.tee, hole.pin);
    const view = Math.atan2(session.cam.y - (hole.tee.y + hole.pin.y) * 0.5, session.cam.x - (hole.tee.x + hole.pin.x) * 0.5);
    const slide = Math.cos(heading - view + time * 0.12) * 0.5 + 0.5;
    ctx.save();
    clipPolys(ctx, hole.fairway);
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

  private drawNearGrass(ctx: CanvasRenderingContext2D, session: GameSession, hole: Hole, viewW: number, viewH: number): void {
    const zoom = session.cam.zoom;
    if (zoom < 5.5 || session.lie === "green") return;
    const halfW = viewW / zoom / 2;
    const halfH = viewH / zoom / 2;
    const minX = session.cam.x - halfW;
    const minY = session.cam.y - halfH;
    ctx.save();
    clipPolys(ctx, hole.fairway);
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

  private drawTee(ctx: CanvasRenderingContext2D, hole: Hole): void {
    ctx.save();
    ctx.translate(hole.tee.x, hole.tee.y);
    ctx.rotate(angleTo(hole.tee, hole.pin));
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    roundRect(ctx, -9.4, -6.2, 19, 14, 3);
    ctx.fill();
    const tee = ctx.createLinearGradient(-10, -8, 10, 8);
    tee.addColorStop(0, "#8ee070");
    tee.addColorStop(1, "#4ea04a");
    ctx.fillStyle = tee;
    roundRect(ctx, -9, -6.5, 18, 13, 3);
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

  private drawWater(ctx: CanvasRenderingContext2D, hole: Hole, time: number): void {
    for (const water of hole.water) {
      ctx.save();
      pathPoly(ctx, water);
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
          const yy = y + Math.sin(x * 0.2 + time * 2.1 + y * 0.12) * 1.05;
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
      pathPoly(ctx, water);
      ctx.stroke();
      ctx.strokeStyle = "rgba(190, 220, 160, 0.3)";
      ctx.lineWidth = 2.1;
      pathPoly(ctx, water);
      ctx.stroke();
    }
  }

  private drawPin(ctx: CanvasRenderingContext2D, hole: Hole, time: number): void {
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
    const wave = Math.sin(time * 3.1) * 0.9;
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
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.34, 0, 0, Math.PI * 2);
  ctx.ellipse(x - r * 0.42, y + 5, r * 0.52, r * 0.26, 0, 0, Math.PI * 2);
  ctx.ellipse(x + r * 0.38, y + 6, r * 0.46, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}
