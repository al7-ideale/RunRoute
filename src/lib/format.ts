/** Display formatting helpers. */

export function km(m: number, decimals = 1): string {
  return (Math.max(0, m) / 1000).toFixed(decimals)
}

/** H:MM:SS, or M:SS under an hour. */
export function duration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** M:SS per km, or an en-dash placeholder. */
export function pace(secPerKm: number | null): string {
  if (secPerKm === null || !Number.isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 3600) return '–:––'
  const r = Math.round(secPerKm)
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`
}

export function metres(m: number): string {
  return m >= 1000 ? `${km(m, 1)} km` : `${Math.round(m)} m`
}

export function shortDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
