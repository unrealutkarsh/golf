import type { GameSession } from "./game";
import { pathPoly, roundRect } from "./canvas-draw";

export function drawHud(ctx: CanvasRenderingContext2D, session: GameSession, w: number, h: number): void {
  drawMinimap(ctx, session, w);
  drawMeters(ctx, session, w, h);
}

function drawMinimap(ctx: CanvasRenderingContext2D, session: GameSession, w: number): void {
  const hole = session.hole();
  const mw = 148;
  const mh = 88;
  const x = w - mw - 22;
  const y = 58;
  ctx.save();
  ctx.fillStyle = "rgba(6, 12, 10, 0.48)";
  roundRect(ctx, x - 6, y - 6, mw + 12, mh + 12, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();
  const s = Math.min(mw / hole.bounds.w, mh / hole.bounds.h);
  ctx.translate(x + (mw - hole.bounds.w * s) / 2 - hole.bounds.x * s, y + (mh - hole.bounds.h * s) / 2 - hole.bounds.y * s);
  ctx.scale(s, s);
  ctx.fillStyle = "#1f4a28";
  for (const poly of hole.rough) {
    pathPoly(ctx, poly);
    ctx.fill();
  }
  ctx.fillStyle = "#6fbf62";
  for (const poly of hole.fairway) {
    pathPoly(ctx, poly);
    ctx.fill();
  }
  ctx.fillStyle = "#0c4f7a";
  for (const water of hole.water) {
    pathPoly(ctx, water);
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

function drawMeters(ctx: CanvasRenderingContext2D, session: GameSession, w: number, h: number): void {
  const x = w - 58;
  const y = h * 0.22;
  const meterH = Math.min(300, h * 0.42);
  const putting = session.club().id === "putter";
  const fill = session.meterFill();
  const sugFill = session.suggestedPower();
  const yards = session.meterYards();
  const yardLabel = putting ? `${yards < 10 ? yards.toFixed(1) : Math.round(yards)}y` : `${Math.round(yards)}y`;
  ctx.save();
  ctx.fillStyle = "rgba(6, 12, 10, 0.62)";
  roundRect(ctx, x - 18, y - 48, 52, meterH + 86, 12);
  ctx.fill();
  ctx.fillStyle = "rgba(243,239,227,0.9)";
  ctx.font = "800 13px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${session.meterPercent()}%`, x + 6, y - 28);
  ctx.font = "700 11px 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(212,175,55,0.95)";
  ctx.fillText(yardLabel, x + 6, y - 12);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "700 9px 'Segoe UI', sans-serif";
  ctx.fillText("PWR", x + 6, y + meterH + 16);
  ctx.fillStyle = putting ? "rgba(243,239,227,0.55)" : "rgba(243,239,227,0.45)";
  ctx.fillText(putting ? "pace" : "sug", x + 6, y + meterH + 28);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  roundRect(ctx, x - 2, y, 16, meterH, 6);
  ctx.fill();
  const g = ctx.createLinearGradient(0, y + meterH, 0, y);
  g.addColorStop(0, "#2e7d32");
  g.addColorStop(0.7, "#d4af37");
  g.addColorStop(1, "#c62828");
  ctx.fillStyle = g;
  roundRect(ctx, x + 1, y + meterH - meterH * fill, 12, meterH * fill, 5);
  ctx.fill();
  const sugY = y + meterH - meterH * sugFill;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillRect(x - 7, sugY - 1, 26, 2);
  ctx.restore();

  if (session.swingPhase === "flight" || session.swingPhase === "settle") return;
  const bw = Math.min(560, w * 0.58);
  const bh = 22;
  const bx = (w - bw) / 2;
  const by = h - 150;
  const active = session.swingPhase === "accuracy" || session.lockedAccuracy;
  ctx.save();
  ctx.globalAlpha = active ? 1 : session.swingPhase === "power" ? 0.92 : 0.45;
  ctx.fillStyle = "rgba(6, 12, 10, 0.62)";
  roundRect(ctx, bx - 14, by - 28, bw + 28, bh + 50, 12);
  ctx.fill();
  ctx.fillStyle = "rgba(243, 239, 227, 0.72)";
  ctx.font = "700 11px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ACCURACY", bx + bw / 2, by - 10);
  ctx.fillStyle = "#1a1a1a";
  roundRect(ctx, bx, by, bw, bh, 8);
  ctx.fill();
  const miss = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  miss.addColorStop(0, "#8b2d2d");
  miss.addColorStop(0.22, "#b8842a");
  miss.addColorStop(0.42, "#2e7d32");
  miss.addColorStop(0.5, "#d4af37");
  miss.addColorStop(0.58, "#2e7d32");
  miss.addColorStop(0.78, "#b8842a");
  miss.addColorStop(1, "#8b2d2d");
  ctx.fillStyle = miss;
  roundRect(ctx, bx + 2, by + 2, bw - 4, bh - 4, 6);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(bx + bw * 0.4, by + 2, bw * 0.2, bh - 4);
  const t = active ? (session.swingPhase === "accuracy" ? session.meter * 2 - 1 : session.accuracy) : 0;
  const mx = bx + bw / 2 + t * (bw / 2 - 8);
  ctx.fillStyle = "#f4f1e8";
  ctx.beginPath();
  ctx.moveTo(mx, by - 4);
  ctx.lineTo(mx - 8, by + bh + 8);
  ctx.lineTo(mx + 8, by + bh + 8);
  ctx.closePath();
  ctx.fill();
  ctx.font = "600 10px 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(243,239,227,0.7)";
  ctx.fillText("MISS", bx + 28, by + bh + 16);
  ctx.fillText("GOOD", bx + bw * 0.28, by + bh + 16);
  ctx.fillText("PERFECT", bx + bw / 2, by + bh + 16);
  ctx.fillText("GOOD", bx + bw * 0.72, by + bh + 16);
  ctx.fillText("MISS", bx + bw - 28, by + bh + 16);
  ctx.restore();
}
