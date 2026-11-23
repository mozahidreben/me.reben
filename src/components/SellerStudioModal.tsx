import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  FileSpreadsheet,
  FlaskConical,
  KeyRound,
  Lock,
  Megaphone,
  MessageCircle,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { LicenseEvaluation, LicensePlan } from '../types/reben.ts';
import {
  evaluateLicenseStatus,
  hydrateLicenseRuntimeConfig,
  resetTrialForTest,
  simulateFreeAdsModeForTest,
  simulateTrialExpiredForTest,
} from '../utils/license.ts';
import { ANDROID_ADMOB_KOTLIN_SNIPPET } from '../utils/ads.ts';
import { MASTER_LICENSE_APPS_SCRIPT } from '../utils/licenseAppsScript.ts';
import { openExternalUrl } from '../utils/rebenExport.ts';

interface SellerStudioModalProps {
  open: boolean;
  currentDeviceId: string;
  onLicenseChanged: (nextEval: LicenseEvaluation) => void;
  onNotify: (msg: string, kind?: '' | 'ok' | 'warn') => void;
  onClose: () => void;
}

type StudioTab = 'offline' | 'sheet' | 'test';

export function SellerStudioModal({
  open,
  currentDeviceId,
  onLicenseChanged,
  onNotify,
  onClose,
}: SellerStudioModalProps) {
  const [bearerToken, setBearerToken] = useState<string>('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authConfigured, setAuthConfigured] = useState<boolean | null>(null);
  const [envManaged, setEnvManaged] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [tab, setTab] = useState<StudioTab>('offline');

  // Option 3 Offline Key Generator state
  const [targetDeviceId, setTargetDeviceId] = useState('');
  const [plan, setPlan] = useState<LicensePlan>('yearly');
  const [customDays, setCustomDays] = useState('365');
  const [targetStation, setTargetStation] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [signing, setSigning] = useState(false);

  // Option 1 Sheet & Seller Config state
  const [masterSheetUrl, setMasterSheetUrl] = useState('');
  const [sellerWhatsApp, setSellerWhatsApp] = useState('');
  const [publicKeyEnv, setPublicKeyEnv] = useState('');
  const [keyId, setKeyId] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadSellerConfig = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/seller/config', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setBearerToken('');
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as {
        masterSheetUrl?: string;
        sellerWhatsApp?: string;
        publicKeyEnv?: string;
        kid?: string;
      };
      setMasterSheetUrl(data.masterSheetUrl || '');
      setSellerWhatsApp(data.sellerWhatsApp || '');
      setPublicKeyEnv(data.publicKeyEnv || '');
      setKeyId(data.kid || '');
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;
    setAuthError('');
    setConfigError('');
    setPasswordInput('');
    setConfirmPasswordInput('');
    setGeneratedCode('');
    setTargetDeviceId((prev) => prev || currentDeviceId);

    if (bearerToken) {
      loadSellerConfig(bearerToken);
      return;
    }

    setAuthLoading(true);
    fetch('/api/seller/auth-status')
      .then((r) => r.json())
      .then((data: { configured?: boolean; envManaged?: boolean }) => {
        setAuthConfigured(Boolean(data?.configured));
        setEnvManaged(Boolean(data?.envManaged));
      })
      .catch(() => {
        setAuthError('Seller server is unreachable (requires online connection to host).');
      })
      .finally(() => setAuthLoading(false));
  }, [open, bearerToken, currentDeviceId, loadSellerConfig]);

  if (!open) return null;

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(label);
      onNotify('Copied to clipboard', 'ok');
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      onNotify('Copy failed', 'warn');
    }
  };

  const handleClaimPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (passwordInput.length < 6) {
      setAuthError('Use at least 6 characters.');
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      setAuthError('Passwords do not match.');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await fetch('/api/seller/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      const json = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !json.token) {
        setAuthError(json?.error || 'Could not set seller password.');
        return;
      }
      setBearerToken(json.token);
      setAuthConfigured(true);
      setPasswordInput('');
      setConfirmPasswordInput('');
      await loadSellerConfig(json.token);
    } catch {
      setAuthError('Network error while claiming seller password.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!passwordInput) return;
    setAuthLoading(true);
    try {
      const res = await fetch('/api/seller/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      const json = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !json.token) {
        setAuthError(json?.error || 'Incorrect seller password.');
        return;
      }
      setBearerToken(json.token);
      setPasswordInput('');
      await loadSellerConfig(json.token);
    } catch {
      setAuthError('Network error while signing in.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSelectPlan = (nextPlan: LicensePlan) => {
    setPlan(nextPlan);
    if (nextPlan === 'trial') setCustomDays('7');
    else if (nextPlan === 'monthly') setCustomDays('30');
    else if (nextPlan === 'yearly') setCustomDays('365');
    else setCustomDays('0');
  };

  const handleGenerateOfflineKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bearerToken || signing) return;
    setSigning(true);
    try {
      const res = await fetch('/api/seller/sign-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          deviceId: targetDeviceId.trim().toUpperCase(),
          plan,
          days: Number(customDays) || 365,
          stationName: targetStation.trim(),
        }),
      });
      if (res.status === 401) {
        setBearerToken('');
        onNotify('Session expired. Please sign in again.', 'warn');
        return;
      }
      const json = (await res.json()) as { code?: string; error?: string };
      if (!res.ok || !json.code) {
        onNotify(json?.error || 'Could not generate signed key', 'warn');
        return;
      }
      setGeneratedCode(json.code);
      onNotify('Signed offline license code generated', 'ok');
    } catch {
      onNotify('Network error generating code', 'warn');
    } finally {
      setSigning(false);
    }
  };

  const handleSaveSellerConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bearerToken || savingConfig) return;
    setConfigError('');
    setSavingConfig(true);
    try {
      const res = await fetch('/api/seller/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          masterSheetUrl: masterSheetUrl.trim(),
          sellerWhatsApp: sellerWhatsApp.trim(),
        }),
      });
      if (res.status === 401) {
        setBearerToken('');
        return;
      }
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        masterSheetUrl?: string;
        sellerWhatsApp?: string;
      };
      if (!res.ok || !json.ok) {
        setConfigError(json?.error || 'Could not save config.');
        return;
      }
      setMasterSheetUrl(json.masterSheetUrl || '');
      setSellerWhatsApp(json.sellerWhatsApp || '');
      await hydrateLicenseRuntimeConfig();
      onNotify('Seller sheet & WhatsApp saved', 'ok');
    } catch {
      setConfigError('Network error saving config.');
    } finally {
      setSavingConfig(false);
    }
  };

  const envSnippet = `VITE_LICENSE_PUBLIC_KEY=${publicKeyEnv}\nVITE_LICENSE_SHEET_URL=${masterSheetUrl}`;

  return (
    <div
      className="history-modal"
      style={{ display: 'flex', zIndex: 4300 }}
      dir="ltr"
      role="dialog"
      aria-modal="true"
      aria-label="Seller License Studio"
    >
      <div className="history-header" style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[var(--reben-red)]" />
          <span className="history-title">Seller License Studio</span>
        </div>
        <button className="history-close" onClick={onClose} type="button" aria-label="Close">
          <X className="w-6 h-6" />
        </button>
      </div>

      {!bearerToken ? (
        <div className="admin-lock-screen">
          {authLoading && authConfigured === null ? (
            <div className="confirm-box" style={{ textAlign: 'center' }}>
              <div className="confirm-title">Checking Seller Access...</div>
            </div>
          ) : authConfigured === false && !envManaged ? (
            <form className="confirm-box" onSubmit={handleClaimPassword}>
              <div className="confirm-title flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[var(--reben-red)] shrink-0" />
                <span>Set Seller Master Password</span>
              </div>
              <div className="confirm-msg" style={{ marginBottom: 12 }}>
                First-time setup: create a private master password for your Seller Studio so buyers cannot generate license keys.
              </div>
              <input
                type="password"
                autoComplete="new-password"
                autoFocus
                className="pin-input"
                placeholder="New seller password (min 6 chars)"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
              />
              <input
                type="password"
                autoComplete="new-password"
                className="pin-input"
                style={{ marginTop: 8 }}
                placeholder="Confirm seller password"
                value={confirmPasswordInput}
                onChange={(e) => setConfirmPasswordInput(e.target.value)}
              />
              {authError && <div className="pin-error-text">{authError}</div>}
              <div className="confirm-actions" style={{ marginTop: 14 }}>
                <button type="button" className="confirm-btn" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" disabled={authLoading} className="confirm-btn primary">
                  {authLoading ? 'Saving...' : 'Claim Studio'}
                </button>
              </div>
            </form>
          ) : (
            <form className="confirm-box" onSubmit={handleLogin}>
              <div className="confirm-title flex items-center gap-2">
                <Lock className="w-4 h-4 text-[var(--reben-red)] shrink-0" />
                <span>Seller Sign In</span>
              </div>
              <div className="confirm-msg" style={{ marginBottom: 12 }}>
                Enter your Seller Master Password to generate offline activation codes or manage your Master License Sheet.
              </div>
              <input
                type="password"
                autoComplete="current-password"
                autoFocus
                className={`pin-input ${authError ? 'invalid' : ''}`}
                placeholder="Seller master password"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  if (authError) setAuthError('');
                }}
              />
              {authError && <div className="pin-error-text">{authError}</div>}
              <div className="confirm-actions" style={{ marginTop: 14 }}>
                <button type="button" className="confirm-btn" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" disabled={authLoading} className="confirm-btn primary">
                  {authLoading ? 'Signing in...' : 'Unlock Studio'}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="admin-scroll">
          {/* Tabs */}
          <div className="seller-tabs">
            <button
              type="button"
              className={`seller-tab ${tab === 'offline' ? 'on' : ''}`}
              onClick={() => setTab('offline')}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Offline Key</span>
            </button>
            <button
              type="button"
              className={`seller-tab ${tab === 'sheet' ? 'on' : ''}`}
              onClick={() => setTab('sheet')}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Master Sheet</span>
            </button>
            <button
              type="button"
              className={`seller-tab ${tab === 'test' ? 'on' : ''}`}
              onClick={() => setTab('test')}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>Test Lock</span>
            </button>
          </div>

          {tab === 'offline' && (
            <form className="admin-card" onSubmit={handleGenerateOfflineKey}>
              <div className="admin-card-head">
                <KeyRound className="w-4 h-4 text-[var(--reben-red)]" />
                <span>Generate Offline Activation Code (Option 3)</span>
              </div>
              <div className="admin-hint">
                Works 100% offline. Locked cryptographically to the buyer&apos;s Device ID so it cannot be shared with other stations.
              </div>

              <label className="admin-field-label">Buyer Device ID</label>
              <div className="admin-currency-row">
                <input
                  type="text"
                  className="admin-input admin-mono"
                  placeholder="RBN-XXXX-XXXX"
                  value={targetDeviceId}
                  onChange={(e) => setTargetDeviceId(e.target.value.toUpperCase())}
                />
                <button
                  type="button"
                  className="admin-btn-secondary"
                  style={{ height: 44, whiteSpace: 'nowrap' }}
                  onClick={() => setTargetDeviceId(currentDeviceId)}
                >
                  This Phone
                </button>
              </div>

              <label className="admin-field-label">License Plan</label>
              <div className="admin-chip-row">
                {(['trial', 'monthly', 'yearly', 'lifetime'] as LicensePlan[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`admin-chip ${plan === p ? 'on' : ''}`}
                    onClick={() => handleSelectPlan(p)}
                  >
                    {p === 'trial'
                      ? '7-Day Ext'
                      : p === 'monthly'
                      ? 'Monthly (30d)'
                      : p === 'yearly'
                      ? 'Yearly (365d)'
                      : 'Lifetime'}
                  </button>
                ))}
              </div>

              {plan !== 'lifetime' && (
                <>
                  <label className="admin-field-label">Valid Days</label>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    className="admin-input admin-mono"
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                  />
                </>
              )}

              <label className="admin-field-label">Station Name Note (optional)</label>
              <input
                type="text"
                className="admin-input"
                placeholder="e.g. Riyadh Station 12"
                value={targetStation}
                onChange={(e) => setTargetStation(e.target.value)}
              />

              <button
                type="submit"
                disabled={signing || !targetDeviceId.trim()}
                className="confirm-btn primary flex items-center justify-center gap-2"
                style={{ width: '100%', marginTop: 4 }}
              >
                <Sparkles className="w-4 h-4" />
                <span>{signing ? 'Signing...' : 'Generate Signed Code'}</span>
              </button>

              {generatedCode && (
                <div className="seller-code-result">
                  <div className="admin-field-label">Signed Activation Code (Key ID: {keyId || 'P256'})</div>
                  <textarea
                    readOnly
                    rows={3}
                    className="license-textarea admin-mono"
                    value={generatedCode}
                  />
                  <div className="admin-footer-actions" style={{ marginTop: 0, paddingTop: 0 }}>
                    <button
                      type="button"
                      className="confirm-btn flex items-center justify-center gap-1.5"
                      onClick={() => copyText('code', generatedCode)}
                    >
                      {copiedId === 'code' ? <Check className="w-4 h-4 text-[#059669]" /> : <Copy className="w-4 h-4" />}
                      <span>Copy Code</span>
                    </button>
                    <button
                      type="button"
                      className="tut-wa-support"
                      style={{ height: 44, borderRadius: 16 }}
                      onClick={() => {
                        const msg = encodeURIComponent(
                          `Your Reben Station Shift Activation Code (${plan.toUpperCase()}):\nDevice: ${targetDeviceId}\n\n${generatedCode}`
                        );
                        openExternalUrl(`https://wa.me/?text=${msg}`);
                      }}
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Send on WhatsApp</span>
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}

          {tab === 'sheet' && (
            <>
              <form className="admin-card" onSubmit={handleSaveSellerConfig}>
                <div className="admin-card-head">
                  <FileSpreadsheet className="w-4 h-4 text-[#059669]" />
                  <span>Master License Google Sheet (Option 1)</span>
                </div>
                <div className="admin-hint">
                  Your private Google Sheet controls online activations, max devices per key, expiry dates, and instant remote suspension.
                </div>

                <label className="admin-field-label">Master License Apps Script URL or Deployment ID</label>
                <input
                  type="text"
                  className="admin-input admin-mono"
                  placeholder="AKfycb... or https://script.google.com/macros/s/.../exec"
                  value={masterSheetUrl}
                  onChange={(e) => setMasterSheetUrl(e.target.value)}
                />

                <label className="admin-field-label">Your Seller WhatsApp Number (for Buy / Renew button)</label>
                <input
                  type="tel"
                  className="admin-input admin-mono"
                  placeholder="966501234567"
                  value={sellerWhatsApp}
                  onChange={(e) => setSellerWhatsApp(e.target.value)}
                />

                {configError && (
                  <div className="pin-error-text" style={{ textAlign: 'start', marginTop: 0 }}>
                    {configError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingConfig}
                  className="confirm-btn primary flex items-center justify-center gap-2"
                  style={{ width: '100%', marginTop: 4 }}
                >
                  <Save className="w-4 h-4" />
                  <span>{savingConfig ? 'Saving...' : 'Save Master Sheet Config'}</span>
                </button>
              </form>

              <div className="admin-card">
                <div className="admin-card-head">
                  <FileSpreadsheet className="w-4 h-4 text-[var(--reben-red)]" />
                  <span>1. Setup Your Private Google Sheet</span>
                </div>
                <div className="admin-hint">
                  Create a new Google Sheet → Extensions → Apps Script → paste this code → Run <b>setupLicenseSheet</b> once → Deploy as Web App (Execute as: <b>Me</b>, Who has access: <b>Anyone</b>).
                </div>
                <button
                  type="button"
                  className="admin-btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => copyText('gs', MASTER_LICENSE_APPS_SCRIPT)}
                >
                  {copiedId === 'gs' ? <Check className="w-4 h-4 text-[#059669]" /> : <Copy className="w-4 h-4" />}
                  <span>Copy Master License Apps Script (Code.gs)</span>
                </button>
              </div>

              <div className="admin-card">
                <div className="admin-card-head">
                  <ShieldCheck className="w-4 h-4 text-[#059669]" />
                  <span>2. Lock Offline APK Builds (.env)</span>
                </div>
                <div className="admin-hint">
                  Before running <b>npm run build</b> for Android Studio APK, place these public values in <b>.env</b> so the APK verifies your offline keys with zero internet:
                </div>
                <textarea
                  readOnly
                  rows={4}
                  className="license-textarea admin-mono"
                  value={envSnippet}
                />
                <button
                  type="button"
                  className="admin-btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => copyText('env', envSnippet)}
                >
                  {copiedId === 'env' ? <Check className="w-4 h-4 text-[#059669]" /> : <Copy className="w-4 h-4" />}
                  <span>Copy .env APK Values</span>
                </button>
              </div>
            </>
          )}

          {tab === 'test' && (
            <>
              <div className="admin-card">
                <div className="admin-card-head">
                  <FlaskConical className="w-4 h-4 text-[var(--reben-red)]" />
                  <span>Preview &amp; Lock / Ads Simulator</span>
                </div>
                <div className="admin-hint">
                  Test what your customer sees when their 7-day trial expires, or preview the Ad-Supported Free Tier (banner + report ad gate).
                </div>
                <button
                  type="button"
                  className="confirm-btn primary flex items-center justify-center gap-2"
                  onClick={async () => {
                    simulateTrialExpiredForTest();
                    const next = await evaluateLicenseStatus();
                    onLicenseChanged(next);
                    onClose();
                  }}
                >
                  <Lock className="w-4 h-4" />
                  <span>Simulate Trial Expired (Show Lock Screen)</span>
                </button>
                <button
                  type="button"
                  className="confirm-btn flex items-center justify-center gap-2"
                  onClick={async () => {
                    simulateFreeAdsModeForTest();
                    const next = await evaluateLicenseStatus();
                    onLicenseChanged(next);
                    onNotify('Switched to Free With Ads preview mode', 'ok');
                    onClose();
                  }}
                >
                  <Megaphone className="w-4 h-4" />
                  <span>Simulate Free With Ads Tier</span>
                </button>
                <button
                  type="button"
                  className="confirm-btn flex items-center justify-center gap-2"
                  onClick={async () => {
                    resetTrialForTest();
                    const next = await evaluateLicenseStatus();
                    onLicenseChanged(next);
                    onNotify('Reset to fresh 7-day free trial', 'ok');
                    onClose();
                  }}
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset Fresh 7-Day Free Trial</span>
                </button>
              </div>

              <div className="admin-card">
                <div className="admin-card-head">
                  <Megaphone className="w-4 h-4 text-[var(--reben-red)]" />
                  <span>Android APK AdMob Bridge (Kotlin)</span>
                </div>
                <div className="admin-hint">
                  Paid Pro users automatically send <b>setAdsEnabled(false)</b>; Free-with-Ads users send <b>setAdsEnabled(true)</b> and trigger <b>showRewardedAd</b> before exports.
                </div>
                <textarea
                  readOnly
                  rows={8}
                  className="license-textarea admin-mono"
                  value={ANDROID_ADMOB_KOTLIN_SNIPPET}
                />
                <button
                  type="button"
                  className="admin-btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => copyText('admob', ANDROID_ADMOB_KOTLIN_SNIPPET)}
                >
                  {copiedId === 'admob' ? <Check className="w-4 h-4 text-[#059669]" /> : <Copy className="w-4 h-4" />}
                  <span>Copy AndroidBridge AdMob Snippet</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
