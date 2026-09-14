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

export function liePowerMul(lie: string): number {
  if (lie === "rough") return 0.88;
  if (lie === "bunker") return 0.7;
  if (lie === "water") return 0.4;
  return 1;
}

/** Typical total distance at a committed swing, including a bit of roll. */
export function clubReach(club: Club, lie: string): number {
  if (club.id === "putter") return club.roll;
  return (club.carry + club.roll * 0.45) * liePowerMul(lie);
}

/** Swing-meter fill that should finish near `distanceYards` with this club. */
export function suggestedShotPower(distanceYards: number, club: Club, lie: string): number {
  if (club.id === "putter") return 0.5;
  const reach = clubReach(club, lie);
  return Math.max(0.36, Math.min(1, distanceYards / Math.max(reach, 1)));
}

/** Estimated finish yards for a meter fill (putt: roll; else carry+roll). */
export function meterYardage(fill: number, club: Club, lie: string, leftoverYards: number): number {
  if (club.id === "putter") {
    const factor = 0.38 + Math.max(0.05, Math.min(1, fill)) * 1.24;
    return Math.max(0.2, leftoverYards) * factor;
  }
  return clubReach(club, lie) * Math.max(0, Math.min(1.05, fill));
}

export function recommendClub(distanceYards: number, lie: string): Club {
  if (lie === "green") return clubById("putter");
  if (lie === "bunker") return clubById("sw");
  const target = Math.max(0, distanceYards / liePowerMul(lie));
  if (target < 28) return clubById("putter");
  const woods = CLUBS.filter((club) => club.id !== "putter");
  const reachOf = (club: Club) => club.carry + club.roll * 0.45;
  const reachers = woods.filter((club) => reachOf(club) >= target - 2);
  if (reachers.length) {
    return reachers.reduce((best, club) => (reachOf(club) < reachOf(best) ? club : best));
  }
  return woods.reduce((best, club) => (reachOf(club) > reachOf(best) ? club : best));
}

export function clubIndex(id: ClubId): number {
  return CLUBS.findIndex((c) => c.id === id);
}
