import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import type { PhysicsWorld } from '../PhysicsWorld'

/** Liberty Monument — high-fidelity reconstruction of the 44m tall column at the center of Freedom Square. */
export function createLibertyMonument(scene: THREE.Scene, physics: PhysicsWorld) {
  const group = new THREE.Group()

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe0ddd0, roughness: 0.7 })
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.15, emissive: 0xaa8800, emissiveIntensity: 0.2 })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 })

  // 1. Base Pedestal (Square multi-tier)
  const base1 = new THREE.Mesh(new THREE.BoxGeometry(14, 2, 14), stoneMat)
  base1.position.y = 1
  group.add(base1)

  const base2 = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 10), stoneMat)
  base2.position.y = 4
  group.add(base2)

  const base3 = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 7), stoneMat)
  base3.position.y = 9
  group.add(base3)

  // 4 Corner Statues
  for (const [sx, sz] of [[-1,-1], [1,-1], [-1,1], [1,1]]) {
    const stat = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3, 8), darkMat)
    stat.position.set(sx * 4.5, 7.5, sz * 4.5)
    group.add(stat)
  }

  // 2. Main Column
  const colBase = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 2, 16), stoneMat)
  colBase.position.y = 13
  group.add(colBase)

  const colShaft = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 28, 16), stoneMat)
  colShaft.position.y = 28
  group.add(colShaft)

  const capital = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.6, 3, 16), stoneMat)
  capital.position.y = 43
  group.add(capital)

  // 3. Golden St. George
  const statPos = 45.5
  const horse = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 2.2), goldMat)
  horse.position.y = statPos
  group.add(horse)
  
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.6), goldMat)
  neck.position.set(0, statPos + 0.8, 0.8); neck.rotation.x = -Math.PI / 4
  group.add(neck)

  const rider = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.6), goldMat)
  rider.position.set(0, statPos + 0.8, -0.2)
  group.add(rider)

  const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.5, 8), goldMat)
  spear.position.set(0.6, statPos + 0.5, 0.8); spear.rotation.x = Math.PI / 3
  group.add(spear)

  scene.add(group)

  // Physics
  physics.addStaticBox(new CANNON.Vec3(7, 1, 7), new CANNON.Vec3(0, 1, 0))
  physics.addStaticBox(new CANNON.Vec3(5, 2, 5), new CANNON.Vec3(0, 4, 0))
  physics.addStaticCylinder(2.5, 2.5, 30, new CANNON.Vec3(0, 28, 0))

  return group
}

/** Tbilisi City Hall (City Assembly) — high-fidelity Neo-Moorish reconstruction. */
export function createCityHall(scene: THREE.Scene, physics: PhysicsWorld, x: number, z: number) {
  const group = new THREE.Group()
  const wallMainColor = 0xe8a850 // Authentic yellowish-orange
  const trimColor = 0xf5f0e0     // Cream trim
  const roofColor = 0x8b4513     // Brown
  
  const mainMat = new THREE.MeshStandardMaterial({ color: wallMainColor, roughness: 0.7 })
  const trimMat = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.6 })
  const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.8 })

  // 1. Create Neo-Moorish Window Texture
  const winCanvas = document.createElement('canvas')
  winCanvas.width = 128; winCanvas.height = 256
  const wctx = winCanvas.getContext('2d')!
  wctx.fillStyle = '#f5f0e0'; wctx.fillRect(0, 0, 128, 256)
  wctx.fillStyle = '#334466'
  wctx.beginPath()
  wctx.moveTo(20, 220); wctx.lineTo(20, 80); wctx.arc(64, 80, 44, Math.PI, 0); wctx.lineTo(108, 220); wctx.closePath()
  wctx.fill()
  wctx.strokeStyle = '#e8a850'; wctx.lineWidth = 4; wctx.stroke()
  const winMat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(winCanvas), roughness: 0.4 })

  const W = 65, D = 30, H = 22

  // 2. Main Body
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), trimMat)
  base.position.y = H / 2
  group.add(base)

  for (const side of [-1, 1]) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(22, H - 2, 1), mainMat)
    seg.position.set(side * 18, H / 2, D / 2 + 0.1)
    group.add(seg)
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(5, 10), winMat)
      w.position.set(side * 18 + (i - 1) * 6, H / 2, D / 2 + 0.2)
      group.add(w)
    }
  }

  // 3. Central Clock Tower
  const towerW = 10, towerH = 18
  const tower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerW), mainMat)
  tower.position.set(0, H + towerH / 2 - 2, 0)
  group.add(tower)

  const clock = new THREE.Mesh(new THREE.CircleGeometry(3, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }))
  clock.position.set(0, H + towerH - 6, towerW / 2 + 0.1)
  group.add(clock)

  const towerRoof = new THREE.Mesh(new THREE.CylinderGeometry(0, towerW * 0.8, 8, 4), roofMat)
  towerRoof.rotation.y = Math.PI / 4
  towerRoof.position.y = H + towerH + 2
  group.add(towerRoof)

  group.position.set(x, 0, z)
  scene.add(group)

  physics.addStaticBox(new CANNON.Vec3(W / 2, H / 2, D / 2), new CANNON.Vec3(x, H / 2, z))
  physics.addStaticBox(new CANNON.Vec3(towerW / 2, towerH / 2, towerW / 2), new CANNON.Vec3(x, H + towerH/2, z))

  return group
}

/** Galleria Tbilisi — modern shopping mall on the north side of Freedom Square */
export function createGalleriaTbilisi(scene: THREE.Scene, physics: PhysicsWorld, x: number, z: number, rotation = 0) {
  const group = new THREE.Group()
  const W = 70, D = 45, H = 32
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.8, roughness: 0.1, transparent: true, opacity: 0.8 })
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6 })

  const main = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), glassMat)
  main.position.y = H / 2
  group.add(main)

  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(W + 2, 4, D + 2), stoneMat)
  frameTop.position.y = H - 2
  group.add(frameTop)

  group.position.set(x, 0, z)
  group.rotation.y = rotation
  scene.add(group)

  physics.addStaticBox(new CANNON.Vec3(W / 2, H / 2, D / 2), new CANNON.Vec3(x, H / 2, z), undefined, rotation)
  return group
}

/** Courtyard Marriott — iconic hotel on the west side of Freedom Square */
export function createCourtyardMarriott(scene: THREE.Scene, physics: PhysicsWorld, x: number, z: number, rotation = 0) {
  const group = new THREE.Group()
  const W = 60, D = 25, H = 24
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.8 })

  const wing1 = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, H, D), wallMat)
  wing1.position.set(-W * 0.3, H / 2, 0); group.add(wing1)
  const wing2 = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, H, D), wallMat)
  wing2.position.set(W * 0.3, H / 2, 0); group.add(wing2)

  group.position.set(x, 0, z)
  group.rotation.y = rotation
  scene.add(group)

  physics.addStaticBox(new CANNON.Vec3(W / 2, H / 2, D / 2), new CANNON.Vec3(x, H / 2, z), undefined, rotation)
  return group
}

/** Georgian Parliament building */
export function createParliament(scene: THREE.Scene, physics: PhysicsWorld, x: number, z: number, rotation = 0) {
  const group = new THREE.Group()
  const W = 65, D = 32, H = 16
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xeee8d8, roughness: 0.8 })
  const colMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.75 })

  const main = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat)
  main.position.y = H / 2; group.add(main)

  const portico = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, H * 0.85, 5), wallMat)
  portico.position.set(0, H * 0.425, D / 2 + 2.5); group.add(portico)

  group.position.set(x, 0, z); group.rotation.y = rotation
  scene.add(group)

  physics.addStaticBox(new CANNON.Vec3(W / 2, H / 2, D / 2), new CANNON.Vec3(x, H / 2, z), undefined, rotation)
  return group
}

/** Kashueti Church */
export function createGeorgianChurch(scene: THREE.Scene, physics: PhysicsWorld, x: number, z: number) {
  const group = new THREE.Group()
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.88 })
  const nave = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 24), stoneMat)
  nave.position.y = 5; group.add(nave)
  group.position.set(x, 0, z); scene.add(group)
  physics.addStaticBox(new CANNON.Vec3(7, 5, 12), new CANNON.Vec3(x, 5, z))
  return group
}

/** Traffic light */
export function createTrafficLight(scene: THREE.Scene, x: number, z: number, rotation = 0) {
  const group = new THREE.Group()
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 6, 8), poleMat)
  pole.position.y = 3; group.add(pole)
  group.position.set(x, 0, z); group.rotation.y = rotation; scene.add(group)
  return group
}
