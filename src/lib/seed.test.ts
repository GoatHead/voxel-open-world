import { describe, expect, it } from "vitest";
import {
  makeShareUrl,
  parseSeedFromSearch,
  randomSeedStr,
  seedToInt,
} from "./seed";

describe("seed utilities", () => {
  it("returns null seed values when seed is missing", () => {
    expect(parseSeedFromSearch("?foo=bar")).toEqual({
      seedStr: null,
      seedInt: null,
    });
  });

  it("maps same seed string to same int", () => {
    expect(seedToInt("world-123")).toBe(seedToInt("world-123"));
  });

  it("maps different seed strings to different ints (spot check)", () => {
    expect(seedToInt("world-123")).not.toBe(seedToInt("world-124"));
  });

  it("keeps unicode seed hashing stable", () => {
    const unicodeSeed = "seed-こんにちは-🌱";
    expect(seedToInt(unicodeSeed)).toBe(seedToInt(unicodeSeed));
  });

  it("creates URL with encoded seed query param", () => {
    const seed = "hello world/こんにちは?=+";
    const url = makeShareUrl(seed, {
      origin: "https://example.com",
      pathname: "/play",
    });

    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://example.com");
    expect(parsed.pathname).toBe("/play");
    expect(parsed.searchParams.get("seed")).toBe(seed);
    expect(url).toContain("?seed=");
    expect(url).toContain("%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF");
  });

  it("generates URL-safe random seed strings", () => {
    const seed = randomSeedStr();
    expect(seed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(seed.length).toBeGreaterThan(0);
  });
});
