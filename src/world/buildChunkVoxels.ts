import { getVoxel } from "./getVoxel";
import {
  CHUNK_HEIGHT,
  CHUNK_HEIGHT_PADDED,
  CHUNK_SIZE,
  CHUNK_SIZE_PADDED,
} from "./chunkConstants";

const PADDED_SLICE_AREA = CHUNK_SIZE_PADDED * CHUNK_SIZE_PADDED;

// Data layout: x is fastest, then z, then y.
export function indexOf(px: number, py: number, pz: number): number {
  return py * PADDED_SLICE_AREA + pz * CHUNK_SIZE_PADDED + px;
}

export function buildChunkVoxels(seedStr: string, cx: number, cz: number): Uint8Array {
  return buildChunkVoxelsWithOverrides(seedStr, cx, cz);
}

export function buildChunkVoxelsWithOverrides(
  seedStr: string,
  cx: number,
  cz: number,
  isDestroyed?: (x: number, y: number, z: number) => boolean,
): Uint8Array {
  const voxels = new Uint8Array(CHUNK_SIZE_PADDED * CHUNK_HEIGHT_PADDED * CHUNK_SIZE_PADDED);
  const worldX0 = cx * CHUNK_SIZE;
  const worldZ0 = cz * CHUNK_SIZE;

  for (let py = 0; py < CHUNK_HEIGHT_PADDED; py += 1) {
    const worldY = py - 1;

    for (let pz = 0; pz < CHUNK_SIZE_PADDED; pz += 1) {
      const worldZ = worldZ0 + (pz - 1);

      for (let px = 0; px < CHUNK_SIZE_PADDED; px += 1) {
        const worldX = worldX0 + (px - 1);
        voxels[indexOf(px, py, pz)] = isDestroyed?.(worldX, worldY, worldZ)
          ? 0
          : getVoxel(seedStr, worldX, worldY, worldZ);
      }
    }
  }

  return voxels;
}

export { CHUNK_HEIGHT, CHUNK_HEIGHT_PADDED, CHUNK_SIZE, CHUNK_SIZE_PADDED };
