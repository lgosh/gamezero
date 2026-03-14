import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Car } from './Car'
import type { PhysicsWorld } from '../PhysicsWorld'

/** Mercedes-Benz C63 AMG-inspired model */
export class Mercedes extends Car {
  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    super(scene, physics)

    this.config = {
      mass: 1680,
      wheelRadius: 0.345,
      wheelFriction: 1.45,
      suspensionStiffness: 32,
      suspensionRestLength: 0.30,
      suspensionDamping: 2.2,
      suspensionCompression: 4.3,
      maxEngineForce: 6000,
      maxBrakeForce: 130,
      maxSteeringAngle: 0.50,
      rollInfluence: 0.012,
      chassisHalfExtents: new CANNON.Vec3(0.93, 0.40, 2.35),
      chassisOffset: new CANNON.Vec3(0, 0.04, 0),
      wheelPositions: [
        new CANNON.Vec3(-0.95, 0.0, 1.42),
        new CANNON.Vec3(0.95, 0.0, 1.42),
        new CANNON.Vec3(-0.95, 0.0, -1.42),
        new CANNON.Vec3(0.95, 0.0, -1.42),
      ],
    }
  }

  spawn(startPos: THREE.Vector3) {
    this.buildModel()
    this.buildPhysics(startPos)
    this.buildWheels()
  }

  private buildModel() {
    const chassis = this.chassisMesh

    // ─── Materials ────────────────────────────────────────────────────────────
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xc0c0c0,
      metalness: 0.88,
      roughness: 0.14,
    })
    const bodyDarkMat = new THREE.MeshStandardMaterial({
      color: 0xa8a8a8,
      metalness: 0.86,
      roughness: 0.20,
    })
    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.25,
      roughness: 0.68,
    })
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xe8e8e8,
      metalness: 0.97,
      roughness: 0.03,
    })
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x5577aa,
      metalness: 0.45,
      roughness: 0.06,
      transparent: true,
      opacity: 0.58,
    })
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.55,
    })
    const taillightMat = new THREE.MeshStandardMaterial({
      color: 0xff0800,
      emissive: new THREE.Color(0xff1100),
      emissiveIntensity: 1.1,
    })

    // ─── Lower Body ───────────────────────────────────────────────────────────
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.50, 4.72), bodyMat)
    lowerBody.position.set(0, 0.36, 0)
    lowerBody.castShadow = true
    lowerBody.receiveShadow = true
    chassis.add(lowerBody)
    this.registerDamageZone(lowerBody, 'front', 0.4)

    // Side sills (AMG trim)
    for (const side of [-1, 1]) {
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.16, 4.40), blackMat)
      sill.position.set(side * 0.99, 0.18, 0)
      chassis.add(sill)
    }

    // ─── Hood ─────────────────────────────────────────────────────────────────
    const hoodGroup = new THREE.Group()
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.09, 1.72), bodyMat)
    hood.position.set(0, 0.64, 1.68)
    hood.rotation.x = -0.04
    hood.castShadow = true
    hoodGroup.add(hood)
    // Mercedes has a more rounded hood with center power bulge
    const hoodBulge = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.04, 1.60), bodyDarkMat)
    hoodBulge.position.set(0, 0.695, 1.68)
    hoodBulge.rotation.x = -0.04
    hoodGroup.add(hoodBulge)
    chassis.add(hoodGroup)
    this.registerDamageZone(hoodGroup, 'front', 0.5)

    // ─── Trunk / Boot ─────────────────────────────────────────────────────────
    const trunkGroup = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.18, 0.92), bodyMat)
    trunk.position.set(0, 0.64, -2.10)
    trunk.rotation.x = 0.05
    trunk.castShadow = true
    trunkGroup.add(trunk)
    // AMG deck lid
    const deckLid = new THREE.Mesh(new THREE.BoxGeometry(1.60, 0.05, 0.14), blackMat)
    deckLid.position.set(0, 0.74, -2.56)
    trunkGroup.add(deckLid)
    chassis.add(trunkGroup)
    this.registerDamageZone(trunkGroup, 'rear', 0.38)

    // ─── Greenhouse ────────────────────────────────────────────────────────────
    const cabinGroup = new THREE.Group()
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.52, 2.40), bodyMat)
    cabin.position.set(0, 0.96, -0.30)
    cabin.castShadow = true
    cabinGroup.add(cabin)

    // Windshield
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.58, 0.06), windowMat)
    windshield.position.set(0, 0.97, 0.96)
    windshield.rotation.x = 0.42
    cabinGroup.add(windshield)

    // Rear window
    const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.44, 0.06), windowMat)
    rearWin.position.set(0, 0.90, -1.60)
    rearWin.rotation.x = -0.48
    cabinGroup.add(rearWin)

    // Side windows
    for (const side of [-1, 1]) {
      const winF = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.38, 0.78), windowMat)
      winF.position.set(side * 0.83, 0.97, 0.50)
      cabinGroup.add(winF)
      const winR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.65), windowMat)
      winR.position.set(side * 0.83, 0.94, -0.72)
      cabinGroup.add(winR)
    }

    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.07, 2.20), bodyMat)
    roof.position.set(0, 1.24, -0.30)
    roof.castShadow = true
    cabinGroup.add(roof)

    // A & C pillars
    for (const side of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.50, 0.12), bodyMat)
      a.position.set(side * 0.82, 0.97, 0.94)
      a.rotation.x = 0.42
      cabinGroup.add(a)
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.46, 0.14), bodyMat)
      c.position.set(side * 0.81, 0.91, -1.58)
      c.rotation.x = -0.48
      cabinGroup.add(c)
    }

    chassis.add(cabinGroup)

    // Side mirrors
    for (const side of [-1, 1]) {
      const mh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.24), bodyMat)
      mh.position.set(side * 1.01, 0.84, 1.26)
      chassis.add(mh)
      const mg = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.10, 0.18), windowMat)
      mg.position.set(side * 1.055, 0.84, 1.26)
      chassis.add(mg)
    }

    // ─── Front Fascia / Bumper ────────────────────────────────────────────────
    const frontGroup = new THREE.Group()

    // Main bumper
    const frontBump = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.38, 0.24), blackMat)
    frontBump.position.set(0, 0.22, 2.48)
    frontGroup.add(frontBump)

    // Chrome accent strip
    const fStrip = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.044, 0.26), chromeMat)
    fStrip.position.set(0, 0.42, 2.48)
    frontGroup.add(fStrip)

    // Central large grille (Mercedes Panamericana AMG style)
    const grilleMain = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.38, 0.14), blackMat)
    grilleMain.position.set(0, 0.54, 2.50)
    frontGroup.add(grilleMain)
    // Vertical grille bars (AMG Panamericana)
    for (let b = -3; b <= 3; b++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.16), chromeMat)
      bar.position.set(b * 0.14, 0.54, 2.52)
      frontGroup.add(bar)
    }
    // Chrome grille surround
    const grilleSurround = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.42, 0.10), chromeMat)
    grilleSurround.position.set(0, 0.54, 2.46)
    frontGroup.add(grilleSurround)

    // Lower intake center
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.12, 0.18), blackMat)
    intake.position.set(0, 0.08, 2.48)
    frontGroup.add(intake)

    // Fog/corner lights
    for (const side of [-1, 1]) {
      const fog = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.09, 0.12), headlightMat)
      fog.position.set(side * 0.72, 0.10, 2.47)
      frontGroup.add(fog)
    }

    chassis.add(frontGroup)
    this.registerDamageZone(frontGroup, 'front', 0.7)

    // ─── Headlights (Sleek Mercedes style) ───────────────────────────────────
    for (const side of [-1, 1]) {
      // Outer housing
      const hlHousing = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.20, 0.14), blackMat)
      hlHousing.position.set(side * 0.66, 0.67, 2.48)
      chassis.add(hlHousing)
      // DRL strip
      const drl = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.038, 0.12), headlightMat)
      drl.position.set(side * 0.66, 0.77, 2.51)
      chassis.add(drl)
      // Main lens
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.14, 0.10), headlightMat)
      lens.position.set(side * 0.66, 0.65, 2.52)
      chassis.add(lens)
    }

    // ─── Rear Bumper & Taillights ─────────────────────────────────────────────
    const rearGroup = new THREE.Group()
    const rearBump = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.38, 0.22), blackMat)
    rearBump.position.set(0, 0.20, -2.50)
    rearGroup.add(rearBump)
    const rearStrip = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.044, 0.24), chromeMat)
    rearStrip.position.set(0, 0.40, -2.50)
    rearGroup.add(rearStrip)
    // Full-width taillight bar (Mercedes style)
    const tlBar = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.06, 0.10), taillightMat)
    tlBar.position.set(0, 0.62, -2.51)
    rearGroup.add(tlBar)
    // Three-pointed star emblem on trunk
    const star = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.025, 16),
      chromeMat
    )
    star.rotation.x = Math.PI / 2
    star.position.set(0, 0.66, -2.52)
    rearGroup.add(star)

    chassis.add(rearGroup)
    this.registerDamageZone(rearGroup, 'rear', 0.6)

    // Taillights
    for (const side of [-1, 1]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.24, 0.10), taillightMat)
      tl.position.set(side * 0.66, 0.58, -2.52)
      chassis.add(tl)
      // Inner detail
      const tlD = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.22, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x550000, emissive: new THREE.Color(0xcc0000), emissiveIntensity: 0.5 })
      )
      tlD.position.set(side * 0.40, 0.55, -2.51)
      chassis.add(tlD)
    }

    // Exhaust — quad pipes (AMG)
    for (const side of [-1, 1]) {
      for (const row of [-0.05, 0.05]) {
        const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.036, 0.14, 10), chromeMat)
        ex.rotation.x = Math.PI / 2
        ex.position.set(side * 0.52 + row, 0.16, -2.44)
        chassis.add(ex)
        const exIn = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.15, 10), blackMat)
        exIn.rotation.x = Math.PI / 2
        exIn.position.set(side * 0.52 + row, 0.16, -2.44)
        chassis.add(exIn)
      }
    }

    // Door handles
    for (const side of [-1, 1]) {
      const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), chromeMat)
      h1.position.set(side * 0.965, 0.57, 0.18)
      chassis.add(h1)
      const h2 = h1.clone()
      h2.position.z = -0.80
      chassis.add(h2)
    }

    // Three-pointed star hood ornament
    const hoodStar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.06, 14),
      chromeMat
    )
    hoodStar.rotation.x = Math.PI / 2
    hoodStar.position.set(0, 0.70, 2.54)
    chassis.add(hoodStar)

    // Undercarriage
    const under = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.08, 4.62), blackMat)
    under.position.set(0, 0.09, 0)
    chassis.add(under)

    chassis.position.set(0, -0.38, 0)
  }

  private buildWheels() {
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.92 })
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.94, roughness: 0.06 })
    const spokeMat = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, metalness: 0.92, roughness: 0.05 })

    for (let i = 0; i < 4; i++) {
      const wheel = new THREE.Group()

      // Tire
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.26, 28), tireMat)
      tire.rotation.z = Math.PI / 2
      tire.castShadow = true
      wheel.add(tire)

      // Rim
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.262, 28), rimMat)
      rim.rotation.z = Math.PI / 2
      wheel.add(rim)

      // 10-spoke AMG style (5 twin spokes)
      for (let s = 0; s < 5; s++) {
        const angle = (s / 5) * Math.PI * 2
        for (const off of [-0.025, 0.025]) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.185, 0.256), spokeMat)
          spoke.rotation.x = angle
          spoke.position.y = Math.sin(angle) * (0.082 + off * 0.1)
          spoke.position.z = Math.cos(angle) * (0.082 + off * 0.1)
          spoke.position.x = off
          const p = new THREE.Group()
          p.rotation.z = Math.PI / 2
          p.add(spoke)
          wheel.add(p)
        }
      }

      // Center cap with star
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 0.264, 14),
        new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.95, roughness: 0.04 })
      )
      cap.rotation.z = Math.PI / 2
      wheel.add(cap)

      // Brake disc
      const disc = new THREE.Mesh(
        new THREE.TorusGeometry(0.148, 0.026, 8, 28),
        new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.7, roughness: 0.4 })
      )
      disc.rotation.y = Math.PI / 2
      wheel.add(disc)

      wheel.castShadow = true
      this.scene.add(wheel)
      this.wheelMeshes.push(wheel)
    }
  }
}
