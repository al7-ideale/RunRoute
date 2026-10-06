import { useEffect, useState } from 'react'
import type { RouteData } from '../lib/gpx'
import { listRuns, type RunResult } from '../lib/db'
import { duration, km, pace, shortDate } from '../lib/format'
import { RouteShape } from '../components/RouteShape'
import { PrimaryButton, Sheet, TextButton } from '../components/ui'

interface Props {
  route: RouteData | null
  importError: string | null
  busy: boolean
  onImport: () => void
  onImportPredefined: (url: string, name: string) => void
  onStart: () => void
  onDelete: () => void
}






function EmptyStateGraphic() {
  return (
    <div className="relative flex aspect-square h-full max-h-56 items-center justify-center text-fg">
      <div className="absolute inset-0 flex items-center justify-center">
         <div className="size-48 rounded-full border border-fg/5"></div>
      </div>
      
      <svg viewBox="0 0 100 100" className="relative size-full max-w-[120px] text-accent mt-2">
        <style>
          {`
            @keyframes run-hip {
              0%, 50%, 100% { transform: translateY(0) rotate(10deg); }
              25%, 75% { transform: translateY(-4px) rotate(10deg); }
            }
            @keyframes run-arm-r {
              0% { transform: rotate(45deg); }
              50% { transform: rotate(-45deg); }
              100% { transform: rotate(45deg); }
            }
            @keyframes run-arm-l {
              0% { transform: rotate(-45deg); }
              50% { transform: rotate(45deg); }
              100% { transform: rotate(-45deg); }
            }
            @keyframes run-leg-r {
              0% { transform: rotate(-35deg); }
              50% { transform: rotate(45deg); }
              100% { transform: rotate(-35deg); }
            }
            @keyframes run-leg-l {
              0% { transform: rotate(45deg); }
              50% { transform: rotate(-35deg); }
              100% { transform: rotate(45deg); }
            }
            @keyframes run-knee-r {
              0% { transform: rotate(5deg); }
              25% { transform: rotate(5deg); }
              50% { transform: rotate(40deg); }
              75% { transform: rotate(110deg); }
              100% { transform: rotate(5deg); }
            }
            @keyframes run-knee-l {
              0% { transform: rotate(40deg); }
              25% { transform: rotate(110deg); }
              50% { transform: rotate(5deg); }
              75% { transform: rotate(5deg); }
              100% { transform: rotate(40deg); }
            }
            .hip { animation: run-hip 0.8s linear infinite; transform-origin: 50px 45px; }
            .arm-r { animation: run-arm-r 0.8s ease-in-out infinite; transform-origin: 50px 22px; }
            .arm-l { animation: run-arm-l 0.8s ease-in-out infinite; transform-origin: 50px 22px; }
            .leg-r { animation: run-leg-r 0.8s ease-in-out infinite; transform-origin: 50px 45px; }
            .leg-l { animation: run-leg-l 0.8s ease-in-out infinite; transform-origin: 50px 45px; }
            .knee-r { animation: run-knee-r 0.8s ease-in-out infinite; transform-origin: 50px 65px; }
            .knee-l { animation: run-knee-l 0.8s ease-in-out infinite; transform-origin: 50px 65px; }
          `}
        </style>
        
        <g className="hip" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* Head */}
          <circle cx="50" cy="8" r="6" fill="currentColor" />
          
          {/* Torso */}
          <line x1="50" y1="14" x2="50" y2="45" />
          
          {/* Left Arm (Background) */}
          <g className="arm-l text-accent/40">
            <line x1="50" y1="22" x2="50" y2="35" />
            <line x1="50" y1="35" x2="50" y2="48" transform="rotate(-80 50 35)" />
          </g>
          
          {/* Left Leg (Background) */}
          <g className="leg-l text-accent/40">
            <line x1="50" y1="45" x2="50" y2="65" />
            <g className="knee-l">
              <line x1="50" y1="65" x2="50" y2="85" />
            </g>
          </g>

          {/* Right Leg (Foreground) */}
          <g className="leg-r">
            <line x1="50" y1="45" x2="50" y2="65" />
            <g className="knee-r">
              <line x1="50" y1="65" x2="50" y2="85" />
            </g>
          </g>
          
          {/* Right Arm (Foreground) */}
          <g className="arm-r">
            <line x1="50" y1="22" x2="50" y2="35" />
            <line x1="50" y1="35" x2="50" y2="48" transform="rotate(-80 50 35)" />
          </g>
        </g>
      </svg>
    </div>
  )
}

export function Home({ route, importError, busy, onImport, onImportPredefined, onStart, onDelete }: Props) {
  const [manage, setManage] = useState(false)

  return (
    <main className="safe-x flex h-dvh flex-col px-7 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[max(env(safe-area-inset-top),1.5rem)]">
      <header className="pt-8">
        <h1 className="text-[1.75rem] font-semibold tracking-tight">RunRoute</h1>
        <p className="mt-1 text-[0.9375rem] text-muted">18th Kathmandu Marathon</p>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center py-8">
        {route ? <RouteShape route={route} className="aspect-square h-full max-h-72 text-accent/90" /> : <EmptyStateGraphic />}
      </div>

      <section>
        {route ? (
          <>
            <div className="text-[3.5rem] font-semibold leading-none tracking-tight tabular-nums">
              {km(route.distance, 1)}
              <span className="ml-2 text-[1.5rem] font-medium text-muted">km</span>
            </div>
            <p className="mt-2 text-[0.9375rem] text-muted">Saved route</p>
            <PrimaryButton className="mt-8" onClick={onStart}>
              Start
            </PrimaryButton>
            <TextButton className="mt-2" onClick={() => setManage(true)}>
              Manage route
            </TextButton>
          </>
        ) : (
          <div className="flex flex-col items-center w-full max-w-sm mx-auto animate-in fade-in duration-500 delay-300 fill-mode-both">
            <p className="text-[0.875rem] font-semibold text-muted mb-4 uppercase tracking-wider text-left w-full pl-1">Official Race Routes</p>
            
            <div className="flex flex-col gap-3 w-full">
              <button
                type="button"
                disabled={busy}
                onClick={() => onImportPredefined('/routes/18th%20Kathmandu%20Marathon%20Full%20Marathon.gpx', 'Full Marathon')}
                className="flex items-center justify-between w-full p-4 rounded-2xl bg-accent text-ink font-bold transition active:scale-[0.98] disabled:opacity-50 shadow-lg"
              >
                <span className="text-[1.125rem]">Full Marathon</span>
                <svg viewBox="0 0 24 24" className="size-5 opacity-80" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => onImportPredefined('/routes/18th%20Kathmandu%20Marathon%20Half%20Marathon.gpx', 'Half Marathon')}
                className="flex items-center justify-between w-full p-4 rounded-2xl bg-surface border border-line text-fg font-semibold transition active:scale-[0.98] disabled:opacity-50"
              >
                <span className="text-[1.125rem]">Half Marathon</span>
                <svg viewBox="0 0 24 24" className="size-5 text-muted" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => onImportPredefined('/routes/10%20KM%2018th%20Kathmandu%20Marathon.gpx', '10 KM')}
                className="flex items-center justify-between w-full p-4 rounded-2xl bg-surface border border-line text-fg font-semibold transition active:scale-[0.98] disabled:opacity-50"
              >
                <span className="text-[1.125rem]">10 KM Race</span>
                <svg viewBox="0 0 24 24" className="size-5 text-muted" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>

            <div className="mt-8 w-full border-t border-line/60 pt-6">
              <TextButton onClick={onImport} className="w-full text-muted font-medium">
                {busy ? 'Reading…' : 'Import custom GPX'}
              </TextButton>
            </div>
          </div>
        )}
        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-center text-[0.875rem] text-danger">
          {importError}
        </p>
      </section>

      {route && (
        <ManageSheet
          open={manage}
          route={route}
          onClose={() => setManage(false)}
          onReplace={() => {
            setManage(false)
            onImport()
          }}
          onDelete={() => {
            setManage(false)
            onDelete()
          }}
        />
      )}
    </main>
  )
}

function ManageSheet({
  open,
  route,
  onClose,
  onReplace,
  onDelete,
}: {
  open: boolean
  route: RouteData
  onClose: () => void
  onReplace: () => void
  onDelete: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const [runs, setRuns] = useState<RunResult[]>([])

  useEffect(() => {
    if (!open) return setConfirm(false)
    listRuns(route.id).then(setRuns).catch(() => setRuns([]))
  }, [open, route.id])

  return (
    <Sheet open={open} onClose={onClose} label="Manage route">
      <h2 className="truncate text-[1.125rem] font-semibold">{route.name}</h2>
      <p className="mt-1 text-[0.875rem] text-muted tabular-nums">
        {km(route.distance, 2)} km · +{Math.round(route.elevationGain)} m · {shortDate(route.importedAt)}
      </p>

      {runs.length > 0 && (
        <div className="mt-6">
          <p className="text-[0.75rem] font-medium uppercase tracking-[0.14em] text-dim">Saved runs</p>
          <ul className="mt-2">
            {runs.slice(0, 5).map((r) => (
              <li key={r.id} className="flex justify-between border-b border-line py-3 text-[0.9375rem] tabular-nums last:border-0">
                <span className="text-muted">{shortDate(r.date)}</span>
                <span>
                  {duration(r.elapsedMs)}
                  <span className="ml-3 text-muted">{pace(r.distance > 0 ? r.elapsedMs / r.distance : null)} /km</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 space-y-1">
        <TextButton tone="fg" className="bg-ink/60" onClick={onReplace}>
          Replace GPX
        </TextButton>
        <TextButton tone="danger" onClick={() => (confirm ? onDelete() : setConfirm(true))}>
          {confirm ? 'Tap again to delete' : 'Delete route'}
        </TextButton>
        <TextButton onClick={onClose}>Close</TextButton>
      </div>
    </Sheet>
  )
}
