import { describe, expect, it } from "vitest";
import { chunkKey } from "../lib/chunkMath";
import {
  ChunkManager,
  computeNeededChunkKeys,
} from "./chunkManager";

function makeResponse(cx: number, cz: number) {
  return {
    key: chunkKey(cx, cz),
    cx,
    cz,
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    colors: new Float32Array(0),
    indices: new Uint32Array(0),
    quadCount: 0,
    indexCount: 0,
  };
}

describe("computeNeededChunkKeys", () => {
  it("returns the expected square around the center", () => {
    const keys = computeNeededChunkKeys(0, 0, 1);

    expect(keys).toHaveLength(9);
    expect(new Set(keys)).toEqual(
      new Set([
        chunkKey(-1, -1),
        chunkKey(0, -1),
        chunkKey(1, -1),
        chunkKey(-1, 0),
        chunkKey(0, 0),
        chunkKey(1, 0),
        chunkKey(-1, 1),
        chunkKey(0, 1),
        chunkKey(1, 1),
      ]),
    );

    expect(keys[0]).toBe(chunkKey(0, 0));
  });
});

describe("ChunkManager", () => {
  it("uses worldToChunk semantics for negative-safe center mapping", () => {
    const manager = new ChunkManager({ activeRadius: 0, removeRadius: 1 });
    const result = manager.tick({
      playerX: -1,
      playerZ: 16,
      seedStr: "demo",
    });

    expect(result.request).toMatchObject({
      cx: -1,
      cz: 1,
      seedStr: "demo",
    });
    expect(result.unloadKeys).toEqual([]);
  });

  it("keeps chunks loaded inside removeRadius to avoid boundary thrash", () => {
    const manager = new ChunkManager({ activeRadius: 0, removeRadius: 1 });

    const tickA = manager.tick({ playerX: 0, playerZ: 0, seedStr: "demo" });
    expect(tickA.request).toMatchObject({ cx: 0, cz: 0 });

    const applyA = manager.tick({
      playerX: 0,
      playerZ: 0,
      seedStr: "demo",
      workerResponses: [makeResponse(0, 0)],
    });
    expect(applyA.apply?.key).toBe(chunkKey(0, 0));

    const moveToNeighbor = manager.tick({ playerX: 16, playerZ: 0, seedStr: "demo" });

    expect(moveToNeighbor.unloadKeys).toEqual([]);
    expect(moveToNeighbor.request).toMatchObject({ cx: 1, cz: 0 });

    const moveBack = manager.tick({ playerX: 0, playerZ: 0, seedStr: "demo" });
    expect(moveBack.unloadKeys).toEqual([]);
    expect(moveBack.request).toBeUndefined();
  });

  it("unloads chunks once they leave removeRadius", () => {
    const manager = new ChunkManager({ activeRadius: 0, removeRadius: 1 });

    manager.tick({ playerX: 0, playerZ: 0, seedStr: "demo" });
    manager.tick({
      playerX: 0,
      playerZ: 0,
      seedStr: "demo",
      workerResponses: [makeResponse(0, 0)],
    });

    const movedFar = manager.tick({ playerX: 32, playerZ: 0, seedStr: "demo" });
    expect(movedFar.unloadKeys).toContain(chunkKey(0, 0));
  });

  it("limits inflight requests to avoid worker backlog growth", () => {
    const manager = new ChunkManager({ activeRadius: 1, removeRadius: 2, maxInflight: 1 });

    const firstTick = manager.tick({ playerX: 0, playerZ: 0, seedStr: "demo" });
    expect(firstTick.request).toBeDefined();
    expect(manager.getStats().inflight).toBe(1);

    const secondTick = manager.tick({ playerX: 0, playerZ: 0, seedStr: "demo" });
    expect(secondTick.request).toBeUndefined();
    expect(manager.getStats().inflight).toBe(1);

    if (!firstTick.request) {
      throw new Error("expected a first request");
    }

    const afterResponse = manager.tick({
      playerX: 0,
      playerZ: 0,
      seedStr: "demo",
      workerResponses: [makeResponse(firstTick.request.cx, firstTick.request.cz)],
    });
    expect(afterResponse.apply?.key).toBe(chunkKey(firstTick.request.cx, firstTick.request.cz));
    expect(manager.getStats().inflight).toBe(0);

    const nextTick = manager.tick({ playerX: 0, playerZ: 0, seedStr: "demo" });
    expect(nextTick.request).toBeDefined();
  });

  it("can throttle request and apply from caller", () => {
    const manager = new ChunkManager({ activeRadius: 0, removeRadius: 1, maxInflight: 1 });

    const firstTick = manager.tick({
      playerX: 0,
      playerZ: 0,
      seedStr: "demo",
      allowRequest: false,
    });
    expect(firstTick.request).toBeUndefined();

    const secondTick = manager.tick({ playerX: 0, playerZ: 0, seedStr: "demo" });
    expect(secondTick.request).toMatchObject({ cx: 0, cz: 0 });

    const gatedApplyTick = manager.tick({
      playerX: 0,
      playerZ: 0,
      seedStr: "demo",
      workerResponses: [makeResponse(0, 0)],
      allowApply: false,
    });
    expect(gatedApplyTick.apply).toBeUndefined();

    const openApplyTick = manager.tick({ playerX: 0, playerZ: 0, seedStr: "demo" });
    expect(openApplyTick.apply?.key).toBe(chunkKey(0, 0));
  });
});
