import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export interface LoadedCarModel {
  bodyGroup: THREE.Group
  wheelGroups: THREE.Group[]
}

const loader = new GLTFLoader()

export interface LoadCarModelOptions {
  /**
   * If provided, X and Y are scaled so width matches targetWidth,
   * while Z is scaled to targetLength independently.
   * Use this when the GLB has a non-uniform embedded transform that
   * stretches the length axis disproportionately (e.g. BMW GLB).
   */
  targetWidth?: number
  /** Pre-rotation around Y (radians) applied before scaling/centering. */
  rotateY?: number
  /**
   * When true, compute the Y center of mass using only Y ≥ 0 geometry.
   * Use for models that include detailed undercarriage (large negative-Y
   * vertices) that would otherwise pull the centering point far below
   * the car body, making it float above the chassis.
   */
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

  // ── Optional pre-rotation (before bbox/scale so centering is correct) ───
  if (options?.rotateY !== undefined) {
    root.rotation.y = options.rotateY
  }

  // ── Scale ────────────────────────────────────────────────────────────────
  // Note: 180° Y rotation doesn't change bbox extents, so size0 is valid
  // whether or not rotateY was applied.
  const bbox0 = new THREE.Box3().setFromObject(root)
  const size0 = bbox0.getSize(new THREE.Vector3())

  let scaleLog: string
  if (options?.targetWidth !== undefined) {
    // Non-uniform scale: X/Y follow width, Z follows length.
    // Needed when the GLB has a disproportionate Z stretch (BMW case).
    const scaleXY = options.targetWidth / size0.x
    const scaleZ  = targetLength / size0.z
    root.scale.set(scaleXY, scaleXY, scaleZ)
    scaleLog = `scaleXY ${scaleXY.toFixed(4)} scaleZ ${scaleZ.toFixed(4)}`
  } else {
    const longestSide = Math.max(size0.x, size0.y, size0.z)
    const scale = targetLength / longestSide
    root.scale.setScalar(scale)
    scaleLog = `scale ${scale.toFixed(4)}`
  }

  console.log(`[ModelLoader] ${url}: raw size`, size0.toArray().map(v => v.toFixed(4)),
    '|', scaleLog, '| targetLength', targetLength)

  // ── Center at origin ────────────────────────────────────────────────────
  const bbox1 = new THREE.Box3().setFromObject(root)
  const center = bbox1.getCenter(new THREE.Vector3())

  if (options?.ignoreNegativeY) {
    // Model has detailed undercarriage below Y=0 (exhaust, floor pan, etc).
    // Center vertically using only [0, Y_max] so the car body sits correctly
    // relative to the physics chassis instead of floating too high.
    center.y = bbox1.max.y / 2
  }

  root.position.set(-center.x, -center.y, -center.z)

  const bodyGroup = new THREE.Group()
  bodyGroup.add(root)
  return { bodyGroup, wheelGroups: [] }
}

/**
 * Extract 4 individually-named wheel nodes from the loaded model.
 * Uses setFromObject for correct world-space bbox (accounting for all parent transforms).
 * Bakes matrixWorld into geometry so wheels render at correct scale after detach.
 */
export function extractWheelsByName(
  bodyGroup: THREE.Group,
  nodeNames: string[],
  targetScene: THREE.Scene,
): THREE.Group[] {
  // Ensure all world matrices are up to date inside bodyGroup
  bodyGroup.updateWorldMatrix(false, true)

  const candidates: { node: THREE.Object3D; worldCenter: THREE.Vector3 }[] = []

  for (const name of nodeNames) {
    let found: THREE.Object3D | null = null
    bodyGroup.traverse((obj) => { if (obj.name === name) found = obj })
    if (!found) continue

    // Get the actual world bbox of this wheel node (accounts for ALL parent transforms)
    const wbbox = new THREE.Box3().setFromObject(found)
    if (wbbox.isEmpty()) continue
    const worldCenter = wbbox.getCenter(new THREE.Vector3())

    candidates.push({ node: found, worldCenter })
  }

  if (candidates.length < 4) {
    console.warn(`[ModelLoader] extractWheelsByName: found ${candidates.length}/4 wheel nodes`)
    return []
  }

  // Sort into [FL, FR, RL, RR] by world position: higher Z = front, lower X = left
  const sorted = [...candidates].sort((a, b) => b.worldCenter.z - a.worldCenter.z)
  const front = sorted.slice(0, 2).sort((a, b) => a.worldCenter.x - b.worldCenter.x)
  const rear  = sorted.slice(2, 4).sort((a, b) => a.worldCenter.x - b.worldCenter.x)
  const ordered = [...front, ...rear] // [FL, FR, RL, RR]

  const groups: THREE.Group[] = []

  for (const { node, worldCenter } of ordered) {
    // Collect all meshes under this wheel node
    const meshes: THREE.Mesh[] = []
    node.traverse((obj) => { if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh) })

    // Bake each mesh's full world transform into its geometry,
    // then translate so the wheel center is at local (0,0,0).
    // This preserves correct scale and position after detaching from the hierarchy.
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false)
      const geom = mesh.geometry.clone()
      // Apply world matrix: puts vertices in bodyGroup-local world space
      geom.applyMatrix4(mesh.matrixWorld)
      // Center around the wheel's world center
      geom.translate(-worldCenter.x, -worldCenter.y, -worldCenter.z)
      geom.computeBoundingBox()
      geom.computeBoundingSphere()
      mesh.geometry = geom
      // Reset mesh transforms — geometry now carries all positioning
      mesh.position.set(0, 0, 0)
      mesh.quaternion.identity()
      mesh.scale.set(1, 1, 1)
      if (mesh.matrixAutoUpdate === false) {
        mesh.matrix.identity()
        mesh.matrixWorld.identity()
      }
    }

    // Detach wheel node from the model
    node.parent?.remove(node)
    node.position.set(0, 0, 0)
    node.quaternion.identity()
    node.scale.set(1, 1, 1)

    const group = new THREE.Group()
    group.add(node)
    group.position.copy(worldCenter)
    targetScene.add(group)
    groups.push(group)
  }

  return groups
}
