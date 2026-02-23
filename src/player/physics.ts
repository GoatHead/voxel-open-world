export const PLAYER_RADIUS = 0.35;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const STEP_HEIGHT = 1;

const MOVE_SPEED = 6;
const GROUND_ACCEL = 30;
const AIR_ACCEL = 10;
const GRAVITY = -28;
const JUMP_SPEED = 9;
const JETPACK_ACCEL = 34;
const JETPACK_MAX_RISE_SPEED = 13;
const MAX_FALL_SPEED = -55;
const MAX_SWEEP_STEP = 0.4;
const GROUND_PROBE = 0.05;
const EPSILON = 1e-5;

export type IsSolidFn = (ix: number, iy: number, iz: number) => boolean;

export type PlayerWorld = {
  isSolid: IsSolidFn;
};

export type PlayerState = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  grounded: boolean;
};

export type PlayerInput = {
  moveForward: number;
  moveRight: number;
  jumpPressed: boolean;
  jetpackActive: boolean;
  yawDelta: number;
  pitchDelta: number;
};

type HorizontalMoveResult = {
  x: number;
  y: number;
  z: number;
  blockedX: boolean;
  blockedZ: boolean;
};

export function simulatePlayerStep(
  state: PlayerState,
  input: PlayerInput,
  dt: number,
  world: PlayerWorld,
): PlayerState {
  if (dt <= 0) {
    return state;
  }

  const nextYaw = state.yaw + input.yawDelta;
  const nextPitch = clamp(state.pitch + input.pitchDelta, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  const wish = computeWishDirection(nextYaw, input.moveForward, input.moveRight);
  const accel = state.grounded ? GROUND_ACCEL : AIR_ACCEL;
  const blend = Math.min(1, accel * dt);

  let vx = lerp(state.vx, wish.x * MOVE_SPEED, blend);
  let vz = lerp(state.vz, wish.z * MOVE_SPEED, blend);
  let vy = state.vy;

  if (state.grounded && input.jumpPressed) {
    vy = JUMP_SPEED;
  }

  if (input.jetpackActive) {
    vy = Math.min(JETPACK_MAX_RISE_SPEED, vy + JETPACK_ACCEL * dt);
  }

  vy = Math.max(MAX_FALL_SPEED, vy + GRAVITY * dt);

  const horizontal = moveHorizontalWithStep(
    { x: state.x, y: state.y, z: state.z },
    vx * dt,
    vz * dt,
    world.isSolid,
    state.grounded,
  );

  if (horizontal.blockedX) {
    vx = 0;
  }

  if (horizontal.blockedZ) {
    vz = 0;
  }

  const vertical = moveVertical(horizontal.x, horizontal.y, horizontal.z, vy * dt, world.isSolid);

  if (vertical.blocked) {
    vy = 0;
  }

  const grounded =
    vertical.hitGround ||
    (vy <= 0 &&
      !collidesCylinder(vertical.x, vertical.y, vertical.z, world.isSolid) &&
      collidesCylinder(vertical.x, vertical.y - GROUND_PROBE, vertical.z, world.isSolid));

  return {
    x: vertical.x,
    y: vertical.y,
    z: vertical.z,
    vx,
    vy,
    vz,
    yaw: nextYaw,
    pitch: nextPitch,
    grounded,
  };
}

function moveHorizontalWithStep(
  position: { x: number; y: number; z: number },
  dx: number,
  dz: number,
  isSolid: IsSolidFn,
  allowStepUp: boolean,
): HorizontalMoveResult {
  let x = position.x;
  let y = position.y;
  let z = position.z;
  let blockedX = false;
  let blockedZ = false;

  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / MAX_SWEEP_STEP));
  const stepDx = dx / steps;
  const stepDz = dz / steps;

  for (let i = 0; i < steps; i += 1) {
    if (stepDx !== 0) {
      const xResult = moveAxisWithStep(x, y, z, stepDx, "x", isSolid, allowStepUp);
      x = xResult.x;
      y = xResult.y;
      z = xResult.z;
      blockedX = blockedX || xResult.blocked;
    }

    if (stepDz !== 0) {
      const zResult = moveAxisWithStep(x, y, z, stepDz, "z", isSolid, allowStepUp);
      x = zResult.x;
      y = zResult.y;
      z = zResult.z;
      blockedZ = blockedZ || zResult.blocked;
    }
  }

  return { x, y, z, blockedX, blockedZ };
}

function moveAxisWithStep(
  x: number,
  y: number,
  z: number,
  delta: number,
  axis: "x" | "z",
  isSolid: IsSolidFn,
  allowStepUp: boolean,
): { x: number; y: number; z: number; blocked: boolean } {
  const candidateX = axis === "x" ? x + delta : x;
  const candidateZ = axis === "z" ? z + delta : z;

  if (!collidesCylinder(candidateX, y, candidateZ, isSolid)) {
    return { x: candidateX, y, z: candidateZ, blocked: false };
  }

  if (!allowStepUp) {
    return { x, y, z, blocked: true };
  }

  const liftSteps = Math.max(1, Math.ceil(STEP_HEIGHT / 0.1));
  for (let i = 1; i <= liftSteps; i += 1) {
    const lift = (STEP_HEIGHT * i) / liftSteps;
    const liftedY = y + lift;

    if (collidesCylinder(x, liftedY, z, isSolid)) {
      continue;
    }

    if (!collidesCylinder(candidateX, liftedY, candidateZ, isSolid)) {
      const groundedAfterStep = collidesCylinder(candidateX, liftedY - GROUND_PROBE, candidateZ, isSolid);

      if (groundedAfterStep) {
        return { x: candidateX, y: liftedY, z: candidateZ, blocked: false };
      }
    }
  }

  return { x, y, z, blocked: true };
}

function moveVertical(
  startX: number,
  startY: number,
  startZ: number,
  dy: number,
  isSolid: IsSolidFn,
): { x: number; y: number; z: number; blocked: boolean; hitGround: boolean } {
  if (dy === 0) {
    return { x: startX, y: startY, z: startZ, blocked: false, hitGround: false };
  }

  let y = startY;
  const steps = Math.max(1, Math.ceil(Math.abs(dy) / MAX_SWEEP_STEP));
  const stepDy = dy / steps;
  const movingDown = stepDy < 0;

  for (let i = 0; i < steps; i += 1) {
    const nextY = y + stepDy;

    if (!collidesCylinder(startX, nextY, startZ, isSolid)) {
      y = nextY;
      continue;
    }

    if (movingDown) {
      y = resolveDownContactY(startX, y, startZ, isSolid);
    }

    return { x: startX, y, z: startZ, blocked: true, hitGround: movingDown };
  }

  return { x: startX, y, z: startZ, blocked: false, hitGround: false };
}

function resolveDownContactY(x: number, y: number, z: number, isSolid: IsSolidFn): number {
  const minIx = Math.floor(x - PLAYER_RADIUS - 1);
  const maxIx = Math.floor(x + PLAYER_RADIUS + 1);
  const minIz = Math.floor(z - PLAYER_RADIUS - 1);
  const maxIz = Math.floor(z + PLAYER_RADIUS + 1);
  const minIy = Math.floor(y - STEP_HEIGHT - 2);
  const maxIy = Math.floor(y + 1);

  let best = Number.NEGATIVE_INFINITY;

  for (let iy = minIy; iy <= maxIy; iy += 1) {
    const blockTop = iy + 1;
    if (blockTop > y + EPSILON) {
      continue;
    }

    for (let ix = minIx; ix <= maxIx; ix += 1) {
      for (let iz = minIz; iz <= maxIz; iz += 1) {
        if (!isSolid(ix, iy, iz)) {
          continue;
        }

        const closestX = clamp(x, ix, ix + 1);
        const closestZ = clamp(z, iz, iz + 1);
        const dx = x - closestX;
        const dz = z - closestZ;

        if (dx * dx + dz * dz <= PLAYER_RADIUS * PLAYER_RADIUS + EPSILON) {
          best = Math.max(best, blockTop);
        }
      }
    }
  }

  if (best === Number.NEGATIVE_INFINITY) {
    return y;
  }

  return best + EPSILON;
}

function collidesCylinder(x: number, y: number, z: number, isSolid: IsSolidFn): boolean {
  const minX = Math.floor(x - PLAYER_RADIUS);
  const maxX = Math.floor(x + PLAYER_RADIUS);
  const minZ = Math.floor(z - PLAYER_RADIUS);
  const maxZ = Math.floor(z + PLAYER_RADIUS);
  const minY = Math.floor(y);
  const maxY = Math.floor(y + PLAYER_HEIGHT - EPSILON);

  for (let iy = minY; iy <= maxY; iy += 1) {
    const voxelMinY = iy;
    const voxelMaxY = iy + 1;

    if (y + PLAYER_HEIGHT <= voxelMinY + EPSILON || y >= voxelMaxY - EPSILON) {
      continue;
    }

    for (let ix = minX; ix <= maxX; ix += 1) {
      for (let iz = minZ; iz <= maxZ; iz += 1) {
        if (!isSolid(ix, iy, iz)) {
          continue;
        }

        const closestX = clamp(x, ix, ix + 1);
        const closestZ = clamp(z, iz, iz + 1);
        const dx = x - closestX;
        const dz = z - closestZ;

        if (dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS - EPSILON) {
          return true;
        }
      }
    }
  }

  return false;
}

function computeWishDirection(yaw: number, moveForward: number, moveRight: number): { x: number; z: number } {
  const forwardX = Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = Math.sin(yaw);

  const rawX = rightX * moveRight + forwardX * moveForward;
  const rawZ = rightZ * moveRight + forwardZ * moveForward;
  const length = Math.hypot(rawX, rawZ);

  if (length <= EPSILON) {
    return { x: 0, z: 0 };
  }

  return { x: rawX / length, z: rawZ / length };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
