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
import { Toyota } from './entities/Toyota'
import { Player } from './entities/Player'
import type { Car } from './entities/Car'
import { NetworkManager } from './NetworkManager'
import type { RemotePlayerData, ChatMessage } from './NetworkManager'
import { RemotePlayer } from './RemotePlayer'

export type CarType = 'bmw' | 'mercedes' | 'toyota'
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
  minimapCanvas?: HTMLCanvasElement
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
  private parkedCar!: Car   // whichever car the player last drove that isn't active
  private bmwCar!: Car      // stable reference — never swaps
  private mercedesCar!: Car // stable reference — never swaps
  private toyotaCar!: Car   // stable reference — never swaps
  private allCars: Car[] = []
  private player: Player | null = null
  private gameMode: GameMode = 'driving'

  // Spawn anchor — set during init, reused by resetCar/respawn
  private spawnCx = -90
  private spawnCz = 0
  private spawnHeading = 0
  private playerSpawnPos = new THREE.Vector3(-90, 1.0, 0)
  private bmwSpawnPos  = new THREE.Vector3(-85, 2.0, -5)
  private merSpawnPos  = new THREE.Vector3(-85, 2.0,  5)
  private toySpawnPos  = new THREE.Vector3(-85, 2.0, 0)

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

  // Noclip (free camera fly mode)
  private noclipMode  = false
  private noclipPos   = new THREE.Vector3()
  private noclipYaw   = 0
  private noclipPitch = 0
  onNoclipChange?: (active: boolean) => void

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

    // ─── Cars — spawned in front of Old Town Hall, side by side, facing the monument ──
    const monX = -137, monZ = -136
    const townhall = this.map.getLandmark('townhall')
    const base = townhall ?? { cx: -90, cz: 0 }
    const toMonDx = monX - base.cx, toMonDz = monZ - base.cz
    const toMonLen = Math.sqrt(toMonDx * toMonDx + toMonDz * toMonDz) || 1
    const toMonNx = toMonDx / toMonLen, toMonNz = toMonDz / toMonLen
    const perpX = -toMonNz, perpZ = toMonNx
    // Offset 50m toward monument — clear of the building, on the street outside
    this.spawnCx = base.cx + toMonNx * 50
    this.spawnCz = base.cz + toMonNz * 50
    this.spawnHeading = Math.atan2(monX - this.spawnCx, monZ - this.spawnCz)
    // Three cars side by side: BMW left, Toyota centre, Mercedes right
    this.bmwSpawnPos  = new THREE.Vector3(this.spawnCx + perpX * 6, 2.0, this.spawnCz + perpZ * 6)
    this.toySpawnPos  = new THREE.Vector3(this.spawnCx, 2.0, this.spawnCz)
    this.merSpawnPos  = new THREE.Vector3(this.spawnCx - perpX * 6, 2.0, this.spawnCz - perpZ * 6)
    const bmwPos      = this.bmwSpawnPos.clone()
    const toyotaPos   = this.toySpawnPos.clone()
    const mercedesPos = this.merSpawnPos.clone()

    const mercedes = new Mercedes(this.scene, this.physicsWorld)
    const bmw      = new BMW(this.scene, this.physicsWorld)
    const toyota   = new Toyota(this.scene, this.physicsWorld)
    await Promise.all([mercedes.spawn(mercedesPos), bmw.spawn(bmwPos), toyota.spawn(toyotaPos)])

    if (this.destroyed) {
      mercedes.dispose(); bmw.dispose(); toyota.dispose()
      return
    }

    // Stable references — never swap
    this.bmwCar      = bmw
    this.mercedesCar = mercedes
    this.toyotaCar   = toyota
    this.allCars     = [bmw, mercedes, toyota]

    // Active car starts as BMW; the others are parked
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
    wireImpact(toyota)

    // Orient all cars to face the Freedom Monument
    const facingHeading = (pos: THREE.Vector3) =>
      Math.atan2(monX - pos.x, monZ - pos.z)
    const setFacing = (body: typeof bmw.chassisBody, pos: THREE.Vector3) => {
      const h = facingHeading(pos)
      body.quaternion.set(0, Math.sin(h / 2), 0, Math.cos(h / 2))
      body.previousQuaternion.copy(body.quaternion)
    }
    setFacing(bmw.chassisBody,      bmwPos)
    setFacing(mercedes.chassisBody, mercedesPos)
    setFacing(toyota.chassisBody,   toyotaPos)

    // All cars parked at start — player spawns 10m behind cars so all 3 are visible
    for (const c of this.allCars) c.chassisBody.sleep()
    this.playerSpawnPos = new THREE.Vector3(
      this.spawnCx - toMonNx * 10,
      1.0,
      this.spawnCz - toMonNz * 10,
    )
    this.player = new Player(this.scene, this.physicsWorld, this.playerSpawnPos.clone(), this.spawnHeading)
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
      // Clean up stale remote players on disconnect so reconnect starts fresh
      this.network.onDisconnected = () => {
        for (const [id] of this.remotePlayers) this.removeRemotePlayer(id)
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
      const car = state.carId === 'bmw' ? this.bmwCar : state.carId === 'toyota' ? this.toyotaCar : this.mercedesCar
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
    return this.car === this.bmwCar ? 'bmw' : this.car === this.toyotaCar ? 'toyota' : 'mercedes'
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

    // ESC: exit noclip first; otherwise toggle pause
    const input = this.inputManager.getState(dt)
    if (input.pauseToggle) {
      if (this.noclipMode) {
        this.toggleNoclip()
      } else if (this.state !== 'crashed') {
        this.togglePause()
      }
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
    // Physics step (always runs — keeps remote players alive during noclip too)
    this.physicsWorld.step(dt)
    this.updateRemoteCars()
    this.map.syncProps()

    // ── Noclip (free camera fly) ──────────────────────────────────────────
    if (this.noclipMode) {
      // Mouse → rotate
      this.noclipYaw   -= input.mouseDx * 0.003
      this.noclipPitch -= input.mouseDy * 0.003
      this.noclipPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.noclipPitch))

      // Build camera quaternion from yaw + pitch (YXZ equivalent via quaternion multiply)
      const yawQ   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.noclipYaw)
      const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.noclipPitch)
      this.camera.quaternion.copy(yawQ).multiply(pitchQ)

      // W/S = forward/back along look direction, A/D = horizontal strafe
      const dir = new THREE.Vector3()
      this.camera.getWorldDirection(dir)
      const right = new THREE.Vector3(Math.cos(this.noclipYaw), 0, Math.sin(this.noclipYaw))
      const speed = 80 * dt
      this.noclipPos.addScaledVector(dir,   speed * (input.throttle - input.brake))
      this.noclipPos.addScaledVector(right, speed * input.steering)
      this.camera.position.copy(this.noclipPos)

      for (const rp of this.remotePlayers.values()) rp.update(dt)
      return
    }

    let currentPlayerPos = { x: 0, z: 0 }
    let currentHeading = 0

    // ── On-foot mode ─────────────────────────────────────────────────────────
    if (this.gameMode === 'onfoot' && this.player) {
      // Keep all car meshes in sync with their physics bodies
      for (const c of this.allCars) c.syncVisual()

      this.player.update(input, dt)
      const pPos = this.player.getPosition()
      const playerFwd = this.player.getForwardVector()
      this.cameraSystem.updateOnFoot(pPos, playerFwd, dt, this.player.getCameraPitch())
      this.particleSystem.update(dt)

      currentPlayerPos = { x: pPos.x, z: pPos.z }
      currentHeading = Math.atan2(playerFwd.x, playerFwd.z)

      this.lastHUDState = {
        speed: 0, rpm: 0, gear: 1, damage: this.car.damage,
        state: this.state, carType: this.car instanceof BMW ? 'bmw' : this.car instanceof Toyota ? 'toyota' : 'mercedes', onFoot: true,
        playerPos: currentPlayerPos, playerHeading: currentHeading,
        minimapCanvas: this.map.minimapCanvas ?? undefined,
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
    this.smoothCarY += (rawCarPos.y - this.smoothCarY) * Math.min(1, dt * 14)
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
      carType: this.car instanceof BMW ? 'bmw' : this.car instanceof Toyota ? 'toyota' : 'mercedes',
      onFoot: false,
      playerPos: currentPlayerPos,
      playerHeading: currentHeading,
      minimapCanvas: this.map.minimapCanvas ?? undefined,
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

    // Find the closest car among all three
    let closest: Car = this.allCars[0]
    let closestDist = Infinity
    for (const c of this.allCars) {
      const d = pPos.distanceTo(c.getPosition())
      if (d < closestDist) { closestDist = d; closest = c }
    }
    if (closestDist > 5) return

    // If a remote player is driving this car, carjack them (they get force-ejected)
    const closestCarId = closest === this.bmwCar ? 'bmw' : closest === this.toyotaCar ? 'toyota' : 'mercedes'
    const remoteDriverId = this.getRemoteDriverOf(closestCarId)
    if (remoteDriverId) {
      this.network?.sendCarjack(remoteDriverId, closestCarId)
      const rs = this.remoteStates.get(remoteDriverId)
      if (rs) this.remoteStates.set(remoteDriverId, { ...rs, mode: 'onfoot', carId: null })
    }

    // Make this the active car; the previous active becomes parked
    if (closest !== this.car) {
      this.parkedCar = this.car
      this.car = closest
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
    const isMultiplayer = this.network?.connected

    if (isMultiplayer) {
      // ── Multiplayer respawn: only reset the local player, leave cars where they are ──
      // Other players may be driving cars, so we can't teleport them.
      if (this.gameMode === 'driving') {
        // Clear damage on the car the player was driving
        this.car.damage = 0
        this.car.chassisBody.sleep()
        this.car.setHeadlights(false)
      }
    } else {
      // ── Singleplayer respawn: reset all cars to original positions ──
      const spawnPairs: [Car, THREE.Vector3][] = [
        [this.bmwCar,      this.bmwSpawnPos],
        [this.mercedesCar, this.merSpawnPos],
        [this.toyotaCar,   this.toySpawnPos],
      ]
      const setQ = (body: typeof this.bmwCar.chassisBody, pos: THREE.Vector3) => {
        const h = Math.atan2(-137 - pos.x, -136 - pos.z)
        body.quaternion.set(0, Math.sin(h / 2), 0, Math.cos(h / 2))
        body.previousQuaternion.copy(body.quaternion)
      }
      for (const [car, pos] of spawnPairs) {
        car.reset(pos.clone())
        setQ(car.chassisBody, pos)
        car.damage = 0
        car.chassisBody.sleep()
      }
    }

    this.smoothCarYInit = false

    // Respawn player on foot at spawn location, facing monument
    if (this.player) { this.player.dispose(); this.player = null }
    this.player = new Player(this.scene, this.physicsWorld, this.playerSpawnPos.clone(), this.spawnHeading)
    this.gameMode = 'onfoot'
    this.soundSystem.stopEngineKey()

    this.cameraSystem.reset()
    this.state = 'playing'
    this.clock.start()
    this.soundSystem.resumeAll()
    this.onHUDUpdate?.({ ...this.lastHUDState, state: 'playing', damage: 0, onFoot: true })
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

  toggleNoclip(): boolean {
    this.noclipMode = !this.noclipMode
    if (this.noclipMode) {
      // Snapshot current camera position + look direction
      this.noclipPos.copy(this.camera.position)
      const dir = new THREE.Vector3()
      this.camera.getWorldDirection(dir)
      this.noclipYaw   = Math.atan2(dir.x, -dir.z)
      this.noclipPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)))
    } else {
      // Hand camera back to the normal camera system on the next frame
      this.cameraSystem.reset()
    }
    this.onNoclipChange?.(this.noclipMode)
    return this.noclipMode
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

