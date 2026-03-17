import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Car } from './Car'
import type { PhysicsWorld } from '../PhysicsWorld'
import { loadCarModel, extractWheels, mergeBodyGeometry, mergeWheelGroups } from './ModelLoader'

/** BMW M5 E34 — loaded from /models/bmw_m5_e34.glb */
export class BMW extends Car {
  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    super(scene, physics)

    this.config = {
      mass: 1670,              // E34 M5 curb weight ~1670 kg
      wheelRadius: 0.420,
      wheelFriction: 1.55,     // period-correct sport tires
      suspensionStiffness: 35,
      suspensionRestLength: 0.35,
      suspensionDamping: 2.3,
      suspensionCompression: 4.4,
      maxEngineForce: 6800,    // 315 HP naturally aspirated inline-6
      maxBrakeForce: 220,      // standard ventilated disc brakes
      maxSteeringAngle: 0.46,
      rollInfluence: 0.015,
      chassisHalfExtents: new CANNON.Vec3(1.0, 0.42, 2.4),
      chassisOffset: new CANNON.Vec3(0, 0.10, 0),
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
    // targetLength 4.95 matches Mercedes visual size
    const { bodyGroup } = await loadCarModel('/models/bmw_m5_e34.glb', 4.95)

    const { groups, positions } = extractWheels(bodyGroup, this.scene, 'bmw_e34')
    mergeWheelGroups(groups)
    this.wheelMeshes = groups
    mergeBodyGeometry(bodyGroup)

    this.registerDamageZone(bodyGroup, 'front', 0.35)
    this.registerDamageZone(bodyGroup, 'rear', 0.30)

    this.chassisMesh.add(bodyGroup)
    return positions
  }
}
