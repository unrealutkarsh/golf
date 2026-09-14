import * as THREE from "three";
import type { GameSession } from "./game";
import { dist, fromAngle } from "./math";
import { camFraming, groundHeight, type ResolvedCam } from "./terrain";
import type { Hole } from "./types";

export interface CameraRig {
  lastView: ResolvedCam | "";
  viewAge: number;
  time: number;
  camPos: THREE.Vector3;
  camLook: THREE.Vector3;
  camera: THREE.PerspectiveCamera;
}

export function updateSceneCamera(
  rig: CameraRig,
  session: GameSession,
  hole: Hole,
  view: ResolvedCam,
  putting: boolean,
  dt: number,
): void {
  if (rig.lastView !== view) {
    rig.lastView = view;
    rig.viewAge = 0;
  }
  rig.viewAge += dt;
  const ball = session.ball.pos;
  const pin = hole.pin;
  const aim = putting ? Math.atan2(pin.y - ball.y, pin.x - ball.x) : session.aim;
  const bh = groundHeight(hole, ball.x, ball.y) + session.ball.z;
  const desired = new THREE.Vector3();
  const look = new THREE.Vector3();
  const frame = camFraming(view);
  let fov = frame.fov;
  if (session.screen !== "play") {
    const t = rig.time * 0.1;
    desired.set((hole.tee.x + pin.x) * 0.5 + Math.cos(t) * 70, 30, (hole.tee.y + pin.y) * 0.5 + Math.sin(t) * 48);
    look.set((hole.tee.x + pin.x) * 0.55, 1.2, (hole.tee.y + pin.y) * 0.55);
    fov = 48;
  } else if (view === "putt") {
    const back = fromAngle(aim + Math.PI, frame.back);
    const side = fromAngle(aim + Math.PI / 2, frame.side);
    desired.set(ball.x + back.x + side.x, bh + frame.height, ball.y + back.y + side.y);
    look.set(
      ball.x * (1 - frame.lookAhead) + pin.x * frame.lookAhead,
      groundHeight(hole, pin.x, pin.y) + 0.18,
      ball.y * (1 - frame.lookAhead) + pin.y * frame.lookAhead,
    );
  } else if (view === "follow") {
    const v = session.ball.vel;
    const heading = Math.hypot(v.x, v.y) > 0.4 ? Math.atan2(v.y, v.x) : session.aim;
    const back = fromAngle(heading + Math.PI, frame.back);
    const curve = session.ball.curve || session.shape * 24;
    const side = fromAngle(heading + Math.PI / 2, -Math.max(-1, Math.min(1, curve / 24)) * 7.5);
    desired.set(ball.x + back.x + side.x, bh + frame.height + session.ball.z * 0.16, ball.y + back.y + side.y);
    look.set(ball.x, bh + 0.7, ball.y);
  } else {
    const back = fromAngle(aim + Math.PI, frame.back);
    const side = fromAngle(aim + Math.PI / 2, frame.side);
    desired.set(ball.x + back.x + side.x, bh + frame.height, ball.y + back.y + side.y);
    const lookDist = Math.max(12, Math.min(38, dist(ball, pin) * frame.lookAhead + 10));
    const ahead = fromAngle(aim, lookDist);
    look.set(ball.x + ahead.x, groundHeight(hole, ball.x + ahead.x, ball.y + ahead.y) + 0.42, ball.y + ahead.y);
  }
  const catchup = rig.viewAge < 0.28 ? 0.55 : view === "follow" ? 0.36 : view === "putt" ? 0.18 : 0.14;
  const k = 1 - Math.exp(-catchup * 18 * Math.max(dt, 0.001));
  if (rig.camPos.distanceTo(desired) > 90 || rig.viewAge < 0.02) {
    rig.camPos.copy(desired);
    rig.camLook.copy(look);
  } else {
    rig.camPos.lerp(desired, Math.min(1, k));
    rig.camLook.lerp(look, Math.min(1, k * 0.9));
  }
  rig.camera.position.copy(rig.camPos);
  rig.camera.lookAt(rig.camLook);
  rig.camera.fov += (fov - rig.camera.fov) * 0.16;
  rig.camera.updateProjectionMatrix();
}
