export type ParsedSeed = {
  seedStr: string | null;
  seedInt: number | null;
};

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const RANDOM_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function parseSeedFromSearch(search: string): ParsedSeed {
  const params = new URLSearchParams(search);
  const seedStr = params.get("seed");

  if (seedStr === null) {
    return { seedStr: null, seedInt: null };
  }

  return {
    seedStr,
    seedInt: seedToInt(seedStr),
  };
}

export function parseSeedFromUrl(): ParsedSeed {
  if (typeof window === "undefined" || !window.location) {
    return { seedStr: null, seedInt: null };
  }

  return parseSeedFromSearch(window.location.search);
}

export function randomSeedStr(length = 16): string {
  const out: string[] = [];

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);

    for (let i = 0; i < bytes.length; i += 1) {
      out.push(RANDOM_ALPHABET[bytes[i] % RANDOM_ALPHABET.length]);
    }

    return out.join("");
  }

  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * RANDOM_ALPHABET.length);
    out.push(RANDOM_ALPHABET[idx]);
  }

  return out.join("");
}

export function seedToInt(seedStr: string): number {
  const bytes = new TextEncoder().encode(seedStr);
  let hash = FNV_OFFSET_BASIS;

  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
}

export function makeShareUrl(
  seedStr: string,
  base?: { origin: string; pathname?: string },
): string {
  const origin = base?.origin ?? window.location.origin;
  const pathname = base?.pathname ?? window.location.pathname;
  const url = new URL(pathname || "/", origin);

  url.searchParams.set("seed", seedStr);
  return url.toString();
}
