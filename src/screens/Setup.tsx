import { useEffect, useMemo, useRef, useState } from 'react'
import type { RouteData } from '../lib/gpx'
import type { RouteIndex } from '../lib/route'
import { km } from '../lib/format'
import { loadTileStatus, saveTileStatus } from '../lib/db'
import { waitForOfflineReady } from '../lib/pwa'
import {
  AVG_TILE_BYTES,
  cacheSupported,
  countCached,
  downloadTiles,
  tilesForRoute,
  type DownloadProgress,
} from '../lib/tiles'
import type { GpsStatus } from '../lib/gps'
import { useGps, useOnline } from '../hooks/useStatus'
import { RouteMap } from '../components/RouteMap'
import { PrimaryButton, TextButton, Status, type Tone } from '../components/ui'

interface Props {
  route: RouteData
  index: RouteIndex
  onBack: () => void
  onChangeRoute: () => void
  onStart: () => void
}

const GPS_LABEL: Record<GpsStatus, [Tone, string]> = {
  idle: ['idle', 'GPS'],
  searching: ['warn', 'GPS Searching'],
  good: ['ok', 'GPS Ready'],
  weak: ['warn', 'GPS Weak'],
  lost: ['warn', 'GPS signal lost'],
  denied: ['bad', 'Location denied'],
  unavailable: ['bad', 'GPS unavailable'],
  unsupported: ['bad', 'No GPS'],
}

type MapState =
  | { kind: 'checking' }
  | { kind: 'saved' }
  | { kind: 'missing'; total: number; cached: number }
  | { kind: 'downloading'; p: DownloadProgress }
  | { kind: 'unsupported' }

export function Setup({ route, index, onBack, onChangeRoute, onStart }: Props) {
  const gps = useGps(true)
  const online = useOnline()
  const [offlineReady, setOfflineReady] = useState<boolean | null>(null)
  const [mapState, setMapState] = useState<MapState>({ kind: 'checking' })
  const abort = useRef<AbortController | null>(null)
  const tiles = useMemo(() => tilesForRoute(route), [route])

  useEffect(() => {
    let alive = true
    waitForOfflineReady().then((r) => alive && setOfflineReady(r))
    return () => {
      alive = false
    }
  }, [])

  const saveMap = async () => {
    const ctrl = new AbortController()
    abort.current = ctrl
    setMapState({ kind: 'downloading', p: { done: 0, total: tiles.length, failed: 0, bytes: 0 } })
    const res = await downloadTiles(tiles, (p) => setMapState({ kind: 'downloading', p }), ctrl.signal)
    if (ctrl.signal.aborted) return
    const cached = res.total - res.failed
    await saveTileStatus({ routeId: route.id, total: res.total, cached, bytes: res.bytes, savedAt: Date.now() })
    setMapState(cached >= res.total * 0.97 ? { kind: 'saved' } : { kind: 'missing', total: res.total, cached })
  }

  // Base map cache status: verify, and automatically download if missing.
  useEffect(() => {
    if (!cacheSupported()) return setMapState({ kind: 'unsupported' })
    let alive = true
    ;(async () => {
      const saved = await loadTileStatus(route.id)
      if (saved && saved.cached >= saved.total * 0.97 && alive) return setMapState({ kind: 'saved' })
      const cached = await countCached(tiles)
      if (!alive) return
      
      if (cached >= tiles.length * 0.97) {
        setMapState({ kind: 'saved' })
      } else {
        // Automatically start downloading missing tiles
        saveMap()
      }
    })()
    return () => {
      alive = false
      abort.current?.abort()
    }
  }, [route.id, tiles])

  const [gpsTone, gpsText] = GPS_LABEL[gps.status]
  const mb = Math.max(1, Math.round((tiles.length * AVG_TILE_BYTES) / 1e6))

  return (
    <main className="flex h-dvh flex-col pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-[env(safe-area-inset-top)]">
      <header className="flex h-14 items-center px-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex size-12 items-center justify-center rounded-full text-muted active:bg-surface"
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span className="ml-1 truncate text-[0.9375rem] text-muted">{route.name}</span>
      </header>

      <section className="px-6 pt-2">
        <div className="text-[3.25rem] font-semibold leading-none tracking-tight tabular-nums">
          {km(route.distance, 2)}
          <span className="ml-2 text-[1.375rem] font-medium text-muted">km</span>
        </div>
        <p className="mt-2 text-[0.9375rem] text-muted tabular-nums">
          {route.hasElevation ? `+${Math.round(route.elevationGain)} m elevation` : 'No elevation data'}
        </p>
      </section>

      <div className="relative mx-4 mt-6 min-h-0 flex-1 overflow-hidden rounded-2xl bg-surface">
        <RouteMap index={index} mode="preview" fix={gps.fix} className="absolute inset-0" />
      </div>

      <section className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-6 pt-5">
        <Status tone={gpsTone} pulse={gps.status === 'searching'}>
          {gpsText}
        </Status>
        <Status tone={offlineReady ? 'ok' : 'idle'} pulse={offlineReady === null}>
          {offlineReady ? 'Offline Ready ✓' : offlineReady === null ? 'Preparing offline' : 'Offline unavailable'}
        </Status>
        <Status tone="ok">Route Loaded</Status>
        <MapStatus state={mapState} online={online} mb={mb} onSave={saveMap} />
      </section>

      <div className="px-6 pt-6 pb-4 space-y-2">
        <PrimaryButton onClick={onStart} className="uppercase tracking-[0.12em]">
          Start race
        </PrimaryButton>
        <TextButton onClick={onChangeRoute} className="text-muted font-medium">
          Choose a different route
        </TextButton>
      </div>
    </main>
  )
}

function MapStatus({ state, online, mb, onSave }: { state: MapState; online: boolean; mb: number; onSave: () => void }) {
  switch (state.kind) {
    case 'checking':
      return <Status tone="idle">Map</Status>
    case 'saved':
      return <Status tone="ok">Map Offline</Status>
    case 'unsupported':
      return <Status tone="warn">Map needs connection</Status>
    case 'downloading': {
      const pct = Math.floor((state.p.done / Math.max(1, state.p.total)) * 100)
      return (
        <Status tone="warn" pulse>
          Saving map {pct}%
        </Status>
      )
    }
    case 'missing':
      if (!online) return <Status tone="warn">Map needs connection</Status>
      return (
        <button
          type="button"
          onClick={onSave}
          className="-my-2 -ml-1 inline-flex items-center gap-2 rounded-lg py-2 pl-1 text-left text-[0.8125rem] font-medium text-accent active:opacity-70"
        >
          <span className="size-1.5 rounded-full bg-accent" aria-hidden />
          Save map offline · {mb} MB
        </button>
      )
  }
}
