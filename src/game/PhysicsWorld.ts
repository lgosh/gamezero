import * as CANNON from 'cannon-es'

export class PhysicsWorld {
  world: CANNON.World
  private contactMaterials: Map<string, CANNON.ContactMaterial> = new Map()

  // Named materials
  groundMaterial!: CANNON.Material
  carMaterial!: CANNON.Material
  buildingMaterial!: CANNON.Material
  propMaterial!: CANNON.Material

  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -15, 0),
    })

    this.world.broadphase = new CANNON.NaiveBroadphase()
    this.world.allowSleep = true
    ;(this.world.solver as unknown as { iterations: number }).iterations = 10

    this.setupMaterials()
  }

  private setupMaterials() {
    this.groundMaterial = new CANNON.Material('ground')
    this.carMaterial = new CANNON.Material('car')
    this.buildingMaterial = new CANNON.Material('building')
    this.propMaterial = new CANNON.Material('prop')

    const carGround = new CANNON.ContactMaterial(this.carMaterial, this.groundMaterial, {
      friction: 0.8,
      restitution: 0.1,
    })
    const carBuilding = new CANNON.ContactMaterial(this.carMaterial, this.buildingMaterial, {
      friction: 0.4,
      restitution: 0.1,
    })
    const carCar = new CANNON.ContactMaterial(this.carMaterial, this.carMaterial, {
      friction: 0.4,
      restitution: 0.2,
    })
    // Props (lamps, benches) barely slow the car — they just fly away
    const carProp = new CANNON.ContactMaterial(this.carMaterial, this.propMaterial, {
      friction: 0.05,
      restitution: 0.05,
    })

    this.world.addContactMaterial(carGround)
    this.world.addContactMaterial(carBuilding)
    this.world.addContactMaterial(carCar)
    this.world.addContactMaterial(carProp)
  }

  /** Add a static box collider (for buildings, walls, etc.) */
  addStaticBox(
    halfExtents: CANNON.Vec3,
    position: CANNON.Vec3,
    material?: CANNON.Material,
    yawAngle = 0
  ): CANNON.Body {
    const body = new CANNON.Body({
      mass: 0,
      material: material ?? this.buildingMaterial,
    })
    body.addShape(new CANNON.Box(halfExtents))
    body.position.copy(position)
    if (yawAngle !== 0) {
      body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yawAngle)
    }
    this.world.addBody(body)
    return body
  }

  /** Add a low-mass dynamic body for destructible props (lamps, benches, traffic lights). */
  addDynamicProp(halfExtents: CANNON.Vec3, position: CANNON.Vec3, mass: number, yawAngle = 0): CANNON.Body {
    const body = new CANNON.Body({ mass, material: this.propMaterial })
    body.addShape(new CANNON.Box(halfExtents))
    body.position.copy(position)
    if (yawAngle !== 0) {
      body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yawAngle)
    }
    body.linearDamping = 0.4
    body.angularDamping = 0.5
    this.world.addBody(body)
    return body
  }

  /** Add a static cylinder collider (axis = Y) */
  addStaticCylinder(radiusTop: number, radiusBottom: number, height: number, position: CANNON.Vec3, material?: CANNON.Material): CANNON.Body {
    const body = new CANNON.Body({ mass: 0, material: material ?? this.buildingMaterial })
    body.addShape(new CANNON.Cylinder(radiusTop, radiusBottom, height, 16))
    body.position.copy(position)
    this.world.addBody(body)
    return body
  }

  /** Add a static ground plane */
  addGround(): CANNON.Body {
    const body = new CANNON.Body({
      mass: 0,
      material: this.groundMaterial,
    })
    body.addShape(new CANNON.Plane())
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2)
    this.world.addBody(body)
    return body
  }

  step(dt: number) {
    this.world.step(1 / 60, dt, 3)
  }
}
