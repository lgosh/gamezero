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

    const { groups, positions } = extractWheels(bodyGroup, this.scene, 'bmw_m5_cs')
    mergeWheelGroups(groups)
    this.wheelMeshes = groups
    mergeBodyGeometry(bodyGroup)

    this.registerDamageZone(bodyGroup, 'front', 0.35)
    this.registerDamageZone(bodyGroup, 'rear', 0.30)

    this.chassisMesh.add(bodyGroup)
    return positions
  }
}
