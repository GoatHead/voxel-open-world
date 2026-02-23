import { buildChunkVoxels, indexOf } from "./buildChunkVoxels";
import { CHUNK_HEIGHT, CHUNK_SIZE } from "./chunkConstants";

export function worldHash(seedStr: string, radius: number): string {
  if (!Number.isInteger(radius) || radius < 0) {
    throw new RangeError("radius must be a non-negative integer");
  }

  const hash = createRollingHash();

  for (let cz = -radius; cz <= radius; cz += 1) {
    for (let cx = -radius; cx <= radius; cx += 1) {
      const voxels = buildChunkVoxels(seedStr, cx, cz);

      for (let py = 1; py <= CHUNK_HEIGHT; py += 1) {
        for (let pz = 1; pz <= CHUNK_SIZE; pz += 1) {
          const rowStart = indexOf(1, py, pz);
          const rowEnd = rowStart + CHUNK_SIZE;
          hash.update(voxels.subarray(rowStart, rowEnd));
        }
      }
    }
  }

  return hash.digestHex();
}

type RollingHash = {
  update: (bytes: Uint8Array) => void;
  digestHex: () => string;
};

function createRollingHash(): RollingHash {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;

  return {
    update(bytes: Uint8Array) {
      for (let i = 0; i < bytes.length; i += 1) {
        const b = bytes[i];
        h1 ^= b;
        h1 = Math.imul(h1, 0x01000193) >>> 0;

        h2 ^= b ^ ((i * 131) & 0xff);
        h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
        h2 = ((h2 << 13) | (h2 >>> 19)) >>> 0;
      }
    },
    digestHex() {
      return `${toHex32(h1)}${toHex32(h2)}`;
    },
  };
}

function toHex32(value: number): string {
  return value.toString(16).padStart(8, "0");
}
