# Pro Tour Golf

A single-player, browser-based tour golf game. Play a nine-hole stroke-play round at **Harbor Dunes Club** with aim, a three-click swing meter, clubs, wind, and a scorecard — no account and no server required.

The course is rendered in **WebGL** (Three.js): 3D turf with instanced grass blades, an over-the-ball address camera, a ball-follow flight camera, and an over-the-ball putting view. There is no player mesh — presentation is ball, course, and cameras, in the spirit of a launch-monitor sim. Art and names are original (Crown Circuit, Harbor Dunes Invitational). It is not affiliated with any real tour or licensed golf game. A machine with a GPU (or a browser WebGL fallback) is enough — no extra run steps beyond `npm run dev`.

## Play locally

Needs Node.js 20+.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

Production build:

```bash
npm run build
npm run preview
```

Unit tests:

```bash
npm test
```

## How to play

1. Open the **tour tent**, check your player card, and tee it up at the Harbor Dunes Invitational.
2. **Aim** with the mouse or finger. Arrow keys or A / D nudge the line.
3. **Swing** with click or Space, three times:
   - start the power meter
   - stop it for power (the gold band near the top is the sweet spot)
   - stop the accuracy marker in the green window
4. Change **clubs** with Q / E, the mouse wheel, or the tray. The game suggests a club from the lie and yardage; the putter is selected on the green.
5. Walk off the green to the next tee. After nine holes you get a signed card, to-par total, and a purse slice saved on this browser.

### Controls

| Action | Input |
| --- | --- |
| Aim | Mouse / touch, ← →, A D |
| Swing | Click / tap / Space |
| Cancel swing | Esc |
| Clubs | Q E, [ ], wheel, tray |
| Shape (draw / fade) | Z fade, X draw, or **Fade / Straight / Draw** |
| Camera | V or **View** — auto, address (over the ball), follow, putt |
| Putting grid | G or **Grid** |
| Scorecard | C or **Card** |
| Help | H or **Help** |
| Mute | M or **Sound** |

On the **green**, the camera sits over the ball looking at the pin. The dotted line is the putt you are about to hit: it bends with the slope and turns gold when that pace will drop. The white tick on the meter is flat hole-pace — uphill finishes short of it, downhill runs past, and the line shows which. A soft meter dies short; a firm one runs long. **G** shows the fall of the green. Tee and fairway shots use an over-the-ball address camera, then follow the ball in flight. Slight misses stay in the rough instead of going out of bounds.

Sound is on by default and stays in the browser (no download): a whoosh and a different contact for driver, iron, wedge, and putter, plus a quiet wind that softens on the green. **M** or **Sound** mutes it.

### Shot shape

Before a full swing, pick **Fade** (starts left, works right), **Straight**, or **Draw** (starts right, works left). Use the **Shot shape** rail, or tap **Z** / **X**. The aim ribbon and in-air tube show the bend. Shape is disabled with the putter. A centered accuracy marker keeps the club's carry; missing the window costs ball speed. Wind still moves the ball in the air. Fairway landings release, rough and sand hold.

The first tee shows a short tutorial tip.

## Scoring

Stroke play versus par. Harbor Dunes is a par-36 nine (two par 3s, five par 4s, two par 5s).

- **Water**: the stroke counts, plus a one-stroke penalty, then a drop behind the hazard.
- **Out of bounds**: stroke and distance — penalty stroke and replay from the previous lie.
- **Pick-up**: a hole is closed at 8 strokes if you have not holed out.
- Running total is shown as `E`, `-3`, `+2`, and so on.
- Career money, events, and best round stay in `localStorage` on this machine.

Lies change the shot: fairway and tee are full strength. Rough smothers a landing ball and costs about 20% distance plus accuracy on the next shot; bunkers stop the ball dead and only wedges come out near full distance. Greens take break, and wind moves the ball in the air. Any club can be played from any lie.

## Real course layouts (OpenStreetMap)

Courses can be imported from [OpenStreetMap](https://www.openstreetmap.org/) golf mapping (`golf=hole`, `green`, `fairway`, `bunker`, `water_hazard`, `pin`, trees):

```bash
npm run import:course -- --osm way/16650363 --id fog-belt-links --name "Fog Belt Links" \
  --club "Fog Belt" --location "Bay Headlands" --holes 1-9
```

This queries the Overpass API and writes `src/courses/<id>.json` in yards. Register it in `src/course.ts` with `buildImportedCourse` and add a tournament in `src/tour.ts`. Holes use the mapped greens, bunkers and fairways; where a hole has no fairway polygon, a corridor along the hole line stands in. Green slopes are placeholders until elevation data is added.

- **Credit is required.** OSM data is © OpenStreetMap contributors under the [ODbL](https://opendatacommons.org/licenses/odbl/). Keep the `source` block in the JSON, the tournament `credit`, and the line in `public/assets/ATTRIBUTION.md`.
- **Use original course names.** Real course names and branding are trademarks; the layouts ship under invented names.
- **Pick well-mapped courses.** Every hole needs a `golf=hole` line and a green; the importer stops with an error rather than guess.

`Fog Belt Links` is the front nine of a public San Francisco course, imported this way.

## Project layout

```
src/
  main.ts            boot + input
  game.ts            round / swing state
  physics.ts         flight, bounce, hazards, hole-out
  course.ts          Harbor Dunes hole data, imported-course builder, lies
  osm-course.ts      OpenStreetMap → course data converter
  courses/*.json     imported course layouts (ODbL)
  clubs.ts           bag
  renderer.ts        2D fallback orchestration + HUD
  canvas-hud.ts      power / accuracy meters + minimap
  canvas-course.ts   2D hole painting
  canvas-overlays.ts 2D aim, ball, trail
  canvas-draw.ts     shared 2D path helpers
  renderer-lift.ts   2.5D airborne ball offset
  scene3d.ts         WebGL CourseScene + createCourseScene
  scene-ball.ts      dimpled ball + roll
  scene-course.ts    terrain, bunkers, water, pin, grid
  scene-camera.ts    address / follow / putt cams
  scene-lights.ts    sun, lights, software GL
  scene-sky.ts       procedural sky box
  scene-water.ts     water material
  terrain.ts         height, turf color, camera helpers
  ui.ts              tour tent, HUD, scorecard
  scoring.ts         names and totals
```

Hole geometry is data-driven. Add another course by appending a `Course` in `src/course.ts` and a tournament in `src/tour.ts`.
