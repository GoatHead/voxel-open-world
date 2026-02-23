export type ChunkCoord = {
  chunk: number;
  local: number;
};

export function floorDiv(a: number, b: number): number {
  if (b <= 0) {
    throw new Error("floorDiv requires b > 0");
  }

  return Math.floor(a / b);
}

export function floorMod(a: number, b: number): number {
  if (b <= 0) {
    throw new Error("floorMod requires b > 0");
  }

  return a - floorDiv(a, b) * b;
}

export function worldToChunk(x: number, chunkSize: number): ChunkCoord {
  if (chunkSize <= 0) {
    throw new Error("worldToChunk requires chunkSize > 0");
  }

  return {
    chunk: floorDiv(x, chunkSize),
    local: floorMod(x, chunkSize),
  };
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}
