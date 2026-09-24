import { mulberry32 } from "./math";
import type { ClubId, Lie } from "./types";

/** How a lie should read at contact. One story for the puff, the tracer, and the monitor line. */
export type LieRead = "splash" | "smother" | "clean" | "quiet";

export function lieRead(lie: Lie): LieRead {
  if (lie === "bunker") return "splash";
  if (lie === "rough") return "smother";
  if (lie === "green") return "quiet";
  return "clean";
}

export function isSandWedge(clubId?: ClubId): boolean {
  return clubId === "sw" || clubId === "pw";
}

export interface GrainBurst {
  read: LieRead;
  /** Small grains thrown off the face or the landing. */
  count: number;
  /** Extra soft clumps that make a splash or a grass cloud read as a body, not specks. */
  puffs: number;
  /** Fraction of grains that stay low and run across the surface. */
  skirt: number;
  /** Upward speed, yards/sec. */
  rise: number;
  /** Horizontal speed, yards/sec. */
  spread: number;
  life: number;
  gravity: number;
  /** Grain diameter, yards. */
  size: number;
  /** Soft center disc. */
  cloud: number;
  cloudOpacity: number;
  cloudLife: number;
  cloudColor: number;
  colors: readonly number[];
  shape: "grain" | "fleck" | "spark";
}

const SAND = [0xfff3d8, 0xf0d7a4, 0xe4c48a, 0xd7b27a] as const;
const GRASS = [0x3c5228, 0x5a7a38, 0x2a3c1c, 0x6e8c48] as const;
const CLEAN = [0xfffdf8, 0xf4f7ee, 0xe7f0dc] as const;
const QUIET = [0xf7fbf4, 0xe4f0da] as const;

/**
 * Contact and landing look. Sand throws a real splash; rough stays low and grassy;
 * fairway is a small clean strike; the green barely kisses.
 * A wedge still splashes out of a bunker, but a long club digs and throws more sand.
 */
export function grainBurst(lie: Lie, kind: "strike" | "land", clubId?: ClubId): GrainBurst {
  const read = lieRead(lie);
  if (read === "splash") {
    const dig = kind === "strike" && !isSandWedge(clubId);
    if (kind === "land" || dig) {
      return {
        read,
        count: kind === "land" ? 58 : 50,
        puffs: kind === "land" ? 6 : 5,
        skirt: 0.48,
        rise: kind === "land" ? 6.4 : 5.2,
        spread: kind === "land" ? 4.4 : 3.6,
        life: kind === "land" ? 1.05 : 0.92,
        gravity: 8.5,
        size: 0.42,
        cloud: kind === "land" ? 4.6 : 3.6,
        cloudOpacity: 0.74,
        cloudLife: kind === "land" ? 1.05 : 0.88,
        cloudColor: 0xf0dcb4,
        colors: SAND,
        shape: "grain",
      };
    }
    return {
      read,
      count: 36,
      puffs: 4,
      skirt: 0.4,
      rise: 6.6,
      spread: 2.8,
      life: 0.82,
      gravity: 8.2,
      size: 0.34,
      cloud: 2.9,
      cloudOpacity: 0.66,
      cloudLife: 0.78,
      cloudColor: 0xf6e6c4,
      colors: SAND,
      shape: "grain",
    };
  }
  if (read === "smother") {
    return {
      read,
      count: kind === "land" ? 30 : 24,
      puffs: kind === "land" ? 3 : 2,
      skirt: 0.28,
      rise: kind === "land" ? 2.4 : 2.05,
      spread: 2.15,
      life: kind === "land" ? 0.78 : 0.8,
      gravity: 5.4,
      size: 0.28,
      cloud: kind === "land" ? 2.05 : 1.7,
      cloudOpacity: 0.5,
      cloudLife: kind === "land" ? 0.78 : 0.74,
      cloudColor: 0x4a6230,
      colors: GRASS,
      shape: "fleck",
    };
  }
  if (read === "quiet") {
    return {
      read,
      count: 4,
      puffs: 0,
      skirt: 0,
      rise: 0.42,
      spread: 0.22,
      life: 0.2,
      gravity: 7,
      size: 0.08,
      cloud: 0.26,
      cloudOpacity: 0.16,
      cloudLife: 0.18,
      cloudColor: 0xe7f2dc,
      colors: QUIET,
      shape: "spark",
    };
  }
  return {
    read: "clean",
    count: kind === "land" ? 12 : 8,
    puffs: 1,
    skirt: 0.12,
    rise: kind === "land" ? 1.55 : 1.15,
    spread: kind === "land" ? 0.85 : 0.55,
    life: kind === "land" ? 0.42 : 0.3,
    gravity: 11,
    size: kind === "land" ? 0.14 : 0.16,
    cloud: kind === "land" ? 1.05 : 0.72,
    cloudOpacity: kind === "land" ? 0.38 : 0.42,
    cloudLife: kind === "land" ? 0.46 : 0.3,
    cloudColor: 0xfffaf2,
    colors: CLEAN,
    shape: "spark",
  };
}

export function burstLife(lie: Lie, kind: "strike" | "land", clubId?: ClubId): number {
  return grainBurst(lie, kind, clubId).cloudLife;
}

export interface TrailLook {
  color: number;
  glow: number;
  ribbon: number;
  opacity: number;
  glowOpacity: number;
  ribbonOpacity: number;
  /** Width relative to the fairway tracer. */
  width: number;
  /** How much of the live tracer to keep, measured back from the ball. */
  keep: number;
  /** Airborne ball glow, 1 = fairway. */
  glowScale: number;
}

/** In-air tracer. Rough and a dug bunker shot stay short and dull; fairway stays a clean rope. */
export function trailLook(lie: Lie, clubId?: ClubId): TrailLook {
  const read = lieRead(lie);
  if (read === "splash") {
    const dig = !isSandWedge(clubId);
    return {
      color: 0xf0e0bc,
      glow: 0xd9c49a,
      ribbon: 0xe6d2aa,
      opacity: dig ? 0.34 : 0.5,
      glowOpacity: dig ? 0.2 : 0.32,
      ribbonOpacity: dig ? 0.14 : 0.2,
      width: dig ? 1.35 : 1.15,
      keep: dig ? 0.38 : 0.62,
      glowScale: dig ? 0.45 : 0.62,
    };
  }
  if (read === "smother") {
    return {
      color: 0x7d9458,
      glow: 0x4e6634,
      ribbon: 0x6a8446,
      opacity: 0.36,
      glowOpacity: 0.2,
      ribbonOpacity: 0.14,
      width: 1.4,
      keep: 0.44,
      glowScale: 0.42,
    };
  }
  if (read === "quiet") {
    return {
      color: 0xf4f7f0,
      glow: 0xd5e4c8,
      ribbon: 0xe7f0dc,
      opacity: 0.16,
      glowOpacity: 0.08,
      ribbonOpacity: 0.08,
      width: 0.7,
      keep: 0.28,
      glowScale: 0.25,
    };
  }
  return {
    color: 0xffffff,
    glow: 0xffd078,
    ribbon: 0xfff2d4,
    opacity: 1,
    glowOpacity: 0.78,
    ribbonOpacity: 0.28,
    width: 1,
    keep: 1,
    glowScale: 1,
  };
}

/**
 * One quiet line under the lie name. Empty on a clean lie so the monitor stays a yardage.
 * Sand copy changes with the club, because a wedge and a long iron are different shots.
 */
export function lieCarryNote(lie: Lie, clubId: ClubId): string {
  if (lie === "bunker") {
    if (isSandWedge(clubId)) return "Wedge · sand still costs carry";
    return "Long club · about half carry";
  }
  if (lie === "rough") return "Smothered launch · shorter carry";
  return "";
}

export interface StrikeCallout {
  title: string;
  detail: string;
  tone: "perfect" | "info" | "miss";
}

/** Perfect contact from sand or rough is not a pure strike. Mishits keep the timing hint. */
export function strikeCallout(
  lie: Lie,
  clubId: ClubId,
  quality: "perfect" | "good" | "miss",
  clubName: string,
  powerPct: number,
): StrikeCallout | null {
  if (quality === "miss") return null;
  if (quality !== "perfect") return null;
  if (lie === "bunker") return { title: "Sand splash", detail: lieCarryNote(lie, clubId), tone: "info" };
  if (lie === "rough") return { title: "Smothered", detail: lieCarryNote(lie, clubId), tone: "info" };
  return { title: "Pure strike", detail: `${clubName} · ${powerPct}%`, tone: "perfect" };
}

export interface GrainSeed {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  color: number;
  gravity: number;
  shape: GrainBurst["shape"];
}

export function seedGrains(spec: GrainBurst, aim: number, origin: { x: number; y: number; z: number }, salt = 1): GrainSeed[] {
  const rng = mulberry32((Math.imul(salt, 997) ^ Math.imul(spec.count + 3, 131) ^ Math.floor((aim + 4) * 1000)) >>> 0);
  const alongX = Math.cos(aim);
  const alongZ = Math.sin(aim);
  const sideX = -alongZ;
  const sideZ = alongX;
  const out: GrainSeed[] = [];
  const skirtN = Math.round(spec.count * spec.skirt);
  for (let i = 0; i < spec.count; i++) {
    const skirt = i < skirtN;
    const forward = (skirt ? 0.15 : 0.25) + rng() * spec.spread * (skirt ? 1.15 : 0.85);
    const side = (rng() - 0.5) * spec.spread * (skirt ? 1.6 : 1.05);
    const up = skirt ? 0.25 + rng() * 0.85 : spec.rise * (0.55 + rng() * 0.55);
    out.push({
      x: origin.x + (rng() - 0.5) * 0.2,
      y: origin.y + rng() * 0.08,
      z: origin.z + (rng() - 0.5) * 0.2,
      vx: alongX * forward + sideX * side,
      vy: up,
      vz: alongZ * forward + sideZ * side,
      life: spec.life * (skirt ? 0.75 : 0.85 + rng() * 0.25),
      size: spec.size * (skirt ? 0.7 + rng() * 0.5 : 0.65 + rng() * 0.7),
      color: spec.colors[Math.floor(rng() * spec.colors.length)] ?? spec.cloudColor,
      gravity: spec.gravity,
      shape: spec.shape,
    });
  }
  for (let i = 0; i < spec.puffs; i++) {
    const ang = (i / Math.max(spec.puffs, 1)) * Math.PI * 2 + rng();
    out.push({
      x: origin.x + Math.cos(ang) * spec.spread * 0.12,
      y: origin.y + 0.05,
      z: origin.z + Math.sin(ang) * spec.spread * 0.12,
      vx: Math.cos(ang) * spec.spread * 0.18,
      vy: spec.rise * (0.22 + rng() * 0.15),
      vz: Math.sin(ang) * spec.spread * 0.18,
      life: spec.life * 0.85,
      size: spec.size * (3.1 + rng() * 1.4),
      color: spec.cloudColor,
      gravity: spec.gravity * 0.55,
      shape: spec.shape === "fleck" ? "fleck" : "grain",
    });
  }
  return out;
}

/** Ballistic pose. Opacity hits 0 when the grain's life is over. */
export function grainPose(g: GrainSeed, age: number): { x: number; y: number; z: number; opacity: number } {
  if (!(age >= 0) || age >= g.life) return { x: g.x, y: g.y, z: g.z, opacity: 0 };
  const t = age;
  return {
    x: g.x + g.vx * t,
    y: g.y + g.vy * t - 0.5 * g.gravity * t * t,
    z: g.z + g.vz * t,
    opacity: 1 - t / g.life,
  };
}
