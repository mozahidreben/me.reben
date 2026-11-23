import { useEffect, useState } from 'react';
import { Fuel } from 'lucide-react';

interface SplashScreenProps {
  enabled: boolean;
  brandName: string;
  showName?: boolean;
  customLogoDataUrl?: string;
}

export function SplashScreen({ enabled, brandName, showName = true, customLogoDataUrl }: SplashScreenProps) {
  const [phase, setPhase] = useState<'show' | 'fade' | 'done'>(() => (enabled ? 'show' : 'done'));
  const [imgFailed, setImgFailed] = useState(false);

  const [logoSrc, setLogoSrc] = useState<string>(() => customLogoDataUrl?.trim() || '/logo.png');

  useEffect(() => {
    setImgFailed(false);
    setLogoSrc(customLogoDataUrl?.trim() || '/logo.png');
  }, [customLogoDataUrl]);

  useEffect(() => {
    if (!enabled) {
      setPhase('done');
      return;
    }
    const fadeTimer = window.setTimeout(() => setPhase('fade'), 2000);
    const doneTimer = window.setTimeout(() => setPhase('done'), 2350);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [enabled]);

  if (phase === 'done') return null;

  return (
    <div
      className={`splash-overlay ${phase === 'fade' ? 'fading' : ''}`}
      role="status"
      aria-label={brandName}
    >
      <div className="splash-inner">
        <div className="splash-logo-wrap">
          {!imgFailed ? (
            <img
              src={logoSrc}
              alt={brandName}
              className="splash-logo"
              onError={() => {
                if (logoSrc === '/logo.png') {
                  setLogoSrc('/pwa-192x192.png');
                } else {
                  setImgFailed(true);
                }
              }}
            />
          ) : (
            <div className="splash-logo-fallback">
              <Fuel className="w-10 h-10 text-white" />
            </div>
          )}
        </div>
        {showName && brandName.trim() !== '' && (
          <div className="splash-brand">{brandName}</div>
        )}
        <div className="splash-bar" aria-hidden="true">
          <div className="splash-bar-fill" />
        </div>
      </div>
    </div>
  );
}
