import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Car } from './Car'
import type { PhysicsWorld } from '../PhysicsWorld'
import { loadCarModel, extractWheels, mergeBodyGeometry, mergeWheelGroups } from './ModelLoader'

/** 2023 Toyota RAV4 Hybrid — loaded from /models/toyota.glb */
export class Toyota extends Car {
  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    super(scene, physics)

    this.config = {
      mass: 1860,              // RAV4 Hybrid curb weight ~1860 kg
      wheelRadius: 0.470,      // slightly taller SUV tires
      wheelFriction: 1.40,     // all-season tires, less grip than sport sedans
      suspensionStiffness: 28, // softer SUV ride
      suspensionRestLength: 0.40, // taller suspension travel
      suspensionDamping: 2.6,
      suspensionCompression: 4.2,
      maxEngineForce: 5800,    // 222 HP hybrid — torquey but less top-end than sport sedans
      maxBrakeForce: 200,      // regenerative + disc brakes
      maxSteeringAngle: 0.52,  // tighter turning circle for SUV
      rollInfluence: 0.025,    // slightly more body roll (taller CG)
      chassisHalfExtents: new CANNON.Vec3(1.1, 0.55, 2.35),
      chassisOffset: new CANNON.Vec3(0, 0.10, 0),
      wheelConnectionY: -0.05,
      wheelPositions: [
        new CANNON.Vec3(-0.95, -0.05,  1.40), // FL
        new CANNON.Vec3( 0.95, -0.05,  1.40), // FR
        new CANNON.Vec3(-0.95, -0.05, -1.40), // RL
        new CANNON.Vec3( 0.95, -0.05, -1.40), // RR
      ],
    }
  }

  async spawn(startPos: THREE.Vector3): Promise<void> {
    const detectedPositions = await this.loadBody()
    this.buildPhysics(startPos, detectedPositions)
  }

  private async loadBody(): Promise<CANNON.Vec3[]> {
    const { bodyGroup } = await loadCarModel('/models/toyota.glb', 4.60)

    const { groups, positions } = extractWheels(bodyGroup, this.scene, 'toyota')
    mergeWheelGroups(groups)
    this.wheelMeshes = groups
    mergeBodyGeometry(bodyGroup)

    this.registerDamageZone(bodyGroup, 'front', 0.35)
    this.registerDamageZone(bodyGroup, 'rear', 0.30)

    this.chassisMesh.add(bodyGroup)
    return positions
  }
}
