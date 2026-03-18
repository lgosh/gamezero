import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Car } from './Car'
import type { PhysicsWorld } from '../PhysicsWorld'
import { loadCarModel, extractWheels, mergeBodyGeometry, mergeWheelGroups } from './ModelLoader'

/** BMW M5 CS — loaded from /models/bmw_m5_cs.glb */
export class BMWCS extends Car {
  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    super(scene, physics)

    this.config = {
      mass: 1825,              // F90 M5 CS curb weight ~1825 kg
      wheelRadius: 0.430,
      wheelFriction: 1.70,     // Michelin Pilot Sport Cup 2 — track tires
      suspensionStiffness: 45, // stiffer track-tuned suspension
      suspensionRestLength: 0.30,
      suspensionDamping: 2.8,
      suspensionCompression: 5.0,
      maxEngineForce: 9500,    // 635 HP twin-turbo V8
      maxBrakeForce: 300,      // carbon-ceramic brakes
      maxSpeedKmh: 330,        // tuned so equilibrium ≈ 305 km/h (real CS top speed)
      maxSteeringAngle: 0.44,
      rollInfluence: 0.010,    // lower CG, less roll
      chassisHalfExtents: new CANNON.Vec3(1.0, 0.42, 2.4),
      chassisOffset: new CANNON.Vec3(0, 0.10, 0),
      wheelConnectionY: -0.05,
      wheelPositions: [
        new CANNON.Vec3(-0.95, -0.05, 1.45), // FL
        new CANNON.Vec3(0.95, -0.05, 1.45), // FR
        new CANNON.Vec3(-0.95, -0.05, -1.45), // RL
        new CANNON.Vec3(0.95, -0.05, -1.45), // RR
      ],
    }
  }

  async spawn(startPos: THREE.Vector3): Promise<void> {
    const detectedPositions = await this.loadBody()
    this.buildPhysics(startPos, detectedPositions)
  }

  private async loadBody(): Promise<CANNON.Vec3[]> {
    // targetLength 4.95 matches Mercedes visual size
    const { bodyGroup } = await loadCarModel('/models/bmw_m5_cs.glb', 4.95)
    this.restoreTaillightMaterials(bodyGroup)

    const { groups, positions } = extractWheels(bodyGroup, this.scene, 'bmw_m5_cs')
    mergeWheelGroups(groups)
    this.wheelMeshes = groups
    mergeBodyGeometry(bodyGroup)

    this.registerDamageZone(bodyGroup, 'front', 0.35)
    this.registerDamageZone(bodyGroup, 'rear', 0.30)

    this.chassisMesh.add(bodyGroup)
    return positions
  }

  private restoreTaillightMaterials(bodyGroup: THREE.Group) {
    bodyGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const next = materials.map((material) => {
        const name = (material.name || '').toLowerCase()
        const meshName = (mesh.name || '').toLowerCase()
        const isRedLens = name === 'red_glass' || meshName.includes('red_glass')

        if (!isRedLens) return material

        const source = material as THREE.MeshStandardMaterial
        const redLens = new THREE.MeshStandardMaterial()
        redLens.name = material.name || 'BMWCS_RedGlass'
        redLens.map = source.map ?? null
        redLens.alphaMap = source.alphaMap ?? null
        redLens.aoMap = source.aoMap ?? null
        redLens.normalMap = source.normalMap ?? null
        redLens.normalScale.copy(source.normalScale ?? new THREE.Vector2(1, 1))
        redLens.color = new THREE.Color(0xd61f2f)
        redLens.emissive = new THREE.Color(0x3d0208)
        redLens.emissiveMap = source.map ?? null
        redLens.emissiveIntensity = 0.26
        redLens.metalness = 0.02
        redLens.roughness = 0.18
        redLens.transparent = true
        redLens.opacity = 0.9
        redLens.depthWrite = false
        redLens.toneMapped = true
        return redLens
      })

      mesh.material = Array.isArray(mesh.material) ? next : next[0]
    })
  }
}
