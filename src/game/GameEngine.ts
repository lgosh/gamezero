import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { PhysicsWorld } from './PhysicsWorld'
import { InputManager } from './InputManager'
import { SoundSystem } from './SoundSystem'
import { CameraSystem } from './CameraSystem'
import { ParticleSystem } from './ParticleSystem'
import { OSMMap } from './world/OSMMap'
import { AITrafficSystem } from './AITrafficSystem'
import { BMW } from './entities/BMW'
import { Mercedes } from './entities/Mercedes'
import { Toyota } from './entities/Toyota'
import { BMWCS } from './entities/BMWCS'
import { Player } from './entities/Player'
import type { Car } from './entities/Car'
import { NetworkManager } from './NetworkManager'
import type { RemotePlayerData, ChatMessage } from './NetworkManager'
import { RemotePlayer } from './RemotePlayer'
import { VoiceChat } from './VoiceChat'

export type CarType = 'bmw' | 'mercedes' | 'toyota' | 'bmwcs'
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
  remotePlayers?: { x: number; z: number }[]
  voiceSpeakers?: string[]
  weapon?: 'fist' | 'glock'
  magazineAmmo?: number
  reserveAmmo?: number
  reloading?: boolean
  armor?: number
  health?: number
  dead?: boolean
  killFeed?: { killer: string; victim: string; weapon: string; time: number }[]
  scoreboard?: { id: string; nickname: string; ping: number; kills: number; deaths: number; speaking?: boolean; local?: boolean }[]
  connectionStatus?: 'offline' | 'connecting' | 'online'
  localPing?: number
}

export class GameEngine {
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private renderer!: THREE.WebGLRenderer
  private clock!: THREE.Clock
  private sun!: THREE.DirectionalLight

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
  private bmwcsCar!: Car    // stable reference — never swaps
  private allCars: Car[] = []
  private player: Player | null = null
  private gameMode: GameMode = 'driving'
  private aiTraffic: AITrafficSystem | null = null

  // Spawn anchor — set during init, reused by resetCar/respawn
  private spawnCx = -90
  private spawnCz = 0
  private spawnHeading = 0
  private playerSpawnPos = new THREE.Vector3(-90, 1.0, 0)
  private bmwSpawnPos = new THREE.Vector3(-85, 2.0, -5)
  private merSpawnPos = new THREE.Vector3(-85, 2.0, 5)
  private toySpawnPos = new THREE.Vector3(-85, 2.0, 0)
  private bmwcsSpawnPos = new THREE.Vector3(-85, 2.0, -10) // 4th spawn position

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
  private remoteStates = new Map<string, RemotePlayerData>()
  private networkSendTimer = 0
  onChatMessage?: (msg: ChatMessage) => void

  // Voice chat
  private voiceChat: VoiceChat | null = null
  private voiceSpeakers = new Set<string>()
  private localNickname = ''
  private networkStatus: 'offline' | 'connecting' | 'online' = 'offline'

  // Noclip (free camera fly mode)
  private noclipMode = false
  private needsPauseRender = false
  private noclipPos = new THREE.Vector3()
  private noclipYaw = 0
  private noclipPitch = 0
  onNoclipChange?: (active: boolean) => void

  // Combat
  private killFeed: { killer: string; victim: string; weapon: string; time: number }[] = []
  private lastKiller: { nickname: string; weapon: string } | null = null
  private raycaster = new THREE.Raycaster()
  private vehicleDecals: Array<{ parent: THREE.Object3D; mesh: THREE.Mesh }> = []
  private bulletDecalTexture: THREE.CanvasTexture | null = null

  // Smoke timer
  private smokeTimer = 0

  // Smoothed car Y — absorbs suspension bounce before it reaches the camera
  private smoothCarY = 0
  private smoothCarYInit = false

  onLoadProgress?: (progress: number) => void

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
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1))
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    this.renderer.shadowMap.enabled = false
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    // ─── Scene & Camera ───────────────────────────────────────────────────────
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(68, canvas.clientWidth / canvas.clientHeight, 0.5, 800)

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
    this.aiTraffic = new AITrafficSystem(this.scene)
    this.aiTraffic.init(this.map.getTrafficRoads())

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
    // Four cars side by side
    this.bmwSpawnPos = new THREE.Vector3(this.spawnCx + perpX * 4, 2.0, this.spawnCz + perpZ * 4)
    this.toySpawnPos = new THREE.Vector3(this.spawnCx, 2.0, this.spawnCz)
    this.merSpawnPos = new THREE.Vector3(this.spawnCx - perpX * 4, 2.0, this.spawnCz - perpZ * 4)
    this.bmwcsSpawnPos = new THREE.Vector3(this.spawnCx + perpX * 8, 2.0, this.spawnCz + perpZ * 8)
    const bmwPos = this.bmwSpawnPos.clone()
    const toyotaPos = this.toySpawnPos.clone()
    const mercedesPos = this.merSpawnPos.clone()
    const bmwcsPos = this.bmwcsSpawnPos.clone()

    this.onLoadProgress?.(0.2) // map built

    const mercedes = new Mercedes(this.scene, this.physicsWorld)
    const bmw = new BMW(this.scene, this.physicsWorld)
    const toyota = new Toyota(this.scene, this.physicsWorld)
    const bmwcs = new BMWCS(this.scene, this.physicsWorld)

    // Load cars and report progress as each finishes
    let carsLoaded = 0
    const trackSpawn = async (p: Promise<void>) => {
      await p
      carsLoaded++
      this.onLoadProgress?.(0.2 + (carsLoaded / 4) * 0.75)
    }
    await Promise.all([
      trackSpawn(mercedes.spawn(mercedesPos)),
      trackSpawn(bmw.spawn(bmwPos)),
      trackSpawn(toyota.spawn(toyotaPos)),
      trackSpawn(bmwcs.spawn(bmwcsPos)),
    ])

    if (this.destroyed) {
      mercedes.dispose(); bmw.dispose(); toyota.dispose(); bmwcs.dispose()
      return
    }

    // Stable references — never swap
    this.bmwCar = bmw
    this.mercedesCar = mercedes
    this.toyotaCar = toyota
    this.bmwcsCar = bmwcs
    this.allCars = [bmw, mercedes, toyota, bmwcs]

    // Active car starts as BMW; the others are parked
    this.car = bmw; this.parkedCar = mercedes
    this.car.useInterpolatedSync = true

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
    wireImpact(bmwcs)

    // Orient all cars to face the Freedom Monument
    const facingHeading = (pos: THREE.Vector3) =>
      Math.atan2(monX - pos.x, monZ - pos.z)
    const setFacing = (body: typeof bmw.chassisBody, pos: THREE.Vector3) => {
      const h = facingHeading(pos)
      body.quaternion.set(0, Math.sin(h / 2), 0, Math.cos(h / 2))
      body.previousQuaternion.copy(body.quaternion)
    }
    setFacing(bmw.chassisBody, bmwPos)
    setFacing(mercedes.chassisBody, mercedesPos)
    setFacing(toyota.chassisBody, toyotaPos)
    setFacing(bmwcs.chassisBody, bmwcsPos)

    // Let all spawned cars settle onto the road before parking them.
    this.settleAndParkCars(this.allCars)
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
      this.networkStatus = 'connecting'
      this.network = new NetworkManager()
      this.network.onConnected = (_id, existing) => {
        this.networkStatus = 'online'
        for (const p of existing) this.addRemotePlayer(p)
      }
      this.network.onPlayerJoined = (data) => this.addRemotePlayer(data)
      this.network.onPlayerLeft = (id) => this.removeRemotePlayer(id)
      this.network.onStates = (players) => {
        for (const p of players) {
          this.remoteStates.set(p.id, p)
          const rp = this.remotePlayers.get(p.id)
          if (rp) rp.applyRemoteState(p)
          else this.addRemotePlayer(p)
        }
      }
      this.network.onChat = (msg) => this.onChatMessage?.(msg)
      // Someone is carjacking our car — force-exit immediately
      this.network.onCarjack = (carId) => {
        if (this.gameMode === 'driving' && this.getLocalCarId() === carId) {
          this.exitCar()
        }
      }
      // Another player (or us) triggered restart — reset everything
      this.network.onRestart = () => {
        this.performRestart()
      }
      // Voice chat
      // Combat: incoming hit from another player
      this.network.onHit = (damage, _hitZone, shooterId, shooterNickname) => {
        if (this.player && !this.player.dead && this.gameMode === 'onfoot') {
          this.player.takeDamage(damage)
          this.soundSystem.playBulletHit()
          if (this.player.dead) {
            this.soundSystem.playDeath()
            this.lastKiller = { nickname: shooterNickname, weapon: 'glock' }
            this.network?.sendKilled(shooterId, shooterNickname, 'glock')
          }
        }
      }
      this.network.onKillFeed = (killerNickname, victimNickname, weapon) => {
        this.killFeed.push({ killer: killerNickname, victim: victimNickname, weapon, time: Date.now() })
      }

      this.network.onVoice = (id, _nickname, data) => {
        this.voiceChat?.playRemoteAudio(id, data)
      }
      this.network.onVoiceSpeaking = (id, nickname, speaking) => {
        this.remotePlayers.get(id)?.setSpeaking(speaking)
        if (speaking) {
          this.voiceSpeakers.add(nickname)
          this.voiceChat?.startRemoteSession(id)
        } else {
          this.voiceSpeakers.delete(nickname)
          this.voiceChat?.endRemoteSession(id)
        }
      }

      // Clean up stale remote players on disconnect so reconnect starts fresh
      this.network.onDisconnected = () => {
        this.networkStatus = 'connecting'
        for (const [id] of this.remotePlayers) this.removeRemotePlayer(id)
      }
      this.network.connect(nickname.trim())

      // Init voice chat
      this.voiceChat = new VoiceChat(this.network)
      this.localNickname = nickname.trim()
      this.voiceChat.onLocalSpeaking = (speaking) => {
        if (speaking) this.voiceSpeakers.add(this.localNickname)
        else this.voiceSpeakers.delete(this.localNickname)
      }
    }
    else {
      this.networkStatus = 'offline'
    }

    this.state = 'playing'
  }

  private addRemotePlayer(data: RemotePlayerData) {
    if (this.remotePlayers.has(data.id)) return
    this.remoteStates.set(data.id, data)
    const remotePlayer = new RemotePlayer(this.scene, data)
    remotePlayer.setSpeaking(this.voiceSpeakers.has(data.nickname))
    this.remotePlayers.set(data.id, remotePlayer)
  }

  private removeRemotePlayer(id: string) {
    const rp = this.remotePlayers.get(id)
    if (rp) { rp.dispose(); this.remotePlayers.delete(id) }
    this.remoteStates.delete(id)
    this.restoreUnclaimedCars()
  }

  private getCarById(carId: string): Car {
    return carId === 'bmw'
      ? this.bmwCar
      : carId === 'toyota'
      ? this.toyotaCar
      : carId === 'bmwcs'
      ? this.bmwcsCar
      : this.mercedesCar
  }

  private restoreUnclaimedCars() {
    for (const car of this.allCars) {
      if (car === this.car && this.gameMode === 'driving') continue

      const carId = car === this.bmwCar ? 'bmw' : car === this.toyotaCar ? 'toyota' : car === this.bmwcsCar ? 'bmwcs' : 'mercedes'
      const claimedByRemote = this.getRemoteDriverOf(carId)
      if (claimedByRemote) continue

      if (car.chassisBody.type === CANNON.Body.KINEMATIC) {
        this.parkCar(car)
      }
    }
  }

  private clearVehicleInputs(car: Car, brakeForce = 0) {
    for (let i = 0; i < car.vehicle.wheelInfos.length; i++) {
      car.vehicle.applyEngineForce(0, i)
      car.vehicle.setBrake(brakeForce, i)
      car.vehicle.setSteeringValue(0, i)
    }
  }

  private parkCar(car: Car) {
    if (car.chassisBody.type !== CANNON.Body.DYNAMIC) {
      car.chassisBody.type = CANNON.Body.DYNAMIC
    }
    car.chassisBody.velocity.setZero()
    car.chassisBody.angularVelocity.setZero()
    car.chassisBody.force.set(0, 0, 0)
    car.chassisBody.torque.set(0, 0, 0)
    this.clearVehicleInputs(car, 200)
    car.chassisBody.sleep()
    car.syncVisual()
  }

  private settleAndParkCars(cars: Car[], steps = 75) {
    for (const car of cars) {
      car.chassisBody.type = CANNON.Body.DYNAMIC
      car.chassisBody.velocity.setZero()
      car.chassisBody.angularVelocity.setZero()
      car.chassisBody.force.set(0, 0, 0)
      car.chassisBody.torque.set(0, 0, 0)
      car.chassisBody.wakeUp()
      this.clearVehicleInputs(car, 0)
      car.syncVisual()
    }

    for (let i = 0; i < steps; i++) {
      this.physicsWorld.step(1 / 60)
    }

    for (const car of cars) {
      this.parkCar(car)
    }
  }

  private maintainParkedCars() {
    for (const car of this.allCars) {
      if (car === this.car && this.gameMode === 'driving') continue

      const carId = car === this.bmwCar ? 'bmw' : car === this.toyotaCar ? 'toyota' : car === this.bmwcsCar ? 'bmwcs' : 'mercedes'
      if (this.getRemoteDriverOf(carId)) continue
      if (car.chassisBody.type !== CANNON.Body.DYNAMIC) continue
      if (car.chassisBody.sleepState === CANNON.Body.SLEEPING) continue

      const linearSpeedSq = car.chassisBody.velocity.lengthSquared()
      const angularSpeedSq = car.chassisBody.angularVelocity.lengthSquared()
      if (linearSpeedSq < 0.2 && angularSpeedSq < 0.12) {
        this.parkCar(car)
      }
    }
  }

  /** Smoothly interpolate remote cars to wherever the remote player is driving it. */
  private updateRemoteCars(dt: number) {
    const alpha = 1 - Math.exp(-12 * dt)

    for (const state of this.remoteStates.values()) {
      if (state.mode !== 'driving' || !state.carId) continue
      const car = this.getCarById(state.carId)
      
      // Never override a car the local player is currently driving
      if (car === this.car && this.gameMode === 'driving') {
        if (car.chassisBody.type !== CANNON.Body.DYNAMIC) {
          car.chassisBody.type = CANNON.Body.DYNAMIC
          car.chassisBody.wakeUp()
        }
        continue
      }

      // Convert to kinematic so it doesn't fight the local physics engine
      if (car.chassisBody.type !== CANNON.Body.KINEMATIC) {
        car.chassisBody.type = CANNON.Body.KINEMATIC
        car.chassisBody.velocity.setZero()
        car.chassisBody.angularVelocity.setZero()
      }

      // LERP/SLERP towards the target network position
      const predictionSeconds = Math.min(0.12 + (state.ping ?? 0) / 1000 * 0.35, 0.22)
      const targetPos = new CANNON.Vec3(
        state.pos[0] + state.vel[0] * predictionSeconds,
        state.pos[1] + state.vel[1] * predictionSeconds,
        state.pos[2] + state.vel[2] * predictionSeconds,
      )
      const targetQuat = new CANNON.Quaternion(state.quat[0], state.quat[1], state.quat[2], state.quat[3])
      
      // If it's too far (e.g. just spawned or teleported), snap instead of slow-lerping across the map
      if (car.chassisBody.position.distanceTo(targetPos) > 14) {
        car.chassisBody.position.copy(targetPos)
        car.chassisBody.quaternion.copy(targetQuat)
      } else {
        car.chassisBody.position.lerp(targetPos, alpha, car.chassisBody.position)
        car.chassisBody.quaternion.slerp(targetQuat, alpha, car.chassisBody.quaternion)
      }

      car.syncVisual()
    }

    this.restoreUnclaimedCars()
  }

  private getLocalCarId(): string | null {
    if (this.gameMode !== 'driving') return null
    return this.car === this.bmwCar ? 'bmw' : this.car === this.toyotaCar ? 'toyota' : this.car === this.bmwcsCar ? 'bmwcs' : 'mercedes'
  }

  private getRemoteDriverOf(carId: string): string | null {
    for (const [id, state] of this.remoteStates) {
      if (state.mode === 'driving' && state.carId === carId) return id
    }
    return null
  }

  private readonly DRAW_DIST_CULL = 200   // hide cars beyond this
  private readonly DRAW_DIST_SHOW = 150   // re-show at this (hysteresis)

  /** GTA-style draw distance: cull parked cars far from all players */
  private updateDrawDistance() {
    // Gather all "viewer" positions: local player + remote players
    const viewers: { x: number; z: number }[] = []
    if (this.gameMode === 'driving') {
      const p = this.car.chassisBody.position
      viewers.push({ x: p.x, z: p.z })
    } else if (this.player) {
      const p = this.player.getPosition()
      viewers.push({ x: p.x, z: p.z })
    }
    for (const state of this.remoteStates.values()) {
      viewers.push({ x: state.pos[0], z: state.pos[2] })
    }

    for (const car of this.allCars) {
      // Never cull the car the local player is driving
      if (car === this.car && this.gameMode === 'driving') {
        car.uncull()
        continue
      }
      // Never cull a car a remote player is driving
      const carId = car === this.bmwCar ? 'bmw' : car === this.toyotaCar ? 'toyota' : car === this.bmwcsCar ? 'bmwcs' : 'mercedes'
      if (this.getRemoteDriverOf(carId)) {
        car.uncull()
        continue
      }

      const cp = car.chassisBody.position
      let minDist = Infinity
      for (const v of viewers) {
        const dx = cp.x - v.x, dz = cp.z - v.z
        minDist = Math.min(minDist, dx * dx + dz * dz)
      }
      const threshold = car.culled ? this.DRAW_DIST_SHOW : this.DRAW_DIST_CULL
      if (minDist > threshold * threshold) {
        car.cull()
      } else {
        car.uncull()
      }
    }
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

    // Voice chat — always update regardless of pause state
    this.voiceChat?.update(input.voiceChat)

    if (this.state === 'playing') {
      this.update(dt, input)
      this.renderer.render(this.scene, this.camera)
    } else if (this.state === 'paused' || this.state === 'crashed') {
      if (this.needsPauseRender) {
        this.renderer.render(this.scene, this.camera)
        this.needsPauseRender = false
      }
    }
  }

  private update(dt: number, input: ReturnType<typeof this.inputManager.getState>) {
    // Physics step (always runs — keeps remote players alive during noclip too)
    this.physicsWorld.step(dt)
    this.updateRemoteCars(dt)
    this.maintainParkedCars()
    this.map.syncProps()
    this.aiTraffic?.update(dt)
    this.updateDrawDistance()

    // ── Noclip (free camera fly) ──────────────────────────────────────────
    if (this.noclipMode) {
      // Mouse → rotate
      this.noclipYaw -= input.mouseDx * 0.003
      this.noclipPitch -= input.mouseDy * 0.003
      this.noclipPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.noclipPitch))

      // Build camera quaternion from yaw + pitch (YXZ equivalent via quaternion multiply)
      const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.noclipYaw)
      const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.noclipPitch)
      this.camera.quaternion.copy(yawQ).multiply(pitchQ)

      // W/S = forward/back along look direction, A/D = horizontal strafe
      const dir = new THREE.Vector3()
      this.camera.getWorldDirection(dir)
      const right = new THREE.Vector3(Math.cos(this.noclipYaw), 0, Math.sin(this.noclipYaw))
      const speed = 80 * dt
      this.noclipPos.addScaledVector(dir, speed * (input.throttle - input.brake))
      this.noclipPos.addScaledVector(right, speed * input.steering)
      this.camera.position.copy(this.noclipPos)

      for (const rp of this.remotePlayers.values()) rp.update(dt, this.camera.position)
      return
    }

    let currentPlayerPos = { x: 0, z: 0 }
    let currentHeading = 0

    // Move shadow camera to follow the player so the tight 80m coverage area tracks them
    if (this.map?.lighting) {
      const shadowX = this.gameMode === 'driving' && this.car
        ? this.car.chassisBody.position.x
        : this.player?.getPosition().x ?? 0
      const shadowZ = this.gameMode === 'driving' && this.car
        ? this.car.chassisBody.position.z
        : this.player?.getPosition().z ?? 0
      this.map.lighting.setShadowCenter(shadowX, shadowZ)
    }

    // ── On-foot mode ─────────────────────────────────────────────────────────
    if (this.gameMode === 'onfoot' && this.player) {
      // Keep all car meshes in sync with their physics bodies (skip culled)
      for (const c of this.allCars) if (!c.culled) c.syncVisual()

      this.player.update(input, dt)

      // Gunshot sound + hit detection
      if (this.player.shotFired) {
        this.player.shotFired = false
        this.soundSystem.playGunshot()
        this.performHitDetection()
      }
      // Reload sound
      if (this.player.reloadStarted) {
        this.player.reloadStarted = false
        this.soundSystem.playReload()
      }

      // Death/respawn handling
      if (this.player.dead) {
        if (this.player.updateDeath(dt)) {
          // Respawn with full health/armor
          this.player.dispose()
          this.player = new Player(this.scene, this.physicsWorld, this.playerSpawnPos.clone(), this.spawnHeading)
          this.lastKiller = null
        }
      }

      // Expire old kill feed entries (keep for 5 seconds)
      const now = Date.now()
      this.killFeed = this.killFeed.filter(k => now - k.time < 30000)

      const pPos = this.player.getPosition()
      const playerFwd = this.player.getForwardVector()
      this.cameraSystem.updateOnFoot(pPos, playerFwd, dt, this.player.getCameraPitch())
      this.particleSystem.update(dt)

      currentPlayerPos = { x: pPos.x, z: pPos.z }
      currentHeading = Math.atan2(playerFwd.x, playerFwd.z)

      const ammo = this.player.getAmmo()
      const remotePositions2: { x: number; z: number }[] = []
      for (const [, rs] of this.remoteStates) {
        remotePositions2.push({ x: rs.pos[0], z: rs.pos[2] })
      }
      this.lastHUDState = {
        speed: 0, rpm: 0, gear: 1, damage: this.car.damage,
        state: this.state, carType: this.car instanceof BMW ? 'bmw' : this.car instanceof Toyota ? 'toyota' : this.car instanceof BMWCS ? 'bmwcs' : 'mercedes', onFoot: true,
        playerPos: currentPlayerPos, playerHeading: currentHeading,
        minimapCanvas: this.map.minimapCanvas ?? undefined,
        remotePlayers: remotePositions2,
        voiceSpeakers: [...this.voiceSpeakers],
        weapon: this.player.getWeapon(),
        magazineAmmo: ammo.magazine,
        reserveAmmo: ammo.reserve,
        reloading: this.player.isReloading(),
        armor: this.player.armor,
        health: this.player.health,
        dead: this.player.dead,
        killFeed: this.killFeed,
        scoreboard: this.buildScoreboard(),
        connectionStatus: this.networkStatus,
        localPing: this.network?.getPingMs() ?? 0,
      }
      this.onHUDUpdate?.(this.lastHUDState)

      // Network
      this.networkSendTimer += dt
      if (this.networkSendTimer >= 0.05) {
        this.networkSendTimer = 0
        this.sendNetworkState()
      }
      for (const rp of this.remotePlayers.values()) rp.update(dt, this.camera.position)
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

    // Car update (physics inputs for driven car)
    const { rpm, speedKmh, gear, lateralSpeedMs } = this.car.update(input, dt)

    // Sync visual meshes for ALL cars (skip culled — they're hidden)
    for (const c of this.allCars) {
      if (c !== this.car && !c.culled) c.syncVisual()
    }

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
        new THREE.Vector3(0.40, -0.20, -2.4),
        new THREE.Vector3(0.55, -0.20, -2.4),
      ]
      for (const off of exhaustOffsets) {
        const pos = carPos.clone().add(off.clone().applyQuaternion(q))
        if (input.throttle > 0.8) this.particleSystem.emitExhaust(pos)
        if (this.car.smokeEmitting) this.particleSystem.emitSmoke(pos, 1)
      }
    }
    this.particleSystem.update(dt)

    // Camera — use interpolated physics state for smooth visuals between substeps
    const rawCarPos = this.car.getInterpolatedPosition()

    // Low-pass filter the Y axis only — kills suspension bounce, preserves hill-following
    if (!this.smoothCarYInit) { this.smoothCarY = rawCarPos.y; this.smoothCarYInit = true }
    this.smoothCarY += (rawCarPos.y - this.smoothCarY) * (1 - Math.exp(-14 * dt))
    const carPos = new THREE.Vector3(rawCarPos.x, this.smoothCarY, rawCarPos.z)

    const carFwd = this.car.getInterpolatedForward()
    const carUp = this.car.getInterpolatedUp()
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
      this.needsPauseRender = true
      this.soundSystem.stopEngine()
    }

    currentPlayerPos = { x: carPos.x, z: carPos.z }
    currentHeading = Math.atan2(carFwd.x, carFwd.z)

    // Gather remote player positions for minimap
    const remotePositions: { x: number; z: number }[] = []
    for (const [, rs] of this.remoteStates) {
      remotePositions.push({ x: rs.pos[0], z: rs.pos[2] })
    }

    // HUD update
    this.lastHUDState = {
      speed: Math.round(speedKmh),
      rpm: Math.round(rpm),
      gear,
      damage: this.car.damage,
      state: this.state,
      carType: this.car instanceof BMW ? 'bmw' : this.car instanceof Toyota ? 'toyota' : this.car instanceof BMWCS ? 'bmwcs' : 'mercedes',
      onFoot: false,
      playerPos: currentPlayerPos,
      playerHeading: currentHeading,
      minimapCanvas: this.map.minimapCanvas ?? undefined,
      remotePlayers: remotePositions,
      voiceSpeakers: [...this.voiceSpeakers],
      killFeed: this.killFeed,
      scoreboard: this.buildScoreboard(),
      connectionStatus: this.networkStatus,
      localPing: this.network?.getPingMs() ?? 0,
    }
    this.onHUDUpdate?.(this.lastHUDState)

    // ── Network ────────────────────────────────────────────────────────────
    this.networkSendTimer += dt
    if (this.networkSendTimer >= 0.05) { // 20 Hz
      this.networkSendTimer = 0
      this.sendNetworkState()
    }
    for (const rp of this.remotePlayers.values()) rp.update(dt, this.camera.position)
  }

  private buildScoreboard() {
    const roster = this.network?.getRoster() ?? []
    const localId = this.network?.id ?? ''
    const speakingNames = this.voiceSpeakers
    const board = roster.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      ping: player.id === localId ? this.network?.getPingMs() ?? player.ping : player.ping,
      kills: player.kills ?? 0,
      deaths: player.deaths ?? 0,
      speaking: speakingNames.has(player.nickname),
      local: player.id === localId,
    }))

    if (!board.length && this.localNickname) {
      board.push({
        id: localId || 'local',
        nickname: this.localNickname,
        ping: this.network?.getPingMs() ?? 0,
        kills: 0,
        deaths: 0,
        speaking: speakingNames.has(this.localNickname),
        local: true,
      })
    }

    board.sort((a, b) => (b.kills - a.kills) || (a.deaths - b.deaths) || a.nickname.localeCompare(b.nickname))
    return board
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
      pos = [p.x, p.y, p.z]
      quat = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]
      vel = [0, 0, 0]
    } else {
      const p = this.car.getPosition()
      const b = this.car.chassisBody
      pos = [p.x, p.y, p.z]
      quat = [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]
      vel = [b.velocity.x, b.velocity.y, b.velocity.z]
      speedKmh = this.car.speedKmh
    }

    const weapon = this.player?.getWeapon()
    const shooting = this.player?.getMuzzleFlashActive() || undefined
    this.network.sendState({
      pos,
      quat,
      vel,
      mode: this.gameMode,
      speedKmh,
      carId: this.getLocalCarId(),
      ping: this.network.getPingMs(),
      weapon,
      shooting,
    })
  }

  private performHitDetection() {
    if (!this.player) return

    // Raycast from camera center (crosshair) into the scene
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera)
    this.raycaster.far = 100

    let bestPlayerHit: { id: string; hit: THREE.Intersection<THREE.Object3D> } | null = null
    for (const [id, rp] of this.remotePlayers) {
      if (rp.mode !== 'onfoot') continue
      const hit = this.raycaster.intersectObject(rp.footGroup, true)[0]
      if (!hit) continue
      if (!bestPlayerHit || hit.distance < bestPlayerHit.hit.distance) {
        bestPlayerHit = { id, hit }
      }
    }

    const nearestVehicleHit = this.findNearestVehicleHit()

    if (nearestVehicleHit && (!bestPlayerHit || nearestVehicleHit.distance < bestPlayerHit.hit.distance)) {
      this.reactToVehicleHit(nearestVehicleHit)
      return
    }

    if (!bestPlayerHit) return

    let hitZone = 'body'
    let obj: THREE.Object3D | null = bestPlayerHit.hit.object
    while (obj) {
      if (obj.userData?.hitZone) { hitZone = obj.userData.hitZone; break }
      obj = obj.parent
    }
    const damage = hitZone === 'head' ? 30 : 10

    this.particleSystem.emitBlood(bestPlayerHit.hit.point)
    this.soundSystem.playBulletHit()
    this.network?.sendHit(bestPlayerHit.id, damage, hitZone)
  }

  private findNearestVehicleHit() {
    let nearestHit: THREE.Intersection<THREE.Object3D> | null = null
    const targets: THREE.Object3D[] = []
    for (const car of this.allCars) targets.push(car.group, ...car.wheelMeshes)
    if (this.aiTraffic) targets.push(...this.aiTraffic.getRaycastTargets())

    for (const target of targets) {
      const hit = this.raycaster.intersectObject(target, true)[0]
      if (!hit) continue
      if (!nearestHit || hit.distance < nearestHit.distance) nearestHit = hit
    }
    return nearestHit
  }

  private reactToVehicleHit(hit: THREE.Intersection<THREE.Object3D>) {
    this.particleSystem.emitSparks(hit.point, 5)
    this.spawnVehicleDecal(hit)
  }

  private getBulletDecalTexture() {
    if (this.bulletDecalTexture) return this.bulletDecalTexture

    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, 128, 128)

    const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 44)
    gradient.addColorStop(0, 'rgba(15,15,15,0.9)')
    gradient.addColorStop(0.45, 'rgba(20,20,20,0.65)')
    gradient.addColorStop(1, 'rgba(20,20,20,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(64, 64, 44, 0, Math.PI * 2)
    ctx.fill()

    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    this.bulletDecalTexture = tex
    return tex
  }

  private spawnVehicleDecal(hit: THREE.Intersection<THREE.Object3D>) {
    const parent = hit.object
    const worldNormal = hit.face
      ? hit.face.normal.clone().transformDirection(parent.matrixWorld).normalize()
      : this.raycaster.ray.direction.clone().negate()
    const localPoint = parent.worldToLocal(hit.point.clone().addScaledVector(worldNormal, 0.02))
    const localLookAt = parent.worldToLocal(hit.point.clone().add(worldNormal))

    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.18),
      new THREE.MeshBasicMaterial({
        map: this.getBulletDecalTexture(),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    )
    decal.position.copy(localPoint)
    decal.lookAt(localLookAt)
    decal.rotateZ(Math.random() * Math.PI * 2)
    parent.add(decal)
    this.vehicleDecals.push({ parent, mesh: decal })

    while (this.vehicleDecals.length > 10) {
      const oldest = this.vehicleDecals.shift()!
      oldest.parent.remove(oldest.mesh)
      oldest.mesh.geometry.dispose()
      ;(oldest.mesh.material as THREE.Material).dispose()
    }
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
    this.parkCar(this.car)
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
    const closestCarId = closest === this.bmwCar ? 'bmw' : closest === this.toyotaCar ? 'toyota' : closest === this.bmwcsCar ? 'bmwcs' : 'mercedes'
    const remoteDriverId = this.getRemoteDriverOf(closestCarId)
    if (remoteDriverId) {
      this.network?.sendCarjack(remoteDriverId, closestCarId)
      const rs = this.remoteStates.get(remoteDriverId)
      if (rs) this.remoteStates.set(remoteDriverId, { ...rs, mode: 'onfoot', carId: null })
    }

    // Make this the active car; the previous active becomes parked
    if (closest !== this.car) {
      this.car.useInterpolatedSync = false
      this.parkedCar = this.car
      this.car = closest
      this.car.useInterpolatedSync = true
    }
    if (this.car.chassisBody.type !== CANNON.Body.DYNAMIC) {
      this.car.chassisBody.type = CANNON.Body.DYNAMIC
    }
    this.clearVehicleInputs(this.car, 0)
    this.car.chassisBody.velocity.setZero()
    this.car.chassisBody.angularVelocity.setZero()

    this.player.dispose()
    this.player = null
    this.car.chassisBody.wakeUp()
    this.car.setHeadlights(true)
    this.soundSystem.startEngine()
    this.gameMode = 'driving'
    this.cameraSystem.reset()
  }

  resetCar() {
    if (this.network?.connected) {
      // Broadcast restart to all players — server echoes back to everyone
      this.network.sendRestart()
    }
    // Always restart locally immediately (don't wait for server roundtrip)
    this.performRestart()
  }

  private performRestart() {
    // Reset all cars to original spawn positions
    const spawnPairs: [Car, THREE.Vector3][] = [
      [this.bmwCar, this.bmwSpawnPos],
      [this.mercedesCar, this.merSpawnPos],
      [this.toyotaCar, this.toySpawnPos],
      [this.bmwcsCar, this.bmwcsSpawnPos],
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
      car.setHeadlights(false)
      car.uncull()
    }
    this.settleAndParkCars(this.allCars)

    // Clear stale remote driving states so updateRemoteCars doesn't override reset positions
    for (const [id, state] of this.remoteStates) {
      this.remoteStates.set(id, { ...state, mode: 'onfoot', carId: null })
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
      this.needsPauseRender = true
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
      this.noclipYaw = Math.atan2(dir.x, -dir.z)
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
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.animationId)
    window.removeEventListener('resize', this.onResize)
    this.inputManager?.destroy()
    this.soundSystem?.destroy()
    this.player?.dispose()
    this.particleSystem?.clear()
    for (const car of new Set(this.allCars)) car.dispose()
    this.allCars = []
    for (const decal of this.vehicleDecals) {
      decal.parent.remove(decal.mesh)
      decal.mesh.geometry.dispose()
      ;(decal.mesh.material as THREE.Material).dispose()
    }
    this.vehicleDecals = []
    this.bulletDecalTexture?.dispose()
    this.bulletDecalTexture = null
    this.aiTraffic?.destroy()
    this.aiTraffic = null
    this.voiceChat?.destroy()
    this.network?.destroy()
    for (const rp of this.remotePlayers.values()) rp.dispose()
    this.remotePlayers.clear()
    this.remoteStates.clear()
    this.renderer?.dispose()
  }
}
