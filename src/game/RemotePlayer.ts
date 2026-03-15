import * as THREE from 'three'
import type { RemotePlayerData } from './NetworkManager'

const NAME_W = 256
const NAME_H = 56

function makeNameTag(nickname: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width  = NAME_W
  canvas.height = NAME_H
  const ctx = canvas.getContext('2d')!

  // Background pill
  ctx.fillStyle = 'rgba(0, 0, 0, 0.70)'
  ctx.beginPath()
  const r = 10
  const x = 4, y = 4, w = NAME_W - 8, h = NAME_H - 8
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.fill()

  // ID tag stripe on left
  ctx.fillStyle = '#3b82f6'
  ctx.fillRect(x, y, 4, h)

  // Name
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 22px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(nickname.toUpperCase(), NAME_W / 2, NAME_H / 2)

  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(3.2, 0.7, 1)
  sprite.renderOrder = 999
  return sprite
}

export class RemotePlayer {
  readonly id: string
  readonly nickname: string

  private scene: THREE.Scene
  private group: THREE.Group    // car + foot meshes (rotates with player)
  private nameTag: THREE.Sprite // added to scene directly, always upright

  private carMesh: THREE.Mesh
  private footMesh: THREE.Mesh

  // Interpolation state
  private currentPos = new THREE.Vector3()
  private currentQuat = new THREE.Quaternion()
  private targetPos = new THREE.Vector3()
  private targetQuat = new THREE.Quaternion()
  private firstUpdate = true

  private mode: 'driving' | 'onfoot' = 'onfoot'

  constructor(scene: THREE.Scene, data: RemotePlayerData) {
    this.scene = scene
    this.id = data.id
    this.nickname = data.nickname

    // ── Car mesh (simple car-shaped box) ───────────────────────────────────
    const carGeo = new THREE.BoxGeometry(2.2, 1.3, 5.0)
    const carMat = new THREE.MeshLambertMaterial({ color: 0x4488ff })
    this.carMesh = new THREE.Mesh(carGeo, carMat)
    this.carMesh.position.y = 0.65

    // ── On-foot mesh (capsule) ──────────────────────────────────────────────
    const footGeo = new THREE.CapsuleGeometry(0.28, 1.2, 4, 8)
    const footMat = new THREE.MeshLambertMaterial({ color: 0xffaa44 })
    this.footMesh = new THREE.Mesh(footGeo, footMat)
    this.footMesh.position.y = 1.0

    this.group = new THREE.Group()
    this.group.add(this.carMesh, this.footMesh)
    scene.add(this.group)

    // Name tag lives in world space (added to scene, position set manually)
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
    // Smooth interpolation — faster than a fixed lerp so remote players
    // feel responsive even at 20 Hz state updates
    const alpha = Math.min(1, dt * 14)
    this.currentPos.lerp(this.targetPos, alpha)
    this.currentQuat.slerp(this.targetQuat, alpha)

    this.group.position.copy(this.currentPos)
    this.group.quaternion.copy(this.currentQuat)

    // Mesh visibility
    this.carMesh.visible  = this.mode === 'driving'
    this.footMesh.visible = this.mode === 'onfoot'

    // Name tag: world position above the player (no rotation)
    const tagY = this.currentPos.y + (this.mode === 'driving' ? 3.2 : 2.6)
    this.nameTag.position.set(this.currentPos.x, tagY, this.currentPos.z)
  }

  dispose() {
    this.scene.remove(this.group)
    this.scene.remove(this.nameTag)
    this.carMesh.geometry.dispose()
    ;(this.carMesh.material as THREE.Material).dispose()
    this.footMesh.geometry.dispose()
    ;(this.footMesh.material as THREE.Material).dispose()
    ;(this.nameTag.material as THREE.SpriteMaterial).map?.dispose()
    this.nameTag.material.dispose()
  }
}
