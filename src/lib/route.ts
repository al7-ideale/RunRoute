/**
 * Route geometry index: precomputed cumulative distances and planar
 * coordinates so a GPS fix can be matched to the route quickly.
 */
import { createProjector, haversine, projectOnSegment, type LatLng, type Projector } from './geo'
import type { RouteData } from './gpx'

export interface RouteIndex {
  route: RouteData
  proj: Projector
  xs: Float64Array
  ys: Float64Array
  /** Cumulative distance (m) at each vertex. */
  cum: Float64Array
  total: number
}

export interface RouteMatch {
  /** Distance along the route of the matched point, metres. */
  along: number
  /** Perpendicular distance from the fix to the route, metres. */
  offset: number
  /** Segment index (vertex i → i+1). */
  seg: number
  /** Matched point on the route. */
  point: LatLng
}

export function buildRouteIndex(route: RouteData): RouteIndex {
  const pts = route.points
  const n = pts.length
  const [[s, w], [nn, e]] = route.bounds
  const proj = createProjector({ lat: (s + nn) / 2, lng: (w + e) / 2 })
  const xs = new Float64Array(n)
  const ys = new Float64Array(n)
  const cum = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const [x, y] = proj.toXY(pts[i])
    xs[i] = x
    ys[i] = y
    if (i > 0) cum[i] = cum[i - 1] + haversine(pts[i - 1], pts[i])
  }
  return { route, proj, xs, ys, cum, total: cum[n - 1] }
}

export interface MatchOptions {
  /**
   * Where we expect the runner to be along the route (m). Candidates far
   * from this are penalised so out-and-back sections and loops that pass
   * the same street twice are not confused.
   */
  expected?: number
  /** Distance (m) around `expected` with no penalty. */
  slack?: number
  /** Penalty (m of offset per m beyond slack). */
  weight?: number
}

/**
 * Match a position to the route. Without `expected`, returns the globally
 * nearest point.
 */
export function matchToRoute(index: RouteIndex, p: LatLng, opts: MatchOptions = {}): RouteMatch {
  const { xs, ys, cum } = index
  const [px, py] = index.proj.toXY(p)
  const useHint = opts.expected !== undefined
  const expected = opts.expected ?? 0
  const slack = opts.slack ?? 150
  const weight = opts.weight ?? 0.15

  let bestScore = Infinity
  let best: RouteMatch | null = null
  let bestX = 0
  let bestY = 0
  for (let i = 0; i < xs.length - 1; i++) {
    const r = projectOnSegment(px, py, xs[i], ys[i], xs[i + 1], ys[i + 1])
    const along = cum[i] + r.t * (cum[i + 1] - cum[i])
    let score = r.dist
    if (useHint) {
      const gap = Math.abs(along - expected) - slack
      if (gap > 0) score += gap * weight
    }
    if (score < bestScore) {
      bestScore = score
      best = { along, offset: r.dist, seg: i, point: { lat: 0, lng: 0 } }
      bestX = r.x
      bestY = r.y
    }
  }
  // xs.length >= 2 is guaranteed by the parser.
  best!.point = index.proj.toLatLng(bestX, bestY)
  return best!
}

/** Coordinates of the point at `d` metres along the route. */
export function pointAtDistance(index: RouteIndex, d: number): LatLng {
  const { cum, route } = index
  const pts = route.points
  if (d <= 0) return { lat: pts[0].lat, lng: pts[0].lng }
  if (d >= index.total) return { ...route.finish }
  let lo = 0
  let hi = cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= d) lo = mid
    else hi = mid
  }
  const segLen = cum[hi] - cum[lo]
  const t = segLen > 0 ? (d - cum[lo]) / segLen : 0
  return {
    lat: pts[lo].lat + (pts[hi].lat - pts[lo].lat) * t,
    lng: pts[lo].lng + (pts[hi].lng - pts[lo].lng) * t,
  }
}

/** Route polyline from 0 up to `d` metres along. */
export function routeUntil(index: RouteIndex, d: number): LatLng[] {
  const { cum, route } = index
  const out: LatLng[] = []
  if (d <= 0) return out
  for (let i = 0; i < cum.length && cum[i] < d; i++) {
    out.push({ lat: route.points[i].lat, lng: route.points[i].lng })
  }
  out.push(pointAtDistance(index, d))
  return out
}
