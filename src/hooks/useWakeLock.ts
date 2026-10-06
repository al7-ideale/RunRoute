import { useEffect, useState } from 'react'

export type WakeLockState = 'off' | 'pending' | 'active' | 'unsupported' | 'denied'

/** Keeps the screen awake while `enabled`, re-acquiring after tab switches. */
export function useWakeLock(enabled: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>(() =>
    'wakeLock' in navigator ? 'off' : 'unsupported',
  )

  useEffect(() => {
    if (!enabled) return
    if (!('wakeLock' in navigator)) {
      setState('unsupported')
      return
    }
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return
      setState('pending')
      try {
        const s = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void s.release()
          return
        }
        sentinel = s
        setState('active')
        s.addEventListener('release', () => {
          if (!cancelled) setState('pending') // re-acquired on next visibility
        })
      } catch {
        if (!cancelled) setState('denied')
      }
    }

    const onVisibility = () => void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    void acquire()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release()
      setState('off')
    }
  }, [enabled])

  return state
}
