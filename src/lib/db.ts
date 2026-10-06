/**
 * IndexedDB persistence (via `idb`).
 *
 * Stores:
 *  - routes : RouteData by id
 *  - meta   : small key/value records (current route id, active session, tile status)
 *  - runs   : saved race results
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { RouteData } from './gpx'

export interface ActiveSession {
  routeId: string
  startedAt: number
  /** Furthest distance reached along the route (m). */
  furthest: number
  updatedAt: number
}

export interface RunResult {
  id?: number
  routeId: string
  routeName: string
  date: number
  distance: number
  elapsedMs: number
  completed: boolean
}

export interface TileStatus {
  routeId: string
  total: number
  cached: number
  bytes: number
  savedAt: number
}

interface RunRouteDB extends DBSchema {
  routes: { key: string; value: RouteData }
  meta: { key: string; value: unknown }
  runs: { key: number; value: RunResult; indexes: { byRoute: string } }
}

let dbPromise: Promise<IDBPDatabase<RunRouteDB>> | null = null

function db() {
  if (!dbPromise) {
    dbPromise = openDB<RunRouteDB>('runroute', 1, {
      upgrade(d) {
        d.createObjectStore('routes', { keyPath: 'id' })
        d.createObjectStore('meta')
        const runs = d.createObjectStore('runs', { keyPath: 'id', autoIncrement: true })
        runs.createIndex('byRoute', 'routeId')
      },
    })
  }
  return dbPromise
}

const K_CURRENT = 'currentRouteId'
const K_SESSION = 'activeSession'
const kTiles = (routeId: string) => `tiles:${routeId}`

// Routes -------------------------------------------------------------------

export async function saveRoute(route: RouteData): Promise<void> {
  const d = await db()
  const tx = d.transaction(['routes', 'meta'], 'readwrite')
  // Single active route: replace any previous one.
  const prev = (await tx.objectStore('meta').get(K_CURRENT)) as string | undefined
  if (prev && prev !== route.id) {
    await tx.objectStore('routes').delete(prev)
    await tx.objectStore('meta').delete(kTiles(prev))
  }
  await tx.objectStore('routes').put(route)
  await tx.objectStore('meta').put(route.id, K_CURRENT)
  await tx.done
}

export async function loadCurrentRoute(): Promise<RouteData | null> {
  const d = await db()
  const id = (await d.get('meta', K_CURRENT)) as string | undefined
  if (!id) return null
  return (await d.get('routes', id)) ?? null
}

export async function deleteCurrentRoute(): Promise<void> {
  const d = await db()
  const id = (await d.get('meta', K_CURRENT)) as string | undefined
  const tx = d.transaction(['routes', 'meta'], 'readwrite')
  if (id) {
    await tx.objectStore('routes').delete(id)
    await tx.objectStore('meta').delete(kTiles(id))
  }
  await tx.objectStore('meta').delete(K_CURRENT)
  await tx.objectStore('meta').delete(K_SESSION)
  await tx.done
}

// Active race session (survives reloads / accidental closes) ----------------

export async function saveSession(s: ActiveSession): Promise<void> {
  await (await db()).put('meta', s, K_SESSION)
}

export async function loadSession(): Promise<ActiveSession | null> {
  return ((await (await db()).get('meta', K_SESSION)) as ActiveSession | undefined) ?? null
}

export async function clearSession(): Promise<void> {
  await (await db()).delete('meta', K_SESSION)
}

// Results -----------------------------------------------------------------

export async function saveRun(r: RunResult): Promise<number> {
  return (await db()).add('runs', r)
}

export async function listRuns(routeId?: string): Promise<RunResult[]> {
  const d = await db()
  const all = routeId ? await d.getAllFromIndex('runs', 'byRoute', routeId) : await d.getAll('runs')
  return all.sort((a, b) => b.date - a.date)
}

// Tile cache status -------------------------------------------------------

export async function saveTileStatus(s: TileStatus): Promise<void> {
  await (await db()).put('meta', s, kTiles(s.routeId))
}

export async function loadTileStatus(routeId: string): Promise<TileStatus | null> {
  return ((await (await db()).get('meta', kTiles(routeId))) as TileStatus | undefined) ?? null
}
