/**
 * Off-route detection with hysteresis so GPS noise never triggers a warning.
 *
 *   on ──(offset > offThreshold for ≥ minDuration and ≥ minFixes)──▶ off
 *   off ──(offset < onThreshold for ≥ 2 fixes)──▶ returned ──(4 s)──▶ on
 *
 * Thresholds widen with reported GPS accuracy; very inaccurate fixes are
 * ignored entirely.
 */

export type RouteStatus = 'on' | 'off' | 'returned'

export interface OffRouteOptions {
  offMeters: number
  onMeters: number
  minDurationMs: number
  minFixes: number
  /** Fixes with worse accuracy (m) are ignored for decisions. */
  maxAccuracy: number
  /** How long "ON ROUTE" stays visible after returning. */
  returnedDisplayMs: number
}

export const DEFAULT_OFF_ROUTE: OffRouteOptions = {
  offMeters: 45,
  onMeters: 25,
  minDurationMs: 6000,
  minFixes: 3,
  maxAccuracy: 60,
  returnedDisplayMs: 4000,
}

export class OffRouteDetector {
  private o: OffRouteOptions
  private state: RouteStatus = 'on'
  private candidateSince: number | null = null
  private candidateFixes = 0
  private returnFixes = 0
  private returnedAt = 0

  constructor(opts: Partial<OffRouteOptions> = {}) {
    this.o = { ...DEFAULT_OFF_ROUTE, ...opts }
  }

  thresholds(accuracy: number) {
    const acc = Math.min(Math.max(accuracy, 0), this.o.maxAccuracy)
    return {
      off: Math.max(this.o.offMeters, acc + 20),
      on: Math.max(this.o.onMeters, acc * 0.75),
    }
  }

  update(offset: number, accuracy: number, t: number): RouteStatus {
    this.tick(t)
    if (accuracy > this.o.maxAccuracy) return this.state

    const th = this.thresholds(accuracy)
    if (this.state === 'off') {
      if (offset < th.on) {
        if (++this.returnFixes >= 2) {
          this.state = 'returned'
          this.returnedAt = t
          this.reset()
        }
      } else this.returnFixes = 0
      return this.state
    }

    // 'on' or 'returned'
    if (offset > th.off) {
      if (this.candidateSince === null) this.candidateSince = t
      this.candidateFixes++
      if (t - this.candidateSince >= this.o.minDurationMs && this.candidateFixes >= this.o.minFixes) {
        this.state = 'off'
        this.reset()
      }
    } else {
      this.candidateSince = null
      this.candidateFixes = 0
    }
    return this.state
  }

  /** Advance time-based transitions (returned → on). */
  tick(t: number): RouteStatus {
    if (this.state === 'returned' && t - this.returnedAt >= this.o.returnedDisplayMs) {
      this.state = 'on'
    }
    return this.state
  }

  get status() {
    return this.state
  }

  private reset() {
    this.candidateSince = null
    this.candidateFixes = 0
    this.returnFixes = 0
  }
}
