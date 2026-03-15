import * as THREE from 'three'
import type { RemotePlayerData } from './NetworkManager'

// ── Character colours (matching local Player) ─────────────────────────────
const SKIN  = 0x3d2b1f
const SHIRT = 0xffffff
const JEANS = 0x2b3d5c
const SHOE  = 0x111111
const HAIR  = 0x111111

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

/** Builds the CJ character group — identical to local Player mesh. Feet at y=0. */
function buildPlayerGroup(): THREE.Group {
  const g = new THREE.Group()
  g.scale.setScalar(0.85)

  for (const side of [-0.15, 0.15]) {
    const leg = new THREE.Group()
    leg.position.set(side, 0.95, 0)
    const ul = box(0.22, 0.50, 0.22, JEANS); ul.position.set(0, -0.25, 0); leg.add(ul)
    const ll = box(0.18, 0.45, 0.18, JEANS); ll.position.set(0, -0.65, 0); leg.add(ll)
    const sh = box(0.20, 0.12, 0.35, SHOE);  sh.position.set(0, -0.88, 0.08); leg.add(sh)
    g.add(leg)
  }

  const hips  = box(0.48, 0.25, 0.28, JEANS); hips.position.set(0, 0.85, 0); g.add(hips)
  const torso = box(0.50, 0.55, 0.30, SHIRT); torso.position.set(0, 1.25, 0); g.add(torso)
  const sL = box(0.12, 0.10, 0.30, SHIRT); sL.position.set(-0.19, 1.5, 0); g.add(sL)
  const sR = box(0.12, 0.10, 0.30, SHIRT); sR.position.set( 0.19, 1.5, 0); g.add(sR)

  for (const side of [-0.32, 0.32]) {
    const arm = new THREE.Group()
    arm.position.set(side, 1.45, 0)
    const ua = cyl(0.09, 0.08, 0.42, SKIN); ua.position.set(0, -0.21, 0); arm.add(ua)
    const la = cyl(0.08, 0.07, 0.38, SKIN); la.position.set(0, -0.55, 0); arm.add(la)
    const ha = box(0.11, 0.12, 0.11, SKIN);  ha.position.set(0, -0.75, 0); arm.add(ha)
    g.add(arm)
  }

  const neck = cyl(0.08, 0.09, 0.15, SKIN); neck.position.set(0, 1.55, 0); g.add(neck)

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 10),
    new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.85 })
  )
  head.position.set(0, 1.78, 0); g.add(head)

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.245, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.9 })
  )
  hair.position.set(0, 1.80, 0); g.add(hair)

  return g
}

// ── Name tag sprite ────────────────────────────────────────────────────────
function makeNameTag(nickname: string): THREE.Sprite {
  const W = 256, H = 56
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = 'rgba(0,0,0,0.70)'
  const [rx, ry, rw, rh, rr] = [4, 4, W - 8, H - 8, 10]
  ctx.beginPath()
  ctx.moveTo(rx + rr, ry)
  ctx.lineTo(rx + rw - rr, ry); ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rr)
  ctx.lineTo(rx + rw, ry + rh - rr); ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rr, ry + rh)
  ctx.lineTo(rx + rr, ry + rh); ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rr)
  ctx.lineTo(rx, ry + rr); ctx.quadraticCurveTo(rx, ry, rx + rr, ry)
  ctx.fill()

  ctx.fillStyle = '#3b82f6'
  ctx.fillRect(rx, ry, 4, rh)

  ctx.fillStyle = '#fff'
  ctx.font = 'bold 22px Arial, sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(nickname.toUpperCase(), W / 2, H / 2)

  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    depthTest: false, transparent: true,
  })
  const s = new THREE.Sprite(mat)
  s.scale.set(3.2, 0.7, 1)
  s.renderOrder = 999
  return s
}

// ── RemotePlayer ───────────────────────────────────────────────────────────
// Only represents the on-foot character + name tag.
// When a remote player is driving, the actual game Car entity (BMW/Mercedes)
// is moved to their position by GameEngine — no separate car mesh here.
export class RemotePlayer {
  readonly id: string
  readonly nickname: string

  private scene: THREE.Scene
  private footGroup: THREE.Group   // CJ character, shown when on foot
  private nameTag: THREE.Sprite    // world-space, always visible + upright

  // Interpolation
  private currentPos  = new THREE.Vector3()
  private currentQuat = new THREE.Quaternion()
  private targetPos   = new THREE.Vector3()
  private targetQuat  = new THREE.Quaternion()
  private firstUpdate = true

  mode: 'driving' | 'onfoot' = 'onfoot'

  constructor(scene: THREE.Scene, data: RemotePlayerData) {
    this.scene    = scene
    this.id       = data.id
    this.nickname = data.nickname

    // Foot group: feet at y=0, placed at (localPos.y - 0.4) so feet touch ground
    // when group is at physics-body-center (body sphere center = feet + 0.4)
    this.footGroup = buildPlayerGroup()
    this.footGroup.position.y = -0.4
    scene.add(this.footGroup)

    // Name tag always rendered in world space above the player
    this.nameTag = makeNameTag(data.nickname)
    scene.add(this.nameTag)

    this.applyRemoteState(data)
  }

  applyRemoteState(data: RemotePlayerData) {
    this.targetPos.set(data.pos[0], data.pos[1], data.pos[2])
    this.targetQuat.set(data.quat[0], data.quat[1], data.quat[2], data.quat[3])
    this.mode = data.mode

    if (this.firstUpdate) {
      this.currentPos.copy(this.targetPos)
      this.currentQuat.copy(this.targetQuat)
      this.firstUpdate = false
    }
  }

  update(dt: number) {
    const alpha = Math.min(1, dt * 14)
    this.currentPos.lerp(this.targetPos, alpha)
    this.currentQuat.slerp(this.targetQuat, alpha)

    // Foot character: only visible when on foot
    this.footGroup.visible = this.mode === 'onfoot'
    this.footGroup.position.copy(this.currentPos)
    this.footGroup.position.y = this.currentPos.y - 0.4
    this.footGroup.quaternion.copy(this.currentQuat)

    // Name tag: always visible above player (car height when driving, character height on foot)
    const tagY = this.currentPos.y + (this.mode === 'driving' ? 3.2 : 2.6)
    this.nameTag.position.set(this.currentPos.x, tagY, this.currentPos.z)
  }

  dispose() {
    this.scene.remove(this.footGroup)
    this.scene.remove(this.nameTag)
    ;(this.nameTag.material as THREE.SpriteMaterial).map?.dispose()
    this.nameTag.material.dispose()
  }
}
