import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Lock,
  Megaphone,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import type { AppStrings } from '../data/appI18n.ts';
import type { LicenseEvaluation } from '../types/reben.ts';
import {
  activateFreeWithAdsPlan,
  activateLicenseKey,
  buildLicenseWhatsAppUrl,
} from '../utils/license.ts';
import { openExternalUrl } from '../utils/rebenExport.ts';

interface LicenseGateModalProps {
  open: boolean;
  evaluation: LicenseEvaluation;
  stationName: string;
  supportWhatsApp: string;
  strings: AppStrings;
  onUpdated: (nextEval: LicenseEvaluation) => void;
  onOpenSellerStudio: () => void;
  onNotify: (msg: string, kind?: '' | 'ok' | 'warn') => void;
  onClose: () => void;
}

export function LicenseGateModal({
  open,
  evaluation,
  stationName,
  supportWhatsApp,
  strings,
  onUpdated,
  onOpenSellerStudio,
  onNotify,
  onClose,
}: LicenseGateModalProps) {
  const [keyInput, setKeyInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setErrorText('');
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const isLockedOut = !evaluation.unlocked;
  const dir = strings.rtl ? 'rtl' : 'ltr';

  const getLockReasonText = (): string => {
    switch (evaluation.status) {
      case 'suspended':
        return strings.licenseSuspendedMsg;
      case 'grace_expired':
        return strings.licenseGraceExpiredMsg;
      case 'clock_tamper':
        return strings.clockTamperMsg;
      default:
        return strings.trialExpiredMsg;
    }
  };

  const mapErrorMessage = (code: string): string => {
    switch (code) {
      case 'DEVICE_MISMATCH':
        return strings.licenseDeviceMismatchError;
      case 'DEVICE_LIMIT_REACHED':
        return strings.licenseDeviceLimitError;
      case 'SHEET_UNCONFIGURED':
        return strings.licenseSheetUnconfiguredError;
      case 'OFFLINE':
      case 'NETWORK_ERROR':
        return strings.licenseOfflineError;
      case 'LICENSE_SUSPENDED':
        return strings.licenseSuspendedMsg;
      default:
        return strings.licenseInvalidError;
    }
  };

  const handleCopyDeviceId = async () => {
    try {
      await navigator.clipboard.writeText(evaluation.deviceId);
      setCopied(true);
      onNotify(strings.copiedToast, 'ok');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onNotify(evaluation.deviceId, '');
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim() || submitting) return;
    setSubmitting(true);
    setErrorText('');
    try {
      const res = await activateLicenseKey({
        inputKey: keyInput,
        stationName,
      });
      if (!res.ok) {
        setErrorText(mapErrorMessage(res.errorCode));
        return;
      }
      setKeyInput('');
      onUpdated(res.evaluation);
      onNotify(strings.licenseActivatedToast, 'ok');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const waUrl = buildLicenseWhatsAppUrl({
    fallbackSupportPhone: supportWhatsApp,
    stationName,
    deviceId: evaluation.deviceId,
  });

  const isFreeAds = evaluation.status === 'free_ads';
  const canSwitchToFreeAds =
    isLockedOut &&
    (evaluation.status === 'trial_expired' || evaluation.status === 'grace_expired');

  const handleContinueFreeWithAds = async () => {
    const nextEval = await activateFreeWithAdsPlan(stationName);
    onUpdated(nextEval);
    onNotify(strings.freeAdsEnabledToast, 'ok');
    onClose();
  };

  const planBadge = isFreeAds
    ? strings.freeAdsBadge
    : evaluation.plan === 'lifetime'
    ? strings.lifetimeLabel
    : `${evaluation.daysLeft} ${strings.daysLeftSuffix}`;

  return (
    <div
      className="history-modal license-modal"
      style={{ display: 'flex', zIndex: 4200 }}
      dir={dir}
      role="dialog"
      aria-modal="true"
      aria-label={strings.licenseTitle}
    >
      <div className="history-header" style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-2">
          {isLockedOut ? (
            <Lock className="w-5 h-5 text-[var(--reben-red)]" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-[#059669]" />
          )}
          <span className="history-title">
            {isLockedOut ? strings.trialExpiredTitle : strings.licenseTitle}
          </span>
        </div>
        {!isLockedOut && (
          <button className="history-close" onClick={onClose} type="button" aria-label="Close">
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      <div className="admin-scroll">
        {/* Status Summary Card */}
        <div
          className={`license-status-card ${
            isLockedOut
              ? 'locked'
              : evaluation.status === 'trial' || isFreeAds
              ? 'trial'
              : 'active'
          }`}
        >
          <div className="license-status-top">
            <div className="license-status-badge">
              {isLockedOut ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : isFreeAds ? (
                <Megaphone className="w-4 h-4 shrink-0" />
              ) : evaluation.status === 'trial' ? (
                <Sparkles className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>
                {isLockedOut
                  ? strings.trialExpiredTitle
                  : isFreeAds
                  ? strings.freeAdsPlanTitle
                  : evaluation.status === 'trial'
                  ? strings.trialActiveTitle
                  : strings.licenseActiveTitle}
              </span>
            </div>
            {!isLockedOut && <span className="license-days-pill">{planBadge}</span>}
          </div>
          {isLockedOut && <p className="license-status-msg">{getLockReasonText()}</p>}
        </div>

        {/* Device ID Card */}
        <div className="admin-card">
          <div className="admin-card-head">
            <KeyRound className="w-4 h-4 text-[var(--reben-red)]" />
            <span>{strings.deviceIdLabel}</span>
          </div>
          <div className="license-device-row" dir="ltr">
            <code className="license-device-code">{evaluation.deviceId}</code>
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={handleCopyDeviceId}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#059669]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{strings.copyDeviceIdBtn}</span>
            </button>
          </div>
        </div>

        {/* Key / Offline Code Activation Card */}
        <form className="admin-card" onSubmit={handleActivate}>
          <label className="admin-card-head" htmlFor="license-key-input">
            <ShieldCheck className="w-4 h-4 text-[#059669]" />
            <span>{strings.licenseInputLabel}</span>
          </label>
          <textarea
            id="license-key-input"
            dir="ltr"
            rows={3}
            className={`license-textarea admin-mono ${errorText ? 'invalid' : ''}`}
            placeholder={strings.licenseInputPlaceholder}
            value={keyInput}
            onChange={(e) => {
              setKeyInput(e.target.value);
              if (errorText) setErrorText('');
            }}
          />
          {errorText && <div className="pin-error-text" style={{ textAlign: 'start', marginTop: 0 }}>{errorText}</div>}
          <button
            type="submit"
            disabled={submitting || !keyInput.trim()}
            className="confirm-btn primary flex items-center justify-center gap-2"
            style={{ width: '100%', opacity: submitting || !keyInput.trim() ? 0.65 : 1 }}
          >
            <KeyRound className="w-4 h-4" />
            <span>{submitting ? strings.activatingBtn : strings.activateBtn}</span>
          </button>
        </form>

        {/* Buy / Renew on WhatsApp */}
        <button
          type="button"
          className="tut-wa-support"
          style={{ width: '100%', flex: 'none', minHeight: 50 }}
          onClick={() => openExternalUrl(waUrl)}
        >
          <MessageCircle className="w-5 h-5 shrink-0" />
          <span>{strings.buyRenewWhatsAppBtn}</span>
        </button>

        {/* Continue Free (With Ads) Option when trial expired */}
        {canSwitchToFreeAds && (
          <div className="license-free-ads-box">
            <button
              type="button"
              className="license-free-ads-btn"
              onClick={handleContinueFreeWithAds}
            >
              <Megaphone className="w-4 h-4 shrink-0" />
              <span>{strings.continueFreeWithAdsBtn}</span>
            </button>
            <div className="admin-hint" style={{ textAlign: 'center', marginTop: 6 }}>
              {strings.continueFreeWithAdsHint}
            </div>
          </div>
        )}

        {/* Quiet Seller Studio entry */}
        <div className="license-seller-footer">
          <button
            type="button"
            className="license-seller-link"
            onClick={onOpenSellerStudio}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>{strings.sellerPortalBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
