import { describe, expect, it } from "vitest";
import { getTransferables } from "../workers/mesh.worker";
import { meshChunk } from "./meshChunk";

describe("meshChunk", () => {
  it("returns a payload with internally consistent buffer lengths", () => {
    const payload = meshChunk("demo", 0, 0);
    const vertexCount = payload.positions.length / 3;

    expect(payload.key).toBe("0,0");
    expect(payload.cx).toBe(0);
    expect(payload.cz).toBe(0);
    expect(payload.positions.length % 3).toBe(0);
    expect(payload.normals.length).toBe(payload.positions.length);
    expect(payload.colors.length).toBe(payload.positions.length);
    expect(payload.indices.length % 3).toBe(0);
    expect(payload.quadCount * 4).toBe(vertexCount);
    expect(payload.indexCount).toBe(payload.indices.length);
  });

  it("exposes all geometry buffers as transferables", () => {
    const payload = meshChunk("demo", 0, 0);
    const transferables = getTransferables(payload);

    expect(transferables).toHaveLength(4);
    expect(transferables).toContain(payload.positions.buffer);
    expect(transferables).toContain(payload.normals.buffer);
    expect(transferables).toContain(payload.colors.buffer);
    expect(transferables).toContain(payload.indices.buffer);
  });
});
