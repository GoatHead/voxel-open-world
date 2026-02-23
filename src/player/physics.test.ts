import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS, simulatePlayerStep, type IsSolidFn, type PlayerInput, type PlayerState } from "./physics";

const DT = 1 / 60;

function runSteps(
  initial: PlayerState,
  frames: number,
  isSolid: IsSolidFn,
  inputFactory: (frame: number) => PlayerInput,
): PlayerState {
  let state = initial;

  for (let frame = 0; frame < frames; frame += 1) {
    state = simulatePlayerStep(state, inputFactory(frame), DT, { isSolid });
  }

  return state;
}

function defaultInput(): PlayerInput {
  return {
    moveForward: 0,
    moveRight: 0,
    jumpPressed: false,
    jetpackActive: false,
    yawDelta: 0,
    pitchDelta: 0,
  };
}

describe("simulatePlayerStep", () => {
  it("player settles on ground", () => {
    const isSolid: IsSolidFn = (_ix, iy, _iz) => iy === 0;

    const end = runSteps(
      {
        x: 0,
        y: 7,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 0,
        pitch: 0,
        grounded: false,
      },
      300,
      isSolid,
      () => defaultInput(),
    );

    expect(end.grounded).toBe(true);
    expect(end.y).toBeGreaterThanOrEqual(1);
    expect(end.y).toBeLessThanOrEqual(1.02);
  });

  it("cannot pass through wall", () => {
    const isSolid: IsSolidFn = (ix, iy, iz) => {
      if (iy === 0) {
        return true;
      }

      return iy >= 1 && iy <= 3 && iz === -2 && ix >= -3 && ix <= 3;
    };

    const end = runSteps(
      {
        x: 0,
        y: 1.001,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 0,
        pitch: 0,
        grounded: true,
      },
      180,
      isSolid,
      () => ({
        ...defaultInput(),
        moveForward: 1,
      }),
    );

    expect(end.z).toBeGreaterThan(-1 + PLAYER_RADIUS - 0.05);
    expect(end.vz).toBe(0);
  });

  it("step-up: succeeds for 1-block and fails for 2-block", () => {
    const oneBlockLedge: IsSolidFn = (ix, iy, iz) => {
      if (iy === 0) {
        return true;
      }

      return iy === 1 && iz <= -2 && ix >= -4 && ix <= 4;
    };

    const twoBlockLedge: IsSolidFn = (ix, iy, iz) => {
      if (iy === 0) {
        return true;
      }

      return iy >= 1 && iy <= 2 && iz <= -2 && ix >= -4 && ix <= 4;
    };

    const start: PlayerState = {
      x: 0,
      y: 1.001,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      grounded: true,
    };

    const climbed = runSteps(
      start,
      240,
      oneBlockLedge,
      () => ({
        ...defaultInput(),
        moveForward: 1,
      }),
    );

    expect(climbed.y).toBeGreaterThan(1.5);
    expect(climbed.z).toBeLessThan(-1.5);

    const blocked = runSteps(
      start,
      240,
      twoBlockLedge,
      () => ({
        ...defaultInput(),
        moveForward: 1,
      }),
    );

    expect(blocked.y).toBeLessThan(1.2);
    expect(blocked.z).toBeGreaterThan(-1 + PLAYER_RADIUS - 0.05);
  });

  it("does not float upward or drop while pushing into a tall wall", () => {
    const isSolid: IsSolidFn = (ix, iy, iz) => {
      if (iy === 0) {
        return true;
      }

      return iy >= 1 && iy <= 8 && iz === -2 && ix >= -4 && ix <= 4;
    };

    const start: PlayerState = {
      x: 0,
      y: 1.001,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      grounded: true,
    };

    const end = runSteps(
      start,
      220,
      isSolid,
      () => ({
        ...defaultInput(),
        moveForward: 1,
      }),
    );

    expect(end.z).toBeGreaterThan(-1 + PLAYER_RADIUS - 0.05);
    expect(end.y).toBeGreaterThanOrEqual(0.98);
    expect(end.y).toBeLessThanOrEqual(1.12);
    expect(end.grounded).toBe(true);
  });

  it("jetpack lifts while holding space", () => {
    const isSolid: IsSolidFn = (_ix, iy, _iz) => iy === 0;

    const start: PlayerState = {
      x: 0,
      y: 1.001,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      grounded: true,
    };

    const end = runSteps(
      start,
      90,
      isSolid,
      () => ({
        ...defaultInput(),
        jetpackActive: true,
      }),
    );

    expect(end.y).toBeGreaterThan(4);
    expect(end.vy).toBeGreaterThan(0);
  });
});
