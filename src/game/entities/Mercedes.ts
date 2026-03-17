import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Car } from './Car'
import type { PhysicsWorld } from '../PhysicsWorld'
import { loadCarModel, extractWheels, mergeBodyGeometry, mergeWheelGroups } from './ModelLoader'

/** Mercedes-AMG E63 S W213 — loaded from /models/mercedes.glb */
export class Mercedes extends Car {
  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    super(scene, physics)

    this.config = {
      mass: 2045,              // AMG E63 S W213 curb weight ~2045 kg
      wheelRadius: 0.430,
      wheelFriction: 1.60,     // Michelin Pilot Sport 4S — high-performance
      suspensionStiffness: 38, // AMG adaptive dampers, firmer than stock
      suspensionRestLength: 0.33,
      suspensionDamping: 2.5,
      suspensionCompression: 4.8,
      maxEngineForce: 9200,    // 612 HP twin-turbo V8, 850 Nm torque
      maxBrakeForce: 280,      // AMG high-performance composite brakes
      maxSteeringAngle: 0.46,
      rollInfluence: 0.012,
      chassisHalfExtents: new CANNON.Vec3(1.0, 0.45, 2.4),
      chassisOffset: new CANNON.Vec3(0, 0.08, 0),
      wheelConnectionY: -0.05,
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
    const { bodyGroup } = await loadCarModel('/models/mercedes.glb', 4.95, { rotateY: Math.PI })

    const { groups, positions } = extractWheels(bodyGroup, this.scene, 'mercedes')
    mergeWheelGroups(groups)
    this.wheelMeshes = groups
    mergeBodyGeometry(bodyGroup)

    this.registerDamageZone(bodyGroup, 'front', 0.35)
    this.registerDamageZone(bodyGroup, 'rear', 0.30)

    this.chassisMesh.add(bodyGroup)
    return positions
  }
}
