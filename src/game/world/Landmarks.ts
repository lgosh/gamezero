import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import type { PhysicsWorld } from '../PhysicsWorld'

/** Liberty Monument — the iconic column of Freedom Square, Tbilisi.
 *  35m tall column topped with a golden St. George figure. Built 2006. */
export function createLibertyMonument(scene: THREE.Scene, physics: PhysicsWorld) {
  const group = new THREE.Group()

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xddd8cc, roughness: 0.85, metalness: 0.0 })
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.8, roughness: 0.2, emissive: new THREE.Color(0xaa7a00), emissiveIntensity: 0.15 })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x444438, roughness: 0.8 })

  // Base pedestal — stepped
  const base1 = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.5, 1.8, 12), stoneMat)
  base1.position.y = 0.9
  base1.castShadow = false
  group.add(base1)

  const base2 = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 5.0, 2.0, 12), stoneMat)
  base2.position.y = 2.8
  base2.castShadow = false
  group.add(base2)

  const base3 = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.8, 3.5, 12), stoneMat)
  base3.position.y = 5.55
  base3.castShadow = false
  group.add(base3)

  // Bas-relief panels on pedestal (decorative)
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.5, 0.18), darkMat)
    panel.position.set(Math.sin(angle) * 2.7, 5.0, Math.cos(angle) * 2.7)
    panel.rotation.y = -angle
    group.add(panel)
  }

  // Main column shaft — tapered slightly
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.35, 26, 12), stoneMat)
  col.position.y = 20.3
  col.castShadow = false
  group.add(col)

  // Column capital / top piece
  const capital = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.0, 2.0, 12), stoneMat)
  capital.position.y = 34.3
  capital.castShadow = false
  group.add(capital)

  // St. George on horseback (simplified but recognizable)
  // Horse body
  const horseBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 1.6), goldMat)
  horseBody.position.y = 36.8
  horseBody.rotation.x = -0.1
  group.add(horseBody)

  // Horse head
  const horseHead = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.65), goldMat)
  horseHead.position.set(0, 37.4, 0.9)
  horseHead.rotation.x = -0.2
  group.add(horseHead)

  // Horse legs
  const positions = [[-0.28, -0.45, 0.5], [0.28, -0.45, 0.5], [-0.28, -0.45, -0.5], [0.28, -0.45, -0.5]]
  for (const [px, py, pz] of positions) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.9, 6), goldMat)
    leg.position.set(px, 36.8 + py, pz)
    group.add(leg)
  }

  // Rider (St. George)
  const riderBody = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.72, 0.38), goldMat)
  riderBody.position.set(0, 37.65, 0.0)
  group.add(riderBody)

  // Rider head
  const riderHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), goldMat)
  riderHead.position.set(0, 38.20, 0.0)
  group.add(riderHead)

  // Spear
  const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.2, 6), goldMat)
  spear.rotation.z = 0.3
  spear.rotation.x = 0.2
  spear.position.set(0.4, 38.2, 0.6)
  group.add(spear)

  // Physics collider for the column base
  physics.addStaticBox(
    new CANNON.Vec3(1.4, 17, 1.4),
    new CANNON.Vec3(0, 17, 0)
  )
  physics.addStaticBox(
    new CANNON.Vec3(3.0, 4, 3.0),
    new CANNON.Vec3(0, 4, 0)
  )

  scene.add(group)
  return group
}

/** Kashueti Church (St. George Church) on Rustaveli Avenue — 6th-century Georgian Orthodox church */
export function createGeorgianChurch(scene: THREE.Scene, physics: PhysicsWorld, x: number, z: number) {
  const group = new THREE.Group()
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.88 })
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.82 })
  const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0xc8b898, roughness: 0.90 })

  const W = 14, D = 24, H = 10
  // Nave
  const nave = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), stoneMat)
  nave.position.y = H / 2
  nave.castShadow = false
  group.add(nave)

  // Gabled roof
  const roofGeo = new THREE.CylinderGeometry(0, W * 0.72, H * 0.5, 4)
  const roofMesh = new THREE.Mesh(roofGeo, roofMat)
  roofMesh.rotation.y = Math.PI / 4
  roofMesh.position.y = H + H * 0.25
  roofMesh.castShadow = false
  group.add(roofMesh)

  // Drum of dome
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.2, 4.5, 12), stoneMat)
  drum.position.y = H + H * 0.5 + 2.25
  group.add(drum)

  // Dome
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.0, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), darkStoneMat)
  dome.position.y = H + H * 0.5 + 4.5
  dome.castShadow = false
  group.add(dome)

  // Drum windows (8 arches)
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const winMat = new THREE.MeshStandardMaterial({ color: 0x3344aa, transparent: true, opacity: 0.7 })
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.3), winMat)
    win.position.set(Math.sin(angle) * 2.9, H + H * 0.5 + 2.0, Math.cos(angle) * 2.9)
    win.rotation.y = -angle
    group.add(win)
  }

  // Apse (semi-circular east end)
  const apse = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.18, D * 0.18, H, 16, 1, false, 0, Math.PI), stoneMat)
  apse.position.set(0, H / 2, D / 2 + D * 0.09)
  group.add(apse)

  // Entrance porch
  const porch = new THREE.Mesh(new THREE.BoxGeometry(W * 0.55, H * 0.75, 3.5), stoneMat)
  porch.position.set(0, H * 0.375, -D / 2 - 1.75)
  group.add(porch)

  // Cross on top
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.7 }))
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.7 }))
  crossV.position.y = H + H * 0.5 + 9
  crossH.position.y = H + H * 0.5 + 9.5
  group.add(crossV, crossH)

  group.position.set(x, 0, z)
  scene.add(group)

  physics.addStaticBox(
    new CANNON.Vec3(W / 2, H / 2, D / 2),
    new CANNON.Vec3(x, H / 2, z)
  )

  return group
}

/** Tbilisi City Hall / former Viceroy Palace */
export function createCityHall(scene: THREE.Scene, physics: PhysicsWorld, x: number, z: number) {
  const group = new THREE.Group()
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.80, metalness: 0.02 })
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a4a1e, roughness: 0.8, metalness: 0.1 })
  const colMat = new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.75 })
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x4466aa, transparent: true, opacity: 0.6 })

  const W = 55, D = 28, H = 20

  // Main body
  const main = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat)
  main.position.y = H / 2
  main.castShadow = false
  main.receiveShadow = true
  group.add(main)

  // Roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 1, 1.5, D + 1), roofMat)
  roof.position.y = H + 0.75
  group.add(roof)

  // Central pediment
  const pediment = new THREE.Mesh(new THREE.BoxGeometry(W * 0.4, 4, 1.0), wallMat)
  pediment.position.set(0, H + 2, D / 2 + 0.2)
  group.add(pediment)

  // Triangular gable
  const gableGeo = new THREE.CylinderGeometry(0, W * 0.2, 3.5, 3)
  const gable = new THREE.Mesh(gableGeo, wallMat)
  gable.rotation.y = Math.PI / 6
  gable.position.set(0, H + 4 + 1.75, D / 2 + 0.2)
  group.add(gable)

  // Columns on front facade
  const colCount = 9
  for (let i = 0; i < colCount; i++) {
    const cx = -W / 2 + (W / (colCount - 1)) * i
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.48, H, 10), colMat)
    col.position.set(cx, H / 2, D / 2 + 0.1)
    col.castShadow = false
    group.add(col)
  }

  // Windows
  const winRows = 3, winCols = 10
  for (let r = 0; r < winRows; r++) {
    for (let c = 0; c < winCols; c++) {
      const wx = -W / 2 + (W / (winCols + 1)) * (c + 1)
      const wy = 3.5 + r * 5.5
      const win = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 0.1), glassMat)
      win.position.set(wx, wy, D / 2 + 0.1)
      group.add(win)
      // Arch above window
      const arch = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.1, 16, 1, false, 0, Math.PI), wallMat)
      arch.rotation.z = Math.PI / 2
      arch.rotation.y = Math.PI / 2
      arch.position.set(wx, wy + 1.8, D / 2 + 0.12)
      group.add(arch)
    }
  }

  // Green copper dome in center
  const domeDrum = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.0, 5, 12), wallMat)
  domeDrum.position.y = H + 2.5
  group.add(domeDrum)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.8, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), roofMat)
  dome.position.y = H + 5
  group.add(dome)

  group.position.set(x, 0, z)
  scene.add(group)

  physics.addStaticBox(
    new CANNON.Vec3(W / 2, H / 2, D / 2),
    new CANNON.Vec3(x, H / 2, z)
  )

  return group
}

/** Biltmore Hotel tower — tall modern hotel overlooking Freedom Square */
export function createBiltmoreHotel(scene: THREE.Scene, physics: PhysicsWorld, x: number, z: number) {
  const group = new THREE.Group()
  const W = 28, D = 22, H = 68

  // Create a canvas texture with glass curtain wall look
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 512
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#1a2a3a'
  ctx.fillRect(0, 0, 256, 512)
  // Glass panels
  const rows = 22, cols = 7
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() > 0.4
      ctx.fillStyle = lit ? '#88aacc' : '#223344'
      ctx.fillRect(c * (256 / cols) + 2, r * (512 / rows) + 2, 256 / cols - 4, 512 / rows - 4)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping

  const glassMat = new THREE.MeshStandardMaterial({
    map: tex,
    metalness: 0.6,
    roughness: 0.1,
    color: 0x8899aa,
  })

  const main = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), glassMat)
  main.position.y = H / 2
  main.castShadow = false
  main.receiveShadow = true
  group.add(main)

  // Setbacks toward top
  const setback1 = new THREE.Mesh(new THREE.BoxGeometry(W * 0.85, H * 0.12, D * 0.85), glassMat)
  setback1.position.y = H + H * 0.06
  group.add(setback1)

  const setback2 = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, H * 0.06, D * 0.6), glassMat)
  setback2.position.y = H + H * 0.12 + H * 0.03
  group.add(setback2)

  // Roof plant / mechanical
  const roofTop = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.4, 6, D * 0.4),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 })
  )
  roofTop.position.y = H + H * 0.18 + 3
  group.add(roofTop)

  // Lobby base (wider)
  const lobby = new THREE.Mesh(
    new THREE.BoxGeometry(W + 4, 6, D + 4),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.5, metalness: 0.3 })
  )
  lobby.position.y = 3
  group.add(lobby)

  group.position.set(x, 0, z)
  scene.add(group)

  physics.addStaticBox(
    new CANNON.Vec3(W / 2, H / 2, D / 2),
    new CANNON.Vec3(x, H / 2, z)
  )

  return group
}

/** Georgian Parliament building */
export function createParliament(scene: THREE.Scene, physics: PhysicsWorld, x: number, z: number) {
  const group = new THREE.Group()
  const W = 65, D = 32, H = 16
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xeee8d8, roughness: 0.8 })
  const colMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.75 })
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x4466aa, transparent: true, opacity: 0.65 })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 })

  // Main body
  const main = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat)
  main.position.y = H / 2
  main.castShadow = false
  group.add(main)

  // Roof parapet
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(W + 1, 1.8, D + 1), wallMat)
  parapet.position.y = H + 0.9
  group.add(parapet)

  // Front portico
  const portico = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, H * 0.85, 5), wallMat)
  portico.position.set(0, H * 0.425, D / 2 + 2.5)
  group.add(portico)

  // Columns
  const colCount = 12
  for (let i = 0; i < colCount; i++) {
    const cx = -W * 0.25 + (W * 0.5 / (colCount - 1)) * i
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.52, H * 0.8, 10), colMat)
    col.position.set(cx, H * 0.4, D / 2 + 0.1)
    col.castShadow = false
    group.add(col)
  }

  // Flag pole
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 12, 6), darkMat)
  flagPole.position.set(0, H + 6, D / 2 - 2)
  group.add(flagPole)

  // Georgian flag (dark cross on white)
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.4),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  )
  flag.position.set(1.25, H + 10.5, D / 2 - 2)
  group.add(flag)

  group.position.set(x, 0, z)
  scene.add(group)

  physics.addStaticBox(
    new CANNON.Vec3(W / 2, H / 2, D / 2),
    new CANNON.Vec3(x, H / 2, z)
  )

  return group
}

/** Traffic light */
export function createTrafficLight(scene: THREE.Scene, x: number, z: number, rotation = 0) {
  const group = new THREE.Group()
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 })
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x111111 })

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 6, 8), poleMat)
  pole.position.y = 3
  group.add(pole)

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 8), poleMat)
  arm.rotation.z = Math.PI / 2
  arm.position.set(1.5, 5.8, 0)
  group.add(arm)

  const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.95, 0.3), boxMat)
  box.position.set(3.0, 5.4, 0)
  group.add(box)

  // Red, yellow, green lights
  const redMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: new THREE.Color(0xff0000), emissiveIntensity: 1.2 })
  const yellowMat = new THREE.MeshStandardMaterial({ color: 0x333300 })
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x333300 })

  for (const [col, y, mat] of [[0xff0000, 5.72, redMat], [0xffaa00, 5.40, yellowMat], [0x00ff00, 5.08, greenMat]] as const) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 10), mat as THREE.MeshStandardMaterial)
    light.position.set(3.0, y as number, 0.1)
    group.add(light)
  }

  group.position.set(x, 0, z)
  group.rotation.y = rotation
  scene.add(group)

  return group
}
