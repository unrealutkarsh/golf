import type { Tournament } from "./types";

export const PLAYER_CARD = {
  tour: "Crown Circuit",
  season: "2026",
};

export const TOURNAMENTS: Tournament[] = [
  {
    id: "harbor-invitational",
    name: "Harbor Dunes Invitational",
    purse: 1_800_000,
    courseId: "harbor-dunes",
    blurb: "Nine signature holes along the dunes and inlet. Stroke play, one round.",
  },
  {
    id: "fog-belt-open",
    name: "Fog Belt Open",
    purse: 1_400_000,
    courseId: "fog-belt-links",
    blurb: "A real routing: nine tree-lined holes traced from a public course on the San Francisco headlands. Stroke play, one round.",
    credit: "Course layout © OpenStreetMap contributors (ODbL)",
  },
];

export function tournamentById(id: string): Tournament {
  const t = TOURNAMENTS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown tournament ${id}`);
  return t;
}
