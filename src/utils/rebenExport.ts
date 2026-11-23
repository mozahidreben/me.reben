import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import qrcode from 'qrcode-generator';
import type { FuelPrices, FuelType, NozzleItem, PaymentBreakdown } from '../types/reben.ts';
import { DEFAULT_GOOGLE_SHEET_URL, getAdminConfig, resolveSheetUrl } from './adminConfig.ts';
import { getLicenseWatermarkText } from './license.ts';

interface QrInstance {
  addData(data: string, mode?: string): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}

type JsPDFWithAutoTable = jsPDF & {
  lastAutoTable?: { finalY: number };
};

export const GOOGLE_SHEET_URL = DEFAULT_GOOGLE_SHEET_URL;
export const REPORT_QUEUE_KEY = 'reben_report_queue';

export const IS_ANDROID_APP = typeof window !== 'undefined' && typeof window.AndroidBridge !== 'undefined';

export function cleanStationName(raw: string): string {
  return String(raw || '')
    .replace(/^[\s\u00A0\u200B-\u200F\u2060\uFEFF]+|[\s\u00A0\u200B-\u200F\u2060\uFEFF]+$/g, '')
    .toUpperCase();
}

export function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  return `${day} - ${month} - ${year}`;
}

export function getTopDateStr(isDayTime: boolean): string {
  const d = new Date();
  if (!isDayTime) d.setDate(d.getDate() - 1);
  return formatDate(d);
}

export function shiftPeriod(date: Date): number {
  const localMs = date.getTime() - date.getTimezoneOffset() * 60000;
  return Math.floor((localMs - 6 * 3600000) / (12 * 3600000));
}

export function isFuelUsed(nozzles: NozzleItem[], type: FuelType): boolean {
  return nozzles.some(
    (n) => n.type === type && (n.init.trim() !== '' || n.final.trim() !== '')
  );
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

export function openExternalUrl(url: string) {
  if (IS_ANDROID_APP && window.AndroidBridge) {
    const k = url.indexOf('?text=');
    if (url.startsWith('https://wa.me/') && k > -1) {
      const text = url.substring(k + 6).replace(/%0A/gi, '\n');
      window.AndroidBridge.shareWhatsApp(text);
    } else {
      window.AndroidBridge.openUrl(url);
    }
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

let cachedLogoKey = '';
let cachedLogoInfo: { dataUrl: string; aspectRatio: number } | null = null;

export function loadCompanyLogo(): Promise<{ dataUrl: string; aspectRatio: number } | null> {
  const customDataUrl = getAdminConfig().customLogoDataUrl.trim();
  const primarySrc = customDataUrl || '/logo.png';
  const cacheKey = customDataUrl ? `custom:${customDataUrl.length}:${customDataUrl.slice(0, 48)}` : 'default:/logo.png';

  return new Promise((resolve) => {
    if (cachedLogoInfo && cachedLogoKey === cacheKey) return resolve(cachedLogoInfo);
    const loadSrc = (src: string, allowFallback: boolean) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          const MAX_LOGO_PX = 480;
          const scale = Math.min(1, MAX_LOGO_PX / Math.max(w, h));
          const cw = Math.max(1, Math.round(w * scale));
          const ch = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, cw, ch);
          cachedLogoInfo = {
            dataUrl: canvas.toDataURL('image/png'),
            aspectRatio: w && h ? w / h : 1,
          };
          cachedLogoKey = cacheKey;
          resolve(cachedLogoInfo);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        if (allowFallback && src !== '/pwa-192x192.png') {
          loadSrc('/pwa-192x192.png', false);
        } else {
          resolve(null);
        }
      };
      img.src = src;
    };
    loadSrc(primarySrc, !customDataUrl);
  });
}

function cleanText(v: unknown, max: number): string {
  return String(v === undefined || v === null ? '' : v)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}

function fpNum(x: unknown): string {
  return (Number(x) || 0).toFixed(2);
}

function getDigitalPaymentRows(payments: PaymentBreakdown): Array<{ label: string; amount: number }> {
  if (Array.isArray(payments.items)) {
    return payments.items
      .map((it) => ({
        label: cleanText(it.label, 32) || cleanText(it.id, 16) || 'Payment',
        amount: Number(it.amount) || 0,
      }))
      .filter((it) => it.amount > 0);
  }
  const rows: Array<{ label: string; amount: number }> = [];
  if (payments.r > 0) rows.push({ label: 'ATM', amount: payments.r });
  if (payments.p > 0) rows.push({ label: 'Reben APP', amount: payments.p });
  if (payments.s > 0) rows.push({ label: 'Petro APP', amount: payments.s });
  if (payments.k > 0) rows.push({ label: 'Sayyarah APP', amount: payments.k });
  if (payments.v > 0) rows.push({ label: 'Kafart Plus', amount: payments.v });
  if (payments.c > 0) rows.push({ label: 'V-Wallet', amount: payments.c });
  if (payments.o > 0) rows.push({ label: 'Other', amount: payments.o });
  return rows;
}

export function reportFingerprint(d: {
  station: string;
  reportDate: string;
  shift: string;
  prices: Record<string, number>;
  payments: Record<string, unknown>;
  total: number;
  cash: number;
  totalLiters: number;
  nozzles: Array<{ name: string; type: string; init: number; final: number }>;
}): string {
  const pr = d.prices || {};
  const pay = d.payments || {};
  const parts = [
    'V2',
    String(d.station || '').trim().toUpperCase(),
    String(d.reportDate || ''),
    String(d.shift || '').toUpperCase(),
    fpNum(pr.p91),
    fpNum(pr.p95),
    fpNum(pr.p98),
    fpNum(pr.pd),
    fpNum(pr.pk),
    fpNum(pay.r),
    fpNum(pay.p),
    fpNum(pay.s),
    fpNum(pay.k),
    fpNum(pay.v),
    fpNum(pay.c),
    fpNum(pay.o),
    fpNum(d.total),
    fpNum(d.cash),
    fpNum(d.totalLiters),
  ];
  if (Array.isArray(pay.items)) {
    pay.items.forEach((it) => {
      if (it && typeof it === 'object') {
        const obj = it as { id?: unknown; label?: unknown; amount?: unknown };
        parts.push(
          `${cleanText(obj.id, 24)}:${cleanText(obj.label, 32)}:${fpNum(obj.amount)}`
        );
      }
    });
  }
  (d.nozzles || []).forEach((z) => {
    parts.push(`${String(z.name || '').trim()}:${String(z.type || '')}:${fpNum(z.init)}:${fpNum(z.final)}`);
  });
  const src = parts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).toUpperCase().padStart(8, '0');
}

export function buildReportId(station: string, reportDate: string, shift: string, checksum: string): string {
  const st = String(station || '').trim().toUpperCase();
  const short = (st.split(/[—–-]/)[0] || st).replace(/[^A-Z0-9]/g, '') || st.replace(/[^A-Z0-9]/g, '') || 'STATION';
  const dateCompact = String(reportDate || '').replace(/[\s-]+/g, '').toUpperCase();
  return `${short}-${dateCompact}-${String(shift || '').toUpperCase()}-${checksum}`;
}

export function makeReportToken(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(16);
  try {
    window.crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let t = '';
  for (let i = 0; i < bytes.length; i++) t += abc[bytes[i] % abc.length];
  return t;
}

export function reportApiReady(): boolean {
  const cfg = getAdminConfig();
  if (!cfg.sheetSyncEnabled) return false;
  const apiUrl = resolveSheetUrl(cfg.sheetUrlOrId);
  return /^https:\/\/script\.google\.com\/macros\/s\/[^\s?#]+\/exec$/.test(apiUrl);
}

interface QueuedReport {
  payload: Record<string, unknown>;
  tries: number;
}

function getReportQueue(): QueuedReport[] {
  try {
    return JSON.parse(localStorage.getItem(REPORT_QUEUE_KEY) || '[]') || [];
  } catch {
    return [];
  }
}

function setReportQueue(q: QueuedReport[]) {
  try {
    localStorage.setItem(REPORT_QUEUE_KEY, JSON.stringify(q.slice(-60)));
  } catch {}
}

let reportFlushing = false;

export async function flushReportQueue(onToast?: (msg: string, kind: '' | 'ok' | 'warn', ms?: number) => void) {
  if (reportFlushing || !reportApiReady()) return;
  const targetUrl = resolveSheetUrl();
  const queue = getReportQueue();
  if (!queue.length) return;
  if (!navigator.onLine) {
    onToast?.('⏳ No internet. The report will be sent automatically.', 'warn', 5000);
    return;
  }
  reportFlushing = true;
  try {
    const remaining: QueuedReport[] = [];
    let lastOk: { version?: string } | null = null;
    let rejected: string | null = null;
    let lastErr = '';

    for (const item of queue) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 25000);
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(item.payload),
          redirect: 'follow',
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const json = await res.json();
        if (json && json.ok) {
          lastOk = json;
        } else if (json && json.permanent) {
          rejected = json.error || 'rejected';
        } else {
          throw new Error(json?.error || 'retry');
        }
      } catch (e: unknown) {
        lastErr = e instanceof Error ? e.message : String(e);
        item.tries = (item.tries || 0) + 1;
        if (item.tries < 12) remaining.push(item);
      }
    }
    setReportQueue(remaining);
    if (rejected) {
      onToast?.('⚠ Report was not accepted by the log: ' + rejected, 'warn', 7000);
    } else if (remaining.length) {
      onToast?.(`⏳ Report not sent yet: ${lastErr}. Retrying automatically.`, 'warn', 9000);
    } else if (lastOk) {
      onToast?.('✓ Report saved to the log' + (lastOk.version ? ' · Version ' + lastOk.version : ''), 'ok', 3500);
    }
  } finally {
    reportFlushing = false;
  }
}

export function queueReport(
  payload: Record<string, unknown>,
  onToast?: (msg: string, kind: '' | 'ok' | 'warn', ms?: number) => void
) {
  const q = getReportQueue();
  q.push({ payload, tries: 0 });
  setReportQueue(q);
  flushReportQueue(onToast);
}

export function shareWhatsAppReport(params: {
  station: string;
  isDayTime: boolean;
  prices?: FuelPrices;
  nozzles: NozzleItem[];
  sums: Record<FuelType, number>;
  grandTotalFormatted: string;
  payments: PaymentBreakdown;
}) {
  const { station, isDayTime, prices, nozzles, sums, grandTotalFormatted, payments } = params;
  const shift = isDayTime ? 'Day' : 'Night';
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDateStr = formatDate(yesterday);
  const todayDateStr = formatDate(now);

  const adminCfg = getAdminConfig();
  const currency = cleanText(adminCfg.currencyCode, 8) || 'SAR';
  const brandTitle = cleanText(adminCfg.brandName, 50) || 'Reben';
  const customWaFooter = cleanText(adminCfg.waFooterNote, 120);

  let msg = `*⛽Station Report*%0A%0A`;
  msg += `    *${station}*%0A`;
  msg += `     Date ${!isDayTime ? yesterdayDateStr : todayDateStr}%0A`;
  msg += `     Shift - ${shift}%0A`;
  msg += `     Reporting Time - ${timeStr}%0A%0A`;

  if (adminCfg.waShowPrices && prices) {
    const priceLines: string[] = [];
    if (isFuelUsed(nozzles, '91')) priceLines.push(`91: ${(parseFloat(prices.p91) || 0).toFixed(2)}`);
    if (isFuelUsed(nozzles, '95')) priceLines.push(`95: ${(parseFloat(prices.p95) || 0).toFixed(2)}`);
    if (isFuelUsed(nozzles, '98')) priceLines.push(`98: ${(parseFloat(prices.p98) || 0).toFixed(2)}`);
    if (isFuelUsed(nozzles, 'D')) priceLines.push(`D: ${(parseFloat(prices.pd) || 0).toFixed(2)}`);
    if (isFuelUsed(nozzles, 'K')) priceLines.push(`K: ${(parseFloat(prices.pk) || 0).toFixed(2)}`);
    if (priceLines.length > 0) {
      msg += `---- PRICES (${currency}) ----%0A`;
      msg += `     ${priceLines.join('  |  ')}%0A%0A`;
    }
  }

  msg += `---- SUMMARY ----%0A%0A`;
  if (isFuelUsed(nozzles, '91')) msg += ` *🟢91 Total:* ${sums['91'].toFixed(2)} L%0A`;
  if (isFuelUsed(nozzles, '95')) msg += ` *🔴95 Total:* ${sums['95'].toFixed(2)} L%0A`;
  if (isFuelUsed(nozzles, '98')) msg += ` *🟣98 Total:* ${sums['98'].toFixed(2)} L%0A`;
  if (isFuelUsed(nozzles, 'D')) msg += ` *🟡D   Total:* ${sums['D'].toFixed(2)} L%0A`;
  if (isFuelUsed(nozzles, 'K')) msg += ` *🔵K   Total:* ${sums['K'].toFixed(2)} L%0A`;
  msg += ` *💰Total Amount:* ${grandTotalFormatted} ${currency}%0A%0A`;

  if (adminCfg.waShowPayments) {
    msg += `---- PAYMENTS ----%0A`;
    getDigitalPaymentRows(payments).forEach((row) => {
      msg += `     ${row.label}: ${row.amount.toFixed(2)} ${currency}%0A`;
    });
    msg += `    *CASH💸:* ${payments.cash.toFixed(2)} ${currency}%0A%0A`;
  }

  if (!isDayTime) {
    msg += `*Note* - Closing reading recorded%0A     ${todayDateStr} Morning Time%0A%0A`;
  }
  const wmText = getLicenseWatermarkText();
  if (wmText) {
    msg += `_${wmText}_%0A`;
  }
  msg += `*${customWaFooter || `Thank you for being part of ${brandTitle}!`}*`;
  openExternalUrl(`https://wa.me/?text=${msg}`);
}

export function exportExcelReport(params: {
  station: string;
  isDayTime: boolean;
  prices: FuelPrices;
  nozzles: NozzleItem[];
  sums: Record<FuelType, number>;
  grandTotalFormatted: string;
  payments: PaymentBreakdown;
}) {
  const { station, isDayTime, prices, nozzles, sums, grandTotalFormatted, payments } = params;
  const has91 = isFuelUsed(nozzles, '91');
  const has95 = isFuelUsed(nozzles, '95');
  const has98 = isFuelUsed(nozzles, '98');
  const hasD = isFuelUsed(nozzles, 'D');
  const hasK = isFuelUsed(nozzles, 'K');

  const currency = cleanText(getAdminConfig().currencyCode, 8) || 'SAR';
  const headerInfo = [
    ['STATION', station],
    ['DATE', getTopDateStr(isDayTime)],
    ['SHIFT', isDayTime ? 'Day' : 'Night'],
    ...(has91 ? [['91 PRICE', prices.p91]] : []),
    ...(has95 ? [['95 PRICE', prices.p95]] : []),
    ...(has98 ? [['98 PRICE', prices.p98]] : []),
    ...(hasD ? [['D PRICE', prices.pd]] : []),
    ...(hasK ? [['KEROSENE PRICE', prices.pk]] : []),
    ['GRAND TOTAL', `${grandTotalFormatted} ${currency}`],
    [],
    ['FUEL SUMMARY'],
    ['Fuel', 'Liters', currency],
    ...(has91 ? [['91', sums['91'].toFixed(2), (sums['91'] * (parseFloat(prices.p91) || 0)).toFixed(2)]] : []),
    ...(has95 ? [['95', sums['95'].toFixed(2), (sums['95'] * (parseFloat(prices.p95) || 0)).toFixed(2)]] : []),
    ...(has98 ? [['98', sums['98'].toFixed(2), (sums['98'] * (parseFloat(prices.p98) || 0)).toFixed(2)]] : []),
    ...(hasD ? [['D', sums['D'].toFixed(2), (sums['D'] * (parseFloat(prices.pd) || 0)).toFixed(2)]] : []),
    ...(hasK ? [['K', sums['K'].toFixed(2), (sums['K'] * (parseFloat(prices.pk) || 0)).toFixed(2)]] : []),
    [],
    ['PAYMENTS'],
    ['Type', 'Amount'],
    ...getDigitalPaymentRows(payments).map((row) => [row.label, row.amount.toFixed(2)]),
    ['TOTAL DIGITAL PAYMENTS', payments.appsTotal.toFixed(2)],
    ['CASH', payments.cash.toFixed(2)],
    [],
    ['NOZZLE DETAILS'],
    ['NOZZLE', 'FUEL', 'INITIAL', 'FINAL', 'LITERS'],
  ];

  const nozzleData = nozzles.map((n) => {
    const initVal = parseFloat(n.init) || 0;
    const finalVal = parseFloat(n.final) || 0;
    return [n.name, n.type, initVal, finalVal, Math.max(0, finalVal - initVal).toFixed(2)];
  });

  const ws = XLSX.utils.aoa_to_sheet([...headerInfo, ...nozzleData]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  const fileName = `${station}_Report.xlsx`;
  if (!IS_ANDROID_APP) {
    XLSX.writeFile(wb, fileName);
  } else if (window.AndroidBridge) {
    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    window.AndroidBridge.saveFile(
      b64,
      fileName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  }
}

export async function exportPdfReport(params: {
  mode: 'save' | 'share';
  station: string;
  isDayTime: boolean;
  prices: FuelPrices;
  nozzles: NozzleItem[];
  sums: Record<FuelType, number>;
  payments: PaymentBreakdown;
  onToast?: (msg: string, kind: '' | 'ok' | 'warn', ms?: number) => void;
  pdfFallbackMsg?: string;
}) {
  const { mode, station, isDayTime, prices, nozzles, sums, payments, onToast, pdfFallbackMsg } = params;

  const has91 = isFuelUsed(nozzles, '91');
  const has95 = isFuelUsed(nozzles, '95');
  const has98 = isFuelUsed(nozzles, '98');
  const hasD = isFuelUsed(nozzles, 'D');
  const hasK = isFuelUsed(nozzles, 'K');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true }) as JsPDFWithAutoTable;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  type Rgb = [number, number, number];
  const C_CHAR: Rgb = [38, 38, 38];
  const C_INK: Rgb = [30, 41, 59];
  const C_SLATE: Rgb = [71, 85, 105];
  const C_MUTED: Rgb = [100, 116, 139];
  const C_AMBER: Rgb = [245, 158, 11];
  const C_AMBER_TXT: Rgb = [217, 119, 6];
  const C_KPI_VAL: Rgb = [21, 83, 45];
  const C_NET: Rgb = [180, 83, 9];
  const C_KPI_BG: Rgb = [240, 250, 244];
  const C_KPI_LINE: Rgb = [187, 229, 202];
  const C_NOTE_LINE: Rgb = [253, 230, 138];
  const C_NOTE_BG: Rgb = [254, 243, 199];
  const C_NOTE_TXT: Rgb = [146, 64, 14];
  const C_BAR_BG: Rgb = [248, 250, 252];
  const C_BAR_LINE: Rgb = [226, 232, 240];
  const C_ROW_LINE: Rgb = [229, 231, 235];
  const C_DASH: Rgb = [191, 205, 224];

  const fmt2 = (n: number) =>
    Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const shiftShort = isDayTime ? 'DAY SHIFT (6 AM - 6 PM)' : 'NIGHT SHIFT (6 PM - 6 AM)';
  const time = new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
  const todayDateStr = formatDate(new Date());
  const reportDateStr = getTopDateStr(isDayTime);
  const logoInfo = await loadCompanyLogo();

  const shiftCode = isDayTime ? 'DAY' : 'NIGHT';
  const cleanStation = cleanText(station, 60);

  const fpPrices = {
    p91: parseFloat(prices.p91) || 0,
    p95: parseFloat(prices.p95) || 0,
    p98: parseFloat(prices.p98) || 0,
    pd: parseFloat(prices.pd) || 0,
    pk: parseFloat(prices.pk) || 0,
  };
  const fpNozzles: Array<{ name: string; type: string; init: number; final: number }> = [];
  const openingEdits: Array<{ nozzle: string; from: number; to: number }> = [];

  nozzles.forEach((n, idx) => {
    const nName = cleanText(n.name, 30) || `Nozzle ${idx + 1}`;
    const nInit = parseFloat(n.init) || 0;
    const nFinal = parseFloat(n.final) || 0;
    fpNozzles.push({ name: nName, type: n.type, init: nInit, final: nFinal });
    if (n.initOrig && (parseFloat(n.initOrig) || 0) !== nInit) {
      openingEdits.push({ nozzle: nName, from: parseFloat(n.initOrig) || 0, to: nInit });
    }
  });

  const totalLiters = sums['91'] + sums['95'] + sums['98'] + sums['D'] + sums['K'];
  const reportData = {
    station: cleanStation,
    reportDate: cleanText(reportDateStr, 30),
    shift: shiftCode,
    prices: fpPrices,
    payments: {
      r: payments.r,
      p: payments.p,
      s: payments.s,
      k: payments.k,
      v: payments.v,
      c: payments.c,
      o: payments.o,
      appsTotal: payments.appsTotal,
      items: payments.items,
    },
    total: payments.total,
    cash: payments.cash,
    totalLiters,
    nozzles: fpNozzles,
  };

  const adminCfg = getAdminConfig();
  const activeBrand = cleanText(adminCfg.brandName, 50) || 'Reben Station Shift';
  const currency = cleanText(adminCfg.currencyCode, 8) || 'SAR';
  const customPdfFooter = cleanText(adminCfg.pdfFooterNote, 90);
  const sheetApiUrl = resolveSheetUrl(adminCfg.sheetUrlOrId);
  const checkCode = reportFingerprint(reportData);
  const reportId = buildReportId(reportData.station, reportData.reportDate, shiftCode, checkCode);
  const reportToken = makeReportToken();
  const verifyUrl = reportApiReady() ? `${sheetApiUrl}?t=${reportToken}` : '';
  const qrText = `HTTPS://${checkCode}.R`;
  const qrSize = 15;
  const qrX = pageWidth - margin - qrSize;
  const qrY = 13.5;

  let qrObj: QrInstance | null = null;
  if (adminCfg.pdfShowQr) {
    try {
      qrObj = qrcode(0, 'M') as unknown as QrInstance;
      qrObj.addData(qrText, 'Alphanumeric');
      qrObj.make();
    } catch {
      qrObj = null;
    }
  }

  doc.setProperties({
    title: `${station} - Shift Audit Report - ${reportDateStr}`,
    subject: `Official Station Shift Audit Record - ${reportId}`,
    author: activeBrand,
    creator: activeBrand,
  });

  function drawSectionHeader(title: string, yPos: number) {
    doc.setFillColor(...C_AMBER);
    doc.rect(margin, yPos - 3.2, 1.1, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...C_CHAR);
    doc.text(title, margin + 3, yPos);
  }

  let colAligns: string[] = [];
  let gradeCol = -1;
  const GRADE_COLORS: Record<string, number[]> = {
    '91': [5, 150, 105],
    '95': [220, 38, 38],
    '98': [124, 58, 237],
    D: [180, 83, 9],
    K: [2, 132, 199],
  };

  function gradeKey(t: unknown): string | null {
    const s = String(t).trim();
    if (s === '91' || /\b91\b/.test(s)) return '91';
    if (s === '95' || /\b95\b/.test(s)) return '95';
    if (s === '98' || /\b98\b/.test(s)) return '98';
    if (s === 'D' || /\(D\)/.test(s)) return 'D';
    if (s === 'K' || /\(K\)/.test(s)) return 'K';
    return null;
  }

  function alignHeadFoot(data: any) {
    if (data.section === 'head' || data.section === 'foot') {
      const al = colAligns[data.column.index];
      if (al) data.cell.styles.halign = al;
    }
    if (data.section === 'head') {
      data.cell.text = data.cell.text.map((t: string) => String(t).toUpperCase());
    }
    if (data.section === 'body' && data.column.index === gradeCol) {
      const gk = gradeKey(data.cell.raw);
      if (gk && GRADE_COLORS[gk]) {
        data.cell.styles.textColor = GRADE_COLORS[gk];
        data.cell.styles.fontStyle = 'bold';
      }
    }
  }

  const baseTable = {
    margin: { left: margin, right: margin, top: 18 },
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9.2,
      cellPadding: { top: 1.3, bottom: 1.3, left: 2, right: 2 },
      textColor: C_INK,
      lineWidth: 0,
      valign: 'middle',
    },
    headStyles: {
      fillColor: C_CHAR,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.4,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
    },
    footStyles: { fillColor: false, textColor: C_CHAR, fontStyle: 'bold' },
    didParseCell: (data: any) => alignHeadFoot(data),
    didDrawCell: (data: any) => {
      const cx = data.cell.x;
      const cy = data.cell.y;
      const cw = data.cell.width;
      const ch = data.cell.height;
      if (data.section === 'body' || data.section === 'foot') {
        doc.setDrawColor(...C_ROW_LINE);
        doc.setLineWidth(0.2);
        doc.line(cx, cy + ch, cx + cw, cy + ch);
      }
    },
  };

  let titleX = margin;
  const logoTopY = 14.5;
  const maxLogoH = 13;
  const maxLogoW = 30;

  if (logoInfo && logoInfo.dataUrl) {
    let drawW = maxLogoH * logoInfo.aspectRatio;
    let drawH = maxLogoH;
    if (drawW > maxLogoW) {
      drawW = maxLogoW;
      drawH = maxLogoW / logoInfo.aspectRatio;
    }
    const offsetY = logoTopY + (maxLogoH - drawH) / 2;
    doc.addImage(logoInfo.dataUrl, 'PNG', margin, offsetY, drawW, drawH, 'reben-logo', 'FAST');
    titleX = margin + drawW + 4;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.6);
  const genWidth = doc.getTextWidth(`Generated: ${todayDateStr}, ${time}`);
  const titleRight = (qrObj ? pageWidth - margin - qrSize - 4 : pageWidth - margin) - genWidth - 6;
  let titleSize = 16;
  const titleMaxW = titleRight - titleX;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleSize);
  while (titleSize > 11 && doc.getTextWidth(station) > titleMaxW) {
    titleSize -= 0.5;
    doc.setFontSize(titleSize);
  }
  let titleLines = [station];
  if (doc.getTextWidth(station) > titleMaxW) {
    titleLines = doc.splitTextToSize(station, titleMaxW);
    if (titleLines.length > 2) {
      titleLines = titleLines.slice(0, 2);
      let last = titleLines[1];
      while (last.length > 1 && doc.getTextWidth(last + '...') > titleMaxW) last = last.slice(0, -1);
      titleLines[1] = last + '...';
    }
  }
  doc.setTextColor(...C_CHAR);
  if (titleLines.length === 1) {
    doc.text(titleLines[0], titleX, 22.8);
  } else {
    doc.text(titleLines[0], titleX, 20.2);
    doc.text(titleLines[1], titleX, 24.6);
  }
  const subtitleY = titleLines.length === 1 ? 27.2 : 28.6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...C_MUTED);
  doc.text('STATION SHIFT REPORT', titleX, subtitleY);

  const rightX = qrObj ? pageWidth - margin - qrSize - 4 : pageWidth - margin;
  if (qrObj) {
    const qn = qrObj.getModuleCount();
    const qm = qrSize / qn;
    doc.setFillColor(255, 255, 255);
    doc.rect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6, 'F');
    doc.setFillColor(0, 0, 0);
    for (let r = 0; r < qn; r++) {
      for (let c = 0; c < qn; c++) {
        if (qrObj.isDark(r, c)) doc.rect(qrX + c * qm, qrY + r * qm, qm + 0.03, qm + 0.03, 'F');
      }
    }
    if (verifyUrl) doc.link(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6, { url: verifyUrl });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const dateValW = doc.getTextWidth(reportDateStr);
  doc.setTextColor(...C_SLATE);
  doc.text(reportDateStr, rightX, 18.3, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C_CHAR);
  doc.text('Date: ', rightX - dateValW, 18.3, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C_AMBER_TXT);
  doc.text(shiftShort, rightX, 22.8, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.6);
  doc.setTextColor(...C_SLATE);
  doc.text(`Generated: ${todayDateStr}, ${time}`, rightX, 27.2, { align: 'right' });

  doc.setDrawColor(...C_CHAR);
  doc.setLineWidth(0.5);
  doc.line(margin, 31, pageWidth - margin, 31);

  const barY = 35.3;
  const barH = 7.4;
  doc.setFillColor(...C_BAR_BG);
  doc.setDrawColor(...C_BAR_LINE);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, barY, contentWidth, barH, 1, 1, 'FD');

  const rateParts = [
    has91 ? `91: ${fpPrices.p91.toFixed(2)}` : '',
    has95 ? `95: ${fpPrices.p95.toFixed(2)}` : '',
    has98 ? `98: ${fpPrices.p98.toFixed(2)}` : '',
    hasD ? `D: ${fpPrices.pd.toFixed(2)}` : '',
    hasK ? `K: ${fpPrices.pk.toFixed(2)}` : '',
  ]
    .filter(Boolean)
    .join('  |  ');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(...C_CHAR);
  const rateLabel = 'PRICE:';
  doc.text(rateLabel, margin + 3, barY + 4.7);
  const rateLabelW = doc.getTextWidth(rateLabel);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C_SLATE);
  doc.text(`  ${rateParts}`, margin + 3 + rateLabelW, barY + 4.7);

  const kpiY = 46.6;
  const cardGap = 2.8;
  const cardW = (contentWidth - cardGap * 2) / 3;
  const cardH = 15.5;
  const kpis = [
    { label: 'Total Amount', value: `${fmt2(payments.total)} ${currency}` },
    { label: 'Total Sale', value: `${fmt2(totalLiters)} L` },
    { label: 'Total Cash', value: `${fmt2(payments.cash)} ${currency}` },
  ];

  kpis.forEach((kpi, idx) => {
    const x = margin + idx * (cardW + cardGap);
    doc.setFillColor(...C_KPI_BG);
    doc.setDrawColor(...C_KPI_LINE);
    doc.setLineWidth(0.45);
    doc.roundedRect(x, kpiY, cardW, cardH, 1.6, 1.6, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...C_MUTED);
    doc.text(kpi.label, x + 3.2, kpiY + 5.2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.setTextColor(...C_KPI_VAL);
    doc.text(kpi.value, x + 3.2, kpiY + 12);
  });

  let currentY = kpiY + cardH + 7;
  drawSectionHeader('FUEL SALES', currentY);

  const fuelBody: string[][] = [];
  if (has91) fuelBody.push(['Gasoline 91', fpPrices.p91.toFixed(2), fmt2(sums['91']), fmt2(sums['91'] * fpPrices.p91)]);
  if (has95) fuelBody.push(['Gasoline 95', fpPrices.p95.toFixed(2), fmt2(sums['95']), fmt2(sums['95'] * fpPrices.p95)]);
  if (has98) fuelBody.push(['Gasoline 98', fpPrices.p98.toFixed(2), fmt2(sums['98']), fmt2(sums['98'] * fpPrices.p98)]);
  if (hasD) fuelBody.push(['Diesel (D)', fpPrices.pd.toFixed(2), fmt2(sums['D']), fmt2(sums['D'] * fpPrices.pd)]);
  if (hasK) fuelBody.push(['Kerosene (K)', fpPrices.pk.toFixed(2), fmt2(sums['K']), fmt2(sums['K'] * fpPrices.pk)]);

  colAligns = ['left', 'right', 'right', 'right'];
  gradeCol = 0;
  autoTable(doc, {
    ...(baseTable as Record<string, unknown>),
    head: [['Fuel Type', 'Price', 'Sale (L)', `Total Amount (${currency})`]],
    body: fuelBody,
    foot: [['TOTAL SALES', '--', fmt2(totalLiters), fmt2(payments.total)]],
    startY: currentY + 2.5,
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 42, halign: 'right' },
      2: { cellWidth: 39, halign: 'right' },
      3: { cellWidth: 53, halign: 'right' },
    },
  });

  currentY = doc.lastAutoTable?.finalY ?? currentY;

  if (adminCfg.pdfShowPayments) {
    currentY += 7;
    drawSectionHeader('PAYMENT', currentY);

    const activeDigital: [string, string][] = getDigitalPaymentRows(payments).map((row) => [
      row.label,
      fmt2(row.amount),
    ]);

    const pairedPayRows: string[][] = [];
    for (let i = 0; i < activeDigital.length; i += 2) {
      const left = activeDigital[i];
      const right = activeDigital[i + 1] || ['', ''];
      pairedPayRows.push([left[0], left[1], right[0], right[1]]);
    }
    if (pairedPayRows.length === 0) {
      pairedPayRows.push(['No Digital / App Payments', '0.00', '', '']);
    }

    colAligns = ['left', 'right', 'left', 'right'];
    gradeCol = -1;
    autoTable(doc, {
      ...(baseTable as Record<string, unknown>),
      head: [['Type', `Amount (${currency})`, 'Type', `Amount (${currency})`]],
      body: pairedPayRows,
      foot: [['Total Digital / Apps', fmt2(payments.appsTotal), 'NET CASH IN HAND', fmt2(payments.cash)]],
      startY: currentY + 2.5,
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 36, halign: 'right' },
        2: { cellWidth: 50 },
        3: { cellWidth: 38, halign: 'right' },
      },
      didParseCell: (data: any) => {
        alignHeadFoot(data);
        if (data.section === 'foot' && data.column.index === 3) {
          data.cell.styles.textColor = C_NET;
        }
      },
    });
    currentY = doc.lastAutoTable?.finalY ?? currentY;
  }

  if (adminCfg.pdfShowNozzles) {
    currentY += 7;
    drawSectionHeader('NOZZLE READINGS', currentY);

    const priceMap: Record<FuelType, number> = {
      '91': fpPrices.p91,
      '95': fpPrices.p95,
      '98': fpPrices.p98,
      D: fpPrices.pd,
      K: fpPrices.pk,
    };
    const nozzleRows = nozzles.map((n) => {
      const initVal = parseFloat(n.init) || 0;
      const finalVal = parseFloat(n.final) || 0;
      const liters = Math.max(0, finalVal - initVal);
      const rowAmt = liters * (priceMap[n.type] || 0);
      return [n.name, n.type, fmt2(initVal), fmt2(finalVal), fmt2(liters), fmt2(rowAmt)];
    });

    colAligns = ['left', 'left', 'right', 'right', 'right', 'right'];
    gradeCol = 1;
    autoTable(doc, {
      ...(baseTable as Record<string, unknown>),
      head: [['Nozzle', 'Type', 'Start', 'End', 'Sale (L)', `Amount (${currency})`]],
      body: nozzleRows,
      startY: currentY + 2.5,
      margin: { left: margin, right: margin, top: 18, bottom: 32 },
      alternateRowStyles: { fillColor: [250, 250, 249] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22 },
        2: { cellWidth: 32, halign: 'right' },
        3: { cellWidth: 36, halign: 'right' },
        4: { cellWidth: 33, halign: 'right' },
        5: { cellWidth: 29, halign: 'right' },
      },
    });
  }

  let afterY = (doc.lastAutoTable?.finalY ?? currentY) + 3.8;
  if (afterY > pageHeight - 46) {
    doc.addPage();
    afterY = 20;
  }

  if (!isDayTime) {
    doc.setFillColor(...C_NOTE_BG);
    doc.setDrawColor(...C_NOTE_LINE);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, afterY, contentWidth, 8, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.6);
    doc.setTextColor(...C_NOTE_TXT);
    doc.text(
      `Note: Night shift closing reading recorded on ${todayDateStr} (Morning Time).`,
      margin + 3.2,
      afterY + 5.1
    );
    afterY += 8;
  }

  if (adminCfg.pdfShowSignatures) {
    const sigGap = 10;
    const sigLineW = (contentWidth - sigGap) / 2;
    const sigY = afterY + 8.3;

    doc.setDrawColor(...C_DASH);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1.1, 1.1], 0);
    doc.line(margin, sigY, margin + sigLineW, sigY);
    const rightSigX = margin + sigLineW + sigGap;
    doc.line(rightSigX, sigY, rightSigX + sigLineW, sigY);
    doc.setLineDashPattern([], 0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.6);
    doc.setTextColor(...C_SLATE);
    doc.text('Shift Attendant / Cashier', margin, sigY + 4);
    doc.text('Station Supervisor / Manager', rightSigX, sigY + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C_MUTED);
    doc.text('Name  /  Signature  /  Date', margin, sigY + 8.2);
    doc.text('Name  /  Signature  /  Date', rightSigX, sigY + 8.2);
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (i > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...C_CHAR);
      doc.text(`${station}  -  SHIFT AUDIT REPORT (continued)`, margin, 11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C_MUTED);
      doc.text(reportDateStr, pageWidth - margin, 11, { align: 'right' });
      doc.setDrawColor(...C_CHAR);
      doc.setLineWidth(0.4);
      doc.line(margin, 13.5, pageWidth - margin, 13.5);
    }

    doc.setDrawColor(...C_ROW_LINE);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 19, pageWidth - margin, pageHeight - 19);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...C_MUTED);
    const wmText = getLicenseWatermarkText();
    doc.text(
      (customPdfFooter || `${activeBrand}  •  Official Station Shift Audit Record`) +
        (wmText ? `   •   ${wmText}` : ''),
      margin,
      pageHeight - 14
    );
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 14, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    const idLabel = 'Report ID: ';
    doc.text(idLabel, margin, pageHeight - 9.8);
    const idLabelW = doc.getTextWidth(idLabel);
    doc.setFont('helvetica', 'normal');
    doc.text(
      reportId + '   •   Checksum: ' + checkCode + (adminCfg.pdfShowCredit ? '   •   Designed By- Mozahid' : ''),
      margin + idLabelW,
      pageHeight - 9.8
    );
    if (verifyUrl) doc.link(margin, pageHeight - 13, contentWidth, 4.6, { url: verifyUrl });
  }

  const safeFileName = `${station.replace(/[^A-Z0-9_-]/gi, '_')}_${reportDateStr.replace(/\s+/g, '')}_Report.pdf`;

  if (reportApiReady()) {
    queueReport(
      {
        token: reportToken,
        reportId,
        checksum: checkCode,
        station: reportData.station,
        reportDate: reportData.reportDate,
        shift: shiftCode,
        generatedAt: new Date().toISOString(),
        prices: fpPrices,
        payments: reportData.payments,
        total: reportData.total,
        cash: reportData.cash,
        totalLiters: reportData.totalLiters,
        nozzles: fpNozzles,
        openingEdits,
        mode: mode === 'share' ? 'share' : 'save',
      },
      onToast
    );
  }

  if (mode === 'share') {
    if (IS_ANDROID_APP && window.AndroidBridge) {
      const b64 = await blobToBase64(doc.output('blob'));
      window.AndroidBridge.shareFile(
        b64,
        safeFileName,
        'application/pdf',
        `${station} shift report\nReport ID: ${reportId}`
      );
    } else {
      try {
        const blob = doc.output('blob');
        const file = new File([blob], safeFileName, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${station} - Shift Report`,
            text: `${station} shift report\nReport ID: ${reportId}`,
          });
        } else {
          doc.save(safeFileName);
          onToast?.(pdfFallbackMsg || 'PDF downloaded (file sharing unavailable on this browser).', '', 4000);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        doc.save(safeFileName);
      }
    }
  } else {
    if (!IS_ANDROID_APP) {
      doc.save(safeFileName);
    } else if (window.AndroidBridge) {
      const b64 = await blobToBase64(doc.output('blob'));
      window.AndroidBridge.saveFile(b64, safeFileName, 'application/pdf');
    }
  }
}
