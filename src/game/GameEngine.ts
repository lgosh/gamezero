import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass'
import { PhysicsWorld } from './PhysicsWorld'
import { InputManager } from './InputManager'
import { SoundSystem } from './SoundSystem'
import { CameraSystem } from './CameraSystem'
import { ParticleSystem } from './ParticleSystem'
import { OSMMap } from './world/OSMMap'
import { BMW } from './entities/BMW'
import { Mercedes } from './entities/Mercedes'
import { Player } from './entities/Player'
import type { Car } from './entities/Car'
import { NetworkManager } from './NetworkManager'
import type { RemotePlayerData, ChatMessage } from './NetworkManager'
import { RemotePlayer } from './RemotePlayer'

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
  playerPos?: { x: number; z: number }
  playerHeading?: number
}

export class GameEngine {
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private renderer!: THREE.WebGLRenderer
  private composer!: EffectComposer
  private clock!: THREE.Clock

  private physicsWorld!: PhysicsWorld
  private inputManager!: InputManager
  private soundSystem!: SoundSystem
  private cameraSystem!: CameraSystem
  private particleSystem!: ParticleSystem
  private map!: OSMMap
  private car!: Car
  private parkedCar!: Car   // second car always spawned at start
  private bmwCar!: Car      // stable reference — never swaps
  private mercedesCar!: Car // stable reference — never swaps
  private player: Player | null = null
  private gameMode: GameMode = 'driving'

  private state: GameState = 'loading'
  private carType: CarType = 'bmw'

  private animationId = 0
  private destroyed = false
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

  // Multiplayer
  private network: NetworkManager | null = null
  private remotePlayers = new Map<string, RemotePlayer>()
  private remoteStates  = new Map<string, RemotePlayerData>()
  private networkSendTimer = 0
  onChatMessage?: (msg: ChatMessage) => void

  // Smoke timer
  private smokeTimer = 0

  // Smoothed car Y — absorbs suspension bounce before it reaches the camera
  private smoothCarY = 0
  private smoothCarYInit = false

  async init(canvas: HTMLCanvasElement, carType: CarType, nickname: string, onHUDUpdate: (s: HUDState) => void): Promise<void> {
    this.carType = carType
    this.onHUDUpdate = onHUDUpdate

    // ─── Renderer ─────────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      logarithmicDepthBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    // ─── Scene & Camera ───────────────────────────────────────────────────────
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(68, canvas.clientWidth / canvas.clientHeight, 0.3, 1500)

    // ─── Post-processing ──────────────────────────────────────────────────────
    this.composer = new EffectComposer(this.renderer)
    const renderPass = new RenderPass(this.scene, this.camera)
    this.composer.addPass(renderPass)

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      0.18, // Reduced from 0.4
      0.4,  // radius
      0.9   // Increased threshold from 0.85
    )
    this.composer.addPass(bloomPass)

    const outputPass = new OutputPass()
    this.composer.addPass(outputPass)

    // ─── Environment map — critical for realistic metallic car paint ───────────
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    pmrem.compileEquirectangularShader()
    const envScene = new THREE.Scene()
    // Soft studio sky (top bright, sides mid, ground dark)
    const envSky = new THREE.Mesh(
      new THREE.SphereGeometry(50, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xdde8f0, side: THREE.BackSide })
    )
    envScene.add(envSky)
    const envGround = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshBasicMaterial({ color: 0x222222 })
    )
    envGround.rotation.x = -Math.PI / 2
    envScene.add(envGround)
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture
    pmrem.dispose()

    // ─── Systems ──────────────────────────────────────────────────────────────
    this.clock = new THREE.Clock()
    this.physicsWorld = new PhysicsWorld()
    this.inputManager = new InputManager()
    this.soundSystem = new SoundSystem()
    this.cameraSystem = new CameraSystem(this.camera)
    this.particleSystem = new ParticleSystem(this.scene)

    // ─── World ────────────────────────────────────────────────────────────────
    this.map = new OSMMap(this.scene, this.physicsWorld)
    await this.map.build()

    // ─── Cars — spawned on Rustaveli Ave near Freedom Square ─────────────────
    const mercedesPos = new THREE.Vector3(-10, 2.0, -10)
    const bmwPos      = new THREE.Vector3(  5, 2.0, -10)

    const mercedes = new Mercedes(this.scene, this.physicsWorld)
    const bmw      = new BMW(this.scene, this.physicsWorld)
    await Promise.all([mercedes.spawn(mercedesPos), bmw.spawn(bmwPos)])

    if (this.destroyed) {
      mercedes.dispose(); bmw.dispose()
      return
    }

    // Stable references — never swap
    this.bmwCar      = bmw
    this.mercedesCar = mercedes

    // Active car starts as BMW; the other is parked
    this.car = bmw; this.parkedCar = mercedes

    // Wire crash sound + camera shake to physics impacts
    const wireImpact = (car: Car) => {
      car.onImpact = (impact: number) => {
        if (car === this.car) {
          this.soundSystem.playCrash(Math.min(impact / 22, 1))
          this.cameraSystem.shake(impact * 0.12)
        }
      }
    }
    wireImpact(mercedes)
    wireImpact(bmw)

    // Both cars parked at start — player spawns on foot between them to choose
    this.car.chassisBody.sleep()
    this.parkedCar.chassisBody.sleep()
    const playerStart = new THREE.Vector3(0, 1.0, -10)
    this.player = new Player(this.scene, this.physicsWorld, playerStart, 0)
    this.gameMode = 'onfoot'

    // ─── Resize ───────────────────────────────────────────────────────────────
    window.addEventListener('resize', this.onResize)

    // ─── Multiplayer ──────────────────────────────────────────────────────────
    if (nickname.trim()) {
      this.network = new NetworkManager()
      this.network.onConnected = (_id, existing) => {
        for (const p of existing) this.addRemotePlayer(p)
      }
      this.network.onPlayerJoined = (data) => this.addRemotePlayer(data)
      this.network.onPlayerLeft   = (id)  => this.removeRemotePlayer(id)
      this.network.onStates = (players) => {
        for (const p of players) {
          this.remoteStates.set(p.id, p)
          const rp = this.remotePlayers.get(p.id)
          if (rp) rp.applyRemoteState(p)
          else    this.addRemotePlayer(p)
        }
      }
      this.network.onChat = (msg) => this.onChatMessage?.(msg)
      // Someone is carjacking our car — force-exit immediately
      this.network.onCarjack = (carId) => {
        if (this.gameMode === 'driving' && this.getLocalCarId() === carId) {
          this.exitCar()
        }
      }
      this.network.connect(nickname.trim())
    }

    this.state = 'playing'
  }

  private addRemotePlayer(data: RemotePlayerData) {
    if (this.remotePlayers.has(data.id)) return
    this.remoteStates.set(data.id, data)
    this.remotePlayers.set(data.id, new RemotePlayer(this.scene, data))
  }

  private removeRemotePlayer(id: string) {
    const rp = this.remotePlayers.get(id)
    if (rp) { rp.dispose(); this.remotePlayers.delete(id) }
    this.remoteStates.delete(id)
  }

  /** Move the actual game Car entity to wherever the remote player is driving it. */
  private updateRemoteCars() {
    for (const state of this.remoteStates.values()) {
      if (state.mode !== 'driving' || !state.carId) continue
      const car = state.carId === 'bmw' ? this.bmwCar : this.mercedesCar
      // Never override a car the local player is currently driving
      if (car === this.car && this.gameMode === 'driving') continue
      car.chassisBody.position.set(state.pos[0], state.pos[1], state.pos[2])
      car.chassisBody.quaternion.set(state.quat[0], state.quat[1], state.quat[2], state.quat[3])
      car.chassisBody.velocity.set(state.vel[0], state.vel[1], state.vel[2])
      car.syncVisual()
    }
  }

  private getLocalCarId(): string | null {
    if (this.gameMode !== 'driving') return null
    return this.car === this.bmwCar ? 'bmw' : 'mercedes'
  }

  private getRemoteDriverOf(carId: string): string | null {
    for (const [id, state] of this.remoteStates) {
      if (state.mode === 'driving' && state.carId === carId) return id
    }
    return null
  }

  start() {
    if (this.destroyed) return  // user may have navigated away while model was loading
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

    this.composer.render()
  }

  private update(dt: number, input: ReturnType<typeof this.inputManager.getState>) {
    // Physics step
    this.physicsWorld.step(dt)
    // Override remote-driven cars' positions BEFORE any syncVisual calls
    this.updateRemoteCars()
    this.map.syncProps()

    let currentPlayerPos = { x: 0, z: 0 }
    let currentHeading = 0

    // ── On-foot mode ─────────────────────────────────────────────────────────
    if (this.gameMode === 'onfoot' && this.player) {
      // Keep parked car meshes in sync with their physics bodies
      this.car.syncVisual()
      this.parkedCar.syncVisual()

      this.player.update(input, dt)
      const pPos = this.player.getPosition()
      const playerFwd = this.player.getForwardVector()
      this.cameraSystem.updateOnFoot(pPos, playerFwd, dt, this.player.getCameraPitch())
      this.particleSystem.update(dt)

      currentPlayerPos = { x: pPos.x, z: pPos.z }
      currentHeading = Math.atan2(playerFwd.x, playerFwd.z)

      this.lastHUDState = {
        speed: 0, rpm: 0, gear: 1, damage: this.car.damage,
        state: this.state, carType: this.car instanceof BMW ? 'bmw' : 'mercedes', onFoot: true,
        playerPos: currentPlayerPos, playerHeading: currentHeading,
      }
      this.onHUDUpdate?.(this.lastHUDState)

      // Network
      this.networkSendTimer += dt
      if (this.networkSendTimer >= 0.05) {
        this.networkSendTimer = 0
        this.sendNetworkState()
      }
      for (const rp of this.remotePlayers.values()) rp.update(dt)
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

    // Particles — 4 exhaust pipes (2 left, 2 right)
    this.smokeTimer += dt
    if (this.smokeTimer > 0.14) {
      this.smokeTimer = 0
      const q = this.car.group.quaternion
      const carPos = this.car.getPosition()
      const exhaustOffsets = [
        new THREE.Vector3(-0.55, -0.20, -2.4),
        new THREE.Vector3(-0.40, -0.20, -2.4),
        new THREE.Vector3( 0.40, -0.20, -2.4),
        new THREE.Vector3( 0.55, -0.20, -2.4),
      ]
      for (const off of exhaustOffsets) {
        const pos = carPos.clone().add(off.clone().applyQuaternion(q))
        if (input.throttle > 0.8) this.particleSystem.emitExhaust(pos)
        if (this.car.smokeEmitting) this.particleSystem.emitSmoke(pos, 1)
      }
    }
    this.particleSystem.update(dt)

    // Camera
    const rawCarPos = this.car.getPosition()

    // Low-pass filter the Y axis only — kills suspension bounce, preserves hill-following
    if (!this.smoothCarYInit) { this.smoothCarY = rawCarPos.y; this.smoothCarYInit = true }
    this.smoothCarY += (rawCarPos.y - this.smoothCarY) * Math.min(1, dt * 4)
    const carPos = new THREE.Vector3(rawCarPos.x, this.smoothCarY, rawCarPos.z)

    const carFwd = this.car.getForwardVector()
    const carUp = this.car.getUpVector()
    const v = this.car.chassisBody.velocity
    const carVel = new THREE.Vector3(v.x, v.y, v.z)
    this.cameraSystem.update(carPos, carFwd, carUp, carVel, speedKmh, dt, input.lookBack, input.mouseDx, input.mouseDy)

    if (input.cameraToggle) {
      this.cameraModeIndex = (this.cameraModeIndex + 1) % this.CAMERA_MODES.length
      this.cameraSystem.setMode(this.CAMERA_MODES[this.cameraModeIndex])
    }

    // Crash check
    if (this.car.damage >= 1.0 && this.state !== 'crashed') {
      this.state = 'crashed'
      this.soundSystem.stopEngine()
    }

    currentPlayerPos = { x: carPos.x, z: carPos.z }
    currentHeading = Math.atan2(carFwd.x, carFwd.z)

    // HUD update
    this.lastHUDState = {
      speed: Math.round(speedKmh),
      rpm: Math.round(rpm),
      gear,
      damage: this.car.damage,
      state: this.state,
      carType: this.car instanceof BMW ? 'bmw' : 'mercedes',
      onFoot: false,
      playerPos: currentPlayerPos,
      playerHeading: currentHeading,
    }
    this.onHUDUpdate?.(this.lastHUDState)

    // ── Network ────────────────────────────────────────────────────────────
    this.networkSendTimer += dt
    if (this.networkSendTimer >= 0.05) { // 20 Hz
      this.networkSendTimer = 0
      this.sendNetworkState()
    }
    for (const rp of this.remotePlayers.values()) rp.update(dt)
  }

  private sendNetworkState() {
    if (!this.network?.connected) return
    let pos: [number, number, number]
    let quat: [number, number, number, number]
    let vel: [number, number, number]
    let speedKmh = 0

    if (this.gameMode === 'onfoot' && this.player) {
      const p = this.player.getPosition()
      const fwd = this.player.getForwardVector()
      const yaw = Math.atan2(fwd.x, fwd.z)
      pos  = [p.x, p.y, p.z]
      quat = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]
      vel  = [0, 0, 0]
    } else {
      const p = this.car.getPosition()
      const b = this.car.chassisBody
      pos  = [p.x, p.y, p.z]
      quat = [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]
      vel  = [b.velocity.x, b.velocity.y, b.velocity.z]
      speedKmh = this.car.speedKmh
    }

    this.network.sendState({ pos, quat, vel, mode: this.gameMode, speedKmh, carId: this.getLocalCarId() })
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
    const pPos = this.player.getPosition()

    // Check proximity to both cars — enter whichever is closest within range
    const distActive = pPos.distanceTo(this.car.getPosition())
    const distParked = pPos.distanceTo(this.parkedCar.getPosition())
    const closest    = distActive <= distParked ? this.car : this.parkedCar
    const closestDist = Math.min(distActive, distParked)
    if (closestDist > 5) return

    // If a remote player is driving this car, carjack them (they get force-ejected)
    const closestCarId = closest === this.bmwCar ? 'bmw' : 'mercedes'
    const remoteDriverId = this.getRemoteDriverOf(closestCarId)
    if (remoteDriverId) {
      this.network?.sendCarjack(remoteDriverId, closestCarId)
      // Optimistically clear their occupancy so updateRemoteCars stops overriding the car
      const rs = this.remoteStates.get(remoteDriverId)
      if (rs) this.remoteStates.set(remoteDriverId, { ...rs, mode: 'onfoot', carId: null })
    }

    // Swap active/parked if entering the parked car
    if (closest === this.parkedCar) {
      const tmp = this.car; this.car = this.parkedCar; this.parkedCar = tmp
    }

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

    const startPos = new THREE.Vector3(0, 2.0, -10)
    this.car.reset(startPos)
    this.smoothCarYInit = false
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
    this.cameraModeIndex = this.CAMERA_MODES.indexOf(mode)
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

  sendChat(text: string) {
    this.network?.sendChat(text)
  }

  toggleTimeOfDay() {
    if (!this.map || !this.map.lighting) return
    const current = this.map.lighting.getMode()
    this.map.lighting.setMode(current === 'day' ? 'night' : 'day')
  }

  private onResize = () => {
    const canvas = this.renderer.domElement
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.animationId)
    window.removeEventListener('resize', this.onResize)
    this.inputManager?.destroy()
    this.soundSystem?.destroy()
    this.car?.dispose()
    this.parkedCar?.dispose()
    this.network?.destroy()
    for (const rp of this.remotePlayers.values()) rp.dispose()
    this.remotePlayers.clear()
    this.remoteStates.clear()
    this.renderer?.dispose()
  }
}

