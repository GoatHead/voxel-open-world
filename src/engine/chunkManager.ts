import { chunkKey, worldToChunk } from "../lib/chunkMath";
import { seedToInt } from "../lib/seed";
import type { MeshWorkerRequest, MeshWorkerResponse } from "../workers/mesh.worker";
import { CHUNK_SIZE } from "../world/chunkConstants";

export const DEFAULT_ACTIVE_RADIUS = 4;
export const DEFAULT_REMOVE_RADIUS = 6;

type ChunkCoord2D = {
  cx: number;
  cz: number;
};

export type ChunkManagerTickParams = {
  playerX: number;
  playerZ: number;
  seedStr: string;
  workerResponses?: MeshWorkerResponse[];
};

export type ChunkManagerTickResult = {
  request?: MeshWorkerRequest;
  apply?: MeshWorkerResponse;
  unloadKeys: string[];
};

export type ChunkManagerStats = {
  loaded: number;
  queued: number;
  inflight: number;
  ready: number;
};

export function computeNeededChunkKeys(
  centerCx: number,
  centerCz: number,
  activeRadius: number,
): string[] {
  const radius = Math.max(0, Math.floor(activeRadius));
  const coords: ChunkCoord2D[] = [];

  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      coords.push({ cx: centerCx + dx, cz: centerCz + dz });
    }
  }

  coords.sort((a, b) => {
    const aDistance = chebyshevDistance(a.cx, a.cz, centerCx, centerCz);
    const bDistance = chebyshevDistance(b.cx, b.cz, centerCx, centerCz);

    if (aDistance !== bDistance) {
      return aDistance - bDistance;
    }

    if (a.cz !== b.cz) {
      return a.cz - b.cz;
    }

    return a.cx - b.cx;
  });

  return coords.map(({ cx, cz }) => chunkKey(cx, cz));
}

export class ChunkManager {
  private readonly activeRadius: number;
  private readonly removeRadius: number;

  private readonly loaded = new Map<string, MeshWorkerResponse>();
  private readonly inflight = new Map<string, MeshWorkerRequest>();
  private readonly queued = new Map<string, MeshWorkerRequest>();
  private readonly readyToApply = new Map<string, MeshWorkerResponse>();

  private seedStr: string | null = null;
  private seedInt: number | null = null;

  public constructor(options?: { activeRadius?: number; removeRadius?: number }) {
    this.activeRadius = Math.max(0, Math.floor(options?.activeRadius ?? DEFAULT_ACTIVE_RADIUS));
    this.removeRadius = Math.max(0, Math.floor(options?.removeRadius ?? DEFAULT_REMOVE_RADIUS));

    if (this.removeRadius < this.activeRadius) {
      throw new Error("removeRadius must be >= activeRadius");
    }
  }

  public handleWorkerResponse(response: MeshWorkerResponse): void {
    const key = chunkKey(response.cx, response.cz);

    if (!this.inflight.has(key)) {
      return;
    }

    this.inflight.delete(key);
    this.readyToApply.set(key, response);
  }

  public tick(params: ChunkManagerTickParams): ChunkManagerTickResult {
    const unloadKeys: string[] = [];

    this.resetForSeedIfNeeded(params.seedStr, unloadKeys);

    for (const response of params.workerResponses ?? []) {
      this.handleWorkerResponse(response);
    }

    const centerCx = worldToChunk(params.playerX, CHUNK_SIZE).chunk;
    const centerCz = worldToChunk(params.playerZ, CHUNK_SIZE).chunk;

    this.pruneOutsideRemoveRadius(this.queued, centerCx, centerCz);
    this.pruneOutsideRemoveRadius(this.inflight, centerCx, centerCz);
    this.pruneOutsideRemoveRadius(this.readyToApply, centerCx, centerCz);

    this.unloadOutsideRemoveRadius(centerCx, centerCz, unloadKeys);
    this.refreshQueue(centerCx, centerCz);

    const request = this.dequeueRequest();
    const apply = this.dequeueApply(centerCx, centerCz);

    return {
      request,
      apply,
      unloadKeys,
    };
  }

  public getStats(): ChunkManagerStats {
    return {
      loaded: this.loaded.size,
      queued: this.queued.size,
      inflight: this.inflight.size,
      ready: this.readyToApply.size,
    };
  }

  private resetForSeedIfNeeded(seedStr: string, unloadKeys: string[]): void {
    if (this.seedStr === seedStr) {
      return;
    }

    for (const key of this.loaded.keys()) {
      unloadKeys.push(key);
    }

    this.loaded.clear();
    this.inflight.clear();
    this.queued.clear();
    this.readyToApply.clear();
    this.seedStr = seedStr;
    this.seedInt = seedToInt(seedStr);
  }

  private refreshQueue(centerCx: number, centerCz: number): void {
    if (this.seedStr === null || this.seedInt === null) {
      return;
    }

    const needed = new Set(computeNeededChunkKeys(centerCx, centerCz, this.activeRadius));

    for (const key of this.queued.keys()) {
      if (!needed.has(key)) {
        this.queued.delete(key);
      }
    }

    for (const key of needed) {
      if (this.loaded.has(key) || this.inflight.has(key) || this.queued.has(key) || this.readyToApply.has(key)) {
        continue;
      }

      const coord = parseChunkKey(key);

      this.queued.set(key, {
        seedStr: this.seedStr,
        seedInt: this.seedInt,
        cx: coord.cx,
        cz: coord.cz,
      });
    }
  }

  private dequeueRequest(): MeshWorkerRequest | undefined {
    const first = this.queued.entries().next();

    if (first.done) {
      return undefined;
    }

    const [key, request] = first.value;
    this.queued.delete(key);
    this.inflight.set(key, request);
    return request;
  }

  private dequeueApply(centerCx: number, centerCz: number): MeshWorkerResponse | undefined {
    let bestKey: string | null = null;
    let bestResponse: MeshWorkerResponse | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestCx = 0;
    let bestCz = 0;

    for (const [key, response] of this.readyToApply) {
      const coord = parseChunkKey(key);

      if (!isInRadius(coord.cx, coord.cz, centerCx, centerCz, this.removeRadius)) {
        this.readyToApply.delete(key);
        continue;
      }

      const distance = chebyshevDistance(coord.cx, coord.cz, centerCx, centerCz);

      if (
        distance < bestDistance ||
        (distance === bestDistance &&
          (coord.cz < bestCz || (coord.cz === bestCz && coord.cx < bestCx)))
      ) {
        bestKey = key;
        bestResponse = response;
        bestDistance = distance;
        bestCx = coord.cx;
        bestCz = coord.cz;
      }
    }

    if (bestKey && bestResponse) {
      this.readyToApply.delete(bestKey);
      this.loaded.set(bestKey, bestResponse);
      return bestResponse;
    }

    return undefined;
  }

  private unloadOutsideRemoveRadius(centerCx: number, centerCz: number, unloadKeys: string[]): void {
    for (const key of this.loaded.keys()) {
      const coord = parseChunkKey(key);

      if (isInRadius(coord.cx, coord.cz, centerCx, centerCz, this.removeRadius)) {
        continue;
      }

      this.loaded.delete(key);
      unloadKeys.push(key);
    }
  }

  private pruneOutsideRemoveRadius<T>(map: Map<string, T>, centerCx: number, centerCz: number): void {
    for (const key of map.keys()) {
      const coord = parseChunkKey(key);

      if (isInRadius(coord.cx, coord.cz, centerCx, centerCz, this.removeRadius)) {
        continue;
      }

      map.delete(key);
    }
  }
}

function parseChunkKey(key: string): ChunkCoord2D {
  const [cxRaw, czRaw] = key.split(",");
  return {
    cx: Number(cxRaw),
    cz: Number(czRaw),
  };
}

function chebyshevDistance(cx: number, cz: number, centerCx: number, centerCz: number): number {
  return Math.max(Math.abs(cx - centerCx), Math.abs(cz - centerCz));
}

function isInRadius(cx: number, cz: number, centerCx: number, centerCz: number, radius: number): boolean {
  return chebyshevDistance(cx, cz, centerCx, centerCz) <= radius;
}
