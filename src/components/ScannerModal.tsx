import { useEffect, useRef, useState } from 'react';
import { Zap, X } from 'lucide-react';
import { createWorker, PSM } from 'tesseract.js';
import type { Worker } from 'tesseract.js';

interface ScannerModalProps {
  open: boolean;
  onDetected: (value: string) => void;
  onClose: () => void;
  onCameraError?: (msg: string) => void;
  scanHint?: string;
  camErrorText?: string;
}

export function ScannerModal({
  open,
  onDetected,
  onClose,
  onCameraError,
  scanHint = 'Align meter digits inside the box',
  camErrorText = 'Camera unavailable. Please allow camera access.',
}: ScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const activeRef = useRef(false);
  const [torchOn, setTorchOn] = useState(false);
  const [flashActive, setFlashActive] = useState(false);

  // Initialize local bundled Tesseract OCR worker once (100% offline capable)
  useEffect(() => {
    let mounted = true;
    let createdWorker: Worker | null = null;

    async function initWorker() {
      try {
        const origin = window.location.origin;
        const worker = await createWorker('eng', 1, {
          workerPath: `${origin}/tesseract/worker.min.js`,
          corePath: `${origin}/tesseract/tesseract-core-lstm.wasm.js`,
          langPath: `${origin}/tesseract`,
          workerBlobURL: false,
        });
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789.',
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
        });
        createdWorker = worker;
        if (mounted) {
          workerRef.current = worker;
        } else {
          await worker.terminate();
        }
      } catch (err) {
        console.error('OCR init error:', err);
      }
    }

    initWorker();
    return () => {
      mounted = false;
      if (createdWorker) {
        createdWorker.terminate().catch(() => {});
      }
    };
  }, []);

  const playBeep = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioCtx();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.1);
      if (audioContext.state === 'suspended') audioContext.resume();
    } catch {}
  };

  useEffect(() => {
    if (!open) {
      activeRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setTorchOn(false);
      return;
    }

    activeRef.current = true;
    let timerId: number | null = null;

    const tick = async () => {
      if (!activeRef.current) return;
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
        const ctx = c.getContext('2d');
        const width = v.videoWidth;
        const height = v.videoHeight;
        if (ctx && width && height) {
          const captureWidth = width * 0.8;
          const captureHeight = height * 0.2;
          const captureX = (width - captureWidth) / 2;
          const captureY = (height - captureHeight) / 2;
          c.width = captureWidth;
          c.height = captureHeight;
          ctx.filter = 'contrast(1.5) grayscale(1) brightness(1.1)';
          ctx.drawImage(v, captureX, captureY, captureWidth, captureHeight, 0, 0, captureWidth, captureHeight);

          try {
            if (workerRef.current) {
              const res = await workerRef.current.recognize(c);
              const cleaned = String(res?.data?.text || '').replace(/[^\d.]/g, '');
              const match = cleaned.match(/\d+\.?\d*/g);
              if (match && match.length > 0 && res.data.confidence > 50) {
                setFlashActive(true);
                playBeep();
                activeRef.current = false;
                onDetected(match[0]);
                window.setTimeout(() => {
                  setFlashActive(false);
                  onClose();
                }, 300);
                return;
              }
            }
          } catch {}
        }
      }
      if (activeRef.current) {
        timerId = window.setTimeout(tick, 200);
      }
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      onCameraError?.(camErrorText);
      onClose();
      return;
    }

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      .then((mediaStream) => {
        if (!activeRef.current) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(() => {});
            tick();
          };
        }
      })
      .catch(() => {
        onCameraError?.(camErrorText);
        onClose();
      });

    return () => {
      activeRef.current = false;
      if (timerId !== null) window.clearTimeout(timerId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open, onClose, onDetected, onCameraError, camErrorText]);

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    try {
      const track = streamRef.current.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      if (track && caps?.torch) {
        const next = !torchOn;
        setTorchOn(next);
        await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      }
    } catch {}
  };

  if (!open) return null;

  return (
    <div className="modal" id="scanner" style={{ display: 'flex' }}>
      <div className="cam-view">
        <div
          id="flash"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--wa)',
            opacity: flashActive ? 0.55 : 0,
            transition: 'opacity 0.25s ease',
            zIndex: 15,
            pointerEvents: 'none',
          }}
        />
        <video ref={videoRef} id="v" autoPlay playsInline muted />
        <div className="guide" />
        <div
          style={{
            position: 'absolute',
            top: 'calc(24px + env(safe-area-inset-top))',
            left: 16,
            right: 16,
            textAlign: 'center',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          {scanHint}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(40px + env(safe-area-inset-bottom))',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            gap: '20px',
            zIndex: 20,
          }}
        >
          <button
            type="button"
            onClick={toggleTorch}
            aria-label="Toggle flashlight"
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: torchOn ? 'rgba(251, 191, 36, 0.45)' : 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(4px)',
            }}
          >
            <Zap className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(255,0,0,0.4)',
              border: 'none',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(4px)',
            }}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>
      <canvas ref={canvasRef} id="c" style={{ display: 'none' }} />
    </div>
  );
}
