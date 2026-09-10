import { GameSession } from "./game";
import { Renderer } from "./renderer";
import { UI } from "./ui";

const canvas = document.querySelector<HTMLCanvasElement>("#view");
const overlay = document.querySelector<HTMLElement>("#overlay");
const hud = document.querySelector<HTMLElement>("#hud");
if (!canvas || !overlay || !hud) throw new Error("Missing root elements");

const session = new GameSession();
const renderer = new Renderer(canvas);
const ui = new UI(overlay, hud);

function handleAction(action: string, payload?: string): void {
  session.audio.unlock();
  switch (action) {
    case "title":
      session.screen = "title";
      session.helpOpen = false;
      session.scorecardOpen = false;
      break;
    case "tour":
      session.screen = "tour";
      session.helpOpen = false;
      session.scorecardOpen = false;
      break;
    case "play":
      session.startTournament();
      break;
    case "help":
      session.helpOpen = true;
      break;
    case "close-help":
      session.helpOpen = false;
      if (session.screen === "title") session.screen = "title";
      break;
    case "scorecard":
      session.scorecardOpen = true;
      break;
    case "close-scorecard":
      session.scorecardOpen = false;
      break;
    case "next-hole":
      session.nextAfterHole();
      break;
    case "mute":
      session.audio.toggle();
      break;
    case "club":
      if (payload) session.setClub(Number(payload));
      break;
    case "rename":
      if (payload) session.rename(payload);
      break;
  }
}

let pointerDown: { x: number; y: number; t: number } | null = null;

window.addEventListener("pointerdown", (e) => {
  if (session.screen !== "play" || session.helpOpen || session.scorecardOpen) return;
  const target = e.target as HTMLElement;
  if (target.closest("button, input, a, .panel")) return;
  pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (session.swingPhase !== "aim") session.tap();
});

window.addEventListener("pointermove", (e) => {
  if (session.screen !== "play" || session.swingPhase !== "aim") return;
  const target = e.target as HTMLElement;
  if (target.closest("button, input, .panel")) return;
  session.aimAt(renderer.worldFromScreen(session, e.clientX, e.clientY));
});

window.addEventListener("pointerup", (e) => {
  if (!pointerDown || session.screen !== "play" || session.helpOpen || session.scorecardOpen) {
    pointerDown = null;
    return;
  }
  const target = e.target as HTMLElement;
  if (target.closest("button, input, a, .panel")) {
    pointerDown = null;
    return;
  }
  const moved = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y);
  const quick = performance.now() - pointerDown.t < 450;
  pointerDown = null;
  if (session.swingPhase === "aim" && moved < 14 && quick) session.tap();
});

window.addEventListener("wheel", (e) => {
  if (session.screen !== "play") return;
  e.preventDefault();
  session.cycleClub(e.deltaY > 0 ? 1 : -1);
}, { passive: false });

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === " " || e.code === "Space") {
    e.preventDefault();
    if (session.screen === "play" && !session.helpOpen && !session.scorecardOpen) session.tap();
    return;
  }
  if (key === "arrowleft" || key === "a") session.nudgeAim(-0.04);
  if (key === "arrowright" || key === "d") session.nudgeAim(0.04);
  if (key === "q" || key === "[") session.cycleClub(-1);
  if (key === "e" || key === "]") session.cycleClub(1);
  if (key === "c") session.scorecardOpen = !session.scorecardOpen;
  if (key === "h") session.helpOpen = !session.helpOpen;
  if (key === "m") session.audio.toggle();
  if (key === "escape") {
    if (session.helpOpen) session.helpOpen = false;
    else if (session.scorecardOpen) session.scorecardOpen = false;
    else if (session.screen === "play") session.cancelSwing();
    else if (session.screen === "tour") session.screen = "title";
  }
});

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  session.update(dt);
  renderer.draw(session, dt);
  ui.sync(session, handleAction);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

const qa = new URLSearchParams(location.search).get("qa");
if (qa === "round") {
  session.startTournament();
  session.playThroughForTest();
}

(window as unknown as { __ptg: GameSession }).__ptg = session;
