/**
 * Map rendering (Leaflet + OSM). Imperative Leaflet wrapped in a React
 * component; the route and position layers work without any network.
 */
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-rotate'
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
      // leaflet-rotate options
      rotate: true,
      bearing: 0,
      touchRotate: false,    // don't let user rotate with two-finger gesture
      shiftKeyRotate: false, // don't let user rotate with shift+scroll
      rotateControl: false,  // hide the compass control
    } as any)
    m.attributionControl.setPrefix(false)

    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      maxNativeZoom: 18,
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

    // Determine heading from GPS fix (independent of DOM readiness)
    const moving = fix.heading !== null && (fix.speed ?? 0) > 0.5
    const heading = moving ? fix.heading! : 0

    const iconEl = ly.me.getElement()
    if (iconEl) {
      iconEl.classList.toggle('has-heading', moving)
      if (moving) {
        // Compensate --hdg for map bearing so the arrow points correctly on screen
        const mapBearing = (m as any).getBearing?.() ?? 0
        iconEl.style.setProperty('--hdg', `${heading - mapBearing}deg`)
      }
    }

    if (mode === 'race' && follow) {
      // Use leaflet-rotate's native setBearing for correct coordinate transforms
      ;(m as any).setBearing(heading)
      if (!placed.current) {
        m.setView(pos, RACE_ZOOM, { animate: false })
        placed.current = true
      } else {
        m.panTo(pos, { animate: true, duration: 0.6, easeLinearity: 0.5 })
      }
    } else {
      ;(m as any).setBearing(0)
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
    <div
      ref={el}
      className={className}
    />
  )
}
