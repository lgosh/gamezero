import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import type { PhysicsWorld } from '../PhysicsWorld'
import type { InputState } from '../InputManager'

export interface CarConfig {
  mass: number
  wheelRadius: number
  wheelFriction: number
  suspensionStiffness: number
  suspensionRestLength: number
  suspensionDamping: number
  suspensionCompression: number
  maxEngineForce: number
  maxBrakeForce: number
  maxSteeringAngle: number
  rollInfluence: number
  // wheel offsets from chassis center (fallback if auto-detection fails)
  wheelPositions: CANNON.Vec3[]
  chassisHalfExtents: CANNON.Vec3
  chassisOffset: CANNON.Vec3 // visual mesh offset from physics center
  /** Override Y for chassisConnectionPointLocal (auto-detected Y from model is wrong for physics) */
  wheelConnectionY?: number
}

export interface DamageZone {
  mesh: THREE.Object3D
  originalPos: THREE.Vector3
  originalRot: THREE.Euler
  zone: 'front' | 'rear' | 'left' | 'right' | 'top'
  maxDeflection: number
}

export class Car {
  // Three.js
  group: THREE.Group
  chassisMesh: THREE.Group
  wheelMeshes: THREE.Group[] = []
  private headlightLights: THREE.SpotLight[] = []
  private taillightMeshes: THREE.Mesh[] = []

  // Physics
  vehicle!: CANNON.RaycastVehicle
  chassisBody!: CANNON.Body

  // State
  speedKmh = 0
  rpm = 800
  gear = 1
  damage = 0
  smokeEmitting = false

  /** Called on significant impacts — hook this up in GameEngine */
  onImpact?: (impactVelocity: number) => void

  private throttle = 0
  private brakeForce = 0
  private steeringValue = 0

  // Damage zones for deformation
  private damageZones: DamageZone[] = []

  // Gear ratios (including reverse = -1)
  private readonly GEAR_RATIOS = [-3.2, 0, 3.5, 2.2, 1.5, 1.1, 0.85, 0.72]
  // index 0 = reverse, 1 = neutral, 2-7 = gears 1-6
  private gearIndex = 2

  // Spawn immunity — ignore collisions for a short time after spawn/reset
  private spawnImmunityTimer = 2.0

  protected config!: CarConfig

  constructor(
    protected scene: THREE.Scene,
    protected physicsWorld: PhysicsWorld
  ) {
    this.group = new THREE.Group()
    this.chassisMesh = new THREE.Group()
    this.group.add(this.chassisMesh)
    scene.add(this.group)
  }

  protected buildPhysics(startPos: THREE.Vector3, detectedWheelPositions?: CANNON.Vec3[]) {
    const cfg = this.config

    this.chassisBody = new CANNON.Body({
      mass: cfg.mass,
      material: this.physicsWorld.carMaterial,
    })
    this.chassisBody.addShape(
      new CANNON.Box(cfg.chassisHalfExtents),
      cfg.chassisOffset
    )
    this.chassisBody.position.set(startPos.x, startPos.y + 1.5, startPos.z)
    this.chassisBody.linearDamping = 0.05
    this.chassisBody.angularDamping = 0.4

    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    })

    const baseWheel = {
      radius: cfg.wheelRadius,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: cfg.suspensionStiffness,
      suspensionRestLength: cfg.suspensionRestLength,
      frictionSlip: cfg.wheelFriction,
      dampingRelaxation: cfg.suspensionDamping,
      dampingCompression: cfg.suspensionCompression,
      maxSuspensionForce: 200000,
      rollInfluence: cfg.rollInfluence,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      maxSuspensionTravel: 0.4,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    }

    // Use detected positions if available, otherwise fallback to config
    const positions = (detectedWheelPositions && detectedWheelPositions.length === 4) 
      ? detectedWheelPositions 
      : cfg.wheelPositions

    const connY = cfg.wheelConnectionY ?? -0.05
    for (const pos of positions) {
      this.vehicle.addWheel({
        ...baseWheel,
        chassisConnectionPointLocal: new CANNON.Vec3(pos.x, connY, pos.z),
      })
    }

    this.vehicle.addToWorld(this.physicsWorld.world)

    this.chassisBody.addEventListener('collide', (event: { contact: CANNON.ContactEquation }) => {
      const impact = event.contact.getImpactVelocityAlongNormal()
      this.onCollision(Math.abs(impact), event.contact)
    })
  }

  protected registerDamageZone(
    mesh: THREE.Object3D,
    zone: DamageZone['zone'],
    maxDeflection: number
  ) {
    this.damageZones.push({
      mesh,
      originalPos: mesh.position.clone(),
      originalRot: mesh.rotation.clone(),
      zone,
      maxDeflection,
    })
  }

  private onCollision(impact: number, contact: CANNON.ContactEquation) {
    if (this.spawnImmunityTimer > 0) return
    if (impact < 2) return

    // Determine which body we hit
    const otherBody = contact.bi === this.chassisBody ? contact.bj : contact.bi
    const isSoft = (otherBody as any).__soft === true
    // Prop bodies (lamps, benches) use propMaterial and barely register
    const isProp = otherBody.mass > 0  // dynamic = prop

    if (isSoft) {
      // Trees: only apply tiny scratch damage at very high speeds
      if (impact < 8) return
      const damageAmount = Math.min(impact / 200, 0.05)
      this.applyDamage(damageAmount, 'front')
      this.onImpact?.(impact * 0.2)
      return
    }

    if (isProp) {
      // Lamps/benches: virtually no damage to car
      return
    }

    // Determine impact zone from contact normal
    const normal = contact.ni
    const localNormal = new CANNON.Vec3()
    this.chassisBody.quaternion.inverse().vmult(normal, localNormal)

    let zone: DamageZone['zone'] = 'front'
    if (Math.abs(localNormal.z) > Math.abs(localNormal.x)) {
      zone = localNormal.z > 0 ? 'front' : 'rear'
    } else {
      zone = localNormal.x > 0 ? 'right' : 'left'
    }

    const damageAmount = Math.min(impact / 25, 0.4)
    this.applyDamage(damageAmount, zone)
    this.onImpact?.(impact)
  }

  applyDamage(amount: number, zone: DamageZone['zone']) {
    this.damage = Math.min(1, this.damage + amount)
    this.deformZone(zone, amount)

    if (this.damage > 0.5) {
      this.smokeEmitting = true
    }
  }

  private deformZone(zone: DamageZone['zone'], amount: number) {
    const affected = this.damageZones.filter((z) => z.zone === zone)
    for (const dz of affected) {
      const deflect = amount * dz.maxDeflection

      if (zone === 'front') {
        dz.mesh.position.z += deflect * 0.4
        dz.mesh.position.y -= deflect * 0.15
        dz.mesh.rotation.x += deflect * 0.3
      } else if (zone === 'rear') {
        dz.mesh.position.z -= deflect * 0.4
        dz.mesh.position.y -= deflect * 0.1
        dz.mesh.rotation.x -= deflect * 0.2
      } else if (zone === 'left') {
        dz.mesh.position.x -= deflect * 0.3
        dz.mesh.rotation.z += deflect * 0.2
      } else if (zone === 'right') {
        dz.mesh.position.x += deflect * 0.3
        dz.mesh.rotation.z -= deflect * 0.2
      }
    }
  }

  update(input: InputState, dt: number): { rpm: number; speedKmh: number; gear: number; lateralSpeedMs: number } {
    if (this.spawnImmunityTimer > 0) this.spawnImmunityTimer -= dt

    const maxEngineForce = this.config.maxEngineForce
    const maxBrakeForce = this.config.maxBrakeForce
    const maxSteer = this.config.maxSteeringAngle

    // Speed — use signed forward speed to distinguish forward/backward travel
    const vel = this.chassisBody.velocity
    const fwd = this.getForwardVector()
    const forwardSpeedMs = fwd.x * vel.x + fwd.y * vel.y + fwd.z * vel.z
    this.speedKmh = Math.abs(forwardSpeedMs) * 3.6

    const prevGearIndex = this.gearIndex

    if (input.brake > 0 && forwardSpeedMs < 1) {
      // Reverse
      this.gearIndex = 0
    } else if (input.throttle > 0 && this.gearIndex === 0) {
      this.gearIndex = 2
    } else if (this.gearIndex !== 0) {
      this.autoShift()
    }

    this.gear = this.gearIndex

    // RPM Simulation based on Gear Ratio
    const maxRPM = 7500
    const idleRPM = 800
    
    if (this.gearIndex <= 1) {
      // Neutral/Reverse logic
      const targetRPM = idleRPM + input.throttle * 3000
      this.rpm += (targetRPM - this.rpm) * Math.min(1, dt * 4)
    } else {
      // Drive gears: RPM proportional to speed * ratio
      const ratio = Math.abs(this.GEAR_RATIOS[this.gearIndex])
      // Constant chosen so that at 240km/h in top gear (0.72) we are near redline
      const speedFactor = 35 
      let targetRPM = idleRPM + (this.speedKmh * ratio * speedFactor)
      
      // Add some "throttle blip" or "load" effect
      targetRPM += input.throttle * 600

      // If we just shifted, allow the RPM to drop and stay down for a moment
      const shiftDropFactor = this.gearIndex > prevGearIndex ? 0.5 : 1.0
      const lerpSpeed = this.gearIndex !== prevGearIndex ? 1.0 : 5.0
      
      this.rpm = THREE.MathUtils.lerp(this.rpm, targetRPM, Math.min(1, dt * lerpSpeed))
    }
    
    this.rpm = Math.max(idleRPM, Math.min(maxRPM, this.rpm))

    // Engine force — cannon-es convention: negative = forward, positive = backward
    const logicalForce =
      this.gearIndex === 0
        ? input.brake * maxEngineForce * 0.6   // reverse
        : -input.throttle * maxEngineForce      // forward

    // Brake force — handbrake must NOT touch front wheels (kills drift momentum)
    const brakeF = input.handbrake
      ? 0  // front wheels free; only rear gets locked below
      : input.brake > 0 && this.gearIndex !== 0
      ? input.brake * maxBrakeForce
      : 0

    // Steering — cannon-es: positive steer = left turn, so negate our convention
    const steer = -input.steering * maxSteer

    // Apply to vehicle (only if wheels exist)
    if (this.vehicle.wheelInfos.length >= 4) {
      this.vehicle.applyEngineForce(logicalForce, 2)
      this.vehicle.applyEngineForce(logicalForce, 3)
      this.vehicle.setSteeringValue(steer, 0)
      this.vehicle.setSteeringValue(steer, 1)

      // Front brakes harder
      this.vehicle.setBrake(brakeF * 0.7, 0)
      this.vehicle.setBrake(brakeF * 0.7, 1)
      this.vehicle.setBrake(brakeF * 0.3, 2)
      this.vehicle.setBrake(brakeF * 0.3, 3)

      // Handbrake locks rear wheels and reduces rear grip for drifting
      if (input.handbrake) {
        this.vehicle.setBrake(maxBrakeForce * 5, 2)
        this.vehicle.setBrake(maxBrakeForce * 5, 3)
        this.vehicle.wheelInfos[2].frictionSlip = 0.3
        this.vehicle.wheelInfos[3].frictionSlip = 0.3
      } else {
        this.vehicle.wheelInfos[2].frictionSlip = this.config.wheelFriction
        this.vehicle.wheelInfos[3].frictionSlip = this.config.wheelFriction
      }
    }

    // Sync visual mesh to physics
    this.syncVisual()

    // Lateral slip — how fast the car is moving sideways relative to its heading
    const right = new CANNON.Vec3(1, 0, 0)
    const worldRight = new CANNON.Vec3()
    this.chassisBody.quaternion.vmult(right, worldRight)
    const lateralSpeedMs = Math.abs(vel.x * worldRight.x + vel.y * worldRight.y + vel.z * worldRight.z)

    return { rpm: this.rpm, speedKmh: this.speedKmh, gear: this.gear, lateralSpeedMs }
  }

  private autoShift() {
    // Only called when gearIndex >= 1 (never in reverse)
    if (this.speedKmh < 2) {
      this.gearIndex = 1 // neutral at stop
      return
    }
    if (this.speedKmh > 5 && this.gearIndex <= 1) {
      this.gearIndex = 2 // engage 1st
      return
    }

    const upThresholds =   [999, 999, 30, 60, 100, 140, 180, 999]
    const downThresholds = [  0,   0,  0, 25,  55,  90, 130, 160]

    if (this.gearIndex < 7 && this.speedKmh > upThresholds[this.gearIndex]) {
      this.gearIndex++
    } else if (this.gearIndex > 2 && this.speedKmh < downThresholds[this.gearIndex]) {
      this.gearIndex--
    }
  }

  syncVisual() {
    // Sync chassis mesh to physics body
    const pos = this.chassisBody.position
    const quat = this.chassisBody.quaternion

    this.group.position.set(pos.x, pos.y, pos.z)
    this.group.quaternion.set(quat.x, quat.y, quat.z, quat.w)

    // Offset the chassis mesh so it matches the physics shape's offset
    this.chassisMesh.position.copy(this.config.chassisOffset)

    // Sync wheel meshes
    this.vehicle.wheelInfos.forEach((wheel, i) => {
      this.vehicle.updateWheelTransform(i)
      const t = wheel.worldTransform
      const wm = this.wheelMeshes[i]
      if (!wm) return
      wm.position.set(t.position.x, t.position.y, t.position.z)
      wm.quaternion.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w)
    })

  }

  getPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.chassisBody.position.x,
      this.chassisBody.position.y,
      this.chassisBody.position.z
    )
  }

  getForwardVector(): THREE.Vector3 {
    const forward = new CANNON.Vec3(0, 0, 1)
    const worldForward = new CANNON.Vec3()
    this.chassisBody.quaternion.vmult(forward, worldForward)
    return new THREE.Vector3(worldForward.x, worldForward.y, worldForward.z).normalize()
  }

  getRightVector(): THREE.Vector3 {
    const right = new CANNON.Vec3(1, 0, 0)
    const worldRight = new CANNON.Vec3()
    this.chassisBody.quaternion.vmult(right, worldRight)
    return new THREE.Vector3(worldRight.x, worldRight.y, worldRight.z).normalize()
  }

  getUpVector(): THREE.Vector3 {
    const up = new CANNON.Vec3(0, 1, 0)
    const worldUp = new CANNON.Vec3()
    this.chassisBody.quaternion.vmult(up, worldUp)
    return new THREE.Vector3(worldUp.x, worldUp.y, worldUp.z).normalize()
  }

  setHeadlights(on: boolean) {
    for (const light of this.headlightLights) {
      light.visible = on
    }
  }

  reset(pos: THREE.Vector3) {
    // Remove vehicle from world to flush ALL stale cannon-es contact constraints
    // from the crash frame. Without this, old wheel contacts generate forces at
    // the new spawn position and launch the car into buildings.
    this.vehicle.removeFromWorld(this.physicsWorld.world)

    // Spawn higher so the car doesn't clip into the ground on the first frame
    this.chassisBody.position.set(pos.x, pos.y + 4, pos.z)
    // Copy position to previousPosition so cannon-es doesn't compute a
    // spurious velocity from the teleport delta on the next integration step.
    this.chassisBody.previousPosition.copy(this.chassisBody.position)
    this.chassisBody.velocity.set(0, 0, 0)
    this.chassisBody.angularVelocity.set(0, 0, 0)
    this.chassisBody.quaternion.set(0, 0, 0, 1)
    this.chassisBody.previousQuaternion.copy(this.chassisBody.quaternion)
    this.chassisBody.force.set(0, 0, 0)
    this.chassisBody.torque.set(0, 0, 0)

    // Re-add vehicle with clean state
    this.vehicle.addToWorld(this.physicsWorld.world)

    // Clear all wheel forces
    for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
      this.vehicle.applyEngineForce(0, i)
      this.vehicle.setBrake(0, i)
      this.vehicle.setSteeringValue(0, i)
      const w = this.vehicle.wheelInfos[i]
      w.suspensionForce = 0
      w.engineForce = 0
      w.brake = 0
      w.steering = 0
      w.deltaRotation = 0
    }

    this.damage = 0
    this.smokeEmitting = false
    this.spawnImmunityTimer = 2.0
    this.rpm = 800
    this.speedKmh = 0
    this.gearIndex = 1

    // Reset deformation
    for (const dz of this.damageZones) {
      dz.mesh.position.copy(dz.originalPos)
      dz.mesh.rotation.copy(dz.originalRot)
    }
  }

  dispose() {
    this.vehicle?.removeFromWorld(this.physicsWorld.world)
    this.scene.remove(this.group)
    for (const wm of this.wheelMeshes) {
      this.scene.remove(wm)
    }
  }
}
