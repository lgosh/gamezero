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

// Per-type Y offsets — ensure no two overlapping road types share the same height
const ROAD_Y: Record<string, number> = {
  motorway: 0.02, trunk: 0.02, primary: 0.02,
  secondary: 0.03, tertiary: 0.04, residential: 0.04,
  unclassified: 0.04, service: 0.04, living_street: 0.04,
  pedestrian: 0.06, footway: 0.07, path: 0.07, steps: 0.07, cycleway: 0.07,
}

// ── Landmark detection ─────────────────────────────────────────────────────
type LandmarkKey = 'marriott' | 'townhall' | 'galleria' | 'parliament'
interface LandmarkInfo { cx: number; cz: number; height: number; ring: Array<[number, number]> }
const LANDMARK_PATTERNS: Array<{ key: LandmarkKey; terms: string[] }> = [
  { key: 'marriott',   terms: ['marriott', 'courtyard'] },
  { key: 'townhall',   terms: ['town hall', 'city hall', 'old hall', 'meria', 'townhall'] },
  { key: 'galleria',   terms: ['galleria'] },
  { key: 'parliament', terms: ['parliament', 'parlamenti', 'parlamentis', 'პარლამენტ'] },
]

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
  public  minimapCanvas: HTMLCanvasElement | null = null
  private _landmarks    = new Map<LandmarkKey, LandmarkInfo>()

  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    this.scene   = scene
    this.physics = physics
  }

  // No dynamic props in this map
  syncProps() {}

  getLandmark(key: LandmarkKey): { cx: number; cz: number } | undefined {
    const info = this._landmarks.get(key)
    return info ? { cx: info.cx, cz: info.cz } : undefined
  }

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
      const geo = buildAreaGeo(pts, 0.01)
      if (geo) pushGeo(areaGeos, color, geo)
    }

    // ── 2. Roads ──────────────────────────────────────────────────────────
    const minimapRoads: Array<{ pts: Array<[number, number]>; htype: string }> = []
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
      const y     = ROAD_Y[htype] ?? 0.04
      const geo   = buildRibbonGeo(pts, width, y)
      if (geo) pushGeo(roadGeos, color, geo)
      minimapRoads.push({ pts, htype })
    }

    // ── 3. Buildings ──────────────────────────────────────────────────────
    // Collect BuildingDef list; detect monument way
    const buildingDefs: BuildingDef[] = []
    const landmarkMap = new Map<LandmarkKey, LandmarkInfo>()
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

      const height = parseHeight(tags)
      const name = (tags['name:en'] || tags['name']) as string | undefined

      // Landmark detection runs regardless of distance (Parliament is ~613m away)
      let isLandmark = false
      if (name) {
        const nl = name.toLowerCase()
        for (const { key, terms } of LANDMARK_PATTERNS) {
          if (!landmarkMap.has(key) && terms.some(t => nl.includes(t))) {
            landmarkMap.set(key, { cx, cz, height, ring: [...ring] })
            isLandmark = true
            break
          }
        }
      }

      // Distance cutoff: 800m for named landmarks, 500m for everything else
      if (dist > (isLandmark ? 800 : 500)) continue

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

      // Building physics disabled — axis-aligned bounding boxes cannot reliably
      // avoid blocking roads when building footprints are large or oddly shaped.
      // Map boundary walls (±900m) keep the car within bounds.
    }

    // ── 4. Flush geometry buckets → merged meshes ─────────────────────────
    flushBucket(areaGeos,  this.scene, false)
    flushBucket(roadGeos,  this.scene, false)
    flushBucket(bldgGeos,  this.scene, true)

    // ── 5. Windows (InstancedMesh) ─────────────────────────────────────────
    this.addWindows(buildingDefs)

    // ── 6. Building signs (physical wall panels) ──────────────────────────
    this.addWallSigns(buildingDefs)

    // ── 6b. Landmark decorations ───────────────────────────────────────────
    this._landmarks = new Map(landmarkMap)
    this.addLandmarkDecoration(landmarkMap)

    // ── 7. Landmarks ──────────────────────────────────────────────────────
    this.addLibertyMonument(monumentCx, monumentCz)
    this.addStreetLamps()
    this.addRustaveliFurniture()

    // ── Minimap canvas (pre-render OSM roads for HUD radar) ────────────────
    this._buildMinimapCanvas(minimapRoads)

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

        // Outward normal — pick the perpendicular that points away from building centroid
        // (OSM winding is inconsistent — can be CW or CCW)
        let nx = -(dz) / edgeLen
        let nz = (dx) / edgeLen
        const midX = (ax + bx) / 2, midZ = (az + bz) / 2
        // If normal points toward centroid, it's inward — flip it
        if (nx * (def.cx - midX) + nz * (def.cz - midZ) > 0) { nx = -nx; nz = -nz }

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

  // ── Physical wall signs ───────────────────────────────────────────────────
  private addWallSigns(buildings: BuildingDef[]) {
    for (const def of buildings) {
      if (!def.name || def.dist > 200 || def.name.length > 30) continue
      // Skip landmarks — they get dedicated signs via addLandmarkDecoration
      const nl = def.name.toLowerCase()
      if (LANDMARK_PATTERNS.some(p => p.terms.some(t => nl.includes(t)))) continue
      this.placeWallSign(def.ring, def.name, 4.0, '#ffffff', 'rgba(5,10,30,0.88)')
    }
  }

  private placeWallSign(
    ring: Array<[number, number]>,
    text: string,
    signY: number,
    fg: string,
    bg: string,
    accentColor?: string,
  ) {
    if (ring.length < 2) return
    // Find longest edge = primary sign face
    let bestI = 0, bestLen = 0
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length]
      const l = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2)
      if (l > bestLen) { bestLen = l; bestI = i }
    }
    const [ax, az] = ring[bestI], [bx, bz] = ring[(bestI + 1) % ring.length]
    const ex = (ax + bx) / 2, ez = (az + bz) / 2
    const dx = bx - ax, dz = bz - az
    const len = Math.sqrt(dx * dx + dz * dz) || 1
    let nx = -dz / len, nz = dx / len
    // Ring centroid — ensure normal faces outward, not inward
    let centX = 0, centZ = 0
    for (const [x, z] of ring) { centX += x; centZ += z }
    centX /= ring.length; centZ /= ring.length
    if (nx * (centX - ex) + nz * (centZ - ez) > 0) { nx = -nx; nz = -nz }

    const signW = Math.min(bestLen * 0.55, 9)
    const signH = 0.85

    const canvas = document.createElement('canvas')
    canvas.width = 512; canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, 512, 64)
    if (accentColor) {
      ctx.fillStyle = accentColor
      ctx.fillRect(0, 0, 7, 64)
      ctx.fillRect(505, 0, 7, 64)
    }
    ctx.fillStyle = fg
    ctx.font = 'bold 26px Arial, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText(text, 256, 32)

    const tex = new THREE.CanvasTexture(canvas)
    const geo = new THREE.BoxGeometry(signW, signH, 0.12)
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.25, metalness: 0.55, side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(ex + nx * 0.15, signY, ez + nz * 0.15)
    mesh.rotation.y = Math.atan2(nx, nz)
    this.scene.add(mesh)
  }

  // ── Landmark decoration dispatch ──────────────────────────────────────────
  private addLandmarkDecoration(landmarks: Map<LandmarkKey, LandmarkInfo>) {
    const m = landmarks.get('marriott');   if (m) this.decorateMarriott(m)
    const t = landmarks.get('townhall');   if (t) this.decorateTownHall(t)
    const g = landmarks.get('galleria');   if (g) this.decorateGalleria(g)

    const p = landmarks.get('parliament')
    if (p) {
      this.decorateParliament(p)
    } else {
      // Parliament of Georgia: OSM name may be Georgian-only ("საქართველოს პარლამენტი")
      // Fallback: known coordinates — lat 41.6958, lon 44.7979
      // x=(44.7979-44.8031)*83126≈-432, z=-(41.6958-41.6922)*111320≈-401
      const parlCx = -432, parlCz = -401, parlH = 28
      // Add basic building shell so the dome has something to sit on
      const shape = new THREE.Shape([
        new THREE.Vector2(-462, 371), new THREE.Vector2(-402, 371),
        new THREE.Vector2(-402, 431), new THREE.Vector2(-462, 431),
      ])
      const bGeo = new THREE.ExtrudeGeometry(shape, { depth: parlH, bevelEnabled: false })
      bGeo.rotateX(-Math.PI / 2)
      const bMesh = new THREE.Mesh(bGeo, new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.7 }))
      bMesh.castShadow = bMesh.receiveShadow = true
      this.scene.add(bMesh)
      // Front facade faces south (+Z) toward Rustaveli — that's the edge at z≈-371
      const fallbackRing: Array<[number, number]> = [
        [-462, -371], [-402, -371], [-402, -431], [-462, -431],
      ]
      this.decorateParliament({ cx: parlCx, cz: parlCz, height: parlH, ring: fallbackRing })
    }
  }

  private decorateMarriott(info: LandmarkInfo) {
    const { height, ring } = info
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x607080, roughness: 0.3, metalness: 0.6 })

    // Horizontal concrete spandrel bands at each floor
    const numFloors = Math.min(Math.floor(height / 3.2), 14)
    const bandGeos: THREE.BufferGeometry[] = []
    for (let f = 1; f < numFloors; f++) {
      const y = f * 3.2
      const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)))
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.28, bevelEnabled: false })
      geo.rotateX(-Math.PI / 2)
      geo.translate(0, y, 0)
      bandGeos.push(geo)
    }
    if (bandGeos.length) {
      const merged = mergeGeometries(bandGeos, false)
      if (merged) { const mesh = new THREE.Mesh(merged, bandMat); this.scene.add(mesh) }
      for (const g of bandGeos) g.dispose()
    }

    // Dark glass facade panels between bands
    let bestI = 0, bestLen = 0
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length]
      const l = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2)
      if (l > bestLen) { bestLen = l; bestI = i }
    }
    const [fax, faz] = ring[bestI], [fbx, fbz] = ring[(bestI + 1) % ring.length]
    const fdx = fbx - fax, fdz = fbz - faz
    const flen = Math.sqrt(fdx * fdx + fdz * fdz) || 1
    const fnx = -fdz / flen, fnz = fdx / flen
    const glassGeos: THREE.BufferGeometry[] = []
    const NUM_COLS = Math.floor(bestLen / 2.2)
    for (let col = 0; col < NUM_COLS; col++) {
      const t = (col + 0.5) / NUM_COLS
      const gx = fax + fdx * t + fnx * 0.1
      const gz = faz + fdz * t + fnz * 0.1
      for (let fl = 0; fl < numFloors; fl++) {
        const gy = fl * 3.2 + 1.6
        if (gy > height - 1) break
        const gg = new THREE.PlaneGeometry(1.5, 2.2)
        gg.rotateY(Math.atan2(fnx, fnz))
        gg.translate(gx, gy, gz)
        glassGeos.push(gg)
      }
    }
    if (glassGeos.length) {
      const glassMerged = mergeGeometries(glassGeos, false)
      if (glassMerged) {
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide })
        this.scene.add(new THREE.Mesh(glassMerged, glassMat))
      }
      for (const g of glassGeos) g.dispose()
    }

    // Rooftop parapet
    const roofShape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)))
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1.4, bevelEnabled: false })
    roofGeo.rotateX(-Math.PI / 2)
    roofGeo.translate(0, height, 0)
    this.scene.add(new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.5, metalness: 0.4 })))

    // Sign: dark blue with gold accents
    this.placeWallSign(ring, 'COURTYARD by Marriott', 5.5, '#ffffff', '#002244', '#b8982a')
  }

  private decorateTownHall(info: LandmarkInfo) {
    const { height, ring } = info
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xd4c8a8, roughness: 0.8 })

    // Decorative cornice at top and mid-floor band
    for (const y of [height - 0.6, height / 2]) {
      const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)))
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false })
      geo.rotateX(-Math.PI / 2)
      geo.translate(0, y, 0)
      const mesh = new THREE.Mesh(geo, stoneMat)
      mesh.castShadow = true
      this.scene.add(mesh)
    }

    // Clock face on the front facade
    const clockCanvas = document.createElement('canvas')
    clockCanvas.width = clockCanvas.height = 256
    const cctx = clockCanvas.getContext('2d')!
    cctx.fillStyle = '#ece8d8'
    cctx.beginPath(); cctx.arc(128, 128, 122, 0, Math.PI * 2); cctx.fill()
    cctx.strokeStyle = '#3a2a10'; cctx.lineWidth = 8; cctx.stroke()
    // Ornamental inner ring
    cctx.strokeStyle = '#8a7040'; cctx.lineWidth = 3
    cctx.beginPath(); cctx.arc(128, 128, 115, 0, Math.PI * 2); cctx.stroke()
    // Hour markers
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6 - Math.PI / 2
      const r1 = i % 3 === 0 ? 80 : 95
      cctx.lineWidth = i % 3 === 0 ? 7 : 3
      cctx.strokeStyle = '#3a2a10'
      cctx.beginPath()
      cctx.moveTo(128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1)
      cctx.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112)
      cctx.stroke()
    }
    // Hands at 10:10
    const drawHand = (angle: number, rLen: number, w: number) => {
      cctx.beginPath(); cctx.moveTo(128, 128)
      cctx.lineTo(128 + Math.cos(angle) * rLen, 128 + Math.sin(angle) * rLen)
      cctx.strokeStyle = '#1a1206'; cctx.lineWidth = w; cctx.lineCap = 'round'; cctx.stroke()
    }
    drawHand(-Math.PI / 2 + (10 / 12) * Math.PI * 2, 70, 9)
    drawHand(-Math.PI / 2 + (50 / 60) * Math.PI * 2, 92, 5)
    cctx.beginPath(); cctx.arc(128, 128, 9, 0, Math.PI * 2)
    cctx.fillStyle = '#1a1206'; cctx.fill()

    // Find front face
    let bestI = 0, bestLen = 0
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length]
      const l = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2)
      if (l > bestLen) { bestLen = l; bestI = i }
    }
    const [ax, az] = ring[bestI], [bx, bz] = ring[(bestI + 1) % ring.length]
    const ex = (ax + bx) / 2, ez = (az + bz) / 2
    const dx = bx - ax, dz = bz - az
    const flen = Math.sqrt(dx * dx + dz * dz) || 1
    const nx = -dz / flen, nz = dx / flen

    const clockMesh = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 32),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(clockCanvas), roughness: 0.2, emissive: new THREE.Color(0.08, 0.07, 0.04) })
    )
    clockMesh.position.set(ex + nx * 0.25, height * 0.62, ez + nz * 0.25)
    clockMesh.rotation.y = Math.atan2(nx, nz)
    this.scene.add(clockMesh)

    // Stone sign plaque: "ძველი მერია"
    this.placeWallSign(ring, 'ძველი მერია', 3.5, '#f5e8c0', '#1a1206')
  }

  private decorateGalleria(info: LandmarkInfo) {
    const { height, ring } = info
    // Find centroid
    let centX = 0, centZ = 0
    for (const [x, z] of ring) { centX += x; centZ += z }
    centX /= ring.length; centZ /= ring.length
    // Find the edge whose outward normal faces Rustaveli Avenue.
    // Use the perpendicular projection: direction from building centroid toward
    // the nearest point on the Rustaveli centerline.
    const RX = -0.7954, RZ = -0.6060
    const proj = info.cx * RX + info.cz * RZ
    const nearX = proj * RX, nearZ = proj * RZ
    const rawDX = nearX - info.cx, rawDZ = nearZ - info.cz
    const rawLen = Math.sqrt(rawDX * rawDX + rawDZ * rawDZ) || 1
    const toRoadX = rawDX / rawLen, toRoadZ = rawDZ / rawLen
    let bestI = 0, bestDot = -Infinity, bestLen = 0
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length]
      const ddx = bx - ax, ddz = bz - az
      const l = Math.sqrt(ddx * ddx + ddz * ddz) || 1
      let inx = -ddz / l, inz = ddx / l
      const midX = (ax + bx) / 2, midZ = (az + bz) / 2
      if (inx * (centX - midX) + inz * (centZ - midZ) > 0) { inx = -inx; inz = -inz }
      const dot = inx * toRoadX + inz * toRoadZ
      if (dot > bestDot) { bestDot = dot; bestI = i }
    }
    // Edge length of chosen face
    {
      const [fax, faz] = ring[bestI], [fbx, fbz] = ring[(bestI + 1) % ring.length]
      bestLen = Math.sqrt((fbx - fax) ** 2 + (fbz - faz) ** 2)
    }
    const [ax, az] = ring[bestI], [bx, bz] = ring[(bestI + 1) % ring.length]
    const ex = (ax + bx) / 2, ez = (az + bz) / 2
    const dx = bx - ax, dz = bz - az
    const flen = Math.sqrt(dx * dx + dz * dz) || 1
    let nx = -dz / flen, nz = dx / flen
    if (nx * (centX - ex) + nz * (centZ - ez) > 0) { nx = -nx; nz = -nz }

    // Large glass curtain wall
    const panelW = bestLen * 0.8, panelH = height - 0.5
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x88aacc, roughness: 0.04, metalness: 0.15,
      transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    })
    const glassPanel = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), glassMat)
    glassPanel.position.set(ex + nx * 0.25, panelH / 2 + 0.25, ez + nz * 0.25)
    glassPanel.rotation.y = Math.atan2(nx, nz)
    this.scene.add(glassPanel)

    // Horizontal aluminium frame dividers
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xaabbcc, roughness: 0.15, metalness: 0.85 })
    const numDividers = Math.floor(height / 4)
    for (let i = 1; i < numDividers; i++) {
      const fy = i * (height / numDividers)
      const frame = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.12, 0.1), frameMat)
      frame.position.set(ex + nx * 0.3, fy, ez + nz * 0.3)
      frame.rotation.y = Math.atan2(nx, nz)
      this.scene.add(frame)
    }

    // Entrance canopy
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x99bbdd, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.75 })
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(panelW * 0.4, 0.22, 5.5), canopyMat)
    canopy.position.set(ex + nx * 3.5, 4.5, ez + nz * 3.5)
    canopy.rotation.y = Math.atan2(nx, nz)
    this.scene.add(canopy)

    // Illuminated top sign
    this.placeWallSign(ring, 'Galleria Tbilisi', height - 1.5, '#ffffff', 'rgba(0,30,80,0.92)', '#336699')
  }

  private decorateParliament(info: LandmarkInfo) {
    const { cx, cz, height, ring } = info
    const colMat  = new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.5 })
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.7 })
    const domeMat  = new THREE.MeshStandardMaterial({ color: 0x3d7a50, roughness: 0.55, metalness: 0.2 })
    const goldMat  = new THREE.MeshStandardMaterial({ color: 0xd4a820, metalness: 0.7, roughness: 0.3 })

    // Front face: pick edge facing toward the road (southeast = toward origin)
    let centX = 0, centZ = 0
    for (const [x, z] of ring) { centX += x; centZ += z }
    centX /= ring.length; centZ /= ring.length
    const toRoadDist = Math.sqrt(cx ** 2 + cz ** 2) || 1
    const toRoadX = -cx / toRoadDist, toRoadZ = -cz / toRoadDist
    let bestI = 0, bestLen = 0, bestDot = -Infinity
    for (let i = 0; i < ring.length; i++) {
      const [eax, eaz] = ring[i], [ebx, ebz] = ring[(i + 1) % ring.length]
      const edx = ebx - eax, edz = ebz - eaz
      const el = Math.sqrt(edx * edx + edz * edz) || 1
      let inx = -edz / el, inz = edx / el
      const midX = (eax + ebx) / 2, midZ = (eaz + ebz) / 2
      if (inx * (centX - midX) + inz * (centZ - midZ) > 0) { inx = -inx; inz = -inz }
      const dot = inx * toRoadX + inz * toRoadZ
      if (dot > bestDot) { bestDot = dot; bestI = i; bestLen = el }
    }
    const [ax, az] = ring[bestI], [bx, bz] = ring[(bestI + 1) % ring.length]
    const dx = bx - ax, dz = bz - az
    const flen = Math.sqrt(dx * dx + dz * dz) || 1
    let nx = -dz / flen, nz = dx / flen
    if (nx * (centX - (ax + bx) / 2) + nz * (centZ - (az + bz) / 2) > 0) { nx = -nx; nz = -nz }

    // Classical columns
    const NUM_COLS = 6
    const colH = height * 0.72
    const colGeos: THREE.BufferGeometry[] = []
    for (let i = 0; i < NUM_COLS; i++) {
      const t = i / (NUM_COLS - 1)
      const colX = ax + dx * (0.18 + t * 0.64) + nx * 3
      const colZ = az + dz * (0.18 + t * 0.64) + nz * 3
      const geo = new THREE.CylinderGeometry(0.55, 0.72, colH, 10)
      geo.translate(colX, colH / 2, colZ)
      colGeos.push(geo)
    }
    const mergedCols = mergeGeometries(colGeos, false)
    if (mergedCols) {
      const m = new THREE.Mesh(mergedCols, colMat); m.castShadow = true; this.scene.add(m)
    }
    for (const g of colGeos) g.dispose()

    // Entablature across columns
    const entabW = bestLen * 0.68
    const entab = new THREE.Mesh(new THREE.BoxGeometry(entabW, 1.4, 1.8), stoneMat)
    entab.position.set(ax + dx * 0.5 + nx * 3, colH + 0.7, az + dz * 0.5 + nz * 3)
    entab.rotation.y = Math.atan2(nx, nz)
    entab.castShadow = true
    this.scene.add(entab)

    // Steps (5 wide treads stepping outward)
    for (let s = 0; s < 5; s++) {
      const stepW = entabW + (5 - s) * 1.2
      const stepD = 1.3
      const step = new THREE.Mesh(new THREE.BoxGeometry(stepW, 0.22, stepD), stoneMat)
      step.position.set(
        ax + dx * 0.5 + nx * (3.8 + stepD * s),
        0.11 + s * 0.22,
        az + dz * 0.5 + nz * (3.8 + stepD * s)
      )
      step.rotation.y = Math.atan2(nx, nz)
      this.scene.add(step)
    }

    // Dome drum + hemisphere
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(7, 8.5, 4.5, 20), domeMat)
    drum.position.set(cx, height - 1, cz); drum.castShadow = true; this.scene.add(drum)
    const domeGeo = new THREE.SphereGeometry(7.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)
    const dome = new THREE.Mesh(domeGeo, domeMat)
    dome.position.set(cx, height + 3, cz); dome.castShadow = true; this.scene.add(dome)

    // Gold lantern on dome
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.1, 3, 12), goldMat)
    lantern.position.set(cx, height + 10, cz); this.scene.add(lantern)
    const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.8, 12), goldMat)
    lanternCap.position.set(cx, height + 13.4, cz); this.scene.add(lanternCap)
  }

  // placeholder kept so callers don't need updating
  private addRustaveliFurniture() { /* tram rails removed per user request */ }

  // ── Pre-render OSM roads to a 512×512 canvas for the HUD minimap ──────────
  private _buildMinimapCanvas(roads: Array<{ pts: Array<[number, number]>; htype: string }>) {
    const SIZE  = 512
    const RANGE = 900  // ±900m world space
    const canvas = document.createElement('canvas')
    canvas.width  = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')!

    // Dark map background
    ctx.fillStyle = '#141420'
    ctx.fillRect(0, 0, SIZE, SIZE)

    const toC = (x: number, z: number): [number, number] => [
      (x + RANGE) / (2 * RANGE) * SIZE,
      (z + RANGE) / (2 * RANGE) * SIZE,
    ]

    // Road style table — drawn back-to-front (thinnest/dimmest first)
    const STYLES: Array<{ htype: string; color: string; lw: number }> = [
      { htype: 'footway',     color: '#3a3830', lw: 0.5 },
      { htype: 'path',        color: '#3a3830', lw: 0.5 },
      { htype: 'pedestrian',  color: '#4a4840', lw: 1.0 },
      { htype: 'residential', color: '#50505e', lw: 1.0 },
      { htype: 'living_street',color:'#50505e', lw: 1.0 },
      { htype: 'service',     color: '#48485a', lw: 0.8 },
      { htype: 'unclassified',color: '#555568', lw: 1.0 },
      { htype: 'tertiary',    color: '#707085', lw: 1.5 },
      { htype: 'secondary',   color: '#909098', lw: 2.0 },
      { htype: 'primary',     color: '#c8c070', lw: 2.5 },
      { htype: 'trunk',       color: '#e08030', lw: 3.0 },
      { htype: 'motorway',    color: '#e08030', lw: 3.0 },
    ]

    ctx.lineCap  = 'round'
    ctx.lineJoin = 'round'

    for (const { htype: ht, color, lw } of STYLES) {
      ctx.strokeStyle = color
      ctx.lineWidth   = lw
      for (const { pts, htype } of roads) {
        if (htype !== ht || pts.length < 2) continue
        ctx.beginPath()
        const [x0, z0] = toC(pts[0][0], pts[0][1])
        ctx.moveTo(x0, z0)
        for (let i = 1; i < pts.length; i++) {
          const [xi, zi] = toC(pts[i][0], pts[i][1])
          ctx.lineTo(xi, zi)
        }
        ctx.stroke()
      }
    }

    this.minimapCanvas = canvas
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
