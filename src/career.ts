import type { PlayerProfile } from "./types";

const KEY = "ptg-career-v1";

const DEFAULT_PROFILE: PlayerProfile = {
  name: "Alex Moreau",
  hometown: "Cape Meridian",
  eventsPlayed: 0,
  careerMoney: 0,
  bestToPar: null,
  lastToPar: null,
};

const memory = new Map<string, string>();

function readStore(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
  } catch {
    /* ignore */
  }
  return memory.get(key) ?? null;
}

function writeStore(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    /* ignore */
  }
  memory.set(key, value);
}

export function loadProfile(): PlayerProfile {
  try {
    const raw = readStore(KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw) as PlayerProfile;
    return { ...DEFAULT_PROFILE, ...parsed };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile: PlayerProfile): void {
  writeStore(KEY, JSON.stringify(profile));
}

export function recordRound(profile: PlayerProfile, toPar: number, money: number): PlayerProfile {
  const next: PlayerProfile = {
    ...profile,
    eventsPlayed: profile.eventsPlayed + 1,
    careerMoney: profile.careerMoney + money,
    lastToPar: toPar,
    bestToPar: profile.bestToPar === null ? toPar : Math.min(profile.bestToPar, toPar),
  };
  saveProfile(next);
  return next;
}

export function rankingFromProfile(profile: PlayerProfile): number {
  if (profile.eventsPlayed === 0) return 128;
  const best = profile.bestToPar ?? 8;
  const money = profile.careerMoney;
  const rank = 48 + best * 6 - Math.min(40, Math.floor(money / 25000));
  return clampRank(Math.round(rank));
}

function clampRank(n: number): number {
  return Math.max(1, Math.min(200, n));
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
