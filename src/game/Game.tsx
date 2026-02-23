import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react"

import * as THREE from "three"

import { ChunkManager, type ChunkManagerStats } from "../engine/chunkManager"
import { worldToChunk } from "../lib/chunkMath"
import { seedToInt } from "../lib/seed"
import { FpsController } from "../player/FpsController"
import type { IsSolidFn } from "../player/physics"
import type { MeshWorkerResponse } from "../workers/mesh.worker"
import { getRequestTransferables, type MeshWorkerRequest } from "../workers/mesh.worker"
import { CHUNK_SIZE } from "../world/chunkConstants"
import {
  addDestroyedVoxel,
  clearDestroyedVoxelIndex,
  createDestroyedVoxelIndex,
  hasDestroyedVoxel,
} from "../world/destroyedVoxels"
import { isSolidTerrainVoxel } from "../world/getVoxel"
import { ChunkMesh } from "./ChunkMesh"
import type { ShaderSettings } from "./shaderSettings"
import type { ChunkMeshPayload } from "./types"

const FOG_NEAR = 28
const FOG_FAR = 72
const CHUNK_CULL_DISTANCE = FOG_FAR + CHUNK_SIZE * 0.5
const CHUNK_CULL_INTERVAL = 0.22
const CHUNK_VIEW_DOT_MIN = 0.15
const FOG_COLOR = new THREE.Color("#0b1020")
const IMPACT_TTL_MS = 220
const IMPACT_MAX = 64
const MAX_WORKER_RESPONSES_PER_FRAME = 1
const MAX_FORCE_APPLY_RESPONSES_PER_FRAME = 1
const MAX_PENDING_WORKER_RESPONSES = 96
const MAX_PENDING_FORCE_APPLY_RESPONSES = 96
const CHUNK_REQUEST_INTERVAL = 0.08
const CHUNK_APPLY_INTERVAL = 0.08

const vertexShader = `
precision highp float;

varying vec3 vColor;
varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;
varying float vFogDepth;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  vColor = color;
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  vFogDepth = -mvPosition.z;

  gl_Position = projectionMatrix * mvPosition;
}
`

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform float uBanding;
uniform float uAmbient;
uniform float uSunlight;
uniform float uContrast;
uniform float uSaturation;
uniform float uRim;
uniform float uRayTracing;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying vec3 vColor;
varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;
varying float vFogDepth;

vec3 applySaturation(vec3 rgb, float saturation) {
  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(luma), rgb, saturation);
}

float terrainHeightApprox(vec2 p) {
  float broad = sin(p.x * 0.018) * 3.0 + cos(p.y * 0.016) * 2.6;
  float detail = sin((p.x + p.y) * 0.052) * 1.4 + cos((p.x - p.y) * 0.047) * 1.1;
  return 20.0 + broad + detail;
}

float rayTraceApprox(vec3 origin, vec3 direction) {
  float t = 0.6;
  for (int i = 0; i < 6; i++) {
    vec3 samplePos = origin + direction * t;
    float terrainY = terrainHeightApprox(samplePos.xz);
    if (samplePos.y <= terrainY + 0.6) {
      return 1.0 - float(i) / 6.0;
    }
    t += 2.6;
  }
  return 0.0;
}

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDir = normalize(vViewDir);
  vec3 lightDir = normalize(vec3(0.45, 1.0, 0.35));

  float ndl = max(dot(normal, lightDir), 0.0);
  float bands = max(uBanding, 1.0);
  float stepped = floor(ndl * bands) / bands;
  float shade = uAmbient + stepped * uSunlight;

  vec3 color = vColor * shade;
  color = applySaturation(color, uSaturation);
  color = (color - 0.5) * uContrast + 0.5;

  float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0) * uRim;
  color += vec3(rim * 0.24);

  if (uRayTracing > 0.5) {
    vec3 reflected = normalize(reflect(-viewDir, normal));
    float reflectionHit = rayTraceApprox(vWorldPos + normal * 0.35, reflected);
    float shadowHit = rayTraceApprox(vWorldPos + normal * 0.25, -lightDir);

    color += vec3(0.22, 0.3, 0.42) * reflectionHit * 0.32;
    color *= (1.0 - 0.25 * shadowHit);
  }

  float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
  color = mix(color, uFogColor, fogFactor);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

type GameProps = {
  seedStr: string
  shaderEnabled: boolean
  rayTracingEnabled: boolean
  onChunkCountChange?: (count: number) => void
  onChunkStatsChange?: (stats: ChunkManagerStats) => void
  onFpsChange?: (fps: number) => void
  shaderSettings: ShaderSettings
}

type SceneContentsProps = {
  seedStr: string
  shaderEnabled: boolean
  rayTracingEnabled: boolean
  chunks: Map<string, ChunkMeshPayload>
  setChunks: Dispatch<SetStateAction<Map<string, ChunkMeshPayload>>>
  impactsRef: MutableRefObject<ShotImpact[]>
  playerPositionRef: MutableRefObject<{ x: number; z: number }>
  workerRef: MutableRefObject<Worker | null>
  chunkManagerRef: MutableRefObject<ChunkManager>
  workerResponsesRef: MutableRefObject<MeshWorkerResponse[]>
  forceApplyResponsesRef: MutableRefObject<MeshWorkerResponse[]>
  isSolidAtVoxel: IsSolidFn
  onShootVoxel: (x: number, y: number, z: number) => void
  onChunkStatsChange?: (stats: ChunkManagerStats) => void
  onFpsChange?: (fps: number) => void
  shaderSettings: ShaderSettings
}

type ShotImpact = {
  x: number
  y: number
  z: number
  expiresAt: number
}

function SceneContents({
  seedStr,
  shaderEnabled,
  chunks,
  setChunks,
  impactsRef,
  playerPositionRef,
  workerRef,
  chunkManagerRef,
  workerResponsesRef,
  forceApplyResponsesRef,
  isSolidAtVoxel,
  onShootVoxel,
  onChunkStatsChange,
  onFpsChange,
  shaderSettings,
  rayTracingEnabled,
}: SceneContentsProps) {
  const camera = useThree((state) => state.camera)
  const previousStatsRef = useRef<ChunkManagerStats | null>(null)
  const materialRef = useRef<THREE.ShaderMaterial | null>(null)
  const cullTimerRef = useRef(0)
  const requestTimerRef = useRef(0)
  const applyTimerRef = useRef(0)
  const viewDirectionRef = useRef(new THREE.Vector3())
  const chunkToCameraRef = useRef(new THREE.Vector3())
  const impactMeshRef = useRef<THREE.InstancedMesh | null>(null)
  const impactDummyRef = useRef(new THREE.Object3D())
  const prevImpactCountRef = useRef(0)
  const fpsFrameCountRef = useRef(0)
  const fpsLastTickRef = useRef(performance.now())
  const [visibleChunkKeys, setVisibleChunkKeys] = useState<Set<string>>(new Set())
  const material = useMemo(
    () => {
      if (!shaderEnabled) {
        materialRef.current = null
        return new THREE.MeshStandardMaterial({
          vertexColors: true,
        })
      }

      const next = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        vertexColors: true,
        uniforms: {
          uTime: { value: 0 },
          uBanding: { value: shaderSettings.banding },
          uAmbient: { value: shaderSettings.ambient },
          uSunlight: { value: shaderSettings.sunlight },
          uContrast: { value: shaderSettings.contrast },
          uSaturation: { value: shaderSettings.saturation },
          uRim: { value: shaderSettings.rim },
          uRayTracing: { value: rayTracingEnabled ? 1 : 0 },
          uFogColor: { value: FOG_COLOR.clone() },
          uFogNear: { value: FOG_NEAR },
          uFogFar: { value: FOG_FAR },
        },
      })

      materialRef.current = next
      return next
    },
    [rayTracingEnabled, shaderEnabled, shaderSettings.ambient, shaderSettings.banding, shaderSettings.contrast, shaderSettings.rim, shaderSettings.saturation, shaderSettings.sunlight],
  )

  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  useEffect(() => {
    if (!(material instanceof THREE.ShaderMaterial)) {
      return
    }

    material.uniforms.uBanding.value = shaderSettings.banding
    material.uniforms.uAmbient.value = shaderSettings.ambient
    material.uniforms.uSunlight.value = shaderSettings.sunlight
    material.uniforms.uContrast.value = shaderSettings.contrast
    material.uniforms.uSaturation.value = shaderSettings.saturation
    material.uniforms.uRim.value = shaderSettings.rim
    material.uniforms.uRayTracing.value = rayTracingEnabled ? 1 : 0
  }, [material, rayTracingEnabled, shaderSettings.ambient, shaderSettings.banding, shaderSettings.contrast, shaderSettings.rim, shaderSettings.saturation, shaderSettings.sunlight])

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta
    }

    if (onFpsChange) {
      fpsFrameCountRef.current += 1
      const now = performance.now()
      const elapsed = now - fpsLastTickRef.current

      if (elapsed >= 1000) {
        onFpsChange(Math.round((fpsFrameCountRef.current * 1000) / elapsed))
        fpsFrameCountRef.current = 0
        fpsLastTickRef.current = now
      }
    }

    const workerResponses = dequeueBatch(workerResponsesRef.current, MAX_WORKER_RESPONSES_PER_FRAME)
    const forceApplyResponses = dequeueBatch(forceApplyResponsesRef.current, MAX_FORCE_APPLY_RESPONSES_PER_FRAME)
    const playerPosition = playerPositionRef.current
    requestTimerRef.current += delta
    applyTimerRef.current += delta
    const allowRequest = requestTimerRef.current >= CHUNK_REQUEST_INTERVAL
    const allowApply = applyTimerRef.current >= CHUNK_APPLY_INTERVAL

    if (allowRequest) {
      requestTimerRef.current = 0
    }

    if (allowApply) {
      applyTimerRef.current = 0
    }

    const { request, apply, unloadKeys } = chunkManagerRef.current.tick({
      playerX: playerPosition.x,
      playerZ: playerPosition.z,
      seedStr,
      workerResponses: workerResponses.length > 0 ? workerResponses : undefined,
      allowRequest,
      allowApply,
    })

    if (forceApplyResponses.length > 0) {
      setChunks((previous) => {
        const next = new Map(previous)
        let changed = false

        for (const response of forceApplyResponses) {
          next.set(response.key, response)
          changed = true
        }

        return changed ? next : previous
      })
    }

    if (onChunkStatsChange) {
      const nextStats = chunkManagerRef.current.getStats()
      const previousStats = previousStatsRef.current

      if (
        !previousStats ||
        previousStats.loaded !== nextStats.loaded ||
        previousStats.queued !== nextStats.queued ||
        previousStats.inflight !== nextStats.inflight ||
        previousStats.ready !== nextStats.ready
      ) {
        previousStatsRef.current = nextStats
        onChunkStatsChange(nextStats)
      }
    }

    if (request) {
      const enriched: MeshWorkerRequest = {
        ...request,
        forceApply: false,
      }

      workerRef.current?.postMessage(enriched, getRequestTransferables(enriched))
    }

    if (apply || unloadKeys.length > 0) {
      setChunks((previous) => {
        let changed = false
        const next = new Map(previous)

        if (apply) {
          next.set(apply.key, apply)
          changed = true
        }

        for (const key of unloadKeys) {
          changed = next.delete(key) || changed
        }

        return changed ? next : previous
      })
    }

    cullTimerRef.current += delta

    if (cullTimerRef.current >= CHUNK_CULL_INTERVAL) {
      cullTimerRef.current = 0

      const dir = camera.getWorldDirection(viewDirectionRef.current)
      const visible = new Set<string>()
      const maxDistance = rayTracingEnabled ? CHUNK_CULL_DISTANCE * 0.82 : CHUNK_CULL_DISTANCE
      const maxDistSq = maxDistance * maxDistance

      for (const payload of chunks.values()) {
        const centerX = payload.cx * CHUNK_SIZE + CHUNK_SIZE * 0.5
        const centerZ = payload.cz * CHUNK_SIZE + CHUNK_SIZE * 0.5
        const toChunk = chunkToCameraRef.current.set(
          centerX - camera.position.x,
          0,
          centerZ - camera.position.z,
        )

        const distSq = toChunk.lengthSq()
        if (distSq > maxDistSq) {
          continue
        }

        if (distSq < (CHUNK_SIZE * CHUNK_SIZE * 2.5)) {
          visible.add(payload.key)
          continue
        }

        toChunk.normalize()
        const facing = dir.x * toChunk.x + dir.z * toChunk.z
        if (facing >= CHUNK_VIEW_DOT_MIN) {
          visible.add(payload.key)
        }
      }

      setVisibleChunkKeys((previous) => {
        if (previous.size === visible.size) {
          let same = true
          for (const key of visible) {
            if (!previous.has(key)) {
              same = false
              break
            }
          }

          if (same) {
            return previous
          }
        }

        return visible
      })
    }

    const impactMesh = impactMeshRef.current
    if (impactMesh) {
      const now = performance.now()
      const impacts = impactsRef.current

      let writeIndex = 0
      for (let i = 0; i < impacts.length; i += 1) {
        const impact = impacts[i]
        if (impact.expiresAt <= now) {
          continue
        }

        if (writeIndex !== i) {
          impacts[writeIndex] = impact
        }

        if (writeIndex < IMPACT_MAX) {
          const dummy = impactDummyRef.current
          dummy.position.set(impact.x + 0.5, impact.y + 0.5, impact.z + 0.5)
          dummy.updateMatrix()
          impactMesh.setMatrixAt(writeIndex, dummy.matrix)
        }

        writeIndex += 1
      }

      impacts.length = writeIndex
      const nextCount = Math.min(writeIndex, IMPACT_MAX)
      if (nextCount > 0 || prevImpactCountRef.current > 0) {
        impactMesh.count = nextCount
        impactMesh.instanceMatrix.needsUpdate = true
      }
      prevImpactCountRef.current = nextCount
    }
  })

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight intensity={0.9} position={[32, 56, 24]} />
      <fog attach="fog" args={["#0b1020", FOG_NEAR, FOG_FAR]} />
      <FpsController
        isSolid={isSolidAtVoxel}
        onShootVoxel={onShootVoxel}
        onPlayerPositionChange={(x, z) => {
          playerPositionRef.current.x = x
          playerPositionRef.current.z = z
        }}
      />
      {Array.from(chunks.values()).map((payload) => (
        <ChunkMesh
          key={payload.key}
          payload={payload}
          material={material}
          visible={visibleChunkKeys.size === 0 || visibleChunkKeys.has(payload.key)}
        />
      ))}
      <instancedMesh ref={impactMeshRef} args={[undefined, undefined, IMPACT_MAX]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshBasicMaterial color="#fde047" />
      </instancedMesh>
    </>
  )
}

export function Game({
  seedStr,
  shaderEnabled,
  rayTracingEnabled,
  onChunkCountChange,
  onChunkStatsChange,
  onFpsChange,
  shaderSettings,
}: GameProps) {
  const workerRef = useRef<Worker | null>(null)
  const workerResponsesRef = useRef<MeshWorkerResponse[]>([])
  const forceApplyResponsesRef = useRef<MeshWorkerResponse[]>([])
  const chunkManagerRef = useRef(new ChunkManager({ activeRadius: 1, removeRadius: 1, maxInflight: 1 }))
  const playerPositionRef = useRef({ x: 32, z: 32 })
  const [chunks, setChunks] = useState<Map<string, ChunkMeshPayload>>(new Map())
  const impactsRef = useRef<ShotImpact[]>([])
  const destroyedVoxelIndexRef = useRef(createDestroyedVoxelIndex())

  const isSolidAtVoxel = useCallback<IsSolidFn>((ix, iy, iz) => {
    if (hasDestroyedVoxel(destroyedVoxelIndexRef.current, ix, iy, iz)) {
      return false
    }

    return isSolidTerrainVoxel(seedStr, ix, iy, iz)
  }, [seedStr])

  const requestChunkRemesh = useCallback((cx: number, cz: number, destroyedDelta?: Int32Array) => {
    const request: MeshWorkerRequest = {
      seedStr,
      seedInt: seedToInt(seedStr),
      cx,
      cz,
      destroyedDelta,
      forceApply: true,
    }

    workerRef.current?.postMessage(request, getRequestTransferables(request))
  }, [seedStr])

  const onShootVoxel = useCallback((x: number, y: number, z: number) => {
    if (hasDestroyedVoxel(destroyedVoxelIndexRef.current, x, y, z)) {
      return
    }

    addDestroyedVoxel(destroyedVoxelIndexRef.current, x, y, z)

    const destroyedDelta = new Int32Array([x, y, z])
    const impacts = impactsRef.current
    impacts.push({
      x,
      y,
      z,
      expiresAt: performance.now() + IMPACT_TTL_MS,
    })

    if (impacts.length > IMPACT_MAX * 2) {
      impacts.splice(0, impacts.length - IMPACT_MAX)
    }

    const centerCx = worldToChunk(x, CHUNK_SIZE).chunk
    const centerCz = worldToChunk(z, CHUNK_SIZE).chunk

    requestChunkRemesh(centerCx, centerCz, destroyedDelta)

    const localX = x - centerCx * CHUNK_SIZE
    const localZ = z - centerCz * CHUNK_SIZE

    if (localX === 0) {
      requestChunkRemesh(centerCx - 1, centerCz)
    } else if (localX === CHUNK_SIZE - 1) {
      requestChunkRemesh(centerCx + 1, centerCz)
    }

    if (localZ === 0) {
      requestChunkRemesh(centerCx, centerCz - 1)
    } else if (localZ === CHUNK_SIZE - 1) {
      requestChunkRemesh(centerCx, centerCz + 1)
    }
  }, [requestChunkRemesh])

  useEffect(() => {
    clearDestroyedVoxelIndex(destroyedVoxelIndexRef.current)
    impactsRef.current.length = 0
  }, [seedStr])

  useEffect(() => {
    if (workerRef.current) {
      return
    }

    const worker = new Worker(new URL("../workers/mesh.worker.ts", import.meta.url), {
      type: "module",
    })

    worker.onmessage = (event: MessageEvent<MeshWorkerResponse>) => {
      if (event.data.forceApply) {
        const queue = forceApplyResponsesRef.current
        queue.push(event.data)

        if (queue.length > MAX_PENDING_FORCE_APPLY_RESPONSES) {
          queue.splice(0, queue.length - MAX_PENDING_FORCE_APPLY_RESPONSES)
        }
        return
      }

      const queue = workerResponsesRef.current
      queue.push(event.data)

      if (queue.length > MAX_PENDING_WORKER_RESPONSES) {
        queue.splice(0, queue.length - MAX_PENDING_WORKER_RESPONSES)
      }
    }

    workerRef.current = worker

    return () => {
      worker.onmessage = null
      worker.terminate()
      workerRef.current = null
      workerResponsesRef.current = []
      forceApplyResponsesRef.current = []
    }
  }, [])

  useEffect(() => {
    onChunkCountChange?.(chunks.size)
  }, [chunks.size, onChunkCountChange])

  return (
    <Canvas
      camera={{ fov: 65, near: 0.1, far: FOG_FAR + 16, position: [32, 48, 32] }}
      dpr={[0.5, 0.8]}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      style={{ position: "fixed", inset: 0 }}
    >
      <color attach="background" args={["#0a0f1c"]} />
      <SceneContents
        chunkManagerRef={chunkManagerRef}
        chunks={chunks}
        forceApplyResponsesRef={forceApplyResponsesRef}
        impactsRef={impactsRef}
        isSolidAtVoxel={isSolidAtVoxel}
        onChunkStatsChange={onChunkStatsChange}
        onFpsChange={onFpsChange}
        onShootVoxel={onShootVoxel}
        rayTracingEnabled={rayTracingEnabled}
        shaderEnabled={shaderEnabled}
        shaderSettings={shaderSettings}
        playerPositionRef={playerPositionRef}
        seedStr={seedStr}
        setChunks={setChunks}
        workerRef={workerRef}
        workerResponsesRef={workerResponsesRef}
      />
    </Canvas>
  )
}

function dequeueBatch<T>(queue: T[], max: number): T[] {
  if (queue.length === 0) {
    return []
  }

  const count = Math.min(max, queue.length)
  return queue.splice(0, count)
}
