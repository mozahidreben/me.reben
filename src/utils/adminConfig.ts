import type { AdminConfig, PaymentMethodConfig } from '../types/reben.ts';

export const ADMIN_CONFIG_KEY = 'reben_admin_config_v1';
export const HISTORY_PIN_KEY = 'reben_history_pin';
export const DEFAULT_ADMIN_PIN = '1234';

export const DEFAULT_GOOGLE_SHEET_URL =
  'https://script.google.com/macros/s/AKfycbyLrGK3QJ2OJbA421kNuY68KLjSjkAVqm7GDdnctrTaRPwpjlwXORv6PyWc14Uek-Qfpg/exec';

export const DEFAULT_PAYMENT_METHODS: PaymentMethodConfig[] = [
  { id: 'reben', label: 'ATM' },
  { id: 'petro', label: 'Reben APP' },
  { id: 'sayyara', label: 'Petro APP' },
  { id: 'kafarat', label: 'Sayyarah APP' },
  { id: 'vwallet', label: 'Kafart Plus' },
  { id: 'car', label: 'V-Wallet' },
  { id: 'other', label: 'Other' },
];

export function sanitizePaymentMethods(raw: unknown): PaymentMethodConfig[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m }));
  }
  const seen = new Set<string>();
  const out: PaymentMethodConfig[] = [];
  raw.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const obj = item as Partial<PaymentMethodConfig>;
    const rawId = typeof obj.id === 'string' ? obj.id.trim() : '';
    const id = (rawId || `pm_${idx + 1}`).replace(/[^A-Za-z0-9_-]/g, '');
    const label = typeof obj.label === 'string' ? obj.label.trim().slice(0, 32) : '';
    if (!id || !label || seen.has(id)) return;
    seen.add(id);
    out.push({ id, label });
  });
  return out;
}

export const DEFAULT_ADMIN_CONFIG: AdminConfig = {
  brandName: 'Reben Station Shift',
  currencyCode: 'SAR',
  sheetUrlOrId: '',
  sheetSyncEnabled: true,
  customLogoDataUrl: '',
  supportWhatsApp: '',
  splashEnabled: true,
  splashShowName: true,
  lockStationPrices: false,
  lockNozzleMeta: false,
  lockInitialWithPin: false,
  lockShiftWithPin: false,
  lockHistoryWithPin: false,
  lockStationsManage: false,
  nozzleAddMode: 'allow',
  nozzleDeleteMode: 'allow',
  paymentMethods: DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m })),
  reportAllowPdf: true,
  reportAllowWhatsApp: true,
  reportAllowExcel: true,
  pdfShowNozzles: true,
  pdfShowPayments: true,
  pdfShowQr: true,
  pdfShowSignatures: true,
  pdfShowCredit: true,
  pdfFooterNote: '',
  waShowPayments: true,
  waShowPrices: false,
  waFooterNote: '',
};

export function getStoredAdminPin(): string {
  try {
    const val = localStorage.getItem(HISTORY_PIN_KEY);
    return val && val.trim() ? val.trim() : DEFAULT_ADMIN_PIN;
  } catch {
    return DEFAULT_ADMIN_PIN;
  }
}

export function verifyAdminPin(pin: string): boolean {
  return pin.trim() === getStoredAdminPin();
}

export function updateAdminPin(currentPin: string, nextPin: string): boolean {
  const cleanedNext = nextPin.trim();
  if (!verifyAdminPin(currentPin) || cleanedNext.length === 0) {
    return false;
  }
  try {
    localStorage.setItem(HISTORY_PIN_KEY, cleanedNext);
  } catch {}
  return true;
}

export function getAdminConfig(): AdminConfig {
  try {
    const raw = localStorage.getItem(ADMIN_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_ADMIN_CONFIG };
    const parsed = JSON.parse(raw) as Partial<AdminConfig>;
    return {
      brandName: typeof parsed.brandName === 'string' && parsed.brandName.trim()
        ? parsed.brandName
        : DEFAULT_ADMIN_CONFIG.brandName,
      currencyCode: typeof parsed.currencyCode === 'string' && parsed.currencyCode.trim()
        ? parsed.currencyCode.trim().toUpperCase().slice(0, 8)
        : DEFAULT_ADMIN_CONFIG.currencyCode,
      sheetUrlOrId: typeof parsed.sheetUrlOrId === 'string' ? parsed.sheetUrlOrId : '',
      sheetSyncEnabled: parsed.sheetSyncEnabled !== undefined ? Boolean(parsed.sheetSyncEnabled) : true,
      customLogoDataUrl: typeof parsed.customLogoDataUrl === 'string' ? parsed.customLogoDataUrl : '',
      supportWhatsApp: typeof parsed.supportWhatsApp === 'string' ? parsed.supportWhatsApp : '',
      splashEnabled: parsed.splashEnabled !== undefined ? Boolean(parsed.splashEnabled) : true,
      splashShowName: parsed.splashShowName !== undefined ? Boolean(parsed.splashShowName) : true,
      lockStationPrices: Boolean(parsed.lockStationPrices),
      lockNozzleMeta: Boolean(parsed.lockNozzleMeta),
      lockInitialWithPin: Boolean(parsed.lockInitialWithPin),
      lockShiftWithPin: Boolean(parsed.lockShiftWithPin),
      lockHistoryWithPin: Boolean(parsed.lockHistoryWithPin),
      lockStationsManage: Boolean(parsed.lockStationsManage),
      nozzleAddMode:
        parsed.nozzleAddMode === 'pin' || parsed.nozzleAddMode === 'block'
          ? parsed.nozzleAddMode
          : 'allow',
      nozzleDeleteMode:
        parsed.nozzleDeleteMode === 'pin' || parsed.nozzleDeleteMode === 'block'
          ? parsed.nozzleDeleteMode
          : 'allow',
      paymentMethods:
        parsed.paymentMethods !== undefined
          ? sanitizePaymentMethods(parsed.paymentMethods)
          : DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m })),
      reportAllowPdf: parsed.reportAllowPdf !== undefined ? Boolean(parsed.reportAllowPdf) : true,
      reportAllowWhatsApp: parsed.reportAllowWhatsApp !== undefined ? Boolean(parsed.reportAllowWhatsApp) : true,
      reportAllowExcel: parsed.reportAllowExcel !== undefined ? Boolean(parsed.reportAllowExcel) : true,
      pdfShowNozzles: parsed.pdfShowNozzles !== undefined ? Boolean(parsed.pdfShowNozzles) : true,
      pdfShowPayments: parsed.pdfShowPayments !== undefined ? Boolean(parsed.pdfShowPayments) : true,
      pdfShowQr: parsed.pdfShowQr !== undefined ? Boolean(parsed.pdfShowQr) : true,
      pdfShowSignatures: parsed.pdfShowSignatures !== undefined ? Boolean(parsed.pdfShowSignatures) : true,
      pdfShowCredit: parsed.pdfShowCredit !== undefined ? Boolean(parsed.pdfShowCredit) : true,
      pdfFooterNote: typeof parsed.pdfFooterNote === 'string' ? parsed.pdfFooterNote : '',
      waShowPayments: parsed.waShowPayments !== undefined ? Boolean(parsed.waShowPayments) : true,
      waShowPrices: Boolean(parsed.waShowPrices),
      waFooterNote: typeof parsed.waFooterNote === 'string' ? parsed.waFooterNote : '',
    };
  } catch {
    return { ...DEFAULT_ADMIN_CONFIG };
  }
}

export function saveAdminConfig(config: AdminConfig): void {
  try {
    localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(config));
  } catch {}
}

/**
 * Accepts either a full Google Apps Script Web App URL or just a Deployment ID (AKfycb...).
 * Falls back to the built-in default URL when empty.
 */
export function resolveSheetUrl(rawInput?: string): string {
  const input = String(rawInput ?? getAdminConfig().sheetUrlOrId ?? '').trim();
  if (!input) return DEFAULT_GOOGLE_SHEET_URL;
  if (/^https?:\/\//i.test(input)) return input;
  const cleanedId = input.replace(/[^A-Za-z0-9_-]/g, '');
  if (!cleanedId) return DEFAULT_GOOGLE_SHEET_URL;
  return `https://script.google.com/macros/s/${cleanedId}/exec`;
}

export function formatWhatsAppSupportUrl(phone: string): string {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  return digits ? `https://wa.me/${digits}` : '';
}

export function compressLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const maxPx = 360;
        const scale = Math.min(1, maxPx / Math.max(w, h, 1));
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable.'));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, cw, ch);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}
