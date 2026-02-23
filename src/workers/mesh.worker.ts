import { meshChunk, type MeshChunkPayload } from "../engine/meshChunk";
import {
  addDestroyedVoxel,
  createDestroyedVoxelIndex,
  hasDestroyedVoxel,
} from "../world/destroyedVoxels";

export type MeshWorkerRequest = {
  seedStr: string;
  seedInt: number;
  cx: number;
  cz: number;
  destroyedDelta?: Int32Array;
  forceApply?: boolean;
};

export type MeshWorkerResponse = MeshChunkPayload & {
  forceApply?: boolean;
};

type MeshWorkerGlobal = {
  onmessage: ((event: MessageEvent<MeshWorkerRequest>) => void) | null;
  postMessage: (message: MeshWorkerResponse, transferables?: Transferable[]) => void;
};

export function getTransferables(payload: MeshWorkerResponse): Transferable[] {
  return [
    payload.positions.buffer,
    payload.normals.buffer,
    payload.colors.buffer,
    payload.indices.buffer,
  ];
}

export function getRequestTransferables(request: MeshWorkerRequest): Transferable[] {
  if (!request.destroyedDelta) {
    return [];
  }

  return [request.destroyedDelta.buffer];
}

const destroyedVoxelIndex = createDestroyedVoxelIndex();

function applyDestroyedDelta(delta?: Int32Array): void {
  if (!delta || delta.length === 0) {
    return;
  }

  for (let i = 0; i + 2 < delta.length; i += 3) {
    addDestroyedVoxel(destroyedVoxelIndex, delta[i], delta[i + 1], delta[i + 2]);
  }
}

const workerGlobal = typeof self === "undefined" ? null : (self as unknown as MeshWorkerGlobal);

if (workerGlobal) {
  workerGlobal.onmessage = (event) => {
    const { seedStr, cx, cz, destroyedDelta } = event.data;
    applyDestroyedDelta(destroyedDelta);
    const payload = {
      ...meshChunk(seedStr, cx, cz, (x, y, z) => hasDestroyedVoxel(destroyedVoxelIndex, x, y, z)),
      forceApply: event.data.forceApply,
    };
    workerGlobal.postMessage(payload, getTransferables(payload));
  };
}
