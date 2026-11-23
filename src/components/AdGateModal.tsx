import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Crown, Megaphone, X } from 'lucide-react';
import type { AppStrings } from '../data/appI18n.ts';

interface AdGateModalProps {
  open: boolean;
  actionLabel: string;
  brandName: string;
  strings: AppStrings;
  onComplete: () => void;
  onUpgradePro: () => void;
  onClose: () => void;
}

const AD_COUNTDOWN_SECONDS = 5;

export function AdGateModal({
  open,
  actionLabel,
  brandName,
  strings,
  onComplete,
  onUpgradePro,
  onClose,
}: AdGateModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(AD_COUNTDOWN_SECONDS);

  useEffect(() => {
    if (!open) return;
    setSecondsLeft(AD_COUNTDOWN_SECONDS);
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [open, actionLabel]);

  if (!open) return null;

  const ready = secondsLeft === 0;
  const dir = strings.rtl ? 'rtl' : 'ltr';

  return (
    <div
      className="confirm-backdrop"
      style={{ zIndex: 4100 }}
      dir={dir}
      role="dialog"
      aria-modal="true"
      aria-label={strings.adGateTitle}
    >
      <div className="confirm-box ad-gate-box">
        <div className="ad-gate-top">
          <span className="ad-gate-pill">
            <Megaphone className="w-3.5 h-3.5" />
            <span>{strings.adGateBadge}</span>
          </span>
          <button
            type="button"
            className="ad-gate-close"
            onClick={onClose}
            aria-label={strings.cancelBtn}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="confirm-title" style={{ marginTop: 8 }}>
          {strings.adGateTitle} {actionLabel ? `(${actionLabel})` : ''}
        </div>
        <div className="confirm-msg" style={{ marginBottom: 12 }}>
          {strings.adGateSubtitle}
        </div>

        {/* Sponsored Ad Slot Card */}
        <div className="ad-gate-slot">
          <div className="ad-gate-slot-brand">{brandName || 'Reben Station Shift'}</div>
          <div className="ad-gate-slot-desc">
            {strings.freeAdsPlanTitle}
          </div>
          <div className="ad-gate-timer">
            {ready ? (
              <span className="ad-gate-timer-ready">
                <CheckCircle2 className="w-4 h-4" />
                <span>{strings.adGateReadyBtn}</span>
              </span>
            ) : (
              <span className="ad-gate-timer-wait">
                <Clock className="w-4 h-4 animate-pulse" />
                <span>
                  {strings.adGateCountdownPrefix} {secondsLeft}s
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="ad-gate-actions">
          <button
            type="button"
            disabled={!ready}
            className="confirm-btn primary flex items-center justify-center gap-2"
            style={{ width: '100%', opacity: ready ? 1 : 0.5 }}
            onClick={onComplete}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {ready
                ? strings.adGateReadyBtn
                : `${strings.adGateCountdownPrefix} ${secondsLeft}s`}
            </span>
          </button>

          <button
            type="button"
            className="ad-gate-pro-btn"
            onClick={onUpgradePro}
          >
            <Crown className="w-4 h-4" />
            <span>{strings.adGateUpgradeBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
