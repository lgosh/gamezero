import * as THREE from 'three'
import { disposeObject3D } from './disposeObject3D'

export interface TrafficRoad {
  pts: Array<[number, number]>
  htype: string
}

interface RouteSample {
  points: THREE.Vector3[]
  cumulative: number[]
  length: number
  htype: string
}

function makeManualRoute(points: Array<[number, number]>, htype: string): RouteSample | null {
  return buildRoute({ pts: points, htype })
}

function reversePoints(points: Array<[number, number]>) {
  return [...points].reverse()
}

interface AICar {
  group: THREE.Group
  route: RouteSample
  distance: number
  speed: number
  direction: 1 | -1
  laneOffset: number
}

const TRAFFIC_TYPES = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service'])

function laneWidthFor(htype: string) {
  if (htype === 'primary') return 2.8
  if (htype === 'secondary') return 2.5
  if (htype === 'tertiary') return 2.3
  return 2.0
}

function buildRoute(road: TrafficRoad): RouteSample | null {
  const points = road.pts.map(([x, z]) => new THREE.Vector3(x, 0, z))
  if (points.length < 2) return null

  const cumulative = [0]
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + points[i - 1].distanceTo(points[i]))
  }
  const length = cumulative[cumulative.length - 1]
  if (length < 90) return null

  return { points, cumulative, length, htype: road.htype }
}

function sampleRoute(route: RouteSample, distance: number, direction: 1 | -1) {
  const wrapped = THREE.MathUtils.euclideanModulo(distance, route.length)
  const targetDistance = direction === 1 ? wrapped : route.length - wrapped

  let seg = 0
  while (seg < route.cumulative.length - 2 && route.cumulative[seg + 1] < targetDistance) seg++

  const segStart = route.points[seg]
  const segEnd = route.points[seg + 1]
  const segLength = Math.max(0.001, route.cumulative[seg + 1] - route.cumulative[seg])
  const localT = (targetDistance - route.cumulative[seg]) / segLength
  const point = segStart.clone().lerp(segEnd, localT)
  const tangent = segEnd.clone().sub(segStart).normalize().multiplyScalar(direction)

  return { point, tangent }
}

function createSimpleTrafficCar(color: number) {
  const group = new THREE.Group()

  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.2 })
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.15, metalness: 0.05 })
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.55, 4.1), bodyMat)
  body.position.y = 0.5
  group.add(body)

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.5, 1.9), glassMat)
  cabin.position.set(0, 0.93, -0.1)
  group.add(cabin)

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.16, 1.25), bodyMat)
  roof.position.set(0, 1.18, -0.05)
  group.add(roof)

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12)
  for (const [x, z] of [[-0.86, 1.28], [0.86, 1.28], [-0.86, -1.24], [0.86, -1.24]] as const) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, 0.34, z)
    group.add(wheel)
  }

  return group
}

export class AITrafficSystem {
  private cars: AICar[] = []

  constructor(private scene: THREE.Scene) {}

  init(roads: TrafficRoad[]) {
    const candidates = roads
      .filter((road) => TRAFFIC_TYPES.has(road.htype))
      .map(buildRoute)
      .filter((route): route is RouteSample => !!route)
      .map((route) => {
        const avgDist = route.points.reduce((sum, p) => sum + Math.hypot(p.x, p.z), 0) / route.points.length
        return { route, score: route.length - avgDist * 0.6 }
      })
      .filter(({ route }) => route.length > 110)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ route }) => route)

    const freedomSquareLoop: Array<[number, number]> = [
      [-154.4, -124.5],
      [-151.5, -119.6],
      [-147.6, -115.6],
      [-142.8, -112.6],
      [-137.5, -110.9],
      [-131.9, -110.4],
      [-126.4, -111.3],
      [-121.2, -113.5],
      [-116.7, -116.9],
      [-113.1, -121.2],
      [-110.7, -126.3],
      [-109.2, -132.7],
      [-110.3, -140.0],
      [-112.6, -145.5],
      [-116.2, -150.3],
      [-120.4, -153.7],
      [-125.4, -156.0],
      [-130.7, -157.2],
      [-136.1, -157.0],
      [-141.4, -155.7],
      [-147.1, -152.4],
      [-151.7, -147.8],
      [-154.8, -142.0],
      [-156.2, -135.6],
      [-156.2, -131.8],
      [-155.6, -128.1],
      [-154.4, -124.5],
    ]

    const freedomSquareSouthArc: Array<[number, number]> = [
      [-110.7, -126.3],
      [-116.2, -150.3],
      [-128.1, -169.3],
      [-150.4, -193.4],
      [-158.3, -204.3],
    ]

    const rustaveliSpine: Array<[number, number]> = [
      [-158.3, -204.3],
      [-166.1, -216.0],
      [-173.4, -229.4],
      [-227.6, -334.1],
      [-231.5, -342.8],
      [-235.5, -353.9],
      [-238.3, -364.6],
      [-243.6, -385.2],
      [-245.8, -393.5],
      [-248.7, -401.7],
      [-252.1, -410.0],
      [-285.1, -473.3],
      [-310.9, -502.7],
      [-342.1, -583.6],
      [-369.3, -637.3],
      [-410.9, -717.9],
      [-423.5, -740.6],
    ]

    const manualRoutes = [
      makeManualRoute(rustaveliSpine, 'primary'),
      makeManualRoute(freedomSquareLoop, 'primary'),
      makeManualRoute(reversePoints(freedomSquareLoop), 'primary'),
      makeManualRoute(freedomSquareSouthArc, 'primary'),
      makeManualRoute(reversePoints(freedomSquareSouthArc), 'primary'),
    ].filter((route): route is RouteSample => !!route)

    const allRoutes = manualRoutes.length > 0 ? manualRoutes : candidates

    const palette = [0xef4444, 0x2563eb, 0xf59e0b, 0x9ca3af, 0x10b981, 0xffffff]
    let carIndex = 0

    for (const route of allRoutes) {
      const laneWidth = laneWidthFor(route.htype)
      const perRoute = route.length > 220 ? 2 : 1
      for (let i = 0; i < perRoute; i++) {
        const direction: 1 | -1 = i % 2 === 0 ? 1 : -1
        const laneOffset = direction === 1 ? laneWidth : -laneWidth
        const group = createSimpleTrafficCar(palette[carIndex % palette.length])
        this.scene.add(group)
        this.cars.push({
          group,
          route,
          distance: (route.length / perRoute) * i + carIndex * 18,
          speed: 10 + (carIndex % 4) * 2.2,
          direction,
          laneOffset,
        })
        carIndex++
      }
    }
  }

  update(dt: number) {
    for (const car of this.cars) {
      car.distance += car.speed * dt
      const { point, tangent } = sampleRoute(car.route, car.distance, car.direction)
      const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize()
      car.group.position.copy(point).addScaledVector(right, car.laneOffset)
      car.group.position.y = 0.18
      car.group.rotation.y = Math.atan2(tangent.x, tangent.z)
    }
  }

  getRaycastTargets() {
    return this.cars.map((car) => car.group)
  }

  destroy() {
    for (const car of this.cars) {
      disposeObject3D(car.group)
      this.scene.remove(car.group)
    }
    this.cars = []
  }
}
