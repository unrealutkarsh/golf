import { AudioBus } from "./audio";
import { loadProfile, recordRound, saveProfile } from "./career";
import { CLUBS, clubIndex, recommendClub } from "./clubs";
import { HARBOR_DUNES, lieAt, onGreen } from "./course";
import { hashString, mulberry32, clamp, dist, wrapAngle, type Vec2 } from "./math";
import { isPuttingSituation, resolveCamView, suggestedPuttPower, type ResolvedCam } from "./terrain";
import {
  createBall,
  defaultAim,
  launchBall,
  predictedLanding,
  sampleFlightPath,
  stepBall,
  MAX_HOLE_STROKES,
  type FlightSample,
} from "./physics";
import { prizeMoney, scoreName } from "./scoring";
import { TOURNAMENTS } from "./tour";
import type {
  Ball,
  Club,
  Course,
  Hole,
  HoleResult,
  Lie,
  PlayerProfile,
  ScreenId,
  SwingPhase,
  Tournament,
  Wind,
  CamMode,
} from "./types";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export class GameSession {
  screen: ScreenId = "title";
  course: Course = HARBOR_DUNES;
  tournament: Tournament = TOURNAMENTS[0];
  holeIndex = 0;
  ball: Ball = createBall(HARBOR_DUNES.holes[0].tee);
  lastShotPos: Vec2 = { ...HARBOR_DUNES.holes[0].tee };
  aim = 0;
  clubIndex = 0;
  swingPhase: SwingPhase = "aim";
  meter = 0;
  meterDir = 1;
  power = 0.85;
  accuracy = 0;
  lockedAccuracy = false;
  wind: Wind = { speed: 6, dir: 0.4 };
  strokes = 0;
  putts = 0;
  penalties = 0;
  results: HoleResult[] = [];
  lie: Lie = "tee";
  reachedFairway: boolean | null = null;
  reachedGreen = false;
  gir = false;
  cam: Camera = { x: 200, y: 150, zoom: 3 };
  camHold = false;
  camMode: CamMode = "auto";
  puttGrid = true;
  shape = 0;
  tipVisible = true;
  helpOpen = false;
  scorecardOpen = false;
  profile: PlayerProfile = loadProfile();
  lastHoleBanner: { title: string; detail: string } | null = null;
  lastMoney = 0;
  bannerTime = 0;
  message = "";
  messageTime = 0;
  seed = 2026;
  audio = new AudioBus();
  shotArc: FlightSample[] = [];
  /** Smoothed power used only for aim/power preview lines — HUD meter stays live. */
  visualPower = 0.3;

  constructor(seed = 2026) {
    this.seed = seed;
    this.resetHole(0, false);
  }

  hole(): Hole {
    return this.course.holes[this.holeIndex];
  }

  club(): Club {
    return CLUBS[this.clubIndex];
  }

  toPin(): number {
    return dist(this.ball.pos, this.hole().pin);
  }

  putting(): boolean {
    return isPuttingSituation(this.lie, this.toPin(), this.club().id, this.hole(), this.ball.pos);
  }

  resolvedCam(): ResolvedCam {
    return resolveCamView(this.camMode, this.swingPhase, this.putting());
  }

  suggestedPower(): number {
    if (this.club().id === "putter") return suggestedPuttPower(this.toPin());
    return 0.92;
  }

  cycleCam(): void {
    const order: CamMode[] = ["auto", "player", "follow", "putt"];
    this.camMode = order[(order.indexOf(this.camMode) + 1) % order.length];
    this.flash(this.camMode === "auto" ? "Camera · Auto" : `Camera · ${this.camMode}`);
  }

  toggleGrid(): void {
    this.puttGrid = !this.puttGrid;
    this.flash(this.puttGrid ? "Putting grid on" : "Putting grid off");
  }

  canShape(): boolean {
    return this.club().id !== "putter" && this.lie !== "green" && (this.swingPhase === "aim" || this.swingPhase === "power");
  }

  nudgeShape(delta: number): void {
    if (!this.canShape()) return;
    this.shape = clamp(this.shape + delta, -1, 1);
    this.flash(this.shape > 0.2 ? "Draw" : this.shape < -0.2 ? "Fade" : "Straight");
  }

  setShape(value: number): void {
    if (this.club().id === "putter" || this.lie === "green") {
      this.shape = 0;
      return;
    }
    if (this.swingPhase !== "aim" && this.swingPhase !== "power") return;
    this.shape = clamp(value, -1, 1);
  }

  private previewTargetPower(): number {
    if (this.swingPhase === "aim") return this.suggestedPower();
    if (this.swingPhase === "power") return Math.max(this.meter, 0.2);
    return this.power;
  }

  private previewShot() {
    return {
      aim: this.aim,
      power: this.swingPhase === "aim" || this.swingPhase === "power" ? this.visualPower : this.swingPhase === "accuracy" ? this.power : this.visualPower,
      accuracy: this.swingPhase === "accuracy" ? this.meter * 2 - 1 : this.accuracy,
      club: this.club(),
      lie: this.lie,
      wind: this.wind,
      shape: this.shape,
    };
  }

  previewFlight(): FlightSample[] {
    return sampleFlightPath(this.ball.pos, this.previewShot(), this.hole());
  }

  previewLanding(): Vec2 {
    return predictedLanding(this.ball.pos, this.previewShot(), this.hole());
  }

  startTournament(): void {
    this.results = [];
    this.holeIndex = 0;
    this.lastMoney = 0;
    this.tipVisible = this.profile.eventsPlayed === 0;
    this.resetHole(0, false);
    this.screen = "play";
    this.scorecardOpen = false;
    this.helpOpen = false;
  }

  resetHole(index: number, keepResults: boolean): void {
    this.holeIndex = index;
    const hole = this.hole();
    this.ball = createBall(hole.tee);
    this.lastShotPos = { ...hole.tee };
    this.aim = defaultAim(this.ball.pos, hole);
    this.swingPhase = "aim";
    this.meter = 0;
    this.meterDir = 1;
    this.power = 0.85;
    this.accuracy = 0;
    this.lockedAccuracy = false;
    this.strokes = 0;
    this.putts = 0;
    this.penalties = 0;
    this.lie = lieAt(hole, this.ball.pos);
    this.reachedFairway = hole.par === 3 ? null : false;
    this.reachedGreen = false;
    this.gir = false;
    this.wind = this.windForHole(index);
    this.autoClub();
    this.visualPower = this.suggestedPower();
    this.cam.x = (hole.tee.x + hole.pin.x) / 2;
    this.cam.y = (hole.tee.y + hole.pin.y) / 2;
    this.cam.zoom = 2.8;
    this.camHold = false;
    this.shape = 0;
    this.shotArc = [];
    this.lastHoleBanner = null;
    if (!keepResults) this.message = "";
  }

  windForHole(index: number): Wind {
    const rng = mulberry32(hashString(`${this.seed}-${this.course.id}-${index}`));
    return { speed: 2 + rng() * 11, dir: rng() * Math.PI * 2 };
  }

  autoClub(): void {
    const rec = recommendClub(this.toPin(), this.lie);
    if (this.strokes === 0 && this.hole().par >= 4 && this.lie === "tee") {
      this.clubIndex = clubIndex("driver");
      return;
    }
    this.clubIndex = clubIndex(rec.id);
  }

  cycleClub(dir: number): void {
    if (this.swingPhase !== "aim") return;
    this.clubIndex = (this.clubIndex + dir + CLUBS.length) % CLUBS.length;
  }

  setClub(index: number): void {
    if (this.swingPhase !== "aim") return;
    this.clubIndex = clamp(index, 0, CLUBS.length - 1);
  }

  nudgeAim(delta: number): void {
    if (this.swingPhase !== "aim") return;
    this.aim = wrapAngle(this.aim + delta);
  }

  aimAt(world: Vec2): void {
    if (this.swingPhase !== "aim") return;
    this.aim = Math.atan2(world.y - this.ball.pos.y, world.x - this.ball.pos.x);
  }

  tap(): void {
    this.audio.unlock();
    if (this.screen !== "play") return;
    if (this.swingPhase === "aim") {
      this.swingPhase = "power";
      this.meter = 0.02;
      this.meterDir = 1;
      this.tipVisible = false;
      return;
    }
    if (this.swingPhase === "power") {
      this.power = clamp(this.meter, 0.08, 1);
      this.swingPhase = "accuracy";
      this.meter = 0.5;
      this.meterDir = 1;
      this.lockedAccuracy = false;
      return;
    }
    if (this.swingPhase === "accuracy") {
      const raw = clamp(this.meter * 2 - 1, -1, 1);
      this.accuracy = Math.abs(raw) < 0.12 ? 0 : Math.sign(raw) * raw * raw;
      this.lockedAccuracy = true;
      this.fire();
    }
  }

  cancelSwing(): void {
    if (this.swingPhase === "power" || this.swingPhase === "accuracy") {
      this.swingPhase = "aim";
      this.lockedAccuracy = false;
    }
  }

  private fire(): void {
    this.lastShotPos = { ...this.ball.pos };
    this.strokes += 1;
    const club = this.club();
    if (club.id === "putter") {
      this.audio.putt();
      if (this.lie === "green") this.putts += 1;
    } else {
      this.audio.swing(this.power);
    }
    const shot = {
      aim: this.aim,
      power: this.power,
      accuracy: this.accuracy,
      club,
      lie: this.lie,
      wind: this.wind,
      shape: this.shape,
    };
    this.shotArc = sampleFlightPath(this.ball.pos, shot, this.hole());
    this.ball = launchBall(this.ball.pos, shot);
    this.swingPhase = "flight";
  }

  update(dt: number): void {
    this.bannerTime = Math.max(0, this.bannerTime - dt);
    this.messageTime = Math.max(0, this.messageTime - dt);
    if (this.screen !== "play") return;
    const target = this.previewTargetPower();
    const follow = this.swingPhase === "power" ? 0.018 : 0.00035;
    this.visualPower += (target - this.visualPower) * (1 - Math.pow(follow, Math.max(dt, 0.001)));

    if (this.swingPhase === "power") {
      this.meter += this.meterDir * dt * 0.72;
      if (this.meter >= 1) {
        this.meter = 1;
        this.meterDir = -1;
      }
      if (this.meter <= 0) {
        this.meter = 0;
        this.meterDir = 1;
      }
    } else if (this.swingPhase === "accuracy") {
      this.meter += this.meterDir * dt * 0.5;
      if (this.meter >= 1) {
        this.meter = 1;
        this.meterDir = -1;
      }
      if (this.meter <= 0) {
        this.meter = 0;
        this.meterDir = 1;
      }
    } else if (this.swingPhase === "flight" || this.swingPhase === "settle") {
      this.simulate(dt);
    }
  }

  private simulate(dt: number): void {
    const hole = this.hole();
    const step = stepBall(this.ball, hole, this.wind, dt, this.club().bounce);
    this.ball = step.ball;

    for (const ev of step.events) {
      if (ev.type === "splash") {
        this.audio.splash();
        this.flash("Water hazard · one-stroke penalty");
      }
      if (ev.type === "ob") this.flash("Out of bounds · stroke and distance");
      if (ev.type === "tree") this.flash("Clipped a tree");
      if (ev.type === "lip") this.flash("Lip out");
    }

    if (step.penaltyKind === "water") {
      this.penalties += 1;
      this.strokes += 1;
      this.lie = step.lie;
      this.finishShot(false);
      return;
    }
    if (step.penaltyKind === "ob") {
      this.penalties += 1;
      this.strokes += 1;
      this.ball = createBall(this.lastShotPos);
      this.lie = lieAt(hole, this.ball.pos);
      this.finishShot(false);
      return;
    }

    if (step.holed) {
      this.finishHole();
      return;
    }

    if (!step.flying) {
      this.lie = step.lie;
      this.finishShot(true);
    }
  }

  private finishShot(landed: boolean): void {
    const hole = this.hole();
    if (landed && this.strokes === 1 && hole.par >= 4) {
      this.reachedFairway = this.lie === "fairway" || this.lie === "green";
    }
    if (landed && this.lie === "green" && !this.reachedGreen) {
      this.reachedGreen = true;
      this.gir = this.strokes <= hole.par - 2;
    }
    if (this.strokes >= MAX_HOLE_STROKES && !this.isHoled()) {
      this.strokes = MAX_HOLE_STROKES;
      this.finishHole(true);
      return;
    }
    this.swingPhase = "aim";
    this.lockedAccuracy = false;
    this.shotArc = [];
    this.aim = defaultAim(this.ball.pos, hole);
    this.autoClub();
    if (this.club().id === "putter" || onGreen(hole, this.ball.pos)) {
      this.power = suggestedPuttPower(this.toPin());
      this.shape = 0;
    }
    this.visualPower = this.suggestedPower();
  }

  isHoled(): boolean {
    return dist(this.ball.pos, this.hole().pin) < 0.2 && this.swingPhase !== "flight";
  }

  private finishHole(pickedUp = false): void {
    const hole = this.hole();
    const strokes = Math.max(this.strokes, 1);
    const result: HoleResult = {
      hole: hole.number,
      par: hole.par,
      strokes,
      putts: this.putts,
      fairwayHit: this.reachedFairway,
      gir: this.gir,
      penalties: this.penalties,
    };
    this.results = [...this.results.filter((r) => r.hole !== hole.number), result];
    const name = pickedUp ? "Pick-up" : scoreName(strokes, hole.par);
    this.lastHoleBanner = {
      title: name,
      detail: `Hole ${hole.number} · ${strokes} stroke${strokes === 1 ? "" : "s"}`,
    };
    this.bannerTime = 2.2;
    const diff = strokes - hole.par;
    if (diff <= -1) this.audio.cheer(diff <= -2 ? 2 : 1);
    else this.audio.hole();
    this.swingPhase = "aim";
    this.screen = "holeEnd";
  }

  nextAfterHole(): void {
    if (this.holeIndex >= this.course.holes.length - 1) {
      this.endRound();
      return;
    }
    this.resetHole(this.holeIndex + 1, true);
    this.screen = "play";
  }

  endRound(): void {
    const toPar = this.results.reduce((s, r) => s + (r.strokes - r.par), 0);
    this.lastMoney = prizeMoney(toPar, this.tournament.purse);
    this.profile = recordRound(this.profile, toPar, this.lastMoney);
    this.screen = "roundEnd";
  }

  flash(text: string): void {
    this.message = text;
    this.messageTime = 2.4;
  }

  rename(name: string): void {
    const trimmed = name.trim().slice(0, 24) || this.profile.name;
    this.profile = { ...this.profile, name: trimmed };
    saveProfile(this.profile);
  }

  completeHoleForTest(strokes: number): void {
    this.strokes = strokes;
    this.finishHole();
  }

  playThroughForTest(): void {
    this.results = [];
    for (const hole of this.course.holes) {
      this.results.push({
        hole: hole.number,
        par: hole.par,
        strokes: hole.par,
        putts: 2,
        fairwayHit: hole.par === 3 ? null : true,
        gir: true,
        penalties: 0,
      });
    }
    this.endRound();
  }
}
