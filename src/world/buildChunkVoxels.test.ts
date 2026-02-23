import { describe, expect, it } from "vitest";
import { getVoxel } from "./getVoxel";
import {
  CHUNK_HEIGHT_PADDED,
  CHUNK_SIZE,
  CHUNK_SIZE_PADDED,
  buildChunkVoxels,
  indexOf,
} from "./buildChunkVoxels";

type PaddedSample = {
  px: number;
  py: number;
  pz: number;
};

const SAMPLES: PaddedSample[] = [
  { px: 0, py: 0, pz: 0 },
  { px: 1, py: 1, pz: 1 },
  { px: CHUNK_SIZE, py: CHUNK_HEIGHT_PADDED - 2, pz: CHUNK_SIZE },
  { px: CHUNK_SIZE_PADDED - 1, py: CHUNK_HEIGHT_PADDED - 1, pz: CHUNK_SIZE_PADDED - 1 },
  { px: CHUNK_SIZE + 1, py: 17, pz: 0 },
  { px: 0, py: 33, pz: CHUNK_SIZE + 1 },
  { px: 9, py: CHUNK_HEIGHT_PADDED - 1, pz: 8 },
];

function expectSamplesMatch(
  seed: string,
  cx: number,
  cz: number,
  samples: PaddedSample[] = SAMPLES,
): void {
  const voxels = buildChunkVoxels(seed, cx, cz);
  const worldX0 = cx * CHUNK_SIZE;
  const worldZ0 = cz * CHUNK_SIZE;

  for (const { px, py, pz } of samples) {
    const worldX = worldX0 + (px - 1);
    const worldY = py - 1;
    const worldZ = worldZ0 + (pz - 1);
    const actual = voxels[indexOf(px, py, pz)];
    const expected = getVoxel(seed, worldX, worldY, worldZ);

    expect(actual).toBe(expected);
  }
}

describe("buildChunkVoxels", () => {
  it("maps padded chunk samples to getVoxel world coordinates", () => {
    const cases: Array<{ seed: string; cx: number; cz: number }> = [
      { seed: "alpha", cx: 0, cz: 0 },
      { seed: "beta", cx: 2, cz: 3 },
      { seed: "gamma", cx: -1, cz: 4 },
    ];

    for (const { seed, cx, cz } of cases) {
      expectSamplesMatch(seed, cx, cz);
    }
  });

  it("supports negative chunk coordinates", () => {
    expectSamplesMatch("neg-chunk", -3, -2, [
      { px: 0, py: 1, pz: 0 },
      { px: 1, py: 10, pz: CHUNK_SIZE },
      { px: CHUNK_SIZE_PADDED - 1, py: CHUNK_HEIGHT_PADDED - 2, pz: CHUNK_SIZE_PADDED - 1 },
    ]);
  });
});
