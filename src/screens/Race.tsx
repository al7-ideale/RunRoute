import { useCallback, useEffect, useRef, useState } from 'react'
import type { RouteIndex } from '../lib/route'
import type { ActiveSession } from '../lib/db'
import { duration, km, pace } from '../lib/format'
import { useRace, type RaceFinish } from '../hooks/useRace'
import { useWakeLock } from '../hooks/useWakeLock'
import { useOnline } from '../hooks/useStatus'
import { RouteMap } from '../components/RouteMap'
import { Row, Sheet, TextButton } from '../components/ui'

interface Props {
  index: RouteIndex
  session: ActiveSession
  resumed: boolean
  onFinish: (r: RaceFinish) => void
}

/** Auto-follow resumes this long after the user last moved the map. */
const FOLLOW_RESUME_MS = 30000

export function Race({ index, session, resumed, onFinish }: Props) {
  const race = useRace(index, session, onFinish)
  const wake = useWakeLock(true)
  const online = useOnline()
  const [follow, setFollow] = useState(true)
  const [recenterKey, setRecenterKey] = useState(0)
  const [info, setInfo] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(resumed ? 'Race resumed' : null)
  const [mapOffline, setMapOffline] = useState(false)
  const followTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { progress, routeStatus, fix, gpsStatus } = race
  const completed = progress?.completed ?? session.furthest
  const remaining = progress?.remaining ?? index.total - session.furthest

  // Transient notices.
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4500)
    return () => clearTimeout(t)
  }, [notice])

  useEffect(() => {
    if (wake === 'unsupported' || wake === 'denied') setNotice('Screen may sleep · keep it on')
  }, [wake])

  const onTileError = useCallback(() => {
    if (!navigator.onLine) setMapOffline(true)
  }, [])
  useEffect(() => {
    if (mapOffline) setNotice('Base map offline · route still shown')
  }, [mapOffline])

  const onUserPan = useCallback(() => {
    setFollow(false)
    if (followTimer.current) clearTimeout(followTimer.current)
    followTimer.current = setTimeout(() => setFollow(true), FOLLOW_RESUME_MS)
  }, [])
  useEffect(() => () => void (followTimer.current && clearTimeout(followTimer.current)), [])

  const recenter = () => {
    if (followTimer.current) clearTimeout(followTimer.current)
    setFollow(true)
    setRecenterKey((k) => k + 1)
  }

  const endRun = () => {
    onFinish({ distance: race.furthest(), elapsedMs: race.elapsedMs, completed: false })
  }

  // Persistent GPS problems take priority over transient notices.
  const gpsProblem =
    gpsStatus === 'denied'
      ? 'Location access denied'
      : gpsStatus === 'unsupported'
        ? 'GPS not supported'
        : gpsStatus === 'unavailable'
          ? 'GPS unavailable'
          : gpsStatus === 'lost'
            ? 'GPS signal lost'
            : gpsStatus === 'searching' && !fix
              ? 'Finding GPS…'
              : null
  const banner = gpsProblem ?? notice

  const avgPace = completed > 50 ? race.elapsedMs / completed : null // s/km == ms/m
  const eta = avgPace ? race.elapsedMs + remaining * avgPace : null

  return (
    <main className="relative h-dvh overflow-hidden bg-ink select-none">
      <RouteMap
        index={index}
        mode="race"
        fix={fix}
        completed={completed}
        nearest={progress?.nearest}
        offRoute={routeStatus === 'off'}
        follow={follow}
        recenterKey={recenterKey}
        onUserPan={onUserPan}
        onTileError={onTileError}
        className="race-map absolute inset-0"
      />

      {/* Top: distance / remaining — or the off-route warning. */}
      <header
        className={`absolute inset-x-0 top-0 z-[1000] pt-[env(safe-area-inset-top)] transition-colors duration-300 ${
          routeStatus === 'off' ? 'bg-danger' : routeStatus === 'returned' ? 'bg-ok' : 'bg-ink/88 backdrop-blur-md'
        }`}
      >
        {routeStatus === 'on' ? (
          <button type="button" onClick={() => setInfo(true)} className="flex w-full items-end justify-between px-5 pb-3.5 pt-3 text-left" aria-label="Race details">
            <div className="text-[3.25rem] font-semibold leading-[0.95] tracking-tight tabular-nums">
              {km(completed)}
              <span className="ml-1.5 text-[1.25rem] font-medium text-muted">km</span>
            </div>
            <div className="pb-1 text-right text-[0.9375rem] leading-tight text-muted">
              <span className="font-semibold text-fg tabular-nums">{km(remaining)} km</span>
              <br />
              remaining
            </div>
          </button>
        ) : routeStatus === 'off' ? (
          <div role="alert" className="px-5 pb-4 pt-3 text-white">
            <div className="text-[2.5rem] font-bold leading-none tracking-[0.04em]">OFF ROUTE</div>
            <div className="mt-1.5 text-[1.125rem] font-medium tabular-nums opacity-90">
              {Math.round(progress?.offset ?? 0)} m from route
            </div>
          </div>
        ) : (
          <div role="status" className="px-5 pb-4 pt-3 text-ink">
            <div className="text-[2.5rem] font-bold leading-none tracking-[0.04em]">ON ROUTE</div>
            <div className="mt-1.5 text-[1.125rem] font-medium tabular-nums opacity-80">{km(remaining)} km remaining</div>
          </div>
        )}
        <div className="h-0.5 bg-white/8" aria-hidden>
          <div className="h-full bg-accent transition-[width] duration-700" style={{ width: `${(progress?.fraction ?? 0) * 100}%` }} />
        </div>
      </header>

      {banner && (
        <div className="pointer-events-none absolute inset-x-0 z-[1000] flex justify-center" style={{ top: 'calc(env(safe-area-inset-top) + 6.5rem)' }}>
          <p
            role="status"
            className={`rounded-full px-4 py-2 text-[0.875rem] font-medium shadow-lg ${
              gpsProblem && gpsStatus !== 'searching' ? 'bg-danger text-white' : 'bg-ink/90 text-fg'
            }`}
          >
            {banner}
          </p>
        </div>
      )}


      {/* End Run */}
      <button
        type="button"
        onClick={() => setEndOpen(true)}
        aria-label="End run"
        className="absolute left-4 z-[1000] flex h-14 items-center justify-center gap-2 rounded-full bg-ink/88 px-5 text-fg shadow-lg backdrop-blur-md transition active:scale-95"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.25rem)' }}
      >
        <svg viewBox="0 0 24 24" className="size-4 text-danger" fill="currentColor">
          <rect x="5" y="5" width="14" height="14" rx="2" />
        </svg>
        <span className="text-[0.9375rem] font-semibold text-danger">End</span>
      </button>

      {/* Re-centre */}
      <button
        type="button"
        onClick={recenter}
        aria-label="Re-center"
        className={`absolute right-4 z-[1000] flex h-14 items-center justify-center gap-2 rounded-full shadow-lg transition active:scale-95 ${
          follow ? 'w-14 bg-ink/88 text-fg backdrop-blur-md' : 'bg-accent px-5 text-ink'
        }`}
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.25rem)' }}
      >
        <span className="text-[1.375rem] leading-none" aria-hidden>
          ◎
        </span>
        {!follow && <span className="text-[0.9375rem] font-semibold">Re-center</span>}
      </button>

      {/* Bottom: pace • elapsed, GPS state */}
      <footer className="absolute inset-x-0 bottom-0 z-[1000] bg-ink/88 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <button type="button" onClick={() => setInfo(true)} className="flex h-[4.25rem] w-full items-center justify-between px-5 text-left" aria-label="Race details">
          <span className="text-[1.625rem] font-semibold tracking-tight tabular-nums">
            {pace(race.pace)}
            <span className="ml-1 text-[0.9375rem] font-medium text-muted">/km</span>
            <span className="mx-3 text-dim">•</span>
            {duration(race.elapsedMs)}
          </span>
          <GpsBadge status={gpsStatus} accuracy={fix?.accuracy} />
        </button>
      </footer>

            <Sheet open={info} onClose={() => setInfo(false)} label="Race details">
        <Row label="Average pace" value={<>{pace(avgPace)} <span className="text-muted">/km</span></>} />
        <Row label="Estimated finish" value={eta ? duration(eta) : '—'} />
        <Row label="Completed" value={`${Math.round((progress?.fraction ?? completed / index.total) * 100)} %`} />
        <Row label="GPS accuracy" value={fix ? `±${Math.round(fix.accuracy)} m` : '—'} />
        <Row label="Screen" value={wake === 'active' ? 'Kept awake' : wake === 'pending' ? '…' : 'May sleep'} />
        <Row label="Base map" value={mapOffline || !online ? 'Offline cache' : 'Online'} />
        <div className="mt-5">
          <TextButton onClick={() => setInfo(false)}>Close</TextButton>
        </div>
      </Sheet>

      <Sheet open={endOpen} onClose={() => setEndOpen(false)} label="End run">
        <h2 className="text-[1.25rem] font-semibold">End this run?</h2>
        <p className="mt-2 text-[0.9375rem] text-muted">You have completed {km(completed)} km. This will finish your current session.</p>
        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={endRun}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-danger/10 text-[1.0625rem] font-semibold text-danger active:bg-danger/20 transition-colors"
          >
            End run
          </button>
          <TextButton onClick={() => setEndOpen(false)}>Cancel</TextButton>
        </div>
      </Sheet>
    </main>
  )
}

function GpsBadge({ status, accuracy }: { status: string; accuracy?: number }) {
  if (status === 'good')
    return (
      <span className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-muted tabular-nums">
        GPS <span className="size-2 rounded-full bg-ok" aria-hidden />
        {accuracy !== undefined && <span className="text-dim">±{Math.round(accuracy)} m</span>}
      </span>
    )
  if (status === 'weak')
    return <span className="text-[0.8125rem] font-semibold text-warn">GPS Weak</span>
  if (status === 'searching' || status === 'idle')
    return (
      <span className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-muted">
        GPS <span className="size-2 animate-pulse rounded-full bg-warn" aria-hidden />
      </span>
    )
  return <span className="text-[0.8125rem] font-semibold text-danger">GPS ✕</span>
}
