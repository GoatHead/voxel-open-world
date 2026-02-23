import { describe, expect, it } from "vitest";
import {
  VOXEL_AIR,
  VOXEL_DIRT,
  VOXEL_GRASS,
  VOXEL_STONE,
  getVoxel,
} from "./getVoxel";

const SAMPLE_Y_MAX = 96;
const SAMPLE_Y_MIN = -64;

function findSurfaceY(seed: string, x: number, z: number): number {
  for (let y = SAMPLE_Y_MAX; y >= SAMPLE_Y_MIN; y -= 1) {
    if (getVoxel(seed, x, y, z) !== VOXEL_AIR) {
      return y;
    }
  }

  throw new Error(`No surface found at (${x}, ${z})`);
}

function columnSignature(seed: string, x: number, z: number): string {
  const parts: number[] = [];

  for (let y = SAMPLE_Y_MIN; y <= SAMPLE_Y_MAX; y += 1) {
    parts.push(getVoxel(seed, x, y, z));
  }

  return parts.join("");
}

function findNaturalGrassSurface(seed: string): { x: number; z: number; y: number } {
  for (let z = -160; z <= 160; z += 7) {
    for (let x = -160; x <= 160; x += 7) {
      const surfaceY = findSurfaceY(seed, x, z);
      const top = getVoxel(seed, x, surfaceY, z);

      if (top !== VOXEL_GRASS) {
        continue;
      }

      if (
        getVoxel(seed, x, surfaceY - 1, z) === VOXEL_DIRT &&
        getVoxel(seed, x, surfaceY - 2, z) === VOXEL_DIRT &&
        getVoxel(seed, x, surfaceY - 3, z) === VOXEL_DIRT &&
        getVoxel(seed, x, surfaceY - 4, z) === VOXEL_STONE
      ) {
        return { x, z, y: surfaceY };
      }
    }
  }

  throw new Error("Could not find a natural grass column for stratification test");
}

function findFeatureTopKinds(seed: string): { hasTopDirt: boolean; hasTopStone: boolean } {
  let hasTopDirt = false;
  let hasTopStone = false;

  for (let z = -220; z <= 220; z += 4) {
    for (let x = -220; x <= 220; x += 4) {
      const surfaceY = findSurfaceY(seed, x, z);
      const top = getVoxel(seed, x, surfaceY, z);

      if (top === VOXEL_DIRT) {
        hasTopDirt = true;
      } else if (top === VOXEL_STONE) {
        hasTopStone = true;
      }

      if (hasTopDirt && hasTopStone) {
        return { hasTopDirt, hasTopStone };
      }
    }
  }

  return { hasTopDirt, hasTopStone };
}

function hasSolidAboveSurface(seed: string): boolean {
  for (let z = -220; z <= 220; z += 3) {
    for (let x = -220; x <= 220; x += 3) {
      const surfaceY = findSurfaceY(seed, x, z);

      for (let y = surfaceY + 1; y <= surfaceY + 6; y += 1) {
        if (getVoxel(seed, x, y, z) !== VOXEL_AIR) {
          return true;
        }
      }
    }
  }

  return false;
}

describe("getVoxel", () => {
  it("returns identical voxel for same seed and coordinates", () => {
    const seed = "same-seed";
    const voxelA = getVoxel(seed, 17, 24, -9);
    const voxelB = getVoxel(seed, 17, 24, -9);

    expect(voxelA).toBe(voxelB);
  });

  it("produces different terrain for different seeds (spot check)", () => {
    const sampleCoords: Array<[number, number]> = [
      [0, 0],
      [5, 11],
      [12, -3],
      [27, 19],
      [-8, 14],
      [33, -21],
      [-64, -64],
      [81, 7],
    ];

    const hasDifference = sampleCoords.some(([x, z]) => {
      const a = columnSignature("world-a", x, z);
      const b = columnSignature("world-b", x, z);
      return a !== b;
    });

    expect(hasDifference).toBe(true);
  });

  it("keeps natural stratification as grass, dirt, then stone", () => {
    const seed = "strata-seed";
    const sample = findNaturalGrassSurface(seed);

    expect(getVoxel(seed, sample.x, sample.y, sample.z)).toBe(VOXEL_GRASS);
    expect(getVoxel(seed, sample.x, sample.y - 1, sample.z)).toBe(VOXEL_DIRT);
    expect(getVoxel(seed, sample.x, sample.y - 2, sample.z)).toBe(VOXEL_DIRT);
    expect(getVoxel(seed, sample.x, sample.y - 3, sample.z)).toBe(VOXEL_DIRT);
    expect(getVoxel(seed, sample.x, sample.y - 4, sample.z)).toBe(VOXEL_STONE);
  });

  it("supports negative coordinates", () => {
    const seed = "negative-coords";
    const x = -37;
    const z = -58;
    const surfaceY = findSurfaceY(seed, x, z);

    const voxel = getVoxel(seed, x, surfaceY, z);
    expect([VOXEL_GRASS, VOXEL_DIRT, VOXEL_STONE, VOXEL_AIR]).toContain(voxel);
    expect(getVoxel(seed, x, surfaceY, z)).toBe(voxel);
  });

  it("adds non-grass surface features (rivers/roads)", () => {
    const seed = "feature-seed";
    const kinds = findFeatureTopKinds(seed);

    expect(kinds.hasTopDirt).toBe(true);
    expect(kinds.hasTopStone).toBe(true);
  });

  it("can place solid structures above local ground (village huts)", () => {
    const seed = "feature-seed";
    expect(hasSolidAboveSurface(seed)).toBe(true);
  });
});
