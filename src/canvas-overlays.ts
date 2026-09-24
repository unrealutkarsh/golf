import type { GameSession } from "./game";
import type { FlightSample } from "./physics";
import { clamp, dist, fromAngle, type Vec2 } from "./math";
import { airbornePos } from "./renderer-lift";

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

export class PlayOverlays {
  particles: Particle[] = [];
  private trail: TrailPoint[] = [];
  private rings: LandRing[] = [];
  private trailShot = "";
  private prevZ = 0;

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

  trackFlight(session: GameSession, dt: number): void {
    const key = `${session.course.id}-${session.holeIndex}-${session.strokes}`;
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

  draw(ctx: CanvasRenderingContext2D, session: GameSession, dt: number): void {
    this.drawAim(ctx, session);
    this.drawShotArc(ctx, session);
    this.updateParticles(dt);
    this.drawRings(ctx);
    this.drawParticles(ctx);
    this.drawBall(ctx, session);
  }

  private drawAim(ctx: CanvasRenderingContext2D, session: GameSession): void {
    if (session.screen !== "play") return;
    if (session.swingPhase !== "aim" && session.swingPhase !== "power" && session.swingPhase !== "accuracy") return;
    const from = session.ball.pos;
    const dir = fromAngle(session.aim, 1);
    ctx.save();
    if (session.club().id === "putter") {
      this.drawPuttRead(ctx, session);
      ctx.restore();
      return;
    }
    const preview = session.previewLanding();
    const path = session.previewFlight();
    ctx.strokeStyle = "rgba(244, 241, 232, 0.28)";
    ctx.setLineDash([2.2, 1.6]);
    ctx.lineWidth = 0.32;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(from.x + dir.x * 28, from.y + dir.y * 28);
    ctx.stroke();
    ctx.setLineDash([]);

    if (path.length > 1 && session.club().id !== "putter") {
      this.drawRibbon(ctx, path, 0.08);
      this.strokeFlight(ctx, path, "rgba(0,0,0,0.12)", true, 0.9);
      this.strokeFlight(ctx, path, "rgba(230, 212, 160, 0.55)", false, 0.95);
    } else {
      ctx.strokeStyle = "rgba(212, 175, 55, 0.38)";
      ctx.lineWidth = 0.42;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(preview.x, preview.y);
      ctx.stroke();
    }
    ctx.fillStyle = "#f0d78a";
    ctx.beginPath();
    ctx.arc(preview.x, preview.y, 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** The putt the stroke will play: curved with the slope, gold when that pace holes. */
  private drawPuttRead(ctx: CanvasRenderingContext2D, session: GameSession): void {
    const putt = session.previewPutt();
    if (putt.path.length < 2) return;
    ctx.strokeStyle = putt.holed ? "rgba(255, 213, 74, 0.9)" : "rgba(255, 255, 255, 0.78)";
    ctx.lineWidth = 0.22;
    ctx.setLineDash([0.12, 0.22]);
    ctx.lineCap = "round";
    ctx.beginPath();
    putt.path.forEach((sample, i) => {
      if (i === 0) ctx.moveTo(sample.pos.x, sample.pos.y);
      else ctx.lineTo(sample.pos.x, sample.pos.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    const last = putt.path[putt.path.length - 1];
    if (!last || putt.holed) return;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 0.16;
    ctx.beginPath();
    ctx.arc(last.pos.x, last.pos.y, 0.32, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawShotArc(ctx: CanvasRenderingContext2D, session: GameSession): void {
    if (session.swingPhase !== "flight" && session.swingPhase !== "settle") return;
    if (session.shotArc.length < 2) return;
    ctx.save();
    this.drawRibbon(ctx, session.shotArc, 0.16);
    this.strokeFlight(ctx, session.shotArc, "rgba(0,0,0,0.14)", true, 1.05);
    this.strokeFlight(ctx, session.shotArc, "rgba(230, 212, 160, 0.58)", false, 1.2);
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
}
