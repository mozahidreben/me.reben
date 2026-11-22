import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, Square, Play, Gauge, X, AlertCircle, Plus, Minus, Mic, Camera, Sun, Moon, FileText, Share2, RefreshCw, MapPin } from 'lucide-react';
import { GUIDE_CONTENT, GUIDE_LANGS } from '../data/guideContent.ts';
import type { GuideLang, GuideStepId } from '../data/guideContent.ts';

interface TutorialModalProps {
  open: boolean;
  onClose: () => void;
  lang: GuideLang;
  onChangeLang: (lang: GuideLang) => void;
  stationsCount?: number;
  stationsLabel?: string;
  onOpenStations?: () => void;
}

const TOUR_SEQUENCE: GuideStepId[] = ['intro', '1', '2', '3', '4'];

export function TutorialModal({
  open,
  onClose,
  lang,
  onChangeLang,
  stationsCount = 1,
  stationsLabel = 'Stations',
  onOpenStations,
}: TutorialModalProps) {
  const copy = GUIDE_CONTENT[lang];

  // Voice guide state
  const [activeStep, setActiveStep] = useState<GuideStepId | null>(null);
  const [loadingStep, setLoadingStep] = useState<GuideStepId | null>(null);
  const [isTourActive, setIsTourActive] = useState(false);
  const [speechRate, setSpeechRate] = useState<1 | 0.85>(1);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [usingBrowserVoice, setUsingBrowserVoice] = useState(false);

  // Audio playback & caching refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());
  const inflightFetchRef = useRef<Map<string, Promise<string>>>(new Map());
  const tourCancelRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const stepCardRefs = useRef<Record<string, HTMLElement | null>>({});

  // Mini-screen animation states
  const [demo1, setDemo1] = useState({
    hl: '' as '' | 'name' | 'p91' | 'p95' | 'pd',
    name: '',
    p91: '0.00',
    p95: '0.00',
    pd: '0.00',
  });
  const [demo2, setDemo2] = useState({
    hl: '' as '' | 'ini' | 'cam' | 'fin',
    ini: '',
    fin: '',
    scan: false,
    sales: false,
  });
  const [demo3, setDemo3] = useState({
    hl: '' as '' | 'btn' | 'atm' | 'reb',
    open: false,
    atm: '0',
    reb: '0',
    cash: '0.00',
    pop: false,
  });
  const [demo4, setDemo4] = useState({
    hl: '' as '' | 'wa' | 'shift',
    toast: false,
    night: false,
  });

  const stopAllAudio = useCallback(() => {
    tourCancelRef.current = true;
    setIsTourActive(false);
    setActiveStep(null);
    setLoadingStep(null);
    setUsingBrowserVoice(false);

    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }, []);

  // Stop audio whenever modal closes
  useEffect(() => {
    if (!open) {
      stopAllAudio();
      setVoiceError(null);
    }
  }, [open, stopAllAudio]);

  // Revoke object URLs on unmount
  useEffect(() => {
    const cache = audioCacheRef.current;
    return () => {
      stopAllAudio();
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
    };
  }, [stopAllAudio]);

  // Update playback rate dynamically if toggled while playing
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speechRate;
    }
  }, [speechRate]);

  // Load pre-installed offline MP3 guide clip first (works with zero internet); fall back to API only if missing
  const fetchStepAudioUrl = useCallback(async (targetLang: GuideLang, step: GuideStepId): Promise<string> => {
    const key = `${targetLang}:${step}`;
    const existing = audioCacheRef.current.get(key);
    if (existing) return existing;

    const inflight = inflightFetchRef.current.get(key);
    if (inflight) return inflight;

    const promise = (async () => {
      const staticPath = `/audio/guide/${targetLang}/${step}.mp3`;
      try {
        const localRes = await fetch(staticPath);
        const contentType = localRes.headers.get('content-type') || '';
        if (localRes.ok && !contentType.includes('text/html')) {
          const blob = await localRes.blob();
          if (blob.size > 0) {
            const objectUrl = URL.createObjectURL(blob);
            audioCacheRef.current.set(key, objectUrl);
            return objectUrl;
          }
        }
      } catch {
        // Ignore and try API fallback if online
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Offline audio clip unavailable.');
      }

      const res = await fetch('/api/guide-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: targetLang, step }),
      });
      if (!res.ok) {
        let errText = `Voice service unavailable (${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) errText = data.error;
        } catch {}
        throw new Error(errText);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      audioCacheRef.current.set(key, objectUrl);
      return objectUrl;
    })();

    inflightFetchRef.current.set(key, promise);
    try {
      return await promise;
    } finally {
      inflightFetchRef.current.delete(key);
    }
  }, []);

  // Preload intro and step 1 locally when guide opens or language changes
  useEffect(() => {
    if (!open) return;
    fetchStepAudioUrl(lang, 'intro').catch(() => {});
    fetchStepAudioUrl(lang, '1').catch(() => {});
  }, [open, lang, fetchStepAudioUrl]);

  const scrollStepIntoView = useCallback((step: GuideStepId) => {
    if (step === 'intro') {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const card = stepCardRefs.current[step];
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const playSingleStep = useCallback(
    async (step: GuideStepId, partOfTour = false): Promise<boolean> => {
      setVoiceError(null);
      setUsingBrowserVoice(false);
      setLoadingStep(step);
      scrollStepIntoView(step);

      // Prefetch next step if running tour
      if (partOfTour) {
        const idx = TOUR_SEQUENCE.indexOf(step);
        const nextStep = TOUR_SEQUENCE[idx + 1];
        if (nextStep) {
          fetchStepAudioUrl(lang, nextStep).catch(() => {});
        }
      }

      try {
        const url = await fetchStepAudioUrl(lang, step);
        if (tourCancelRef.current && partOfTour) return false;

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }
        const audio = audioRef.current;
        audio.pause();
        audio.src = url;
        audio.playbackRate = speechRate;

        setLoadingStep(null);
        setActiveStep(step);

        return await new Promise<boolean>((resolve) => {
          audio.onended = () => {
            if (!partOfTour) {
              setActiveStep(null);
            }
            resolve(true);
          };
          audio.onerror = () => {
            setActiveStep(null);
            setVoiceError('Could not play audio clip.');
            resolve(false);
          };
          audio.play().catch((err) => {
            setActiveStep(null);
            setVoiceError(err instanceof Error ? err.message : 'Tap again to allow audio playback.');
            resolve(false);
          });
        });
      } catch (err: unknown) {
        setLoadingStep(null);
        setActiveStep(null);
        const msg = err instanceof Error ? err.message : 'Could not load voice explanation.';
        setVoiceError(msg);
        return false;
      }
    },
    [fetchStepAudioUrl, lang, scrollStepIntoView, speechRate]
  );

  const handleToggleFullTour = useCallback(async () => {
    if (isTourActive || activeStep || loadingStep) {
      stopAllAudio();
      return;
    }
    tourCancelRef.current = false;
    setIsTourActive(true);
    for (const step of TOUR_SEQUENCE) {
      if (tourCancelRef.current) break;
      const ok = await playSingleStep(step, true);
      if (!ok || tourCancelRef.current) break;
      // Short gentle pause between steps
      await new Promise((r) => setTimeout(r, 450));
    }
    if (!tourCancelRef.current) {
      setIsTourActive(false);
      setActiveStep(null);
    }
  }, [activeStep, isTourActive, loadingStep, playSingleStep, stopAllAudio]);

  const handleListenStep = useCallback(
    async (step: GuideStepId) => {
      if (activeStep === step || loadingStep === step) {
        stopAllAudio();
        return;
      }
      stopAllAudio();
      tourCancelRef.current = false;
      await playSingleStep(step, false);
    },
    [activeStep, loadingStep, playSingleStep, stopAllAudio]
  );

  // Explicit user-triggered device speech fallback if Gemini TTS has an error
  const handleBrowserSpeechFallback = useCallback(
    (stepToRead: GuideStepId = '1') => {
      if (!('speechSynthesis' in window)) {
        setVoiceError('Device speech synthesis is not supported on this browser.');
        return;
      }
      stopAllAudio();
      setVoiceError(null);
      setUsingBrowserVoice(true);
      const langMap: Record<GuideLang, string> = {
        en: 'en-US',
        ar: 'ar-SA',
        hi: 'hi-IN',
        ur: 'ur-PK',
        bn: 'bn-BD',
      };
      const utter = new SpeechSynthesisUtterance(copy.scripts[stepToRead]);
      utter.lang = langMap[lang];
      utter.pitch = 1.25;
      utter.rate = speechRate;
      const voices = window.speechSynthesis.getVoices();
      const femaleMatch = voices.find(
        (v) =>
          v.lang.toLowerCase().startsWith(lang) &&
          /female|woman|girl|samantha|victoria|karen|zira|heera|kalpana|google/i.test(v.name)
      );
      if (femaleMatch) utter.voice = femaleMatch;
      setActiveStep(stepToRead);
      scrollStepIntoView(stepToRead);
      utter.onend = () => {
        setActiveStep(null);
        setUsingBrowserVoice(false);
      };
      utter.onerror = () => {
        setActiveStep(null);
        setUsingBrowserVoice(false);
      };
      window.speechSynthesis.speak(utter);
    },
    [copy.scripts, lang, scrollStepIntoView, speechRate, stopAllAudio]
  );

  const handleLanguageSelect = (newLang: GuideLang) => {
    stopAllAudio();
    setVoiceError(null);
    onChangeLang(newLang);
  };

  // Animated mini-screens when modal is open
  useEffect(() => {
    if (!open) return;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms));
    };

    const runDemo1 = () => {
      setDemo1({ hl: '', name: '', p91: '0.00', p95: '0.00', pd: '0.00' });
      later(() => setDemo1((s) => ({ ...s, hl: 'name' })), 300);
      const station = 'RIYADH 12';
      for (let i = 1; i <= station.length; i++) {
        later(() => setDemo1((s) => ({ ...s, name: station.slice(0, i) })), 500 + i * 90);
      }
      later(() => setDemo1((s) => ({ ...s, hl: 'p91' })), 1800);
      later(() => setDemo1((s) => ({ ...s, p91: '2.18' })), 2300);
      later(() => setDemo1((s) => ({ ...s, hl: 'p95' })), 2900);
      later(() => setDemo1((s) => ({ ...s, p95: '2.33' })), 3400);
      later(() => setDemo1((s) => ({ ...s, hl: 'pd' })), 4000);
      later(() => setDemo1((s) => ({ ...s, pd: '1.66' })), 4500);
      later(() => setDemo1((s) => ({ ...s, hl: '' })), 5100);
      later(runDemo1, 6600);
    };

    const runDemo2 = () => {
      setDemo2({ hl: '', ini: '', fin: '', scan: false, sales: false });
      later(() => setDemo2((s) => ({ ...s, hl: 'ini' })), 300);
      const ini = '125430.5';
      for (let i = 1; i <= ini.length; i++) {
        later(() => setDemo2((s) => ({ ...s, ini: ini.slice(0, i) })), 500 + i * 110);
      }
      later(() => setDemo2((s) => ({ ...s, hl: 'cam' })), 2100);
      later(() => setDemo2((s) => ({ ...s, scan: true })), 2700);
      later(() => setDemo2((s) => ({ ...s, scan: false, hl: 'fin' })), 4100);
      const fin = '125980.2';
      for (let i = 1; i <= fin.length; i++) {
        later(() => setDemo2((s) => ({ ...s, fin: fin.slice(0, i) })), 4200 + i * 70);
      }
      later(() => setDemo2((s) => ({ ...s, hl: '', sales: true })), 5100);
      later(runDemo2, 7600);
    };

    const runDemo3 = () => {
      setDemo3({ hl: '', open: false, atm: '0', reb: '0', cash: '0.00', pop: false });
      later(() => setDemo3((s) => ({ ...s, hl: 'btn' })), 300);
      later(() => setDemo3((s) => ({ ...s, open: true, hl: '' })), 1000);
      later(() => setDemo3((s) => ({ ...s, hl: 'atm' })), 1700);
      const atm = '1200';
      for (let i = 1; i <= atm.length; i++) {
        later(() => setDemo3((s) => ({ ...s, atm: atm.slice(0, i) })), 1800 + i * 150);
      }
      later(() => setDemo3((s) => ({ ...s, hl: 'reb' })), 2900);
      const reb = '350';
      for (let i = 1; i <= reb.length; i++) {
        later(() => setDemo3((s) => ({ ...s, reb: reb.slice(0, i) })), 3000 + i * 150);
      }
      later(() => setDemo3((s) => ({ ...s, hl: '', cash: '1,985.30', pop: true })), 4100);
      later(() => setDemo3((s) => ({ ...s, pop: false })), 4500);
      later(runDemo3, 7000);
    };

    const runDemo4 = () => {
      setDemo4({ hl: '', toast: false, night: false });
      later(() => setDemo4((s) => ({ ...s, hl: 'wa' })), 300);
      later(() => setDemo4((s) => ({ ...s, toast: true, hl: '' })), 1100);
      later(() => setDemo4((s) => ({ ...s, toast: false })), 3000);
      later(() => setDemo4((s) => ({ ...s, hl: 'shift' })), 3300);
      later(() => setDemo4((s) => ({ ...s, hl: '', night: true })), 4200);
      later(runDemo4, 7200);
    };

    runDemo1();
    runDemo2();
    runDemo3();
    runDemo4();

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [open]);

  if (!open) return null;

  const isSpeakingAnything = activeStep !== null || loadingStep !== null;
  const dir = copy.rtl ? 'rtl' : 'ltr';

  const renderStepAudioButton = (stepId: GuideStepId) => {
    const isThisPlaying = activeStep === stepId;
    const isThisLoading = loadingStep === stepId;
    return (
      <button
        type="button"
        onClick={() => handleListenStep(stepId)}
        className={`tut-listen-btn ${isThisPlaying ? 'playing' : ''} ${isThisLoading ? 'loading' : ''}`}
        aria-label={`${copy.listenStep} ${stepId}`}
      >
        {isThisLoading ? (
          <>
            <span className="tut-mini-spinner" />
            <span>{copy.loadingVoice}</span>
          </>
        ) : isThisPlaying ? (
          <>
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>{copy.playingStep}</span>
          </>
        ) : (
          <>
            <Volume2 className="w-4 h-4" />
            <span>{copy.listenStep}</span>
          </>
        )}
      </button>
    );
  };

  return (
    <div
      className={`tut-overlay ${lang !== 'en' ? 'tut-nonlatin' : ''}`}
      id="tutorial"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      lang={lang}
      style={{ display: 'flex' }}
    >
      <div className="tut-head" dir={dir}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="tut-title">{copy.title}</div>
          <div className="tut-sub">{copy.sub}</div>
        </div>
        <div className="tut-head-actions">
          {onOpenStations && (
            <button
              type="button"
              className="tut-station-btn"
              onClick={() => {
                onClose();
                onOpenStations();
              }}
              aria-label={stationsLabel}
            >
              <MapPin className="w-3.5 h-3.5 text-[var(--reben-red)]" />
              <span>{stationsCount > 1 ? `${stationsLabel} (${stationsCount})` : stationsLabel}</span>
            </button>
          )}
          <button className="tut-x" onClick={onClose} aria-label="Close" type="button">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="tut-langs" role="group" aria-label="Language">
        {GUIDE_LANGS.map((code) => (
          <button
            key={code}
            type="button"
            className={`tut-lang ${lang === code ? 'on' : ''}`}
            onClick={() => handleLanguageSelect(code)}
          >
            {GUIDE_CONTENT[code].label}
          </button>
        ))}
      </div>

      {/* Clean Voice Guide Bar */}
      <div className="tut-voice-bar" dir={dir}>
        <div className="tut-voice-top">
          <div className="tut-voice-persona">
            <div className={`tut-avatar ${activeStep ? 'speaking' : ''}`} aria-hidden="true">
              <Volume2 className="w-4 h-4" />
            </div>
            <div className="tut-voice-meta">
              <div className="tut-voice-title">{copy.voiceBannerTitle}</div>
              <div className="tut-voice-sub">
                {activeStep
                  ? `${copy.speakingPrefix}${usingBrowserVoice ? ' (Device)' : ''} · ${
                      activeStep === 'intro' ? copy.voiceBannerTitle : `${activeStep}/4`
                    }`
                  : loadingStep
                  ? copy.loadingVoice
                  : copy.voiceBannerSub}
              </div>
            </div>
          </div>

          <div className="tut-voice-controls">
            <button
              type="button"
              className="tut-speed-btn"
              onClick={() => setSpeechRate((r) => (r === 1 ? 0.85 : 1))}
              title="Toggle voice speed"
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>{speechRate === 1 ? '1.0x' : '0.85x'}</span>
            </button>

            <button
              type="button"
              className={`tut-playall-btn ${isSpeakingAnything ? 'stop' : ''}`}
              onClick={handleToggleFullTour}
            >
              {loadingStep && !activeStep ? (
                <>
                  <span className="tut-mini-spinner white" />
                  <span>{copy.loadingVoice}</span>
                </>
              ) : isSpeakingAnything ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>{copy.stopVoice}</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{copy.playAll}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {(activeStep || loadingStep) && (
          <div className="tut-caption-box">
            <div className={`tut-eq ${activeStep ? 'active' : ''}`} aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <p className="tut-caption-text">{copy.scripts[activeStep || loadingStep || 'intro']}</p>
          </div>
        )}

        {voiceError && (
          <div className="tut-voice-error">
            <div className="tut-voice-error-msg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{voiceError}</span>
            </div>
            <button
              type="button"
              className="tut-fallback-btn"
              onClick={() => handleBrowserSpeechFallback(activeStep || '1')}
            >
              Use Device Voice
            </button>
          </div>
        )}
      </div>

      <div className="tut-scroll" ref={scrollContainerRef}>
        {/* STEP 1 */}
        <section
          className={`tut-step ${activeStep === '1' ? 'tut-step-active' : ''}`}
          ref={(el) => {
            stepCardRefs.current['1'] = el;
          }}
        >
          <div className="tut-step-head" dir={dir}>
            <div className="tut-num">1</div>
            <div className="tut-step-text">
              <h3>{copy.s1t}</h3>
              <p>{copy.s1d}</p>
            </div>
            {renderStepAudioButton('1')}
          </div>
          <div className="tut-screen tut-demo">
            <span className="tut-chip">{copy.example}</span>
            <div className="mini-card">
              <div className={`mini-name mini-mono ${demo1.hl === 'name' ? 'hl' : ''}`}>
                <span className="v">{demo1.name}</span>
              </div>
              <div className="mini-prices">
                <div className={`mini-pill c91 ${demo1.hl === 'p91' ? 'hl' : ''}`}>
                  <label>91</label>
                  <span className={demo1.p91 === '0.00' ? 'empty' : ''}>{demo1.p91}</span>
                </div>
                <div className={`mini-pill c95 ${demo1.hl === 'p95' ? 'hl' : ''}`}>
                  <label>95</label>
                  <span className={demo1.p95 === '0.00' ? 'empty' : ''}>{demo1.p95}</span>
                </div>
                <div className={`mini-pill cd ${demo1.hl === 'pd' ? 'hl' : ''}`}>
                  <label>D</label>
                  <span className={demo1.pd === '0.00' ? 'empty' : ''}>{demo1.pd}</span>
                </div>
                <div className="mini-apps">
                  <Plus className="w-3 h-3" /> APPS
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STEP 2 */}
        <section
          className={`tut-step ${activeStep === '2' ? 'tut-step-active' : ''}`}
          ref={(el) => {
            stepCardRefs.current['2'] = el;
          }}
        >
          <div className="tut-step-head" dir={dir}>
            <div className="tut-num">2</div>
            <div className="tut-step-text">
              <h3>{copy.s2t}</h3>
              <p>{copy.s2d}</p>
            </div>
            {renderStepAudioButton('2')}
          </div>
          <div className="tut-screen tut-demo">
            <span className="tut-chip">{copy.example}</span>
            <div className="mini-nozzle">
              <div className="mini-nz-head">
                <div className="mini-nz-name">Nozzle 1</div>
                <div className="mini-fuel">91</div>
              </div>
              <div className="mini-lbl">INITIAL (6 AM)</div>
              <div className={`mini-field ${demo2.hl === 'ini' ? 'hl' : ''}`}>
                <div className="val mini-mono">{demo2.ini}</div>
                <div className="mini-ic">
                  <Mic className="w-3.5 h-3.5" />
                </div>
                <div className="mini-ic">
                  <Camera className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mini-lbl">FINAL (6 PM)</div>
              <div className={`mini-field ${demo2.hl === 'fin' ? 'hl' : ''}`}>
                <div className="val mini-mono">{demo2.fin}</div>
                <div className="mini-ic">
                  <Mic className="w-3.5 h-3.5" />
                </div>
                <div className={`mini-ic ${demo2.hl === 'cam' ? 'hl' : ''}`}>
                  <Camera className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className={`mini-sales ${demo2.sales ? 'on' : ''}`}>
                <span>Sales: 549.70 L</span>
              </div>
            </div>
            <div className={`scan ${demo2.scan ? 'on' : ''}`}>
              <div className="scan-frame mini-mono">125980.2</div>
              <small>Point the camera at the meter</small>
            </div>
          </div>
        </section>

        {/* STEP 3 */}
        <section
          className={`tut-step ${activeStep === '3' ? 'tut-step-active' : ''}`}
          ref={(el) => {
            stepCardRefs.current['3'] = el;
          }}
        >
          <div className="tut-step-head" dir={dir}>
            <div className="tut-num">3</div>
            <div className="tut-step-text">
              <h3>{copy.s3t}</h3>
              <p>{copy.s3d}</p>
            </div>
            {renderStepAudioButton('3')}
          </div>
          <div className="tut-screen tut-demo">
            <span className="tut-chip">{copy.example}</span>
            <div className="mini-card">
              <div className="mini-topbar">
                <div className="nm mini-mono">RIYADH 12</div>
                <div className={`mini-apps ${demo3.hl === 'btn' ? 'hl' : ''}`}>
                  {demo3.open ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />} APPS
                </div>
              </div>
              <div className={`mini-panel ${demo3.open ? 'open' : ''}`}>
                <div className="mini-panel-in">
                  <div className="mini-grid">
                    <div>
                      <div className="mini-lbl">ATM</div>
                      <div className={`mini-field ${demo3.hl === 'atm' ? 'hl' : ''}`}>
                        <div className="val mini-mono">{demo3.atm}</div>
                      </div>
                    </div>
                    <div>
                      <div className="mini-lbl">Reben APP</div>
                      <div className={`mini-field ${demo3.hl === 'reb' ? 'hl' : ''}`}>
                        <div className="val mini-mono">{demo3.reb}</div>
                      </div>
                    </div>
                  </div>
                  <div className="mini-cash">
                    <span>CASH (auto)</span>
                    <b className={demo3.pop ? 'pop' : ''}>{demo3.cash}</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STEP 4 */}
        <section
          className={`tut-step ${activeStep === '4' ? 'tut-step-active' : ''}`}
          ref={(el) => {
            stepCardRefs.current['4'] = el;
          }}
        >
          <div className="tut-step-head" dir={dir}>
            <div className="tut-num">4</div>
            <div className="tut-step-text">
              <h3>{copy.s4t}</h3>
              <p>{copy.s4d}</p>
            </div>
            {renderStepAudioButton('4')}
          </div>
          <div className={`tut-screen tut-demo ${demo4.night ? 'night' : ''}`}>
            <span className="tut-chip">{copy.example}</span>
            <div className={`mini-toast ${demo4.toast ? 'on' : ''}`}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 fill-[#25D366]" aria-hidden="true">
                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.79 14.08c-.24.68-1.41 1.3-1.95 1.38-.52.08-1.18.11-1.9-.12-.44-.14-1-.33-1.72-.64-3.03-1.31-5.01-4.37-5.16-4.57-.15-.2-1.23-1.64-1.23-3.13 0-1.49.78-2.22 1.06-2.52.28-.3.6-.38.8-.38.2 0 .4 0 .58.01.19.01.44-.07.69.53.25.61.86 2.1.94 2.25.08.15.13.33.03.53-.1.2-.15.33-.3.5-.15.18-.32.4-.45.53-.15.15-.3.31-.13.61.18.3.79 1.3 1.7 2.11 1.17 1.04 2.15 1.36 2.45 1.51.3.15.48.13.65-.08.18-.2.75-.88.95-1.18.2-.3.4-.25.68-.15.28.1 1.76.83 2.06.98.3.15.5.23.58.35.07.13.07.73-.17 1.41z" />
              </svg>
              <span>Report sent to WhatsApp ✓</span>
            </div>
            <div className="mini-spacer" />
            <div className="mini-footer">
              <div className="mini-stats">
                <div className="mini-badge">
                  <span>{demo4.night ? 'NIGHT SHIFT (6PM-6AM)' : 'DAY SHIFT (6AM-6PM)'}</span>
                  {demo4.night ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
                </div>
                <div className="mini-total mini-mono">549.70</div>
              </div>
              <div className="mini-actions">
                <div className="mini-act ma-pdf">
                  <FileText className="w-3.5 h-3.5" />
                  PDF
                </div>
                <div className="mini-act ma-share">
                  <Share2 className="w-3.5 h-3.5" />
                  SHARE
                </div>
                <div className={`mini-act ma-shift ${demo4.hl === 'shift' ? 'hl' : ''}`}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  SHIFT
                </div>
                <div className={`mini-act ma-wa ${demo4.hl === 'wa' ? 'hl' : ''}`}>
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.79 14.08c-.24.68-1.41 1.3-1.95 1.38-.52.08-1.18.11-1.9-.12-.44-.14-1-.33-1.72-.64-3.03-1.31-5.01-4.37-5.16-4.57-.15-.2-1.23-1.64-1.23-3.13 0-1.49.78-2.22 1.06-2.52.28-.3.6-.38.8-.38.2 0 .4 0 .58.01.19.01.44-.07.69.53.25.61.86 2.1.94 2.25.08.15.13.33.03.53-.1.2-.15.33-.3.5-.15.18-.32.4-.45.53-.15.15-.3.31-.13.61.18.3.79 1.3 1.7 2.11 1.17 1.04 2.15 1.36 2.45 1.51.3.15.48.13.65-.08.18-.2.75-.88.95-1.18.2-.3.4-.25.68-.15.28.1 1.76.83 2.06.98.3.15.5.23.58.35.07.13.07.73-.17 1.41z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="tut-foot">
        <button className="tut-ok" onClick={onClose} type="button">
          {copy.ok}
        </button>
      </div>
    </div>
  );
}
