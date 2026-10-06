import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Bottom sheet built on the native <dialog> (modal, focus-trapped, Esc /
 * back-gesture via closedby). Light-dismiss fallback for browsers without
 * `closedby` support.
 */
export function Sheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onCloseEvt = () => onClose()
    d.addEventListener('close', onCloseEvt)
    // Fallback for browsers without closedby support: click outside closes.
    const onClick = (e: MouseEvent) => {
      if ('closedBy' in HTMLDialogElement.prototype) return
      const r = d.getBoundingClientRect()
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (!inside) d.close()
    }
    d.addEventListener('click', onClick)
    return () => {
      d.removeEventListener('close', onCloseEvt)
      d.removeEventListener('click', onClick)
    }
  }, [onClose])

  return (
    <dialog ref={ref} className="sheet" aria-label={label} {...{ closedby: 'any' }}>
      <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-line" aria-hidden />
      {children}
    </dialog>
  )
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-15 w-full rounded-2xl bg-accent text-[1.0625rem] font-semibold tracking-wide text-ink transition active:scale-[0.985] active:brightness-90 disabled:bg-surface disabled:text-dim ${className}`}
    >
      {children}
    </button>
  )
}

export function TextButton({
  children,
  onClick,
  className = '',
  tone = 'muted',
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
  tone?: 'muted' | 'danger' | 'fg' | 'accent'
}) {
  const color = { muted: 'text-muted', danger: 'text-danger', fg: 'text-fg', accent: 'text-accent' }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-12 w-full rounded-xl text-[0.9375rem] font-medium ${color} transition active:bg-surface ${className}`}
    >
      {children}
    </button>
  )
}

export type Tone = 'ok' | 'warn' | 'bad' | 'idle'

export function Status({ tone, children, pulse }: { tone: Tone; children: ReactNode; pulse?: boolean }) {
  const dot = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-danger', idle: 'bg-dim' }[tone]
  return (
    <span className="inline-flex items-center gap-2 text-[0.8125rem] text-muted">
      <span className={`size-1.5 rounded-full ${dot} ${pulse ? 'animate-pulse' : ''}`} aria-hidden />
      {children}
    </span>
  )
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line py-3.5 last:border-0">
      <span className="text-[0.9375rem] text-muted">{label}</span>
      <span className="text-[1.0625rem] font-medium tabular-nums">{value}</span>
    </div>
  )
}
