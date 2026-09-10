import { formatMoney, rankingFromProfile } from "./career";
import { CLUBS } from "./clubs";
import type { GameSession } from "./game";
import { surfaceLabel, windLabel } from "./physics";
import { formatToPar, scoreName, toPar, totalStrokes } from "./scoring";
import { PLAYER_CARD } from "./tour";
import type { ScreenId } from "./types";

export class UI {
  private overlay: HTMLElement;
  private hud: HTMLElement;
  private lastScreen: ScreenId | "" = "";
  private lastHud = "";
  private lastOverlay = "";

  constructor(overlay: HTMLElement, hud: HTMLElement) {
    this.overlay = overlay;
    this.hud = hud;
  }

  sync(session: GameSession, onAction: (action: string, payload?: string) => void): void {
    const screen = session.helpOpen ? "help" : session.scorecardOpen && session.screen === "play" ? "scorecard" : session.screen;
    const overlay = this.renderOverlay(session, screen);
    if (overlay !== this.lastOverlay || screen !== this.lastScreen) {
      this.overlay.innerHTML = overlay;
      this.lastOverlay = overlay;
      this.lastScreen = screen;
      this.bind(session, onAction);
    }
    if (session.screen === "play" && !session.helpOpen && !session.scorecardOpen) {
      this.hud.classList.remove("hidden");
      const hud = this.renderHud(session);
      if (hud !== this.lastHud) {
        this.hud.innerHTML = hud;
        this.lastHud = hud;
        this.bindHud(onAction);
      }
    } else {
      this.hud.classList.add("hidden");
    }
  }

  private bind(session: GameSession, onAction: (action: string, payload?: string) => void): void {
    this.overlay.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const action = (el as HTMLElement).dataset.action ?? "";
        const payload = (el as HTMLElement).dataset.payload;
        onAction(action, payload);
      });
    });
    const name = this.overlay.querySelector<HTMLInputElement>("#player-name");
    if (name) {
      name.addEventListener("change", () => onAction("rename", name.value));
    }
    void session;
  }

  private bindHud(onAction: (action: string, payload?: string) => void): void {
    this.hud.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onAction((el as HTMLElement).dataset.action ?? "", (el as HTMLElement).dataset.payload);
      });
    });
  }

  private renderOverlay(session: GameSession, screen: ScreenId | "scorecard"): string {
    if (screen === "title") return this.title();
    if (screen === "tour") return this.tour(session);
    if (screen === "help") return this.help();
    if (screen === "scorecard") return this.scorecard(session, false);
    if (screen === "holeEnd") return this.holeEnd(session);
    if (screen === "roundEnd") return this.roundEnd(session);
    return "";
  }

  private title(): string {
    return `
      <div class="panel hero">
        <p class="kicker">${PLAYER_CARD.tour} · ${PLAYER_CARD.season}</p>
        <h1>Pro Tour Golf</h1>
        <p class="lede">Stroke play on the dunes. Aim, time the meter, and card a number you can live with.</p>
        <div class="row">
          <button class="btn primary" data-action="tour">Enter the tour tent</button>
          <button class="btn" data-action="help">How to play</button>
        </div>
      </div>`;
  }

  private tour(session: GameSession): string {
    const p = session.profile;
    const rank = rankingFromProfile(p);
    const t = session.tournament;
    return `
      <div class="panel tour">
        <header class="tour-head">
          <div>
            <p class="kicker">${PLAYER_CARD.tour}</p>
            <h2>Player card</h2>
          </div>
          <button class="btn ghost" data-action="title">Back</button>
        </header>
        <div class="card-grid">
          <section class="player-card">
            <div class="avatar">${initials(p.name)}</div>
            <label class="name-field">
              <span>Competitor</span>
              <input id="player-name" maxlength="24" value="${escapeHtml(p.name)}" />
            </label>
            <p class="hometown">${escapeHtml(p.hometown)}</p>
            <dl>
              <div><dt>World ranking</dt><dd>${rank}</dd></div>
              <div><dt>Events</dt><dd>${p.eventsPlayed}</dd></div>
              <div><dt>Career money</dt><dd>${formatMoney(p.careerMoney)}</dd></div>
              <div><dt>Best round</dt><dd>${p.bestToPar === null ? "—" : formatToPar(p.bestToPar)}</dd></div>
            </dl>
          </section>
          <section class="event-card">
            <p class="kicker">This week</p>
            <h3>${escapeHtml(t.name)}</h3>
            <p>${escapeHtml(t.blurb)}</p>
            <p class="meta">${escapeHtml(session.course.name)} · ${session.course.holes.length} holes · Par ${session.course.par} · Purse ${formatMoney(t.purse)}</p>
            <button class="btn primary" data-action="play">Tee it up</button>
          </section>
        </div>
      </div>`;
  }

  private help(): string {
    return `
      <div class="panel help">
        <h2>How to play</h2>
        <ol>
          <li><b>Aim</b> with the mouse or finger. Arrow keys nudge the line.</li>
          <li><b>Swing</b> with click or Space: start the meter, set power, then time the accuracy window.</li>
          <li><b>Clubs</b> with Q / E, mouse wheel, or the tray. Putter kicks in on the green.</li>
          <li>Wind pushes the ball in the air. Rough, sand, and water all cost you.</li>
          <li>Stroke play vs par. Water is a drop plus one. Out of bounds is stroke and distance.</li>
        </ol>
        <p class="keys">C scorecard · H help · M mute · Esc cancel swing / menus</p>
        <button class="btn primary" data-action="close-help">Got it</button>
      </div>`;
  }

  private holeEnd(session: GameSession): string {
    const banner = session.lastHoleBanner;
    const last = session.results[session.results.length - 1];
    const running = formatToPar(toPar(session.results));
    const more = session.holeIndex < session.course.holes.length - 1;
    return `
      <div class="panel hole-end">
        <p class="kicker">Hole ${last?.hole ?? ""} · Par ${last?.par ?? ""}</p>
        <h2>${escapeHtml(banner?.title ?? "Hole complete")}</h2>
        <p>${escapeHtml(banner?.detail ?? "")} · Round ${running}</p>
        <div class="row">
          <button class="btn primary" data-action="next-hole">${more ? "Walk to the next tee" : "See the clubhouse board"}</button>
          <button class="btn" data-action="scorecard">Scorecard</button>
        </div>
      </div>`;
  }

  private roundEnd(session: GameSession): string {
    const score = totalStrokes(session.results);
    const par = toPar(session.results);
    const birdies = session.results.filter((r) => r.strokes - r.par <= -1).length;
    return `
      <div class="panel round-end">
        <p class="kicker">${escapeHtml(session.tournament.name)}</p>
        <h2>Round complete</h2>
        <p class="big-score">${score} <span>${formatToPar(par)}</span></p>
        <p>Signed for ${score} on a par-${session.course.par} nine. ${birdies} under-par hole${birdies === 1 ? "" : "s"}.</p>
        <p class="money">Winner's tent envelope: ${formatMoney(session.lastMoney)}</p>
        ${this.scoreTable(session)}
        <div class="row">
          <button class="btn primary" data-action="tour">Back to the tour tent</button>
          <button class="btn" data-action="play">Play another nine</button>
        </div>
      </div>`;
  }

  private scorecard(session: GameSession, embedded: boolean): string {
    return `
      <div class="panel scorecard ${embedded ? "embedded" : ""}">
        <header class="tour-head">
          <h2>Scorecard</h2>
          ${embedded ? "" : `<button class="btn ghost" data-action="close-scorecard">Close</button>`}
        </header>
        ${this.scoreTable(session)}
      </div>`;
  }

  private scoreTable(session: GameSession): string {
    const holes = session.course.holes;
    const byHole = new Map(session.results.map((r) => [r.hole, r]));
    const out = holes.map((h) => byHole.get(h.number));
    const played = out.filter(Boolean);
    const thruPar = played.reduce((s, r) => s + (r!.strokes - r!.par), 0);
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Hole</th>
              ${holes.map((h) => `<th>${h.number}</th>`).join("")}
              <th>Out</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Par</th>
              ${holes.map((h) => `<td>${h.par}</td>`).join("")}
              <td>${session.course.par}</td>
            </tr>
            <tr>
              <th>Yds</th>
              ${holes.map((h) => `<td>${h.yards}</td>`).join("")}
              <td>${holes.reduce((s, h) => s + h.yards, 0)}</td>
            </tr>
            <tr class="scores">
              <th>Score</th>
              ${holes
                .map((h) => {
                  const r = byHole.get(h.number);
                  if (!r) return `<td class="empty">·</td>`;
                  const cls = r.strokes < r.par ? "birdie" : r.strokes > r.par ? "bogey" : "par";
                  return `<td class="${cls}" title="${scoreName(r.strokes, r.par)}">${r.strokes}</td>`;
                })
                .join("")}
              <td>${played.length ? played.reduce((s, r) => s + r!.strokes, 0) : "—"}</td>
            </tr>
          </tbody>
        </table>
        <p class="thru">Thru ${played.length} · ${played.length ? formatToPar(thruPar) : "E"}</p>
      </div>`;
  }

  private renderHud(session: GameSession): string {
    const hole = session.hole();
    const wind = windLabel(session.wind);
    const club = session.club();
    const running = session.results.length ? formatToPar(toPar(session.results)) : "E";
    const tip = session.tipVisible
      ? `<div class="tip">Move to aim. Click or Space three times: start · power · accuracy.</div>`
      : "";
    const msg = session.messageTime > 0 ? `<div class="toast">${escapeHtml(session.message)}</div>` : "";
    const phase =
      session.swingPhase === "power"
        ? "Set power"
        : session.swingPhase === "accuracy"
          ? "Time it"
          : session.swingPhase === "flight"
            ? "Ball in air"
            : "Aim and swing";
    return `
      <div class="hud-top">
        <div class="bug">
          <span class="net">${PLAYER_CARD.tour}</span>
          <strong>HOLE ${hole.number}</strong>
          <span>PAR ${hole.par}</span>
          <span>${hole.yards} YDS</span>
        </div>
        <div class="bug player">
          <strong>${escapeHtml(session.profile.name)}</strong>
          <span>Stroke ${Math.max(session.strokes, 0) + (session.swingPhase === "aim" ? 1 : 0)}</span>
          <span>Round ${running}</span>
        </div>
      </div>
      <div class="hud-mid">
        <div class="stat"><label>To pin</label><b>${Math.round(session.toPin())} yds</b></div>
        <div class="stat"><label>Lie</label><b>${surfaceLabel(session.lie)}</b></div>
        <div class="stat"><label>Wind</label><b>${wind.mph} ${wind.arrow}</b></div>
        <div class="stat"><label>Club</label><b>${club.shortName} · ${club.id === "putter" ? club.roll : club.carry}y</b></div>
        <div class="stat"><label>Hole</label><b>${escapeHtml(hole.name)}</b></div>
      </div>
      ${tip}
      ${msg}
      <div class="hud-bottom">
        <div class="clubs">
          ${CLUBS.map(
            (c, i) =>
              `<button class="club ${i === session.clubIndex ? "on" : ""}" data-action="club" data-payload="${i}">${c.shortName}</button>`,
          ).join("")}
        </div>
        <div class="tools">
          <span class="phase">${phase}</span>
          <button data-action="scorecard">Card</button>
          <button data-action="help">Help</button>
          <button data-action="mute">${session.audio.muted ? "Muted" : "Sound"}</button>
        </div>
      </div>`;
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
