import { describe, expect, it } from "vitest";
import { randomSeedStr } from "../lib/seed";
import { worldHash } from "./worldHash";

describe("worldHash", () => {
  it("returns same hash for same seed and radius", () => {
    const seed = "deterministic-seed";
    const radius = 1;

    expect(worldHash(seed, radius)).toBe(worldHash(seed, radius));
  });

  it("returns different hashes for different seeds (spot check)", () => {
    expect(worldHash("seed-a", 1)).not.toBe(worldHash("seed-b", 1));
  });

  it("randomSeedStr generates multiple unique seeds (smoke)", () => {
    const count = 64;
    const seen = new Set<string>();

    for (let i = 0; i < count; i += 1) {
      seen.add(randomSeedStr());
    }

    expect(seen.size).toBeGreaterThan(1);
  });
});
