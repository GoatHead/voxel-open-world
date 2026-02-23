import { PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

import { EYE_HEIGHT, simulatePlayerStep, type IsSolidFn, type PlayerInput, type PlayerState } from "./physics";

type FpsControllerProps = {
  isSolid: IsSolidFn;
  onPlayerPositionChange: (x: number, z: number) => void;
  onShootVoxel: (x: number, y: number, z: number) => void;
};

type KeyState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
};

const forwardVector = new THREE.Vector3(0, 0, -1);

export function FpsController({
  isSolid,
  onPlayerPositionChange,
  onShootVoxel,
}: FpsControllerProps) {
  const camera = useThree((state) => state.camera);
  const lookForwardRef = useRef(new THREE.Vector3());
  const shootDirectionRef = useRef(new THREE.Vector3());
  const gunDirRef = useRef(new THREE.Vector3());
  const gunRightRef = useRef(new THREE.Vector3());
  const gunDownRef = useRef(new THREE.Vector3());
  const solidCacheRef = useRef<Map<number, boolean>>(new Map());
  const keyStateRef = useRef<KeyState>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
  });
  const playerStateRef = useRef<PlayerState | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      switch (event.code) {
        case "KeyW":
          keyStateRef.current.forward = true;
          event.preventDefault();
          break;
        case "KeyS":
          keyStateRef.current.backward = true;
          event.preventDefault();
          break;
        case "KeyA":
          keyStateRef.current.left = true;
          event.preventDefault();
          break;
        case "KeyD":
          keyStateRef.current.right = true;
          event.preventDefault();
          break;
        case "Space":
          keyStateRef.current.jump = true;
          event.preventDefault();
          break;
        default:
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case "KeyW":
          keyStateRef.current.forward = false;
          event.preventDefault();
          break;
        case "KeyS":
          keyStateRef.current.backward = false;
          event.preventDefault();
          break;
        case "KeyA":
          keyStateRef.current.left = false;
          event.preventDefault();
          break;
        case "KeyD":
          keyStateRef.current.right = false;
          event.preventDefault();
          break;
        case "Space":
          keyStateRef.current.jump = false;
          event.preventDefault();
          break;
        default:
          break;
      }
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      if (document.pointerLockElement === null) {
        return;
      }

      const hit = raycastVoxel(camera.position, camera.getWorldDirection(shootDirectionRef.current), isSolid, 9);
      if (hit) {
        onShootVoxel(hit.x, hit.y, hit.z);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousedown", onMouseDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [camera, isSolid, onShootVoxel]);

  useFrame((_frameState, delta) => {
    const dt = Math.min(delta, 1 / 20);

    const current = playerStateRef.current ?? createInitialPlayerState(camera, lookForwardRef.current);
    const look = getLookAngles(camera, lookForwardRef.current);

    const solidCache = solidCacheRef.current;
    const cachedIsSolid: IsSolidFn = (ix, iy, iz) => {
      const key = (ix * 73856093 ^ iy * 19349669 ^ iz * 83492791) | 0;
      const cached = solidCache.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const next = isSolid(ix, iy, iz);
      if (solidCache.size > 80_000) {
        solidCache.clear();
      }
      solidCache.set(key, next);
      return next;
    };

    const input: PlayerInput = {
      moveForward: Number(keyStateRef.current.forward) - Number(keyStateRef.current.backward),
      moveRight: Number(keyStateRef.current.right) - Number(keyStateRef.current.left),
      jumpPressed: keyStateRef.current.jump,
      jetpackActive: keyStateRef.current.jump,
      yawDelta: normalizeAngle(look.yaw - current.yaw),
      pitchDelta: look.pitch - current.pitch,
    };

    const next = simulatePlayerStep(current, input, dt, { isSolid: cachedIsSolid });
    playerStateRef.current = next;

    camera.position.set(next.x, next.y + EYE_HEIGHT, next.z);
    onPlayerPositionChange(next.x, next.z);
  });

  return (
    <>
      <PointerLockControls />
      <GunViewModel
        camera={camera}
        directionRef={gunDirRef}
        rightRef={gunRightRef}
        downRef={gunDownRef}
      />
    </>
  );
}

function GunViewModel({
  camera,
  directionRef,
  rightRef,
  downRef,
}: {
  camera: THREE.Camera;
  directionRef: MutableRefObject<THREE.Vector3>;
  rightRef: MutableRefObject<THREE.Vector3>;
  downRef: MutableRefObject<THREE.Vector3>;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) {
      return;
    }

    const dir = camera.getWorldDirection(directionRef.current);
    const right = rightRef.current.crossVectors(dir, camera.up).normalize();
    const down = downRef.current.crossVectors(right, dir).normalize();

    groupRef.current.position.copy(camera.position)
      .addScaledVector(dir, 0.52)
      .addScaledVector(right, 0.24)
      .addScaledVector(down, -0.2);
    groupRef.current.quaternion.copy(camera.quaternion);
  });

  const bodyMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3b4353", roughness: 0.55, metalness: 0.45 }), []);
  const detailMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#15181f", roughness: 0.45, metalness: 0.78 }), []);

  useEffect(() => {
    return () => {
      bodyMaterial.dispose();
      detailMaterial.dispose();
    };
  }, [bodyMaterial, detailMaterial]);

  return (
    <group ref={groupRef}>
      <mesh material={bodyMaterial} position={[0, -0.1, -0.2]}>
        <boxGeometry args={[0.16, 0.12, 0.5]} />
      </mesh>
      <mesh material={detailMaterial} position={[0, -0.06, 0.05]}>
        <boxGeometry args={[0.07, 0.12, 0.16]} />
      </mesh>
      <mesh material={detailMaterial} position={[0, -0.1, -0.48]}>
        <cylinderGeometry args={[0.028, 0.028, 0.48, 10]} />
      </mesh>
    </group>
  );
}

function createInitialPlayerState(camera: THREE.Camera, forward: THREE.Vector3): PlayerState {
  const look = getLookAngles(camera, forward);
  return {
    x: camera.position.x,
    y: camera.position.y - EYE_HEIGHT,
    z: camera.position.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: look.yaw,
    pitch: look.pitch,
    grounded: false,
  };
}

function getLookAngles(camera: THREE.Camera, forward: THREE.Vector3): { yaw: number; pitch: number } {
  const worldForward = forward.copy(forwardVector).applyQuaternion(camera.quaternion).normalize();
  return {
    yaw: Math.atan2(worldForward.x, -worldForward.z),
    pitch: Math.asin(clamp(worldForward.y, -1, 1)),
  };
}

function raycastVoxel(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  isSolid: IsSolidFn,
  maxDistance: number,
): { x: number; y: number; z: number } | null {
  const dir = direction;
  const step = 0.16;

  for (let t = 0; t <= maxDistance; t += step) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);

    if (isSolid(ix, iy, iz)) {
      return { x: ix, y: iy, z: iz };
    }
  }

  return null;
}

function normalizeAngle(angle: number): number {
  const wrapped = (angle + Math.PI) % (Math.PI * 2);
  return wrapped >= 0 ? wrapped - Math.PI : wrapped + Math.PI;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
