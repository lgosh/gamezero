import * as THREE from 'three'
import { PhysicsWorld } from './PhysicsWorld'
import { InputManager } from './InputManager'
import { SoundSystem } from './SoundSystem'
import { CameraSystem } from './CameraSystem'
import { ParticleSystem } from './ParticleSystem'
import { TbilisiMap } from './world/TbilisiMap'
import { BMW } from './entities/BMW'
import { Mercedes } from './entities/Mercedes'
import { Player } from './entities/Player'
import type { Car } from './entities/Car'

export type CarType = 'bmw' | 'mercedes'
export type GameState = 'loading' | 'playing' | 'paused' | 'crashed'
type GameMode = 'driving' | 'onfoot'

export interface HUDState {
  speed: number
  rpm: number
  gear: number
  damage: number
  state: GameState
  carType: CarType
  onFoot?: boolean
}

export class GameEngine {
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private renderer!: THREE.WebGLRenderer
  private clock!: THREE.Clock

  private physicsWorld!: PhysicsWorld
  private inputManager!: InputManager
  private soundSystem!: SoundSystem
  private cameraSystem!: CameraSystem
  private particleSystem!: ParticleSystem
  private map!: TbilisiMap
  private car!: Car
  private player: Player | null = null
  private gameMode: GameMode = 'driving'

  private state: GameState = 'loading'
  private carType: CarType = 'bmw'

  private animationId = 0
  private onHUDUpdate?: (state: HUDState) => void
  private lastHUDState: HUDState = {
    speed: 0, rpm: 800, gear: 1, damage: 0, state: 'loading', carType: 'bmw',
  }

  // Camera cycle
  private readonly CAMERA_MODES = ['chase', 'cockpit', 'hood'] as const
  private cameraModeIndex = 0

  // Tire squeal tracking
  private lastSpeedKmh = 0
  private hornActive = false
  private lastGear = 1

  // Smoke timer
  private smokeTimer = 0

  init(canvas: HTMLCanvasElement, carType: CarType, onHUDUpdate: (s: HUDState) => void) {
    this.carType = carType
    this.onHUDUpdate = onHUDUpdate

    // ─── Renderer ─────────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap  // PCFSoft is slower
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    // ─── Scene & Camera ───────────────────────────────────────────────────────
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(68, canvas.clientWidth / canvas.clientHeight, 0.3, 1200)

    // ─── Systems ──────────────────────────────────────────────────────────────
    this.clock = new THREE.Clock()
    this.physicsWorld = new PhysicsWorld()
    this.inputManager = new InputManager()
    this.soundSystem = new SoundSystem()
    this.cameraSystem = new CameraSystem(this.camera)
    this.particleSystem = new ParticleSystem(this.scene)

    // ─── World ────────────────────────────────────────────────────────────────
    this.map = new TbilisiMap(this.scene, this.physicsWorld)
    this.map.build()

    // ─── Car ─────────────────────────────────────────────────────────────────
    const startPos = new THREE.Vector3(0, 1, 55)
    if (carType === 'bmw') {
      this.car = new BMW(this.scene, this.physicsWorld)
      ;(this.car as BMW).spawn(startPos)
    } else {
      this.car = new Mercedes(this.scene, this.physicsWorld)
      ;(this.car as Mercedes).spawn(startPos)
    }

    // Wire crash sound + camera shake to physics impacts
    this.car.onImpact = (impact: number) => {
      this.soundSystem.playCrash(Math.min(impact / 22, 1))
      this.cameraSystem.shake(impact * 0.12)
    }

    // ─── Resize ───────────────────────────────────────────────────────────────
    window.addEventListener('resize', this.onResize)

    this.state = 'playing'
  }

  start() {
    this.soundSystem.init()
    this.clock.start()
    this.loop()
  }

  private loop = () => {
    this.animationId = requestAnimationFrame(this.loop)

    const rawDt = this.clock.getDelta()
    const dt = Math.min(rawDt, 0.05) // cap at 50ms to avoid spiral of death

    // ESC toggles pause regardless of current state (check every frame)
    const input = this.inputManager.getState(dt)
    if (input.pauseToggle && this.state !== 'crashed') {
      this.togglePause()
    }

    // F — exit/enter car
    if (input.exitEnterToggle && this.state === 'playing') {
      if (this.gameMode === 'driving' && this.car.speedKmh < 2) {
        this.exitCar()
      } else if (this.gameMode === 'onfoot') {
        this.tryEnterCar()
      }
    }

    if (this.state === 'playing') {
      this.update(dt, input)
    }
    this.renderer.render(this.scene, this.camera)
  }

  private update(dt: number, input: ReturnType<typeof this.inputManager.getState>) {
    // Physics step
    this.physicsWorld.step(dt)
    this.map.syncProps()

    // ── On-foot mode ─────────────────────────────────────────────────────────
    if (this.gameMode === 'onfoot' && this.player) {
      this.player.update(input, dt)
      const playerPos = this.player.getPosition()
      const playerFwd = this.player.getForwardVector()
      this.cameraSystem.updateOnFoot(playerPos, playerFwd, dt)
      this.particleSystem.update(dt)
      this.lastHUDState = {
        speed: 0, rpm: 0, gear: 1, damage: this.car.damage,
        state: this.state, carType: this.carType, onFoot: true,
      }
      this.onHUDUpdate?.(this.lastHUDState)
      return
    }

    // ── Driving mode ─────────────────────────────────────────────────────────

    // Horn
    if (input.honk && !this.hornActive) {
      this.soundSystem.startHorn()
      this.hornActive = true
    } else if (!input.honk && this.hornActive) {
      this.soundSystem.stopHorn()
      this.hornActive = false
    }

    // Car update
    const { rpm, speedKmh, gear, lateralSpeedMs } = this.car.update(input, dt)

    // Gear change sound — only for actual drive gears (≥2), not R or N
    if (gear !== this.lastGear) {
      if (gear >= 2 && this.lastGear >= 2) {
        this.soundSystem.playGearChange(gear > this.lastGear)
      }
      this.lastGear = gear
    }

    // Sound updates
    this.soundSystem.updateEngine(rpm, input.throttle)
    this.soundSystem.updateWind(speedKmh)

    // Tire squeal — driven by actual lateral slide velocity, not just inputs
    const slideSqueal = Math.min(lateralSpeedMs / 6, 1.0)
    const brakeSqueal = input.brake > 0 && speedKmh > 20 ? Math.min(speedKmh / 80, 1.0) * 0.7 : 0
    const tireIntensity = Math.max(slideSqueal, brakeSqueal)
    this.soundSystem.updateTire(tireIntensity)
    this.lastSpeedKmh = speedKmh

    // Particles
    this.smokeTimer += dt
    if (this.smokeTimer > 0.12) {
      this.smokeTimer = 0
      const exhaustPos = this.car.getPosition()
        .add(new THREE.Vector3(0, -0.2, -2.5)
          .applyQuaternion(this.car.group.quaternion))
      if (input.throttle > 0.8) this.particleSystem.emitDust(exhaustPos, 2)
      if (this.car.smokeEmitting) this.particleSystem.emitSmoke(exhaustPos, 3)
    }
    this.particleSystem.update(dt)

    // Camera
    const carPos = this.car.getPosition()
    const carFwd = this.car.getForwardVector()
    const carUp = this.car.getUpVector()
    this.cameraSystem.update(carPos, carFwd, carUp, speedKmh, dt, input.lookBack)

    if (input.cameraToggle) {
      this.cameraModeIndex = (this.cameraModeIndex + 1) % this.CAMERA_MODES.length
      this.cameraSystem.setMode(this.CAMERA_MODES[this.cameraModeIndex])
    }

    // Crash check
    if (this.car.damage >= 1.0 && this.state !== 'crashed') {
      this.state = 'crashed'
      this.soundSystem.stopEngine()
    }

    // HUD update
    this.lastHUDState = {
      speed: Math.round(speedKmh),
      rpm: Math.round(rpm),
      gear,
      damage: this.car.damage,
      state: this.state,
      carType: this.carType,
      onFoot: false,
    }
    this.onHUDUpdate?.(this.lastHUDState)
  }

  private exitCar() {
    const carPos = this.car.getPosition()
    const right = this.car.getRightVector()
    // Spawn player at car right door, slightly above ground
    const spawnPos = carPos.clone().add(right.multiplyScalar(2.4))
    spawnPos.y = 1.0

    const carFwd = this.car.getForwardVector()
    const heading = Math.atan2(carFwd.x, carFwd.z)

    this.player = new Player(this.scene, this.physicsWorld, spawnPos, heading)
    this.car.chassisBody.sleep()
    this.car.setHeadlights(false)
    this.soundSystem.stopEngineKey()
    this.gameMode = 'onfoot'
    this.cameraSystem.reset()
  }

  private tryEnterCar() {
    if (!this.player) return
    const dist = this.player.getPosition().distanceTo(this.car.getPosition())
    if (dist > 5) return  // too far from car

    this.player.dispose()
    this.player = null
    this.car.chassisBody.wakeUp()
    this.car.setHeadlights(true)
    this.soundSystem.startEngine()
    this.gameMode = 'driving'
    this.cameraSystem.reset()
  }

  resetCar() {
    // Dispose player if on foot
    if (this.player) {
      this.player.dispose()
      this.player = null
    }
    this.gameMode = 'driving'

    const startPos = new THREE.Vector3(0, 1, 55)
    this.car.reset(startPos)
    this.car.chassisBody.wakeUp()
    this.car.setHeadlights(true)
    this.cameraSystem.reset()
    this.state = 'playing'
    this.clock.start()
    this.soundSystem.resumeAll()
    this.onHUDUpdate?.({ ...this.lastHUDState, state: 'playing', damage: 0, onFoot: false })
  }

  setCameraMode(mode: 'chase' | 'cockpit' | 'hood') {
    this.cameraSystem.setMode(mode)
  }

  setMute(muted: boolean) {
    this.soundSystem.setMute(muted)
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused'
      this.clock.stop()
      this.soundSystem.pauseAll()
      this.onHUDUpdate?.({ ...this.lastHUDState, state: 'paused' })
    } else if (this.state === 'paused') {
      this.state = 'playing'
      this.clock.start()
      this.soundSystem.resumeAll()
      this.onHUDUpdate?.({ ...this.lastHUDState, state: 'playing' })
    }
  }

  private onResize = () => {
    const canvas = this.renderer.domElement
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  destroy() {
    cancelAnimationFrame(this.animationId)
    window.removeEventListener('resize', this.onResize)
    this.inputManager.destroy()
    this.soundSystem.destroy()
    this.car.dispose()
    this.renderer.dispose()
  }
}
