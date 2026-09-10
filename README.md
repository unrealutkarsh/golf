# Pro Tour Golf

A single-player, browser-based tour golf game. Play a nine-hole stroke-play round at **Harbor Dunes Club** with aim, a three-click swing meter, clubs, wind, and a scorecard — no account and no server required.

The course is rendered in **WebGL** (Three.js): 3D turf with instanced grass blades, player/follow cameras, and a golfer’s-eye putting view on the green. The presentation is original (Crown Circuit, Harbor Dunes Invitational). It is not affiliated with any real tour. A machine with a GPU (or a browser WebGL fallback) is enough — no extra run steps beyond `npm run dev`.

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
| Camera | V or **View** — auto, player, follow, putt |
| Putting grid | G or **Grid** |
| Scorecard | C or **Card** |
| Help | H or **Help** |
| Mute | M or **Sound** |

On the **green**, the camera locks to a third-person over-the-shoulder view behind the ball, looking at the pin. Tee and fairway shots use the normal player/follow cameras. Slight misses stay in the rough instead of going out of bounds.

### Shot shape

Before a full swing, pick **Fade** (left-to-right), **Straight**, or **Draw** (right-to-left for a right-handed player). Use the **Shot shape** rail, or tap **Z** / **X**. The aim ribbon and in-air tube bend with the spin. Shape is disabled with the putter / on the green. Wind and the accuracy meter still move the ball; shape is extra curve while it is airborne.

The first tee shows a short tutorial tip.

## Scoring

Stroke play versus par. Harbor Dunes is a par-36 nine (two par 3s, five par 4s, two par 5s).

- **Water**: the stroke counts, plus a one-stroke penalty, then a drop behind the hazard.
- **Out of bounds**: stroke and distance — penalty stroke and replay from the previous lie.
- **Pick-up**: a hole is closed at 8 strokes if you have not holed out.
- Running total is shown as `E`, `-3`, `+2`, and so on.
- Career money, events, and best round stay in `localStorage` on this machine.

Lies change the shot: fairway and tee are full strength, rough and bunkers sap distance, greens take break, and wind moves the ball in the air.

## Project layout

```
src/
  main.ts          boot + input
  game.ts          round / swing state
  physics.ts       flight, bounce, hazards, hole-out
  course.ts        Harbor Dunes hole data
  clubs.ts         bag
  renderer.ts      HUD meters + 2D fallback
  scene3d.ts       WebGL course, grass, cameras
  terrain.ts       height, turf color, camera helpers
  ui.ts            tour tent, HUD, scorecard
  scoring.ts       names and totals
```

Hole geometry is data-driven. Add another course by appending a `Course` in `src/course.ts` and a tournament in `src/tour.ts`.
