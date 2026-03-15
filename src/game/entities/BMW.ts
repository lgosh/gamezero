import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Car } from './Car'
import type { PhysicsWorld } from '../PhysicsWorld'
import { loadCarModel, extractWheels } from './ModelLoader'

/** BMW M5 Competition F90 — loaded from /models/bmw_4k.glb */
export class BMW extends Car {
  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    super(scene, physics)

    this.config = {
      mass: 1730,
      wheelRadius: 0.460,
      wheelFriction: 1.48,
      suspensionStiffness: 36,
      suspensionRestLength: 0.35,
      suspensionDamping: 2.3,
      suspensionCompression: 4.4,
      maxEngineForce: 7500,
      maxBrakeForce: 140,
      maxSteeringAngle: 0.46,
      rollInfluence: 0.015,
      chassisHalfExtents: new CANNON.Vec3(1.2, 0.42, 2.6),
      chassisOffset: new CANNON.Vec3(0, 0.15, 0),
      wheelConnectionY: -0.05,
      // Fallback positions used if auto-detection finds < 4 wheel clusters
      wheelPositions: [
        new CANNON.Vec3(-0.95, -0.05,  1.45), // FL
        new CANNON.Vec3( 0.95, -0.05,  1.45), // FR
        new CANNON.Vec3(-0.95, -0.05, -1.45), // RL
        new CANNON.Vec3( 0.95, -0.05, -1.45), // RR
      ],
    }
  }

  async spawn(startPos: THREE.Vector3): Promise<void> {
    const detectedPositions = await this.loadBody()
    this.buildPhysics(startPos, detectedPositions)
  }

  private async loadBody(): Promise<CANNON.Vec3[]> {
    const { bodyGroup } = await loadCarModel('/models/bmw_4k.glb', 10.0, {
      targetWidth: 2.4,
      ignoreNegativeY: true,
    })

    // Detect wheels FIRST before any manual shifting
    const { groups, positions } = extractWheels(bodyGroup, this.scene)
    this.wheelMeshes = groups

    // Apply paint
    bodyGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const sm = mesh.material as THREE.MeshStandardMaterial
      if (sm && sm.isMeshStandardMaterial) {
        if (sm.transparent && sm.opacity < 0.85) return
        if (sm.metalness > 0.7) return
        sm.color.set(0x050505)
        sm.metalness = 0.1
        sm.roughness = 0.4
      }
    })

    this.registerDamageZone(bodyGroup, 'front', 0.35)
    this.registerDamageZone(bodyGroup, 'rear', 0.30)

    // Visual body offset: bbox center is ~2.5m ahead of actual car body center
    // due to GLTF inflation — shift visual back to align physics with body.
    bodyGroup.position.z = -2.5

    this.chassisMesh.add(bodyGroup)
    return positions
  }
}
