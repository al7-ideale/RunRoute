import { useEffect, useState } from 'react'
import { gps, type GpsSnapshot } from '../lib/gps'

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** Subscribe to the shared GPS service. Starts it while mounted if `active`. */
export function useGps(active = true): GpsSnapshot {
  const [snap, setSnap] = useState<GpsSnapshot>(gps.snapshot)
  useEffect(() => gps.subscribe(setSnap), [])
  useEffect(() => {
    if (active) gps.start()
  }, [active])
  return snap
}
