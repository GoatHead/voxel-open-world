import { describe, expect, it } from "vitest";
import { VOXEL_AIR, VOXEL_STONE } from "../world/getVoxel";
import { greedyMesh, indexOfPadded, type PaddedChunkDims } from "./greedyMesh";

function createVoxels(dims: PaddedChunkDims): Uint8Array {
  return new Uint8Array(dims.x * dims.y * dims.z);
}

function setInnerVoxel(
  voxels: Uint8Array,
  dims: PaddedChunkDims,
  x: number,
  y: number,
  z: number,
  id: number,
): void {
  voxels[indexOfPadded(x + 1, y + 1, z + 1, dims)] = id;
}

function setPaddedVoxel(
  voxels: Uint8Array,
  dims: PaddedChunkDims,
  px: number,
  py: number,
  pz: number,
  id: number,
): void {
  voxels[indexOfPadded(px, py, pz, dims)] = id;
}

describe("greedyMesh", () => {
  it("single voxel produces 6 faces", () => {
    const dims = { x: 5, y: 5, z: 5 };
    const voxels = createVoxels(dims);
    setInnerVoxel(voxels, dims, 1, 1, 1, VOXEL_STONE);

    const mesh = greedyMesh(voxels, dims);

    expect(mesh.quadCount).toBe(6);
    expect(mesh.indexCount).toBe(36);
  });

  it("solid volume emits only outer faces", () => {
    const dims = { x: 6, y: 5, z: 4 };
    const voxels = createVoxels(dims);
    const innerX = dims.x - 2;
    const innerY = dims.y - 2;
    const innerZ = dims.z - 2;

    for (let y = 0; y < innerY; y += 1) {
      for (let z = 0; z < innerZ; z += 1) {
        for (let x = 0; x < innerX; x += 1) {
          setInnerVoxel(voxels, dims, x, y, z, VOXEL_STONE);
        }
      }
    }

    const mesh = greedyMesh(voxels, dims);

    expect(mesh.quadCount).toBe(6);
  });

  it("merges adjacent faces for neighboring blocks", () => {
    const dims = { x: 6, y: 5, z: 5 };
    const voxels = createVoxels(dims);
    setInnerVoxel(voxels, dims, 1, 1, 1, VOXEL_STONE);
    setInnerVoxel(voxels, dims, 2, 1, 1, VOXEL_STONE);

    const mesh = greedyMesh(voxels, dims);
    const naiveQuads = 10;

    expect(mesh.quadCount).toBeLessThan(naiveQuads);
    expect(mesh.quadCount).toBe(6);
  });

  it("uses padded neighbors to suppress chunk-edge faces", () => {
    const dims = { x: 5, y: 5, z: 5 };
    const voxels = createVoxels(dims);

    setInnerVoxel(voxels, dims, 0, 1, 1, VOXEL_STONE);
    setPaddedVoxel(voxels, dims, 0, 2, 2, VOXEL_STONE);

    const mesh = greedyMesh(voxels, dims);

    expect(mesh.quadCount).toBe(5);
  });

  it("produces internally consistent attribute and index buffers", () => {
    const dims = { x: 6, y: 6, z: 6 };
    const voxels = createVoxels(dims);

    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        setInnerVoxel(voxels, dims, x, y, 1, VOXEL_STONE);
      }
    }

    setInnerVoxel(voxels, dims, 2, 1, 2, VOXEL_AIR);

    const mesh = greedyMesh(voxels, dims);
    const vertexCount = mesh.positions.length / 3;

    expect(mesh.positions.length % 3).toBe(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.colors.length).toBe(mesh.positions.length);
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.indexCount).toBe(mesh.indices.length);

    for (const index of mesh.indices) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(vertexCount);
    }
  });
});
