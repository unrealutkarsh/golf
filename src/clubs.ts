import type { Club, ClubId } from "./types";

export const CLUBS: Club[] = [
  { id: "driver", name: "Driver", shortName: "Dr", carry: 255, roll: 22, loft: 11, accuracy: 0.72, bounce: 0.28 },
  { id: "wood3", name: "3-Wood", shortName: "3W", carry: 230, roll: 18, loft: 15, accuracy: 0.78, bounce: 0.3 },
  { id: "wood5", name: "5-Wood", shortName: "5W", carry: 210, roll: 14, loft: 18, accuracy: 0.82, bounce: 0.32 },
  { id: "iron4", name: "4-Iron", shortName: "4i", carry: 195, roll: 12, loft: 22, accuracy: 0.84, bounce: 0.34 },
  { id: "iron5", name: "5-Iron", shortName: "5i", carry: 180, roll: 10, loft: 26, accuracy: 0.86, bounce: 0.35 },
  { id: "iron6", name: "6-Iron", shortName: "6i", carry: 168, roll: 8, loft: 30, accuracy: 0.88, bounce: 0.36 },
  { id: "iron7", name: "7-Iron", shortName: "7i", carry: 155, roll: 7, loft: 34, accuracy: 0.9, bounce: 0.37 },
  { id: "iron8", name: "8-Iron", shortName: "8i", carry: 140, roll: 5, loft: 38, accuracy: 0.92, bounce: 0.38 },
  { id: "iron9", name: "9-Iron", shortName: "9i", carry: 128, roll: 4, loft: 42, accuracy: 0.93, bounce: 0.4 },
  { id: "pw", name: "Pitching Wedge", shortName: "PW", carry: 112, roll: 3, loft: 46, accuracy: 0.94, bounce: 0.42 },
  { id: "sw", name: "Sand Wedge", shortName: "SW", carry: 86, roll: 2, loft: 56, accuracy: 0.95, bounce: 0.45 },
  { id: "putter", name: "Putter", shortName: "Pt", carry: 0, roll: 42, loft: 3, accuracy: 0.98, bounce: 0.08 },
];

export function clubById(id: ClubId): Club {
  const club = CLUBS.find((c) => c.id === id);
  if (!club) throw new Error(`Unknown club ${id}`);
  return club;
}

export function recommendClub(distanceYards: number, lie: string): Club {
  if (lie === "green") return clubById("putter");
  if (lie === "bunker") return clubById("sw");
  const lieMul = lie === "rough" ? 0.88 : 1;
  const target = Math.max(0, distanceYards / lieMul - 4);
  let best = CLUBS[0];
  let bestErr = Infinity;
  for (const club of CLUBS) {
    if (club.id === "putter") continue;
    const reach = club.carry + club.roll * 0.55;
    const err = Math.abs(reach - target);
    if (err < bestErr) {
      bestErr = err;
      best = club;
    }
  }
  if (target < 28) return clubById("putter");
  return best;
}

export function clubIndex(id: ClubId): number {
  return CLUBS.findIndex((c) => c.id === id);
}
