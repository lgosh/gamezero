import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Car } from './Car'
import type { PhysicsWorld } from '../PhysicsWorld'
import { loadCarModel } from './ModelLoader'

/** Mercedes-AMG E63 S W213 — loaded from /models/mercedes.glb */
export class Mercedes extends Car {
  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    super(scene, physics)

    this.config = {
      mass: 2045,
      wheelRadius: 0.430,
      wheelFriction: 1.50,
      suspensionStiffness: 34,
      suspensionRestLength: 0.28,
      suspensionDamping: 2.4,
      suspensionCompression: 4.5,
      maxEngineForce: 7200,
      maxBrakeForce: 145,
      maxSteeringAngle: 0.48,
      rollInfluence: 0.010,
      chassisHalfExtents: new CANNON.Vec3(0.96, 0.42, 2.42),
      chassisOffset: new CANNON.Vec3(0, 0.04, 0),
      // Wheel X = ±0.806 matches the GLB model's actual track width (~1.61 m),
      // keeping the visual wheels aligned with the body's wheel arches.
      wheelPositions: [
        new CANNON.Vec3(-0.806, 0.0,  1.45),
        new CANNON.Vec3( 0.806, 0.0,  1.45),
        new CANNON.Vec3(-0.806, 0.0, -1.52),
        new CANNON.Vec3( 0.806, 0.0, -1.52),
      ],
    }
  }

  async spawn(startPos: THREE.Vector3): Promise<void> {
    await this.loadBody()
    this.buildPhysics(startPos)
  }

  private async loadBody(): Promise<void> {
    // The Mercedes GLB is oriented with its front facing -Z (backwards relative
    // to the physics chassis). Rotate 180° around Y to fix before centering.
    const { bodyGroup } = await loadCarModel('/models/mercedes.glb', 4.95, { rotateY: Math.PI })

    // Wheels remain part of the body group (static, no per-wheel rotation).
    // Extraction caused tyre geometry to clip through the body; baked wheels are visually cleaner.

    // Register body for damage deformation
    this.registerDamageZone(bodyGroup, 'front', 0.35)
    this.registerDamageZone(bodyGroup, 'rear', 0.30)

    bodyGroup.position.y = 0.15

    this.chassisMesh.add(bodyGroup)
  }
}
