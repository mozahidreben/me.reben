import { useEffect, useRef, useState } from 'react';
import {
  Ban,
  Check,
  Coins,
  Eye,
  FileSpreadsheet,
  FileText,
  Fuel,
  Image as ImageIcon,
  KeyRound,
  Lock,
  MessageCircle,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import type { AdminConfig } from '../types/reben.ts';
import type { AppStrings } from '../data/appI18n.ts';
import {
  DEFAULT_ADMIN_CONFIG,
  DEFAULT_PAYMENT_METHODS,
  compressLogoFile,
  resolveSheetUrl,
  sanitizePaymentMethods,
  updateAdminPin,
  verifyAdminPin,
} from '../utils/adminConfig.ts';

const CURRENCY_PRESETS = ['SAR', 'AED', 'USD', 'INR', 'PKR', 'BDT'];

interface AdminSettingsModalProps {
  open: boolean;
  config: AdminConfig;
  strings: AppStrings;
  onSave: (nextConfig: AdminConfig) => void;
  onPreviewSplash?: (draftConfig: AdminConfig) => void;
  onNotify: (msg: string, kind?: '' | 'ok' | 'warn') => void;
  onClose: () => void;
}

export function AdminSettingsModal({
  open,
  config,
  strings,
  onSave,
  onPreviewSplash,
  onNotify,
  onClose,
}: AdminSettingsModalProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [draft, setDraft] = useState<AdminConfig>(config);
  const [logoFailed, setLogoFailed] = useState(false);
  const [fallbackDefaultLogo, setFallbackDefaultLogo] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [pinChangeError, setPinChangeError] = useState(false);
  const [newPaymentLabel, setNewPaymentLabel] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setUnlocked(false);
      setPinInput('');
      setPinError(false);
      setDraft({
        ...DEFAULT_ADMIN_CONFIG,
        ...config,
        paymentMethods: (config.paymentMethods || DEFAULT_PAYMENT_METHODS).map((m) => ({ ...m })),
      });
      setLogoFailed(false);
      setFallbackDefaultLogo(false);
      setCurrentPinInput('');
      setNewPinInput('');
      setPinChangeError(false);
      setNewPaymentLabel('');
    }
  }, [open, config]);

  if (!open) return null;

  const dir = strings.rtl ? 'rtl' : 'ltr';
  const previewLogoSrc = draft.customLogoDataUrl?.trim() || (fallbackDefaultLogo ? '/pwa-192x192.png' : '/logo.png');
  const resolvedSheet = resolveSheetUrl(draft.sheetUrlOrId);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyAdminPin(pinInput)) {
      setPinError(true);
      return;
    }
    setUnlocked(true);
    setPinInput('');
    setPinError(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressLogoFile(file);
      setLogoFailed(false);
      setDraft((d) => ({ ...d, customLogoDataUrl: dataUrl }));
      onNotify(strings.logoUploadedToast, 'ok');
    } catch {
      onNotify(strings.logoInvalidError, 'warn');
    }
  };

  const handleResetDefaults = () => {
    setLogoFailed(false);
    setFallbackDefaultLogo(false);
    setNewPaymentLabel('');
    setDraft({
      ...DEFAULT_ADMIN_CONFIG,
      paymentMethods: DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m })),
    });
  };

  const handleRenamePaymentMethod = (id: string, label: string) => {
    const trimmedMax = label.slice(0, 32);
    setDraft((d) => ({
      ...d,
      paymentMethods: d.paymentMethods.map((pm) => (pm.id === id ? { ...pm, label: trimmedMax } : pm)),
    }));
  };

  const handleDeletePaymentMethod = (id: string) => {
    setDraft((d) => ({
      ...d,
      paymentMethods: d.paymentMethods.filter((pm) => pm.id !== id),
    }));
  };

  const handleAddPaymentMethod = () => {
    const label = newPaymentLabel.trim().slice(0, 32);
    if (!label) return;
    const id = `pm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
    setDraft((d) => ({
      ...d,
      paymentMethods: [...d.paymentMethods, { id, label }],
    }));
    setNewPaymentLabel('');
  };

  const handleResetPaymentMethods = () => {
    setDraft((d) => ({
      ...d,
      paymentMethods: DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m })),
    }));
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();

    const wantPinChange = newPinInput.trim().length > 0 || currentPinInput.trim().length > 0;
    if (wantPinChange) {
      if (!updateAdminPin(currentPinInput, newPinInput)) {
        setPinChangeError(true);
        return;
      }
    }

    const cleanedConfig: AdminConfig = {
      brandName: draft.brandName.trim() || DEFAULT_ADMIN_CONFIG.brandName,
      currencyCode: draft.currencyCode.trim().toUpperCase().slice(0, 8) || DEFAULT_ADMIN_CONFIG.currencyCode,
      sheetUrlOrId: draft.sheetUrlOrId.trim(),
      sheetSyncEnabled: Boolean(draft.sheetSyncEnabled),
      customLogoDataUrl: draft.customLogoDataUrl.trim(),
      supportWhatsApp: draft.supportWhatsApp.trim(),
      splashEnabled: Boolean(draft.splashEnabled),
      splashShowName: Boolean(draft.splashShowName),
      lockStationPrices: Boolean(draft.lockStationPrices),
      lockNozzleMeta: Boolean(draft.lockNozzleMeta),
      lockInitialWithPin: Boolean(draft.lockInitialWithPin),
      lockShiftWithPin: Boolean(draft.lockShiftWithPin),
      lockHistoryWithPin: Boolean(draft.lockHistoryWithPin),
      lockStationsManage: Boolean(draft.lockStationsManage),
      nozzleAddMode:
        draft.nozzleAddMode === 'pin' || draft.nozzleAddMode === 'block'
          ? draft.nozzleAddMode
          : 'allow',
      nozzleDeleteMode:
        draft.nozzleDeleteMode === 'pin' || draft.nozzleDeleteMode === 'block'
          ? draft.nozzleDeleteMode
          : 'allow',
      paymentMethods: sanitizePaymentMethods(draft.paymentMethods),
      reportAllowPdf: Boolean(draft.reportAllowPdf),
      reportAllowWhatsApp: Boolean(draft.reportAllowWhatsApp),
      reportAllowExcel: Boolean(draft.reportAllowExcel),
      pdfShowNozzles: Boolean(draft.pdfShowNozzles),
      pdfShowPayments: Boolean(draft.pdfShowPayments),
      pdfShowQr: Boolean(draft.pdfShowQr),
      pdfShowSignatures: Boolean(draft.pdfShowSignatures),
      pdfShowCredit: Boolean(draft.pdfShowCredit),
      pdfFooterNote: draft.pdfFooterNote.trim(),
      waShowPayments: Boolean(draft.waShowPayments),
      waShowPrices: Boolean(draft.waShowPrices),
      waFooterNote: draft.waFooterNote.trim(),
    };

    onSave(cleanedConfig);
    onNotify(strings.adminSettingsSavedToast, 'ok');
    onClose();
  };

  return (
    <div
      className="history-modal"
      style={{ display: 'flex', zIndex: 3500 }}
      dir={dir}
      role="dialog"
      aria-modal="true"
      aria-label={strings.ownerSetupTitle}
    >
      <div className="history-header" style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[var(--reben-red)]" />
          <span className="history-title">{strings.ownerSetupTitle}</span>
        </div>
        <button className="history-close" onClick={onClose} type="button" aria-label="Close">
          <X className="w-6 h-6" />
        </button>
      </div>

      {!unlocked ? (
        <div className="admin-lock-screen">
          <form className="confirm-box" onSubmit={handleUnlock}>
            <div className="confirm-title flex items-center gap-2">
              <Lock className="w-4 h-4 text-[var(--reben-red)] shrink-0" />
              <span>{strings.ownerSetupTitle}</span>
            </div>
            <div className="confirm-msg" style={{ marginBottom: 12 }}>
              {strings.ownerSetupLockPrompt}
            </div>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              className={`pin-input ${pinError ? 'invalid' : ''}`}
              placeholder={strings.passwordPlaceholder}
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                if (pinError) setPinError(false);
              }}
            />
            {pinError && <div className="pin-error-text">{strings.wrongPasswordError}</div>}
            <div className="confirm-actions" style={{ marginTop: 14 }}>
              <button type="button" className="confirm-btn" onClick={onClose}>
                {strings.cancelBtn}
              </button>
              <button type="submit" className="confirm-btn primary">
                {strings.unlockSetupBtn}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <form className="admin-scroll" onSubmit={handleSaveSettings}>
          {/* 1. Company Logo + Brand + Currency + Launch Splash */}
          <div className="admin-card">
            <div className="admin-card-head">
              <ImageIcon className="w-4 h-4 text-[var(--reben-red)]" />
              <span>{strings.logoConfigLabel}</span>
            </div>

            <div className="admin-logo-row">
              <div className="admin-logo-preview">
                {!logoFailed ? (
                  <img
                    src={previewLogoSrc}
                    alt={draft.brandName}
                    onError={() => {
                      if (!draft.customLogoDataUrl?.trim() && !fallbackDefaultLogo) {
                        setFallbackDefaultLogo(true);
                      } else {
                        setLogoFailed(true);
                      }
                    }}
                  />
                ) : (
                  <Fuel className="w-6 h-6 text-[var(--text-secondary)]" />
                )}
              </div>
              <div className="admin-logo-actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/*"
                  style={{ display: 'none' }}
                  onChange={handleLogoUpload}
                />
                <button
                  type="button"
                  className="admin-btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{strings.uploadLogoBtn}</span>
                </button>
                {onPreviewSplash && (
                  <button
                    type="button"
                    className="admin-btn-secondary"
                    onClick={() => onPreviewSplash({ ...draft, splashEnabled: true })}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{strings.previewSplashBtn}</span>
                  </button>
                )}
                {draft.customLogoDataUrl && (
                  <button
                    type="button"
                    className="admin-btn-reset"
                    onClick={() => {
                      setLogoFailed(false);
                      setDraft((d) => ({ ...d, customLogoDataUrl: '' }));
                    }}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{strings.resetLogoBtn}</span>
                  </button>
                )}
              </div>
            </div>

            <label className="admin-field-label" style={{ marginTop: 8 }}>
              {strings.brandNameLabel}
            </label>
            <input
              type="text"
              className="admin-input"
              placeholder={strings.brandNamePlaceholder}
              value={draft.brandName}
              onChange={(e) => setDraft((d) => ({ ...d, brandName: e.target.value }))}
            />

            <label className="admin-field-label" style={{ marginTop: 6 }}>
              <span className="inline-flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-[var(--d-t)]" />
                {strings.currencyLabel}
              </span>
            </label>
            <div className="admin-currency-row">
              <input
                type="text"
                dir="ltr"
                maxLength={8}
                className="admin-input admin-mono"
                style={{ width: 96, flexShrink: 0, textAlign: 'center', textTransform: 'uppercase' }}
                placeholder={strings.currencyPlaceholder}
                value={draft.currencyCode}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, currencyCode: e.target.value.toUpperCase().slice(0, 8) }))
                }
              />
              <div className="admin-chip-row" dir="ltr">
                {CURRENCY_PRESETS.map((code) => (
                  <button
                    key={code}
                    type="button"
                    className={`admin-chip ${draft.currencyCode === code ? 'on' : ''}`}
                    onClick={() => setDraft((d) => ({ ...d, currencyCode: code }))}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>

            <label className="admin-toggle-row">
              <input
                type="checkbox"
                checked={draft.splashEnabled}
                onChange={(e) => setDraft((d) => ({ ...d, splashEnabled: e.target.checked }))}
              />
              <Sparkles className="w-4 h-4 text-[var(--reben-red)] shrink-0" />
              <span>{strings.splashToggleLabel}</span>
            </label>

            {draft.splashEnabled && (
              <label className="admin-toggle-row" style={{ paddingInlineStart: 26 }}>
                <input
                  type="checkbox"
                  checked={draft.splashShowName}
                  onChange={(e) => setDraft((d) => ({ ...d, splashShowName: e.target.checked }))}
                />
                <span>{strings.splashShowNameLabel}</span>
              </label>
            )}
          </div>

          {/* 2. Station & Staff Security Locks */}
          <div className="admin-card">
            <div className="admin-card-head">
              <ShieldAlert className="w-4 h-4 text-[var(--reben-red)]" />
              <span>{strings.staffLockSectionLabel}</span>
            </div>

            <label className="admin-toggle-row">
              <input
                type="checkbox"
                checked={draft.lockStationPrices}
                onChange={(e) => setDraft((d) => ({ ...d, lockStationPrices: e.target.checked }))}
              />
              <span>{strings.lockStationPricesLabel}</span>
            </label>

            <label className="admin-toggle-row">
              <input
                type="checkbox"
                checked={draft.lockNozzleMeta}
                onChange={(e) => setDraft((d) => ({ ...d, lockNozzleMeta: e.target.checked }))}
              />
              <span>{strings.lockNozzleMetaLabel}</span>
            </label>

            <label className="admin-toggle-row">
              <input
                type="checkbox"
                checked={draft.lockInitialWithPin}
                onChange={(e) => setDraft((d) => ({ ...d, lockInitialWithPin: e.target.checked }))}
              />
              <span>{strings.lockInitialWithPinLabel}</span>
            </label>

            <label className="admin-toggle-row">
              <input
                type="checkbox"
                checked={draft.lockShiftWithPin}
                onChange={(e) => setDraft((d) => ({ ...d, lockShiftWithPin: e.target.checked }))}
              />
              <span>{strings.lockShiftWithPinLabel}</span>
            </label>

            <label className="admin-toggle-row">
              <input
                type="checkbox"
                checked={draft.lockHistoryWithPin}
                onChange={(e) => setDraft((d) => ({ ...d, lockHistoryWithPin: e.target.checked }))}
              />
              <span>{strings.lockHistoryWithPinLabel}</span>
            </label>

            <label className="admin-toggle-row">
              <input
                type="checkbox"
                checked={draft.lockStationsManage}
                onChange={(e) => setDraft((d) => ({ ...d, lockStationsManage: e.target.checked }))}
              />
              <span>{strings.lockStationsManageLabel}</span>
            </label>

            <label className="admin-field-label" style={{ marginTop: 8 }}>
              {strings.nozzleAddPolicyLabel}
            </label>
            <div className="admin-seg-row" role="group" aria-label={strings.nozzleAddPolicyLabel}>
              <button
                type="button"
                className={`admin-seg-btn ${draft.nozzleAddMode === 'allow' ? 'on' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, nozzleAddMode: 'allow' }))}
              >
                <Check className="w-3.5 h-3.5" />
                <span>{strings.nozzleDeleteAllow}</span>
              </button>
              <button
                type="button"
                className={`admin-seg-btn ${draft.nozzleAddMode === 'pin' ? 'on' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, nozzleAddMode: 'pin' }))}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{strings.nozzleDeletePin}</span>
              </button>
              <button
                type="button"
                className={`admin-seg-btn ${draft.nozzleAddMode === 'block' ? 'on block' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, nozzleAddMode: 'block' }))}
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{strings.nozzleDeleteBlock}</span>
              </button>
            </div>

            <label className="admin-field-label" style={{ marginTop: 8 }}>
              {strings.nozzleDeletePolicyLabel}
            </label>
            <div className="admin-seg-row" role="group" aria-label={strings.nozzleDeletePolicyLabel}>
              <button
                type="button"
                className={`admin-seg-btn ${draft.nozzleDeleteMode === 'allow' ? 'on' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, nozzleDeleteMode: 'allow' }))}
              >
                <Check className="w-3.5 h-3.5" />
                <span>{strings.nozzleDeleteAllow}</span>
              </button>
              <button
                type="button"
                className={`admin-seg-btn ${draft.nozzleDeleteMode === 'pin' ? 'on' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, nozzleDeleteMode: 'pin' }))}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{strings.nozzleDeletePin}</span>
              </button>
              <button
                type="button"
                className={`admin-seg-btn ${draft.nozzleDeleteMode === 'block' ? 'on block' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, nozzleDeleteMode: 'block' }))}
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{strings.nozzleDeleteBlock}</span>
              </button>
            </div>
          </div>

          {/* 3. Custom Payment Methods (+ APPS Panel & Reports) */}
          <div className="admin-card">
            <div className="admin-card-head" style={{ justifyContent: 'space-between' }}>
              <span className="inline-flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[var(--reben-red)]" />
                <span>{strings.paymentMethodsSectionLabel}</span>
              </span>
              <button
                type="button"
                className="admin-btn-reset"
                onClick={handleResetPaymentMethods}
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{strings.resetPaymentMethodsBtn}</span>
              </button>
            </div>
            <div className="admin-hint" style={{ marginTop: 0, marginBottom: 4 }}>
              {strings.paymentMethodsHint}
            </div>

            {draft.paymentMethods.length === 0 ? (
              <div className="admin-hint" style={{ textAlign: 'center', padding: '10px 4px' }}>
                {strings.noPaymentMethodsMsg}
              </div>
            ) : (
              <div className="admin-pm-list">
                {draft.paymentMethods.map((pm) => (
                  <div className="admin-pm-row" key={pm.id}>
                    <input
                      type="text"
                      maxLength={32}
                      className="admin-input"
                      value={pm.label}
                      placeholder={strings.paymentMethodPlaceholder}
                      onChange={(e) => handleRenamePaymentMethod(pm.id, e.target.value)}
                    />
                    <button
                      type="button"
                      className="admin-pm-del"
                      onClick={() => handleDeletePaymentMethod(pm.id)}
                      aria-label={`Delete ${pm.label}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="admin-pm-add-row">
              <input
                type="text"
                maxLength={32}
                className="admin-input"
                placeholder={strings.paymentMethodPlaceholder}
                value={newPaymentLabel}
                onChange={(e) => setNewPaymentLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddPaymentMethod();
                  }
                }}
              />
              <button
                type="button"
                className="admin-pm-add-btn"
                onClick={handleAddPaymentMethod}
                disabled={!newPaymentLabel.trim()}
              >
                <Plus className="w-4 h-4" />
                <span>{strings.addPaymentMethodBtn}</span>
              </button>
            </div>
          </div>

          {/* 4. Report & Export Controls (PDF / WhatsApp / Excel) */}
          <div className="admin-card">
            <div className="admin-card-head">
              <FileText className="w-4 h-4 text-[#dc2626]" />
              <span>{strings.pdfOptionsSectionLabel}</span>
            </div>

            <label className="admin-toggle-row">
              <input
                type="checkbox"
                checked={draft.reportAllowPdf}
                onChange={(e) => setDraft((d) => ({ ...d, reportAllowPdf: e.target.checked }))}
              />
              <span>{strings.reportAllowPdfLabel}</span>
            </label>

            <label className="admin-toggle-row">
              <input
                type="checkbox"
                checked={draft.reportAllowWhatsApp}
                onChange={(e) => setDraft((d) => ({ ...d, reportAllowWhatsApp: e.target.checked }))}
              />
              <span>{strings.reportAllowWhatsAppLabel}</span>
            </label>

            <label className="admin-toggle-row">
              <input
                type="checkbox"
                checked={draft.reportAllowExcel}
                onChange={(e) => setDraft((d) => ({ ...d, reportAllowExcel: e.target.checked }))}
              />
              <span>{strings.reportAllowExcelLabel}</span>
            </label>

            {draft.reportAllowPdf && (
              <div className="admin-sub-group">
                <label className="admin-toggle-row">
                  <input
                    type="checkbox"
                    checked={draft.pdfShowNozzles}
                    onChange={(e) => setDraft((d) => ({ ...d, pdfShowNozzles: e.target.checked }))}
                  />
                  <span>{strings.pdfShowNozzlesLabel}</span>
                </label>

                <label className="admin-toggle-row">
                  <input
                    type="checkbox"
                    checked={draft.pdfShowPayments}
                    onChange={(e) => setDraft((d) => ({ ...d, pdfShowPayments: e.target.checked }))}
                  />
                  <span>{strings.pdfShowPaymentsLabel}</span>
                </label>

                <label className="admin-toggle-row">
                  <input
                    type="checkbox"
                    checked={draft.pdfShowQr}
                    onChange={(e) => setDraft((d) => ({ ...d, pdfShowQr: e.target.checked }))}
                  />
                  <span>{strings.pdfShowQrLabel}</span>
                </label>

                <label className="admin-toggle-row">
                  <input
                    type="checkbox"
                    checked={draft.pdfShowSignatures}
                    onChange={(e) => setDraft((d) => ({ ...d, pdfShowSignatures: e.target.checked }))}
                  />
                  <span>{strings.pdfShowSignaturesLabel}</span>
                </label>

                <label className="admin-toggle-row">
                  <input
                    type="checkbox"
                    checked={draft.pdfShowCredit}
                    onChange={(e) => setDraft((d) => ({ ...d, pdfShowCredit: e.target.checked }))}
                  />
                  <span>{strings.pdfShowCreditLabel}</span>
                </label>

                <label className="admin-field-label" style={{ marginTop: 6 }}>
                  {strings.pdfFooterNoteLabel}
                </label>
                <input
                  type="text"
                  maxLength={90}
                  className="admin-input"
                  placeholder={strings.pdfFooterNotePlaceholder}
                  value={draft.pdfFooterNote}
                  onChange={(e) => setDraft((d) => ({ ...d, pdfFooterNote: e.target.value }))}
                />
              </div>
            )}

            {draft.reportAllowWhatsApp && (
              <div className="admin-sub-group">
                <label className="admin-toggle-row">
                  <input
                    type="checkbox"
                    checked={draft.waShowPayments}
                    onChange={(e) => setDraft((d) => ({ ...d, waShowPayments: e.target.checked }))}
                  />
                  <span>{strings.waShowPaymentsLabel}</span>
                </label>

                <label className="admin-toggle-row">
                  <input
                    type="checkbox"
                    checked={draft.waShowPrices}
                    onChange={(e) => setDraft((d) => ({ ...d, waShowPrices: e.target.checked }))}
                  />
                  <span>{strings.waShowPricesLabel}</span>
                </label>

                <label className="admin-field-label" style={{ marginTop: 6 }}>
                  {strings.waFooterNoteLabel}
                </label>
                <input
                  type="text"
                  maxLength={120}
                  className="admin-input"
                  placeholder={strings.waFooterNotePlaceholder}
                  value={draft.waFooterNote}
                  onChange={(e) => setDraft((d) => ({ ...d, waFooterNote: e.target.value }))}
                />
              </div>
            )}
          </div>

          {/* 4. Google Sheet ID / Web App URL */}
          <div className="admin-card">
            <div className="admin-card-head">
              <FileSpreadsheet className="w-4 h-4 text-[#059669]" />
              <span>{strings.sheetConfigLabel}</span>
            </div>

            <label className="admin-toggle-row" style={{ marginTop: 0, marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={draft.sheetSyncEnabled}
                onChange={(e) => setDraft((d) => ({ ...d, sheetSyncEnabled: e.target.checked }))}
              />
              <span>{strings.sheetSyncToggleLabel}</span>
            </label>

            {draft.sheetSyncEnabled && (
              <>
                <input
                  type="text"
                  dir="ltr"
                  className="admin-input admin-mono"
                  placeholder={strings.sheetConfigPlaceholder}
                  value={draft.sheetUrlOrId}
                  onChange={(e) => setDraft((d) => ({ ...d, sheetUrlOrId: e.target.value }))}
                />
                <div className="admin-hint">{strings.sheetConfigHint}</div>
                <div className="admin-resolved-url" dir="ltr">
                  {resolvedSheet}
                </div>
              </>
            )}
          </div>

          {/* 5. WhatsApp Support Number */}
          <div className="admin-card">
            <div className="admin-card-head">
              <MessageCircle className="w-4 h-4 text-[#25D366]" />
              <span>{strings.supportWhatsAppLabel}</span>
            </div>
            <input
              type="tel"
              inputMode="tel"
              dir="ltr"
              className="admin-input admin-mono"
              placeholder={strings.supportWhatsAppPlaceholder}
              value={draft.supportWhatsApp}
              onChange={(e) => setDraft((d) => ({ ...d, supportWhatsApp: e.target.value }))}
            />
            <div className="admin-hint">{strings.supportWhatsAppHint}</div>
          </div>

          {/* 6. Change Admin Password */}
          <div className="admin-card">
            <div className="admin-card-head">
              <KeyRound className="w-4 h-4 text-[var(--text-secondary)]" />
              <span>{strings.adminPasswordSectionLabel}</span>
            </div>
            <div className="admin-pin-grid">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                className={`admin-input ${pinChangeError ? 'invalid' : ''}`}
                placeholder={strings.currentPasswordPlaceholder}
                value={currentPinInput}
                onChange={(e) => {
                  setCurrentPinInput(e.target.value);
                  if (pinChangeError) setPinChangeError(false);
                }}
              />
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                className={`admin-input ${pinChangeError && newPinInput.trim() === '' ? 'invalid' : ''}`}
                placeholder={strings.newPasswordPlaceholder}
                value={newPinInput}
                onChange={(e) => {
                  setNewPinInput(e.target.value);
                  if (pinChangeError) setPinChangeError(false);
                }}
              />
            </div>
            {pinChangeError ? (
              <div className="pin-error-text" style={{ textAlign: 'start' }}>
                {strings.wrongPasswordError}
              </div>
            ) : (
              <div className="admin-hint">{strings.adminPasswordHint}</div>
            )}
          </div>

          <div className="admin-footer-actions">
            <button
              type="button"
              className="confirm-btn"
              onClick={handleResetDefaults}
              style={{ flex: '0 0 auto', padding: '0 14px' }}
              title={strings.resetDefaultsBtn}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button type="button" className="confirm-btn" onClick={onClose}>
              {strings.cancelBtn}
            </button>
            <button type="submit" className="confirm-btn primary flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />
              <span>{strings.saveBtn}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
