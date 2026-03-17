import * as THREE from 'three'
import type { PhysicsWorld } from '../PhysicsWorld'
import * as CANNON from 'cannon-es'

export interface BuildingConfig {
  x: number
  z: number
  width: number
  depth: number
  height: number
  color: number
  windowColor?: number
  name?: string
  style?: 'soviet' | 'georgian' | 'modern' | 'neoclassical'
}

/** Canvas-based window texture for buildings */
function createWindowTexture(cols: number, rows: number, style: BuildingConfig['style'] = 'soviet'): THREE.CanvasTexture {
  const W = 256
  const H = 512
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Background — building wall
  ctx.fillStyle = style === 'modern' ? '#224466' : style === 'neoclassical' ? '#f0ece0' : '#9a9080'
  ctx.fillRect(0, 0, W, H)

  const cw = W / cols
  const rh = H / rows
  const pw = cw * 0.7 // Larger windows for glass look
  const ph = rh * 0.8
  const px = (cw - pw) / 2
  const py = (rh - ph) / 2

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() > 0.35
      const wx = c * cw + px
      const wy = r * rh + py

      if (style === 'modern') {
        // Blue Glass curtain wall look
        ctx.fillStyle = lit ? '#88ccff' : '#1a3a5a'
        ctx.fillRect(wx, wy, pw, ph)
        ctx.strokeStyle = '#4488aa'
        ctx.lineWidth = 2
        ctx.strokeRect(wx, wy, pw, ph)
      } else {
        // Traditional window with frame
        ctx.fillStyle = lit ? '#ffe8a0' : '#3a3028'
        ctx.fillRect(wx, wy, pw, ph)
        ctx.fillStyle = style === 'neoclassical' ? '#c8b890' : '#776655'
        ctx.lineWidth = 2
        ctx.strokeRect(wx, wy, pw, ph)
        // Window cross
        ctx.fillStyle = style === 'neoclassical' ? '#c8b890' : '#887766'
        ctx.fillRect(wx + pw / 2 - 0.5, wy, 1.5, ph)
        ctx.fillRect(wx, wy + ph / 2 - 0.5, pw, 1.5)
      }
    }
  }

  return new THREE.CanvasTexture(canvas)
}

function createBuildingMaterial(config: BuildingConfig): THREE.MeshStandardMaterial {
  const tex = createWindowTexture(
    config.style === 'modern' ? 5 : 4,
    config.style === 'modern' ? 12 : Math.floor(config.height / 3.5),
    config.style
  )
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(Math.ceil(config.width / 10), Math.ceil(config.height / 12))

  return new THREE.MeshStandardMaterial({
    map: tex,
    color: config.style === 'modern' ? new THREE.Color(0x66aaff) : new THREE.Color(config.color),
    metalness: config.style === 'modern' ? 0.9 : 0.0,
    roughness: config.style === 'modern' ? 0.02 : 0.85,
    transparent: false, // Solid blue glass look is better than clear transparency
  })
}

export function addBuilding(
  scene: THREE.Scene,
  physics: PhysicsWorld,
  config: BuildingConfig
) {
  const group = new THREE.Group()

  // Main building body
  const mat = createBuildingMaterial(config)
  const geo = new THREE.BoxGeometry(config.width, config.height, config.depth)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = false   // buildings don't cast shadows — major perf win
  mesh.receiveShadow = true
  mesh.position.y = config.height / 2
  group.add(mesh)

  // Roof detail
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.9 })
  if (config.style === 'neoclassical') {
    // Pediment / parapet
    const parapet = new THREE.Mesh(
      new THREE.BoxGeometry(config.width + 0.4, 1.2, config.depth + 0.4),
      new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.8 })
    )
    parapet.position.y = config.height + 0.6
    group.add(parapet)
    // Columns in front (evenly spaced)
    const colCount = Math.floor(config.width / 5)
    const colSpacing = config.width / (colCount + 1)
    const colMat = new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.7 })
    for (let i = 0; i < colCount; i++) {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.32, config.height, 10),
        colMat
      )
      col.position.set(-config.width / 2 + colSpacing * (i + 1), config.height / 2, config.depth / 2 + 0.1)
      col.castShadow = false
      group.add(col)
    }
  } else if (config.style === 'georgian') {
    // Wooden balconies
    const balconyMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.9 })
    const floors = Math.floor(config.height / 3)
    for (let f = 1; f < floors; f++) {
      const bal = new THREE.Mesh(
        new THREE.BoxGeometry(config.width + 0.8, 0.12, 1.4),
        balconyMat
      )
      bal.position.set(0, f * 3.2 + 0.06, config.depth / 2 + 0.7)
      bal.castShadow = false
      group.add(bal)
    }
  } else if (config.style === 'soviet') {
    // Flat roof with small parapet
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(config.width + 0.3, 0.5, config.depth + 0.3),
      roofMat
    )
    roof.position.y = config.height + 0.25
    group.add(roof)
  }

  group.position.set(config.x, 0, config.z)
  scene.add(group)

  // Physics collider
  physics.addStaticBox(
    new CANNON.Vec3(config.width / 2, config.height / 2, config.depth / 2),
    new CANNON.Vec3(config.x, config.height / 2, config.z)
  )

  return group
}

export function addTree(scene: THREE.Scene, x: number, z: number, height = 5, physics?: PhysicsWorld) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.95 })
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d6b1e, roughness: 0.85 })

  const group = new THREE.Group()

  // Trunk
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.22, height * 0.45, 8),
    trunkMat
  )
  trunk.position.y = height * 0.225
  trunk.castShadow = false
  group.add(trunk)

  // Physics collider for trunk — tagged 'soft' so it barely damages the car
  if (physics) {
    const body = physics.addStaticBox(
      new CANNON.Vec3(0.25, height * 0.225, 0.25),
      new CANNON.Vec3(x, height * 0.225, z)
    )
    ;(body as any).__soft = true
  }

  // Canopy layers
  for (let i = 0; i < 3; i++) {
    const r = (height * 0.5) * (1 - i * 0.25)
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(r, 6, 5),
      leafMat
    )
    leaves.position.y = height * 0.4 + i * height * 0.15
    leaves.scale.set(1, 0.75, 1)
    leaves.castShadow = false
    group.add(leaves)
  }

  group.position.set(x, 0, z)
  scene.add(group)
  return group
}
