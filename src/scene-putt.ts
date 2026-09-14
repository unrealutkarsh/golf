import * as THREE from "three";
import type { PuttPreview } from "./game";
import type { FlightSample } from "./physics";
import { groundHeight } from "./terrain";
import type { Hole } from "./types";

/** Yards between dots along the putt line. */
export const PUTT_DOT_SPACING = 0.32;
export const PUTT_DOT_MAX = 120;
const LINE_COLOR = new THREE.Color(0xffffff);
const HOLED_COLOR = new THREE.Color(0xffd54a);

export interface PuttLine {
  dots: THREE.InstancedMesh;
  stop: THREE.Mesh;
  /** Last preview drawn; previews are cached, so an unchanged object means nothing to rewrite. */
  drawn: PuttPreview | null;
}

export function createPuttLine(): PuttLine {
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
  const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 12).rotateX(-Math.PI / 2), dotMat, PUTT_DOT_MAX);
  dots.count = 0;
  dots.frustumCulled = false;
  dots.renderOrder = 2;
  dots.visible = false;
  const stop = new THREE.Mesh(
    new THREE.RingGeometry(0.14, 0.2, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
  );
  stop.renderOrder = 2;
  stop.visible = false;
  return { dots, stop, drawn: null };
}

/** Evenly spaced points along a sampled path (by distance, not by sim step, so slow rolls do not bunch up). */
export function spacedPoints(path: readonly FlightSample[], spacing: number, max: number): { x: number; y: number }[] {
  if (path.length === 0) return [];
  const out = [{ x: path[0].pos.x, y: path[0].pos.y }];
  let carry = 0;
  for (let i = 1; i < path.length && out.length < max; i++) {
    const a = path[i - 1].pos;
    const b = path[i].pos;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    let along = spacing - carry;
    while (along <= seg && out.length < max) {
      const t = along / seg;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      along += spacing;
    }
    carry = seg - (along - spacing);
  }
  return out;
}

const dummy = new THREE.Object3D();

export function writePuttLine(line: PuttLine, hole: Hole, preview: PuttPreview): void {
  line.dots.visible = line.dots.count > 0;
  line.stop.visible = line.drawn ? !line.drawn.holed : false;
  if (preview === line.drawn) return;
  line.drawn = preview;
  // Skip the first dot so the line starts just in front of the ball, not under it.
  const pts = spacedPoints(preview.path, PUTT_DOT_SPACING, PUTT_DOT_MAX + 1).slice(1);
  pts.forEach((p, i) => {
    dummy.position.set(p.x, groundHeight(hole, p.x, p.y) + 0.04, p.y);
    // Dots shrink toward the finish so the eye follows the curve to where it ends.
    dummy.scale.setScalar(1 - (i / Math.max(pts.length, 1)) * 0.35);
    dummy.updateMatrix();
    line.dots.setMatrixAt(i, dummy.matrix);
  });
  line.dots.count = pts.length;
  line.dots.instanceMatrix.needsUpdate = true;
  (line.dots.material as THREE.MeshBasicMaterial).color.copy(preview.holed ? HOLED_COLOR : LINE_COLOR);
  line.dots.visible = pts.length > 0;
  const last = preview.path[preview.path.length - 1];
  line.stop.visible = !preview.holed && Boolean(last);
  if (last) line.stop.position.set(last.pos.x, groundHeight(hole, last.pos.x, last.pos.y) + 0.045, last.pos.y);
}
