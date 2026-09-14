import * as THREE from "three";

export function createWaterMaterial(time: { value: number }, software: boolean): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x0a4a58,
    roughness: software ? 0.22 : 0.08,
    metalness: 0.0,
    transmission: software ? 0 : 0.48,
    thickness: 2.8,
    transparent: true,
    opacity: software ? 0.84 : 0.78,
    ior: 1.333,
    envMapIntensity: 1.45,
    clearcoat: 0.42,
    clearcoatRoughness: 0.18,
    attenuationColor: new THREE.Color(0x063038),
    attenuationDistance: 4.5,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = `varying vec3 vWorldPos;\nuniform float uTime;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       float wt = uTime * 0.24;
       transformed.y += sin(position.x * 0.42 + wt * 1.5) * 0.03 + cos(position.z * 0.34 - wt) * 0.024;
       vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
    shader.fragmentShader = `varying vec3 vWorldPos;
uniform float uTime;
${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       vec2 w = vWorldPos.xz;
       float t = uTime * 0.22;
       float r1 = sin(w.x * 0.48 + t * 1.6) * cos(w.y * 0.38 - t);
       float r2 = sin(w.x * 1.05 - w.y * 0.72 + t * 2.0);
       float r3 = sin(length(w) * 0.16 - t * 0.65);
       float ripple = r1 * 0.42 + r2 * 0.34 + r3 * 0.24;
       vec3 deep = vec3(0.02, 0.16, 0.20);
       vec3 mid = vec3(0.05, 0.28, 0.30);
       vec3 shoal = vec3(0.10, 0.38, 0.34);
       vec3 foam = vec3(0.70, 0.84, 0.80);
       vec3 viewW = normalize(cameraPosition - vWorldPos);
       float fres = pow(1.0 - clamp(abs(viewW.y), 0.0, 1.0), 2.6);
       float depthHint = smoothstep(-0.4, 0.8, ripple);
       diffuseColor.rgb = mix(deep, mid, 0.35 + ripple * 0.2);
       diffuseColor.rgb = mix(diffuseColor.rgb, shoal, depthHint * 0.28);
       diffuseColor.rgb = mix(diffuseColor.rgb, foam, smoothstep(0.78, 0.96, ripple) * 0.1);
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.78, 0.82), fres * 0.28);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
       float rw = sin(vWorldPos.x * 0.62 + uTime * 0.35) * 0.5 + 0.5;
       roughnessFactor = clamp(0.12 + rw * 0.2, 0.08, 0.38);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
       float t = uTime * 0.3;
       vec2 w = vWorldPos.xz;
       float nx = cos(w.x * 0.78 + t * 1.5) * 0.22 + cos(w.y * 1.05 - t) * 0.12;
       float nz = sin(w.y * 0.64 - t * 1.2) * 0.2 + sin(w.x * 0.9 + t * 0.75) * 0.1;
       normal = normalize(normal + vec3(nx, 0.0, nz));`,
    );
  };
  mat.customProgramCacheKey = () => "ptg-water-v4";
  return mat;
}
