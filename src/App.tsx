import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GpxError, parseGpx, type RouteData } from './lib/gpx'
import { buildRouteIndex } from './lib/route'
import {
  clearSession,
  deleteCurrentRoute,
  loadCurrentRoute,
  loadSession,
  saveRoute,
  saveRun,
  saveSession,
  type ActiveSession,
} from './lib/db'
import { capabilities, requestPersistentStorage } from './lib/pwa'
import { gps, simulationParams, SimulatedPositionSource } from './lib/gps'
import type { RaceFinish } from './hooks/useRace'
import { Home } from './screens/Home'
import { Setup } from './screens/Setup'
import { Race } from './screens/Race'
import { Complete } from './screens/Complete'
import { InstallPrompt } from './components/InstallPrompt'

type Screen =
  | { name: 'boot' }
  | { name: 'unsupported'; missing: string[] }
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'race'; session: ActiveSession; resumed: boolean }
  | { name: 'complete'; result: RaceFinish }

const GPX_ACCEPT = '.gpx,application/gpx+xml,application/xml,text/xml,application/octet-stream'

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'boot' })
  const [route, setRoute] = useState<RouteData | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const index = useMemo(() => (route ? buildRouteIndex(route) : null), [route])

  // Boot: capability check → restore saved route (and an in-progress race).
  useEffect(() => {
    const caps = capabilities()
    const missing = [!caps.geolocation && 'Location', !caps.indexedDB && 'Storage'].filter(Boolean) as string[]
    if (missing.length) return setScreen({ name: 'unsupported', missing })
    ;(async () => {
      try {
        const r = await loadCurrentRoute()
        setRoute(r)
        const s = r ? await loadSession() : null
        if (r && s && s.routeId === r.id) setScreen({ name: 'race', session: s, resumed: true })
        else setScreen({ name: 'home' })
      } catch {
        setScreen({ name: 'home' })
      }
    })()
  }, [])

  // Optional simulated GPS for desktop testing: ?simulate[=speedup]&offroute=m
  useEffect(() => {
    const sim = simulationParams()
    if (sim && index) gps.useSource(() => new SimulatedPositionSource(index, sim))
  }, [index])

  // GPS only runs on setup + race.
  useEffect(() => {
    if (screen.name !== 'setup' && screen.name !== 'race') gps.stop()
  }, [screen.name])

  const pickFile = () => {
    setImportError(null)
    fileInput.current?.click()
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setImportError(null)
    try {
      const parsed = parseGpx(await file.text(), file.name)
      await saveRoute(parsed)
      await clearSession()
      void requestPersistentStorage()
      setRoute(parsed)
      setScreen({ name: 'setup' })
    } catch (e) {
      setImportError(e instanceof GpxError ? e.message : 'Couldn’t read this file')
      setScreen({ name: 'home' })
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }


  const onPredefined = async (url: string, name: string) => {
    setBusy(true)
    setImportError(null)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch route')
      const xml = await res.text()
      const parsed = parseGpx(xml, name)
      await saveRoute(parsed)
      await clearSession()
      void requestPersistentStorage()
      setRoute(parsed)
      setScreen({ name: 'setup' })
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Couldn’t load this route')
      setScreen({ name: 'home' })
    } finally {
      setBusy(false)
    }
  }

  const startRace = async () => {
    if (!route) return
    const session: ActiveSession = { routeId: route.id, startedAt: Date.now(), furthest: 0, updatedAt: Date.now() }
    await saveSession(session)
    const src = gps.activeSource
    if (src instanceof SimulatedPositionSource) src.run(0)
    setScreen({ name: 'race', session, resumed: false })
  }

  // Simulation: resume moving after reload mid-race.
  useEffect(() => {
    if (screen.name === 'race' && screen.resumed) {
      gps.start()
      const src = gps.activeSource
      if (src instanceof SimulatedPositionSource) src.run(screen.session.furthest)
    }
  }, [screen])

  const finish = useCallback(async (result: RaceFinish) => {
    await clearSession()
    setScreen({ name: 'complete', result })
  }, [])

  const deleteRoute = async () => {
    await deleteCurrentRoute()
    setRoute(null)
  }

  let content: React.ReactNode = null
  switch (screen.name) {
    case 'boot':
      content = <main className="h-dvh" />
      break
    case 'unsupported':
      content = (
        <main className="flex h-dvh flex-col justify-center px-7">
          <h1 className="text-[1.75rem] font-semibold tracking-tight">RunRoute</h1>
          <p className="mt-3 text-[1.0625rem]">This browser can’t run RunRoute.</p>
          <p className="mt-1 text-[0.9375rem] text-muted">Missing: {screen.missing.join(', ')}</p>
        </main>
      )
      break
    case 'home':
      content = (
        <Home
          route={route}
          importError={importError}
          busy={busy}
          onImport={pickFile}
          onImportPredefined={onPredefined}
          onStart={() => setScreen({ name: 'setup' })}
          onDelete={deleteRoute}
        />
      )
      break
    case 'setup':
      content =
        route && index ? (
          <Setup route={route} index={index} onBack={() => setScreen({ name: 'home' })} onChangeRoute={() => { deleteRoute(); setScreen({ name: 'home' }); }} onStart={startRace} />
        ) : null
      break
    case 'race':
      content = index ? (
        <Race key={screen.session.startedAt} index={index} session={screen.session} resumed={screen.resumed} onFinish={finish} />
      ) : null
      break
    case 'complete':
      content = (
        <Complete
          result={screen.result}
          onSave={async () => {
            if (!route) return
            await saveRun({
              routeId: route.id,
              routeName: route.name,
              date: Date.now(),
              distance: screen.result.distance,
              elapsedMs: screen.result.elapsedMs,
              completed: screen.result.completed,
            })
          }}
          onDone={() => setScreen({ name: 'home' })}
        />
      )
      break
  }

  return (
    <>
      {content}
      <input
        ref={fileInput}
        type="file"
        accept={GPX_ACCEPT}
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <InstallPrompt />
    </>
  )
}
