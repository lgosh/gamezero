import * as THREE from 'three'

export type CameraMode = 'chase' | 'cockpit' | 'hood'

export class CameraSystem {
  private camera: THREE.PerspectiveCamera
  private currentPos = new THREE.Vector3()
  private currentLookAt = new THREE.Vector3()
  private shakeIntensity = 0
  private mode: CameraMode = 'chase'
  private initialized = false

  // Smoothed follow-direction for chase cam (GTA-style: direction smooths, position doesn't lag)
  private smoothFollowDir = new THREE.Vector3(0, 0, -1)

  // Mouse-look orbit state (chase mode only)
  private orbitYaw   = 0   // horizontal orbit offset (radians)
  private orbitPitch = 0   // vertical orbit offset (radians)
  private mouseIdleTime = 0
  private readonly RETURN_DELAY = 2.0     // seconds before auto-return starts
  private readonly SENSITIVITY  = 0.0025 // radians per pixel
  private readonly PITCH_MIN    = -0.25
  private readonly PITCH_MAX    =  0.50

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
  }

  setMode(mode: CameraMode) {
    this.mode = mode
    this.initialized = false
  }

  update(
    carPos: THREE.Vector3,
    carForward: THREE.Vector3,
    carUp: THREE.Vector3,
    carVelocity: THREE.Vector3,
    speedKmh: number,
    dt: number,
    lookBack: boolean,
    mouseDx = 0,
    mouseDy = 0
  ) {
    // Flatten forward to XZ — chassis pitch never tilts the camera offset
    const flatFwd = new THREE.Vector3(carForward.x, 0, carForward.z)
    if (flatFwd.lengthSq() < 0.001) flatFwd.set(0, 0, 1)
    else flatFwd.normalize()
    const dir = lookBack ? flatFwd.clone().negate() : flatFwd

    if (this.mode === 'chase') {
      const height = 2.5
      const dist   = 5.5

      // ── Mouse-look orbit ────────────────────────────────────────────────────
      if (mouseDx !== 0 || mouseDy !== 0) {
        this.orbitYaw   -= mouseDx * this.SENSITIVITY
        this.orbitPitch -= mouseDy * this.SENSITIVITY
        this.orbitPitch  = Math.max(this.PITCH_MIN, Math.min(this.PITCH_MAX, this.orbitPitch))
        this.mouseIdleTime = 0
      } else {
        this.mouseIdleTime += dt
      }

      // Auto-return to default after idle
      if (this.mouseIdleTime > this.RETURN_DELAY) {
        const returnSpeed = Math.min(1, dt * 2.5)
        this.orbitYaw   *= (1 - returnSpeed)
        this.orbitPitch *= (1 - returnSpeed)
        if (Math.abs(this.orbitYaw)   < 0.001) this.orbitYaw   = 0
        if (Math.abs(this.orbitPitch) < 0.001) this.orbitPitch = 0
      }

      // ── GTA-style: smooth the DIRECTION the camera follows behind the car ──
      // The camera position itself doesn't lerp — only the follow-direction smooths.
      // This eliminates the "left behind" lag while keeping cinematic sweep on turns.
      if (!this.initialized) {
        this.smoothFollowDir.copy(dir)
        this.currentLookAt.copy(carPos).add(new THREE.Vector3(0, 0.8, 0))
        this.initialized = true
      }

      // Tighter tracking at speed, looser at rest for cinematic feel
      const dirSmooth = Math.min(1, dt * (speedKmh > 5 ? 8 : 4))
      this.smoothFollowDir.lerp(dir, dirSmooth)
      this.smoothFollowDir.normalize()

      // Apply orbit to the smoothed direction
      const orbitedDir = this.smoothFollowDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.orbitYaw)
      const cosPitch   = Math.cos(this.orbitPitch)
      const sinPitch   = Math.sin(this.orbitPitch)

      // Position is set directly — no lerp, no lag
      this.currentPos.copy(carPos)
        .sub(orbitedDir.clone().multiplyScalar(dist * cosPitch))
        .add(new THREE.Vector3(0, height + dist * sinPitch, 0))

      // Look-at smooths slightly for cinematic feel
      const idealLookAt = carPos.clone().add(new THREE.Vector3(0, 0.8, 0))
      this.currentLookAt.lerp(idealLookAt, Math.min(1, dt * 25))

    } else if (this.mode === 'cockpit') {
      const right = new THREE.Vector3().crossVectors(carUp, carForward).normalize()
      const rot = new THREE.Matrix4().makeBasis(right, carUp, carForward)
      const q = new THREE.Quaternion().setFromRotationMatrix(rot)
      const headOffset = new THREE.Vector3(0, 0.85, 0.65).applyQuaternion(q)
      this.currentPos.copy(carPos).add(headOffset)
      this.currentLookAt.copy(carPos)
        .add(carForward.clone().multiplyScalar(25))
        .add(new THREE.Vector3(0, 0.75, 0))

    } else if (this.mode === 'hood') {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), carForward)
      this.currentPos.copy(carPos).add(new THREE.Vector3(0, 1.5, 2.0).applyQuaternion(q))
      this.currentLookAt.copy(carPos)
        .add(carForward.clone().multiplyScalar(20))
        .add(new THREE.Vector3(0, 1.5, 0))
    }

    // Apply shake
    if (this.shakeIntensity > 0.001) {
      const s = this.shakeIntensity
      this.currentPos.x += (Math.random() - 0.5) * s
      this.currentPos.y += (Math.random() - 0.5) * s * 0.5
      this.shakeIntensity *= 0.85
    }

    this.camera.position.copy(this.currentPos)
    this.camera.lookAt(this.currentLookAt)
  }

  updateOnFoot(playerPos: THREE.Vector3, playerForward: THREE.Vector3, dt: number, cameraPitch = 0) {
    const idealPos = playerPos.clone()
      .sub(playerForward.clone().multiplyScalar(5))
      .add(new THREE.Vector3(0, 2.4, 0))

    // Pitch shifts the look-at target up/down along forward axis
    const lookDist = 6
    const idealLookAt = playerPos.clone()
      .add(playerForward.clone().multiplyScalar(lookDist * Math.cos(cameraPitch)))
      .add(new THREE.Vector3(0, 1.4 + lookDist * Math.sin(cameraPitch), 0))

    if (!this.initialized) {
      this.currentPos.copy(idealPos)
      this.currentLookAt.copy(idealLookAt)
      this.initialized = true
    }

    this.currentPos.lerp(idealPos, Math.min(1, dt * 7))
    this.currentLookAt.lerp(idealLookAt, Math.min(1, dt * 12))

    this.camera.position.copy(this.currentPos)
    this.camera.lookAt(this.currentLookAt)
  }

  shake(intensity: number) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity * 0.8)
  }

  reset() {
    this.initialized = false
    this.shakeIntensity = 0
    this.orbitYaw = 0
    this.orbitPitch = 0
    this.mouseIdleTime = 0
  }
}
