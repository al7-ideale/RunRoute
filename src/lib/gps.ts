/**
 * GPS tracking.
 *
 * - Wraps navigator.geolocation.watchPosition (high accuracy).
 * - Smooths positions with a simple accuracy-weighted Kalman filter.
 * - Derives a coarse status: searching / good / weak / lost / denied …
 * - Optional simulated source (`?simulate[=speedup]`) for testing on desktop.
 */
import { destination, bearing, type LatLng } from './geo'
import { pointAtDistance, type RouteIndex } from './route'

export type GpsStatus =
  | 'idle'
  | 'searching'
  | 'good'
  | 'weak'
  | 'lost'
  | 'denied'
  | 'unavailable'
  | 'unsupported'

export interface GpsFix {
  /** Smoothed position. */
  lat: number
  lng: number
  /** Raw reported position. */
  rawLat: number
  rawLng: number
  /** Reported accuracy radius, metres (68 % confidence). */
  accuracy: number
  /** Degrees from north, when moving. */
  heading: number | null
  /** m/s, when available. */
  speed: number | null
  timestamp: number
}

export interface GpsSnapshot {
  status: GpsStatus
  fix: GpsFix | null
}

/** Accuracy (m) above which the signal is reported as weak. */
export const WEAK_ACCURACY = 25
/** No fix for this long (ms) → signal lost. */
const LOST_AFTER = 20000
/** Fixes worse than this (m) are not used for position. */
const REJECT_ACCURACY = 150

// ---------------------------------------------------------------------------
// Smoothing
// ---------------------------------------------------------------------------

/**
 * 1-D Kalman filter applied to lat/lng with measurement variance = accuracy².
 * `q` is expected movement noise in m/s (≈ runner speed).
 */
export class KalmanSmoother {
  private q: number
  private variance = -1
  private lat = 0
  private lng = 0
  private t = 0

  constructor(q = 3) {
    this.q = q
  }

  reset() {
    this.variance = -1
  }

  process(lat: number, lng: number, accuracy: number, t: number): LatLng {
    const acc = Math.max(accuracy, 1)
    if (this.variance < 0 || t - this.t > 30000) {
      this.lat = lat
      this.lng = lng
      this.variance = acc * acc
    } else {
      const dt = t - this.t
      if (dt > 0) this.variance += (dt * this.q * this.q) / 1000
      const k = this.variance / (this.variance + acc * acc)
      this.lat += k * (lat - this.lat)
      this.lng += k * (lng - this.lng)
      this.variance = (1 - k) * this.variance
    }
    this.t = t
    return { lat: this.lat, lng: this.lng }
  }
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface RawPosition {
  lat: number
  lng: number
  accuracy: number
  heading: number | null
  speed: number | null
  timestamp: number
}

export type SourceError = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

export interface PositionSource {
  start(onPosition: (p: RawPosition) => void, onError: (e: SourceError) => void): void
  stop(): void
}

export class BrowserPositionSource implements PositionSource {
  private watchId: number | null = null

  start(onPosition: (p: RawPosition) => void, onError: (e: SourceError) => void) {
    if (!('geolocation' in navigator)) {
      onError('unsupported')
      return
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords
        onPosition({
          lat: c.latitude,
          lng: c.longitude,
          accuracy: c.accuracy,
          heading: c.heading !== null && Number.isFinite(c.heading) ? c.heading : null,
          speed: c.speed !== null && Number.isFinite(c.speed) ? c.speed : null,
          timestamp: pos.timestamp || Date.now(),
        })
      },
      (err) => {
        onError(err.code === 1 ? 'denied' : err.code === 2 ? 'unavailable' : 'timeout')
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    )
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId)
    this.watchId = null
  }
}

/**
 * Replays the route at a given pace. Stays at the start until `run()`.
 * Optional off-route excursion for testing the warning.
 */
export class SimulatedPositionSource implements PositionSource {
  private index: RouteIndex
  private speed: number
  private offRouteAt: number | null
  private timer: ReturnType<typeof setInterval> | null = null
  private along = 0
  private running = false

  constructor(index: RouteIndex, opts: { speedup?: number; paceSecPerKm?: number; offRouteAt?: number | null } = {}) {
    this.index = index
    const pace = opts.paceSecPerKm ?? 345
    this.speed = (1000 / pace) * (opts.speedup ?? 1)
    this.offRouteAt = opts.offRouteAt ?? null
  }

  run(fromAlong = 0) {
    this.along = fromAlong
    this.running = true
  }

  start(onPosition: (p: RawPosition) => void) {
    const emit = () => {
      if (this.running) this.along = Math.min(this.index.total, this.along + this.speed)
      const p = pointAtDistance(this.index, this.along)
      const ahead = pointAtDistance(this.index, Math.min(this.index.total, this.along + 5))
      const hdg = bearing(p, ahead)
      let pos: LatLng = p
      // Off-route excursion: ramps out to ~130 m and back over ~600 m.
      if (this.offRouteAt !== null) {
        const k = (this.along - this.offRouteAt) / 600
        if (k > 0 && k < 1) pos = destination(p, hdg + 90, Math.sin(k * Math.PI) * 130)
      }
      const noise = () => (Math.random() - 0.5) * 6
      pos = destination(pos, Math.random() * 360, Math.abs(noise()))
      onPosition({
        lat: pos.lat,
        lng: pos.lng,
        accuracy: 5 + Math.random() * 4,
        heading: this.running ? hdg : null,
        speed: this.running ? this.speed : 0,
        timestamp: Date.now(),
      })
    }
    setTimeout(emit, 400)
    this.timer = setInterval(emit, 1000)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

type Listener = (s: GpsSnapshot) => void
type FixListener = (f: GpsFix) => void

export class GpsService {
  private source: PositionSource | null = null
  private smoother = new KalmanSmoother()
  private listeners = new Set<Listener>()
  private fixListeners = new Set<FixListener>()
  private watchdog: ReturnType<typeof setInterval> | null = null
  private lastFixAt = 0
  private snap: GpsSnapshot = { status: 'idle', fix: null }
  private createSource: () => PositionSource = () => new BrowserPositionSource()

  /** Replace the position source factory (used for simulation). */
  useSource(factory: () => PositionSource) {
    const wasRunning = this.source !== null
    this.stop()
    this.createSource = factory
    if (wasRunning) this.start()
  }

  get snapshot() {
    return this.snap
  }

  get activeSource() {
    return this.source
  }

  start() {
    if (this.source) return
    this.smoother.reset()
    this.set({ status: 'searching', fix: this.snap.fix })
    this.source = this.createSource()
    this.source.start(
      (p) => this.handlePosition(p),
      (e) => this.handleError(e),
    )
    this.watchdog = setInterval(() => {
      const s = this.snap.status
      if ((s === 'good' || s === 'weak') && Date.now() - this.lastFixAt > LOST_AFTER) {
        this.set({ ...this.snap, status: 'lost' })
      }
    }, 2000)
  }

  stop() {
    this.source?.stop()
    this.source = null
    if (this.watchdog) clearInterval(this.watchdog)
    this.watchdog = null
    this.set({ status: 'idle', fix: this.snap.fix })
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    fn(this.snap)
    return () => void this.listeners.delete(fn)
  }

  onFix(fn: FixListener) {
    this.fixListeners.add(fn)
    return () => void this.fixListeners.delete(fn)
  }

  private handlePosition(p: RawPosition) {
    this.lastFixAt = Date.now()
    const status: GpsStatus = p.accuracy <= WEAK_ACCURACY ? 'good' : 'weak'
    if (p.accuracy > REJECT_ACCURACY) {
      this.set({ status: 'weak', fix: this.snap.fix })
      return
    }
    const s = this.smoother.process(p.lat, p.lng, p.accuracy, p.timestamp)
    const fix: GpsFix = {
      lat: s.lat,
      lng: s.lng,
      rawLat: p.lat,
      rawLng: p.lng,
      accuracy: p.accuracy,
      heading: p.heading,
      speed: p.speed,
      timestamp: p.timestamp,
    }
    this.set({ status, fix })
    this.fixListeners.forEach((fn) => fn(fix))
  }

  private handleError(e: SourceError) {
    if (e === 'denied' || e === 'unsupported') {
      this.source?.stop()
      this.source = null
      this.set({ status: e, fix: this.snap.fix })
      return
    }
    // Transient errors: keep watching.
    const hadFix = this.lastFixAt > 0
    if (e === 'unavailable') this.set({ ...this.snap, status: hadFix ? 'lost' : 'unavailable' })
    else this.set({ ...this.snap, status: hadFix ? 'lost' : 'searching' })
  }

  private set(s: GpsSnapshot) {
    this.snap = s
    this.listeners.forEach((fn) => fn(s))
  }
}

/** App-wide GPS service (one watchPosition shared by setup + race). */
export const gps = new GpsService()

/** Parse `?simulate[=speedup]&offroute=<m>` from the URL. */
export function simulationParams(): { speedup: number; offRouteAt: number | null } | null {
  const q = new URLSearchParams(location.search)
  if (!q.has('simulate')) return null
  const speedup = parseFloat(q.get('simulate') || '1')
  const off = q.get('offroute')
  return {
    speedup: Number.isFinite(speedup) && speedup > 0 ? speedup : 1,
    offRouteAt: off ? parseFloat(off) : null,
  }
}
