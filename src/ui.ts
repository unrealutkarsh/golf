import { formatMoney, rankingFromProfile } from "./career";
import { CLUBS } from "./clubs";
import type { GameSession } from "./game";
import { playHudMode, showClubTray, windArrowDegrees, yardageReadout } from "./hud";
import { surfaceLabel, windLabel } from "./physics";
import { shapeLabel } from "./terrain";
import { formatToPar, scoreName, toPar, totalStrokes } from "./scoring";
import { courseById } from "./course";
import { PLAYER_CARD, TOURNAMENTS } from "./tour";
import type { CamMode, ScreenId } from "./types";

export class UI {
  private overlay: HTMLElement;
  private hud: HTMLElement;
  private lastScreen: ScreenId | "" = "";
  private lastHud = "";
  private lastOverlay = "";
  /** Lives outside the HUD markup, which is rebuilt whenever a number changes, so its animation can play through. */
  private callout: HTMLElement;
  private calloutId = -1;

  constructor(overlay: HTMLElement, hud: HTMLElement) {
    this.overlay = overlay;
    this.hud = hud;
    this.callout = document.createElement("div");
    this.callout.className = "callout";
    this.callout.hidden = true;
    this.callout.setAttribute("aria-live", "polite");
    hud.insertAdjacentElement("afterend", this.callout);
  }

  private syncCallout(session: GameSession): void {
    const c = session.callout;
    const show = Boolean(c) && session.calloutTime > 0 && session.screen === "play" && !session.helpOpen && !session.scorecardOpen;
    if (!show || !c) {
      this.callout.hidden = true;
      return;
    }
    if (c.id !== this.calloutId) {
      this.calloutId = c.id;
      this.callout.className = `callout tone-${c.tone}`;
      this.callout.innerHTML = `<b>${escapeHtml(c.title)}</b><span>${escapeHtml(c.detail)}</span>`;
      // Restart the entrance animation for back-to-back callouts.
      this.callout.hidden = true;
      void this.callout.offsetWidth;
    }
    this.callout.hidden = false;
    this.callout.classList.toggle("leaving", session.calloutTime < 0.35);
  }

  sync(session: GameSession, onAction: (action: string, payload?: string) => void): void {
    this.syncCallout(session);
    const screen = overlayScreen(session.screen, session.helpOpen, session.scorecardOpen);
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
        // Space is the swing key; a focused HUD button would also fire on it.
        (el as HTMLElement).blur();
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
          <div class="events">
            ${TOURNAMENTS.map((event) => {
              const course = courseById(event.courseId);
              return `
            <section class="event-card">
              <p class="kicker">${p.eventsPlayed > 0 && event.id === t.id ? "Last played" : "On the schedule"}</p>
              <h3>${escapeHtml(event.name)}</h3>
              <p>${escapeHtml(event.blurb)}</p>
              <p class="meta">${escapeHtml(course.name)} · ${course.holes.length} holes · Par ${course.par} · Purse ${formatMoney(event.purse)}</p>
              ${event.credit ? `<p class="credit">${escapeHtml(event.credit)}</p>` : ""}
              <button class="btn primary" data-action="play" data-payload="${escapeHtml(event.id)}">Tee it up</button>
            </section>`;
            }).join("")}
          </div>
        </div>
      </div>`;
  }

  private help(): string {
    return `
      <div class="panel help">
        <h2>How to play</h2>
        <ol>
          <li><b>Aim</b> by dragging, or nudge with arrows / A / D. A click or Space starts the swing without moving the line.</li>
          <li><b>Swing</b> with click or Space: start the meter, set power, then time the wide accuracy window. Power and accuracy appear only while you swing, then tuck away at address. The bar shows percent and yards. The white tick is the suggested fill — with the putter, flat hole-pace.</li>
          <li><b>Shape</b> Fade / Straight / Draw from the bag before you swing (or Z / X). The aim ribbon and flight tube bend in the air. Shape is off with the putter.</li>
          <li><b>Clubs</b> with Q / E, the mouse wheel, or the club name on the monitor. The bag stays closed at address and opens while you change clubs. The game suggests a club after each shot, but any club can be played from anywhere — including a wedge off the green.</li>
          <li><b>Camera</b> with V or View: auto, address (over the ball), follow. On the green the view sits over the ball looking at the pin — no player mesh in the way.</li>
          <li><b>Putting</b>: the dotted line is the putt you are about to hit, break included, and it turns gold when that pace drops. The white tick is flat hole-pace — uphill dies short of it, downhill runs by. Soft dies short, firm runs long. Read the line with ← → or by dragging. G toggles the fall grid. Sound is on (M mutes): a whoosh and contact for each club, plus a quiet wind.</li>
          <li>Wind moves the ball in the air. Rough grabs a landing ball and costs you distance and accuracy on the next shot; sand stops the ball dead, and only a wedge gets out cleanly. Misses just off the rough stay in play. Water is a drop plus one; far OB is stroke and distance.</li>
        </ol>
        <p class="keys">V camera · G grid · Z / X shape · C scorecard · H help · M mute · Esc cancel</p>
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
    return playHudHtml(session);
  }
}

/** In-round monitor. Yardage, wind, and lie stay up; the bag and swing chrome do not. */
export function playHudHtml(session: GameSession): string {
  const hole = session.hole();
  const wind = windLabel(session.wind);
  const club = session.club();
  const running = session.results.length ? formatToPar(toPar(session.results)) : "E";
  const yards = yardageReadout(session.toPin(), session.putting());
  const tray = showClubTray(session.swingPhase, session.clubTray);
  const mode = playHudMode(session.swingPhase, session.clubTray);
  const arrow = windArrowDegrees(session.wind.dir);
  const stroke = Math.max(session.strokes, 0) + (session.swingPhase === "aim" ? 1 : 0);
  const atAddress = session.swingPhase === "aim";
  const phase = phaseLabel(session);
  const shape = shapeLabel(session.shape);
  const tip = session.tipVisible
    ? `<p class="lm-tip">Drag to aim. Click or Space three times: start, power, accuracy.</p>`
    : "";
  const msg = session.messageTime > 0 ? `<p class="lm-toast">${escapeHtml(session.message)}</p>` : "";
  const bag = tray
    ? `<div class="lm-bag">
        <div class="lm-clubs">
          ${CLUBS.map(
            (c, i) =>
              `<button type="button" class="lm-club-btn${i === session.clubIndex ? " is-on" : ""}" data-action="club" data-payload="${i}">${c.shortName}</button>`,
          ).join("")}
        </div>
        <div class="lm-shapes">
          <button type="button" class="lm-shape-btn${session.shape < -0.2 ? " is-on" : ""}" data-action="shape" data-payload="-1" ${session.canShape() ? "" : "disabled"}>Fade</button>
          <button type="button" class="lm-shape-btn${Math.abs(session.shape) <= 0.2 ? " is-on" : ""}" data-action="shape" data-payload="0" ${session.canShape() ? "" : "disabled"}>Straight</button>
          <button type="button" class="lm-shape-btn${session.shape > 0.2 ? " is-on" : ""}" data-action="shape" data-payload="1" ${session.canShape() ? "" : "disabled"}>Draw</button>
        </div>
        ${session.putting() ? `<p class="lm-bag-note">Read the break. Arrows or drag to aim.</p>` : `<p class="lm-bag-note">Z fade · X draw</p>`}
      </div>`
    : "";
  const shapeControl =
    atAddress && session.canShape()
      ? `<button type="button" class="lm-shape" data-action="clubs">${shape}</button>`
      : "";
  return `
    <div class="lm" data-hud="${mode}">
      <div class="lm-status">
        <span class="lm-hole">Hole ${hole.number}</span>
        <span>Par ${hole.par}</span>
        <span>${hole.yards}</span>
        <b class="lm-score">${running}</b>
        <span>Stroke ${stroke}</span>
        <span class="lm-name">${escapeHtml(session.profile.name)}</span>
        <div class="lm-tools">
          <button type="button" data-action="scorecard">Card</button>
          <button type="button" data-action="help">Help</button>
          <button type="button" data-action="mute" class="${session.audio.muted ? "is-on" : ""}">${session.audio.muted ? "Muted" : "Sound"}</button>
          <button type="button" data-action="camera">${camModeLabel(session.camMode)}</button>
          <button type="button" data-action="grid" class="${session.puttGrid ? "is-on" : ""}">Grid</button>
        </div>
      </div>
      <div class="lm-stack">
        <section class="lm-readout lie-${session.lie}">
          <p class="lm-lie">${surfaceLabel(session.lie)}</p>
          <div class="lm-main">
            <div class="lm-yards">
              <b>${yards.value}</b>
              <span class="lm-cap">${yards.caption}<i>${yards.unit}</i></span>
            </div>
            <div class="lm-wind" title="${wind.mph} ${wind.arrow}">
              <i class="lm-arrow" style="transform:rotate(${arrow.toFixed(1)}deg)"></i>
              <div>
                <b>${Math.round(session.wind.speed)}</b>
                <span>${wind.arrow} · MPH</span>
              </div>
            </div>
          </div>
          <button type="button" class="lm-club" data-action="clubs" aria-expanded="${tray ? "true" : "false"}" ${atAddress ? "" : "disabled"}>${escapeHtml(club.name)}</button>
          ${shapeControl}
          ${phase ? `<p class="lm-phase">${phase}</p>` : ""}
        </section>
        ${bag}
      </div>
      ${tip}
      ${msg}
    </div>`;
}

function phaseLabel(session: GameSession): string {
  if (session.swingPhase === "power") return "Set power";
  if (session.swingPhase === "accuracy") return "Time it";
  if (session.swingPhase === "flight") return session.ball.z > 0.45 ? "In the air" : "Rolling";
  if (session.swingPhase === "settle") return "Ball down";
  return "";
}

function camModeLabel(mode: CamMode): string {
  if (mode === "player") return "Address";
  if (mode === "follow") return "Follow";
  if (mode === "putt") return "Putt";
  return "Auto";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Which overlay to draw. The scorecard can open over play and over the hole / round summaries. */
export function overlayScreen(screen: ScreenId, helpOpen: boolean, scorecardOpen: boolean): ScreenId | "scorecard" {
  if (helpOpen) return "help";
  if (scorecardOpen && (screen === "play" || screen === "holeEnd" || screen === "roundEnd")) return "scorecard";
  return screen;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
