import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import * as CANNON from 'cannon-es'

export interface LoadedCarModel {
  bodyGroup: THREE.Group
  wheelGroups: THREE.Group[]
  wheelPositions: CANNON.Vec3[]
}

const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)

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
        
        // Disable depth write for simple transparency to prevent sorting glitches,
        // BUT never do this for PBR transmission materials (they need depth buffer).
        const isTransmissionGlass = (m as any).isMeshPhysicalMaterial && (m as any).transmission > 0
        if (sm.transparent && sm.opacity < 0.8 && !isTransmissionGlass) {
          sm.depthWrite = false
        }
      }
    }
  })

  if (options?.rotateY !== undefined) root.rotation.y = options.rotateY

  // Compute raw bounding box. If the scene bbox is unreasonably large compared to
  // what a car should be (longest side > 20× targetLength), try to find the car
  // cluster within the scene and use that for scaling instead.
  let bbox0 = new THREE.Box3().setFromObject(root)
  let size0 = bbox0.getSize(new THREE.Vector3())
  const longestRaw = Math.max(size0.x, size0.y, size0.z)
  console.log(`[ModelLoader] ${url} raw bbox: ${size0.x.toFixed(2)} × ${size0.y.toFixed(2)} × ${size0.z.toFixed(2)} (longest=${longestRaw.toFixed(2)})`)

  // If the scene bbox is significantly larger than expected (outlier meshes like
  // misplaced verts or ground planes), find the actual car cluster for scaling.
  if (longestRaw > targetLength * 1.8) {
    console.warn(`[ModelLoader] Scene bbox too large (${longestRaw.toFixed(1)} vs target ${targetLength}), searching for car cluster...`)
    const carBbox = findCarCluster(root)
    if (carBbox) {
      bbox0 = carBbox
      size0 = carBbox.getSize(new THREE.Vector3())
      console.log(`[ModelLoader] Car cluster: ${size0.x.toFixed(2)} × ${size0.y.toFixed(2)} × ${size0.z.toFixed(2)}`)
    }
  }

  if (options?.targetWidth !== undefined) {
    const scaleXY = options.targetWidth / size0.x
    const scaleZ = targetLength / size0.z
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
 * Find the main car geometry cluster inside a scene that may contain extra objects.
 * Returns a bbox around the largest connected cluster of meshes, or null.
 */
function findCarCluster(root: THREE.Group): THREE.Box3 | null {
  // Collect all mesh bounding boxes
  const meshBoxes: THREE.Box3[] = []
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return
    const bbox = new THREE.Box3().setFromObject(obj)
    if (!bbox.isEmpty()) meshBoxes.push(bbox)
  })
  if (meshBoxes.length === 0) return null

  // Find the median center point — the car is the densest cluster near the median
  const centers = meshBoxes.map(b => b.getCenter(new THREE.Vector3()))
  const medX = centers.map(c => c.x).sort((a, b) => a - b)[Math.floor(centers.length / 2)]
  const medY = centers.map(c => c.y).sort((a, b) => a - b)[Math.floor(centers.length / 2)]
  const medZ = centers.map(c => c.z).sort((a, b) => a - b)[Math.floor(centers.length / 2)]
  const median = new THREE.Vector3(medX, medY, medZ)

  // Keep meshes within 5 units of the median (contains car body, excludes outliers)
  const carBox = new THREE.Box3()
  for (let i = 0; i < meshBoxes.length; i++) {
    if (centers[i].distanceTo(median) < 5) {
      carBox.union(meshBoxes[i])
    }
  }
  return carBox.isEmpty() ? null : carBox
}

/**
 * Robust wheel extraction with two strategies:
 * 1. Name-based — matches nodes named wheel/tire/rim/hub/brake/etc.
 * 2. Position-based fallback — finds small meshes at the 4 bottom corners of the car.
 * After extraction, each wheel group's geometry is re-centered to prevent orbit.
 */
export function extractWheels(bodyGroup: THREE.Group, targetScene: THREE.Scene, modelName = 'unknown'): { groups: THREE.Group[], positions: CANNON.Vec3[] } {
  bodyGroup.updateWorldMatrix(true, true)

  // ── Collect every mesh with its world-space bounding box ─────────────
  const allMeshInfo: { mesh: THREE.Mesh; center: THREE.Vector3; size: THREE.Vector3 }[] = []
  bodyGroup.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return
    const mesh = obj as THREE.Mesh
    const bbox = new THREE.Box3().setFromObject(mesh)
    if (bbox.isEmpty()) return
    const size = bbox.getSize(new THREE.Vector3())
    if (size.x >= 2.5 || size.y >= 2.5 || size.z >= 2.5) return // too large for a wheel part
    allMeshInfo.push({ mesh, center: bbox.getCenter(new THREE.Vector3()), size })
  })

  // ── Strategy 1: name-based detection ─────────────────────────────────
  // Includes Italian terms (freni = brake, pinza = caliper) for Sketchfab models
  const isWheelNode = (node: THREE.Object3D): boolean => {
    let curr: THREE.Object3D | null = node
    while (curr && curr !== bodyGroup) {
      const name = curr.name.toLowerCase()
      if (name.match(/wheel|tire|tyre|rim|hub|disc|brake|rotor|caliper|axle|rad|freni|pinza/)) return true
      curr = curr.parent
    }
    return false
  }

  const nameParts = allMeshInfo.filter(p => isWheelNode(p.mesh))
  let final4 = clusterAndPick4(nameParts)

  // ── Strategy 2: position-based fallback (all small meshes below car midline) ──
  if (!final4) {
    // Compute car bounding box to find the bottom half
    const carBox = new THREE.Box3()
    bodyGroup.traverse(o => { if ((o as THREE.Mesh).isMesh) carBox.expandByObject(o) })
    const carCenter = carBox.getCenter(new THREE.Vector3())

    // Only consider meshes in the lower half of the car (where wheels live)
    const lowParts = allMeshInfo.filter(p => p.center.y < carCenter.y)
    final4 = clusterAndPick4(lowParts)

    // Reject if the 4 clusters are not spatially distinct — this means the
    // position-based fallback found geometry stacked near the model origin
    // (e.g. Toyota GLB where wheel assemblies have no local transforms and
    // all share the same world-space center). Using such positions as
    // chassisConnectionPointLocal would break physics entirely.
    if (final4) {
      let allDistinct = true
      for (let i = 0; i < 4 && allDistinct; i++) {
        for (let j = i + 1; j < 4 && allDistinct; j++) {
          if (final4[i].center.distanceTo(final4[j].center) < 0.4) allDistinct = false
        }
      }
      if (!allDistinct) {
        console.warn('[ModelLoader] Position-based wheel clusters are not spatially distinct — skipping, will use cfg.wheelPositions')
        final4 = null
      }
    }
  }

  if (!final4) {
    const allNames: string[] = []
    bodyGroup.traverse(o => { if (o.name) allNames.push(o.name) })
    console.warn(`[ModelLoader] Could not find 4 wheel clusters. Node names:`, allNames.slice(0, 50))
    return { groups: [], positions: [] }
  }

  // Remember which meshes are "core" wheel parts (name-detected) — only
  // these will be used for computing the wheel rotation pivot below.
  const coreMeshSets = final4.map(c => new Set(c.meshes))

  // ── Pull in nearby wheel-named meshes not yet picked ────────────────
  // IMPORTANT: Only pull in meshes that pass isWheelNode. Non-wheel body
  // parts (suspension, fender liners, etc.) near the wheels must stay on
  // the body — otherwise they orbit with the wheel and corrupt the center.
  const picked = new Set(final4.flatMap(c => c.meshes))
  for (const info of allMeshInfo) {
    if (picked.has(info.mesh)) continue
    // Wheel-named parts can join clusters within 0.55m.
    // Unnamed parts (e.g. tire meshes with generic names) can only join if
    // essentially concentric with a cluster (< 0.10m) — this picks up tires
    // that share the same world-space center as a detected rim/caliper without
    // accidentally pulling in nearby body panels or suspension parts.
    const threshold = isWheelNode(info.mesh) ? 0.55 : 0.25
    for (const cluster of final4) {
      if (info.center.distanceTo(cluster.center) < threshold) {
        cluster.meshes.push(info.mesh)
        picked.add(info.mesh)
        break
      }
    }
  }

  // ── Validate that extraction looks like real wheel geometry ─────────
  // If fewer than 2 of the 4 clusters contain a wheel-named mesh, the
  // extraction is unreliable (e.g. a rigged model where wheel geometry sits
  // at origin and Strategy 2 grabbed random corner body parts instead).
  // Return empty so physics falls back to cfg.wheelPositions.
  const clustersWithWheelParts = final4.filter(c => c.meshes.some(m => isWheelNode(m))).length
  if (clustersWithWheelParts < 2) {
    console.warn(`[ModelLoader] Only ${clustersWithWheelParts}/4 clusters contain wheel-named parts — extraction unreliable, skipping`)
    return { groups: [], positions: [] }
  }

  // ── Build wheel groups with proper centering ────────────────────────
  const groups: THREE.Group[] = []
  const positions: CANNON.Vec3[] = []

  for (let ci = 0; ci < final4.length; ci++) {
    const cluster = final4[ci]
    const coreSet = coreMeshSets[ci]

    // Compute the rotation pivot from ONLY the core name-detected meshes.
    // Pulled-in extras (calipers, etc.) are included visually but must not
    // shift the pivot — they sit at different depths along the axle axis.
    const cbox = new THREE.Box3()
    cluster.meshes.forEach(m => {
      if (coreSet.has(m)) cbox.expandByObject(m)
    })
    // Fallback: if cbox is empty (shouldn't happen), use all meshes
    if (cbox.isEmpty()) cluster.meshes.forEach(m => cbox.expandByObject(m))
    const trueCenter = cbox.getCenter(new THREE.Vector3())

    // Snapshot world matrices BEFORE detaching anything — parent/child
    // relations inside the cluster mean removing mesh A invalidates
    // the matrixWorld of its child mesh B, causing wobble / orbit.
    const savedMatrices = cluster.meshes.map(m => {
      m.updateWorldMatrix(true, false)
      return m.matrixWorld.clone()
    })

    const group = new THREE.Group()
    cluster.meshes.forEach((m, idx) => {
      const geom = m.geometry.clone()
      geom.applyMatrix4(savedMatrices[idx])
      geom.translate(-trueCenter.x, -trueCenter.y, -trueCenter.z)
      m.geometry = geom
      m.parent?.remove(m)
      m.position.set(0, 0, 0)
      m.quaternion.identity()
      m.scale.set(1, 1, 1)
      group.add(m)
    })

    // Re-center pass: if geometry centroid drifted from (0,0,0), fix it
    const gbox = new THREE.Box3()
    group.traverse(o => { if ((o as THREE.Mesh).isMesh) gbox.expandByObject(o) })
    if (!gbox.isEmpty()) {
      const drift = gbox.getCenter(new THREE.Vector3())
      if (drift.length() > 0.001) {
        group.traverse(o => {
          if ((o as THREE.Mesh).isMesh) {
            ; (o as THREE.Mesh).geometry.translate(-drift.x, -drift.y, -drift.z)
          }
        })
        trueCenter.add(drift)
      }
    }

    group.position.copy(trueCenter)
    targetScene.add(group)
    groups.push(group)
    positions.push(new CANNON.Vec3(trueCenter.x, trueCenter.y, trueCenter.z))
  }

  return { groups, positions }
}

/** Cluster mesh infos by proximity, then pick the 4 corner-most clusters → [FL, FR, RL, RR] */
function clusterAndPick4(
  parts: { mesh: THREE.Mesh; center: THREE.Vector3 }[],
): { center: THREE.Vector3; meshes: THREE.Mesh[] }[] | null {
  if (parts.length === 0) return null

  // Cluster within 0.6m radius
  const clusters: { center: THREE.Vector3; meshes: THREE.Mesh[] }[] = []
  for (const p of parts) {
    let found = false
    for (const c of clusters) {
      if (p.center.distanceTo(c.center) < 0.6) {
        c.meshes.push(p.mesh)
        found = true
        break
      }
    }
    if (!found) clusters.push({ center: p.center.clone(), meshes: [p.mesh] })
  }

  // Recalculate true cluster centers from bounding boxes
  const refined = clusters.map(c => {
    const box = new THREE.Box3()
    c.meshes.forEach(m => box.expandByObject(m))
    return { center: box.getCenter(new THREE.Vector3()), meshes: c.meshes }
  })

  // Pick 4 corner-most clusters (farthest from center horizontally, lowest vertically)
  const top4 = refined.sort((a, b) => {
    const scoreA = Math.abs(a.center.x) * 2 + Math.abs(a.center.z) - a.center.y * 3
    const scoreB = Math.abs(b.center.x) * 2 + Math.abs(b.center.z) - b.center.y * 3
    return scoreB - scoreA
  }).slice(0, 4)

  if (top4.length < 4) return null

  // Sort: higher Z = front, lower X = left → [FL, FR, RL, RR]
  const ordered = top4.sort((a, b) => b.center.z - a.center.z)
  const front = ordered.slice(0, 2).sort((a, b) => a.center.x - b.center.x)
  const rear = ordered.slice(2, 4).sort((a, b) => a.center.x - b.center.x)
  return [...front, ...rear]
}

export function extractWheelsByKeyword(bodyGroup: THREE.Group, targetScene: THREE.Scene): THREE.Group[] {
  return extractWheels(bodyGroup, targetScene).groups
}

/**
 * Merge all remaining body meshes in bodyGroup by material to dramatically
 * reduce draw calls (e.g. 1800 meshes → ~20 merged meshes, one per material).
 * Call this after extractWheels so wheel meshes are already separated out.
 */
export function mergeBodyGeometry(bodyGroup: THREE.Group): void {
  bodyGroup.updateWorldMatrix(true, true)

  type Bucket = { mat: THREE.Material; geoms: THREE.BufferGeometry[]; castShadow: boolean }
  const buckets = new Map<string, Bucket>()
  const toRemove: THREE.Mesh[] = []

  bodyGroup.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (mats.length > 1) return // skip multi-material meshes

    const mat = mats[0]
    if (!mat) return

    mesh.updateWorldMatrix(true, false)
    const geom = mesh.geometry.clone()
    geom.applyMatrix4(mesh.matrixWorld)

    // Key by material + attribute set so only compatible geometries merge
    const attrSig = Object.keys(mesh.geometry.attributes).sort().join(',')
    const key = `${mat.uuid}|${attrSig}`
    if (!buckets.has(key)) buckets.set(key, { mat, geoms: [], castShadow: false })
    const b = buckets.get(key)!
    b.geoms.push(geom)
    if (mesh.castShadow) b.castShadow = true
    toRemove.push(mesh)
  })

  toRemove.forEach((m) => m.parent?.remove(m))

  for (const { mat, geoms } of buckets.values()) {
    if (geoms.length === 0) continue
    let merged: THREE.BufferGeometry | null = null
    try { merged = mergeGeometries(geoms) } catch { merged = geoms[0] }
    if (!merged) continue
    // Deduplicate vertices — Sketchfab models often have many shared verts stored separately
    try { merged = mergeVertices(merged) } catch { /* keep original if dedup fails */ }
    merged.computeBoundingSphere()
    const m = new THREE.Mesh(merged, mat)
    m.castShadow = false  // cars move through shadows, don't cast them
    m.receiveShadow = false
    bodyGroup.add(m)
  }
}

/**
 * Merge meshes within each wheel group by material.
 * BMW M5 CS has ~450 meshes per wheel group — this collapses them to a handful.
 * Wheel groups are positioned each frame by syncVisual(), so geometry must be
 * in group-local space (already the case from extractWheels).
 */
export function mergeWheelGroups(groups: THREE.Group[]): void {
  for (const group of groups) {
    type Bucket = { mat: THREE.Material; geoms: THREE.BufferGeometry[] }
    const buckets = new Map<string, Bucket>()
    const toRemove: THREE.Mesh[] = []

    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      if (mats.length > 1) return
      const mat = mats[0]
      if (!mat) return
      const attrSig = Object.keys(mesh.geometry.attributes).sort().join(',')
      const key = `${mat.uuid}|${attrSig}`
      // Geometry is already in group-local space (extractWheels centered it at origin)
      if (!buckets.has(key)) buckets.set(key, { mat, geoms: [] })
      buckets.get(key)!.geoms.push(mesh.geometry.clone())
      toRemove.push(mesh)
    })

    toRemove.forEach((m) => m.parent?.remove(m))

    for (const { mat, geoms } of buckets.values()) {
      if (geoms.length === 0) continue
      let merged: THREE.BufferGeometry | null = null
      try { merged = mergeGeometries(geoms) } catch { merged = geoms[0] }
      if (!merged) continue
      try { merged = mergeVertices(merged) } catch { /* keep original if dedup fails */ }
      merged.computeBoundingSphere()
      const m = new THREE.Mesh(merged, mat)
      m.castShadow = false
      m.receiveShadow = false
      group.add(m)
    }
  }
}
