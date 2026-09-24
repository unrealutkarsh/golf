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
(window as unknown as { __ptg3d?: boolean }).__ptg3d = Boolean(scene3d);

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
      session.startTournament(payload);
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
    case "clubs":
      session.toggleClubTray();
      break;
  }
}

function worldFromPointer(x: number, y: number) {
  return scene3d ? scene3d.worldFromScreen(x, y) : renderer.worldFromScreen(session, x, y);
}

let pointerDown: { x: number; y: number; t: number } | null = null;
let pointerDragged = false;

window.addEventListener("pointerdown", (e) => {
  if (session.screen !== "play" || session.helpOpen || session.scorecardOpen) return;
  const target = e.target as HTMLElement;
  if (target.closest("button, input, a, .panel")) return;
  pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
  pointerDragged = false;
  if (session.swingPhase !== "aim") session.tap();
});

window.addEventListener("pointermove", (e) => {
  if (session.screen !== "play" || session.swingPhase !== "aim" || !pointerDown) return;
  const target = e.target as HTMLElement;
  if (target.closest("button, input, .panel")) return;
  const moved = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y);
  if (moved < 16) return;
  pointerDragged = true;
  session.aimAt(worldFromPointer(e.clientX, e.clientY));
});

window.addEventListener("pointerup", (e) => {
  if (!pointerDown || session.screen !== "play" || session.helpOpen || session.scorecardOpen) {
    pointerDown = null;
    pointerDragged = false;
    return;
  }
  const target = e.target as HTMLElement;
  if (target.closest("button, input, a, .panel")) {
    pointerDown = null;
    pointerDragged = false;
    return;
  }
  const moved = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y);
  const quick = performance.now() - pointerDown.t < 450;
  const dragged = pointerDragged;
  pointerDown = null;
  pointerDragged = false;
  if (session.swingPhase === "aim" && !dragged && moved < 14 && quick) session.tap();
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
    // A held key auto-repeats; each swing stage needs its own press.
    if (e.repeat) return;
    if (session.screen === "play" && !session.helpOpen && !session.scorecardOpen) session.tap();
    return;
  }
  // Finer steps on the green, where a few inches of aim decide whether the break takes it in.
  const nudge = session.putting() ? 0.008 : 0.04;
  if (key === "arrowleft" || key === "a") session.nudgeAim(-nudge);
  if (key === "arrowright" || key === "d") session.nudgeAim(nudge);
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
    else if (session.screen === "play" && session.clubTray === "open" && session.swingPhase === "aim") session.closeClubTray();
    else if (session.screen === "play") session.cancelSwing();
    else if (session.screen === "tour") session.screen = "title";
  }
});

function step(dt: number): void {
  session.update(dt);
  if (scene3d) {
    scene3d.sync(session, dt);
    scene3d.render();
  }
  renderer.draw(session, dt, { hudOnly: Boolean(scene3d) });
  ui.sync(session, handleAction);
}

let last = performance.now();
function frame(now: number): void {
  const elapsed = Math.max(0, (now - last) / 1000);
  last = now;
  // The swing meter stays on a short step so a hitch cannot skip the accuracy window.
  // Flight integrates in fixed 1/60 steps inside that budget. Capping it at 33ms
  // turns a slow frame into slow motion, and on a software GPU a drive then sits
  // on "Ball in air" for tens of seconds. A one-second cap keeps the ball on
  // wall-clock time down to about 1 fps; settle uses it too so the landing hold
  // does not stall after the ball is already down.
  const cap = session.swingPhase === "flight" || session.swingPhase === "settle" ? 1 : 0.033;
  step(Math.min(cap, elapsed));
  requestAnimationFrame(frame);
}

/** QA hook: advance whole frames by hand, e.g. from automation while the tab is hidden and rAF is paused. */
(window as unknown as { __ptgStep: (frames: number, dt?: number) => void }).__ptgStep = (frames, dt = 1 / 60) => {
  for (let i = 0; i < frames; i++) step(dt);
};

requestAnimationFrame(frame);

function qaEvent(): string | undefined {
  return new URLSearchParams(location.search).get("event") || undefined;
}

function poseShapedShot(session: GameSession, shape: number): void {
  session.startTournament(qaEvent());
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

/** Park the ball on a lie, then optionally hold a contact so the splash can be framed. */
function poseLie(session: GameSession, lie: "bunker" | "rough" | "fairway" | "green"): boolean {
  const hole = session.hole();
  const ax = hole.pin.x - hole.tee.x;
  const ay = hole.pin.y - hole.tee.y;
  const len = Math.hypot(ax, ay) || 1;
  const fx = ax / len;
  const fy = ay / len;
  const px = -fy;
  const py = fx;
  const spots: { x: number; y: number }[] = [];
  if (lie === "bunker") {
    for (const b of hole.bunkers) spots.push({ x: b.cx, y: b.cy });
  } else if (lie === "green") {
    spots.push({ x: hole.pin.x - 6, y: hole.pin.y + 1.2 });
  } else if (lie === "fairway") {
    // Short leftover first so the address lens lifts and the ball stays in frame.
    for (const t of [0.86, 0.78, 0.2, 0.35]) spots.push({ x: hole.tee.x + fx * len * t, y: hole.tee.y + fy * len * t });
  } else {
    for (const t of [0.8, 0.72, 0.2]) {
      const x = hole.tee.x + fx * len * t;
      const y = hole.tee.y + fy * len * t;
      for (const s of [24, 30, 36, -26, -34]) spots.push({ x: x + px * s, y: y + py * s });
    }
  }
  for (const p of spots) {
    session.ball.pos = p;
    session.ball.vel = { x: 0, y: 0 };
    session.ball.z = 0;
    session.refreshLie();
    if (session.lie !== lie) continue;
    session.aim = Math.atan2(hole.pin.y - p.y, hole.pin.x - p.x);
    session.visualAim = session.aim;
    session.aimExplicit = true;
    return true;
  }
  return false;
}

function poseLieContact(session: GameSession, lie: "bunker" | "rough" | "fairway", club: "driver" | "sw" | "iron7", frames: number, release: boolean): void {
  session.startTournament(qaEvent());
  session.tipVisible = false;
  session.wind = { speed: 3, dir: 0.4 };
  if (!poseLie(session, lie)) return;
  session.clubIndex = clubIndex(club);
  session.power = 0.84;
  session.accuracy = 0;
  session.swingPhase = "accuracy";
  session.meter = 0.5;
  // Follow keeps the strike in the middle of the frame. Address looks past a long shot.
  session.camMode = "follow";
  session.tap();
  session.hitStop = release ? session.hitStop : 30;
  if (release) {
    for (let i = 0; i < frames; i++) step(1 / 60);
  }
  session.impact = 0;
  session.calloutTime = 0;
  session.lieStill = true;
  session.update = () => undefined;
}

const qa = new URLSearchParams(location.search).get("qa");
if (qa === "round") {
  session.startTournament(qaEvent());
  session.playThroughForTest();
} else if (qa === "fairway" || qa === "tee" || qa === "clubs") {
  session.startTournament(qaEvent());
  session.tipVisible = false;
  if (qa === "clubs") session.toggleClubTray();
} else if (qa === "swing") {
  session.startTournament(qaEvent());
  session.tipVisible = false;
  session.camMode = "player";
  session.swingPhase = "accuracy";
  session.meter = 0.62;
  session.power = 0.72;
  session.accuracy = 0;
  session.lockedAccuracy = false;
  session.update = () => undefined;
} else if (qa === "fairwayClose") {
  session.startTournament(qaEvent());
  session.tipVisible = false;
  const hole = session.hole();
  session.ball.pos = { x: hole.tee.x + 92, y: hole.tee.y - 2 };
  session.ball.vel = { x: 0, y: 0 };
  session.lie = "fairway";
  session.aim = Math.atan2(hole.pin.y - session.ball.pos.y, hole.pin.x - session.ball.pos.x);
  session.visualAim = session.aim;
  session.camMode = "player";
} else if (qa === "flight") {
  session.startTournament(qaEvent());
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
} else if (qa === "green" || qa === "greenShort" || qa === "greenLie") {
  session.startTournament(qaEvent());
  session.tipVisible = false;
  const hole = session.hole();
  const offset = qa === "greenShort" ? { x: hole.pin.x - 1.15, y: hole.pin.y } : { x: hole.pin.x - 7.4, y: hole.pin.y + 2.1 };
  session.ball.pos = offset;
  session.ball.vel = { x: 0, y: 0 };
  session.ball.z = 0;
  session.refreshLie();
  session.autoClub();
  session.aim = Math.atan2(hole.pin.y - session.ball.pos.y, hole.pin.x - session.ball.pos.x);
  session.visualAim = session.aim;
  session.power = session.suggestedPower();
  session.visualPower = session.power;
  session.camMode = "putt";
  session.puttGrid = qa === "green";
} else if (qa === "bunker" || qa === "bunkerWedge") {
  session.startTournament(qaEvent());
  session.tipVisible = false;
  poseLie(session, "bunker");
  session.clubIndex = clubIndex(qa === "bunkerWedge" ? "sw" : "driver");
  session.camMode = "player";
} else if (qa === "rough") {
  session.startTournament(qaEvent());
  session.tipVisible = false;
  poseLie(session, "rough");
  session.clubIndex = clubIndex("iron7");
  session.camMode = "player";
} else if (qa === "bunkerHit") {
  poseLieContact(session, "bunker", "driver", 16, false);
} else if (qa === "bunkerWedgeHit") {
  poseLieContact(session, "bunker", "sw", 16, false);
} else if (qa === "roughHit") {
  poseLieContact(session, "rough", "iron7", 6, true);
} else if (qa === "fairwayHit") {
  poseLieContact(session, "fairway", "iron7", 8, false);
}

(window as unknown as { __ptg: GameSession }).__ptg = session;
