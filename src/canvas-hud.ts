import type { GameSession } from "./game";
import { pathPoly, roundRect } from "./canvas-draw";
import { showSwingMeter } from "./hud";

export function drawHud(ctx: CanvasRenderingContext2D, session: GameSession, w: number, h: number): void {
  drawMinimap(ctx, session, w);
  if (showSwingMeter(session.swingPhase)) drawMeters(ctx, session, w, h);
}

function drawMinimap(ctx: CanvasRenderingContext2D, session: GameSession, w: number): void {
  const hole = session.hole();
  const compact = w < 760;
  const mw = compact ? 104 : 136;
  const mh = compact ? 62 : 80;
  const x = w - mw - 16;
  const y = compact ? 108 : 58;
  ctx.save();
  ctx.fillStyle = "rgba(6, 10, 9, 0.32)";
  roundRect(ctx, x - 4, y - 4, mw + 8, mh + 8, 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.stroke();
  const s = Math.min(mw / hole.bounds.w, mh / hole.bounds.h);
  ctx.translate(x + (mw - hole.bounds.w * s) / 2 - hole.bounds.x * s, y + (mh - hole.bounds.h * s) / 2 - hole.bounds.y * s);
  ctx.scale(s, s);
  ctx.fillStyle = "#1a3d24";
  for (const poly of hole.rough) {
    pathPoly(ctx, poly);
    ctx.fill();
  }
  ctx.fillStyle = "#5a9a52";
  for (const poly of hole.fairway) {
    pathPoly(ctx, poly);
    ctx.fill();
  }
  ctx.fillStyle = "#0c4f7a";
  for (const water of hole.water) {
    pathPoly(ctx, water);
    ctx.fill();
  }
  ctx.fillStyle = "#d4bc84";
  for (const b of hole.bunkers) {
    ctx.beginPath();
    ctx.ellipse(b.cx, b.cy, b.rx, b.ry, b.rotation, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#3a9a5e";
  ctx.beginPath();
  ctx.ellipse(hole.green.cx, hole.green.cy, hole.green.rx, hole.green.ry, hole.green.rotation, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8e4d8";
  ctx.beginPath();
  ctx.arc(hole.pin.x, hole.pin.y, 2.2 / s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f7f4ec";
  ctx.beginPath();
  ctx.arc(session.ball.pos.x, session.ball.pos.y, 2.3 / s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMeters(ctx: CanvasRenderingContext2D, session: GameSession, w: number, h: number): void {
  const x = w - 52;
  const y = Math.max(150, h * 0.22);
  const meterH = Math.min(260, h * 0.36);
  const putting = session.club().id === "putter";
  const fill = session.meterFill();
  const sugFill = session.suggestedPower();
  const yards = session.meterYards();
  const yardLabel = putting ? `${yards < 10 ? yards.toFixed(1) : Math.round(yards)}` : `${Math.round(yards)}`;
  ctx.save();
  ctx.fillStyle = "rgba(6, 10, 9, 0.45)";
  roundRect(ctx, x - 16, y - 46, 46, meterH + 74, 2);
  ctx.fill();
  ctx.fillStyle = "rgba(247,244,236,0.92)";
  ctx.font = "500 18px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${session.meterPercent()}`, x + 7, y - 24);
  ctx.font = "500 11px 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(247,244,236,0.62)";
  ctx.fillText(yardLabel, x + 7, y - 8);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, x, y, 14, meterH, 2);
  ctx.fill();
  ctx.fillStyle = "rgba(247,244,236,0.9)";
  const filled = meterH * fill;
  if (filled > 0.5) {
    roundRect(ctx, x + 2, y + meterH - filled, 10, filled, 1);
    ctx.fill();
  }
  const sugY = y + meterH - meterH * sugFill;
  ctx.fillStyle = "rgba(247,244,236,0.95)";
  ctx.fillRect(x - 5, sugY - 0.5, 24, 1.5);
  ctx.fillStyle = "rgba(247,244,236,0.45)";
  ctx.font = "600 9px 'Segoe UI', sans-serif";
  ctx.fillText(putting ? "PACE" : "POWER", x + 7, y + meterH + 16);
  ctx.restore();

  const bw = Math.min(420, w * 0.46);
  const bh = 12;
  const bx = (w - bw) / 2;
  const by = h - 72;
  const timing = session.swingPhase === "accuracy";
  ctx.save();
  ctx.globalAlpha = timing ? 1 : 0.72;
  ctx.fillStyle = "rgba(6, 10, 9, 0.45)";
  roundRect(ctx, bx - 12, by - 22, bw + 24, bh + 40, 2);
  ctx.fill();
  ctx.fillStyle = "rgba(247,244,236,0.55)";
  ctx.font = "600 9px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ACCURACY", bx + bw / 2, by - 8);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  roundRect(ctx, bx, by, bw, bh, 2);
  ctx.fill();
  const miss = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  miss.addColorStop(0, "rgba(120, 64, 58, 0.85)");
  miss.addColorStop(0.22, "rgba(140, 120, 78, 0.8)");
  miss.addColorStop(0.42, "rgba(70, 110, 74, 0.9)");
  miss.addColorStop(0.5, "rgba(232, 226, 210, 0.95)");
  miss.addColorStop(0.58, "rgba(70, 110, 74, 0.9)");
  miss.addColorStop(0.78, "rgba(140, 120, 78, 0.8)");
  miss.addColorStop(1, "rgba(120, 64, 58, 0.85)");
  ctx.fillStyle = miss;
  roundRect(ctx, bx + 1, by + 1, bw - 2, bh - 2, 1);
  ctx.fill();
  const t = timing ? session.meter * 2 - 1 : 0;
  const mx = bx + bw / 2 + t * (bw / 2 - 8);
  ctx.fillStyle = "#f7f4ec";
  ctx.beginPath();
  ctx.moveTo(mx, by - 3);
  ctx.lineTo(mx - 6, by + bh + 7);
  ctx.lineTo(mx + 6, by + bh + 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
