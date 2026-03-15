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
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
    const mesh = new THREE.Mesh(merged, mat)
    mesh.castShadow  = castShadow
    mesh.receiveShadow = true
    scene.add(mesh)
  }
  bucket.clear()
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
    for (const way of ways) {
      if (!way.tags?.building) continue
      const pts = resolvePolyline(way.nodes, nodeMap)
      if (pts.length < 3) continue

      // Centroid for distance check
      let cx = 0, cz = 0
      for (const [x, z] of pts) { cx += x; cz += z }
      cx /= pts.length; cz /= pts.length

      const dist2 = cx * cx + cz * cz
      if (dist2 > 500 * 500) continue

      const tags   = way.tags
      const height = parseHeight(tags)
      const color  = BLDG_COLORS[Math.abs(Math.round(cx * 7 + cz * 13)) % BLDG_COLORS.length]

      try {
        const geo = buildExtrudedGeo(pts, height)
        if (geo) pushGeo(bldgGeos, color, geo)
      } catch { /* malformed polygon — skip */ }

      // Physics AABB — skip the central 80m plaza (roads start at ~90m)
      // so the spawn area stays open; cover 80–400m ring
      if (dist2 > 80 * 80 && dist2 < 400 * 400 && pts.length >= 3) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
        for (const [x, z] of pts) {
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

    // ── 5. Landmarks ──────────────────────────────────────────────────────
    this.addLibertyMonument()
    this.addStreetLamps()

    // ── 6. Boundary walls ─────────────────────────────────────────────────
    for (const [x, z, hw, hd] of [
      [0,  900, 900, 5], [0, -900, 900, 5],
      [900,  0, 5, 900], [-900, 0, 5, 900],
    ] as const) {
      this.physics.addStaticBox(new CANNON.Vec3(hw, 50, hd), new CANNON.Vec3(x, 50, z))
    }
  }

  // ── Liberty Monument (St George Column) ──────────────────────────────────
  private addLibertyMonument() {
    const stoneMat  = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.8 })
    const goldMat   = new THREE.MeshStandardMaterial({ color: 0xd4a020, metalness: 0.6, roughness: 0.4 })

    // Base pedestal
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.8, 3, 16), stoneMat)
    base.position.set(0, 1.5, 0)
    base.castShadow = true
    this.scene.add(base)

    // Column
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 32, 16), stoneMat)
    col.position.set(0, 19, 0)
    col.castShadow = true
    this.scene.add(col)

    // Capital ring
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.1, 2, 16), stoneMat)
    cap.position.set(0, 36, 0)
    this.scene.add(cap)

    // St George sphere (stand-in for statue)
    const statue = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), goldMat)
    statue.position.set(0, 38.8, 0)
    statue.castShadow = true
    this.scene.add(statue)

    // Physics for column
    this.physics.addStaticBox(new CANNON.Vec3(1.2, 18, 1.2), new CANNON.Vec3(0, 18, 0))
    this.physics.addStaticBox(new CANNON.Vec3(5.8, 1.5, 5.8), new CANNON.Vec3(0, 1.5, 0))
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
