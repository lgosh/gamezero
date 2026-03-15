import * as THREE from 'three'

/** Creates a stone paving canvas texture */
function makeStoneTex(isCobble = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 512
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = isCobble ? '#7a7068' : '#a0a0a0'
  ctx.fillRect(0, 0, 512, 512)

  const rows = isCobble ? 16 : 8
  const cols = isCobble ? 12 : 8
  const rw = 512 / cols
  const rh = 512 / rows

  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 2

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (rw / 2)
    for (let c = -1; c <= cols; c++) {
      const x = c * rw + offset
      const y = r * rh
      const shade = 0.8 + Math.random() * 0.4
      ctx.fillStyle = `rgba(${Math.floor(120*shade)},${Math.floor(120*shade)},${Math.floor(120*shade)},1)`
      if (isCobble) {
        ctx.beginPath()
        ctx.roundRect(x + 2, y + 2, rw - 4, rh - 4, 4)
        ctx.fill()
        ctx.stroke()
      } else {
        ctx.strokeRect(x, y, rw, rh)
      }
    }
  }
  return new THREE.CanvasTexture(canvas)
}

// Shared texture instances — created ONCE and reused for all surfaces.
// This means even if two planes overlap and fight for a pixel, they show the
// same pattern, so there is no visible flickering.
let _stoneTex: THREE.CanvasTexture | null = null
let _cobbleTex: THREE.CanvasTexture | null = null

function stoneTex(): THREE.CanvasTexture {
  if (!_stoneTex) {
    _stoneTex = makeStoneTex(false)
    _stoneTex.wrapS = _stoneTex.wrapT = THREE.RepeatWrapping
  }
  return _stoneTex
}

function cobbleTex(): THREE.CanvasTexture {
  if (!_cobbleTex) {
    _cobbleTex = makeStoneTex(true)
    _cobbleTex.wrapS = _cobbleTex.wrapT = THREE.RepeatWrapping
  }
  return _cobbleTex
}

export function createGround(scene: THREE.Scene) {
  const tex = stoneTex()
  tex.repeat.set(80, 80)
  const groundGeo = new THREE.PlaneGeometry(1500, 1500)
  const groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, color: 0x888888, depthWrite: false })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.renderOrder = 0
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.05
  ground.receiveShadow = true
  scene.add(ground)
  return ground
}

let _roadIndex = 0

export function createRoad(
  scene: THREE.Scene,
  x: number,
  z: number,
  width: number,
  length: number,
  rotation = 0
) {
  const tex = stoneTex()
  tex.repeat.set(width / 8, length / 8)

  const geo = new THREE.PlaneGeometry(width, length)
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, color: 0x909090 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.rotation.z = rotation
  const idx = _roadIndex++
  mesh.renderOrder = 1 + idx
  mesh.position.set(x, 0.01 + (idx * 0.002), z)
  mesh.receiveShadow = true
  scene.add(mesh)
  return mesh
}

function addLaneMarkings(
  scene: THREE.Scene,
  x: number,
  z: number,
  width: number,
  length: number,
  rotation: number
) {
  const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const yellowMat = new THREE.MeshBasicMaterial({ color: 0xffee00 })

  const dashCount = Math.floor(length / 8)
  for (let i = 0; i < dashCount; i++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 4.5), yellowMat)
    dash.rotation.x = -Math.PI / 2
    dash.rotation.z = rotation
    const offset = -length / 2 + i * 8 + 4
    dash.position.set(x, 0.02, z + offset)
    scene.add(dash)
  }

  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.2, length), markMat)
    edge.rotation.x = -Math.PI / 2
    edge.rotation.z = rotation
    edge.position.set(x + side * (width / 2 - 0.5), 0.02, z)
    scene.add(edge)
  }
}

export function createSidewalk(
  scene: THREE.Scene,
  x: number,
  z: number,
  width: number,
  length: number,
  rotation = 0,
  style: 'modern' | 'cobble' = 'modern'
) {
  const isCobble = style === 'cobble'
  const tex = isCobble ? cobbleTex() : stoneTex()
  tex.repeat.set(width / 4, length / 4)

  const geo = new THREE.BoxGeometry(width, 0.2, length)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.8,
    color: isCobble ? 0x908880 : 0xb0b0b0,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.rotation.y = rotation
  mesh.position.set(x, 0.1, z)
  mesh.receiveShadow = true
  scene.add(mesh)
  return mesh
}

export function createRoundabout(scene: THREE.Scene, cx: number, cz: number, innerR: number, outerR: number) {
  const tex = stoneTex()
  tex.repeat.set(8, 8)

  // Ring road — rendered at a very high renderOrder so it always draws on top of
  // all the radial roads that overlap in the central area
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(innerR, outerR, 64),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, color: 0x909090 })
  )
  ring.renderOrder = 500
  ring.rotation.x = -Math.PI / 2
  ring.position.set(cx, 0.025, cz)
  ring.receiveShadow = true
  scene.add(ring)

  // Outer lane marking
  const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
  const outerEdge = new THREE.Mesh(
    new THREE.RingGeometry(outerR - 0.4, outerR - 0.1, 64),
    markMat
  )
  outerEdge.renderOrder = 501
  outerEdge.rotation.x = -Math.PI / 2
  outerEdge.position.set(cx, 0.03, cz)
  scene.add(outerEdge)

  // NO central plaza — it was an extra overlapping layer causing z-fighting.
  // The ground plane provides the base for the inner circle area.
}
