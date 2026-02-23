import { memo, useEffect, useMemo } from "react"

import * as THREE from "three"

import { CHUNK_SIZE } from "../world/chunkConstants"
import type { ChunkMeshPayload } from "./types"

type ChunkMeshProps = {
  payload: ChunkMeshPayload
  material: THREE.Material
  visible: boolean
}

function ChunkMeshInner({ payload, material, visible }: ChunkMeshProps) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry()

    next.setAttribute("position", new THREE.BufferAttribute(payload.positions, 3))
    next.setAttribute("normal", new THREE.BufferAttribute(payload.normals, 3))
    next.setAttribute("color", new THREE.BufferAttribute(payload.colors, 3))
    next.setIndex(new THREE.BufferAttribute(payload.indices, 1))

    return next
  }, [payload.colors, payload.indices, payload.normals, payload.positions])

  useEffect(() => {
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[payload.cx * CHUNK_SIZE, 0, payload.cz * CHUNK_SIZE]}
      visible={visible}
    />
  )
}

export const ChunkMesh = memo(ChunkMeshInner)
