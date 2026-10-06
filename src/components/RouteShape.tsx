import { useMemo } from 'react'
import type { RouteData } from '../lib/gpx'
import { createProjector } from '../lib/geo'

/** Thin outline of the saved route — the user's course, not decoration. */
export function RouteShape({ route, className }: { route: RouteData; className?: string }) {
  const { d, start, end } = useMemo(() => {
    const [[s, w], [n, e]] = route.bounds
    const proj = createProjector({ lat: (s + n) / 2, lng: (w + e) / 2 })
    const step = Math.max(1, Math.floor(route.points.length / 600))
    const xy = route.points.filter((_, i) => i % step === 0).map((p) => proj.toXY(p))
    xy.push(proj.toXY(route.finish))
    const xs = xy.map((p) => p[0])
    const ys = xy.map((p) => p[1])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const size = Math.max(maxX - minX, maxY - minY) || 1
    const pad = 8
    const k = (100 - pad * 2) / size
    const ox = pad + (100 - pad * 2 - (maxX - minX) * k) / 2
    const oy = pad + (100 - pad * 2 - (maxY - minY) * k) / 2
    const pts = xy.map(([x, y]) => [ox + (x - minX) * k, oy + (maxY - y) * k] as const)
    return {
      d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(''),
      start: pts[0],
      end: pts[pts.length - 1],
    }
  }, [route])

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={end[0]} cy={end[1]} r="1.6" fill="var(--color-ink)" stroke="currentColor" strokeWidth="0.8" />
      <circle cx={start[0]} cy={start[1]} r="1.8" fill="currentColor" />
    </svg>
  )
}
