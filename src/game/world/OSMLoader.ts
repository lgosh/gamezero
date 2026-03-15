export interface OSMData { elements: OSMElement[] }

export interface OSMNode {
  type: 'node'
  id: number
  lat: number
  lon: number
  tags?: Record<string, string>
}

export interface OSMWay {
  type: 'way'
  id: number
  nodes: number[]
  tags?: Record<string, string>
}

export type OSMElement = OSMNode | OSMWay

const OVERPASS_QUERY = `[out:json][timeout:30];(
  way["building"](41.685,44.787,41.700,44.815);
  way["highway"](41.685,44.787,41.700,44.815);
  way["natural"="water"](41.685,44.787,41.700,44.815);
  way["landuse"~"park|grass|recreation_ground|square"](41.685,44.787,41.700,44.815);
  way["leisure"~"park|garden|square"](41.685,44.787,41.700,44.815);
  way["area"="yes"]["highway"="pedestrian"](41.685,44.787,41.700,44.815);
);out body;>;out skel qt;`

export async function loadOSM(): Promise<OSMData> {
  // 1. Static bundled file (fastest, ships with the game)
  try {
    const r = await fetch('/tbilisi-osm.json')
    if (r.ok) return r.json() as Promise<OSMData>
  } catch { /* fall through */ }

  // 2. localStorage cache
  try {
    const cached = localStorage.getItem('tbilisi-osm-v1')
    if (cached) return JSON.parse(cached) as OSMData
  } catch { /* fall through */ }

  // 3. Live Overpass API fetch
  const resp = await fetch(
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(OVERPASS_QUERY)}`
  )
  const data = await resp.json() as OSMData
  try { localStorage.setItem('tbilisi-osm-v1', JSON.stringify(data)) } catch { /* storage full */ }
  return data
}
