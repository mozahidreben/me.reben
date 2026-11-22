export type FuelType = '91' | '95' | '98' | 'D' | 'K';

export interface FuelPrices {
  p91: string;
  p95: string;
  p98: string;
  pd: string;
  pk: string;
}

export interface AppPayments {
  reben: string;   // ATM
  petro: string;   // Reben APP
  sayyara: string; // Petro APP
  kafarat: string; // Sayyarah APP
  vwallet: string; // Kafart Plus
  car: string;     // V-Wallet
  other: string;   // Other
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

declare global {
  interface Window {
    AndroidBridge?: {
      saveFile: (b64: string, fileName: string, mimeType: string) => void;
      shareFile: (b64: string, fileName: string, mimeType: string, text: string) => void;
      shareWhatsApp: (text: string) => void;
      openUrl: (url: string) => void;
      setNightMode: (isNight: boolean) => void;
    };
    webkitSpeechRecognition?: new () => any;
    SpeechRecognition?: new () => any;
  }
}
