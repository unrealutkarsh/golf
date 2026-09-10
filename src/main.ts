import { clubIndex } from "./clubs";
import { GameSession } from "./game";
import { Renderer } from "./renderer";
import { createCourseScene } from "./scene3d";
import { UI } from "./ui";

const canvas = document.querySelector<HTMLCanvasElement>("#view");
const glCanvas = document.querySelector<HTMLCanvasElement>("#gl");
const overlay = document.querySelector<HTMLElement>("#overlay");
const hud = document.querySelector<HTMLElement>("#hud");
if (!canvas || !overlay || !hud) throw new Error("Missing root elements");

const session = new GameSession();
const renderer = new Renderer(canvas);
const scene3d = glCanvas ? createCourseScene(glCanvas) : null;
const ui = new UI(overlay, hud);
if (scene3d) document.body.classList.add("has-3d");

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
    case "camera":
      session.cycleCam();
      break;
    case "grid":
      session.toggleGrid();
      break;
    case "shape":
      if (payload) session.setShape(Number(payload));
      break;
  }
}

function worldFromPointer(x: number, y: number) {
  return scene3d ? scene3d.worldFromScreen(x, y) : renderer.worldFromScreen(session, x, y);
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
  session.aimAt(worldFromPointer(e.clientX, e.clientY));
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
  if (key === "z") session.nudgeShape(-0.25);
  if (key === "x") session.nudgeShape(0.25);
  if (key === "v") session.cycleCam();
  if (key === "g") session.toggleGrid();
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
  if (scene3d) {
    scene3d.sync(session, dt);
    scene3d.render();
  }
  renderer.draw(session, dt, { hudOnly: Boolean(scene3d) });
  ui.sync(session, handleAction);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

function poseShapedShot(session: GameSession, shape: number): void {
  session.startTournament();
  session.wind = { speed: 0, dir: 0 };
  session.tipVisible = false;
  session.clubIndex = clubIndex("iron7");
  session.shape = shape;
  session.power = 1;
  session.accuracy = 0;
  session.swingPhase = "accuracy";
  session.meter = 0.5;
  session.camMode = "follow";
  session.tap();
  const mid = session.shotArc[Math.floor(session.shotArc.length * 0.58)] ?? session.shotArc[0];
  session.ball.pos = { ...mid.pos };
  session.ball.z = mid.z;
  session.ball.vz = 0;
  session.update = () => undefined;
}

const qa = new URLSearchParams(location.search).get("qa");
if (qa === "round") {
  session.startTournament();
  session.playThroughForTest();
} else if (qa === "fairway" || qa === "tee") {
  session.startTournament();
  session.tipVisible = false;
} else if (qa === "fairwayClose") {
  session.startTournament();
  session.tipVisible = false;
  const hole = session.hole();
  session.ball.pos = { x: hole.tee.x + 92, y: hole.tee.y - 2 };
  session.ball.vel = { x: 0, y: 0 };
  session.lie = "fairway";
  session.aim = Math.atan2(hole.pin.y - session.ball.pos.y, hole.pin.x - session.ball.pos.x);
  session.camMode = "player";
} else if (qa === "flight") {
  session.startTournament();
  session.power = 1;
  session.accuracy = 0;
  session.shape = 0;
  session.swingPhase = "accuracy";
  session.meter = 0.5;
  session.tipVisible = false;
  session.camMode = "follow";
  session.tap();
  const apex = session.shotArc.reduce((best, s) => (s.z > best.z ? s : best), session.shotArc[0]);
  session.ball.pos = { ...apex.pos };
  session.ball.z = apex.z;
  session.ball.vz = 0;
  session.update = () => undefined;
} else if (qa === "shape" || qa === "fade") {
  poseShapedShot(session, qa === "fade" ? -1 : 1);
} else if (qa === "green") {
  session.startTournament();
  session.tipVisible = false;
  const hole = session.hole();
  session.ball.pos = { x: hole.pin.x - 7.4, y: hole.pin.y + 2.1 };
  session.ball.vel = { x: 0, y: 0 };
  session.ball.z = 0;
  session.lie = "green";
  session.autoClub();
  session.aim = Math.atan2(hole.pin.y - session.ball.pos.y, hole.pin.x - session.ball.pos.x);
  session.power = session.suggestedPower();
  session.camMode = "putt";
  session.puttGrid = true;
}

(window as unknown as { __ptg: GameSession }).__ptg = session;
