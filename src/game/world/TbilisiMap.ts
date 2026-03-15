import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import type { PhysicsWorld } from '../PhysicsWorld'
import { setupLighting, createStreetLamp } from './Lighting'
import { createGround, createRoad, createSidewalk, createRoundabout } from './Roads'
import { addBuilding, addTree } from './Buildings'
import {
  createLibertyMonument,
  createGeorgianChurch,
  createCityHall,
  createBiltmoreHotel,
  createParliament,
  createTrafficLight,
} from './Landmarks'
import {
  addTBCSign, addAversiSign, addBOGSign, addStreetSign,
  addCarrefourSign, addTbilisiMallSign, addRadissonSign,
  addEuropeBetSign, addAdjarabetSign, addPharmadepoSign,
} from './Signs'

/**
 * Tbilisi Freedom Square (Tavisuplebis Moedani) and surroundings.
 *
 * Layout (looking north = -Z):
 *   - Freedom Square roundabout: center (0, 0, 0)
 *   - Liberty Monument: at origin
 *   - Rustaveli Avenue: runs E-W (along X axis), south of the square (z ~ 70)
 *   - City Hall: south-east of square
 *   - Parliament: north of Rustaveli
 *   - Biltmore Hotel: NE of square
 *   - Kashueti Church: on Rustaveli, west side
 */
interface Prop {
  body: CANNON.Body
  mesh: THREE.Object3D
  /** subtract from body.position.y to get mesh base y (body center ≠ mesh origin) */
  yOffset: number
}

export class TbilisiMap {
  private scene: THREE.Scene
  private physics: PhysicsWorld
  private props: Prop[] = []

  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    this.scene = scene
    this.physics = physics
  }

  /** Call each frame (after physics step) to sync dynamic prop visuals */
  syncProps() {
    for (const { body, mesh, yOffset } of this.props) {
      mesh.position.set(body.position.x, body.position.y - yOffset, body.position.z)
      mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
    }
  }

  build() {
    setupLighting(this.scene, null as unknown as THREE.WebGLRenderer)

    // Ground
    createGround(this.scene)
    this.physics.addGround()

    // ─── Freedom Square Roundabout ───────────────────────────────────────────
    createRoundabout(this.scene, 0, 0, 22, 40)

    // ─── Liberty Monument ────────────────────────────────────────────────────
    createLibertyMonument(this.scene, this.physics)

    // ─── Streets radiating from Freedom Square ────────────────────────────────
    // Rustaveli Avenue (W-E, south side of square)
    createRoad(this.scene, 0, 60, 36, 320)             // N-S short approach
    createRoad(this.scene, 0, 60, 36, 400, Math.PI / 2)  // E-W main Rustaveli

    // East approach
    createRoad(this.scene, 120, 0, 28, 200, Math.PI / 2)
    createSidewalk(this.scene, 120, 0, 8, 200, 0)

    // West approach (toward old town)
    createRoad(this.scene, -120, 0, 28, 200, Math.PI / 2)

    // North-east approach
    createRoad(this.scene, 60, -80, 22, 180, Math.PI / 6)

    // South approach (Pushkin / Nikoladze)
    createRoad(this.scene, -20, 100, 22, 180)

    // South-east toward Metekhi bridge
    createRoad(this.scene, 80, 80, 22, 160, -Math.PI / 5)

    // Sidewalks along Rustaveli
    createSidewalk(this.scene, -90, 78, 10, 200, Math.PI / 2)
    createSidewalk(this.scene, 90, 78, 10, 200, Math.PI / 2)
    createSidewalk(this.scene, 0, 80, 200, 8)
    createSidewalk(this.scene, 0, 40, 200, 8)

    // ─── Landmark Buildings ───────────────────────────────────────────────────
    // City Hall (former Russian Viceroy Palace) — south-east of square
    createCityHall(this.scene, this.physics, 55, 85)

    // Kashueti Church — on Rustaveli, west side
    createGeorgianChurch(this.scene, this.physics, -80, 62)

    // Biltmore Hotel — NE corner
    createBiltmoreHotel(this.scene, this.physics, 85, -55)

    // Georgian Parliament — north, across from square
    createParliament(this.scene, this.physics, -30, -95)

    // ─── City Buildings ───────────────────────────────────────────────────────
    this.buildCityBlock()

    // ─── Street Furniture ─────────────────────────────────────────────────────
    this.addStreetFurniture()

    // ─── Boundary Walls (invisible — keep cars in area) ───────────────────────
    this.addBoundaryWalls()
  }

  private buildCityBlock() {
    // Soviet-era blocks north of Rustaveli
    const sovietBlocks: [number, number, number, number, number, number][] = [
      // x, z, w, d, h, color
      [-160, 55, 30, 18, 18, 0xaaa090],
      [-155, 10, 22, 16, 24, 0x9a9282],
      [-160, -40, 28, 20, 16, 0xa0968a],
      [-160, -85, 32, 22, 20, 0x9c9080],
      [140, 55, 35, 22, 22, 0x9a8878],
      [165, 10, 28, 18, 18, 0xa09488],
      [155, -40, 30, 20, 20, 0x9c9080],
      [160, -90, 35, 25, 16, 0xa0968c],
      [-30, -150, 40, 24, 24, 0x9a9080],
      [40, -150, 36, 22, 18, 0xa09888],
      [120, -140, 30, 20, 22, 0x9a8c80],
      [-100, -130, 28, 18, 20, 0x9c9080],
      [0, -175, 50, 26, 26, 0x9a9080],
      [-70, 120, 35, 22, 16, 0xa09888],
      [70, 120, 32, 20, 18, 0x9c9282],
      [150, 115, 30, 18, 14, 0xa0968a],
    ]
    for (const [x, z, w, d, h, color] of sovietBlocks) {
      addBuilding(this.scene, this.physics, {
        x, z, width: w, depth: d, height: h, color, style: 'soviet',
      })
    }

    // Older Georgian buildings near the square
    const georgianBlocks: [number, number, number, number, number, number][] = [
      [-55, 45, 18, 14, 12, 0xd4a86a],
      [-55, 20, 16, 12, 14, 0xc89860],
      [-52, -5, 14, 12, 10, 0xcc9e68],
      [55, 45, 16, 12, 12, 0xd0a468],
      [58, 20, 18, 14, 14, 0xc89c64],
      [52, -8, 15, 11, 10, 0xcca068],
      [-45, 110, 20, 14, 12, 0xd2a46a],
      [45, 110, 18, 14, 10, 0xcc9e62],
    ]
    for (const [x, z, w, d, h, color] of georgianBlocks) {
      addBuilding(this.scene, this.physics, {
        x, z, width: w, depth: d, height: h, color, style: 'georgian',
      })
    }

    // Neoclassical buildings around the square
    const neoBlocks: [number, number, number, number, number, number][] = [
      [-62, -45, 28, 20, 16, 0xf0ece0],
      [60, -50, 24, 18, 14, 0xeee8d8],
      [-35, 45, 20, 14, 12, 0xf2eed8],
      [35, 42, 22, 15, 14, 0xeeeada],
    ]
    for (const [x, z, w, d, h, color] of neoBlocks) {
      addBuilding(this.scene, this.physics, {
        x, z, width: w, depth: d, height: h, color, style: 'neoclassical',
      })
    }

    // Modern glass buildings
    const modernBlocks: [number, number, number, number, number, number][] = [
      [100, -100, 24, 20, 45, 0x88aabb],
      [-95, -110, 20, 18, 38, 0x7799aa],
      [60, -130, 18, 16, 50, 0x8899bb],
    ]
    for (const [x, z, w, d, h, color] of modernBlocks) {
      addBuilding(this.scene, this.physics, {
        x, z, width: w, depth: d, height: h, color, style: 'modern',
      })
    }
  }

  private addStreetFurniture() {
    // Street lamps — dynamic props (fly away on impact)
    const rustaveliLampX = [-150, -90, -30, 30, 90, 150]
    for (const lx of rustaveliLampX) {
      this.addLampProp(lx, 42, 0)
      this.addLampProp(lx, 78, 0)
    }
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      const r = 46
      this.addLampProp(Math.sin(angle) * r, Math.cos(angle) * r, -angle)
    }

    // Trees along Rustaveli median — every 40m
    for (let x = -140; x <= 140; x += 40) {
      addTree(this.scene, x, 59, 6 + Math.random() * 2, this.physics)
    }

    // Trees around the square plaza
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2
      addTree(this.scene, Math.sin(angle) * 28, Math.cos(angle) * 28, 7 + Math.random(), this.physics)
    }

    // Trees north of parliament
    for (let x = -50; x <= 30; x += 30) {
      addTree(this.scene, x, -120, 8 + Math.random() * 2, this.physics)
    }

    // Traffic lights — dynamic props, fly away on impact
    this.addTrafficLightProp(38, 40, 0)
    this.addTrafficLightProp(-38, 40, Math.PI)
    this.addTrafficLightProp(38, -40, -Math.PI / 2)
    this.addTrafficLightProp(-38, -40, Math.PI / 2)

    // ─── Georgian building signs ─────────────────────────────────────────────
    // Buildings face the road (Rustaveli, z≈60) with their south wall (high z).
    // Sign z = building_center_z + depth/2 + 0.1 (just outside the wall face).
    // rotY=0 means face points +Z toward the player at z=55.

    // TBC Bank on neoclassical block at (35, 42) depth=15 → south face z=49.5
    addTBCSign(this.scene, 35, 8, 49.6, 0)

    // ავერსი pharmacy on Georgian block at (-55, 45) depth=14 → south face z=52
    addAversiSign(this.scene, -55, 6, 52.1, 0)

    // საქართველოს ბანკი on neoclassical at (-35, 45) depth=14 → south face z=52
    addBOGSign(this.scene, -35, 7.5, 52.1, 0)

    // კარფური on Georgian block at (55, 45) depth=12 → south face z=51
    addCarrefourSign(this.scene, 55, 5.5, 51.1, 0)

    // Tbilisi Mall on Soviet block at (140, 55) depth=22 → south face z=66
    addTbilisiMallSign(this.scene, 140, 9, 66.1, 0)

    // Radisson Hotel near Biltmore area (85, -55)
    addRadissonSign(this.scene, 85, 13, -38, 0)

    // EuropeBet on Georgian block at (-52, -5) depth=12 → south face z=1
    addEuropeBetSign(this.scene, -52, 5, 1.2, 0)

    // Adjarabet on Georgian block at (52, -8) depth=11 → south face z=-2.5
    addAdjarabetSign(this.scene, 52, 5, -2.4, 0)

    // Pharmadepo on Soviet block at (-155, 10) depth=16 → south face z=18
    addPharmadepoSign(this.scene, -155, 7, 18.1, 0)

    // ─── Street signs along Rustaveli ────────────────────────────────────────
    addStreetSign(this.scene, -80, 55, Math.PI / 2)   // west side, facing east
    addStreetSign(this.scene,  80, 55, Math.PI / 2)   // east side, facing east
    addStreetSign(this.scene,   0, 52, 0)             // center, facing south

    // Sparse trees around buildings
    const treePositions: [number, number][] = [
      [-145, 30], [-145, -65],
      [148, 35], [145, -65],
      [-20, -165], [80, -145],
    ]
    for (const [x, z] of treePositions) {
      addTree(this.scene, x, z, 5 + Math.random() * 3, this.physics)
    }

    // Fountain in central plaza
    this.addFountain()

    // Benches around the square
    this.addBenches()
  }

  private addLampProp(x: number, z: number, rotation: number) {
    const group = createStreetLamp(this.scene, x, z, rotation)
    const body = this.physics.addDynamicProp(
      new CANNON.Vec3(0.12, 4.25, 0.12),
      new CANNON.Vec3(x, 4.25, z),
      45, rotation
    )
    body.angularDamping = 0.99  // resist spontaneous toppling
    body.sleep()                // won't wake from spawn impact vibration
    this.props.push({ body, mesh: group, yOffset: 4.25 })
  }

  private addTrafficLightProp(x: number, z: number, rotation: number) {
    const group = createTrafficLight(this.scene, x, z, rotation)
    const body = this.physics.addDynamicProp(
      new CANNON.Vec3(0.14, 3.2, 0.14),
      new CANNON.Vec3(x, 3.2, z),
      35, rotation
    )
    body.angularDamping = 0.99
    body.sleep()
    this.props.push({ body, mesh: group, yOffset: 3.2 })
  }

  private addFountain() {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xd0c8b8, roughness: 0.8 })
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x4488cc,
      metalness: 0.3,
      roughness: 0.2,
      transparent: true,
      opacity: 0.75,
    })

    const basin = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.5, 0.65, 32), stoneMat)
    basin.position.set(0, 0.32, 0)
    this.scene.add(basin)

    const water = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 0.08, 32), waterMat)
    water.position.set(0, 0.68, 0)  // sits clearly above basin top (0.645), no z-fighting
    this.scene.add(water)

    const centerPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 2.2, 10), stoneMat)
    centerPillar.position.set(0, 1.1, 0)
    this.scene.add(centerPillar)

    // Physics colliders — cylinder matches the round basin exactly, no invisible corners
    this.physics.addStaticCylinder(8, 8.5, 0.65, new CANNON.Vec3(0, 0.325, 0))
    // Center pillar
    this.physics.addStaticBox(new CANNON.Vec3(0.85, 1.1, 0.85), new CANNON.Vec3(0, 1.1, 0))

    // Water jet effect (thin cylinders)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      const jet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6),
        new THREE.MeshBasicMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.5 })
      )
      jet.position.set(Math.sin(angle) * 4.5, 1.5, Math.cos(angle) * 4.5)
      jet.rotation.x = -0.3
      jet.rotation.z = Math.sin(angle) * 0.3
      this.scene.add(jet)
    }
  }

  private addBenches() {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b6534, roughness: 0.9 })
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6, roughness: 0.4 })

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const r = 35
      const bx = Math.sin(angle) * r
      const bz = Math.cos(angle) * r

      const group = new THREE.Group()
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.55), woodMat)
      seat.position.y = 0.52
      group.add(seat)
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.08), woodMat)
      back.position.set(0, 0.85, -0.22)
      back.rotation.x = -0.2
      group.add(back)
      for (const side of [-0.7, 0.7]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.5), metalMat)
        leg.position.set(side, 0.25, 0)
        group.add(leg)
      }
      group.position.set(bx, 0, bz)
      group.rotation.y = -angle
      this.scene.add(group)

      // Dynamic prop — bench flies away on impact, doesn't damage car
      const body = this.physics.addDynamicProp(
        new CANNON.Vec3(0.9, 0.27, 0.28),
        new CANNON.Vec3(bx, 0.27, bz),
        30
      )
      this.props.push({ body, mesh: group, yOffset: 0 })
    }
  }

  private addBoundaryWalls() {
    // x, z, halfW, halfD, rotY — rotY faces the plane INWARD toward origin
    const wallDefs: [number, number, number, number, number][] = [
      [0,    250, 250, 2,  Math.PI],      // North: face -Z (toward origin)
      [0,   -250, 250, 2,  0],            // South: face +Z (toward origin)
      [ 250,   0, 2, 250, -Math.PI / 2],  // East:  face -X (toward origin)
      [-250,   0, 2, 250,  Math.PI / 2],  // West:  face +X (toward origin)
    ]

    const wallH = 6

    // Shared canvas tile: X pattern + "ჯეტია საქართველო" text
    const tileCanvas = document.createElement('canvas')
    tileCanvas.width = 256; tileCanvas.height = 128
    const tc = tileCanvas.getContext('2d')!
    // Semi-transparent dark red background
    tc.fillStyle = 'rgba(140,10,10,0.35)'
    tc.fillRect(0, 0, 256, 128)
    // Border
    tc.strokeStyle = 'rgba(255,60,60,0.55)'
    tc.lineWidth = 5
    tc.strokeRect(3, 3, 250, 122)
    // X pattern (left half of tile, 128×128)
    tc.strokeStyle = 'rgba(255,55,55,0.72)'
    tc.lineWidth = 9
    tc.beginPath(); tc.moveTo(10, 10); tc.lineTo(118, 118); tc.stroke()
    tc.beginPath(); tc.moveTo(118, 10); tc.lineTo(10, 118); tc.stroke()
    // Georgian text (right half)
    tc.fillStyle = 'rgba(255,130,130,0.88)'
    tc.font = 'bold 22px Arial, sans-serif'
    tc.textBaseline = 'middle'
    tc.textAlign = 'center'
    tc.fillText('ჯეტია', 192, 48)
    tc.fillText('საქართველო', 192, 80)
    const xTex = new THREE.CanvasTexture(tileCanvas)
    xTex.wrapS = THREE.RepeatWrapping
    xTex.wrapT = THREE.RepeatWrapping

    for (const [x, z, hw, hd, rotY] of wallDefs) {
      // Physics collider
      this.physics.addStaticBox(
        new CANNON.Vec3(hw, 10, hd),
        new CANNON.Vec3(x, 10, z)
      )

      // visW is always the long dimension (the wall's span along its face)
      const visW = Math.max(hw, hd) * 2

      const texCopy = xTex.clone()
      texCopy.repeat.set(visW / 20, wallH / 6)

      const mat = new THREE.MeshBasicMaterial({
        map: texCopy,
        transparent: true,
        opacity: 0.7,
        side: THREE.FrontSide,
        depthWrite: false,
      })
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(visW, wallH),
        mat
      )
      plane.position.set(x, wallH / 2, z)
      plane.rotation.y = rotY
      this.scene.add(plane)
    }
  }
}
