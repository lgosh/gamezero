import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Car } from './Car'
import type { PhysicsWorld } from '../PhysicsWorld'

/** BMW M3-inspired model — procedurally built from Three.js primitives */
export class BMW extends Car {
  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    super(scene, physics)

    this.config = {
      mass: 1550,
      wheelRadius: 0.34,
      wheelFriction: 1.5,
      suspensionStiffness: 35,
      suspensionRestLength: 0.28,
      suspensionDamping: 2.4,
      suspensionCompression: 4.6,
      maxEngineForce: 5500,
      maxBrakeForce: 120,
      maxSteeringAngle: 0.52,
      rollInfluence: 0.01,
      chassisHalfExtents: new CANNON.Vec3(0.9, 0.38, 2.25),
      chassisOffset: new CANNON.Vec3(0, 0.05, 0),
      wheelPositions: [
        new CANNON.Vec3(-0.92, 0.0, 1.38),  // FL
        new CANNON.Vec3(0.92, 0.0, 1.38),   // FR
        new CANNON.Vec3(-0.92, 0.0, -1.38), // RL
        new CANNON.Vec3(0.92, 0.0, -1.38),  // RR
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

    // ─── Materials ───────────────────────────────────────────────────────────
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a3a6a,
      metalness: 0.85,
      roughness: 0.18,
    })
    const bodyAccentMat = new THREE.MeshStandardMaterial({
      color: 0x162e55,
      metalness: 0.85,
      roughness: 0.22,
    })
    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.2,
      roughness: 0.7,
    })
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      metalness: 0.96,
      roughness: 0.04,
    })
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x6688aa,
      metalness: 0.5,
      roughness: 0.05,
      transparent: true,
      opacity: 0.60,
    })
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.6,
    })
    const taillightMat = new THREE.MeshStandardMaterial({
      color: 0xff1100,
      emissive: new THREE.Color(0xff2200),
      emissiveIntensity: 1.0,
    })
    const taillightInnerMat = new THREE.MeshStandardMaterial({
      color: 0x440000,
      emissive: new THREE.Color(0xff0000),
      emissiveIntensity: 0.3,
    })
    const rubbMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })

    // ─── Lower Body ──────────────────────────────────────────────────────────
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.48, 4.62), bodyMat)
    lowerBody.position.set(0, 0.35, 0)
    lowerBody.castShadow = true
    lowerBody.receiveShadow = true
    chassis.add(lowerBody)
    this.registerDamageZone(lowerBody, 'front', 0.4)

    // Side sills
    for (const side of [-1, 1]) {
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 4.30), blackMat)
      sill.position.set(side * 0.95, 0.18, 0)
      chassis.add(sill)
    }

    // ─── Hood ────────────────────────────────────────────────────────────────
    const hoodGroup = new THREE.Group()
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.08, 1.62), bodyMat)
    hood.position.set(0, 0.62, 1.62)
    hood.rotation.x = -0.055
    hood.castShadow = true
    hoodGroup.add(hood)
    // Hood center rib (M3 power dome)
    const rib1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 1.55), bodyAccentMat)
    rib1.position.set(-0.28, 0.668, 1.62)
    rib1.rotation.x = -0.055
    hoodGroup.add(rib1)
    const rib2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 1.55), bodyAccentMat)
    rib2.position.set(0.28, 0.668, 1.62)
    rib2.rotation.x = -0.055
    hoodGroup.add(rib2)
    chassis.add(hoodGroup)
    this.registerDamageZone(hoodGroup, 'front', 0.5)

    // ─── Trunk ───────────────────────────────────────────────────────────────
    const trunkGroup = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.16, 0.90), bodyMat)
    trunk.position.set(0, 0.62, -2.02)
    trunk.rotation.x = 0.06
    trunk.castShadow = true
    trunkGroup.add(trunk)
    // Trunk lip spoiler
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.60, 0.06, 0.12), blackMat)
    spoiler.position.set(0, 0.71, -2.48)
    trunkGroup.add(spoiler)
    chassis.add(trunkGroup)
    this.registerDamageZone(trunkGroup, 'rear', 0.35)

    // ─── Greenhouse / Cabin ───────────────────────────────────────────────────
    const cabinGroup = new THREE.Group()
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.60, 0.50, 2.30), bodyMat)
    cabin.position.set(0, 0.94, -0.28)
    cabin.castShadow = true
    cabinGroup.add(cabin)

    // Windshield
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.55, 0.06), windowMat)
    windshield.position.set(0, 0.96, 0.90)
    windshield.rotation.x = 0.45
    cabinGroup.add(windshield)

    // Rear window
    const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.42, 0.06), windowMat)
    rearWin.position.set(0, 0.88, -1.52)
    rearWin.rotation.x = -0.52
    cabinGroup.add(rearWin)

    // Side windows left
    const sideWinFrontL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.75), windowMat)
    sideWinFrontL.position.set(-0.81, 0.96, 0.48)
    cabinGroup.add(sideWinFrontL)
    const sideWinRearL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.62), windowMat)
    sideWinRearL.position.set(-0.81, 0.93, -0.68)
    cabinGroup.add(sideWinRearL)

    // Side windows right
    const sideWinFrontR = sideWinFrontL.clone()
    sideWinFrontR.position.x = 0.81
    cabinGroup.add(sideWinFrontR)
    const sideWinRearR = sideWinRearL.clone()
    sideWinRearR.position.x = 0.81
    cabinGroup.add(sideWinRearR)

    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.07, 2.10), bodyMat)
    roof.position.set(0, 1.22, -0.28)
    roof.castShadow = true
    cabinGroup.add(roof)

    // A-pillars
    for (const side of [-1, 1]) {
      const apillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.48, 0.12), bodyMat)
      apillar.position.set(side * 0.80, 0.96, 0.88)
      apillar.rotation.x = 0.45
      cabinGroup.add(apillar)
    }
    // C-pillars
    for (const side of [-1, 1]) {
      const cpillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.45, 0.14), bodyMat)
      cpillar.position.set(side * 0.79, 0.90, -1.48)
      cpillar.rotation.x = -0.52
      cabinGroup.add(cpillar)
    }

    chassis.add(cabinGroup)

    // Side mirrors
    for (const side of [-1, 1]) {
      const mirrorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.22), bodyMat)
      mirrorHousing.position.set(side * 0.98, 0.82, 1.22)
      chassis.add(mirrorHousing)
      const mirrorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.09, 0.17), windowMat)
      mirrorGlass.position.set(side * 1.035, 0.82, 1.22)
      chassis.add(mirrorGlass)
    }

    // ─── Front Bumper & Grille ────────────────────────────────────────────────
    const frontBumperGroup = new THREE.Group()

    const frontBumperMain = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.40, 0.22), blackMat)
    frontBumperMain.position.set(0, 0.22, 2.40)
    frontBumperGroup.add(frontBumperMain)

    // Upper chrome bumper strip
    const bumperStrip = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.042, 0.24), chromeMat)
    bumperStrip.position.set(0, 0.42, 2.40)
    frontBumperGroup.add(bumperStrip)

    // BMW Kidney Grille — iconic twin kidney
    const grilleFrameL = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.12), chromeMat)
    grilleFrameL.position.set(-0.24, 0.54, 2.42)
    frontBumperGroup.add(grilleFrameL)
    const grilleFrameR = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.12), chromeMat)
    grilleFrameR.position.set(0.24, 0.54, 2.42)
    frontBumperGroup.add(grilleFrameR)
    // Grille mesh (dark)
    const grilleMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.29, 0.10), blackMat)
    grilleMeshL.position.set(-0.24, 0.54, 2.44)
    frontBumperGroup.add(grilleMeshL)
    const grilleMeshR = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.29, 0.10), blackMat)
    grilleMeshR.position.set(0.24, 0.54, 2.44)
    frontBumperGroup.add(grilleMeshR)
    // Chrome slats in grille
    for (let row = 0; row < 4; row++) {
      const slatL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.028, 0.13), chromeMat)
      slatL.position.set(-0.24, 0.415 + row * 0.072, 2.445)
      frontBumperGroup.add(slatL)
      const slatR = slatL.clone()
      slatR.position.x = 0.24
      frontBumperGroup.add(slatR)
    }
    // Lower intake
    const lowerIntake = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.14, 0.16), blackMat)
    lowerIntake.position.set(0, 0.08, 2.41)
    frontBumperGroup.add(lowerIntake)
    // Fog light housings
    for (const side of [-1, 1]) {
      const fogHouse = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.10, 0.14), blackMat)
      fogHouse.position.set(side * 0.66, 0.11, 2.39)
      frontBumperGroup.add(fogHouse)
      const fogLight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.10), headlightMat)
      fogLight.position.set(side * 0.66, 0.11, 2.44)
      frontBumperGroup.add(fogLight)
    }

    chassis.add(frontBumperGroup)
    this.registerDamageZone(frontBumperGroup, 'front', 0.7)

    // ─── Headlights (Angular BMW Style) ──────────────────────────────────────
    for (const side of [-1, 1]) {
      const hlGroup = new THREE.Group()
      // Main housing
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.14), blackMat)
      housing.position.set(side * 0.64, 0.65, 2.40)
      chassis.add(housing)
      // DRL strip (white, emissive)
      const drl = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.04, 0.12), headlightMat)
      drl.position.set(side * 0.64, 0.75, 2.43)
      chassis.add(drl)
      // Main lens
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 0.10), headlightMat)
      lens.position.set(side * 0.64, 0.63, 2.44)
      chassis.add(lens)
      // Indicator (orange)
      const indicator = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.08, 0.10),
        new THREE.MeshStandardMaterial({
          color: 0xff8800,
          emissive: new THREE.Color(0xff6600),
          emissiveIntensity: 0.5,
        })
      )
      indicator.position.set(side * (0.64 + side * 0.18), 0.62, 2.43)
      chassis.add(indicator)
    }

    // ─── Rear Bumper & Taillights ─────────────────────────────────────────────
    const rearBumperGroup = new THREE.Group()
    const rearBump = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.36, 0.20), blackMat)
    rearBump.position.set(0, 0.20, -2.40)
    rearBumperGroup.add(rearBump)
    const rearChromeStrip = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.04, 0.22), chromeMat)
    rearChromeStrip.position.set(0, 0.39, -2.40)
    rearBumperGroup.add(rearChromeStrip)

    // Diffuser
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.12, 0.22), blackMat)
    diffuser.position.set(0, 0.10, -2.41)
    rearBumperGroup.add(diffuser)

    chassis.add(rearBumperGroup)
    this.registerDamageZone(rearBumperGroup, 'rear', 0.6)

    // Taillights — BMW L-shape style
    for (const side of [-1, 1]) {
      // Outer horizontal bar
      const tlOuter = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.12, 0.10), taillightMat)
      tlOuter.position.set(side * 0.65, 0.60, -2.42)
      chassis.add(tlOuter)
      // Inner vertical strip
      const tlInner = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.10), taillightInnerMat)
      tlInner.position.set(side * 0.40, 0.54, -2.42)
      chassis.add(tlInner)
      // Reverse light
      const revLight = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.08, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.2 })
      )
      revLight.position.set(side * 0.65, 0.47, -2.41)
      chassis.add(revLight)
    }

    // Exhaust tips (twin, M3-style)
    for (const side of [-1, 1]) {
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.042, 0.12, 10), chromeMat)
      exhaust.rotation.x = Math.PI / 2
      exhaust.position.set(side * 0.48, 0.17, -2.42)
      chassis.add(exhaust)
      // Inner dark
      const exhaustIn = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.13, 10), blackMat)
      exhaustIn.rotation.x = Math.PI / 2
      exhaustIn.position.set(side * 0.48, 0.17, -2.42)
      chassis.add(exhaustIn)
    }

    // Undercarriage
    const under = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 4.42), blackMat)
    under.position.set(0, 0.09, 0)
    chassis.add(under)

    // Door handles (subtle)
    for (const side of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.20), chromeMat)
      handle.position.set(side * 0.925, 0.55, 0.10)
      chassis.add(handle)
      const handle2 = handle.clone()
      handle2.position.z = -0.75
      chassis.add(handle2)
    }

    // Roundel badges (BMW blue/white on grille and trunk)
    const badgeGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.03, 16)
    const badgeMat = new THREE.MeshStandardMaterial({
      color: 0x1a3a9a,
      emissive: new THREE.Color(0x0a1a4a),
      emissiveIntensity: 0.3,
    })
    const frontBadge = new THREE.Mesh(badgeGeo, badgeMat)
    frontBadge.rotation.x = Math.PI / 2
    frontBadge.position.set(0, 0.54, 2.49)
    chassis.add(frontBadge)
    const rearBadge = frontBadge.clone()
    rearBadge.position.set(0, 0.65, -2.43)
    rearBadge.rotation.x = -Math.PI / 2
    chassis.add(rearBadge)

    // Position chassis mesh (visual offset from physics body)
    chassis.position.set(0, -0.38, 0)
  }

  private buildWheels() {
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.92 })
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.92, roughness: 0.08 })
    const spokeMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.92, roughness: 0.06 })
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1a3a6a }) // BMW blue center cap

    for (let i = 0; i < 4; i++) {
      const wheel = new THREE.Group()

      // Tire
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 28), tireMat)
      tire.rotation.z = Math.PI / 2
      tire.castShadow = true
      wheel.add(tire)

      // Rim dish
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.248, 0.248, 0.245, 28), rimMat)
      rim.rotation.z = Math.PI / 2
      wheel.add(rim)

      // 5-spoke M-style spokes
      for (let s = 0; s < 5; s++) {
        const angle = (s / 5) * Math.PI * 2
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.19, 0.245), spokeMat)
        spoke.rotation.x = angle
        spoke.position.x = 0
        spoke.position.y = Math.sin(angle) * 0.085
        spoke.position.z = Math.cos(angle) * 0.085
        const spokeParent = new THREE.Group()
        spokeParent.rotation.z = Math.PI / 2
        spokeParent.add(spoke)
        wheel.add(spokeParent)
      }

      // Center cap
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.25, 14), capMat)
      cap.rotation.z = Math.PI / 2
      wheel.add(cap)

      // Brake disc (inner dark ring visible through spokes)
      const disc = new THREE.Mesh(
        new THREE.TorusGeometry(0.145, 0.025, 8, 28),
        new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.4 })
      )
      disc.rotation.y = Math.PI / 2
      wheel.add(disc)

      wheel.castShadow = true
      this.scene.add(wheel)
      this.wheelMeshes.push(wheel)
    }
  }
}
