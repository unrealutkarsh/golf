import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

export const TEX = {
  barkDiff: "assets/textures/bark_diff.jpg",
  barkNor: "assets/textures/bark_nor.jpg",
  leafDiff: "assets/textures/canopy_diff.jpg",
  leafNor: "assets/textures/canopy_nor.jpg",
  leafAlpha: "assets/textures/canopy_alpha.jpg",
};

export const HDRI = "assets/hdr/sky.hdr";

export const TREE_GLBS = [
  "assets/models/trees/q_CommonTree_1.glb",
  "assets/models/trees/q_CommonTree_2.glb",
  "assets/models/trees/q_CommonTree_3.glb",
  "assets/models/trees/q_CommonTree_5.glb",
  "assets/models/trees/q_BirchTree_1.glb",
  "assets/models/trees/q_PineTree_1.glb",
  "assets/models/trees/q_PineTree_2.glb",
  "assets/models/trees/q_PineTree_3.glb",
] as const;

export const TREE_ASSET_COUNT = TREE_GLBS.length;

export interface ArtKit {
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
  const [barkMap, barkN, leafMap, leafN, leafA] = await Promise.all([
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
          mat.envMapIntensity = 0.48;
          mat.roughness = 0.74;
          mat.metalness = 0;
        }
      });
      trees.push(root);
    } catch (err) {
      console.warn("[ptg] tree skip", url, err);
    }
  }

  const kit: ArtKit = {
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
