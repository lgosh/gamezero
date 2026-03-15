import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils'
import type { PhysicsWorld } from '../PhysicsWorld'
import { setupLighting, createStreetLamp, type LightingController } from './Lighting'
import { loadOSM, type OSMWay } from './OSMLoader'

// ── Coordinate System ──────────────────────────────────────────────────────
// Center: Freedom Square, Tbilisi — lat 41.6922, lon 44.8031
// +X = East,  +Z = South  (Three.js convention: camera looks toward +Z)
const CENTER_LAT = 41.6922
const CENTER_LON = 44.8031
const DEG_LAT_M  = 111320
const DEG_LON_M  = 111320 * Math.cos(41.6922 * (Math.PI / 180)) // ≈ 83126

function latLonToXZ(lat: number, lon: number): [number, number] {
  return [
    (lon - CENTER_LON) * DEG_LON_M,
    -(lat - CENTER_LAT) * DEG_LAT_M,
  ]
}

// ── Road styling ───────────────────────────────────────────────────────────
const ROAD_WIDTHS: Record<string, number> = {
  motorway: 18, trunk: 16, primary: 14, secondary: 12,
  tertiary: 9, residential: 7, unclassified: 6,
  service: 4, pedestrian: 8, living_street: 6,
  footway: 2.5, path: 1.8, cycleway: 2, steps: 2,
}
const ROAD_COLORS: Record<string, number> = {
  motorway: 0x1e1e2e, trunk: 0x1e1e2e, primary: 0x242430,
  secondary: 0x2a2a38, tertiary: 0x303040, residential: 0x353545,
  unclassified: 0x353545, service: 0x3a3a4a, living_street: 0x3a3a4a,
  pedestrian: 0xc0b090, footway: 0xc8b898, path: 0xbba885, steps: 0xb0a070, cycleway: 0xb8c080,
}

// ── Building colours (Georgian/Soviet palette) ─────────────────────────────
const BLDG_COLORS = [0xc4a882, 0xb89070, 0xd4b898, 0xa8906c, 0xbca07a, 0x9a8a7a]

// ── Geometry bucket helpers ────────────────────────────────────────────────
type GeoBucket = Map<number, THREE.BufferGeometry[]>

function pushGeo(bucket: GeoBucket, color: number, geo: THREE.BufferGeometry) {
  if (!bucket.has(color)) bucket.set(color, [])
  bucket.get(color)!.push(geo)
}

function flushBucket(bucket: GeoBucket, scene: THREE.Scene, castShadow = false) {
  for (const [color, geos] of bucket) {
    const merged = mergeGeometries(geos, false)
    if (!merged) continue
    for (const g of geos) g.dispose()
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.0 })
    const mesh = new THREE.Mesh(merged, mat)
    mesh.castShadow  = castShadow
    mesh.receiveShadow = true
    scene.add(mesh)
  }
  bucket.clear()
}

// ── Internal building definition ───────────────────────────────────────────
interface BuildingDef {
  ring: Array<[number, number]>   // deduplicated ring (last != first)
  height: number
  cx: number   // centroid X
  cz: number   // centroid Z
  dist: number // distance from origin
  name?: string
}

// ── Seeded pseudo-random for deterministic window assignment ───────────────
function seededPseudoRandom(wx: number, wz: number, floor: number): number {
  const h = Math.sin(wx * 127.1 + wz * 311.7 + floor * 74.3) * 43758.5453
  return h - Math.floor(h)
}

// ── Main OSMMap class ──────────────────────────────────────────────────────
export class OSMMap {
  private scene:   THREE.Scene
  private physics: PhysicsWorld
  public  lighting!: LightingController

  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    this.scene   = scene
    this.physics = physics
  }

  // No dynamic props in this map
  syncProps() {}

  async build(): Promise<void> {
    this.lighting = setupLighting(this.scene)

    // Ground — large plane, sandy stone colour
    const groundGeo = new THREE.PlaneGeometry(2400, 2400, 1, 1)
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 1 })
    const groundMesh = new THREE.Mesh(groundGeo, groundMat)
    groundMesh.rotation.x = -Math.PI / 2
    groundMesh.receiveShadow = true
    this.scene.add(groundMesh)
    this.physics.addGround()

    // Load OSM data
    const data = await loadOSM()

    // Build node → [x, z] lookup
    const nodeMap = new Map<number, [number, number]>()
    for (const el of data.elements) {
      if (el.type === 'node' && el.lat != null) {
        nodeMap.set(el.id, latLonToXZ(el.lat, el.lon))
      }
    }

    const ways = data.elements.filter((e): e is OSMWay => e.type === 'way')

    // Geometry buckets — merged at end for perf
    const roadGeos:  GeoBucket = new Map()
    const areaGeos:  GeoBucket = new Map()
    const bldgGeos:  GeoBucket = new Map()

    // ── 1. Parks / water / pedestrian areas ───────────────────────────────
    for (const way of ways) {
      const tags = way.tags ?? {}
      const isClosed = way.nodes.length > 2 && way.nodes[0] === way.nodes[way.nodes.length - 1]
      if (!isClosed) continue

      let color = -1
      if (tags.natural === 'water') color = 0x2d5f8a
      else if (tags.leisure === 'park' || tags.leisure === 'garden' ||
               tags.landuse === 'park' || tags.landuse === 'grass') color = 0x3a6e2e
      else if (tags.landuse === 'recreation_ground') color = 0x4a7a3e
      else if (tags.highway === 'pedestrian' && tags.area === 'yes') color = 0xc8b888
      if (color === -1) continue

      const pts = resolvePolyline(way.nodes, nodeMap)
      if (pts.length < 3) continue
      const geo = buildAreaGeo(pts, 0.05)
      if (geo) pushGeo(areaGeos, color, geo)
    }

    // ── 2. Roads ──────────────────────────────────────────────────────────
    for (const way of ways) {
      const htype = way.tags?.highway
      if (!htype) continue

      const isClosed  = way.nodes.length > 2 && way.nodes[0] === way.nodes[way.nodes.length - 1]
      const isArea    = way.tags?.area === 'yes'
      if (isClosed && isArea) continue  // handled as area above

      // Filter: only render roads within 900m of centre
      const firstNode = nodeMap.get(way.nodes[0])
      if (!firstNode) continue
      const [fx, fz] = firstNode
      if (fx * fx + fz * fz > 900 * 900) continue

      const pts  = resolvePolyline(way.nodes, nodeMap)
      if (pts.length < 2) continue
      const width = ROAD_WIDTHS[htype] ?? 5
      const color = ROAD_COLORS[htype] ?? 0x333333
      const geo   = buildRibbonGeo(pts, width, 0.04)
      if (geo) pushGeo(roadGeos, color, geo)
    }

    // ── 3. Buildings ──────────────────────────────────────────────────────
    // Collect BuildingDef list; detect monument way
    const buildingDefs: BuildingDef[] = []
    let monumentCx = -137
    let monumentCz = -136

    for (const way of ways) {
      if (!way.tags?.building) continue
      const tags = way.tags

      const pts = resolvePolyline(way.nodes, nodeMap)
      if (pts.length < 3) continue

      // Deduplicate closed ring
      const ring: Array<[number, number]> = (
        pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]
      ) ? pts.slice(0, -1) : pts
      if (ring.length < 3) continue

      // Centroid
      let cx = 0, cz = 0
      for (const [x, z] of ring) { cx += x; cz += z }
      cx /= ring.length
      cz /= ring.length

      const dist = Math.sqrt(cx * cx + cz * cz)

      // Detect monument way — capture its centroid and skip rendering the flat 0.5m footprint
      if (tags.historic === 'monument') {
        monumentCx = cx
        monumentCz = cz
        continue
      }

      if (dist > 500) continue

      const height = parseHeight(tags)
      const name = (tags['name:en'] || tags['name']) as string | undefined

      buildingDefs.push({ ring, height, cx, cz, dist, name })
    }

    // Push building geometry into bucket + physics
    for (const def of buildingDefs) {
      const { ring, height, cx, cz, dist } = def
      const color = BLDG_COLORS[Math.abs(Math.round(cx * 7 + cz * 13)) % BLDG_COLORS.length]

      try {
        const geo = buildExtrudedGeo(ring, height)
        if (geo) pushGeo(bldgGeos, color, geo)
      } catch { /* malformed polygon — skip */ }

      // Physics AABB — skip the central 80m plaza; cover 80–400m ring
      if (dist > 80 && dist < 400 && ring.length >= 3) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
        for (const [x, z] of ring) {
          if (x < minX) minX = x; if (x > maxX) maxX = x
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
        }
        const hw = (maxX - minX) / 2
        const hd = (maxZ - minZ) / 2
        if (hw > 0.5 && hd > 0.5) {
          this.physics.addStaticBox(
            new CANNON.Vec3(hw, height / 2, hd),
            new CANNON.Vec3((minX + maxX) / 2, height / 2, (minZ + maxZ) / 2)
          )
        }
      }
    }

    // ── 4. Flush geometry buckets → merged meshes ─────────────────────────
    flushBucket(areaGeos,  this.scene, false)
    flushBucket(roadGeos,  this.scene, false)
    flushBucket(bldgGeos,  this.scene, true)

    // ── 5. Windows (InstancedMesh) ─────────────────────────────────────────
    this.addWindows(buildingDefs)

    // ── 6. Building name signs (Sprites) ──────────────────────────────────
    this.addSigns(buildingDefs)

    // ── 7. Landmarks ──────────────────────────────────────────────────────
    this.addLibertyMonument(monumentCx, monumentCz)
    this.addStreetLamps()

    // ── 8. Boundary walls + road closure barriers ─────────────────────────
    for (const [x, z, hw, hd] of [
      [0,  900, 900, 5], [0, -900, 900, 5],
      [900,  0, 5, 900], [-900, 0, 5, 900],
    ] as const) {
      this.physics.addStaticBox(new CANNON.Vec3(hw, 50, hd), new CANNON.Vec3(x, 50, z))
    }
    this.addRoadBarriers()
  }

  // ── Windows using InstancedMesh ───────────────────────────────────────────
  private addWindows(buildings: BuildingDef[]) {
    const WINDOW_FLOORS = [1.3, 4.5, 7.7, 10.9]
    const WINDOW_SPACING = 2.4
    const WINDOW_OFFSET = 0.08
    const MAX_DIST = 280

    const windowGeo = new THREE.PlaneGeometry(0.65, 0.9)
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0.04, 0.05, 0.06),
      roughness: 0.05,
      metalness: 0.1,
      side: THREE.DoubleSide,
    })

    // Count max instances needed
    const MAX_INSTANCES = 50000
    const mesh = new THREE.InstancedMesh(windowGeo, windowMat, MAX_INSTANCES)
    mesh.castShadow = false
    mesh.receiveShadow = false

    const dummy = new THREE.Object3D()
    const litColor = new THREE.Color(0xffcc44)
    const darkColor = new THREE.Color(0x2a3545)
    let count = 0

    for (const def of buildings) {
      if (def.dist > MAX_DIST) continue
      if (count >= MAX_INSTANCES) break

      const { ring, height } = def
      const maxFloor = Math.min(WINDOW_FLOORS.length, Math.ceil(height / 3.2))

      for (let ei = 0; ei < ring.length; ei++) {
        if (count >= MAX_INSTANCES) break

        const [ax, az] = ring[ei]
        const [bx, bz] = ring[(ei + 1) % ring.length]
        const dx = bx - ax
        const dz = bz - az
        const edgeLen = Math.sqrt(dx * dx + dz * dz)
        if (edgeLen < 1.0) continue

        // Outward normal (left perpendicular for CW in game space)
        const nx = -(dz) / edgeLen
        const nz = (dx) / edgeLen

        const windowCount = Math.floor(edgeLen / WINDOW_SPACING)
        if (windowCount < 1) continue

        // Centre windows along the edge
        const step = edgeLen / windowCount
        const startOffset = step / 2

        for (let wi = 0; wi < windowCount; wi++) {
          if (count >= MAX_INSTANCES) break

          const t = (startOffset + wi * step) / edgeLen
          const wx = ax + dx * t + nx * WINDOW_OFFSET
          const wz = az + dz * t + nz * WINDOW_OFFSET

          for (let fi = 0; fi < maxFloor; fi++) {
            if (count >= MAX_INSTANCES) break

            const wy = WINDOW_FLOORS[fi]
            if (wy >= height - 0.5) continue

            dummy.position.set(wx, wy, wz)
            // Face outward: rotate Y to align with outward normal
            dummy.rotation.set(0, Math.atan2(nx, nz), 0)
            dummy.updateMatrix()
            mesh.setMatrixAt(count, dummy.matrix)

            const rand = seededPseudoRandom(wx, wz, fi)
            const color = rand < 0.35 ? litColor : darkColor
            mesh.setColorAt(count, color)

            count++
          }
        }
      }
    }

    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

    this.scene.add(mesh)
  }

  // ── Building name signs (Sprites) ─────────────────────────────────────────
  private addSigns(buildings: BuildingDef[]) {
    const MAX_DIST = 350

    for (const def of buildings) {
      if (!def.name) continue
      if (def.dist > MAX_DIST) continue
      if (def.name.length >= 40) continue

      const name = def.name

      // Canvas texture
      const canvas = document.createElement('canvas')
      canvas.width  = 512
      canvas.height = 72
      const ctx = canvas.getContext('2d')!

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.72)'
      ctx.fillRect(0, 0, 512, 72)

      // Left blue stripe
      ctx.fillStyle = '#3b82f6'
      ctx.fillRect(0, 0, 4, 72)

      // White bold text
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 24px Arial'
      ctx.textBaseline = 'middle'
      ctx.fillText(name, 14, 36)

      const texture = new THREE.CanvasTexture(canvas)
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
        transparent: true,
      })

      const sprite = new THREE.Sprite(spriteMat)
      const scaleX = name.length * 0.32 + 2
      sprite.scale.set(scaleX, 1.0, 1)
      sprite.position.set(def.cx, def.height + 2, def.cz)
      sprite.renderOrder = 999

      this.scene.add(sprite)
    }
  }

  // ── Liberty Monument (St George Column) ───────────────────────────────────
  private addLibertyMonument(cx: number, cz: number) {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.8 })
    const goldMat  = new THREE.MeshStandardMaterial({ color: 0xd4a020, metalness: 0.6, roughness: 0.4 })

    const add = (mesh: THREE.Mesh) => { mesh.castShadow = true; this.scene.add(mesh) }

    // Stepped platform (3 discs, each slightly smaller and taller)
    const p0 = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 1.0, 32), stoneMat)
    p0.position.set(cx, 0.5, cz); add(p0)
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6.0, 1.0, 32), stoneMat)
    p1.position.set(cx, 1.5, cz); add(p1)
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.5, 1.2, 32), stoneMat)
    p2.position.set(cx, 2.6, cz); add(p2)

    // Column base block (transitions pedestal → column)
    const baseBlock = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.5, 1.5, 16), stoneMat)
    baseBlock.position.set(cx, 3.95, cz); add(baseBlock)

    // Column shaft
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.7, 32, 16), stoneMat)
    col.position.set(cx, 20.7, cz); add(col)

    // Capital (corinthian-ish widening)
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.1, 2, 16), stoneMat)
    cap.position.set(cx, 37.7, cz); add(cap)

    // Orb + statue (stand-in for St George)
    const orb = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 8), stoneMat)
    orb.position.set(cx, 39.7, cz); add(orb)
    const statue = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10), goldMat)
    statue.position.set(cx, 41.4, cz); add(statue)

    // Physics
    this.physics.addStaticBox(new CANNON.Vec3(7.5, 1.5, 7.5), new CANNON.Vec3(cx, 1.5, cz))
    this.physics.addStaticBox(new CANNON.Vec3(1.8, 18, 1.8), new CANNON.Vec3(cx, 20.7, cz))
  }

  // ── Street lamps along Rustaveli Ave ──────────────────────────────────────
  private addStreetLamps() {
    // Rustaveli runs roughly northwest: angle ≈ -135°
    // Place lamps every 40m along both sides
    const rustDir = new THREE.Vector2(-1, -1).normalize()
    const perpDir = new THREE.Vector2(-rustDir.y, rustDir.x) // perpendicular (right side)
    for (let i = 0; i < 14; i++) {
      const t = i * 42
      const cx = rustDir.x * t
      const cz = rustDir.y * t
      const lampYaw = Math.atan2(-rustDir.x, -rustDir.y)
      // Left side
      createStreetLamp(this.scene, cx + perpDir.x * 8, cz + perpDir.y * 8, lampYaw)
      // Right side
      createStreetLamp(this.scene, cx - perpDir.x * 8, cz - perpDir.y * 8, lampYaw + Math.PI)
    }
  }

  // ── Road closure barriers at map boundaries (4 InstancedMesh, one per wall) ─
  private addRoadBarriers() {
    const barrierGeo = new THREE.PlaneGeometry(8, 3)
    const barrierMat = new THREE.MeshStandardMaterial({
      color: 0xdd2222,
      emissive: new THREE.Color(0.4, 0.07, 0.07),
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    })

    const N = 200          // panels per wall
    const W = 900          // wall distance from origin
    const spacing = (W * 2) / N   // 9m between panels

    const dummy = new THREE.Object3D()

    // Helper: build one wall's InstancedMesh
    const makeWall = (
      placeFn: (i: number, d: THREE.Object3D) => void,
      rotY: number
    ) => {
      const im = new THREE.InstancedMesh(barrierGeo, barrierMat, N)
      for (let i = 0; i < N; i++) {
        placeFn(i, dummy)
        dummy.rotation.set(0, rotY, 0)
        dummy.updateMatrix()
        im.setMatrixAt(i, dummy.matrix)
      }
      im.instanceMatrix.needsUpdate = true
      this.scene.add(im)
    }

    // North z=-W  (face south = +Z)
    makeWall((i, d) => d.position.set(-W + i * spacing + spacing / 2, 1.5, -W), 0)
    // South z=+W  (face north = -Z)
    makeWall((i, d) => d.position.set(-W + i * spacing + spacing / 2, 1.5,  W), Math.PI)
    // East  x=+W  (face west  = -X)
    makeWall((i, d) => d.position.set( W, 1.5, -W + i * spacing + spacing / 2), -Math.PI / 2)
    // West  x=-W  (face east  = +X)
    makeWall((i, d) => d.position.set(-W, 1.5, -W + i * spacing + spacing / 2),  Math.PI / 2)
  }
}

// ── Geometry helpers ──────────────────────────────────────────────────────

function resolvePolyline(nodeIds: number[], nodeMap: Map<number, [number, number]>): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  for (const id of nodeIds) {
    const p = nodeMap.get(id)
    if (p) pts.push(p)
  }
  return pts
}

/** Flat filled polygon at height y (for parks, water, pedestrian plazas) */
function buildAreaGeo(pts: Array<[number, number]>, y: number): THREE.BufferGeometry | null {
  try {
    // Deduplicate closed ring (last == first)
    const ring = (pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1])
      ? pts.slice(0, -1) : pts
    const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)))
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, y, 0)
    return geo
  } catch { return null }
}

/** Extruded building footprint */
function buildExtrudedGeo(pts: Array<[number, number]>, height: number): THREE.BufferGeometry | null {
  const ring = (pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1])
    ? pts.slice(0, -1) : pts
  if (ring.length < 3) return null
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  return geo
}

/** Road/path ribbon along a polyline */
function buildRibbonGeo(
  pts: Array<[number, number]>,
  width: number,
  y: number
): THREE.BufferGeometry | null {
  if (pts.length < 2) return null
  const hw = width / 2
  const positions: number[] = []
  const indices: number[]   = []

  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i]
    let nx: number, nz: number

    if (pts.length === 2 || i === 0) {
      ;[nx, nz] = segPerp(pts[0], pts[1])
    } else if (i === pts.length - 1) {
      ;[nx, nz] = segPerp(pts[i - 1], pts[i])
    } else {
      const [nx1, nz1] = segPerp(pts[i - 1], pts[i])
      const [nx2, nz2] = segPerp(pts[i],     pts[i + 1])
      // Average normals (miter join), clamped to avoid extreme spikes
      const mx = (nx1 + nx2) * 0.5
      const mz = (nz1 + nz2) * 0.5
      const ml = Math.sqrt(mx * mx + mz * mz) || 1
      const dot = Math.max(nx1 * mx / ml + nz1 * mz / ml, 0.3)
      const scale = Math.min(1 / dot, 2.5)
      nx = (mx / ml) * scale
      nz = (mz / ml) * scale
    }

    positions.push(x + nx * hw, y, z + nz * hw)   // left edge
    positions.push(x - nx * hw, y, z - nz * hw)   // right edge

    if (i < pts.length - 1) {
      const v = i * 2
      indices.push(v, v + 2, v + 1,  v + 1, v + 2, v + 3)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** Perpendicular unit vector to segment a→b, pointing left */
function segPerp([ax, az]: [number, number], [bx, bz]: [number, number]): [number, number] {
  const dx = bx - ax, dz = bz - az
  const len = Math.sqrt(dx * dx + dz * dz) || 1
  return [-dz / len, dx / len]
}

/** Parse building height from OSM tags */
function parseHeight(tags: Record<string, string>): number {
  if (tags.height) {
    const h = parseFloat(tags.height)
    if (!isNaN(h)) return Math.max(4, h)
  }
  if (tags['building:levels']) {
    const lvl = parseInt(tags['building:levels'], 10)
    if (!isNaN(lvl)) return Math.max(4, lvl * 3.2)
  }
  // Default by building type
  switch (tags.building) {
    case 'apartments':      return 14
    case 'commercial':
    case 'retail':          return 12
    case 'industrial':      return 8
    case 'warehouse':       return 7
    case 'church':
    case 'cathedral':       return 20
    case 'government':      return 14
    default:                return 10
  }
}
