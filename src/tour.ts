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
];

export function tournamentById(id: string): Tournament {
  const t = TOURNAMENTS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown tournament ${id}`);
  return t;
}
