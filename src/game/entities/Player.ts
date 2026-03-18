import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import type { PhysicsWorld } from '../PhysicsWorld'
import type { InputState } from '../InputManager'
import { disposeObject3D } from '../disposeObject3D'

const SKIN   = 0x3d2b1f // CJ Skin tone
const SHIRT  = 0xffffff // White tank top
const JEANS  = 0x2b3d5c // Blue jeans
const SHOE   = 0x111111 // Black sneakers
const HAIR   = 0x111111 // CJ Buzz cut
const GUN_DARK  = 0x222222
const GUN_LIGHT = 0x333333

const WALK_SPEED   = 4.5   // m/s forward
const SPRINT_SPEED = 9.0   // m/s sprint
const BACK_SPEED   = 2.8   // m/s backward
const TURN_SPEED   = 2.0   // rad/s (A/D secondary)
const MOUSE_SENS   = 0.003 // rad/pixel

const SHOOT_COOLDOWN = 0.12  // ~8 rounds/sec
const RECOIL_DURATION = 0.08
const FLASH_DURATION = 0.05
const MAGAZINE_SIZE = 20
const RELOAD_TIME = 1.5  // seconds

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

/** Build a Glock pistol from box primitives */
export function buildGlockMesh(): THREE.Group {
  const gun = new THREE.Group()

  // Grip
  const grip = box(0.04, 0.10, 0.07, GUN_DARK)
  grip.position.set(0, -0.05, 0)
  gun.add(grip)

  // Slide (top of gun)
  const slide = box(0.035, 0.04, 0.14, GUN_DARK)
  slide.position.set(0, 0.02, -0.04)
  gun.add(slide)

  // Barrel (extends past slide)
  const barrel = box(0.02, 0.02, 0.03, GUN_LIGHT)
  barrel.position.set(0, 0.01, -0.12)
  gun.add(barrel)

  // Trigger guard
  const guard = box(0.035, 0.015, 0.04, GUN_LIGHT)
  guard.position.set(0, -0.03, -0.02)
  gun.add(guard)

  return gun
}

/** Build muzzle flash — a small bright plane at the barrel tip */
export function buildMuzzleFlash(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(0.12, 0.12)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffcc00,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const flash = new THREE.Mesh(geo, mat)
  flash.position.set(0, 0.01, -0.145)
  flash.rotation.y = Math.PI / 2
  return flash
}

export type WeaponType = 'fist' | 'glock'

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

  // Weapon system
  private weapon: WeaponType = 'fist'
  private magazineAmmo = MAGAZINE_SIZE
  private reserveAmmo = 100
  private shootCooldown = 0
  private recoilTimer = 0
  private muzzleFlashTimer = 0
  private reloading = false
  private reloadTimer = 0
  private glockMesh!: THREE.Group
  private muzzleFlash!: THREE.Mesh
  shotFired = false      // read by GameEngine to trigger gunshot sound
  reloadStarted = false  // read by GameEngine to trigger reload sound

  // Health system
  armor = 100
  health = 100
  dead = false
  private deathTimer = 0
  private readonly RESPAWN_DELAY = 3.0

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
    this.body = new CANNON.Body({ mass: 5, material: physics.playerMaterial })
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

    // ── Glock (attached to right hand, hidden by default) ──────────────────
    this.glockMesh = buildGlockMesh()
    this.glockMesh.position.set(0, -0.82, 0)
    this.glockMesh.visible = false
    this.rightArmGroup.add(this.glockMesh)

    this.muzzleFlash = buildMuzzleFlash()
    this.glockMesh.add(this.muzzleFlash)

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
    // No movement when dead
    if (this.dead) {
      this.body.velocity.set(0, this.body.velocity.y, 0)
      return
    }

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

    // Weapon switch (can't switch while reloading)
    if (input.weaponSwitch && !this.reloading) {
      this.weapon = this.weapon === 'fist' ? 'glock' : 'fist'
      this.glockMesh.visible = this.weapon === 'glock'
    }

    // Reload logic
    if (this.reloading) {
      this.reloadTimer -= dt
      if (this.reloadTimer <= 0) {
        this.reloading = false
        const needed = MAGAZINE_SIZE - this.magazineAmmo
        const canTake = Math.min(needed, this.reserveAmmo)
        this.magazineAmmo += canTake
        this.reserveAmmo -= canTake
      }
    }

    // Manual reload (R) or auto-reload when magazine empty
    const wantsReload = this.weapon === 'glock' && !this.reloading && this.reserveAmmo > 0
    if (wantsReload && (input.reload && this.magazineAmmo < MAGAZINE_SIZE || this.magazineAmmo === 0)) {
      this.reloading = true
      this.reloadTimer = RELOAD_TIME
      this.reloadStarted = true
    }

    // Shooting (can't shoot while reloading)
    this.shootCooldown = Math.max(0, this.shootCooldown - dt)
    this.recoilTimer = Math.max(0, this.recoilTimer - dt)
    this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt)

    if (this.weapon === 'glock' && !this.reloading && input.shoot && this.shootCooldown <= 0 && this.magazineAmmo > 0) {
      this.magazineAmmo--
      this.shootCooldown = SHOOT_COOLDOWN
      this.recoilTimer = RECOIL_DURATION
      this.muzzleFlashTimer = FLASH_DURATION
      this.shotFired = true

      // Randomize flash scale for variation
      const s = 0.8 + Math.random() * 0.6
      this.muzzleFlash.scale.set(s, s, s)
    }

    // Muzzle flash visibility
    const flashMat = this.muzzleFlash.material as THREE.MeshBasicMaterial
    flashMat.opacity = this.muzzleFlashTimer > 0 ? 1 : 0
    this.muzzleFlash.visible = this.muzzleFlashTimer > 0

    // Walk animation — faster when sprinting
    const isMoving = Math.abs(speed) > 0.1 || Math.abs(input.steering) > 0.1
    if (isMoving) this.walkTime += dt * Math.abs(speed) * 1.4
    const swing = isMoving ? Math.sin(this.walkTime) * 0.55 : 0

    this.leftLegGroup.rotation.x  =  swing
    this.rightLegGroup.rotation.x = -swing

    if (this.weapon === 'glock') {
      // Right arm held forward aiming — recoil kicks it back briefly
      const recoilKick = this.recoilTimer > 0 ? this.recoilTimer * 8 : 0
      this.rightArmGroup.rotation.x = -1.2 + recoilKick
      // Left arm still swings
      this.leftArmGroup.rotation.x = -swing * 0.5
    } else {
      this.leftArmGroup.rotation.x  = -swing * 0.5
      this.rightArmGroup.rotation.x =  swing * 0.5
    }

    // Sync visual
    this.group.position.set(this.body.position.x, this.body.position.y - 0.4, this.body.position.z)
    this.group.rotation.y = this.heading
  }

  getWeapon(): WeaponType { return this.weapon }
  getAmmo(): { magazine: number; reserve: number } {
    return { magazine: this.magazineAmmo, reserve: this.reserveAmmo }
  }
  getMuzzleFlashActive(): boolean { return this.muzzleFlashTimer > 0 }
  isReloading(): boolean { return this.reloading }

  /** Apply damage — armor absorbs first, then health */
  takeDamage(amount: number) {
    if (this.dead) return
    if (this.armor > 0) {
      const armorDmg = Math.min(this.armor, amount)
      this.armor -= armorDmg
      amount -= armorDmg
    }
    if (amount > 0) {
      this.health = Math.max(0, this.health - amount)
    }
    if (this.health <= 0) {
      this.dead = true
      this.deathTimer = this.RESPAWN_DELAY
    }
  }

  /** Tick death timer, returns true when ready to respawn */
  updateDeath(dt: number): boolean {
    if (!this.dead) return false
    this.deathTimer -= dt
    return this.deathTimer <= 0
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
    disposeObject3D(this.group)
    this.scene.remove(this.group)
  }
}
