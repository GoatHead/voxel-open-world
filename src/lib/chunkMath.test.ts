import { describe, expect, it } from "vitest";
import { chunkKey, floorDiv, floorMod, worldToChunk } from "./chunkMath";

describe("floor division helpers", () => {
  it("handles positive and negative values with mathematical floor behavior", () => {
    expect(floorDiv(7, 4)).toBe(1);
    expect(floorDiv(-1, 4)).toBe(-1);
    expect(floorDiv(-4, 4)).toBe(-1);
    expect(floorDiv(-5, 4)).toBe(-2);

    expect(floorMod(7, 4)).toBe(3);
    expect(floorMod(-1, 4)).toBe(3);
    expect(floorMod(-4, 4)).toBe(0);
    expect(floorMod(-5, 4)).toBe(3);
  });

  it("throws when divisor is not positive", () => {
    expect(() => floorDiv(1, 0)).toThrow();
    expect(() => floorDiv(1, -2)).toThrow();
    expect(() => floorMod(1, 0)).toThrow();
    expect(() => floorMod(1, -2)).toThrow();
  });
});

describe("worldToChunk", () => {
  const chunkSize = 16;

  it("maps required boundary points", () => {
    expect(worldToChunk(0, chunkSize)).toEqual({ chunk: 0, local: 0 });
    expect(worldToChunk(chunkSize - 1, chunkSize)).toEqual({
      chunk: 0,
      local: chunkSize - 1,
    });
    expect(worldToChunk(chunkSize, chunkSize)).toEqual({ chunk: 1, local: 0 });

    expect(worldToChunk(-1, chunkSize)).toEqual({
      chunk: -1,
      local: chunkSize - 1,
    });
    expect(worldToChunk(-chunkSize, chunkSize)).toEqual({
      chunk: -1,
      local: 0,
    });
    expect(worldToChunk(-chunkSize - 1, chunkSize)).toEqual({
      chunk: -2,
      local: chunkSize - 1,
    });
  });

  it("always keeps local in range [0, chunkSize - 1]", () => {
    for (let x = -100; x <= 100; x += 1) {
      const { local } = worldToChunk(x, chunkSize);
      expect(local).toBeGreaterThanOrEqual(0);
      expect(local).toBeLessThan(chunkSize);
    }
  });

  it("throws when chunk size is not positive", () => {
    expect(() => worldToChunk(0, 0)).toThrow();
    expect(() => worldToChunk(0, -4)).toThrow();
  });
});

describe("chunkKey", () => {
  it("returns a stable key format", () => {
    expect(chunkKey(0, 0)).toBe("0,0");
    expect(chunkKey(-3, 9)).toBe("-3,9");
    expect(chunkKey(12, -7)).toBe("12,-7");
  });
});
