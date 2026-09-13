import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

export const TEX = {
  greenDiff: "assets/textures/green_diff.jpg",
  greenNor: "assets/textures/green_nor.jpg",
  greenRough: "assets/textures/green_rough.jpg",
  fairwayDiff: "assets/textures/fairway_diff.jpg",
  fairwayNor: "assets/textures/fairway_nor.jpg",
  fairwayRough: "assets/textures/fairway_rough.jpg",
  roughDiff: "assets/textures/rough_diff.jpg",
  roughNor: "assets/textures/rough_nor.jpg",
  roughRough: "assets/textures/rough_rough.jpg",
  sandDiff: "assets/textures/sand_diff.jpg",
  sandNor: "assets/textures/sand_nor.jpg",
  sandRough: "assets/textures/sand_rough.jpg",
  barkDiff: "assets/textures/bark_diff.jpg",
  barkNor: "assets/textures/bark_nor.jpg",
  leafDiff: "assets/textures/canopy_diff.jpg",
  leafNor: "assets/textures/canopy_nor.jpg",
  leafAlpha: "assets/textures/canopy_alpha.jpg",
};

export const HDRI = "assets/hdr/sky.hdr";

export const TREE_GLBS = [
  "assets/models/trees/tree_oak.glb",
  "assets/models/trees/tree_oak_dark.glb",
  "assets/models/trees/tree_detailed.glb",
  "assets/models/trees/tree_detailed_dark.glb",
  "assets/models/trees/tree_pineDefaultA.glb",
  "assets/models/trees/tree_pineTallA.glb",
  "assets/models/trees/tree_pineRoundA.glb",
] as const;

export const TREE_ASSET_COUNT = TREE_GLBS.length;

export interface PbrSet {
  map: THREE.Texture;
  normal: THREE.Texture;
  rough: THREE.Texture;
}

export interface ArtKit {
  green: PbrSet;
  fairway: PbrSet;
  rough: PbrSet;
  sand: PbrSet;
  bark: { map: THREE.Texture; normal: THREE.Texture };
  leaf: { map: THREE.Texture; normal: THREE.Texture; alpha: THREE.Texture };
  env?: THREE.Texture;
  background?: THREE.Texture;
  trees: THREE.Group[];
}

function repeat(tex: THREE.Texture, s: number, anisotropy: number): THREE.Texture {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(s, s);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function colorTex(loader: THREE.TextureLoader, url: string, anisotropy: number): Promise<THREE.Texture> {
  return loader.loadAsync(url).then((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    return repeat(t, 1, anisotropy);
  });
}

function dataTex(loader: THREE.TextureLoader, url: string, anisotropy: number): Promise<THREE.Texture> {
  return loader.loadAsync(url).then((t) => repeat(t, 1, anisotropy));
}

export async function loadArtKit(renderer: THREE.WebGLRenderer, lite: boolean): Promise<ArtKit> {
  const anisotropy = Math.min(lite ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
  const loader = new THREE.TextureLoader();
  const [green, fairway, rough, sand, barkMap, barkN, leafMap, leafN, leafA] = await Promise.all([
    Promise.all([colorTex(loader, TEX.greenDiff, anisotropy), dataTex(loader, TEX.greenNor, anisotropy), dataTex(loader, TEX.greenRough, anisotropy)]),
    Promise.all([colorTex(loader, TEX.fairwayDiff, anisotropy), dataTex(loader, TEX.fairwayNor, anisotropy), dataTex(loader, TEX.fairwayRough, anisotropy)]),
    Promise.all([colorTex(loader, TEX.roughDiff, anisotropy), dataTex(loader, TEX.roughNor, anisotropy), dataTex(loader, TEX.roughRough, anisotropy)]),
    Promise.all([colorTex(loader, TEX.sandDiff, anisotropy), dataTex(loader, TEX.sandNor, anisotropy), dataTex(loader, TEX.sandRough, anisotropy)]),
    colorTex(loader, TEX.barkDiff, anisotropy),
    dataTex(loader, TEX.barkNor, anisotropy),
    colorTex(loader, TEX.leafDiff, anisotropy),
    dataTex(loader, TEX.leafNor, anisotropy),
    dataTex(loader, TEX.leafAlpha, anisotropy),
  ]);

  const gltf = new GLTFLoader();
  const trees: THREE.Group[] = [];
  const treeList = lite ? TREE_GLBS.slice(0, 4) : TREE_GLBS;
  for (const url of treeList) {
    try {
      const asset = await gltf.loadAsync(url);
      const root = asset.scene;
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = !lite;
        mesh.receiveShadow = true;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && mat.isMeshStandardMaterial) {
          mat.envMapIntensity = 0.55;
          mat.roughness = 0.72;
        }
      });
      trees.push(root);
    } catch (err) {
      console.warn("[ptg] tree skip", url, err);
    }
  }

  const kit: ArtKit = {
    green: { map: green[0], normal: green[1], rough: green[2] },
    fairway: { map: fairway[0], normal: fairway[1], rough: fairway[2] },
    rough: { map: rough[0], normal: rough[1], rough: rough[2] },
    sand: { map: sand[0], normal: sand[1], rough: sand[2] },
    bark: { map: barkMap, normal: barkN },
    leaf: { map: leafMap, normal: leafN, alpha: leafA },
    trees,
  };

  if (!lite) {
    try {
      const hdr = await new RGBELoader().loadAsync(HDRI);
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      kit.env = pmrem.fromEquirectangular(hdr).texture;
      kit.background = hdr;
      pmrem.dispose();
    } catch (err) {
      console.warn("[ptg] HDRI skip", err);
    }
  }
  return kit;
}

export function dressStandard(
  mat: THREE.MeshStandardMaterial,
  maps: PbrSet,
  opts?: { color?: number; roughness?: number; normalScale?: number; env?: number },
): void {
  mat.map = maps.map;
  mat.normalMap = maps.normal;
  mat.roughnessMap = maps.rough;
  mat.color.set(opts?.color ?? 0xffffff);
  mat.roughness = opts?.roughness ?? 0.78;
  mat.metalness = 0;
  mat.normalScale.set(opts?.normalScale ?? 1.15, opts?.normalScale ?? 1.15);
  mat.envMapIntensity = opts?.env ?? 0.42;
  mat.needsUpdate = true;
}
