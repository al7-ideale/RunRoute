import { useState } from 'react'
import { duration, km, pace } from '../lib/format'
import type { RaceFinish } from '../hooks/useRace'
import { PrimaryButton, TextButton } from '../components/ui'

interface Props {
  result: RaceFinish
  onSave: () => Promise<void>
  onDone: () => void
}

export function Complete({ result, onSave, onDone }: Props) {
  const [saved, setSaved] = useState<'no' | 'saving' | 'yes' | 'error'>('no')
  const avg = result.distance > 0 ? result.elapsedMs / result.distance : null

  const save = async () => {
    setSaved('saving')
    try {
      await onSave()
      setSaved('yes')
    } catch {
      setSaved('error')
    }
  }

  return (
    <main className="flex h-dvh flex-col px-7 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[env(safe-area-inset-top)]">
      <section className="flex flex-1 flex-col justify-center">
        <div className="text-[4.5rem] font-semibold leading-none tracking-tight tabular-nums">
          {km(result.distance, 2)}
          <span className="ml-2 text-[1.75rem] font-medium text-muted">km</span>
        </div>
        <div className="mt-6 text-[2.25rem] font-semibold leading-none tabular-nums">{duration(result.elapsedMs)}</div>
        <div className="mt-3 text-[1.25rem] text-muted tabular-nums">{pace(avg)} /km</div>
        <div className="mt-10 flex items-center gap-3">
          <span className={`h-px w-8 ${result.completed ? 'bg-accent' : 'bg-dim'}`} aria-hidden />
          <p className={`text-[0.875rem] font-bold tracking-[0.22em] ${result.completed ? 'text-accent' : 'text-muted'}`}>
            {result.completed ? 'RUN COMPLETE' : 'RUN ENDED'}
          </p>
        </div>
      </section>

      <PrimaryButton onClick={save} disabled={saved === 'saving' || saved === 'yes'}>
        {saved === 'yes' ? 'Saved ✓' : saved === 'error' ? 'Couldn’t save · retry' : 'Save result'}
      </PrimaryButton>
      <TextButton className="mt-2" onClick={onDone}>
        Done
      </TextButton>
    </main>
  )
}
