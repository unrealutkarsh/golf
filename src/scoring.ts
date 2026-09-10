import type { HoleResult } from "./types";

export function scoreName(strokes: number, par: number): string {
  const d = strokes - par;
  if (strokes === 1 && par > 1) return "Ace";
  if (d <= -3) return "Albatross";
  if (d === -2) return "Eagle";
  if (d === -1) return "Birdie";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  if (d === 2) return "Double Bogey";
  if (d === 3) return "Triple Bogey";
  return `${d > 0 ? "+" : ""}${d}`;
}

export function formatToPar(toPar: number): string {
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

export function totalStrokes(results: HoleResult[]): number {
  return results.reduce((s, r) => s + r.strokes, 0);
}

export function totalPar(results: HoleResult[]): number {
  return results.reduce((s, r) => s + r.par, 0);
}

export function toPar(results: HoleResult[]): number {
  return totalStrokes(results) - totalPar(results);
}

export function prizeMoney(toParScore: number, purse: number): number {
  const rankFactor = clampMoney(1 - (toParScore + 8) / 24);
  return Math.round((purse * (0.08 + rankFactor * 0.14)) / 100) * 100;
}

function clampMoney(v: number): number {
  return Math.max(0, Math.min(1, v));
}
