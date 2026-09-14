import * as THREE from "three";
import type { GameSession } from "./game";
import { dist, fromAngle, type Vec2 } from "./math";
import { addressLookDistance, cameraHeightAboveGround, groundHeight, landingCamSpot, playCamFraming, shotCamStage, type ResolvedCam, type ShotCamStage } from "./terrain";
import type { Hole } from "./types";

export interface CameraRig {
  lastView: ResolvedCam | "";
  viewAge: number;
  time: number;
  camPos: THREE.Vector3;
  camLook: THREE.Vector3;
  camera: THREE.PerspectiveCamera;
  shotStage: ShotCamStage | "";
  landingSpot: { key: string; pos: Vec2 } | null;
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
  const leftover = dist(ball, pin);
  const frame = playCamFraming(view, leftover);
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
  } else if (view === "follow" && session.camMode === "auto" && (session.swingPhase === "flight" || session.swingPhase === "settle")) {
    const shot = shotCamera(rig, session, hole, desired, look);
    fov = shot.fov;
    if (shot.stage !== rig.shotStage) {
      rig.shotStage = shot.stage;
      // The landing view is a hard cut, like a broadcast switching cameras.
      if (shot.stage === "landing") rig.viewAge = 0;
    }
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
    const lookDist = addressLookDistance(leftover, frame.lookAhead);
    const ahead = fromAngle(aim, lookDist);
    look.set(ball.x + ahead.x, groundHeight(hole, ball.x + ahead.x, ball.y + ahead.y) + 0.42, ball.y + ahead.y);
  }
  if (session.screen === "play") {
    const camGround = groundHeight(hole, desired.x, desired.z);
    desired.y = cameraHeightAboveGround(camGround, desired.y, view === "putt" ? 1.45 : 1.85);
  }
  if (session.swingPhase !== "flight" && session.swingPhase !== "settle") rig.shotStage = "";
  const catchup =
    rig.shotStage === "launch"
      ? 0.9
      : rig.shotStage === "chase"
        ? 0.62
        : rig.viewAge < 0.28
          ? 0.55
          : view === "follow"
            ? 0.36
            : view === "putt"
              ? 0.18
              : 0.14;
  const k = 1 - Math.exp(-catchup * 18 * Math.max(dt, 0.001));
  if (rig.camPos.distanceTo(desired) > 90 || rig.viewAge < 0.02) {
    rig.camPos.copy(desired);
    rig.camLook.copy(look);
  } else {
    rig.camPos.lerp(desired, Math.min(1, k));
    rig.camLook.lerp(look, Math.min(1, k * 0.9));
  }
  rig.camera.position.copy(rig.camPos);
  if (session.impact > 0) {
    // Contact shake: strong for a frame or two, gone in under half a second.
    const punch = session.impact * session.impact * 0.22;
    rig.camera.position.x += Math.sin(rig.time * 91) * punch;
    rig.camera.position.y += Math.sin(rig.time * 113 + 1.3) * punch;
    rig.camera.position.z += Math.cos(rig.time * 97) * punch;
  }
  rig.camera.lookAt(rig.camLook);
  rig.camera.fov += (fov - rig.camera.fov) * (rig.viewAge < 0.02 ? 1 : 0.16);
  rig.camera.updateProjectionMatrix();
}

/** Launch → chase → landing cut for a full shot in auto camera. Writes the camera goal into `desired` / `look`. */
function shotCamera(rig: CameraRig, session: GameSession, hole: Hole, desired: THREE.Vector3, look: THREE.Vector3): { stage: ShotCamStage; fov: number } {
  const ball = session.ball.pos;
  const bh = groundHeight(hole, ball.x, ball.y) + session.ball.z;
  const stage = shotCamStage(session.flightTime, session.landingTime, session.shotCarry !== null);
  if (stage === "launch") {
    const origin = session.lastShotPos;
    const back = fromAngle(session.aim + Math.PI, 5.2);
    desired.set(origin.x + back.x, groundHeight(hole, origin.x, origin.y) + 2.3, origin.y + back.y);
    // Tilt up with the ball but keep the fairway and horizon in frame.
    const ahead = fromAngle(session.aim, 60);
    look.set(ball.x * 0.55 + (origin.x + ahead.x) * 0.45, bh * 0.55 + 3, ball.y * 0.55 + (origin.y + ahead.y) * 0.45);
    return { stage, fov: 50 };
  }
  if (stage === "chase" || !session.landingPos) {
    const v = session.ball.vel;
    const heading = Math.hypot(v.x, v.y) > 0.4 ? Math.atan2(v.y, v.x) : session.aim;
    const back = fromAngle(heading + Math.PI, 11);
    const ahead = fromAngle(heading, 5);
    const camGround = groundHeight(hole, ball.x + back.x, ball.y + back.y);
    desired.set(ball.x + back.x, Math.max(camGround + 3.5, bh + 2.2), ball.y + back.y);
    look.set(ball.x + ahead.x, bh - 0.6, ball.y + ahead.y);
    return { stage: "chase", fov: 52 };
  }
  const land = session.landingPos;
  const key = `${session.holeIndex}:${land.x.toFixed(1)}:${land.y.toFixed(1)}`;
  if (rig.landingSpot?.key !== key) {
    const heading = Math.atan2(land.y - session.lastShotPos.y, land.x - session.lastShotPos.x);
    rig.landingSpot = { key, pos: landingCamSpot(hole, land, heading, session.club().roll * session.power) };
  }
  const spot = rig.landingSpot.pos;
  desired.set(spot.x, groundHeight(hole, spot.x, spot.y) + 5.5, spot.y);
  // Before touchdown, aim between the falling ball and its landing spot so both stay in frame; after, track the ball.
  const landH = groundHeight(hole, land.x, land.y);
  if (session.shotCarry === null) look.set((land.x + ball.x) * 0.5, (landH + bh) * 0.5, (land.y + ball.y) * 0.5);
  else look.set(ball.x, bh + 0.3, ball.y);
  return { stage, fov: 48 };
}
