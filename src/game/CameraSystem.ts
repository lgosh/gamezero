import * as THREE from 'three'

export type CameraMode = 'chase' | 'cockpit' | 'hood'

export class CameraSystem {
  private camera: THREE.PerspectiveCamera
  private currentPos = new THREE.Vector3()
  private currentLookAt = new THREE.Vector3()
  private camDir = new THREE.Vector3(0, 0, 1)  // smoothed horizontal direction
  private shakeIntensity = 0
  private mode: CameraMode = 'chase'
  private initialized = false

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
    lookBack: boolean
  ) {
    // ── Direction used to place the camera behind the car ────────────────────
    // At speed: use flat velocity direction — unaffected by chassis pitch/bounce.
    // When slow/stopped: fall back to flat forward so camera doesn't freeze.
    const flatVel = new THREE.Vector3(carVelocity.x, 0, carVelocity.z)
    const flatFwd = new THREE.Vector3(carForward.x, 0, carForward.z)
    if (flatFwd.lengthSq() > 0.001) flatFwd.normalize()

    const useVel = flatVel.lengthSq() > 4  // roughly >2 m/s
    const targetDir = useVel ? flatVel.normalize() : flatFwd

    // Lazy follow — camera direction lags behind car, feels like GTA
    this.camDir.lerp(targetDir, Math.min(1, dt * 3)).normalize()

    const dir = lookBack ? this.camDir.clone().negate() : this.camDir.clone()

    if (this.mode === 'chase') {
      const height = 2.5
      const dist   = 5.5

      const idealPos    = carPos.clone().sub(dir.clone().multiplyScalar(dist)).add(new THREE.Vector3(0, height, 0))
      const idealLookAt = carPos.clone().add(new THREE.Vector3(0, 0.8, 0))

      if (!this.initialized) {
        this.currentPos.copy(idealPos)
        this.currentLookAt.copy(idealLookAt)
        this.camDir.copy(targetDir)
        this.initialized = true
      }

      this.currentPos.lerp(idealPos, Math.min(1, dt * 4))
      this.currentLookAt.lerp(idealLookAt, Math.min(1, dt * 8))

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

  updateOnFoot(playerPos: THREE.Vector3, playerForward: THREE.Vector3, dt: number) {
    const idealPos = playerPos.clone()
      .sub(playerForward.clone().multiplyScalar(5))
      .add(new THREE.Vector3(0, 2.4, 0))
    const idealLookAt = playerPos.clone().add(new THREE.Vector3(0, 1.4, 0))

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
  }
}
