/**
 * GPX parsing: GPX file text → RouteData.
 * Reads <trk>/<trkseg>/<trkpt> (falls back to <rte>/<rtept> if no track).
 */
import { haversine, type LatLng } from './geo'

export interface RoutePoint {
  lat: number
  lng: number
  ele: number | null
  /** Epoch ms, when the GPX has timestamps. */
  time: number | null
}

export interface RouteData {
  id: string
  name: string
  fileName: string
  importedAt: number
  points: RoutePoint[]
  /** Total route distance, metres. */
  distance: number
  elevationGain: number
  elevationLoss: number
  start: LatLng
  finish: LatLng
  /** [[south, west], [north, east]] */
  bounds: [[number, number], [number, number]]
  hasElevation: boolean
  hasTimes: boolean
}

export type GpxErrorCode = 'invalid' | 'no-track' | 'too-short' | 'empty'

export class GpxError extends Error {
  readonly code: GpxErrorCode
  constructor(code: GpxErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'GpxError'
  }
}

export const GPX_ERROR_TEXT: Record<GpxErrorCode, string> = {
  invalid: 'Not a valid GPX file',
  'no-track': 'No track found in this GPX',
  'too-short': 'Route is too short',
  empty: 'File is empty',
}

/** Elevation hysteresis (m): filters DEM/GPS noise from gain/loss totals. */
const ELEVATION_THRESHOLD = 2
/** Consecutive points closer than this (m) are merged. */
const DUPLICATE_DISTANCE = 0.5

const byTag = (root: Document | Element, tag: string) =>
  Array.from(root.getElementsByTagNameNS('*', tag))

const childText = (el: Element, tag: string): string | null => {
  for (const c of Array.from(el.children)) {
    if (c.localName === tag) return c.textContent?.trim() || null
  }
  return null
}

function readPoint(el: Element): RoutePoint | null {
  const lat = parseFloat(el.getAttribute('lat') ?? '')
  const lng = parseFloat(el.getAttribute('lon') ?? '')
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  const eleText = childText(el, 'ele')
  const ele = eleText !== null ? parseFloat(eleText) : NaN
  const timeText = childText(el, 'time')
  const time = timeText ? Date.parse(timeText) : NaN
  return {
    lat,
    lng,
    ele: Number.isFinite(ele) ? ele : null,
    time: Number.isFinite(time) ? time : null,
  }
}

export function computeElevation(points: RoutePoint[]): { gain: number; loss: number } {
  let gain = 0
  let loss = 0
  let ref: number | null = null
  for (const p of points) {
    if (p.ele === null) continue
    if (ref === null) {
      ref = p.ele
      continue
    }
    const d = p.ele - ref
    if (d >= ELEVATION_THRESHOLD) {
      gain += d
      ref = p.ele
    } else if (d <= -ELEVATION_THRESHOLD) {
      loss -= d
      ref = p.ele
    }
  }
  return { gain, loss }
}

export function parseGpx(text: string, fileName = 'route.gpx'): RouteData {
  if (!text || !text.trim()) throw new GpxError('empty', GPX_ERROR_TEXT.empty)

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(text, 'application/xml')
  } catch {
    throw new GpxError('invalid', GPX_ERROR_TEXT.invalid)
  }
  if (byTag(doc, 'parsererror').length > 0 || doc.documentElement?.localName !== 'gpx') {
    throw new GpxError('invalid', GPX_ERROR_TEXT.invalid)
  }

  // Track points, in document order, across all <trk> and <trkseg>.
  let raw: RoutePoint[] = []
  for (const trk of byTag(doc, 'trk')) {
    for (const seg of byTag(trk, 'trkseg')) {
      for (const pt of byTag(seg, 'trkpt')) {
        const p = readPoint(pt)
        if (p) raw.push(p)
      }
    }
  }
  // Planned routes are sometimes exported as <rte> instead of <trk>.
  if (raw.length === 0) {
    raw = byTag(doc, 'rtept')
      .map(readPoint)
      .filter((p): p is RoutePoint => p !== null)
  }
  if (raw.length === 0) throw new GpxError('no-track', GPX_ERROR_TEXT['no-track'])

  // Drop consecutive duplicates; accumulate distance.
  const points: RoutePoint[] = [raw[0]]
  let distance = 0
  for (let i = 1; i < raw.length; i++) {
    const d = haversine(points[points.length - 1], raw[i])
    if (d < DUPLICATE_DISTANCE) continue
    distance += d
    points.push(raw[i])
  }
  if (points.length < 2 || distance < 50) {
    throw new GpxError('too-short', GPX_ERROR_TEXT['too-short'])
  }

  let south = 90
  let north = -90
  let west = 180
  let east = -180
  for (const p of points) {
    if (p.lat < south) south = p.lat
    if (p.lat > north) north = p.lat
    if (p.lng < west) west = p.lng
    if (p.lng > east) east = p.lng
  }

  const { gain, loss } = computeElevation(points)
  const first = points[0]
  const last = points[points.length - 1]
  const trk = byTag(doc, 'trk')[0]
  const name =
    (trk && childText(trk, 'name')) ||
    (byTag(doc, 'metadata')[0] && childText(byTag(doc, 'metadata')[0], 'name')) ||
    fileName.replace(/\.gpx$/i, '')

  return {
    id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name,
    fileName,
    importedAt: Date.now(),
    points,
    distance,
    elevationGain: gain,
    elevationLoss: loss,
    start: { lat: first.lat, lng: first.lng },
    finish: { lat: last.lat, lng: last.lng },
    bounds: [
      [south, west],
      [north, east],
    ],
    hasElevation: points.some((p) => p.ele !== null),
    hasTimes: points.some((p) => p.time !== null),
  }
}
