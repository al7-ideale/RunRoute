/**
 * Route progress: turns a stream of (smoothed) positions into
 * distance completed / remaining along the GPX route.
 */
import type { LatLng } from './geo'
import { matchToRoute, type RouteIndex } from './route'

export interface ProgressState {
  /** Raw matched distance along route, metres. */
  along: number
  /** Displayed distance completed (jitter-free), metres. */
  completed: number
  remaining: number
  /** 0..1 */
  fraction: number
  /** Distance from the route, metres. */
  offset: number
  /** Closest point on the route. */
  nearest: LatLng
  /** Runner has reached the finish. */
  finished: boolean
}

/** Max plausible running speed (m/s) used to widen the search window. */
const MAX_SPEED = 7
/** Backward GPS jitter (m) that should not reduce the displayed distance. */
const BACK_JITTER = 30
/** Finish is reached within this distance (m) of the end of the route. */
const FINISH_RADIUS = 30
const FINISH_MAX_OFFSET = 60

export class ProgressTracker {
  private index: RouteIndex
  private lastAlong: number
  private maxAlong: number
  private lastT: number | null = null
  private reacquireCount = 0

  constructor(index: RouteIndex, initialAlong = 0) {
    this.index = index
    this.lastAlong = initialAlong
    this.maxAlong = initialAlong
  }

  get furthest() {
    return this.maxAlong
  }

  update(p: LatLng, t: number): ProgressState {
    const total = this.index.total
    const dt = this.lastT === null ? 0 : Math.max(0, (t - this.lastT) / 1000)
    this.lastT = t

    const slack = 150 + MAX_SPEED * Math.min(dt, 120)
    let m = matchToRoute(this.index, p, { expected: this.lastAlong, slack })

    // If we're clearly away from the expected section but right on another
    // part of the course for several fixes, re-acquire there (e.g. GPS was
    // lost for a long stretch, or the app was reopened mid-race).
    if (m.offset > 120) {
      const g = matchToRoute(this.index, p)
      if (g.offset < 40 && Math.abs(g.along - m.along) > slack) {
        if (++this.reacquireCount >= 3) {
          m = g
          this.reacquireCount = 0
        }
      } else this.reacquireCount = 0
    } else this.reacquireCount = 0

    this.lastAlong = m.along

    let completed: number
    if (m.along >= this.maxAlong - BACK_JITTER) {
      this.maxAlong = Math.max(this.maxAlong, m.along)
      completed = this.maxAlong
    } else {
      completed = m.along // genuinely going backwards
    }

    const finished = total - m.along <= FINISH_RADIUS && m.offset <= FINISH_MAX_OFFSET
    if (finished) completed = total

    return {
      along: m.along,
      completed,
      remaining: Math.max(0, total - completed),
      fraction: total > 0 ? Math.min(1, completed / total) : 0,
      offset: m.offset,
      nearest: m.point,
      finished,
    }
  }
}
