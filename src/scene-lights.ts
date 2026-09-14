import * as THREE from "three";
import { renderPixelRatio } from "./art";
import { SCENE_TONE } from "./look";

export function isSoftwareGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    return /swiftshader|llvmpipe|software|microsoft basic render/i.test(name);
  } catch {
    return false;
  }
}

export function configureWebGLRenderer(renderer: THREE.WebGLRenderer, software: boolean): void {
  renderer.setPixelRatio(renderPixelRatio(window.devicePixelRatio));
  renderer.setClearColor(SCENE_TONE.clearColor, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Neutral keeps the stylized palette's hues; ACES pulled the greens toward gray-olive.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = software ? SCENE_TONE.exposureSoftware : SCENE_TONE.exposureHardware;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function addOutdoorLights(scene: THREE.Scene, software: boolean): THREE.DirectionalLight {
  scene.add(
    new THREE.AmbientLight(
      software ? SCENE_TONE.ambientSoftware : SCENE_TONE.ambientHardware,
      software ? SCENE_TONE.ambientSoftwareInt : SCENE_TONE.ambientHardwareInt,
    ),
  );
  const hemi = new THREE.HemisphereLight(
    software ? SCENE_TONE.hemiSkySoftware : SCENE_TONE.hemiSkyHardware,
    software ? SCENE_TONE.hemiGroundSoftware : SCENE_TONE.hemiGroundHardware,
    software ? SCENE_TONE.hemiSoftware : SCENE_TONE.hemiHardware,
  );
  scene.add(hemi);
  if (software) {
    const fill = new THREE.DirectionalLight(SCENE_TONE.fillSoftware, SCENE_TONE.fillSoftwareInt);
    fill.position.set(-90, 48, 70);
    scene.add(fill);
  }
  const sun = new THREE.DirectionalLight(SCENE_TONE.sunColor, software ? SCENE_TONE.sunSoftware : SCENE_TONE.sunHardware);
  sun.castShadow = true;
  const map = software ? 1024 : 4096;
  sun.shadow.mapSize.set(map, map);
  sun.shadow.bias = -0.00018;
  sun.shadow.normalBias = 0.12;
  sun.shadow.radius = software ? 4 : 12;
  sun.shadow.camera.near = 6;
  sun.shadow.camera.far = 560;
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  scene.add(sun);
  scene.add(sun.target);
  return sun;
}

export function aimSunAt(sun: THREE.DirectionalLight, cx: number, cz: number): void {
  sun.position.set(cx + 160, 128, cz - 180);
  sun.target.position.set(cx, 0, cz);
  sun.target.updateMatrixWorld();
}
