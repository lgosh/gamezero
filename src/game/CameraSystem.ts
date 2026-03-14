import * as THREE from 'three'

export type CameraMode = 'chase' | 'cockpit' | 'hood'

export class CameraSystem {
  private camera: THREE.PerspectiveCamera
  private currentPos = new THREE.Vector3()
  private currentLookAt = new THREE.Vector3()
  private shakeIntensity = 0
  private mode: CameraMode = 'chase'
  private initialized = false

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
  }

  setMode(mode: CameraMode) {
    this.mode = mode
    this.initialized = false  // snap to correct position immediately on mode change
  }

  update(
    carPos: THREE.Vector3,
    carForward: THREE.Vector3,
    carUp: THREE.Vector3,
    speedKmh: number,
    dt: number,
    lookBack: boolean
  ) {
    const dir = lookBack ? carForward.clone().negate() : carForward.clone()

    if (this.mode === 'chase') {
      const heightBase = 3.5
      const distBase = 9
      const extraHeight = Math.min(speedKmh * 0.006, 1.5)
      const extraDist = Math.min(speedKmh * 0.015, 3)

      const idealPos = carPos
        .clone()
        .sub(dir.clone().multiplyScalar(distBase + extraDist))
        .add(new THREE.Vector3(0, heightBase + extraHeight, 0))

      const idealLookAt = carPos.clone().add(new THREE.Vector3(0, 1.0, 0))

      if (!this.initialized) {
        this.currentPos.copy(idealPos)
        this.currentLookAt.copy(idealLookAt)
        this.initialized = true
      }

      const posFactor = Math.min(1, dt * 4)
      const lookFactor = Math.min(1, dt * 8)

      this.currentPos.lerp(idealPos, posFactor)
      this.currentLookAt.lerp(idealLookAt, lookFactor)

    } else if (this.mode === 'cockpit') {
      const cockpitOffset = new THREE.Vector3(0, 1.2, 0.4)
      const worldOffset = cockpitOffset.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          carForward
        )
      )
      this.currentPos.copy(carPos).add(worldOffset)
      this.currentLookAt.copy(carPos).add(carForward.clone().multiplyScalar(10)).add(new THREE.Vector3(0, 1.2, 0))

    } else if (this.mode === 'hood') {
      const hoodOffset = new THREE.Vector3(0, 1.5, 2.0)
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        carForward
      )
      this.currentPos.copy(carPos).add(hoodOffset.applyQuaternion(q))
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

  /** Third-person follow camera for on-foot mode */
  updateOnFoot(playerPos: THREE.Vector3, playerForward: THREE.Vector3, dt: number) {
    const behindDist = 5
    const height = 2.4

    const idealPos = playerPos
      .clone()
      .sub(playerForward.clone().multiplyScalar(behindDist))
      .add(new THREE.Vector3(0, height, 0))

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
