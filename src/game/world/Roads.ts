import * as THREE from 'three'

/** Creates road surface texture */
function createRoadTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  // Asphalt
  ctx.fillStyle = '#2a2a2a'
  ctx.fillRect(0, 0, 512, 512)

  // Random noise/cracks for realism
  for (let i = 0; i < 600; i++) {
    const x = Math.random() * 512
    const y = Math.random() * 512
    ctx.fillStyle = `rgba(${30 + Math.random() * 20},${30 + Math.random() * 20},${30 + Math.random() * 20},0.5)`
    ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3)
  }

  return new THREE.CanvasTexture(canvas)
}

function createPavementTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  // Base pavement color
  ctx.fillStyle = '#b8b0a0'
  ctx.fillRect(0, 0, 256, 256)

  // Stone blocks
  const blockW = 64
  const blockH = 48
  ctx.strokeStyle = '#888078'
  ctx.lineWidth = 2
  for (let r = 0; r < 256; r += blockH) {
    const offset = Math.floor(r / blockH) % 2 === 0 ? 0 : blockW / 2
    for (let c = -blockW; c < 256 + blockW; c += blockW) {
      ctx.strokeRect(c + offset, r, blockW, blockH)
    }
  }

  return new THREE.CanvasTexture(canvas)
}

export function createGround(scene: THREE.Scene) {
  const roadTex = createRoadTexture()
  roadTex.wrapS = THREE.RepeatWrapping
  roadTex.wrapT = THREE.RepeatWrapping
  roadTex.repeat.set(60, 60)

  // Main ground plane
  const groundGeo = new THREE.PlaneGeometry(1200, 1200)
  const groundMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: 0.92,
    metalness: 0.0,
    color: 0x2a2a2a,
  })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  return ground
}

export function createRoad(
  scene: THREE.Scene,
  x: number,
  z: number,
  width: number,
  length: number,
  rotation = 0
) {
  const roadTex = createRoadTexture()
  roadTex.wrapS = THREE.RepeatWrapping
  roadTex.wrapT = THREE.RepeatWrapping
  roadTex.repeat.set(width / 10, length / 10)

  const geo = new THREE.PlaneGeometry(width, length)
  const mat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: 0.88,
    metalness: 0.0,
    color: 0x303030,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.rotation.z = rotation
  mesh.position.set(x, 0.01, z)
  mesh.receiveShadow = true
  scene.add(mesh)

  addLaneMarkings(scene, x, z, width, length, rotation)
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

  // Center line (yellow dashed)
  const dashCount = Math.floor(length / 8)
  for (let i = 0; i < dashCount; i++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 4.5), yellowMat)
    dash.rotation.x = -Math.PI / 2
    dash.rotation.z = rotation
    const offset = -length / 2 + i * 8 + 4
    dash.position.set(x, 0.02, z + offset)
    scene.add(dash)
  }

  // Edge lines
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
  rotation = 0
) {
  const paveTex = createPavementTexture()
  paveTex.wrapS = THREE.RepeatWrapping
  paveTex.wrapT = THREE.RepeatWrapping
  paveTex.repeat.set(width / 4, length / 4)

  // Raised sidewalk
  const geo = new THREE.BoxGeometry(width, 0.14, length)
  const mat = new THREE.MeshStandardMaterial({
    map: paveTex,
    roughness: 0.88,
    color: 0xb8b0a0,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.rotation.y = rotation
  mesh.position.set(x, 0.07, z)
  mesh.receiveShadow = true
  scene.add(mesh)

  // Curb
  const curbMat = new THREE.MeshStandardMaterial({ color: 0xaaa090, roughness: 0.9 })
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, length), curbMat)
    curb.rotation.y = rotation
    curb.position.set(x + side * (width / 2 - 0.08), 0.07, z)
    scene.add(curb)
  }

  return mesh
}

export function createRoundabout(scene: THREE.Scene, cx: number, cz: number, innerR: number, outerR: number) {
  const roadTex = createRoadTexture()
  roadTex.wrapS = THREE.RepeatWrapping
  roadTex.wrapT = THREE.RepeatWrapping
  roadTex.repeat.set(6, 6)

  // Ring road
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(innerR, outerR, 64),
    new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.88, color: 0x303030 })
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.set(cx, 0.01, cz)
  ring.receiveShadow = true
  scene.add(ring)

  // Lane marking on roundabout
  const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const innerEdge = new THREE.Mesh(
    new THREE.RingGeometry(innerR, innerR + 0.25, 64),
    markMat
  )
  innerEdge.rotation.x = -Math.PI / 2
  innerEdge.position.set(cx, 0.02, cz)
  scene.add(innerEdge)

  const outerEdge = new THREE.Mesh(
    new THREE.RingGeometry(outerR - 0.25, outerR, 64),
    markMat
  )
  outerEdge.rotation.x = -Math.PI / 2
  outerEdge.position.set(cx, 0.02, cz)
  scene.add(outerEdge)

  // Central plaza (stone/pavement)
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(innerR, 64),
    new THREE.MeshStandardMaterial({
      color: 0xc8c0b0,
      roughness: 0.8,
    })
  )
  plaza.rotation.x = -Math.PI / 2
  plaza.position.set(cx, 0.05, cz)  // raised above ring road (0.01) to prevent z-fighting
  plaza.receiveShadow = true
  scene.add(plaza)
}
