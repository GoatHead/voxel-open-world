import {
  VOXEL_AIR,
  VOXEL_DIRT,
  VOXEL_GRASS,
  VOXEL_STONE,
  type VoxelId,
} from "../world/getVoxel";

export type PaddedChunkDims = {
  x: number;
  y: number;
  z: number;
};

export type GreedyMeshPayload = {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  quadCount: number;
  indexCount: number;
};

const AXIS_U: readonly [1, 2, 0] = [1, 2, 0];
const AXIS_V: readonly [2, 0, 1] = [2, 0, 1];

function colorForVoxel(id: VoxelId): readonly [number, number, number] {
  switch (id) {
    case VOXEL_GRASS:
      return [0.36, 0.72, 0.31];
    case VOXEL_DIRT:
      return [0.49, 0.35, 0.22];
    case VOXEL_STONE:
      return [0.56, 0.56, 0.58];
    case VOXEL_AIR:
    default:
      return [0, 0, 0];
  }
}

export function indexOfPadded(px: number, py: number, pz: number, dims: PaddedChunkDims): number {
  return py * dims.x * dims.z + pz * dims.x + px;
}

export function greedyMesh(voxels: Uint8Array, dims: PaddedChunkDims): GreedyMeshPayload {
  if (dims.x < 3 || dims.y < 3 || dims.z < 3) {
    throw new Error("greedyMesh requires padded dimensions >= 3 on all axes");
  }

  const inner = [dims.x - 2, dims.y - 2, dims.z - 2] as const;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let quadCount = 0;

  const sample = (lx: number, ly: number, lz: number): VoxelId => {
    const px = lx + 1;
    const py = ly + 1;
    const pz = lz + 1;

    if (px < 0 || py < 0 || pz < 0 || px >= dims.x || py >= dims.y || pz >= dims.z) {
      return VOXEL_AIR;
    }

    return voxels[indexOfPadded(px, py, pz, dims)] as VoxelId;
  };

  const pushVertex = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    r: number,
    g: number,
    b: number,
  ): void => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    colors.push(r, g, b);
  };

  const emitQuad = (
    d: 0 | 1 | 2,
    w: number,
    u: number,
    v: number,
    width: number,
    height: number,
    normalSign: 1 | -1,
    voxelId: VoxelId,
  ): void => {
    let x0 = 0;
    let y0 = 0;
    let z0 = 0;

    let dux = 0;
    let duy = 0;
    let duz = 0;

    let dvx = 0;
    let dvy = 0;
    let dvz = 0;

    if (d === 0) {
      x0 = w;
      y0 = u;
      z0 = v;
      duy = width;
      dvz = height;
    } else if (d === 1) {
      x0 = v;
      y0 = w;
      z0 = u;
      duz = width;
      dvx = height;
    } else {
      x0 = u;
      y0 = v;
      z0 = w;
      dux = width;
      dvy = height;
    }

    const nx = d === 0 ? normalSign : 0;
    const ny = d === 1 ? normalSign : 0;
    const nz = d === 2 ? normalSign : 0;

    const [r, g, b] = colorForVoxel(voxelId);
    const base = positions.length / 3;

    pushVertex(x0, y0, z0, nx, ny, nz, r, g, b);
    pushVertex(x0 + dux, y0 + duy, z0 + duz, nx, ny, nz, r, g, b);
    pushVertex(
      x0 + dux + dvx,
      y0 + duy + dvy,
      z0 + duz + dvz,
      nx,
      ny,
      nz,
      r,
      g,
      b,
    );
    pushVertex(x0 + dvx, y0 + dvy, z0 + dvz, nx, ny, nz, r, g, b);

    if (normalSign > 0) {
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    } else {
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }

    quadCount += 1;
  };

  for (let d: 0 | 1 | 2 = 0; d < 3; d = (d + 1) as 0 | 1 | 2) {
    const uAxis = AXIS_U[d];
    const vAxis = AXIS_V[d];

    const sizeD = inner[d];
    const sizeU = inner[uAxis];
    const sizeV = inner[vAxis];
    const mask = new Int32Array(sizeU * sizeV);

    for (let w = 0; w <= sizeD; w += 1) {
      let maskIndex = 0;

      for (let v = 0; v < sizeV; v += 1) {
        for (let u = 0; u < sizeU; u += 1) {
          let ax = 0;
          let ay = 0;
          let az = 0;

          let bx = 0;
          let by = 0;
          let bz = 0;

          if (d === 0) {
            ax = w - 1;
            ay = u;
            az = v;
            bx = w;
            by = u;
            bz = v;
          } else if (d === 1) {
            ax = v;
            ay = w - 1;
            az = u;
            bx = v;
            by = w;
            bz = u;
          } else {
            ax = u;
            ay = v;
            az = w - 1;
            bx = u;
            by = v;
            bz = w;
          }

          const a = sample(ax, ay, az);
          const b = sample(bx, by, bz);
          const aSolid = a !== VOXEL_AIR;
          const bSolid = b !== VOXEL_AIR;

          if (aSolid === bSolid) {
            mask[maskIndex] = 0;
          } else if (aSolid) {
            mask[maskIndex] = a;
          } else {
            mask[maskIndex] = -b;
          }

          maskIndex += 1;
        }
      }

      for (let v = 0; v < sizeV; v += 1) {
        let u = 0;

        while (u < sizeU) {
          const start = v * sizeU + u;
          const signedVoxel = mask[start];

          if (signedVoxel === 0) {
            u += 1;
            continue;
          }

          let width = 1;
          while (u + width < sizeU && mask[start + width] === signedVoxel) {
            width += 1;
          }

          let height = 1;
          let canGrow = true;

          while (v + height < sizeV && canGrow) {
            const rowStart = (v + height) * sizeU + u;

            for (let k = 0; k < width; k += 1) {
              if (mask[rowStart + k] !== signedVoxel) {
                canGrow = false;
                break;
              }
            }

            if (canGrow) {
              height += 1;
            }
          }

          const normalSign = signedVoxel > 0 ? 1 : -1;
          const voxelId = Math.abs(signedVoxel) as VoxelId;
          emitQuad(d, w, u, v, width, height, normalSign, voxelId);

          for (let y = 0; y < height; y += 1) {
            const rowStart = (v + y) * sizeU + u;
            for (let x = 0; x < width; x += 1) {
              mask[rowStart + x] = 0;
            }
          }

          u += width;
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
    quadCount,
    indexCount: indices.length,
  };
}
