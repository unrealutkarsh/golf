import * as THREE from "three";

/** Geometries and materials reachable from `roots`, plus any extras — resources shared across hole rebuilds. */
export function collectShared(roots: readonly THREE.Object3D[], extras: readonly object[] = []): Set<object> {
  const keep = new Set<object>(extras);
  for (const root of roots) {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) keep.add(mesh.geometry);
      for (const mat of materialsOf(mesh)) keep.add(mat);
    });
  }
  return keep;
}

/**
 * Empty `group` and free the GPU buffers of everything that belonged only to it.
 * `Object3D.clear()` alone leaves geometries and materials allocated in the renderer,
 * so every hole rebuild leaked the whole course until the tab ran out of memory.
 */
export function disposeChildren(group: THREE.Object3D, keep: ReadonlySet<object> = new Set()): { geometries: number; materials: number } {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const instanced: THREE.InstancedMesh[] = [];
  for (const child of group.children) {
    child.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry && !keep.has(mesh.geometry)) geometries.add(mesh.geometry);
      for (const mat of materialsOf(mesh)) if (!keep.has(mat)) materials.add(mat);
      if ((obj as THREE.InstancedMesh).isInstancedMesh) instanced.push(obj as THREE.InstancedMesh);
    });
  }
  group.clear();
  for (const mesh of instanced) mesh.dispose();
  for (const geo of geometries) geo.dispose();
  for (const mat of materials) mat.dispose();
  return { geometries: geometries.size, materials: materials.size };
}

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
  if (!mat) return [];
  return Array.isArray(mat) ? mat : [mat];
}
