import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import type { PhysicsWorld } from '../PhysicsWorld'
import { setupLighting, createStreetLamp, type LightingController } from './Lighting'
import { createGround, createRoad, createSidewalk, createRoundabout } from './Roads'
import { addBuilding, addTree } from './Buildings'
import {
  createLibertyMonument,
  createGeorgianChurch,
  createCityHall,
  createGalleriaTbilisi,
  createCourtyardMarriott,
  createParliament,
  createTrafficLight,
} from './Landmarks'
import {
  addStreetSign,
} from './Signs'

/**
 * Tbilisi Freedom Square - AUTHENTIC GTA SA STYLE
 */
interface Prop {
  body: CANNON.Body
  mesh: THREE.Object3D
  yOffset: number
}

export class TbilisiMap {
  private scene: THREE.Scene
  private physics: PhysicsWorld
  private props: Prop[] = []
  public lighting!: LightingController

  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    this.scene = scene
    this.physics = physics
  }

  syncProps() {
    for (const { body, mesh, yOffset } of this.props) {
      mesh.position.set(body.position.x, body.position.y - yOffset, body.position.z)
      mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
    }
  }

  build() {
    this.lighting = setupLighting(this.scene)
    createGround(this.scene)
    this.physics.addGround()

    // 1. Central Oval
    createRoundabout(this.scene, 0, 0, 26, 45)
    createLibertyMonument(this.scene, this.physics)

    // 2. The 6 Main Radiating Streets
    // GTA Style: Roads are wider and longer for better driving
    
    // Dadiani (South - 0°)
    createRoad(this.scene, 0, 150, 26, 400, 0)
    createSidewalk(this.scene, 15, 150, 6, 400, 0, 'cobble')
    addStreetSign(this.scene, 0, 55, 0)

    // Tabidze (SSW - ~160°)
    createRoad(this.scene, -40, 150, 22, 350, -Math.PI * 0.1)
    addStreetSign(this.scene, -20, 50, -Math.PI * 0.1)

    // Leonidze (Southwest - 225°)
    createRoad(this.scene, -140, 140, 28, 600, -Math.PI * 0.25)
    addStreetSign(this.scene, -45, 45, -Math.PI * 0.25)

    // Rustaveli (Northwest - 315°)
    createRoad(this.scene, -140, -140, 40, 600, -Math.PI * 0.75)
    createSidewalk(this.scene, -155, -155, 10, 600, -Math.PI * 0.75, 'modern')
    addStreetSign(this.scene, -45, -45, -Math.PI * 0.75) 
    
    // Pushkin (Northeast - 45°)
    createRoad(this.scene, 140, -140, 32, 600, Math.PI * 0.75)
    createSidewalk(this.scene, 155, -155, 8, 600, Math.PI * 0.75, 'modern')
    addStreetSign(this.scene, 45, -45, Math.PI * 0.75)
    
    // Kote Apkhazi (Southeast - 135°)
    createRoad(this.scene, 140, 140, 28, 600, Math.PI * 0.25)
    createSidewalk(this.scene, 155, 155, 8, 600, Math.PI * 0.25, 'cobble')
    addStreetSign(this.scene, 45, 45, Math.PI * 0.25)

    // 3. Iconic Landmarks
    // City Hall (South side) - Pushed back from road
    createCityHall(this.scene, this.physics, 10, 65)
    
    // Courtyard Marriott (West side) - Set back
    createCourtyardMarriott(this.scene, this.physics, -75, 0, Math.PI / 2)
    
    // Galleria Tbilisi (North side, entrance to Rustaveli)
    createGalleriaTbilisi(this.scene, this.physics, -65, -65, -Math.PI * 0.75)
    
    // Parliament (Further down Rustaveli)
    createParliament(this.scene, this.physics, -250, -250, -Math.PI * 0.75)
    
    // Kashueti Church (Opposite Parliament)
    createGeorgianChurch(this.scene, this.physics, -300, -220)

    // 4. City Blocks (Fixed positions to avoid road overlap)
    this.buildCityBlocks()

    // 5. Environment & Furniture
    this.addStreetFurniture()
    
    // 6. Boundary Walls (Invisible, kept far away)
    this.addBoundaryWalls()
  }

  private buildCityBlocks() {
    // 1. Rustaveli Corridor (Right side when heading NW)
    for (let i = 0; i < 6; i++) {
      const dist = 120 + i * 70
      const angle = -Math.PI * 0.8 // Slightly more West than Rustaveli
      addBuilding(this.scene, this.physics, {
        x: Math.sin(angle) * dist, z: Math.cos(angle) * dist,
        width: 40, depth: 30, height: 25, color: 0xaaa090, style: 'soviet'
      })
    }

    // 2. Kote Apkhazi Corridor (Old Town Style)
    for (let i = 0; i < 8; i++) {
      const dist = 100 + i * 45
      const angle = Math.PI * 0.35 // Slightly more East than Kote Apkhazi
      addBuilding(this.scene, this.physics, {
        x: Math.sin(angle) * dist, z: Math.cos(angle) * dist,
        width: 18, depth: 18, height: 12, color: 0xcca068, style: 'georgian'
      })
    }

    // 3. Sololaki Cluster (South - Between Leonidze and Dadiani)
    const sololakiColors = [0xd4a86a, 0xc89860, 0xcc9e68]
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI * 0.15 - (i * 0.05)
      const dist = 130 + (i % 3) * 30
      addBuilding(this.scene, this.physics, {
        x: Math.sin(angle) * dist, z: Math.cos(angle) * dist,
        width: 22, depth: 22, height: 14,
        color: sololakiColors[i % 3], style: 'georgian'
      })
    }

    // 4. Pushkin Park Corridor (NE - Left of Pushkin St)
    for (let i = 0; i < 5; i++) {
      const dist = 150 + i * 65
      const angle = Math.PI * 0.65
      addBuilding(this.scene, this.physics, {
        x: Math.sin(angle) * dist, z: Math.cos(angle) * dist,
        width: 30, depth: 30, height: 20, color: 0x9a9080, style: 'soviet'
      })
    }
  }

  private addStreetFurniture() {
    // Lamps around the oval
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2
      const r = 50
      this.addLampProp(Math.sin(angle) * r, Math.cos(angle) * r, -angle)
    }
    
    // Pushkin Park Greenery
    for (let i = 0; i < 25; i++) {
      const rx = 60 + Math.random() * 60
      const rz = -60 - Math.random() * 60
      addTree(this.scene, rx, rz, 7 + Math.random() * 4, this.physics)
      if (i % 4 === 0) this.addBench(rx + 2, rz + 2, Math.random() * Math.PI)
    }

    // Fountain
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.5, 0.8, 32), new THREE.MeshStandardMaterial({ color: 0xd0c8b8 }))
    basin.position.set(0, 0.4, 0)
    this.scene.add(basin)
    this.physics.addStaticCylinder(9, 9.5, 0.8, new CANNON.Vec3(0, 0.4, 0))
  }

  private addLampProp(x: number, z: number, rotation: number) {
    const group = createStreetLamp(this.scene, x, z, rotation)
    const body = this.physics.addDynamicProp(new CANNON.Vec3(0.12, 4.25, 0.12), new CANNON.Vec3(x, 4.25, z), 45, rotation)
    body.angularDamping = 0.99
    body.sleep()
    this.props.push({ body, mesh: group, yOffset: 4.25 })
  }

  private addBench(x: number, z: number, rotation: number) {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b6534 })
    const group = new THREE.Group()
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.7), woodMat)
    seat.position.y = 0.5
    group.add(seat)
    group.position.set(x, 0, z)
    group.rotation.y = rotation
    this.scene.add(group)
    const body = this.physics.addDynamicProp(new CANNON.Vec3(1.1, 0.25, 0.35), new CANNON.Vec3(x, 0.25, z), 25, rotation)
    this.props.push({ body, mesh: group, yOffset: 0 })
  }

  private addBoundaryWalls() {
    // Keep them very far to avoid "invisible wall" feel
    const wallDefs: [number, number, number, number, number][] = [
      [0, 600, 600, 5, Math.PI],
      [0, -600, 600, 5, 0],
      [600, 0, 5, 600, -Math.PI / 2],
      [-600, 0, 5, 600, Math.PI / 2],
    ]
    for (const [x, z, hw, hd, rotY] of wallDefs) {
      this.physics.addStaticBox(new CANNON.Vec3(hw, 50, hd), new CANNON.Vec3(x, 50, z))
    }
  }
}
