/**
 * PWA / offline behaviour: service worker registration, offline-readiness,
 * persistent storage and environment capability checks.
 */
import { registerSW } from 'virtual:pwa-register'

let registered = false

export function registerServiceWorker() {
  if (registered || !('serviceWorker' in navigator)) return
  registered = true
  registerSW({ immediate: true })
}

/**
 * Resolves true once a service worker is active, meaning the app shell has
 * been precached and the app will start without a network connection.
 */
export async function waitForOfflineReady(timeoutMs = 15000): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  const reg = await navigator.serviceWorker.getRegistration()
  if (reg?.active) return true
  if (import.meta.env.DEV) return false
  return Promise.race([
    navigator.serviceWorker.ready.then((r) => !!r.active),
    new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs)),
  ])
}

/** Ask the browser not to evict our route / tiles under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

export interface Capabilities {
  geolocation: boolean
  indexedDB: boolean
  serviceWorker: boolean
  wakeLock: boolean
}

export function capabilities(): Capabilities {
  return {
    geolocation: 'geolocation' in navigator,
    indexedDB: 'indexedDB' in window,
    serviceWorker: 'serviceWorker' in navigator,
    wakeLock: 'wakeLock' in navigator,
  }
}

/** Running as an installed app (standalone display mode). */
export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
