import { useState, useEffect } from 'react'
import { Sheet, PrimaryButton, TextButton } from './ui'

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [step, setStep] = useState<'hidden' | 'prompt' | 'ios-instructions' | 'success'>('hidden')
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone
    if (isStandalone) return
    
    // Don't annoy the user if they've explicitly dismissed it
    if (localStorage.getItem('runroute_install_dismissed')) return

    const ua = window.navigator.userAgent.toLowerCase()
    const isAppleMobile = /iphone|ipad|ipod/.test(ua) || (ua.includes('mac') && 'ontouchend' in document)
    setIsIOS(isAppleMobile)

    if (isAppleMobile) {
      // iOS does not support the beforeinstallprompt event.
      // We show our own prompt after a slight delay to avoid interrupting immediate load.
      const t = setTimeout(() => setStep('prompt'), 2500)
      return () => clearTimeout(t)
    }

    // Android & Desktop Chrome
    const handleBeforeInstall = (e: any) => {
      e.preventDefault() // Prevent the mini-infobar from appearing on mobile
      setDeferredPrompt(e)
      setStep('prompt')
    }

    const handleInstalled = () => {
      setStep('success')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem('runroute_install_dismissed', '1')
    setStep('hidden')
  }

  const install = async () => {
    if (isIOS) {
      setStep('ios-instructions')
      return
    }
    
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setDeferredPrompt(null)
        // Success sheet will be triggered by 'appinstalled' event
      } else {
        dismiss()
      }
    }
  }

  return (
    <>
      <Sheet open={step === 'prompt'} onClose={dismiss} label="Install App">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent text-ink shadow-lg">
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <h2 className="text-[1.25rem] font-bold tracking-tight">Install RunRoute</h2>
          <p className="mt-2 text-[0.9375rem] text-muted leading-relaxed">
            Install this app to your device to ensure it works completely offline during your race.
          </p>
        </div>
        <div className="mt-8 space-y-2">
          <PrimaryButton onClick={install}>Install App</PrimaryButton>
          <TextButton onClick={dismiss}>Not now</TextButton>
        </div>
      </Sheet>

      <Sheet open={step === 'ios-instructions'} onClose={dismiss} label="iOS Install Instructions">
         <div className="text-center">
          <div className="mb-4 flex size-14 mx-auto items-center justify-center rounded-2xl bg-surface border border-line shadow-sm text-fg">
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </div>
          <h2 className="text-[1.25rem] font-bold tracking-tight">Add to Home Screen</h2>
          <div className="mt-4 text-[0.9375rem] text-muted text-left space-y-3 bg-surface border border-line rounded-xl p-4">
            <p>1. Tap the <strong>Share</strong> button at the bottom of your Safari screen.</p>
            <p>2. Scroll down the list and tap <strong>Add to Home Screen</strong>.</p>
            <p>3. The app will appear on your home screen for instant offline use!</p>
          </div>
        </div>
        <div className="mt-6">
          <PrimaryButton onClick={dismiss}>Got it</PrimaryButton>
        </div>
      </Sheet>

      <Sheet open={step === 'success'} onClose={() => setStep('hidden')} label="Installation Complete">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-ok text-ink shadow-lg">
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-[1.25rem] font-bold tracking-tight">Installation Complete!</h2>
          <p className="mt-2 text-[0.9375rem] text-muted leading-relaxed">
            RunRoute is now securely installed. You can find it on your <strong>Home Screen</strong> or in your <strong>App list</strong>.
          </p>
        </div>
        <div className="mt-8">
          <PrimaryButton onClick={() => setStep('hidden')}>Awesome</PrimaryButton>
        </div>
      </Sheet>
    </>
  )
}
