// ============================================
// src/components/BarcodeScanner.tsx
// كومبوننت مستقل لمسح الباركود / QR / UPC عبر كاميرا الموبايل
// مستقل تماماً عن Firebase/Auth - آمن 100% ومالوش أي تعارض مع باقي النظام
// ============================================
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Zap, ZapOff } from 'lucide-react';

// رسالة تغذية راجعة تظهر فوق شاشة الكاميرا أثناء المسح المستمر
export interface ScanFeedback {
  id: number; // قيمة فريدة لكل رسالة (Date.now()) عشان تتحدث حتى لو النص نفسه اتكرر
  type: 'success' | 'error';
  message: string;
}

export interface DetectedScan {
  barcode: string;
  format: string;
}

interface Props {
  title: string;
  // single: يقفل نفسه تلقائياً بعد أول قراءة ناجحة (مناسب لتحديد منتج واحد)
  // continuous: يفضل يمسح باستمرار لحد ما المستخدم يقفله يدوياً (مناسب لإدخال عدة سيريالات ورا بعض)
  mode?: 'single' | 'continuous';
  onDetected: (code: string, format: string) => void;
  onClose: () => void;
  feedback?: ScanFeedback | null;
}

// الصيغ المدعومة - شامل UPC-A / UPC-E
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
];

export default function BarcodeScanner({
  title,
  mode = 'single',
  onDetected,
  onClose,
  feedback = null,
}: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const containerId = useRef(`scanner-${Math.random().toString(36).slice(2)}`);
  const isClosingRef = useRef(false);

  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleFeedback, setVisibleFeedback] = useState<ScanFeedback | null>(null);

  // فتح الصوت في أقرب لحظة ممكنة من ضغطة المستخدم (مهم جداً لـ iOS Safari)
  useEffect(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, []);

  const playBeep = useCallback((success: boolean) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(success ? 1100 : 300, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + (success ? 0.1 : 0.18));
    } catch {}
  }, []);

  const vibrate = useCallback(() => {
    if (navigator.vibrate) navigator.vibrate(120);
  }, []);

  // عرض رسالة التغذية الراجعة الجاية من الصفحة الأب لمدة قصيرة ثم إخفاؤها تلقائياً
  useEffect(() => {
    if (!feedback) return;
    setVisibleFeedback(feedback);
    playBeep(feedback.type === 'success');
    if (feedback.type === 'success') vibrate();
    const timer = setTimeout(() => setVisibleFeedback(null), 1800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback?.id]);

  const checkCapabilities = useCallback(() => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      const caps = scanner.getRunningTrackCapabilities() as any;
      if (caps.torchFeature && caps.torchFeature().isSupported()) {
        setTorchSupported(true);
      }
      if (caps.zoomFeature && caps.zoomFeature().isSupported()) {
        const zf = caps.zoomFeature();
        setZoomRange({ min: zf.min(), max: zf.max(), step: zf.step() || 0.1 });
        setZoom(zf.value());
      }
    } catch {}
  }, []);

  const handleRawDetection = useCallback(
    (decodedText: string, format: string) => {
      const now = Date.now();
      // حارس تقني بسيط لمنع تكرار نفس القراءة خلال أقل من 1.2 ثانية (لأن الكاميرا بتفضل شايفة نفس الباركود لعدة فريمات)
      if (lastScanRef.current.code === decodedText && now - lastScanRef.current.time < 1200) {
        return;
      }
      lastScanRef.current = { code: decodedText, time: now };

      onDetected(decodedText, format);

      if (mode === 'single' && !isClosingRef.current) {
        isClosingRef.current = true;
        playBeep(true);
        vibrate();
        setTimeout(() => onClose(), 350);
      }
    },
    [mode, onDetected, onClose, playBeep, vibrate]
  );

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId.current);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, formatsToSupport: SUPPORTED_FORMATS } as any,
        (decodedText, result) => {
          const formatName =
            (result as any)?.result?.format?.formatName ||
            (result as any)?.result?.format ||
            'UNKNOWN';
          handleRawDetection(decodedText, String(formatName));
        },
        () => {
          /* بيتكرر باستمرار وهو بيدور على كود - سلوك طبيعي تماماً */
        }
      )
      .then(() => checkCapabilities())
      .catch((err) => {
        console.error('فشل تشغيل الكاميرا:', err);
        setError('تعذّر فتح الكاميرا. تأكد من إعطاء صلاحية الكاميرا للموقع.');
      });

    return () => {
      const s = scannerRef.current;
      if (s && s.isScanning) {
        s.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTorch = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      const caps = scanner.getRunningTrackCapabilities() as any;
      const torchFeature = caps.torchFeature();
      const next = !torchOn;
      await torchFeature.apply(next);
      setTorchOn(next);
    } catch {
      alert('الفلاش غير مدعوم على هذا الجهاز/المتصفح حالياً');
    }
  };

  const handleZoomChange = async (value: number) => {
    setZoom(value);
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      const caps = scanner.getRunningTrackCapabilities() as any;
      const zoomFeature = caps.zoomFeature();
      if (zoomFeature.isSupported()) {
        await zoomFeature.apply(value);
        return;
      }
    } catch {}
    const videoEl = document.querySelector(`#${containerId.current} video`) as HTMLVideoElement | null;
    if (videoEl) videoEl.style.transform = `scale(${value})`;
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-4 bg-elevated border-b border-violet-900/40">
        <h3 className="text-base font-bold text-violet-300 flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
          {title}
        </h3>
        <button
          onClick={() => { scannerRef.current?.stop().catch(() => {}); onClose(); }}
          className="p-2 rounded-full bg-white/10 text-gray-300 hover:bg-white/20"
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative flex-1 bg-black overflow-hidden">
        <div id={containerId.current} className="w-full h-full" />

        <div className="absolute inset-x-10 top-1/3 h-1/3 border-2 border-violet-400/70 rounded-2xl pointer-events-none" />

        {error && (
          <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 bg-red-900/90 p-4 rounded-xl text-center text-sm">
            {error}
          </div>
        )}

        {visibleFeedback && (
          <div
            className={`absolute top-4 inset-x-4 rounded-xl px-4 py-3 text-center text-sm font-bold shadow-lg ${
              visibleFeedback.type === 'success'
                ? 'bg-green-600/90 text-white'
                : 'bg-red-600/90 text-white'
            }`}
          >
            {visibleFeedback.message}
          </div>
        )}

        <p className="absolute bottom-24 inset-x-0 text-center text-xs text-gray-300">
          {mode === 'continuous'
            ? 'وجّه الكاميرا ناحية كل باركود - هيفضل يمسح لحد ما تقفل بنفسك'
            : 'وجّه الكاميرا ناحية الباركود'}
        </p>
      </div>

      <div className="p-4 bg-elevated border-t border-violet-900/40 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">🔍−</span>
          <input
            type="range"
            min={zoomRange?.min || 1}
            max={zoomRange?.max || 3}
            step={zoomRange?.step || 0.1}
            value={zoom}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="text-xs text-gray-400">+🔍</span>
        </div>

        <button
          onClick={toggleTorch}
          disabled={!torchSupported}
          className={`w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
            torchOn
              ? 'bg-yellow-500 text-slate-950'
              : 'bg-white/10 text-gray-300 disabled:opacity-40'
          }`}
        >
          {torchOn ? <Zap size={16} /> : <ZapOff size={16} />}
          {torchSupported ? (torchOn ? 'إطفاء الفلاش' : 'تشغيل الفلاش') : 'الفلاش غير متاح على هذا الجهاز'}
        </button>
      </div>
    </div>
  );
}