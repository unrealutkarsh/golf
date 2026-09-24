import * as THREE from "three";
import { type CourseAtmosphere, SCENE_TONE } from "./look";

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uHaze;
  uniform float uGlow;
  uniform float uWash;
  uniform float uCloud;
  varying vec3 vDir;
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p) {
    return noise(p) * 0.52 + noise(p * 2.13 + 4.1) * 0.28 + noise(p * 4.7 + 9.2) * 0.14 + noise(p * 9.1) * 0.06;
  }
  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;
    vec3 zenith = uZenith;
    vec3 mid = uMid;
    vec3 horizon = uHorizon;
    vec3 ground = uGround;
    vec3 col = mix(ground, horizon, smoothstep(-0.18, 0.04, h));
    col = mix(col, mid, smoothstep(0.02, 0.38, h));
    col = mix(col, zenith, smoothstep(0.28, 0.94, h));
    float haze = pow(1.0 - clamp(h * 1.12 + 0.02, 0.0, 1.0), 1.65);
    col = mix(col, uHaze, haze * 0.22);
    vec3 sunD = normalize(vec3(0.48, 0.72, 0.18));
    float glow = pow(max(dot(dir, sunD), 0.0), 18.0);
    float wash = pow(max(dot(dir, sunD), 0.0), 3.4);
    col += vec3(1.0, 0.94, 0.78) * glow * uGlow;
    col += vec3(1.0, 0.93, 0.80) * wash * uWash;
    vec2 cuv = dir.xz / max(abs(h) + 0.32, 0.18);
    float cloud = fbm(cuv * 0.48 + vec2(0.22, 0.08));
    float wisps = fbm(cuv * 1.35 + 5.2);
    float mask = smoothstep(0.10, 0.36, h) * smoothstep(0.88, 0.28, h);
    float banks = smoothstep(0.56, 0.82, cloud + wisps * 0.18) * mask;
    float lit = 0.82 + 0.18 * max(dot(dir, sunD), 0.0);
    col = mix(col, vec3(0.90, 0.91, 0.92) * lit, banks * uCloud);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function applySkyAtmosphere(sky: THREE.Mesh, atmo: CourseAtmosphere): void {
  const mat = sky.material as THREE.ShaderMaterial;
  const set = (name: string, rgb: readonly [number, number, number]) => {
    (mat.uniforms[name].value as THREE.Vector3).set(rgb[0], rgb[1], rgb[2]);
  };
  set("uZenith", atmo.skyZenith);
  set("uMid", atmo.skyMid);
  set("uHorizon", atmo.skyHorizon);
  set("uGround", atmo.skyGround);
  set("uHaze", atmo.skyHaze);
  mat.uniforms.uGlow.value = atmo.sunGlow;
  mat.uniforms.uWash.value = atmo.sunWash;
  mat.uniforms.uCloud.value = atmo.cloudMix;
}

export function makeSky(): THREE.Mesh {
  const tone = SCENE_TONE;
  return new THREE.Mesh(
    new THREE.BoxGeometry(4200, 4200, 4200),
    new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Vector3(...tone.skyZenith) },
        uMid: { value: new THREE.Vector3(...tone.skyMid) },
        uHorizon: { value: new THREE.Vector3(...tone.skyHorizon) },
        uGround: { value: new THREE.Vector3(...tone.skyGround) },
        uHaze: { value: new THREE.Vector3(...tone.skyHaze) },
        uGlow: { value: tone.sunGlow },
        uWash: { value: tone.sunWash },
        uCloud: { value: tone.cloudMix },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
}
