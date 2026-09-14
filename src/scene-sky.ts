import * as THREE from "three";

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
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
    vec3 zenith = vec3(0.10, 0.38, 0.86);
    vec3 mid = vec3(0.36, 0.64, 0.96);
    vec3 horizon = vec3(0.70, 0.84, 0.96);
    vec3 ground = vec3(0.16, 0.28, 0.22);
    vec3 col = mix(ground, horizon, smoothstep(-0.18, 0.04, h));
    col = mix(col, mid, smoothstep(0.02, 0.38, h));
    col = mix(col, zenith, smoothstep(0.28, 0.94, h));
    float haze = pow(1.0 - clamp(h * 1.12 + 0.02, 0.0, 1.0), 1.65);
    col = mix(col, vec3(0.74, 0.86, 0.96), haze * 0.22);
    vec3 sunD = normalize(vec3(0.48, 0.72, 0.18));
    float glow = pow(max(dot(dir, sunD), 0.0), 18.0);
    float wash = pow(max(dot(dir, sunD), 0.0), 3.4);
    col += vec3(1.0, 0.94, 0.78) * glow * 0.55;
    col += vec3(1.0, 0.93, 0.80) * wash * 0.12;
    vec2 cuv = dir.xz / max(abs(h) + 0.32, 0.18);
    float cloud = fbm(cuv * 0.48 + vec2(0.22, 0.08));
    float wisps = fbm(cuv * 1.35 + 5.2);
    float mask = smoothstep(0.10, 0.36, h) * smoothstep(0.88, 0.28, h);
    float banks = smoothstep(0.56, 0.82, cloud + wisps * 0.18) * mask;
    float lit = 0.82 + 0.18 * max(dot(dir, sunD), 0.0);
    col = mix(col, vec3(0.96, 0.97, 0.98) * lit, banks * 0.42);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function makeSky(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(4200, 4200, 4200),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
}
