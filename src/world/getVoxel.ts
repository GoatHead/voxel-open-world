import alea from "alea";
import { createNoise2D } from "simplex-noise";
import { seedToInt } from "../lib/seed";

export const VOXEL_AIR = 0;
export const VOXEL_GRASS = 1;
export const VOXEL_DIRT = 2;
export const VOXEL_STONE = 3;

export type VoxelId =
  | typeof VOXEL_AIR
  | typeof VOXEL_GRASS
  | typeof VOXEL_DIRT
  | typeof VOXEL_STONE;

const TERRAIN_BASE_HEIGHT = 20;
const TERRAIN_NOISE_SCALE = 0.018;
const TERRAIN_DETAIL_SCALE = 0.05;
const TERRAIN_BIOME_SCALE = 0.0026;
const TERRAIN_CONTINENTAL_SCALE = 0.006;
const TERRAIN_PLAINS_AMPLITUDE = 4;
const TERRAIN_HILLS_AMPLITUDE = 10;
const TERRAIN_MOUNTAIN_AMPLITUDE = 16;
const DIRT_LAYER_DEPTH = 3;

const RIVER_NOISE_SCALE = 0.005;
const RIVER_WARP_SCALE = 0.012;
const RIVER_WARP_STRENGTH = 7;
const RIVER_THRESHOLD = 0.15;
const RIVER_MAX_DEPTH = 6;

const VILLAGE_CELL_SIZE = 72;
const VILLAGE_RADIUS = 18;
const VILLAGE_FLATTEN_BAND = 10;
const VILLAGE_ROAD_HALF_WIDTH = 2;
const SURFACE_CACHE_LIMIT = 60000;

const HUT_TEMPLATES = [
  {
    offsetX: -6,
    offsetZ: -4,
    sizeX: 5,
    sizeZ: 5,
    door: "south" as const,
  },
  {
    offsetX: 6,
    offsetZ: 3,
    sizeX: 4,
    sizeZ: 6,
    door: "west" as const,
  },
] as const;

type NoiseCacheEntry = {
  seedInt: number;
  terrainNoise2D: ReturnType<typeof createNoise2D>;
  terrainDetailNoise2D: ReturnType<typeof createNoise2D>;
  terrainBiomeNoise2D: ReturnType<typeof createNoise2D>;
  terrainContinentalNoise2D: ReturnType<typeof createNoise2D>;
  riverNoise2D: ReturnType<typeof createNoise2D>;
  riverWarpNoise2D: ReturnType<typeof createNoise2D>;
  villageJitterXNoise2D: ReturnType<typeof createNoise2D>;
  villageJitterZNoise2D: ReturnType<typeof createNoise2D>;
  villageHeightNoise2D: ReturnType<typeof createNoise2D>;
  surfaceCache: Map<number, Map<number, SurfaceProfile>>;
  surfaceCacheSize: number;
};

type SurfaceProfile = {
  surfaceHeight: number;
  baseHeight: number;
  isRiver: boolean;
  isVillage: boolean;
  isVillageRoad: boolean;
  localX: number;
  localZ: number;
  villageCenterX: number;
  villageCenterZ: number;
};

const noiseCache = new Map<string, NoiseCacheEntry>();

function getNoiseCache(seedStr: string): NoiseCacheEntry {
  let entry = noiseCache.get(seedStr);

  if (!entry) {
    const seedInt = seedToInt(seedStr);
    entry = {
      seedInt,
      terrainNoise2D: createNoise2D(alea(`${seedStr}:${seedInt}:terrain`)),
      terrainDetailNoise2D: createNoise2D(alea(`${seedStr}:${seedInt}:terrain-detail`)),
      terrainBiomeNoise2D: createNoise2D(alea(`${seedStr}:${seedInt}:terrain-biome`)),
      terrainContinentalNoise2D: createNoise2D(alea(`${seedStr}:${seedInt}:terrain-continental`)),
      riverNoise2D: createNoise2D(alea(`${seedStr}:${seedInt}:river`)),
      riverWarpNoise2D: createNoise2D(alea(`${seedStr}:${seedInt}:river-warp`)),
      villageJitterXNoise2D: createNoise2D(alea(`${seedStr}:${seedInt}:village-jitter-x`)),
      villageJitterZNoise2D: createNoise2D(alea(`${seedStr}:${seedInt}:village-jitter-z`)),
      villageHeightNoise2D: createNoise2D(alea(`${seedStr}:${seedInt}:village-height`)),
      surfaceCache: new Map<number, Map<number, SurfaceProfile>>(),
      surfaceCacheSize: 0,
    };

    noiseCache.set(seedStr, entry);
  }

  return entry;
}

function getBaseHeight(entry: NoiseCacheEntry, x: number, z: number): number {
  const biomeNoise = entry.terrainBiomeNoise2D(x * TERRAIN_BIOME_SCALE, z * TERRAIN_BIOME_SCALE);
  const biome = clamp((biomeNoise + 1) * 0.5, 0, 1);
  const hillMask = smoothstep(0.56, 0.8, biome);
  const mountainMask = smoothstep(0.84, 0.96, biome);

  let amplitude = lerp(TERRAIN_PLAINS_AMPLITUDE, TERRAIN_HILLS_AMPLITUDE, hillMask);
  amplitude = lerp(amplitude, TERRAIN_MOUNTAIN_AMPLITUDE, mountainMask);

  const primary = entry.terrainNoise2D(x * TERRAIN_NOISE_SCALE, z * TERRAIN_NOISE_SCALE);
  const detail = entry.terrainDetailNoise2D(x * TERRAIN_DETAIL_SCALE, z * TERRAIN_DETAIL_SCALE);
  const continental = entry.terrainContinentalNoise2D(
    x * TERRAIN_CONTINENTAL_SCALE,
    z * TERRAIN_CONTINENTAL_SCALE,
  );

  const broadShape = continental * (amplitude * 0.65) + primary * amplitude;
  const microShape = detail * (amplitude * 0.25);
  let height = TERRAIN_BASE_HEIGHT + broadShape + microShape;
  const ridgeStart = TERRAIN_BASE_HEIGHT + 6;

  if (height > ridgeStart) {
    const excess = height - ridgeStart;
    height = ridgeStart + excess * 0.45;
  }

  return Math.floor(height);
}

function getRiverDepth(entry: NoiseCacheEntry, x: number, z: number): number {
  const warp = entry.riverWarpNoise2D(x * RIVER_WARP_SCALE, z * RIVER_WARP_SCALE) * RIVER_WARP_STRENGTH;
  const riverSignal = Math.abs(entry.riverNoise2D(x * RIVER_NOISE_SCALE + warp, z * RIVER_NOISE_SCALE - warp));

  if (riverSignal >= RIVER_THRESHOLD) {
    return 0;
  }

  const intensity = 1 - riverSignal / RIVER_THRESHOLD;
  return Math.max(1, Math.floor(intensity * RIVER_MAX_DEPTH));
}

function getVillageShape(
  entry: NoiseCacheEntry,
  x: number,
  z: number,
): {
  isVillage: boolean;
  isVillageRoad: boolean;
  localX: number;
  localZ: number;
  villageCenterX: number;
  villageCenterZ: number;
  villageBaseHeight: number;
  flattenBlend: number;
} {
  const cellX = Math.floor(x / VILLAGE_CELL_SIZE);
  const cellZ = Math.floor(z / VILLAGE_CELL_SIZE);
  const cellOriginX = cellX * VILLAGE_CELL_SIZE;
  const cellOriginZ = cellZ * VILLAGE_CELL_SIZE;
  const localX = x - cellOriginX;
  const localZ = z - cellOriginZ;

  const villageCenterX = Math.floor(
    VILLAGE_CELL_SIZE * 0.5 +
      entry.villageJitterXNoise2D(cellX * 0.73, cellZ * 0.73) * VILLAGE_CELL_SIZE * 0.23,
  );
  const villageCenterZ = Math.floor(
    VILLAGE_CELL_SIZE * 0.5 +
      entry.villageJitterZNoise2D(cellX * 0.67, cellZ * 0.67) * VILLAGE_CELL_SIZE * 0.23,
  );

  const dx = localX - villageCenterX;
  const dz = localZ - villageCenterZ;
  const distance = Math.hypot(dx, dz);

  const inVillage = distance <= VILLAGE_RADIUS;
  const inVillageBand = distance <= VILLAGE_RADIUS + VILLAGE_FLATTEN_BAND;

  const flattenBlend = inVillageBand
    ? clamp((VILLAGE_RADIUS + VILLAGE_FLATTEN_BAND - distance) / VILLAGE_FLATTEN_BAND, 0, 1)
    : 0;

  const villageBaseHeight = Math.floor(
    TERRAIN_BASE_HEIGHT +
      entry.villageHeightNoise2D(cellX * 0.41, cellZ * 0.41) * (TERRAIN_HILLS_AMPLITUDE * 0.55),
  );

  const isVillageRoad =
    inVillage &&
    (Math.abs(dx) <= VILLAGE_ROAD_HALF_WIDTH || Math.abs(dz) <= VILLAGE_ROAD_HALF_WIDTH);

  return {
    isVillage: inVillage,
    isVillageRoad,
    localX,
    localZ,
    villageCenterX,
    villageCenterZ,
    villageBaseHeight,
    flattenBlend,
  };
}

function getSurfaceProfile(seedStr: string, x: number, z: number): SurfaceProfile {
  const entry = getNoiseCache(seedStr);
  const row = entry.surfaceCache.get(x);
  if (row) {
    const cached = row.get(z);
    if (cached) {
      return cached;
    }
  }

  const baseHeight = getBaseHeight(entry, x, z);
  const riverDepth = getRiverDepth(entry, x, z);
  const village = getVillageShape(entry, x, z);

  let surfaceHeight = baseHeight - riverDepth;
  const isRiver = riverDepth > 0;

  const allowVillage = !isRiver && baseHeight <= TERRAIN_BASE_HEIGHT + 8;
  if (allowVillage && village.flattenBlend > 0) {
    surfaceHeight = Math.round(lerp(surfaceHeight, village.villageBaseHeight, village.flattenBlend));
  }

  const profile = {
    baseHeight,
    surfaceHeight,
    isRiver,
    isVillage: allowVillage && village.isVillage,
    isVillageRoad: allowVillage && village.isVillageRoad,
    localX: village.localX,
    localZ: village.localZ,
    villageCenterX: village.villageCenterX,
    villageCenterZ: village.villageCenterZ,
  };

  if (entry.surfaceCacheSize >= SURFACE_CACHE_LIMIT) {
    const xEntry = entry.surfaceCache.entries().next().value;
    if (xEntry) {
      const [firstX, zMap] = xEntry;
      const firstZ = zMap.keys().next().value;
      if (firstZ !== undefined) {
        zMap.delete(firstZ);
        entry.surfaceCacheSize -= 1;
        if (zMap.size === 0) {
          entry.surfaceCache.delete(firstX);
        }
      }
    }
  }

  let targetRow = entry.surfaceCache.get(x);
  if (!targetRow) {
    targetRow = new Map<number, SurfaceProfile>();
    entry.surfaceCache.set(x, targetRow);
  }

  if (!targetRow.has(z)) {
    entry.surfaceCacheSize += 1;
  }

  targetRow.set(z, profile);
  return profile;
}

function getVillageStructureVoxel(profile: SurfaceProfile, y: number): VoxelId | null {
  if (!profile.isVillage) {
    return null;
  }

  const wallBottom = profile.surfaceHeight + 1;
  const wallTop = profile.surfaceHeight + 3;
  const roofY = profile.surfaceHeight + 4;

  for (const hut of HUT_TEMPLATES) {
    const centerX = profile.villageCenterX + hut.offsetX;
    const centerZ = profile.villageCenterZ + hut.offsetZ;
    const minX = centerX - Math.floor(hut.sizeX / 2);
    const maxX = minX + hut.sizeX - 1;
    const minZ = centerZ - Math.floor(hut.sizeZ / 2);
    const maxZ = minZ + hut.sizeZ - 1;

    const inside =
      profile.localX >= minX &&
      profile.localX <= maxX &&
      profile.localZ >= minZ &&
      profile.localZ <= maxZ;

    if (!inside) {
      continue;
    }

    if (y === profile.surfaceHeight) {
      return VOXEL_STONE;
    }

    if (y > roofY) {
      return VOXEL_AIR;
    }

    if (y === roofY) {
      return VOXEL_DIRT;
    }

    if (y < wallBottom || y > wallTop) {
      continue;
    }

    const onBoundary =
      profile.localX === minX ||
      profile.localX === maxX ||
      profile.localZ === minZ ||
      profile.localZ === maxZ;

    if (!onBoundary) {
      return VOXEL_AIR;
    }

    const doorX = Math.floor((minX + maxX) / 2);
    const doorZ = Math.floor((minZ + maxZ) / 2);
    const isDoor =
      (hut.door === "south" && profile.localZ === maxZ && profile.localX === doorX) ||
      (hut.door === "west" && profile.localX === minX && profile.localZ === doorZ);

    if (isDoor && y <= wallBottom + 1) {
      return VOXEL_AIR;
    }

    return VOXEL_STONE;
  }

  return null;
}

export function getVoxel(seedStr: string, x: number, y: number, z: number): VoxelId {
  const profile = getSurfaceProfile(seedStr, x, z);
  const surfaceHeight = profile.surfaceHeight;

  if (y < surfaceHeight) {
    if (y >= surfaceHeight - DIRT_LAYER_DEPTH) {
      return VOXEL_DIRT;
    }

    return VOXEL_STONE;
  }

  const structureVoxel = getVillageStructureVoxel(profile, y);
  if (structureVoxel !== null) {
    return structureVoxel;
  }

  if (y > surfaceHeight) {
    return VOXEL_AIR;
  }

  if (y === surfaceHeight) {
    if (profile.isRiver) {
      return VOXEL_DIRT;
    }

    if (profile.isVillageRoad) {
      return VOXEL_STONE;
    }

    if (profile.isVillage) {
      return VOXEL_DIRT;
    }

    return VOXEL_GRASS;
  }

  return VOXEL_DIRT;
}

export function getSurfaceHeight(seedStr: string, x: number, z: number): number {
  return getSurfaceProfile(seedStr, x, z).surfaceHeight;
}

export function isSolidTerrainVoxel(seedStr: string, x: number, y: number, z: number): boolean {
  return y <= getSurfaceHeight(seedStr, x, z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
