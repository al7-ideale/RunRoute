/**
 * Offline base map.
 *
 * The GPX line + GPS position never need the network. The base map does:
 * OSM tiles are downloaded on demand. Before race day the user can save the
 * tiles covering a corridor around the route into Cache Storage; the service
 * worker serves them cache-first (same cache name, see vite.config.ts).
 */
import { destination, haversine, type LatLng } from './geo'
import type { RouteData } from './gpx'

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
export const TILE_CACHE = 'runroute-tiles'
export const MIN_ZOOM = 12
export const MAX_ZOOM = 16
/** Corridor half-width around the route, metres. */
const CORRIDOR = 150
/** Average OSM PNG tile size, for estimates. */
export const AVG_TILE_BYTES = 18_000
/** OSM tile usage policy: at most 2 parallel downloads. */
const CONCURRENCY = 2

export interface Tile {
  z: number
  x: number
  y: number
}

export const tileUrl = ({ z, x, y }: Tile) =>
  TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))

function lngToX(lng: number, z: number) {
  return Math.floor(((lng + 180) / 360) * 2 ** z)
}
function latToY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/** Tiles covering a corridor around the route for each zoom level. */
export function tilesForRoute(route: RouteData, minZoom = MIN_ZOOM, maxZoom = MAX_ZOOM): Tile[] {
  // Resample route every ~60 m so no tile along the line is skipped.
  const samples: LatLng[] = [route.points[0]]
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]
    const b = route.points[i]
    const steps = Math.ceil(haversine(a, b) / 60)
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      samples.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t })
    }
  }
  const seen = new Set<string>()
  const out: Tile[] = []
  for (let z = minZoom; z <= maxZoom; z++) {
    for (const p of samples) {
      const nw = destination(destination(p, 0, CORRIDOR), 270, CORRIDOR)
      const se = destination(destination(p, 180, CORRIDOR), 90, CORRIDOR)
      for (let x = lngToX(nw.lng, z); x <= lngToX(se.lng, z); x++) {
        for (let y = latToY(nw.lat, z); y <= latToY(se.lat, z); y++) {
          const k = `${z}/${x}/${y}`
          if (!seen.has(k)) {
            seen.add(k)
            out.push({ z, x, y })
          }
        }
      }
    }
  }
  return out
}

export function cacheSupported() {
  return 'caches' in window
}

export async function countCached(tiles: Tile[]): Promise<number> {
  if (!cacheSupported()) return 0
  const cache = await caches.open(TILE_CACHE)
  let n = 0
  for (const t of tiles) if (await cache.match(tileUrl(t))) n++
  return n
}

export interface DownloadProgress {
  done: number
  total: number
  failed: number
  bytes: number
}

export async function downloadTiles(
  tiles: Tile[],
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<DownloadProgress> {
  const cache = await caches.open(TILE_CACHE)
  const prog: DownloadProgress = { done: 0, total: tiles.length, failed: 0, bytes: 0 }
  let next = 0

  const worker = async () => {
    while (next < tiles.length) {
      if (signal?.aborted) return
      const url = tileUrl(tiles[next++])
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { mode: 'cors', signal })
          if (!res.ok) throw new Error(String(res.status))
          const blob = await res.clone().blob()
          prog.bytes += blob.size
          await cache.put(url, res)
        }
      } catch {
        if (signal?.aborted) return
        prog.failed++
      }
      prog.done++
      onProgress({ ...prog })
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return prog
}
