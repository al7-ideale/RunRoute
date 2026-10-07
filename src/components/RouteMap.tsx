/**
 * Map rendering (Leaflet + OSM). Imperative Leaflet wrapped in a React
 * component; the route and position layers work without any network.
 */
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { bearing, type LatLng } from '../lib/geo'
import type { GpsFix } from '../lib/gps'
import { routeUntil, type RouteIndex } from '../lib/route'
import { TILE_ATTRIBUTION, TILE_URL } from '../lib/tiles'

const ROUTE = '#c8ff2e'
const DONE = '#6b7079'
const CASING = '#0a0b0d'
const DANGER = '#ff3b30'
const RACE_ZOOM = 17

interface Props {
  index: RouteIndex
  mode: 'preview' | 'race'
  fix?: GpsFix | null
  /** Distance completed (m) — that part of the line is muted. */
  completed?: number
  /** Closest route point; a connector is drawn when off route. */
  nearest?: LatLng | null
  offRoute?: boolean
  /** Keep the runner centred. */
  follow?: boolean
  /** Incremented to force an immediate re-centre. */
  recenterKey?: number
  onUserPan?: () => void
  onTileError?: () => void
  className?: string
}

const ll = (p: LatLng): L.LatLngTuple => [p.lat, p.lng]

export function RouteMap({
  index,
  mode,
  fix,
  completed = 0,
  nearest,
  offRoute,
  follow,
  recenterKey,
  onUserPan,
  onTileError,
  className,
}: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layers = useRef<{
    done: L.Polyline
    me: L.Marker
    acc: L.Circle
    link: L.Polyline
  } | null>(null)
  const cb = useRef({ onUserPan, onTileError })
  cb.current = { onUserPan, onTileError }
  const placed = useRef(false)
  const [rotation, setRotation] = useState(0)

  // Create map + static route layers.
  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, {
      zoomControl: false,
      attributionControl: true,
      maxZoom: 19,
      zoomSnap: 0.25,
      inertia: true,
      tapTolerance: 20,
    })
    m.attributionControl.setPrefix(false)

    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      maxNativeZoom: 16,
      attribution: TILE_ATTRIBUTION,
      className: 'rr-tiles',
      crossOrigin: true,
    })
      .on('tileerror', () => cb.current.onTileError?.())
      .addTo(m)

    const line = index.route.points.map(ll)
    L.polyline(line, { color: CASING, weight: 10, opacity: 0.85, interactive: false, lineJoin: 'round' }).addTo(m)
    L.polyline(line, { color: ROUTE, weight: 5, opacity: 1, interactive: false, lineJoin: 'round' }).addTo(m)

    // Direction arrows every 2 km
    let nextD = 2000
    for (let i = 0; i < index.cum.length - 1; i++) {
      while (nextD >= index.cum[i] && nextD < index.cum[i + 1]) {
        const d0 = index.cum[i]
        const d1 = index.cum[i + 1]
        const t = (nextD - d0) / Math.max(1, d1 - d0)
        const p0 = index.route.points[i]
        const p1 = index.route.points[i + 1]
        const lat = p0.lat + t * (p1.lat - p0.lat)
        const lng = p0.lng + t * (p1.lng - p0.lng)
        const b = bearing(p0, p1)
        
        const arrowSvg = `<svg viewBox="0 0 24 24" style="transform: rotate(${b}deg); width: 20px; height: 20px;" fill="none" stroke="#ff3b30" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 14 12 10 8 14"/></svg>`
        
        L.marker([lat, lng], {
          icon: L.divIcon({ html: arrowSvg, className: '', iconSize: [20, 20], iconAnchor: [10, 10] }),
          interactive: false,
          keyboard: false,
        }).addTo(m)
        
        nextD += 2000
      }
    }
    const done = L.polyline([], { color: DONE, weight: 5, opacity: 1, interactive: false, lineJoin: 'round' }).addTo(m)

    L.marker(ll(index.route.start), {
      icon: L.divIcon({ className: 'rr-start', iconSize: [16, 16] }),
      interactive: false,
      keyboard: false,
    }).addTo(m)
    L.marker(ll(index.route.finish), {
      icon: L.divIcon({ className: 'rr-finish', iconSize: [18, 18] }),
      interactive: false,
      keyboard: false,
    }).addTo(m)

    const link = L.polyline([], { color: DANGER, weight: 3, dashArray: '2 8', lineCap: 'round', interactive: false }).addTo(m)
    const acc = L.circle([0, 0], { radius: 0, stroke: false, fillColor: '#ffffff', fillOpacity: 0.1, interactive: false })
    const me = L.marker([0, 0], {
      icon: L.divIcon({ className: 'rr-me', html: '<i></i>', iconSize: [26, 26] }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 1000,
    })

    m.fitBounds(L.latLngBounds(line), { padding: [28, 28], maxZoom: 16 })
    m.on('dragstart', () => cb.current.onUserPan?.())

    map.current = m
    layers.current = { done, me, acc, link }
    placed.current = false

    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      m.remove()
      map.current = null
      layers.current = null
    }
  }, [index])

  // Position marker + accuracy halo + follow.
  useEffect(() => {
    const m = map.current
    const ly = layers.current
    if (!m || !ly || !fix) return
    const pos: L.LatLngTuple = [fix.lat, fix.lng]
    ly.me.setLatLng(pos)
    ly.acc.setLatLng(pos).setRadius(fix.accuracy)
    if (!m.hasLayer(ly.me)) {
      ly.acc.addTo(m)
      ly.me.addTo(m)
    }
    const iconEl = ly.me.getElement()
    let heading = 0;
    if (iconEl) {
      const moving = fix.heading !== null && (fix.speed ?? 0) > 0.5
      iconEl.classList.toggle('has-heading', moving)
      if (moving) {
        heading = fix.heading!
        iconEl.style.setProperty('--hdg', `${heading}deg`)
      }
    }
    if (mode === 'race' && follow) {
      setRotation(-heading)
      if (!placed.current) {
        m.setView(pos, RACE_ZOOM, { animate: false })
        placed.current = true
      } else {
        m.panTo(pos, { animate: true, duration: 0.6, easeLinearity: 0.5 })
      }
    } else {
      setRotation(0)
    }
  }, [fix, follow, mode])

  // Explicit re-centre.
  useEffect(() => {
    const m = map.current
    if (!m || recenterKey === undefined || recenterKey === 0) return
    if (fix) m.setView([fix.lat, fix.lng], Math.max(m.getZoom(), 16), { animate: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey])

  // Race with no fix yet: frame the start.
  useEffect(() => {
    const m = map.current
    if (m && mode === 'race' && !fix && !placed.current) {
      m.setView(ll(index.route.start), 16, { animate: false })
    }
  }, [mode, fix, index])

  // Completed portion.
  useEffect(() => {
    layers.current?.done.setLatLngs(completed > 0 ? routeUntil(index, completed).map(ll) : [])
  }, [completed, index])

  // Off-route connector.
  useEffect(() => {
    const ly = layers.current
    if (!ly) return
    ly.link.setLatLngs(offRoute && fix && nearest ? [[fix.lat, fix.lng], ll(nearest)] : [])
  }, [offRoute, fix, nearest])

  return (
    <div className={`overflow-hidden pointer-events-none ${className || ''}`}>
      <div
        ref={el}
        style={{
          width: mode === 'race' ? '150vmax' : '100%',
          height: mode === 'race' ? '150vmax' : '100%',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          pointerEvents: 'auto',
          transition: 'transform 0.5s ease-out',
        }}
      />
    </div>
  )
}
