import { greedyMesh, type GreedyMeshPayload } from "../mesh/greedyMesh";
import { chunkKey } from "../lib/chunkMath";
import { CHUNK_HEIGHT_PADDED, CHUNK_SIZE_PADDED } from "../world/chunkConstants";
import { buildChunkVoxelsWithOverrides } from "../world/buildChunkVoxels";

export type MeshChunkPayload = GreedyMeshPayload & {
  key: string;
  cx: number;
  cz: number;
};

export function meshChunk(
  seedStr: string,
  cx: number,
  cz: number,
  isDestroyed?: (x: number, y: number, z: number) => boolean,
): MeshChunkPayload {
  const voxels = buildChunkVoxelsWithOverrides(seedStr, cx, cz, isDestroyed);
  const mesh = greedyMesh(voxels, {
    x: CHUNK_SIZE_PADDED,
    y: CHUNK_HEIGHT_PADDED,
    z: CHUNK_SIZE_PADDED,
  });

  return {
    key: chunkKey(cx, cz),
    cx,
    cz,
    ...mesh,
  };
}
