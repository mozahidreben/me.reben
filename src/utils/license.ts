import type { LicenseEvaluation, LicensePlan, StoredLicenseState } from '../types/reben.ts';

const DEVICE_ID_KEY = 'reben_device_id_v1';
const DEVICE_ID_BACKUP_KEY = 'reben_did_bkp_v1';
const TRIAL_META_KEY = 'reben_trial_meta_v1';
const LICENSE_STATE_KEY = 'reben_license_state_v1';
const PUBLIC_KEY_CACHE_KEY = 'reben_license_pubjwk_v1';
const MASTER_SHEET_CACHE_KEY = 'reben_license_master_sheet_v1';
const SELLER_WA_CACHE_KEY = 'reben_license_seller_wa_v1';

export const TRIAL_DURATION_DAYS = 7;
export const OFFLINE_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * DAY_MS;
const OFFLINE_GRACE_MS = OFFLINE_GRACE_DAYS * DAY_MS;
const CLOCK_SKEW_TOLERANCE_MS = 60 * 60 * 1000; // 1 hour

interface TrialMeta {
  startedAt: number;
  maxSeenAt: number;
}

interface OfflineSignedPayload {
  v: number;
  kid?: string;
  d: string; // deviceId or '*'
  p: LicensePlan;
  s?: string; // stationName
  i: number; // issuedAt
  e: number; // expiresAt (0 = lifetime)
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY) || localStorage.getItem(DEVICE_ID_BACKUP_KEY);
    if (existing && /^RBN-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(existing.trim())) {
      const clean = existing.trim();
      localStorage.setItem(DEVICE_ID_KEY, clean);
      localStorage.setItem(DEVICE_ID_BACKUP_KEY, clean);
      return clean;
    }
  } catch {}

  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  try {
    window.crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let raw = '';
  for (let i = 0; i < 8; i++) {
    raw += alphabet[bytes[i] % alphabet.length];
  }
  const id = `RBN-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
    localStorage.setItem(DEVICE_ID_BACKUP_KEY, id);
  } catch {}
  return id;
}

function getOrInitTrialMeta(): { meta: TrialMeta; clockTampered: boolean } {
  const now = Date.now();
  try {
    const raw = localStorage.getItem(TRIAL_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TrialMeta>;
      if (typeof parsed.startedAt === 'number' && typeof parsed.maxSeenAt === 'number') {
        const clockTampered = now + CLOCK_SKEW_TOLERANCE_MS < parsed.maxSeenAt;
        const nextMax = Math.max(parsed.maxSeenAt, now);
        const updated: TrialMeta = { startedAt: parsed.startedAt, maxSeenAt: nextMax };
        if (nextMax > parsed.maxSeenAt) {
          localStorage.setItem(TRIAL_META_KEY, JSON.stringify(updated));
        }
        return { meta: updated, clockTampered };
      }
    }
  } catch {}

  const fresh: TrialMeta = { startedAt: now, maxSeenAt: now };
  try {
    localStorage.setItem(TRIAL_META_KEY, JSON.stringify(fresh));
  } catch {}
  return { meta: fresh, clockTampered: false };
}

function getBundledPublicKeyJwk(): JsonWebKey | null {
  const envVal = String(import.meta.env.VITE_LICENSE_PUBLIC_KEY || '').trim();
  if (envVal) {
    try {
      if (envVal.startsWith('{')) {
        return JSON.parse(envVal) as JsonWebKey;
      }
      return JSON.parse(bytesToUtf8(base64UrlToBytes(envVal))) as JsonWebKey;
    } catch {}
  }
  try {
    const cached = localStorage.getItem(PUBLIC_KEY_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as JsonWebKey;
    }
  } catch {}
  return null;
}

export function getMasterLicenseSheetUrl(): string {
  const envUrl = String(import.meta.env.VITE_LICENSE_SHEET_URL || '').trim();
  if (/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/i.test(envUrl)) {
    return envUrl;
  }
  try {
    const cached = (localStorage.getItem(MASTER_SHEET_CACHE_KEY) || '').trim();
    if (/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/i.test(cached)) {
      return cached;
    }
  } catch {}
  return '';
}

export function getSellerWhatsAppNumber(): string {
  try {
    return (localStorage.getItem(SELLER_WA_CACHE_KEY) || '').replace(/[^\d]/g, '');
  } catch {
    return '';
  }
}

export async function hydrateLicenseRuntimeConfig(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    const res = await fetch('/api/license/public-key');
    if (!res.ok) return;
    const data = (await res.json()) as {
      publicKeyJwk?: JsonWebKey;
      masterSheetUrl?: string;
      sellerWhatsApp?: string;
    };
    if (data?.publicKeyJwk && !import.meta.env.VITE_LICENSE_PUBLIC_KEY) {
      localStorage.setItem(PUBLIC_KEY_CACHE_KEY, JSON.stringify(data.publicKeyJwk));
    }
    if (typeof data?.masterSheetUrl === 'string' && !import.meta.env.VITE_LICENSE_SHEET_URL) {
      if (data.masterSheetUrl) {
        localStorage.setItem(MASTER_SHEET_CACHE_KEY, data.masterSheetUrl);
      } else {
        localStorage.removeItem(MASTER_SHEET_CACHE_KEY);
      }
    }
    if (typeof data?.sellerWhatsApp === 'string') {
      if (data.sellerWhatsApp) {
        localStorage.setItem(SELLER_WA_CACHE_KEY, data.sellerWhatsApp);
      } else {
        localStorage.removeItem(SELLER_WA_CACHE_KEY);
      }
    }
  } catch {
    // Offline or standalone APK build without local Node server
  }
}

export function getStoredLicenseState(): StoredLicenseState | null {
  try {
    const raw = localStorage.getItem(LICENSE_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLicenseState;
    if (!parsed || !parsed.licenseKey || !parsed.mode) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredLicenseState(state: StoredLicenseState | null): void {
  try {
    if (!state) {
      localStorage.removeItem(LICENSE_STATE_KEY);
    } else {
      localStorage.setItem(LICENSE_STATE_KEY, JSON.stringify(state));
    }
  } catch {}
}

export async function verifyOfflineSignedCode(
  rawCode: string,
  expectedDeviceId: string
): Promise<{ ok: true; payload: OfflineSignedPayload } | { ok: false; error: string }> {
  const cleaned = rawCode.trim();
  const parts = cleaned.split('.');
  if (parts.length !== 3 || parts[0] !== 'RBN1') {
    return { ok: false, error: 'INVALID_FORMAT' };
  }
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) {
    return { ok: false, error: 'INVALID_FORMAT' };
  }

  let publicJwk = getBundledPublicKeyJwk();
  if (!publicJwk) {
    await hydrateLicenseRuntimeConfig();
    publicJwk = getBundledPublicKeyJwk();
  }
  if (!publicJwk) {
    return { ok: false, error: 'NO_PUBLIC_KEY' };
  }
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    return { ok: false, error: 'CRYPTO_UNAVAILABLE' };
  }

  try {
    const key = await window.crypto.subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const sigBytes = base64UrlToBytes(sigB64);
    const dataBytes = utf8ToBytes(payloadB64);
    const valid = await window.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      sigBytes.buffer as ArrayBuffer,
      dataBytes.buffer as ArrayBuffer
    );
    if (!valid) {
      return { ok: false, error: 'INVALID_SIGNATURE' };
    }

    const payload = JSON.parse(bytesToUtf8(base64UrlToBytes(payloadB64))) as OfflineSignedPayload;
    const targetDevice = String(payload?.d || '').trim().toUpperCase();
    if (!targetDevice || (targetDevice !== '*' && targetDevice !== expectedDeviceId.toUpperCase())) {
      return { ok: false, error: 'DEVICE_MISMATCH' };
    }

    if (typeof payload.e === 'number' && payload.e > 0 && Date.now() > payload.e) {
      return { ok: false, error: 'LICENSE_EXPIRED' };
    }

    return { ok: true, payload };
  } catch {
    return { ok: false, error: 'INVALID_FORMAT' };
  }
}

export async function evaluateLicenseStatus(): Promise<LicenseEvaluation> {
  const deviceId = getOrCreateDeviceId();
  const { meta, clockTampered } = getOrInitTrialMeta();
  const now = Date.now();
  const stored = getStoredLicenseState();

  if (clockTampered) {
    return {
      unlocked: false,
      status: 'clock_tamper',
      mode: stored?.mode || 'trial',
      plan: stored?.plan || 'trial',
      daysLeft: 0,
      expiresAt: stored?.expiresAt || meta.startedAt + TRIAL_DURATION_MS,
      deviceId,
      licenseKey: stored?.licenseKey,
      stationName: stored?.stationName,
      isTrialWatermark: true,
    };
  }

  // Ad-Supported Free Mode (unlocked with banner + report ad gate)
  if (stored?.mode === 'free_ads') {
    return {
      unlocked: true,
      status: 'free_ads',
      mode: 'free_ads',
      plan: 'free_ads',
      daysLeft: 0,
      expiresAt: 0,
      deviceId,
      licenseKey: stored.licenseKey || 'FREE-ADS',
      stationName: stored.stationName,
      isTrialWatermark: true,
    };
  }

  // Option 3: Cryptographically re-verify stored offline code on every evaluation
  if (stored?.mode === 'offline') {
    const check = await verifyOfflineSignedCode(stored.licenseKey, deviceId);
    if (check.ok) {
      const exp = check.payload.e || 0;
      const daysLeft = exp === 0 ? 9999 : Math.max(0, Math.ceil((exp - now) / DAY_MS));
      const isTrialPlan = check.payload.p === 'trial';
      return {
        unlocked: true,
        status: isTrialPlan ? 'trial' : 'active',
        mode: 'offline',
        plan: check.payload.p,
        daysLeft,
        expiresAt: exp,
        deviceId,
        licenseKey: stored.licenseKey,
        stationName: check.payload.s || stored.stationName,
        isTrialWatermark: isTrialPlan,
      };
    }
    if (check.error === 'LICENSE_EXPIRED') {
      return {
        unlocked: false,
        status: 'trial_expired',
        mode: 'offline',
        plan: stored.plan,
        daysLeft: 0,
        expiresAt: stored.expiresAt,
        deviceId,
        licenseKey: stored.licenseKey,
        stationName: stored.stationName,
        isTrialWatermark: true,
      };
    }
  }

  // Option 1: Master Google Sheet license with 7-day offline grace window
  if (stored?.mode === 'sheet') {
    if (stored.status === 'SUSPENDED') {
      return {
        unlocked: false,
        status: 'suspended',
        mode: 'sheet',
        plan: stored.plan,
        daysLeft: 0,
        expiresAt: stored.expiresAt,
        deviceId,
        licenseKey: stored.licenseKey,
        stationName: stored.stationName,
        isTrialWatermark: true,
      };
    }
    if (stored.expiresAt > 0 && now > stored.expiresAt) {
      return {
        unlocked: false,
        status: 'trial_expired',
        mode: 'sheet',
        plan: stored.plan,
        daysLeft: 0,
        expiresAt: stored.expiresAt,
        deviceId,
        licenseKey: stored.licenseKey,
        stationName: stored.stationName,
        isTrialWatermark: true,
      };
    }
    if (now - (stored.lastVerifiedAt || 0) > OFFLINE_GRACE_MS) {
      return {
        unlocked: false,
        status: 'grace_expired',
        mode: 'sheet',
        plan: stored.plan,
        daysLeft: 0,
        expiresAt: stored.expiresAt,
        deviceId,
        licenseKey: stored.licenseKey,
        stationName: stored.stationName,
        isTrialWatermark: stored.plan === 'trial',
      };
    }
    const daysLeft =
      stored.expiresAt === 0 ? 9999 : Math.max(0, Math.ceil((stored.expiresAt - now) / DAY_MS));
    const isTrialPlan = stored.plan === 'trial';
    return {
      unlocked: true,
      status: isTrialPlan ? 'trial' : 'active',
      mode: 'sheet',
      plan: stored.plan,
      daysLeft,
      expiresAt: stored.expiresAt,
      deviceId,
      licenseKey: stored.licenseKey,
      stationName: stored.stationName,
      isTrialWatermark: isTrialPlan,
    };
  }

  // Default 7-day automatic trial
  const trialEndsAt = meta.startedAt + TRIAL_DURATION_MS;
  const remainingMs = trialEndsAt - now;
  if (remainingMs > 0) {
    return {
      unlocked: true,
      status: 'trial',
      mode: 'trial',
      plan: 'trial',
      daysLeft: Math.max(1, Math.ceil(remainingMs / DAY_MS)),
      expiresAt: trialEndsAt,
      deviceId,
      isTrialWatermark: true,
    };
  }

  return {
    unlocked: false,
    status: 'trial_expired',
    mode: 'trial',
    plan: 'trial',
    daysLeft: 0,
    expiresAt: trialEndsAt,
    deviceId,
    isTrialWatermark: true,
  };
}

export async function activateLicenseKey(params: {
  inputKey: string;
  stationName?: string;
}): Promise<{ ok: true; evaluation: LicenseEvaluation } | { ok: false; errorCode: string }> {
  const deviceId = getOrCreateDeviceId();
  const trimmed = params.inputKey.trim();
  if (!trimmed) {
    return { ok: false, errorCode: 'INVALID_KEY' };
  }

  // Option 3: Offline Signed Activation Code (RBN1.<payload>.<sig>)
  if (trimmed.startsWith('RBN1.')) {
    const res = await verifyOfflineSignedCode(trimmed, deviceId);
    if (!res.ok) {
      return { ok: false, errorCode: res.error };
    }
    saveStoredLicenseState({
      mode: 'offline',
      licenseKey: trimmed,
      plan: res.payload.p || 'yearly',
      stationName: res.payload.s || params.stationName || '',
      expiresAt: res.payload.e || 0,
      lastVerifiedAt: Date.now(),
      status: 'ACTIVE',
    });
    const evaluation = await evaluateLicenseStatus();
    return { ok: true, evaluation };
  }

  // Option 1: Master Google Sheet Web App License Key
  let sheetUrl = getMasterLicenseSheetUrl();
  if (!sheetUrl) {
    await hydrateLicenseRuntimeConfig();
    sheetUrl = getMasterLicenseSheetUrl();
  }
  if (!sheetUrl) {
    return { ok: false, errorCode: 'SHEET_UNCONFIGURED' };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, errorCode: 'OFFLINE' };
  }

  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'activate',
        licenseKey: trimmed.toUpperCase(),
        deviceId,
        stationName: (params.stationName || '').trim(),
      }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    window.clearTimeout(timer);

    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      plan?: LicensePlan;
      expiresAt?: number;
      stationName?: string;
      serverTime?: number;
    };

    if (!json || !json.ok) {
      return { ok: false, errorCode: json?.error || 'INVALID_KEY' };
    }

    const serverNow = typeof json.serverTime === 'number' ? json.serverTime : Date.now();
    // Reset maxSeenAt using server clock if legitimate online activation succeeded
    try {
      const rawMeta = localStorage.getItem(TRIAL_META_KEY);
      const parsedMeta = rawMeta ? (JSON.parse(rawMeta) as Partial<TrialMeta>) : {};
      localStorage.setItem(
        TRIAL_META_KEY,
        JSON.stringify({
          startedAt: typeof parsedMeta.startedAt === 'number' ? parsedMeta.startedAt : serverNow,
          maxSeenAt: serverNow,
        })
      );
    } catch {}

    saveStoredLicenseState({
      mode: 'sheet',
      licenseKey: trimmed.toUpperCase(),
      plan: json.plan || 'yearly',
      stationName: json.stationName || params.stationName || '',
      expiresAt: typeof json.expiresAt === 'number' ? json.expiresAt : 0,
      lastVerifiedAt: Date.now(),
      status: 'ACTIVE',
    });

    const evaluation = await evaluateLicenseStatus();
    return { ok: true, evaluation };
  } catch {
    return { ok: false, errorCode: 'NETWORK_ERROR' };
  }
}

export async function verifySheetLicenseInBackground(): Promise<LicenseEvaluation | null> {
  const stored = getStoredLicenseState();
  if (!stored || stored.mode !== 'sheet') return null;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;

  const sheetUrl = getMasterLicenseSheetUrl();
  if (!sheetUrl) return null;

  const deviceId = getOrCreateDeviceId();
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'verify',
        licenseKey: stored.licenseKey,
        deviceId,
      }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    window.clearTimeout(timer);

    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      plan?: LicensePlan;
      expiresAt?: number;
      stationName?: string;
      serverTime?: number;
    };

    if (!json) return null;

    if (json.ok) {
      saveStoredLicenseState({
        ...stored,
        plan: json.plan || stored.plan,
        expiresAt: typeof json.expiresAt === 'number' ? json.expiresAt : stored.expiresAt,
        stationName: json.stationName || stored.stationName,
        lastVerifiedAt: Date.now(),
        status: 'ACTIVE',
      });
    } else if (json.error === 'LICENSE_SUSPENDED') {
      saveStoredLicenseState({ ...stored, status: 'SUSPENDED', lastVerifiedAt: Date.now() });
    } else if (json.error === 'LICENSE_EXPIRED') {
      saveStoredLicenseState({
        ...stored,
        expiresAt: typeof json.expiresAt === 'number' ? json.expiresAt : Date.now() - 1000,
        lastVerifiedAt: Date.now(),
      });
    } else if (json.error === 'DEVICE_NOT_BOUND' || json.error === 'INVALID_KEY') {
      saveStoredLicenseState({ ...stored, status: 'SUSPENDED', lastVerifiedAt: Date.now() });
    }
    return evaluateLicenseStatus();
  } catch {
    return null;
  }
}

export function buildLicenseWhatsAppUrl(params: {
  fallbackSupportPhone?: string;
  stationName?: string;
  deviceId: string;
}): string {
  const sellerPhone = getSellerWhatsAppNumber() || String(params.fallbackSupportPhone || '').replace(/[^\d]/g, '');
  const text = encodeURIComponent(
    `Hello! I would like to activate/renew my Reben Station Shift license.\nDevice ID: ${params.deviceId}${
      params.stationName?.trim() ? `\nStation: ${params.stationName.trim()}` : ''
    }`
  );
  return sellerPhone ? `https://wa.me/${sellerPhone}?text=${text}` : `https://wa.me/?text=${text}`;
}

export async function activateFreeWithAdsPlan(stationName?: string): Promise<LicenseEvaluation> {
  saveStoredLicenseState({
    mode: 'free_ads',
    licenseKey: 'FREE-ADS',
    plan: 'free_ads',
    stationName: (stationName || '').trim(),
    expiresAt: 0,
    lastVerifiedAt: Date.now(),
    status: 'ACTIVE',
  });
  return evaluateLicenseStatus();
}

export function getLicenseWatermarkText(): string {
  try {
    const stored = getStoredLicenseState();
    if (!stored) return 'TRIAL VERSION';
    if (stored.mode === 'free_ads' || stored.plan === 'free_ads') {
      return 'FREE VERSION (AD-SUPPORTED)';
    }
    if (stored.plan === 'trial') return 'TRIAL VERSION';
    if (stored.status === 'SUSPENDED') return 'TRIAL VERSION';
    if (stored.expiresAt > 0 && Date.now() > stored.expiresAt) return 'TRIAL VERSION';
    return '';
  } catch {
    return 'TRIAL VERSION';
  }
}

export function isLicenseWatermarkActive(): boolean {
  return getLicenseWatermarkText() !== '';
}

// Seller preview test helpers
export function simulateTrialExpiredForTest(): void {
  const past = Date.now() - (TRIAL_DURATION_DAYS + 1) * DAY_MS;
  try {
    localStorage.removeItem(LICENSE_STATE_KEY);
    localStorage.setItem(TRIAL_META_KEY, JSON.stringify({ startedAt: past, maxSeenAt: Date.now() }));
  } catch {}
}

export function simulateFreeAdsModeForTest(): void {
  saveStoredLicenseState({
    mode: 'free_ads',
    licenseKey: 'FREE-ADS',
    plan: 'free_ads',
    expiresAt: 0,
    lastVerifiedAt: Date.now(),
    status: 'ACTIVE',
  });
}

export function resetTrialForTest(): void {
  const now = Date.now();
  try {
    localStorage.removeItem(LICENSE_STATE_KEY);
    localStorage.setItem(TRIAL_META_KEY, JSON.stringify({ startedAt: now, maxSeenAt: now }));
  } catch {}
}
