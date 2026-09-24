import { AudioBus } from "./audio";
import { burstLife, strikeCallout } from "./lie-story";
import { loadProfile, recordRound, saveProfile } from "./career";
import { CLUBS, clubById, clubIndex, meterYardage, recommendClub, suggestedShotPower } from "./clubs";
import { courseById, HARBOR_DUNES, lieAt, onGreen } from "./course";
import { angleApproach, expApproach, hashString, mulberry32, clamp, dist, wrapAngle, type Vec2 } from "./math";
import {
  isPuttingSituation,
  PUTT_HOLE_FILL,
  resolveCamView,
  type ResolvedCam,
} from "./terrain";
import {
  createBall,
  defaultAim,
  launchBall,
  predictedLanding,
  sampleFlightPath,
  forwardFlightPath,
  measurePuttPace,
  powerForYards,
  yardsForPower,
  type PacePoint,
  stepBall,
  MAX_HOLE_STROKES,
  SIM_DT,
  type FlightSample,
} from "./physics";
import { prizeMoney, scoreName } from "./scoring";
import { TOURNAMENTS, tournamentById } from "./tour";
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

export type StrikeQuality = "perfect" | "good" | "miss";

export interface ShotCallout {
  /** Increments per callout so the UI can replay its entrance animation. */
  id: number;
  title: string;
  detail: string;
  tone: StrikeQuality | "info";
}

export interface PuttPreview {
  /** Rolling path on the green, bending with the slope, until the ball stops or drops. */
  path: FlightSample[];
  holed: boolean;
}

interface PreviewCache {
  key: string;
  flight: FlightSample[] | null;
  landing: Vec2 | null;
  putt: PuttPreview | null;
}

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
  puttGrid = false;
  shape = 0;
  /** True only after an intentional drag or key nudge. Hover / tap-to-swing must not steal aim. */
  aimExplicit = false;
  tipVisible = true;
  helpOpen = false;
  scorecardOpen = false;
  /**
   * Club bag. Closed at address. Opens when the player asks for it, or flashes
   * after a club change, then tucks away. Linger 0 while it is pinned open.
   */
  clubTray: "closed" | "open" = "closed";
  clubTrayLinger = 0;
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
  /** Smoothed heading for the preview ribbon — live aim stays on the stick. */
  visualAim = 0;
  /** Freeze-frame seconds left right after contact. */
  hitStop = 0;
  /** 0–1 impact punch that drives camera shake; decays after contact. */
  impact = 0;
  /** Short-lived turf puff at the strike or the landing. */
  landBurst: { pos: Vec2; lie: Lie; kind: "strike" | "land"; age: number } | null = null;
  /**
   * Impact the scene has not shown yet. Stays up until the grain system takes it,
   * so a slow frame cannot skip the splash by expiring `landBurst` first.
   */
  contactFx: { pos: Vec2; lie: Lie; kind: "strike" | "land" } | null = null;
  /** Lie the current shot left from. The tracer keeps this after the ball has rolled onto something else. */
  launchLie: Lie = "tee";
  /** QA hold: grains stay on the frame they have already reached. */
  lieStill = false;
  /** Seconds of simulated flight for the current shot. */
  flightTime = 0;
  /** Seconds from launch to first touchdown, and where, from the launch-time simulation. */
  landingTime = 0;
  landingPos: Vec2 | null = null;
  /** Straight-line yards from the strike to the first bounce. */
  shotCarry: number | null = null;
  strike: StrikeQuality | null = null;
  callout: ShotCallout | null = null;
  calloutTime = 0;
  /** Seconds to hold on a stopped full shot before returning to address. */
  settleTime = 0;
  private simAccumulator = 0;
  private paceCache: { key: string; points: PacePoint[] } | null = null;
  private previewCache: PreviewCache = { key: "", flight: null, landing: null, putt: null };

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
    return suggestedShotPower(this.toPin(), this.club(), this.lie);
  }

  /** 0-1 meter fill to draw (putts are leftover-relative; 50% dies at the hole). */
  meterFill(): number {
    if (this.club().id === "putter") {
      if (this.swingPhase === "aim") return PUTT_HOLE_FILL;
      if (this.swingPhase === "power") return this.meter;
      return this.puttFill(this.power);
    }
    if (this.swingPhase === "aim") return this.suggestedPower();
    if (this.swingPhase === "power") return this.meter;
    return this.power;
  }

  /**
   * Putter power for a meter fill. 50% is the pace that dies at the hole on flat ground
   * of this lie. Uphill finishes short of that, downhill runs past, and the preview line
   * is the putt the slope actually produces — the meter does not hide the hill.
   */
  puttPower(fill: number): number {
    const leftover = Math.max(0.2, this.toPin());
    return powerForYards(this.puttPace(), leftover * (0.38 + clamp(fill, 0.05, 1) * 1.24));
  }

  /** Meter fill that a putter power corresponds to (inverse of puttPower). */
  puttFill(power: number): number {
    const leftover = Math.max(0.2, this.toPin());
    return clamp((yardsForPower(this.puttPace(), power) / leftover - 0.38) / 1.24, 0, 1);
  }

  private puttPace(): PacePoint[] {
    const p = this.ball.pos;
    // Pace barely changes with small aim adjustments, so reuse the table within a few degrees.
    const aim = Math.round(this.aim / 0.05) * 0.05;
    const key = `${this.course.id}|${this.holeIndex}|${p.x.toFixed(2)}|${p.y.toFixed(2)}|${aim}|${this.lie}`;
    if (this.paceCache?.key !== key) {
      // Flat copy: slope must change how far a pace rolls, not the pace the meter calls "50%".
      const flat = { ...this.hole(), greenBreak: { x: 0, y: 0 } };
      this.paceCache = { key, points: measurePuttPace(p, aim, flat, this.lie, clubById("putter")) };
    }
    return this.paceCache.points;
  }

  meterYards(): number {
    const fill = this.swingPhase === "power" ? this.meter : this.meterFill();
    return meterYardage(fill, this.club(), this.lie, this.toPin());
  }

  meterPercent(): number {
    return Math.round(this.meterFill() * 100);
  }

  cycleCam(): void {
    const order: CamMode[] = ["auto", "player", "follow", "putt"];
    this.camMode = order[(order.indexOf(this.camMode) + 1) % order.length];
    const label = this.camMode === "player" ? "address" : this.camMode;
    this.flash(this.camMode === "auto" ? "Camera · Auto" : `Camera · ${label}`);
  }

  toggleGrid(): void {
    this.puttGrid = !this.puttGrid;
    this.flash(this.puttGrid ? "Putting grid on" : "Putting grid off");
  }

  canShape(): boolean {
    return this.club().id !== "putter" && (this.swingPhase === "aim" || this.swingPhase === "power");
  }

  nudgeShape(delta: number): void {
    if (!this.canShape()) return;
    this.shape = clamp(this.shape + delta, -1, 1);
    this.flash(this.shape > 0.2 ? "Draw" : this.shape < -0.2 ? "Fade" : "Straight");
  }

  setShape(value: number): void {
    if (this.club().id === "putter") {
      this.shape = 0;
      return;
    }
    if (this.swingPhase !== "aim" && this.swingPhase !== "power") return;
    this.shape = clamp(value, -1, 1);
  }

  private previewTargetPower(): number {
    if (this.club().id === "putter") {
      if (this.swingPhase === "aim") return PUTT_HOLE_FILL;
      if (this.swingPhase === "power") return this.meter;
      return this.puttFill(this.power);
    }
    if (this.swingPhase === "aim") return this.suggestedPower();
    if (this.swingPhase === "power") return this.meter;
    return this.power;
  }

  /** Meter fill the putt line is promising. Live on the power swing so the dots match the stroke. */
  private puttPreviewFill(): number {
    if (this.swingPhase === "aim") return PUTT_HOLE_FILL;
    if (this.swingPhase === "power") return this.meter;
    return this.puttFill(this.power);
  }

  private previewShot() {
    const putting = this.club().id === "putter";
    return {
      // Full-swing ribbons ease. A putt line that lags the stick is a lie about the break.
      aim: putting ? this.aim : this.visualAim,
      power: putting ? this.puttPower(this.puttPreviewFill()) : this.visualPower,
      accuracy: putting ? 0 : this.swingPhase === "accuracy" ? this.meter * 2 - 1 : this.accuracy,
      club: this.club(),
      lie: this.lie,
      wind: this.wind,
      shape: this.shape,
    };
  }

  previewFlight(): FlightSample[] {
    const shot = this.previewShot();
    const cache = this.previewFor(shot);
    cache.flight ??= forwardFlightPath(sampleFlightPath(this.ball.pos, shot, this.hole()), shot.aim);
    return cache.flight;
  }

  previewLanding(): Vec2 {
    const shot = this.previewShot();
    const cache = this.previewFor(shot);
    cache.landing ??= predictedLanding(this.ball.pos, shot, this.hole());
    return cache.landing;
  }

  /** The putt as set up right now. Same aim, pace, and slope the stroke will use. */
  previewPutt(): PuttPreview {
    const shot = this.previewShot();
    const cache = this.previewFor(shot);
    if (!cache.putt) {
      const hole = this.hole();
      const path = sampleFlightPath(this.ball.pos, shot, hole);
      const last = path[path.length - 1];
      cache.putt = { path, holed: dist(last.pos, hole.pin) < 0.05 };
    }
    return cache.putt;
  }

  /** Previews run the full fixed-step sim, so reuse them while the inputs are unchanged. */
  private previewFor(shot: ReturnType<GameSession["previewShot"]>) {
    const p = this.ball.pos;
    const key = `${this.course.id}|${this.holeIndex}|${p.x}|${p.y}|${shot.aim}|${shot.power}|${shot.accuracy}|${shot.club.id}|${shot.lie}|${shot.wind.speed}|${shot.wind.dir}|${shot.shape}`;
    if (key !== this.previewCache.key) this.previewCache = { key, flight: null, landing: null, putt: null };
    return this.previewCache;
  }

  showCallout(title: string, detail: string, tone: ShotCallout["tone"], seconds = 2.2): void {
    this.callout = { id: (this.callout?.id ?? 0) + 1, title, detail, tone };
    this.calloutTime = seconds;
  }

  /** Start a round. With an id, switches to that tournament and its course first. */
  startTournament(tournamentId?: string): void {
    if (tournamentId) {
      this.tournament = tournamentById(tournamentId);
      this.course = courseById(this.tournament.courseId);
    }
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
    this.visualAim = this.aim;
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
    this.visualPower = this.previewTargetPower();
    this.cam.x = (hole.tee.x + hole.pin.x) / 2;
    this.cam.y = (hole.tee.y + hole.pin.y) / 2;
    this.cam.zoom = 2.8;
    this.camHold = false;
    this.shape = 0;
    this.aimExplicit = false;
    this.clubTray = "closed";
    this.clubTrayLinger = 0;
    this.shotArc = [];
    this.landingPos = null;
    this.hitStop = 0;
    this.impact = 0;
    this.landBurst = null;
    this.contactFx = null;
    this.launchLie = this.lie;
    this.lieStill = false;
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
    this.revealClubTray(2.8);
  }

  setClub(index: number): void {
    if (this.swingPhase !== "aim") return;
    const next = clamp(index, 0, CLUBS.length - 1);
    if (next === this.clubIndex) return;
    this.clubIndex = next;
    this.revealClubTray(1.7);
  }

  /** Pin the bag open, or tuck it if it is already up. */
  toggleClubTray(): void {
    if (this.screen !== "play" || this.swingPhase !== "aim") return;
    if (this.clubTray === "open") this.closeClubTray();
    else {
      this.clubTray = "open";
      this.clubTrayLinger = 0;
    }
  }

  closeClubTray(): void {
    this.clubTray = "closed";
    this.clubTrayLinger = 0;
  }

  /** Flash the bag after a club change. A pinned bag stays pinned. */
  private revealClubTray(seconds: number): void {
    if (this.swingPhase !== "aim") return;
    if (this.clubTray === "open" && this.clubTrayLinger === 0) return;
    this.clubTray = "open";
    this.clubTrayLinger = seconds;
  }

  private tickClubTray(dt: number): void {
    if (this.swingPhase !== "aim") {
      if (this.clubTray !== "closed") this.closeClubTray();
      return;
    }
    if (this.clubTray === "open" && this.clubTrayLinger > 0) {
      this.clubTrayLinger -= dt;
      if (this.clubTrayLinger <= 0) this.closeClubTray();
    }
  }

  nudgeAim(delta: number): void {
    if (this.swingPhase !== "aim") return;
    this.aim = wrapAngle(this.aim + delta);
    this.aimExplicit = true;
  }

  aimAt(world: Vec2): void {
    if (this.swingPhase !== "aim") return;
    // Drag well past the ball to aim; a stray hover near it must not swing the line off the hole.
    // Putts and short chips need a much shorter drag than a full shot.
    const minDrag = this.putting() ? 1.5 : Math.min(22, Math.max(4, this.toPin() * 0.45));
    if (dist(world, this.ball.pos) < minDrag) return;
    this.aim = Math.atan2(world.y - this.ball.pos.y, world.x - this.ball.pos.x);
    this.aimExplicit = true;
  }

  tap(): void {
    this.audio.unlock();
    if (this.screen !== "play") return;
    if (this.swingPhase === "aim") {
      this.closeClubTray();
      this.swingPhase = "power";
      this.meter = 0.02;
      this.meterDir = 1;
      this.tipVisible = false;
      return;
    }
    if (this.swingPhase === "power") {
      this.power =
        this.club().id === "putter" ? this.puttPower(this.meter) : clamp(this.meter, 0.08, 1);
      this.swingPhase = "accuracy";
      this.meter = 0.5;
      this.meterDir = 1;
      this.lockedAccuracy = false;
      return;
    }
    if (this.swingPhase === "accuracy") {
      const raw = clamp(this.meter * 2 - 1, -1, 1);
      this.accuracy = Math.abs(raw) < 0.2 ? 0 : Math.sign(raw) * raw * raw;
      this.strike = Math.abs(raw) < 0.2 ? "perfect" : Math.abs(raw) < 0.6 ? "good" : "miss";
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
    if (!this.aimExplicit) {
      this.aim = defaultAim(this.ball.pos, this.hole());
      this.visualAim = this.aim;
    }
    const club = this.club();
    this.lastShotPos = { ...this.ball.pos };
    this.launchLie = this.lie;
    this.strokes += 1;
    if (club.id === "putter" && this.lie === "green") this.putts += 1;
    const shot = {
      aim: this.aim,
      power: this.power,
      accuracy: this.accuracy,
      club,
      lie: this.lie,
      wind: this.wind,
      shape: this.shape,
    };
    // Launch first so a preview or audio failure cannot swallow the stroke.
    this.ball = launchBall(this.ball.pos, shot);
    this.swingPhase = "flight";
    try {
      this.shotArc = sampleFlightPath(this.lastShotPos, shot, this.hole());
    } catch {
      this.shotArc = [{ pos: { ...this.ball.pos }, z: this.ball.z }];
    }
    this.flightTime = 0;
    this.simAccumulator = 0;
    this.shotCarry = null;
    const last = this.shotArc[this.shotArc.length - 1];
    this.landingTime = (this.shotArc.length - 1) * SIM_DT;
    this.landingPos = last ? { ...last.pos } : null;
    const quality = this.strike ?? "good";
    this.landBurst = { pos: { ...this.lastShotPos }, lie: this.lie, kind: "strike", age: 0 };
    this.contactFx = { pos: { ...this.lastShotPos }, lie: this.lie, kind: "strike" };
    if (club.id !== "putter") {
      // Long enough to read contact on the address lens, short enough that the cut still feels immediate.
      this.hitStop = 0.1 + this.power * 0.08;
      this.impact = (0.35 + 0.65 * this.power) * (quality === "perfect" ? 1 : quality === "good" ? 0.75 : 0.55);
      const told = strikeCallout(this.lie, club.id, quality, club.name, Math.round(this.power * 100));
      if (told) this.showCallout(told.title, told.detail, told.tone, 1.6);
      else if (quality === "miss") this.showCallout(this.accuracy > 0 ? "Pulled it" : "Pushed it", "Stop the marker in the green window", "miss", 1.6);
    }
    try {
      this.audio.swing(club.id, this.power, quality, this.lie);
    } catch {
      /* audio must never block the shot */
    }
  }

  update(dt: number): void {
    this.audio.setAmbience(this.screen === "play" ? this.wind.speed : 0, this.screen === "play" && this.putting());
    this.bannerTime = Math.max(0, this.bannerTime - dt);
    this.messageTime = Math.max(0, this.messageTime - dt);
    this.calloutTime = Math.max(0, this.calloutTime - dt);
    this.impact = Math.max(0, this.impact - dt * 2.4);
    if (this.landBurst) {
      this.landBurst.age += dt;
      const life = burstLife(this.landBurst.lie, this.landBurst.kind, this.club().id);
      if (this.landBurst.age > life) this.landBurst = null;
    }
    if (this.screen !== "play") return;
    this.tickClubTray(dt);
    this.refreshLie();
    const powerLife = this.swingPhase === "power" ? 0.08 : 0.11;
    this.visualPower = expApproach(this.visualPower, this.previewTargetPower(), powerLife, dt);
    this.visualAim = angleApproach(this.visualAim, this.aim, 0.07, dt);

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
    } else if (this.swingPhase === "settle") {
      this.settleTime -= dt;
      if (this.settleTime <= 0) this.finishShot(true);
    } else if (this.swingPhase === "flight") {
      if (this.hitStop > 0) {
        this.hitStop = Math.max(0, this.hitStop - dt);
        return;
      }
      // Fixed steps keep the live ball on exactly the path the preview promised.
      this.simAccumulator += dt * this.timeScale();
      while (this.simAccumulator >= SIM_DT - 1e-9 && this.swingPhase === "flight" && this.screen === "play") {
        this.simAccumulator -= SIM_DT;
        this.flightTime += SIM_DT;
        this.simulate(SIM_DT);
      }
    }
  }

  /**
   * Playback rate for the fixed flight steps. Full swings are simulated at a real
   * hang (~6s) so carry stays honest, then played back faster so a drive settles
   * in a few seconds. Putts and the last few yards into the cup stay real-time or slower.
   */
  timeScale(): number {
    if (this.club().id === "putter") return 1;
    const speed = Math.hypot(this.ball.vel.x, this.ball.vel.y);
    if (this.ball.z <= 0.3 && this.toPin() < 5 && speed > 0.8) return 0.45;
    if (this.swingPhase === "flight" && this.landingTime > 3.2) return Math.min(2.15, this.landingTime / 2.8);
    return 1;
  }

  private simulate(dt: number): void {
    const hole = this.hole();
    const step = stepBall(this.ball, hole, this.wind, dt, this.club().bounce);
    this.ball = step.ball;
    this.refreshLie();

    for (const ev of step.events) {
      if (ev.type === "bounce" && this.shotCarry === null) {
        this.shotCarry = dist(this.lastShotPos, ev.pos);
        const lie = lieAt(hole, ev.pos);
        this.audio.land(lie);
        this.landBurst = { pos: { ...ev.pos }, lie, kind: "land", age: 0 };
        this.contactFx = { pos: { ...ev.pos }, lie, kind: "land" };
      }
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
      if (this.club().id === "putter" || this.shotCarry === null) {
        this.finishShot(true);
        return;
      }
      // Hold on the landing camera for a beat so the result and yardage can land.
      const total = dist(this.lastShotPos, this.ball.pos);
      const roll = Math.max(0, total - this.shotCarry);
      this.showCallout(`${Math.round(total)} yds`, `Carry ${Math.round(this.shotCarry)} · Roll ${Math.round(roll)} · ${Math.round(this.toPin())} to pin`, "info", 2.8);
      this.swingPhase = "settle";
      this.settleTime = 1.3;
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
    this.visualAim = this.aim;
    this.aimExplicit = false;
    this.autoClub();
    if (this.club().id === "putter" || onGreen(hole, this.ball.pos)) {
      this.power = this.puttPower(PUTT_HOLE_FILL);
      this.shape = 0;
    }
    this.visualPower = this.previewTargetPower();
  }

  refreshLie(): void {
    if (this.ball.z > 0.55) return;
    this.lie = lieAt(this.hole(), this.ball.pos);
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
    // A scorecard opened from the hole summary must not follow the player onto the next tee.
    this.scorecardOpen = false;
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
