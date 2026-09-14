import * as THREE from "three";

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x6aa0d4, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = software ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = software ? 1.22 : 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function addOutdoorLights(scene: THREE.Scene, software: boolean): THREE.DirectionalLight {
  scene.add(new THREE.AmbientLight(software ? 0xc8d4c8 : 0xa8bdd0, software ? 0.7 : 0.12));
  const hemi = new THREE.HemisphereLight(software ? 0xd8e8d4 : 0xd6ebff, software ? 0x3a6a28 : 0x243018, software ? 1.05 : 0.38);
  scene.add(hemi);
  if (software) {
    const fill = new THREE.DirectionalLight(0xc4d8b8, 0.28);
    fill.position.set(-90, 48, 70);
    scene.add(fill);
  }
  const sun = new THREE.DirectionalLight(0xffefc8, software ? 1.45 : 2.15);
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
