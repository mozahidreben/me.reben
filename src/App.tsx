import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  FileSpreadsheet,
  FileText,
  History,
  Lock,
  LockOpen,
  Mic,
  Minus,
  Moon,
  Plus,
  RefreshCw,
  Share2,
  Sun,
  Trash2,
  Volume2,
} from 'lucide-react';
import { GUIDE_CONTENT } from './data/guideContent.ts';
import type { GuideLang } from './data/guideContent.ts';
import { APP_I18N } from './data/appI18n.ts';
import type {
  AdminConfig,
  AppPayments,
  FuelPrices,
  FuelType,
  HistoryShiftEntry,
  LicenseEvaluation,
  NozzleItem,
  PaymentBreakdown,
  StationWorkspace,
} from './types/reben.ts';
import {
  IS_ANDROID_APP,
  cleanStationName,
  exportExcelReport,
  exportPdfReport,
  flushReportQueue,
  formatDate,
  getTopDateStr,
  isFuelUsed,
  shareWhatsAppReport,
  shiftPeriod,
} from './utils/rebenExport.ts';
import { getAdminConfig, resolveSheetUrl, saveAdminConfig, verifyAdminPin } from './utils/adminConfig.ts';
import {
  evaluateLicenseStatus,
  getOrCreateDeviceId,
  hydrateLicenseRuntimeConfig,
  verifySheetLicenseInBackground,
} from './utils/license.ts';
import { TutorialModal } from './components/TutorialModal.tsx';
import { ScannerModal } from './components/ScannerModal.tsx';
import { HistoryModal } from './components/HistoryModal.tsx';
import { PWAInstallButton } from './components/PWAInstallButton.tsx';
import { StationSwitcherModal } from './components/StationSwitcherModal.tsx';
import { SplashScreen } from './components/SplashScreen.tsx';
import { AdminSettingsModal } from './components/AdminSettingsModal.tsx';
import { LicenseGateModal } from './components/LicenseGateModal.tsx';
import { SellerStudioModal } from './components/SellerStudioModal.tsx';
import { AdBannerBar } from './components/AdBannerBar.tsx';
import { AdGateModal } from './components/AdGateModal.tsx';
import { isAdSupportedMode, requestNativeRewardedAd, syncAndroidAdsState } from './utils/ads.ts';

const MEM_KEY = 'reben_v3_premium';
const STATIONS_KEY = 'reben_stations_v1';
const HISTORY_KEY = 'reben_history';
const LANG_KEY = 'reben_tutorial_lang';

const EMPTY_PRICES: FuelPrices = { p91: '', p95: '', p98: '', pd: '', pk: '' };
const EMPTY_APPS: AppPayments = {
  reben: '0',
  petro: '0',
  sayyara: '0',
  kafarat: '0',
  vwallet: '0',
  car: '0',
  other: '0',
};

function detectInitialLang(): GuideLang {
  try {
    const saved = localStorage.getItem(LANG_KEY) as GuideLang | null;
    if (saved && GUIDE_CONTENT[saved]) return saved;
  } catch {}
  const nav = ((navigator.language || 'en') + '').slice(0, 2).toLowerCase() as GuideLang;
  return GUIDE_CONTENT[nav] ? nav : 'en';
}

function normalizeNozzles(raw: unknown[]): { loaded: NozzleItem[]; nextId: number } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      loaded: [{ id: 1, name: 'Nozzle 1', type: '91', init: '', final: '', initOrig: '', locked: false }],
      nextId: 2,
    };
  }
  let maxId = 0;
  const loaded: NozzleItem[] = raw.map((item: unknown, idx: number) => {
    const n = item as Record<string, unknown>;
    const id = idx + 1;
    maxId = id;
    const initRaw = n.init === undefined || n.init === null ? '' : String(n.init);
    const initStr = initRaw.trim();
    const origRaw = n.initOrig !== undefined && String(n.initOrig).trim() !== '' ? String(n.initOrig).trim() : initStr;
    return {
      id,
      name: String(n.name || `Nozzle ${id}`),
      type: (n.type || '91') as FuelType,
      init: initRaw,
      final: n.final === undefined || n.final === null ? '' : String(n.final),
      initOrig: initStr !== '' ? origRaw : '',
      locked: initStr !== '',
    };
  });
  return { loaded, nextId: maxId + 1 };
}

function createStationFromLegacy(legacy: Record<string, unknown>, id = 'st_default'): StationWorkspace {
  const { loaded } = normalizeNozzles((legacy.nozzles as unknown[]) || []);
  const customApps =
    legacy.customApps && typeof legacy.customApps === 'object'
      ? (legacy.customApps as Record<string, string>)
      : {};
  return {
    id,
    stationName: String(legacy.sn || ''),
    prices: {
      p91: String(legacy.p91 || ''),
      p95: String(legacy.p95 || ''),
      p98: String(legacy.p98 || ''),
      pd: String(legacy.pd || ''),
      pk: String(legacy.pk || ''),
    },
    isDayTime: legacy.day !== undefined ? Boolean(legacy.day) : true,
    appsVisible: Boolean(legacy.appsVisible),
    apps: {
      reben: String(legacy.appReben ?? '0'),
      petro: String(legacy.appPetro ?? '0'),
      sayyara: String(legacy.appSayyara ?? '0'),
      kafarat: String(legacy.appKafarat ?? '0'),
      vwallet: String(legacy.appVwallet ?? '0'),
      car: String(legacy.appCar ?? '0'),
      other: String(legacy.appOther ?? '0'),
      ...customApps,
    },
    nozzles: loaded,
    updatedAt: typeof legacy.savedAt === 'number' ? legacy.savedAt : Date.now(),
  };
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  requirePin?: boolean;
  onConfirm: () => void;
}

type SyncState = 'saved' | 'offline' | 'synced' | 'pending';

export default function App() {
  const [guideLang, setGuideLang] = useState<GuideLang>(detectInitialLang);
  const strings = APP_I18N[guideLang];

  // Multi-station workspaces
  const [stations, setStations] = useState<StationWorkspace[]>([
    {
      id: 'st_default',
      stationName: '',
      prices: { ...EMPTY_PRICES },
      isDayTime: true,
      appsVisible: false,
      apps: { ...EMPTY_APPS },
      nozzles: [{ id: 1, name: 'Nozzle 1', type: '91', init: '', final: '', initOrig: '', locked: false }],
      updatedAt: Date.now(),
    },
  ]);
  const [activeStationId, setActiveStationId] = useState('st_default');
  const [stationModalOpen, setStationModalOpen] = useState(false);

  // Active workspace fields
  const [stationName, setStationName] = useState('');
  const [prices, setPrices] = useState<FuelPrices>({ ...EMPTY_PRICES });
  const [appsVisible, setAppsVisible] = useState(false);
  const [apps, setApps] = useState<AppPayments>({ ...EMPTY_APPS });
  const [nozzles, setNozzles] = useState<NozzleItem[]>([
    { id: 1, name: 'Nozzle 1', type: '91', init: '', final: '', initOrig: '', locked: false },
  ]);
  const nextIdRef = useRef(2);

  const [isDayTime, setIsDayTime] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'saved'
  );
  const [isSyncingShift, setIsSyncingShift] = useState(false);

  // Validation highlight state
  const [invalidStation, setInvalidStation] = useState(false);
  const [invalidPrices, setInvalidPrices] = useState<Record<FuelType, boolean>>({
    '91': false,
    '95': false,
    '98': false,
    D: false,
    K: false,
  });

  // Owner commercial settings & splash
  const [adminConfig, setAdminConfig] = useState<AdminConfig>(() => getAdminConfig());
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [splashPreview, setSplashPreview] = useState<{ key: number; cfg: AdminConfig } | null>(null);
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [confirmPinError, setConfirmPinError] = useState(false);

  // Commercial licensing & Seller Studio
  const [licenseEval, setLicenseEval] = useState<LicenseEvaluation>(() => ({
    unlocked: true,
    status: 'trial',
    mode: 'trial',
    plan: 'trial',
    daysLeft: 7,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    deviceId: getOrCreateDeviceId(),
    isTrialWatermark: true,
  }));
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [sellerStudioOpen, setSellerStudioOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.location.hash === '#seller' || new URLSearchParams(window.location.search).get('seller') === '1';
  });
  const [pendingAdExport, setPendingAdExport] = useState<{ label: string; run: () => void } | null>(null);

  // Modals & overlays
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<{ id: number; field: 'init' | 'final' } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryShiftEntry[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartYRef = useRef<number | null>(null);
  const pullDistRef = useRef(0);

  // Voice input state for meter readings
  const [listeningField, setListeningField] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Toast state
  const [toast, setToast] = useState<{ msg: string; kind: '' | 'ok' | 'warn'; visible: boolean }>({
    msg: '',
    kind: '',
    visible: false,
  });
  const toastTimerRef = useRef<number | null>(null);

  // Layout refs
  const footerRef = useRef<HTMLDivElement | null>(null);
  const appsCardRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const stationInputRef = useRef<HTMLInputElement | null>(null);
  const [keyboardHidden, setKeyboardHidden] = useState(false);
  const hydratedRef = useRef(false);

  const showToast = useCallback((msg: string, kind: '' | 'ok' | 'warn' = '', ms = 3500) => {
    setToast({ msg, kind, visible: true });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    if (ms !== 0) {
      toastTimerRef.current = window.setTimeout(() => {
        setToast((t) => ({ ...t, visible: false }));
      }, ms);
    }
  }, []);

  const applyStationWorkspace = useCallback((st: StationWorkspace) => {
    const { loaded, nextId } = normalizeNozzles(st.nozzles);
    setActiveStationId(st.id);
    setStationName(st.stationName);
    setPrices({ ...EMPTY_PRICES, ...st.prices });
    setApps({ ...EMPTY_APPS, ...st.apps });
    setAppsVisible(Boolean(st.appsVisible));
    setIsDayTime(st.isDayTime !== undefined ? Boolean(st.isDayTime) : true);
    setNozzles(loaded);
    nextIdRef.current = nextId;
    setInvalidStation(false);
    setInvalidPrices({ '91': false, '95': false, '98': false, D: false, K: false });
  }, []);

  // Load saved stations or migrate from legacy single-station memory on mount
  useEffect(() => {
    const initLang = detectInitialLang();
    const initStrings = APP_I18N[initLang];
    try {
      const savedStationsRaw = localStorage.getItem(STATIONS_KEY);
      if (savedStationsRaw) {
        const parsed = JSON.parse(savedStationsRaw) as {
          activeStationId?: string;
          stations?: StationWorkspace[];
        };
        if (Array.isArray(parsed?.stations) && parsed.stations.length > 0) {
          setStations(parsed.stations);
          const active =
            parsed.stations.find((s) => s.id === parsed.activeStationId) || parsed.stations[0];
          applyStationWorkspace(active);

          const hasFinal = (active.nozzles || []).some((n) => String(n.final || '').trim() !== '');
          if (active.updatedAt && hasFinal && shiftPeriod(new Date()) !== shiftPeriod(new Date(active.updatedAt))) {
            window.setTimeout(() => {
              setConfirmDialog({
                title: initStrings.newShiftTitle,
                message: initStrings.newShiftMsg,
                confirmLabel: initStrings.newShiftConfirm,
                onConfirm: () => {
                  setConfirmDialog(null);
                  rotateShiftInternal(true);
                },
              });
            }, 500);
          }
          hydratedRef.current = true;
          window.setTimeout(() => flushReportQueue(showToast), 1500);
          return;
        }
      }

      const storedLegacy = localStorage.getItem(MEM_KEY);
      if (storedLegacy) {
        const data = JSON.parse(storedLegacy) as Record<string, unknown>;
        const migrated = createStationFromLegacy(data, 'st_default');
        setStations([migrated]);
        applyStationWorkspace(migrated);

        const hasFinal = migrated.nozzles.some((n) => n.final.trim() !== '');
        if (
          typeof data.savedAt === 'number' &&
          hasFinal &&
          shiftPeriod(new Date()) !== shiftPeriod(new Date(data.savedAt))
        ) {
          window.setTimeout(() => {
            setConfirmDialog({
              title: initStrings.newShiftTitle,
              message: initStrings.newShiftMsg,
              confirmLabel: initStrings.newShiftConfirm,
              onConfirm: () => {
                setConfirmDialog(null);
                rotateShiftInternal(true);
              },
            });
          }, 500);
        }
      }
    } catch {}
    hydratedRef.current = true;
    window.setTimeout(() => flushReportQueue(showToast), 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Evaluate commercial license & run background Master Sheet verification
  useEffect(() => {
    let active = true;
    (async () => {
      await hydrateLicenseRuntimeConfig();
      const firstEval = await evaluateLicenseStatus();
      if (!active) return;
      setLicenseEval(firstEval);
      const bgEval = await verifySheetLicenseInBackground();
      if (!active || !bgEval) return;
      setLicenseEval(bgEval);
    })();
    return () => {
      active = false;
    };
  }, []);

  const adsActive = isAdSupportedMode(licenseEval);

  useEffect(() => {
    syncAndroidAdsState(adsActive);
  }, [adsActive]);

  // Keep active station synced in stations array and legacy MEM_KEY
  useEffect(() => {
    if (!hydratedRef.current) return;
    const now = Date.now();
    setStations((prev) => {
      const idx = prev.findIndex((s) => s.id === activeStationId);
      const updated: StationWorkspace = {
        id: activeStationId,
        stationName,
        prices,
        isDayTime,
        appsVisible,
        apps,
        nozzles,
        updatedAt: now,
      };
      if (idx === -1) return [...prev, updated];
      const next = prev.slice();
      next[idx] = updated;
      return next;
    });

    try {
      localStorage.setItem(
        MEM_KEY,
        JSON.stringify({
          sn: stationName,
          p91: prices.p91,
          p95: prices.p95,
          p98: prices.p98,
          pd: prices.pd,
          pk: prices.pk,
          day: isDayTime,
          savedAt: now,
          appsVisible,
          appReben: apps.reben,
          appPetro: apps.petro,
          appSayyara: apps.sayyara,
          appKafarat: apps.kafarat,
          appVwallet: apps.vwallet,
          appCar: apps.car,
          appOther: apps.other,
          customApps: apps,
          nozzles: nozzles.map((n) => ({
            name: n.name,
            type: n.type,
            init: n.init,
            final: n.final,
            initOrig: n.initOrig,
          })),
        })
      );
    } catch {}
  }, [activeStationId, stationName, prices, isDayTime, appsVisible, apps, nozzles]);

  // Persist multi-station store whenever stations list or active ID updates
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(STATIONS_KEY, JSON.stringify({ activeStationId, stations }));
    } catch {}
  }, [activeStationId, stations]);

  // Sync night-mode body class and AndroidBridge
  useEffect(() => {
    document.body.classList.toggle('night-mode', !isDayTime);
    if (IS_ANDROID_APP && window.AndroidBridge) {
      try {
        window.AndroidBridge.setNightMode(!isDayTime);
      } catch {}
    }
  }, [isDayTime]);

  // Online / offline listeners
  useEffect(() => {
    const onOnline = () => {
      setSyncState('saved');
      flushReportQueue(showToast);
    };
    const onOffline = () => {
      setSyncState('offline');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [showToast]);

  // Mobile footer padding & virtual keyboard hide
  useEffect(() => {
    const fitPadding = () => {
      if (footerRef.current) {
        document.body.style.paddingBottom = `${footerRef.current.offsetHeight + 16}px`;
      }
    };
    fitPadding();
    let ro: ResizeObserver | null = null;
    if ('ResizeObserver' in window && footerRef.current) {
      ro = new ResizeObserver(fitPadding);
      ro.observe(footerRef.current);
    }
    window.addEventListener('resize', fitPadding);

    let fullH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const onOrientation = () => {
      window.setTimeout(() => {
        fullH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      }, 400);
    };
    const onViewportResize = () => {
      if (!window.visualViewport) return;
      const h = window.visualViewport.height;
      if (h > fullH) fullH = h;
      const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '');
      setKeyboardHidden(typing && h < fullH * 0.75);
    };
    window.addEventListener('orientationchange', onOrientation);
    window.visualViewport?.addEventListener('resize', onViewportResize);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', fitPadding);
      window.removeEventListener('orientationchange', onOrientation);
      window.visualViewport?.removeEventListener('resize', onViewportResize);
    };
  }, []);

  // Fuel calculations
  const math = useMemo(() => {
    let total = 0;
    const sums: Record<FuelType, number> = { '91': 0, '95': 0, '98': 0, D: 0, K: 0 };
    const priceMap: Record<FuelType, number> = {
      '91': parseFloat(prices.p91) || 0,
      '95': parseFloat(prices.p95) || 0,
      '98': parseFloat(prices.p98) || 0,
      D: parseFloat(prices.pd) || 0,
      K: parseFloat(prices.pk) || 0,
    };
    nozzles.forEach((n) => {
      const initVal = parseFloat(n.init) || 0;
      const finalVal = parseFloat(n.final) || 0;
      const diff = finalVal - initVal;
      if (!(finalVal > 0 && diff < 0)) {
        const actual = Math.max(0, diff);
        sums[n.type] += actual;
        total += actual * (priceMap[n.type] || 0);
      }
    });
    const grandTotalFormatted = total.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return { total, sums, grandTotalFormatted };
  }, [nozzles, prices]);

  const payments: PaymentBreakdown = useMemo(() => {
    const items = adminConfig.paymentMethods.map((pm) => ({
      id: pm.id,
      label: pm.label,
      amount: parseFloat(apps[pm.id] || '0') || 0,
    }));
    const appsTotal = items.reduce((sum, item) => sum + item.amount, 0);
    const cash = math.total - appsTotal;
    const byId = new Map(items.map((it) => [it.id, it.amount]));
    return {
      total: math.total,
      appsTotal,
      cash,
      r: byId.get('reben') ?? 0,
      p: byId.get('petro') ?? 0,
      s: byId.get('sayyara') ?? 0,
      k: byId.get('kafarat') ?? 0,
      v: byId.get('vwallet') ?? 0,
      c: byId.get('car') ?? 0,
      o: byId.get('other') ?? 0,
      items,
    };
  }, [adminConfig.paymentMethods, apps, math.total]);

  const validateReport = useCallback((): boolean => {
    let valid = true;
    let msg = strings.toastMissingStationPrices;
    const snValid = stationName.trim() !== '';
    setInvalidStation(!snValid);
    if (!snValid) valid = false;

    const nextInvalidPrices: Record<FuelType, boolean> = {
      '91': false,
      '95': false,
      '98': false,
      D: false,
      K: false,
    };
    const priceKeyMap: Record<FuelType, keyof FuelPrices> = {
      '91': 'p91',
      '95': 'p95',
      '98': 'p98',
      D: 'pd',
      K: 'pk',
    };

    let anyUsed = false;
    (['91', '95', '98', 'D', 'K'] as FuelType[]).forEach((t) => {
      if (isFuelUsed(nozzles, t)) {
        anyUsed = true;
        const val = parseFloat(prices[priceKeyMap[t]]);
        if (!val || val <= 0) {
          nextInvalidPrices[t] = true;
          valid = false;
        }
      }
    });
    setInvalidPrices(nextInvalidPrices);

    if (!anyUsed) {
      valid = false;
      if (snValid) msg = strings.toastNeedOneNozzle;
    }
    if (!valid) showToast(msg, 'warn', 4000);
    return valid;
  }, [nozzles, prices, showToast, stationName, strings.toastMissingStationPrices, strings.toastNeedOneNozzle]);

  const performAddNozzle = () => {
    const id = nextIdRef.current++;
    setNozzles((prev) => [
      ...prev,
      { id, name: `${strings.nozzlePrefix} ${id}`, type: '91', init: '', final: '', initOrig: '', locked: false },
    ]);
    window.setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 50);
  };

  const addNewNozzle = () => {
    if (adminConfig.nozzleAddMode === 'block') {
      showToast(strings.nozzleAddLockedToast, 'warn', 2600);
      return;
    }
    if (adminConfig.nozzleAddMode === 'pin') {
      setConfirmPinInput('');
      setConfirmPinError(false);
      setConfirmDialog({
        title: strings.addNozzleTitle,
        message: strings.addNozzlePinMsg,
        confirmLabel: strings.addNozzleConfirm,
        requirePin: true,
        onConfirm: () => {
          setConfirmDialog(null);
          performAddNozzle();
        },
      });
      return;
    }
    performAddNozzle();
  };

  const updateNozzle = (id: number, patch: Partial<NozzleItem>) => {
    setNozzles((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const handleInitBlurOrChange = (id: number, value: string) => {
    const trimmed = value.trim();
    if (trimmed === '') return;
    setNozzles((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        return {
          ...n,
          init: value,
          initOrig: n.initOrig || trimmed,
          locked: true,
        };
      })
    );
  };

  const toggleInitLock = (nozzle: NozzleItem) => {
    if (nozzle.locked) {
      setConfirmPinInput('');
      setConfirmPinError(false);
      setConfirmDialog({
        title: strings.unlockTitle,
        message: adminConfig.lockInitialWithPin ? strings.pinRequiredUnlockMsg : strings.unlockMsg,
        confirmLabel: strings.unlockConfirm,
        requirePin: adminConfig.lockInitialWithPin,
        onConfirm: () => {
          setConfirmDialog(null);
          updateNozzle(nozzle.id, { locked: false });
        },
      });
    } else if (nozzle.init.trim() !== '') {
      updateNozzle(nozzle.id, { locked: true, initOrig: nozzle.initOrig || nozzle.init.trim() });
    }
  };

  const handleDeleteNozzle = (nozzle: NozzleItem) => {
    if (adminConfig.nozzleDeleteMode === 'block') {
      showToast(strings.nozzleDeleteLockedToast, 'warn', 2600);
      return;
    }
    const askPin = adminConfig.nozzleDeleteMode === 'pin';
    setConfirmPinInput('');
    setConfirmPinError(false);
    setConfirmDialog({
      title: strings.deleteNozzleTitle,
      message: `${askPin ? strings.deleteNozzlePinMsg : strings.deleteNozzleMsg} (${nozzle.name})`,
      confirmLabel: strings.deleteConfirm,
      requirePin: askPin,
      onConfirm: () => {
        setConfirmDialog(null);
        setNozzles((prev) => prev.filter((n) => n.id !== nozzle.id));
      },
    });
  };

  const startVoiceForField = (id: number, field: 'init' | 'final') => {
    const fieldKey = `${id}-${field}`;
    if (listeningField === fieldKey) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setListeningField(null);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast(strings.toastVoiceUnsupported, 'warn', 4000);
      return;
    }

    try {
      recognitionRef.current?.stop();
    } catch {}

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;
    setListeningField(fieldKey);

    rec.onresult = (event: any) => {
      const raw = String(event.results?.[0]?.[0]?.transcript || '');
      // Normalize Arabic-Indic / Persian digits if returned by device recognizer
      const transcript = raw
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
      const numbers = transcript.match(/\d+\.?\d*/g);
      if (numbers && numbers.length > 0) {
        if (field === 'init') {
          handleInitBlurOrChange(id, numbers[0]);
        } else {
          updateNozzle(id, { final: numbers[0] });
        }
      } else {
        showToast(strings.toastNoVoiceNumbers, 'warn', 3500);
      }
      setListeningField(null);
    };
    rec.onerror = () => setListeningField(null);
    rec.onend = () => setListeningField(null);
    try {
      rec.start();
    } catch {
      setListeningField(null);
    }
  };

  const saveShiftToHistory = useCallback(() => {
    const station = cleanStationName(stationName);
    if (!station) return;
    const now = new Date();
    const entry: HistoryShiftEntry = {
      id: Date.now(),
      timestamp: now.toISOString(),
      date: formatDate(now),
      shift: isDayTime ? 'Day' : 'Night',
      station,
      prices,
      summary: {
        q91: math.sums['91'].toFixed(2),
        q95: math.sums['95'].toFixed(2),
        q98: math.sums['98'].toFixed(2),
        qD: math.sums['D'].toFixed(2),
        qK: math.sums['K'].toFixed(2),
        total: math.grandTotalFormatted,
      },
      payments,
      nozzles: nozzles.map((n) => {
        const i = parseFloat(n.init) || 0;
        const f = parseFloat(n.final) || 0;
        return {
          name: n.name,
          type: n.type,
          init: n.init,
          final: n.final,
          diff: `Sales: ${Math.max(0, f - i).toFixed(2)} L`,
        };
      }),
    };

    try {
      let history: HistoryShiftEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') || [];
      history.unshift(entry);
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      history = history.filter((item) => new Date(item.timestamp) > ninetyDaysAgo);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      setSyncState('saved');
    } catch {}
  }, [isDayTime, math.grandTotalFormatted, math.sums, nozzles, payments, prices, stationName]);

  const syncToSheet = useCallback(async () => {
    saveShiftToHistory();
    if (!adminConfig.sheetSyncEnabled) return;
    const targetSheetUrl = resolveSheetUrl(adminConfig.sheetUrlOrId);
    if (!targetSheetUrl) return;
    if (!navigator.onLine) {
      setSyncState('pending');
      return;
    }

    const station = cleanStationName(stationName);
    const p91 = parseFloat(prices.p91) || 0;
    const p95 = parseFloat(prices.p95) || 0;
    const p98 = parseFloat(prices.p98) || 0;
    const pd = parseFloat(prices.pd) || 0;
    const pk = parseFloat(prices.pk) || 0;

    const payload = {
      summary: {
        q91: math.sums['91'],
        q95: math.sums['95'],
        q98: math.sums['98'],
        qd: math.sums['D'],
        qk: math.sums['K'],
        totalAmt: math.grandTotalFormatted,
        amt91: (math.sums['91'] * p91).toFixed(2),
        amt95: (math.sums['95'] * p95).toFixed(2),
        amt98: (math.sums['98'] * p98).toFixed(2),
        amtD: (math.sums['D'] * pd).toFixed(2),
        amtK: (math.sums['K'] * pk).toFixed(2),
        payments: {
          reben: payments.r,
          petro: payments.p,
          sayyara: payments.s,
          kafarat: payments.k,
          vwallet: payments.v,
          car: payments.c,
          other: payments.o,
          appsTotal: payments.appsTotal,
          cash: payments.cash,
          items: payments.items,
        },
      },
      prices: { p91, p95, p98, pd, pk },
      rows: nozzles.map((n) => {
        const init = parseFloat(n.init) || 0;
        const final = parseFloat(n.final) || 0;
        return {
          syncTime: new Date().toLocaleTimeString(),
          date: getTopDateStr(isDayTime),
          shift: isDayTime ? 'Day' : 'Night',
          station,
          nozzle: n.name,
          fuelType: n.type,
          initial: init,
          final,
          diff: Math.max(0, final - init).toFixed(2),
        };
      }),
    };

    try {
      await fetch(targetSheetUrl, {
        method: 'POST',
        mode: 'no-cors',
        cache: 'no-cache',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setSyncState('synced');
    } catch {
      setSyncState('pending');
    }
  }, [adminConfig.sheetSyncEnabled, adminConfig.sheetUrlOrId, isDayTime, math.grandTotalFormatted, math.sums, nozzles, payments, prices, saveShiftToHistory, stationName]);

  const rotateShiftInternal = async (auto = false) => {
    setIsSyncingShift(true);
    try {
      try {
        await syncToSheet();
      } catch {}
      const nextDay = auto ? ((shiftPeriod(new Date()) % 2) + 2) % 2 === 0 : !isDayTime;
      setIsDayTime(nextDay);
      setNozzles((prev) =>
        prev.map((n) => {
          const finalVal = n.final.trim();
          if (finalVal !== '') {
            return {
              ...n,
              init: finalVal,
              initOrig: finalVal,
              final: '',
              locked: true,
            };
          }
          return { ...n, final: '' };
        })
      );
      showToast(nextDay ? strings.toastDaySwitched : strings.toastNightSwitched, 'ok', 2800);
    } finally {
      setIsSyncingShift(false);
    }
  };

  const handleRotateShiftClick = () => {
    const missing = nozzles.filter((n) => n.final.trim() === '').length;
    let q = adminConfig.lockShiftWithPin ? strings.pinRequiredShiftMsg : strings.rotateMsg;
    if (missing > 0) {
      q += `\n\n${missing} ${strings.rotateMissingSuffix}`;
    }
    setConfirmPinInput('');
    setConfirmPinError(false);
    setConfirmDialog({
      title: strings.rotateTitle,
      message: q,
      confirmLabel: strings.rotateConfirm,
      requirePin: adminConfig.lockShiftWithPin,
      onConfirm: () => {
        setConfirmDialog(null);
        rotateShiftInternal(false);
      },
    });
  };

  const handleToggleApps = () => {
    const next = !appsVisible;
    setAppsVisible(next);
    if (next) {
      window.setTimeout(() => {
        if (appsCardRef.current) {
          const headerH = headerRef.current?.offsetHeight || 0;
          const pos = appsCardRef.current.getBoundingClientRect().top + window.pageYOffset;
          window.scrollTo({ top: pos - headerH - 20, behavior: 'smooth' });
        }
      }, 100);
    }
  };

  const openHistoryModal = () => {
    try {
      const items: HistoryShiftEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') || [];
      setHistoryItems(items);
    } catch {
      setHistoryItems([]);
    }
    setHistoryOpen(true);
  };

  const handleOpenHistory = () => {
    if (adminConfig.lockHistoryWithPin) {
      setConfirmPinInput('');
      setConfirmPinError(false);
      setConfirmDialog({
        title: strings.historyTitle,
        message: strings.pinRequiredHistoryMsg,
        confirmLabel: strings.unlockSetupBtn,
        requirePin: true,
        onConfirm: () => {
          setConfirmDialog(null);
          openHistoryModal();
        },
      });
      return;
    }
    openHistoryModal();
  };

  const handleSelectHistory = (item: HistoryShiftEntry) => {
    setStationName(item.station);
    setPrices({
      p91: item.prices.p91 || '',
      p95: item.prices.p95 || '',
      p98: item.prices.p98 || '',
      pd: item.prices.pd || '',
      pk: item.prices.pk || '',
    });
    const nextApps: AppPayments = {
      ...EMPTY_APPS,
      reben: String(item.payments.r ?? 0),
      petro: String(item.payments.p ?? 0),
      sayyara: String(item.payments.s ?? 0),
      kafarat: String(item.payments.k ?? 0),
      vwallet: String(item.payments.v ?? 0),
      car: String(item.payments.c ?? 0),
      other: String(item.payments.o ?? 0),
    };
    if (Array.isArray(item.payments.items)) {
      item.payments.items.forEach((it) => {
        if (it && it.id) nextApps[it.id] = String(it.amount ?? 0);
      });
    }
    setApps(nextApps);
    const { loaded, nextId } = normalizeNozzles(item.nozzles || []);
    setNozzles(loaded);
    nextIdRef.current = nextId;
    setIsDayTime(item.shift === 'Day');
    setHistoryOpen(false);
  };

  const handleDeleteHistoryItem = (id: number) => {
    setHistoryItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleClearAllHistory = () => {
    setHistoryItems([]);
    try {
      localStorage.setItem(HISTORY_KEY, '[]');
    } catch {}
  };

  const triggerPullRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      setSyncState(navigator.onLine ? 'saved' : 'offline');
      await Promise.all([
        flushReportQueue(showToast).catch(() => {}),
        new Promise((r) => window.setTimeout(r, 420)),
      ]);
      try {
        const items: HistoryShiftEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') || [];
        setHistoryItems(items);
      } catch {}
      showToast(strings.refreshedToast, 'ok', 2200);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, showToast, strings.refreshedToast]);

  // Smooth mobile touch Pull-to-Refresh when at top of page with no modal open
  useEffect(() => {
    const hasOverlayOpen =
      tutorialOpen ||
      historyOpen ||
      stationModalOpen ||
      adminModalOpen ||
      licenseModalOpen ||
      sellerStudioOpen ||
      pendingAdExport !== null ||
      !licenseEval.unlocked ||
      scannerTarget !== null ||
      confirmDialog !== null;

    const onTouchStart = (e: TouchEvent) => {
      if (hasOverlayOpen || isRefreshing) return;
      if (window.scrollY > 2) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/i.test(target.tagName)) return;
      pullStartYRef.current = e.touches[0]?.clientY ?? null;
      pullDistRef.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (pullStartYRef.current === null || hasOverlayOpen || isRefreshing) return;
      if (window.scrollY > 2) {
        pullStartYRef.current = null;
        pullDistRef.current = 0;
        setPullDistance(0);
        return;
      }
      const y = e.touches[0]?.clientY ?? pullStartYRef.current;
      const dy = y - pullStartYRef.current;
      if (dy <= 0) {
        pullDistRef.current = 0;
        setPullDistance(0);
        return;
      }
      if (dy > 10) {
        if (e.cancelable) e.preventDefault();
        const dist = Math.min(82, (dy - 10) * 0.48);
        pullDistRef.current = dist;
        setPullDistance(dist);
      }
    };

    const onTouchEnd = () => {
      if (pullStartYRef.current === null) return;
      const pulled = pullDistRef.current;
      pullStartYRef.current = null;
      pullDistRef.current = 0;
      setPullDistance(0);
      if (pulled >= 56 && !hasOverlayOpen && !isRefreshing) {
        triggerPullRefresh();
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [
    tutorialOpen,
    historyOpen,
    stationModalOpen,
    adminModalOpen,
    licenseModalOpen,
    sellerStudioOpen,
    pendingAdExport,
    licenseEval.unlocked,
    scannerTarget,
    confirmDialog,
    isRefreshing,
    triggerPullRefresh,
  ]);

  const handleChangeGuideLang = (newLang: GuideLang) => {
    setGuideLang(newLang);
    try {
      localStorage.setItem(LANG_KEY, newLang);
    } catch {}
  };

  // Multi-Station handlers
  const handleSelectStation = (id: string) => {
    if (id === activeStationId) {
      setStationModalOpen(false);
      return;
    }
    const target = stations.find((s) => s.id === id);
    if (!target) return;
    applyStationWorkspace(target);
    setStationModalOpen(false);
    const display = target.stationName.trim() || strings.unnamedStation;
    showToast(`${strings.switchedStationToast}: ${display}`, 'ok', 2500);
  };

  const performAddStation = (name: string, copyPrices: boolean) => {
    const newId = `st_${Date.now()}`;
    const newStation: StationWorkspace = {
      id: newId,
      stationName: name,
      prices: copyPrices ? { ...prices } : { ...EMPTY_PRICES },
      isDayTime: true,
      appsVisible: false,
      apps: { ...EMPTY_APPS },
      nozzles: [
        { id: 1, name: `${strings.nozzlePrefix} 1`, type: '91', init: '', final: '', initOrig: '', locked: false },
      ],
      updatedAt: Date.now(),
    };
    setStations((prev) => [...prev, newStation]);
    applyStationWorkspace(newStation);
    setStationModalOpen(false);
    showToast(`${strings.switchedStationToast}: ${name || strings.unnamedStation}`, 'ok', 2500);
  };

  const handleAddStation = (name: string, copyPrices: boolean) => {
    if (adminConfig.lockStationsManage) {
      setConfirmPinInput('');
      setConfirmPinError(false);
      setConfirmDialog({
        title: strings.stationsTitle,
        message: strings.pinRequiredStationMsg,
        confirmLabel: strings.addStationBtn,
        requirePin: true,
        onConfirm: () => {
          setConfirmDialog(null);
          performAddStation(name, copyPrices);
        },
      });
      return;
    }
    performAddStation(name, copyPrices);
  };

  const handleDeleteStation = (id: string) => {
    if (stations.length <= 1 || id === activeStationId) return;
    setConfirmPinInput('');
    setConfirmPinError(false);
    setConfirmDialog({
      title: strings.deleteStationTitle,
      message: adminConfig.lockStationsManage ? strings.pinRequiredStationMsg : strings.deleteStationMsg,
      confirmLabel: strings.deleteConfirm,
      requirePin: adminConfig.lockStationsManage,
      onConfirm: () => {
        setConfirmDialog(null);
        setStations((prev) => prev.filter((s) => s.id !== id));
      },
    });
  };

  const labelI = isDayTime ? strings.initialDay : strings.initialNight;
  const labelF = isDayTime ? strings.finalDay : strings.finalNight;
  const syncOk = syncState === 'saved' || syncState === 'synced';
  const syncText =
    syncState === 'synced'
      ? strings.syncedStatus
      : syncState === 'offline'
      ? strings.offlineStatus
      : syncState === 'pending'
      ? strings.pendingStatus
      : strings.savedStatus;

  const ptrHeight = isRefreshing ? 48 : Math.round(pullDistance * 0.72);
  const ptrReady = pullDistance >= 56;

  return (
    <div className="app-shell" dir={strings.rtl ? 'rtl' : 'ltr'} lang={guideLang}>
      {/* Launch Splash Screen (2-2.5s) */}
      <SplashScreen
        key={splashPreview ? `preview-${splashPreview.key}` : 'boot'}
        enabled={splashPreview ? true : adminConfig.splashEnabled}
        brandName={splashPreview ? splashPreview.cfg.brandName : adminConfig.brandName}
        showName={splashPreview ? splashPreview.cfg.splashShowName : adminConfig.splashShowName}
        customLogoDataUrl={splashPreview ? splashPreview.cfg.customLogoDataUrl : adminConfig.customLogoDataUrl}
      />

      {/* Smooth Pull-to-Refresh Indicator */}
      <div
        className={`ptr-wrap ${isRefreshing || pullDistance > 4 ? 'visible' : ''}`}
        style={{ height: ptrHeight }}
        aria-live="polite"
      >
        <div className="ptr-pill">
          <RefreshCw
            className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[var(--reben-red)]' : ''}`}
            style={
              !isRefreshing
                ? { transform: `rotate(${Math.min(180, Math.round(pullDistance * 3))}deg)` }
                : undefined
            }
          />
          <span>
            {isRefreshing
              ? strings.refreshingLabel
              : ptrReady
              ? strings.releaseToRefresh
              : strings.pullToRefresh}
          </span>
        </div>
      </div>

      <div className="frozen-header" ref={headerRef}>
        <div className="station-card">
          <PWAInstallButton label={strings.installBtn} />
          <button
            className="tut-help"
            onClick={() => setTutorialOpen(true)}
            aria-label={strings.guideBtn}
            type="button"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{strings.guideBtn}</span>
          </button>

          <input
            ref={stationInputRef}
            type="text"
            id="sn"
            readOnly={adminConfig.lockStationPrices}
            className={`station-input ${invalidStation ? 'invalid' : ''} ${adminConfig.lockStationPrices ? 'owner-locked' : ''}`}
            placeholder={strings.stationPlaceholder}
            value={stationName}
            onClick={() => {
              if (adminConfig.lockStationPrices) {
                showToast(strings.ownerLockedFieldToast, '', 2200);
              }
            }}
            onChange={(e) => {
              if (adminConfig.lockStationPrices) return;
              setStationName(e.target.value);
              if (invalidStation && e.target.value.trim()) setInvalidStation(false);
            }}
          />

          <div className="price-row" dir="ltr">
            <div className="price-item pf-91">
              <label>91</label>
              <input
                type="number"
                id="p91"
                step="0.01"
                placeholder="0.00"
                readOnly={adminConfig.lockStationPrices}
                className={`${invalidPrices['91'] ? 'invalid' : ''} ${adminConfig.lockStationPrices ? 'owner-locked' : ''}`}
                value={prices.p91}
                onClick={() => {
                  if (adminConfig.lockStationPrices) showToast(strings.ownerLockedFieldToast, '', 2200);
                }}
                onChange={(e) => {
                  if (adminConfig.lockStationPrices) return;
                  setPrices((p) => ({ ...p, p91: e.target.value }));
                  setInvalidPrices((ip) => ({ ...ip, '91': false }));
                }}
              />
            </div>
            <div className="price-item pf-95">
              <label>95</label>
              <input
                type="number"
                id="p95"
                step="0.01"
                placeholder="0.00"
                readOnly={adminConfig.lockStationPrices}
                className={`${invalidPrices['95'] ? 'invalid' : ''} ${adminConfig.lockStationPrices ? 'owner-locked' : ''}`}
                value={prices.p95}
                onClick={() => {
                  if (adminConfig.lockStationPrices) showToast(strings.ownerLockedFieldToast, '', 2200);
                }}
                onChange={(e) => {
                  if (adminConfig.lockStationPrices) return;
                  setPrices((p) => ({ ...p, p95: e.target.value }));
                  setInvalidPrices((ip) => ({ ...ip, '95': false }));
                }}
              />
            </div>
            <div className="price-item pf-98">
              <label>98</label>
              <input
                type="number"
                id="p98"
                step="0.01"
                placeholder="0.00"
                readOnly={adminConfig.lockStationPrices}
                className={`${invalidPrices['98'] ? 'invalid' : ''} ${adminConfig.lockStationPrices ? 'owner-locked' : ''}`}
                value={prices.p98}
                onClick={() => {
                  if (adminConfig.lockStationPrices) showToast(strings.ownerLockedFieldToast, '', 2200);
                }}
                onChange={(e) => {
                  if (adminConfig.lockStationPrices) return;
                  setPrices((p) => ({ ...p, p98: e.target.value }));
                  setInvalidPrices((ip) => ({ ...ip, '98': false }));
                }}
              />
            </div>
            <div className="price-item pf-d">
              <label>D</label>
              <input
                type="number"
                id="pd"
                step="0.01"
                placeholder="0.00"
                readOnly={adminConfig.lockStationPrices}
                className={`${invalidPrices['D'] ? 'invalid' : ''} ${adminConfig.lockStationPrices ? 'owner-locked' : ''}`}
                value={prices.pd}
                onClick={() => {
                  if (adminConfig.lockStationPrices) showToast(strings.ownerLockedFieldToast, '', 2200);
                }}
                onChange={(e) => {
                  if (adminConfig.lockStationPrices) return;
                  setPrices((p) => ({ ...p, pd: e.target.value }));
                  setInvalidPrices((ip) => ({ ...ip, D: false }));
                }}
              />
            </div>
            <div className="price-item pf-k">
              <label>K</label>
              <input
                type="number"
                id="pk"
                step="0.01"
                placeholder="0.00"
                readOnly={adminConfig.lockStationPrices}
                className={`${invalidPrices['K'] ? 'invalid' : ''} ${adminConfig.lockStationPrices ? 'owner-locked' : ''}`}
                value={prices.pk}
                onClick={() => {
                  if (adminConfig.lockStationPrices) showToast(strings.ownerLockedFieldToast, '', 2200);
                }}
                onChange={(e) => {
                  if (adminConfig.lockStationPrices) return;
                  setPrices((p) => ({ ...p, pk: e.target.value }));
                  setInvalidPrices((ip) => ({ ...ip, K: false }));
                }}
              />
            </div>
            <button className="price-apps-btn" onClick={handleToggleApps} type="button">
              {appsVisible ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{strings.appsBtn}</span>
            </button>
          </div>
        </div>
      </div>

      {appsVisible && (
        <div className="apps-card" ref={appsCardRef}>
          <div className="apps-grid">
            {adminConfig.paymentMethods.length === 0 ? (
              <div
                className="app-item"
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  padding: '8px 4px',
                }}
              >
                {strings.noPaymentMethodsMsg}
              </div>
            ) : (
              adminConfig.paymentMethods.map((pm) => {
                const rawVal = apps[pm.id];
                return (
                  <div className="app-item" key={pm.id}>
                    <label title={pm.label}>{pm.label}</label>
                    <input
                      type="number"
                      step="0.01"
                      dir="ltr"
                      placeholder="0.00"
                      value={rawVal !== undefined ? rawVal : '0'}
                      onChange={(e) => setApps((a) => ({ ...a, [pm.id]: e.target.value }))}
                    />
                  </div>
                );
              })
            )}
            <div className="cash-inside-apps">
              <span>{strings.cashLabel}</span>
              <span className="tabular-nums" dir="ltr">
                {payments.cash.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      <div id="list" className="nozzle-list">
        {nozzles.map((nozzle) => {
          const initVal = parseFloat(nozzle.init) || 0;
          const finalVal = parseFloat(nozzle.final) || 0;
          const diff = finalVal - initVal;
          const isError = finalVal > 0 && diff < 0;
          const actualDiff = Math.max(0, diff);

          return (
            <div key={nozzle.id} className={`nozzle-card card-${nozzle.type.toLowerCase()}`}>
              <div className="card-header">
                <input
                  className={`nozzle-name ${adminConfig.lockNozzleMeta ? 'owner-locked' : ''}`}
                  value={nozzle.name}
                  readOnly={adminConfig.lockNozzleMeta}
                  placeholder={`${strings.nozzlePrefix} ${nozzle.id}`}
                  onClick={() => {
                    if (adminConfig.lockNozzleMeta) showToast(strings.ownerLockedFieldToast, '', 2200);
                  }}
                  onChange={(e) => {
                    if (adminConfig.lockNozzleMeta) return;
                    updateNozzle(nozzle.id, { name: e.target.value });
                  }}
                />
                <select
                  className={`fuel-badge ft-${nozzle.type.toLowerCase()} ${adminConfig.lockNozzleMeta ? 'owner-locked' : ''}`}
                  value={nozzle.type}
                  disabled={adminConfig.lockNozzleMeta}
                  onChange={(e) => {
                    if (adminConfig.lockNozzleMeta) return;
                    updateNozzle(nozzle.id, { type: e.target.value as FuelType });
                  }}
                >
                  <option value="91">91</option>
                  <option value="95">95</option>
                  <option value="98">98</option>
                  <option value="D">D</option>
                  <option value="K">K</option>
                </select>
                <button
                  type="button"
                  className={`lock-btn ${nozzle.locked ? '' : 'unlocked'}`}
                  onClick={() => toggleInitLock(nozzle)}
                  aria-label="Toggle initial reading lock"
                >
                  {nozzle.locked ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  className={`delete-btn ${adminConfig.nozzleDeleteMode === 'block' ? 'owner-locked' : ''}`}
                  onClick={() => handleDeleteNozzle(nozzle)}
                  aria-label="Delete nozzle"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="reading-stack">
                <div className="reading-row">
                  <label>{labelI}</label>
                  <input
                    type="number"
                    dir="ltr"
                    className={`reading-field ${nozzle.locked ? 'is-locked' : ''}`}
                    value={nozzle.init}
                    placeholder="0.00"
                    readOnly={nozzle.locked}
                    onClick={() => {
                      if (nozzle.locked) {
                        showToast(strings.toastLockedTapHint, '', 3500);
                      }
                    }}
                    onChange={(e) => updateNozzle(nozzle.id, { init: e.target.value })}
                    onBlur={(e) => handleInitBlurOrChange(nozzle.id, e.target.value)}
                  />
                  <div className="action-buttons">
                    <button
                      type="button"
                      className={`mic-btn ${listeningField === `${nozzle.id}-init` ? 'listening' : ''}`}
                      disabled={nozzle.locked}
                      onClick={() => startVoiceForField(nozzle.id, 'init')}
                      aria-label="Voice input for initial reading"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="cam-btn"
                      disabled={nozzle.locked}
                      onClick={() => setScannerTarget({ id: nozzle.id, field: 'init' })}
                      aria-label="Camera scan for initial reading"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="reading-row">
                  <label>{labelF}</label>
                  <input
                    type="number"
                    dir="ltr"
                    className="reading-field"
                    value={nozzle.final}
                    placeholder="0.00"
                    onChange={(e) => updateNozzle(nozzle.id, { final: e.target.value })}
                  />
                  <div className="action-buttons">
                    <button
                      type="button"
                      className={`mic-btn ${listeningField === `${nozzle.id}-final` ? 'listening' : ''}`}
                      onClick={() => startVoiceForField(nozzle.id, 'final')}
                      aria-label="Voice input for final reading"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="cam-btn"
                      onClick={() => setScannerTarget({ id: nozzle.id, field: 'final' })}
                      aria-label="Camera scan for final reading"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="diff-badge-row">
                <div className={`diff-badge tabular-nums ${isError ? 'diff-error' : ''}`} dir="ltr">
                  {isError ? strings.endLessStartError : `${strings.salesLabel}: ${actualDiff.toFixed(2)} L`}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`footer ${keyboardHidden ? 'kb-hidden' : ''}`} ref={footerRef}>
        <AdBannerBar
          visible={adsActive}
          strings={strings}
          onUpgradeClick={() => setLicenseModalOpen(true)}
        />
        <div className="stats-row">
          <div>
            <div className="shift-badge">
              <span>{isDayTime ? strings.dayShiftBadge : strings.nightShiftBadge}</span>
              <span>{isDayTime ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}</span>
              <span className={`sync-status ${syncOk ? 'success' : ''}`}>{syncText}</span>
            </div>
            <div className="fuel-mini tabular-nums" dir="ltr">
              {isFuelUsed(nozzles, '91') && <span style={{ color: 'var(--91-t)' }}>91: {math.sums['91'].toFixed(2)}</span>}
              {isFuelUsed(nozzles, '95') && <span style={{ color: 'var(--95-t)' }}>95: {math.sums['95'].toFixed(2)}</span>}
              {isFuelUsed(nozzles, '98') && <span style={{ color: 'var(--98-t)' }}>98: {math.sums['98'].toFixed(2)}</span>}
              {isFuelUsed(nozzles, 'D') && <span style={{ color: 'var(--d-t)' }}>D: {math.sums['D'].toFixed(2)}</span>}
              {isFuelUsed(nozzles, 'K') && <span style={{ color: 'var(--k-t)' }}>K: {math.sums['K'].toFixed(2)}</span>}
            </div>
          </div>
          <div className="grand-total tabular-nums" dir="ltr">
            {math.grandTotalFormatted}
          </div>
        </div>

        <div className="action-grid" dir="ltr">
          <button
            className={`action btn-add ${adminConfig.nozzleAddMode === 'block' ? 'owner-locked' : ''}`}
            onClick={addNewNozzle}
            type="button"
          >
            <Plus className="w-4 h-4" />
            <span>{strings.btnAdd}</span>
          </button>
          <button className="action btn-history" onClick={handleOpenHistory} type="button">
            <History className="w-4 h-4" />
            <span>{strings.btnHistory}</span>
          </button>
          <button
            className={`action btn-excel ${!adminConfig.reportAllowExcel ? 'owner-locked' : ''}`}
            onClick={async () => {
              if (!adminConfig.reportAllowExcel) {
                showToast(strings.reportDisabledToast, 'warn', 2600);
                return;
              }
              if (!validateReport()) return;
              const runExport = () =>
                exportExcelReport({
                  station: cleanStationName(stationName),
                  isDayTime,
                  prices,
                  nozzles,
                  sums: math.sums,
                  grandTotalFormatted: math.grandTotalFormatted,
                  payments,
                });
              if (!adsActive) {
                runExport();
                return;
              }
              const nativeRes = await requestNativeRewardedAd('excel');
              if (nativeRes === 'rewarded') runExport();
              else if (nativeRes === 'dismissed') showToast(strings.adGateDismissedToast, 'warn', 3500);
              else setPendingAdExport({ label: strings.btnExcel, run: runExport });
            }}
            type="button"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{strings.btnExcel}</span>
          </button>
          <button
            className="action btn-next"
            disabled={isSyncingShift}
            onClick={handleRotateShiftClick}
            type="button"
          >
            {isSyncingShift ? (
              <>
                <div className="spinner" />
                <span>{strings.btnSync}</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>{strings.btnShift}</span>
              </>
            )}
          </button>
          <button
            className={`action btn-pdf ${!adminConfig.reportAllowPdf ? 'owner-locked' : ''}`}
            onClick={async () => {
              if (!adminConfig.reportAllowPdf) {
                showToast(strings.reportDisabledToast, 'warn', 2600);
                return;
              }
              if (!validateReport()) return;
              const runExport = () =>
                exportPdfReport({
                  mode: 'save',
                  station: cleanStationName(stationName),
                  isDayTime,
                  prices,
                  nozzles,
                  sums: math.sums,
                  payments,
                  onToast: showToast,
                  pdfFallbackMsg: strings.toastPdfFallback,
                });
              if (!adsActive) {
                runExport();
                return;
              }
              const nativeRes = await requestNativeRewardedAd('pdf_save');
              if (nativeRes === 'rewarded') runExport();
              else if (nativeRes === 'dismissed') showToast(strings.adGateDismissedToast, 'warn', 3500);
              else setPendingAdExport({ label: strings.btnPdf, run: runExport });
            }}
            type="button"
          >
            <FileText className="w-4 h-4" />
            <span>{strings.btnPdf}</span>
          </button>
          <button
            className={`action btn-share ${!adminConfig.reportAllowPdf ? 'owner-locked' : ''}`}
            onClick={async () => {
              if (!adminConfig.reportAllowPdf) {
                showToast(strings.reportDisabledToast, 'warn', 2600);
                return;
              }
              if (!validateReport()) return;
              const runExport = () =>
                exportPdfReport({
                  mode: 'share',
                  station: cleanStationName(stationName),
                  isDayTime,
                  prices,
                  nozzles,
                  sums: math.sums,
                  payments,
                  onToast: showToast,
                  pdfFallbackMsg: strings.toastPdfFallback,
                });
              if (!adsActive) {
                runExport();
                return;
              }
              const nativeRes = await requestNativeRewardedAd('pdf_share');
              if (nativeRes === 'rewarded') runExport();
              else if (nativeRes === 'dismissed') showToast(strings.adGateDismissedToast, 'warn', 3500);
              else setPendingAdExport({ label: strings.btnShare, run: runExport });
            }}
            type="button"
          >
            <Share2 className="w-4 h-4" />
            <span>{strings.btnShare}</span>
          </button>
          <button
            className={`action btn-wa ${!adminConfig.reportAllowWhatsApp ? 'owner-locked' : ''}`}
            onClick={async () => {
              if (!adminConfig.reportAllowWhatsApp) {
                showToast(strings.reportDisabledToast, 'warn', 2600);
                return;
              }
              if (!validateReport()) return;
              const runExport = () =>
                shareWhatsAppReport({
                  station: cleanStationName(stationName),
                  isDayTime,
                  prices,
                  nozzles,
                  sums: math.sums,
                  grandTotalFormatted: math.grandTotalFormatted,
                  payments,
                });
              if (!adsActive) {
                runExport();
                return;
              }
              const nativeRes = await requestNativeRewardedAd('whatsapp');
              if (nativeRes === 'rewarded') runExport();
              else if (nativeRes === 'dismissed') showToast(strings.adGateDismissedToast, 'warn', 3500);
              else setPendingAdExport({ label: 'WhatsApp', run: runExport });
            }}
            type="button"
            aria-label="Share to WhatsApp"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" aria-hidden="true">
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.79 14.08c-.24.68-1.41 1.3-1.95 1.38-.52.08-1.18.11-1.9-.12-.44-.14-1-.33-1.72-.64-3.03-1.31-5.01-4.37-5.16-4.57-.15-.2-1.23-1.64-1.23-3.13 0-1.49.78-2.22 1.06-2.52.28-.3.6-.38.8-.38.2 0 .4 0 .58.01.19.01.44-.07.69.53.25.61.86 2.1.94 2.25.08.15.13.33.03.53-.1.2-.15.33-.3.5-.15.18-.32.4-.45.53-.15.15-.3.31-.13.61.18.3.79 1.3 1.7 2.11 1.17 1.04 2.15 1.36 2.45 1.51.3.15.48.13.65-.08.18-.2.75-.88.95-1.18.2-.3.4-.25.68-.15.28.1 1.76.83 2.06.98.3.15.5.23.58.35.07.13.07.73-.17 1.41z" />
            </svg>
          </button>
        </div>
      </div>

      {/* App Toast */}
      <div className={`app-toast ${toast.visible ? 'show' : ''} ${toast.kind}`}>{toast.msg}</div>

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="confirm-backdrop" role="dialog" aria-modal="true">
          <form
            className="confirm-box"
            onSubmit={(e) => {
              e.preventDefault();
              if (confirmDialog.requirePin) {
                if (!verifyAdminPin(confirmPinInput)) {
                  setConfirmPinError(true);
                  return;
                }
              }
              confirmDialog.onConfirm();
            }}
          >
            <div className="confirm-title flex items-center gap-2">
              {confirmDialog.requirePin && <Lock className="w-4 h-4 text-[var(--reben-red)] shrink-0" />}
              <span>{confirmDialog.title}</span>
            </div>
            <div className="confirm-msg" style={confirmDialog.requirePin ? { marginBottom: 12 } : undefined}>
              {confirmDialog.message}
            </div>
            {confirmDialog.requirePin && (
              <div style={{ marginBottom: 14 }}>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  className={`pin-input ${confirmPinError ? 'invalid' : ''}`}
                  placeholder={strings.passwordPlaceholder}
                  value={confirmPinInput}
                  onChange={(e) => {
                    setConfirmPinInput(e.target.value);
                    if (confirmPinError) setConfirmPinError(false);
                  }}
                />
                {confirmPinError && <div className="pin-error-text">{strings.wrongPasswordError}</div>}
              </div>
            )}
            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-btn"
                onClick={() => setConfirmDialog(null)}
              >
                {strings.cancelBtn}
              </button>
              <button type="submit" className="confirm-btn primary">
                {confirmDialog.confirmLabel || strings.confirmBtn}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Multi-Station Quick Switcher Modal */}
      <StationSwitcherModal
        open={stationModalOpen}
        stations={stations}
        activeStationId={activeStationId}
        strings={strings}
        onSelect={handleSelectStation}
        onAdd={handleAddStation}
        onDelete={handleDeleteStation}
        onClose={() => setStationModalOpen(false)}
      />

      {/* Voice-Guided Tutorial Modal */}
      <TutorialModal
        open={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
        lang={guideLang}
        onChangeLang={handleChangeGuideLang}
        stationsCount={stations.length}
        stationsLabel={strings.stationsBtn}
        onOpenStations={() => setStationModalOpen(true)}
        ownerSetupLabel={strings.ownerSetupBtn}
        onOpenOwnerSetup={() => setAdminModalOpen(true)}
        licenseLabel={strings.licenseBtn}
        onOpenLicense={() => setLicenseModalOpen(true)}
        supportWhatsApp={adminConfig.supportWhatsApp}
        supportWhatsAppLabel={strings.whatsappSupportBtn}
      />

      {/* Password-Protected Station Owner Setup Modal */}
      <AdminSettingsModal
        open={adminModalOpen}
        config={adminConfig}
        strings={strings}
        onSave={(nextConfig) => {
          saveAdminConfig(nextConfig);
          setAdminConfig(nextConfig);
        }}
        onPreviewSplash={(draftCfg) => {
          setSplashPreview({ key: Date.now(), cfg: draftCfg });
        }}
        onNotify={(msg, kind) => showToast(msg, kind || '', 3000)}
        onClose={() => setAdminModalOpen(false)}
      />

      {/* License Gate & Status Modal */}
      <LicenseGateModal
        open={licenseModalOpen || !licenseEval.unlocked}
        evaluation={licenseEval}
        stationName={stationName}
        supportWhatsApp={adminConfig.supportWhatsApp}
        strings={strings}
        onUpdated={(nextEval) => setLicenseEval(nextEval)}
        onOpenSellerStudio={() => setSellerStudioOpen(true)}
        onNotify={(msg, kind) => showToast(msg, kind || '', 3000)}
        onClose={() => setLicenseModalOpen(false)}
      />

      {/* Seller License Studio Modal */}
      <SellerStudioModal
        open={sellerStudioOpen}
        currentDeviceId={licenseEval.deviceId}
        onLicenseChanged={(nextEval) => setLicenseEval(nextEval)}
        onNotify={(msg, kind) => showToast(msg, kind || '', 3000)}
        onClose={() => setSellerStudioOpen(false)}
      />

      {/* Report Ad Gate (Free-with-Ads web/PWA fallback) */}
      <AdGateModal
        open={pendingAdExport !== null}
        actionLabel={pendingAdExport?.label || ''}
        brandName={adminConfig.brandName}
        strings={strings}
        onComplete={() => {
          const run = pendingAdExport?.run;
          setPendingAdExport(null);
          run?.();
        }}
        onUpgradePro={() => {
          setPendingAdExport(null);
          setLicenseModalOpen(true);
        }}
        onClose={() => setPendingAdExport(null)}
      />

      {/* Camera OCR Modal */}
      <ScannerModal
        open={scannerTarget !== null}
        scanHint={strings.scanHint}
        camErrorText={strings.scanCamError}
        onCameraError={(msg) => showToast(msg, 'warn', 4000)}
        onClose={() => setScannerTarget(null)}
        onDetected={(val) => {
          if (!scannerTarget) return;
          if (scannerTarget.field === 'init') {
            handleInitBlurOrChange(scannerTarget.id, val);
          } else {
            updateNozzle(scannerTarget.id, { final: val });
          }
        }}
      />

      {/* 90-Day History Modal */}
      <HistoryModal
        open={historyOpen}
        items={historyItems}
        currencyCode={adminConfig.currencyCode}
        strings={strings}
        onSelect={handleSelectHistory}
        onDeleteItem={handleDeleteHistoryItem}
        onClearAll={handleClearAllHistory}
        onNotify={(msg, kind) => showToast(msg, kind || '', 2800)}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}
