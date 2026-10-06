/**
 * Race state: GPS fixes → route progress → off-route status → UI state.
 */
import { useEffect, useRef, useState } from 'react'
import { gps, type GpsFix, type GpsStatus } from '../lib/gps'
import { OffRouteDetector, type RouteStatus } from '../lib/offRoute'
import { PaceMeter } from '../lib/pace'
import { ProgressTracker, type ProgressState } from '../lib/progress'
import type { RouteIndex } from '../lib/route'
import { saveSession, type ActiveSession } from '../lib/db'

export interface RaceState {
  fix: GpsFix | null
  gpsStatus: GpsStatus
  progress: ProgressState | null
  routeStatus: RouteStatus
  pace: number | null
  elapsedMs: number
}

export interface RaceFinish {
  distance: number
  elapsedMs: number
  completed: boolean
}

export function useRace(
  index: RouteIndex,
  session: ActiveSession,
  onFinish: (r: RaceFinish) => void,
): RaceState & { furthest: () => number } {
  const tracker = useRef<ProgressTracker>(null as unknown as ProgressTracker)
  const detector = useRef(new OffRouteDetector())
  const pacer = useRef(new PaceMeter())
  const finished = useRef(false)
  const lastSaved = useRef({ t: 0, d: session.furthest })
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  if (!tracker.current) tracker.current = new ProgressTracker(index, session.furthest)

  const [state, setState] = useState<RaceState>(() => ({
    fix: gps.snapshot.fix,
    gpsStatus: gps.snapshot.status,
    progress: null,
    routeStatus: 'on',
    pace: null,
    elapsedMs: Date.now() - session.startedAt,
  }))

  // GPS fixes → progress
  useEffect(() => {
    gps.start()
    const offStatus = gps.subscribe((s) => setState((prev) => ({ ...prev, gpsStatus: s.status })))
    const offFix = gps.onFix((fix) => {
      if (finished.current) return
      const now = Date.now()
      const progress = tracker.current.update(fix, fix.timestamp)
      const routeStatus = detector.current.update(progress.offset, fix.accuracy, now)
      pacer.current.push(fix, fix.timestamp)
      setState((prev) => ({
        ...prev,
        fix,
        progress,
        routeStatus,
        pace: pacer.current.paceSecPerKm(now),
        elapsedMs: now - session.startedAt,
      }))

      // Persist progress so a reload/crash resumes the race.
      const furthest = tracker.current.furthest
      if (now - lastSaved.current.t > 10000 || furthest - lastSaved.current.d > 100) {
        lastSaved.current = { t: now, d: furthest }
        void saveSession({ ...session, furthest, updatedAt: now })
      }

      if (progress.finished && !finished.current) {
        finished.current = true
        onFinishRef.current({ distance: index.total, elapsedMs: now - session.startedAt, completed: true })
      }
    })
    return () => {
      offStatus()
      offFix()
    }
  }, [index, session])

  // 1 Hz clock: elapsed time, ON ROUTE expiry, stale pace.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now()
      setState((prev) => ({
        ...prev,
        elapsedMs: now - session.startedAt,
        routeStatus: detector.current.tick(now),
        pace: pacer.current.paceSecPerKm(now),
      }))
    }, 1000)
    return () => clearInterval(id)
  }, [session])

  return { ...state, furthest: () => tracker.current.furthest }
}
