/**
 * Import a golf course layout from OpenStreetMap into src/courses/<id>.json.
 *
 *   npm run import:course -- --osm way/16650363 --id fog-belt-links --name "Fog Belt Links" \
 *     --club "Fog Belt" --location "Bay Headlands" --holes 1-9
 *
 * Data is © OpenStreetMap contributors (ODbL). Keep the `source` block in the output and the credit in
 * public/assets/ATTRIBUTION.md. Use an original course name: real course names and branding are trademarks.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { convertOsmCourse, type OsmElement } from "../src/osm-course";

const OVERPASS = "https://overpass-api.de/api/interpreter";
// Overpass asks clients to identify themselves; point at the project, not a person.
const USER_AGENT = "pro-tour-golf-course-importer/0.1 (+https://github.com/unrealutkarsh/golf)";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (value === undefined) throw new Error(`Missing --${name}`);
  return value;
}

function parseHoles(spec: string | undefined): number[] | undefined {
  if (!spec) return undefined;
  return spec.split(",").flatMap((part) => {
    const [a, b] = part.split("-").map((n) => Number.parseInt(n, 10));
    return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, k) => a + k);
  });
}

async function main(): Promise<void> {
  const [kind, idText] = arg("osm").split("/");
  if ((kind !== "way" && kind !== "relation") || !/^\d+$/.test(idText ?? "")) throw new Error("--osm must look like way/123 or relation/123");
  const query = `[out:json][timeout:120];
${kind}(${idText})->.course;
.course out tags geom;
.course map_to_area->.a;
(
  way["golf"](area.a);
  node["golf"="pin"](area.a);
  node["natural"="tree"](area.a);
  way["natural"~"^(wood|water)$"](area.a);
  way["landuse"="forest"](area.a);
  way["water"](area.a);
);
out tags geom;`;
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) throw new Error(`Overpass returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { elements: OsmElement[] };
  const holes = parseHoles(process.argv.includes("--holes") ? arg("holes") : undefined);
  const data = convertOsmCourse(json.elements, {
    id: arg("id"),
    name: arg("name"),
    club: arg("club"),
    location: arg("location"),
    holes,
    fetched: new Date().toISOString().slice(0, 10),
  });
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const out = resolve(root, "src/courses", `${data.id}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(data)}\n`);
  console.log(`Wrote ${out}`);
  for (const h of data.holes) {
    console.log(
      `  ${String(h.number).padStart(2)}  par ${h.par}  ${String(Math.round(h.centerline.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - h.centerline[i].x, p.y - h.centerline[i].y), 0))).padStart(3)} yd` +
        `  fairways ${h.fairways.length}  bunkers ${h.bunkers.length}  water ${h.water.length}  trees ${h.trees.length}`,
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
