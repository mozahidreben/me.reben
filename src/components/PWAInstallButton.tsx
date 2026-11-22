import { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import { IS_ANDROID_APP } from '../utils/rebenExport.ts';

interface PWAInstallButtonProps {
  label?: string;
}

export function PWAInstallButton({ label = 'Install' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Never show when running inside Android WebView wrapper or already installed as PWA
  if (IS_ANDROID_APP || isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="pwa-install-btn"
        aria-label="Install app for offline use"
        title="Install app for offline use"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{label}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="pwa-install-btn"
          aria-label="Install app on iPhone or iPad"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{label}</span>
        </button>

        {showIOSGuide && (
          <div className="confirm-backdrop" role="dialog" aria-modal="true" aria-label="Install on iPhone or iPad">
            <div className="confirm-box">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="confirm-title" style={{ marginBottom: 0 }}>
                  Install for Offline Use
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="confirm-msg" style={{ marginBottom: '16px' }}>
                <p className="mb-2">Install Reben Station Shift so all voice guides work without internet:</p>
                <p className="mb-1 flex items-center gap-1.5">
                  <span>1. Tap the</span>
                  <Share className="w-3.5 h-3.5 inline text-red-600" />
                  <strong>Share</strong>
                  <span>button in Safari.</span>
                </p>
                <p>
                  2. Scroll down and tap <strong>Add to Home Screen</strong>.
                </p>
              </div>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="confirm-btn primary"
                  onClick={() => setShowIOSGuide(false)}
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
