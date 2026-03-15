import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as CANNON from 'cannon-es'

export interface LoadedCarModel {
  bodyGroup: THREE.Group
  wheelGroups: THREE.Group[]
  wheelPositions: CANNON.Vec3[] 
}

const loader = new GLTFLoader()

export interface LoadCarModelOptions {
  targetWidth?: number
  rotateY?: number
  ignoreNegativeY?: boolean
}

export async function loadCarModel(
  url: string,
  targetLength: number,
  options?: LoadCarModelOptions,
): Promise<LoadedCarModel> {
  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
    loader.load(url, resolve as any, undefined, reject)
  })

  const root = gltf.scene

  // Shadows + env map
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      const sm = m as THREE.MeshStandardMaterial
      if (sm.isMeshStandardMaterial) {
        sm.envMapIntensity = 0.5
        if (sm.transparent && sm.opacity < 0.8) sm.depthWrite = false
      }
    }
  })

  if (options?.rotateY !== undefined) root.rotation.y = options.rotateY

  const bbox0 = new THREE.Box3().setFromObject(root)
  const size0 = bbox0.getSize(new THREE.Vector3())
  if (options?.targetWidth !== undefined) {
    const scaleXY = options.targetWidth / size0.x
    const scaleZ  = targetLength / size0.z
    root.scale.set(scaleXY, scaleXY, scaleZ)
  } else {
    const longestSide = Math.max(size0.x, size0.y, size0.z)
    const scale = targetLength / longestSide
    root.scale.setScalar(scale)
  }

  const bbox1 = new THREE.Box3().setFromObject(root)
  const center = bbox1.getCenter(new THREE.Vector3())
  if (options?.ignoreNegativeY) center.y = bbox1.max.y / 2
  root.position.set(-center.x, -center.y, -center.z)

  const bodyGroup = new THREE.Group()
  bodyGroup.add(root)
  return { bodyGroup, wheelGroups: [], wheelPositions: [] }
}

/**
 * ULTRA ROBUST wheel extraction.
 * Clusters EVERYTHING that might be a wheel part.
 */
export function extractWheels(bodyGroup: THREE.Group, targetScene: THREE.Scene): { groups: THREE.Group[], positions: CANNON.Vec3[] } {
  bodyGroup.updateWorldMatrix(true, true)
  
  const parts: { mesh: THREE.Mesh; worldCenter: THREE.Vector3 }[] = []
  
  // Helper to check if a node is part of a wheel
  const isWheelNode = (node: THREE.Object3D): boolean => {
    let curr: THREE.Object3D | null = node
    while (curr && curr !== bodyGroup) {
      const name = curr.name.toLowerCase()
      if (name.match(/wheel|tire|tyre|rim|hub|disc|brake|rotor|caliper|axle/)) return true
      curr = curr.parent
    }
    return false
  }

  bodyGroup.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return
    const mesh = obj as THREE.Mesh
    
    if (isWheelNode(mesh)) {
      const bbox = new THREE.Box3().setFromObject(mesh)
      if (bbox.isEmpty()) return
      const size = bbox.getSize(new THREE.Vector3())
      // Sanity check: wheels are roughly circular/compact
      // In 4k models, they can be detailed, but not 10m long.
      if (size.x < 2.5 && size.y < 2.5 && size.z < 2.5) {
        parts.push({ mesh, worldCenter: bbox.getCenter(new THREE.Vector3()) })
      }
    }
  })

  // Cluster parts (0.6m radius to ensure we grab brakes + tires together)
  const clusters: { center: THREE.Vector3; meshes: THREE.Mesh[] }[] = []
  for (const p of parts) {
    let found = false
    for (const c of clusters) {
      if (p.worldCenter.distanceTo(c.center) < 0.6) {
        c.meshes.push(p.mesh)
        found = true
        break
      }
    }
    if (!found) clusters.push({ center: p.worldCenter.clone(), meshes: [p.mesh] })
  }

  // Recalculate true cluster centers
  const refined = clusters.map(c => {
    const box = new THREE.Box3()
    c.meshes.forEach(m => box.expandByObject(m))
    const center = box.getCenter(new THREE.Vector3())
    return { center, meshes: c.meshes }
  })

  // Pick 4 corner-most clusters
  const top4 = refined.sort((a, b) => {
    const scoreA = Math.abs(a.center.x) * 2 + Math.abs(a.center.z) - a.center.y * 3
    const scoreB = Math.abs(b.center.x) * 2 + Math.abs(b.center.z) - b.center.y * 3
    return scoreB - scoreA
  }).slice(0, 4)

  if (top4.length < 4) {
    // Log all mesh names to help debug missing wheel detection
    const allNames: string[] = []
    bodyGroup.traverse(o => { if (o.name) allNames.push(o.name) })
    console.warn(`[ModelLoader] Found only ${top4.length} wheel clusters. All node names:`, allNames.slice(0, 40))
    return { groups: [], positions: [] }
  }

  // Sort: higher Z = front, lower X = left -> [FL, FR, RL, RR]
  const ordered = top4.sort((a, b) => b.center.z - a.center.z)
  const front = ordered.slice(0, 2).sort((a, b) => a.center.x - b.center.x)
  const rear  = ordered.slice(2, 4).sort((a, b) => a.center.x - b.center.x)
  const final = [...front, ...rear]

  // Second pass: pull in any mesh near a wheel center that wasn't matched by name
  // (rims, calipers, etc. with non-standard names)
  const alreadyPicked = new Set(parts.map(p => p.mesh))
  bodyGroup.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return
    const mesh = obj as THREE.Mesh
    if (alreadyPicked.has(mesh)) return
    const bbox = new THREE.Box3().setFromObject(mesh)
    if (bbox.isEmpty()) return
    const size = bbox.getSize(new THREE.Vector3())
    if (size.x >= 2.5 || size.y >= 2.5 || size.z >= 2.5) return
    const center = bbox.getCenter(new THREE.Vector3())
    for (const cluster of final) {
      if (center.distanceTo(cluster.center) < 0.55) {
        cluster.meshes.push(mesh)
        alreadyPicked.add(mesh)
        break
      }
    }
  })

  const groups: THREE.Group[] = []
  const positions: CANNON.Vec3[] = []

  for (const cluster of final) {
    const group = new THREE.Group()
    cluster.meshes.forEach(m => {
      m.updateWorldMatrix(true, false)
      const geom = m.geometry.clone()
      geom.applyMatrix4(m.matrixWorld)
      geom.translate(-cluster.center.x, -cluster.center.y, -cluster.center.z)
      m.geometry = geom
      m.parent?.remove(m)
      m.position.set(0, 0, 0)
      m.quaternion.identity()
      m.scale.set(1, 1, 1)
      group.add(m)
    })
    group.position.copy(cluster.center)
    targetScene.add(group)
    groups.push(group)
    positions.push(new CANNON.Vec3(cluster.center.x, cluster.center.y, cluster.center.z))
  }

  return { groups, positions }
}

export function extractWheelsByKeyword(bodyGroup: THREE.Group, targetScene: THREE.Scene): THREE.Group[] {
  return extractWheels(bodyGroup, targetScene).groups
}
