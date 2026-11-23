export type FuelType = '91' | '95' | '98' | 'D' | 'K';

export interface FuelPrices {
  p91: string;
  p95: string;
  p98: string;
  pd: string;
  pk: string;
}

export interface PaymentMethodConfig {
  id: string;
  label: string;
}

export type AppPayments = Record<string, string>;

export interface PaymentBreakdownItem {
  id: string;
  label: string;
  amount: number;
}

export interface PaymentBreakdown {
  total: number;
  appsTotal: number;
  cash: number;
  r: number;
  p: number;
  s: number;
  k: number;
  v: number;
  c: number;
  o: number;
  items?: PaymentBreakdownItem[];
}

export interface NozzleItem {
  id: number;
  name: string;
  type: FuelType;
  init: string;
  final: string;
  initOrig: string;
  locked: boolean;
}

export interface StationWorkspace {
  id: string;
  stationName: string;
  prices: FuelPrices;
  appsVisible: boolean;
  apps: AppPayments;
  nozzles: NozzleItem[];
  isDayTime: boolean;
  updatedAt: number;
}

export type NozzleDeleteMode = 'allow' | 'pin' | 'block';
export type NozzleAddMode = 'allow' | 'pin' | 'block';

export interface AdminConfig {
  brandName: string;
  currencyCode: string;
  sheetUrlOrId: string;
  sheetSyncEnabled: boolean;
  customLogoDataUrl: string;
  supportWhatsApp: string;
  splashEnabled: boolean;
  splashShowName: boolean;
  lockStationPrices: boolean;
  lockNozzleMeta: boolean;
  lockInitialWithPin: boolean;
  lockShiftWithPin: boolean;
  lockHistoryWithPin: boolean;
  lockStationsManage: boolean;
  nozzleAddMode: NozzleAddMode;
  nozzleDeleteMode: NozzleDeleteMode;
  paymentMethods: PaymentMethodConfig[];
  reportAllowPdf: boolean;
  reportAllowWhatsApp: boolean;
  reportAllowExcel: boolean;
  pdfShowNozzles: boolean;
  pdfShowPayments: boolean;
  pdfShowQr: boolean;
  pdfShowSignatures: boolean;
  pdfShowCredit: boolean;
  pdfFooterNote: string;
  waShowPayments: boolean;
  waShowPrices: boolean;
  waFooterNote: string;
}

export interface HistoryShiftEntry {
  id: number;
  timestamp: string;
  date: string;
  shift: 'Day' | 'Night';
  station: string;
  prices: FuelPrices;
  summary: {
    q91: string;
    q95: string;
    q98: string;
    qD: string;
    qK: string;
    total: string;
  };
  payments: PaymentBreakdown;
  nozzles: Array<{
    name: string;
    type: FuelType;
    init: string;
    final: string;
    diff: string;
  }>;
}

export type LicensePlan = 'trial' | 'free_ads' | 'monthly' | 'yearly' | 'lifetime';

export type LicenseStatus =
  | 'trial'
  | 'trial_expired'
  | 'free_ads'
  | 'active'
  | 'grace_expired'
  | 'suspended'
  | 'clock_tamper';

export interface StoredLicenseState {
  mode: 'sheet' | 'offline' | 'free_ads';
  licenseKey: string;
  plan: LicensePlan;
  stationName?: string;
  expiresAt: number; // 0 = lifetime
  lastVerifiedAt: number;
  status?: 'ACTIVE' | 'SUSPENDED';
}

export interface LicenseEvaluation {
  unlocked: boolean;
  status: LicenseStatus;
  mode: 'trial' | 'free_ads' | 'sheet' | 'offline';
  plan: LicensePlan;
  daysLeft: number;
  expiresAt: number;
  deviceId: string;
  licenseKey?: string;
  stationName?: string;
  isTrialWatermark: boolean;
}

declare global {
  interface Window {
    AndroidBridge?: {
      saveFile: (b64: string, fileName: string, mimeType: string) => void;
      shareFile: (b64: string, fileName: string, mimeType: string, text: string) => void;
      shareWhatsApp: (text: string) => void;
      openUrl: (url: string) => void;
      setNightMode: (isNight: boolean) => void;
      setAdsEnabled?: (enabled: boolean) => void;
      showRewardedAd?: (placement: string, callbackName: string) => void;
      showInterstitialAd?: (placement: string) => void;
    };
    webkitSpeechRecognition?: new () => any;
    SpeechRecognition?: new () => any;
  }
}

