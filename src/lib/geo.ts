/**
 * Geographic calculations.
 * Pure functions, no DOM / browser dependencies.
 */

export interface LatLng {
  lat: number
  lng: number
}

/** Mean Earth radius (IUGG), metres. */
export const EARTH_RADIUS = 6371008.8

const RAD = Math.PI / 180

export const toRad = (deg: number) => deg * RAD
export const toDeg = (rad: number) => rad / RAD

/** Great-circle distance in metres. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * RAD
  const dLng = (b.lng - a.lng) * RAD
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Initial bearing from a to b, degrees clockwise from north [0, 360). */
export function bearing(a: LatLng, b: LatLng): number {
  const φ1 = a.lat * RAD
  const φ2 = b.lat * RAD
  const Δλ = (b.lng - a.lng) * RAD
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Point reached travelling `distance` metres from `p` on `bearingDeg`. */
export function destination(p: LatLng, bearingDeg: number, distance: number): LatLng {
  const δ = distance / EARTH_RADIUS
  const θ = bearingDeg * RAD
  const φ1 = p.lat * RAD
  const λ1 = p.lng * RAD
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return { lat: toDeg(φ2), lng: ((toDeg(λ2) + 540) % 360) - 180 }
}

/**
 * Local equirectangular projection (metres) around an origin.
 * Accurate to well under 0.1 % over a race-sized area (~30 km), which is
 * plenty for point-to-segment matching.
 */
export interface Projector {
  toXY(p: LatLng): [number, number]
  toLatLng(x: number, y: number): LatLng
}

export function createProjector(origin: LatLng): Projector {
  const kx = EARTH_RADIUS * RAD * Math.cos(origin.lat * RAD)
  const ky = EARTH_RADIUS * RAD
  return {
    toXY: (p) => [(p.lng - origin.lng) * kx, (p.lat - origin.lat) * ky],
    toLatLng: (x, y) => ({ lat: origin.lat + y / ky, lng: origin.lng + x / kx }),
  }
}

export interface SegmentProjection {
  /** Parameter along segment, clamped to [0, 1]. */
  t: number
  /** Distance from point to closest point on segment (same units as input). */
  dist: number
  x: number
  y: number
}

/** Closest point on segment AB to P in planar coordinates. */
export function projectOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): SegmentProjection {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const x = ax + t * dx
  const y = ay + t * dy
  return { t, dist: Math.hypot(px - x, py - y), x, y }
}
