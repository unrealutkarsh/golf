import { renderPixelRatio } from "./art";
import type { GameSession } from "./game";
import { onGreen } from "./course";
import { drawHud } from "./canvas-hud";
import { CoursePainter } from "./canvas-course";
import { PlayOverlays } from "./canvas-overlays";
import { airbornePos } from "./renderer-lift";
import { clamp, dist, type Vec2 } from "./math";

export { airborneOffset, airbornePos } from "./renderer-lift";

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  dpr = 1;
  private course = new CoursePainter();
  private overlays = new PlayOverlays();
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  get particles() {
    return this.overlays.particles;
  }

  burst(pos: Vec2, color: string, n: number, speed: number): void {
    this.overlays.burst(pos, color, n, speed);
  }

  resize(): void {
    this.dpr = renderPixelRatio(window.devicePixelRatio);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.course.resetCache();
  }

  draw(session: GameSession, dt: number, opts?: { hudOnly?: boolean }): void {
    this.time += dt;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    if (opts?.hudOnly || document.body.classList.contains("has-3d")) {
      if (session.screen === "play") drawHud(ctx, session, this.w, this.h);
      return;
    }
    this.course.drawSky(ctx, this.w, this.h);
    const hole = session.hole();
    this.overlays.trackFlight(session, dt);
    this.updateCamera(session, dt);
    ctx.save();
    this.applyCamera(ctx, session);
    this.course.drawGroundscape(ctx, hole);
    const staticCanvas = this.course.paintStatic(hole);
    ctx.drawImage(staticCanvas, hole.bounds.x, hole.bounds.y, hole.bounds.w, hole.bounds.h);
    this.course.drawLive(ctx, session, hole, this.time, this.w, this.h);
    this.overlays.draw(ctx, session, hole, dt);
    ctx.restore();
    this.course.drawAtmosphere(ctx, this.w, this.h);
    if (session.screen === "play") drawHud(ctx, session, this.w, this.h);
  }

  worldFromScreen(session: GameSession, sx: number, sy: number): Vec2 {
    return {
      x: (sx - this.w / 2) / session.cam.zoom + session.cam.x,
      y: (sy - this.h / 2) / session.cam.zoom + session.cam.y,
    };
  }

  private applyCamera(ctx: CanvasRenderingContext2D, session: GameSession): void {
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(session.cam.zoom, session.cam.zoom);
    ctx.translate(-session.cam.x, -session.cam.y);
  }

  private updateCamera(session: GameSession, dt: number): void {
    if (session.camHold) return;
    const hole = session.hole();
    const pinD = dist(session.ball.pos, hole.pin);
    const putting =
      session.lie === "green" ||
      onGreen(hole, session.ball.pos) ||
      (pinD < 24 && session.club().id === "putter");
    const fit = Math.min(this.w / (hole.bounds.w + 36), this.h / (hole.bounds.h + 72));
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
      tx = session.ball.pos.x * 0.58 + hole.pin.x * 0.42;
      ty = session.ball.pos.y * 0.58 + hole.pin.y * 0.42;
      const span = Math.max(pinD * 1.55, 16);
      zoomTarget = clamp(Math.min(this.w, this.h) / span, 9, 20);
      follow = 0.0006;
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
}
