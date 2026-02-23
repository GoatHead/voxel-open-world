export type DestroyedVoxelIndex = Map<number, Map<number, Set<number>>>;

export function createDestroyedVoxelIndex(): DestroyedVoxelIndex {
  return new Map<number, Map<number, Set<number>>>();
}

export function addDestroyedVoxel(index: DestroyedVoxelIndex, x: number, y: number, z: number): void {
  let byY = index.get(x);
  if (!byY) {
    byY = new Map<number, Set<number>>();
    index.set(x, byY);
  }

  let byZ = byY.get(y);
  if (!byZ) {
    byZ = new Set<number>();
    byY.set(y, byZ);
  }

  byZ.add(z);
}

export function hasDestroyedVoxel(index: DestroyedVoxelIndex, x: number, y: number, z: number): boolean {
  return index.get(x)?.get(y)?.has(z) ?? false;
}

export function clearDestroyedVoxelIndex(index: DestroyedVoxelIndex): void {
  index.clear();
}
