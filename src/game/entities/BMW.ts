import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Car } from './Car'
import type { PhysicsWorld } from '../PhysicsWorld'
import { loadCarModel } from './ModelLoader'

/** BMW M5 Competition F90 — loaded from /models/bmw_4k.glb */
export class BMW extends Car {
  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    super(scene, physics)

    this.config = {
      mass: 1730,
      wheelRadius: 0.460,
      wheelFriction: 1.48,
      suspensionStiffness: 36,
      suspensionRestLength: 0.30,
      suspensionDamping: 2.3,
      suspensionCompression: 4.4,
      maxEngineForce: 7500,
      maxBrakeForce: 140,
      maxSteeringAngle: 0.46,
      rollInfluence: 0.009,
      chassisHalfExtents: new CANNON.Vec3(1.15, 0.48, 2.60),
      chassisOffset: new CANNON.Vec3(0, 0.04, 0),
      wheelPositions: [
        new CANNON.Vec3(-1.06, 0.0,  1.50),
        new CANNON.Vec3( 1.06, 0.0,  1.50),
        new CANNON.Vec3(-1.06, 0.0, -1.50),
        new CANNON.Vec3( 1.06, 0.0, -1.50),
      ],
    }
  }

  async spawn(startPos: THREE.Vector3): Promise<void> {
    await this.loadBody()
    this.buildPhysics(startPos)
    // wheelMeshes stays empty — baked GLB wheels follow chassis transform
  }

  private async loadBody(): Promise<void> {
    // targetLength=10.0 → scaleZ=0.923, visible body ~5.1m (slightly longer than before).
    // bodyGroup.position.z = -2.4 centers the visible body over the physics chassis,
    // compensating for the undercarriage extending in -Z and shifting the bbox center.
    const { bodyGroup } = await loadCarModel('/models/bmw_4k.glb', 10.0, {
      targetWidth: 2.4,
      ignoreNegativeY: true,
    })

    bodyGroup.position.set(0, 0.15, -2.4)

    // Paint the car black. Chrome trim (metalness > 0.7) is left untouched.
    // Setting metalness=0 + roughness=0.4 + dark color dominates over env-map reflections.
    bodyGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        const sm = m as THREE.MeshStandardMaterial
        if (!sm.isMeshStandardMaterial) continue
        if (sm.transparent && sm.opacity < 0.85) continue  // glass/windows — skip
        if (sm.metalness > 0.7) continue                   // chrome trim — skip
        sm.color.set(0x050505)
        sm.metalness = 0
        sm.roughness = 0.4
        sm.envMapIntensity = 0.25
        sm.needsUpdate = true
      }
    })

    // Register whole body as front/rear damage zones for deformation effect
    this.registerDamageZone(bodyGroup, 'front', 0.35)
    this.registerDamageZone(bodyGroup, 'rear', 0.30)

    this.chassisMesh.add(bodyGroup)
  }
}
