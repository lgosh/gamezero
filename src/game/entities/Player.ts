import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import type { PhysicsWorld } from '../PhysicsWorld'
import type { InputState } from '../InputManager'

const SKIN   = 0x3d2b1f // CJ Skin tone
const SHIRT  = 0xffffff // White tank top
const JEANS  = 0x2b3d5c // Blue jeans
const SHOE   = 0x111111 // Black sneakers
const HAIR   = 0x111111 // CJ Buzz cut

const WALK_SPEED   = 4.5   // m/s forward
const SPRINT_SPEED = 9.0   // m/s sprint
const BACK_SPEED   = 2.8   // m/s backward
const TURN_SPEED   = 2.0   // rad/s (A/D secondary)
const MOUSE_SENS   = 0.003 // rad/pixel

function box(w: number, h: number, d: number, color: number) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  )
}

function cyl(rt: number, rb: number, h: number, color: number) {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(rt, rb, h, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  )
}

export class Player {
  /** Root Three.js group — base is at feet level */
  group: THREE.Group
  body: CANNON.Body

  private heading: number
  private cameraPitch = 0
  private walkTime = 0
  private jumpCooldown = 0

  private leftLegGroup!: THREE.Group
  private rightLegGroup!: THREE.Group
  private leftArmGroup!: THREE.Group
  private rightArmGroup!: THREE.Group

  constructor(
    private scene: THREE.Scene,
    private physics: PhysicsWorld,
    startPos: THREE.Vector3,
    startHeading: number
  ) {
    this.heading = startHeading
    this.group = new THREE.Group()
    this.group.scale.setScalar(0.85) // CJ is a bit taller/beefier
    scene.add(this.group)
    this.buildMesh()

    // Sphere physics body — radius 0.4, center at feet+0.4
    this.body = new CANNON.Body({ mass: 75, material: physics.groundMaterial })
    this.body.addShape(new CANNON.Sphere(0.4))
    this.body.position.set(startPos.x, startPos.y + 0.4, startPos.z)
    this.body.linearDamping = 0.8 // Reduced from 0.95
    this.body.angularDamping = 1.0
    this.body.fixedRotation = true
    this.body.allowSleep = false
    physics.world.addBody(this.body)
  }

  private buildMesh() {
    const g = this.group

    // ── Legs (pivot point = hip) ───────────────────────────────────────────
    for (const [side, isLeft] of [[-0.15, true], [0.15, false]] as [number, boolean][]) {
      const legGroup = new THREE.Group()
      legGroup.position.set(side, 0.95, 0)

      // Upper leg (jeans)
      const upperLeg = box(0.22, 0.5, 0.22, JEANS)
      upperLeg.position.set(0, -0.25, 0)
      legGroup.add(upperLeg)

      // Lower leg (jeans)
      const lowerLeg = box(0.18, 0.45, 0.18, JEANS)
      lowerLeg.position.set(0, -0.65, 0)
      legGroup.add(lowerLeg)

      // Shoe
      const shoe = box(0.2, 0.12, 0.35, SHOE)
      shoe.position.set(0, -0.88, 0.08)
      legGroup.add(shoe)

      if (isLeft) {
        this.leftLegGroup = legGroup
      } else {
        this.rightLegGroup = legGroup
      }
      g.add(legGroup)
    }

    // ── Hips ─────────────────────────────────────────────────────────────────
    const hips = box(0.48, 0.25, 0.28, JEANS)
    hips.position.set(0, 0.85, 0)
    g.add(hips)

    // ── Torso (CJ's White Tank Top) ─────────────────────────────────────────
    const torso = box(0.5, 0.55, 0.3, SHIRT)
    torso.position.set(0, 1.25, 0)
    g.add(torso)
    
    // Tank top "shoulders" - thinner than regular shirt
    const shoulderL = box(0.12, 0.1, 0.3, SHIRT)
    shoulderL.position.set(-0.19, 1.5, 0)
    g.add(shoulderL)
    const shoulderR = box(0.12, 0.1, 0.3, SHIRT)
    shoulderR.position.set(0.19, 1.5, 0)
    g.add(shoulderR)

    // ── Arms (pivot = shoulder) ───────────────────────────────────────────────
    for (const [side, isLeft] of [[-0.32, true], [0.32, false]] as [number, boolean][]) {
      const armGroup = new THREE.Group()
      armGroup.position.set(side, 1.45, 0)

      // Upper arm (CJ is muscly - use SKIN for tank top look)
      const upper = cyl(0.09, 0.08, 0.42, SKIN)
      upper.position.set(0, -0.21, 0)
      armGroup.add(upper)

      const lower = cyl(0.08, 0.07, 0.38, SKIN)
      lower.position.set(0, -0.55, 0)
      armGroup.add(lower)

      const hand = box(0.11, 0.12, 0.11, SKIN)
      hand.position.set(0, -0.75, 0)
      armGroup.add(hand)

      if (isLeft) {
        this.leftArmGroup = armGroup
      } else {
        this.rightArmGroup = armGroup
      }
      g.add(armGroup)
    }

    // ── Neck ─────────────────────────────────────────────────────────────────
    const neck = cyl(0.08, 0.09, 0.15, SKIN)
    neck.position.set(0, 1.55, 0)
    g.add(neck)

    // ── Head (CJ) ───────────────────────────────────────────────────────────
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 12, 10),
      new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.85 })
    )
    head.position.set(0, 1.78, 0)
    g.add(head)
    
    // Buzz cut (Hair)
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.245, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.9 })
    )
    hair.position.set(0, 1.8, 0)
    g.add(hair)
  }

  update(input: InputState, dt: number) {
    // Mouse X rotates heading; A/D as secondary
    this.heading -= input.mouseDx * MOUSE_SENS
    this.heading -= input.steering * TURN_SPEED * dt

    // Mouse Y adjusts camera pitch (clamped)
    this.cameraPitch -= input.mouseDy * MOUSE_SENS
    this.cameraPitch = Math.max(-0.7, Math.min(0.7, this.cameraPitch))

    // Forward/back velocity + sprint
    const moveForward = input.throttle > 0.05
    const moveBack    = input.brake > 0.05
    const speed = moveForward
      ? (input.sprint ? SPRINT_SPEED : WALK_SPEED)
      : moveBack ? -BACK_SPEED : 0

    this.body.velocity.x = Math.sin(this.heading) * speed
    this.body.velocity.z = Math.cos(this.heading) * speed
    this.body.angularVelocity.set(0, 0, 0)

    // Jump — only when on/near ground (low vertical velocity)
    if (this.jumpCooldown > 0) this.jumpCooldown -= dt
    if (input.jump && this.jumpCooldown <= 0 && Math.abs(this.body.velocity.y) < 1.0) {
      this.body.velocity.y = 7.0
      this.jumpCooldown = 0.5
    }

    // Walk animation — faster when sprinting
    const isMoving = Math.abs(speed) > 0.1 || Math.abs(input.steering) > 0.1
    if (isMoving) this.walkTime += dt * Math.abs(speed) * 1.4
    const swing = isMoving ? Math.sin(this.walkTime) * 0.55 : 0

    this.leftLegGroup.rotation.x  =  swing
    this.rightLegGroup.rotation.x = -swing
    this.leftArmGroup.rotation.x  = -swing * 0.5
    this.rightArmGroup.rotation.x =  swing * 0.5

    // Sync visual
    this.group.position.set(this.body.position.x, this.body.position.y - 0.4, this.body.position.z)
    this.group.rotation.y = this.heading
  }

  getCameraPitch(): number { return this.cameraPitch }

  getPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    )
  }

  getForwardVector(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading))
  }

  dispose() {
    this.physics.world.removeBody(this.body)
    this.scene.remove(this.group)
  }
}
