/**
 * Current pace from a rolling window of smoothed positions.
 */
import { haversine, type LatLng } from './geo'

interface Sample {
  p: LatLng
  t: number
}

/** Below this speed (m/s) the runner is considered stopped. */
const MIN_SPEED = 0.8
/** Segments implying more than this speed (m/s) are GPS spikes. */
const MAX_SPEED = 9

export class PaceMeter {
  private samples: Sample[] = []
  private windowMs: number

  constructor(windowMs = 25000) {
    this.windowMs = windowMs
  }

  push(p: LatLng, t: number) {
    this.samples.push({ p, t })
    const cutoff = t - this.windowMs
    while (this.samples.length > 2 && this.samples[0].t < cutoff) this.samples.shift()
  }

  /** Seconds per km, or null if unknown / stopped. */
  paceSecPerKm(now = Date.now()): number | null {
    const s = this.samples
    if (s.length < 3) return null
    if (now - s[s.length - 1].t > 10000) return null // stale
    let dist = 0
    let time = 0
    for (let i = 1; i < s.length; i++) {
      const dt = (s[i].t - s[i - 1].t) / 1000
      if (dt <= 0) continue
      const d = haversine(s[i - 1].p, s[i].p)
      if (d / dt > MAX_SPEED) continue
      dist += d
      time += dt
    }
    if (time < 8) return null
    const speed = dist / time
    if (speed < MIN_SPEED) return null
    return 1000 / speed
  }
}
