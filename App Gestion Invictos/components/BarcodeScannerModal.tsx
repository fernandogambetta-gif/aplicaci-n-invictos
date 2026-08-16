import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  X,
  Loader2,
  Keyboard,
  ScanLine,
  Focus,
  ZoomIn,
  RefreshCw,
  VideoOff,
} from 'lucide-react';

interface BarcodeScannerModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  onDetected: (code: string) => void | Promise<void>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: {
      formats?: string[];
    }) => {
      detect: (source: HTMLVideoElement) => Promise<
        Array<{
          rawValue?: string;
        }>
      >;
    };

    jsQR?: (
      data: Uint8ClampedArray,
      width: number,
      height: number,
      options?: {
        inversionAttempts?:
          | 'dontInvert'
          | 'onlyInvert'
          | 'attemptBoth'
          | 'invertFirst';
      },
    ) => {
      data: string;
    } | null;
  }
}

const loadJsQr = (): Promise<void> => {
  if (window.jsQR) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-invictos-jsqr-live="true"]',
  );

  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.jsQR) {
        resolve();
        return;
      }

      existing.addEventListener(
        'load',
        () => {
          if (window.jsQR) resolve();
          else reject(new Error('El lector QR no quedó disponible.'));
        },
        { once: true },
      );

      existing.addEventListener(
        'error',
        () => reject(new Error('No se pudo cargar el lector QR.')),
        { once: true },
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src =
      'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    script.async = true;
    script.dataset.invictosJsqrLive = 'true';

    script.onload = () => {
      if (window.jsQR) resolve();
      else reject(new Error('No se pudo inicializar el lector QR.'));
    };

    script.onerror = () =>
      reject(new Error('No se pudo cargar el lector QR.'));

    document.head.appendChild(script);
  });
};

const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  open,
  title = 'Escanear QR',
  onClose,
  onDetected,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const handledRef = useRef(false);
  const detectorRef = useRef<any>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [status, setStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');

  const [errorMessage, setErrorMessage] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  const [zoomValue, setZoomValue] = useState(1);
  const [cameraMessage, setCameraMessage] = useState('');

  const stopCamera = () => {
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    scanningRef.current = false;
    detectorRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    if (fallbackCanvasRef.current) {
      fallbackCanvasRef.current.width = 1;
      fallbackCanvasRef.current.height = 1;
    }

    setZoomSupported(false);
  };

  const emitCode = async (rawCode: string) => {
    const code = (rawCode || '').trim();

    if (!code || handledRef.current) return;

    handledRef.current = true;
    stopCamera();

    try {
      await onDetected(code);
    } finally {
      onClose();
    }
  };

  const refreshDevices = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cameras = all.filter((device) => device.kind === 'videoinput');

      setDevices(cameras);

      if (!selectedDeviceId && cameras.length === 1) {
        setSelectedDeviceId(cameras[0].deviceId);
      }
    } catch (error) {
      console.debug('No se pudieron enumerar cámaras:', error);
    }
  };

  const configureTrack = async (track: MediaStreamTrack) => {
    try {
      const capabilities =
        typeof track.getCapabilities === 'function'
          ? (track.getCapabilities() as any)
          : {};

      const advanced: any[] = [];

      const focusModes: string[] = Array.isArray(capabilities.focusMode)
        ? capabilities.focusMode
        : [];

      if (focusModes.includes('continuous')) {
        advanced.push({ focusMode: 'continuous' });
      }

      const zoomCapability = capabilities.zoom;

      if (
        zoomCapability &&
        Number.isFinite(Number(zoomCapability.min)) &&
        Number.isFinite(Number(zoomCapability.max)) &&
        Number(zoomCapability.max) > Number(zoomCapability.min)
      ) {
        const min = Number(zoomCapability.min);
        const max = Number(zoomCapability.max);
        const initial = Math.min(max, Math.max(min, 1.7));

        setZoomSupported(true);
        setZoomMin(min);
        setZoomMax(max);
        setZoomValue(initial);

        advanced.push({ zoom: initial });
      } else {
        setZoomSupported(false);
      }

      if (advanced.length > 0) {
        await track.applyConstraints({
          advanced,
        } as any);
      }
    } catch (error) {
      console.debug('La cámara no permitió ajustes extra:', error);
    }
  };

  const forceFocus = async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;

    try {
      const capabilities =
        typeof track.getCapabilities === 'function'
          ? (track.getCapabilities() as any)
          : {};

      const modes: string[] = Array.isArray(capabilities.focusMode)
        ? capabilities.focusMode
        : [];

      if (modes.includes('single-shot')) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'single-shot' }],
        } as any);

        setCameraMessage('Reenfocando… mantené el QR quieto.');

        window.setTimeout(() => {
          if (!streamRef.current) return;

          if (modes.includes('continuous')) {
            void track
              .applyConstraints({
                advanced: [{ focusMode: 'continuous' }],
              } as any)
              .catch(() => undefined);
          }
        }, 700);

        return;
      }

      if (modes.includes('continuous')) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'continuous' }],
        } as any);

        setCameraMessage('Autofoco continuo reactivado.');
        return;
      }

      setCameraMessage(
        'Esta lente no permite controlar el foco. Probá otra cámara trasera.',
      );
    } catch {
      setCameraMessage(
        'No se pudo forzar el foco. Probá cambiar de cámara.',
      );
    }
  };

  const changeZoom = async (value: number) => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;

    const safe = Math.min(zoomMax, Math.max(zoomMin, value));
    setZoomValue(safe);

    try {
      await track.applyConstraints({
        advanced: [{ zoom: safe }],
      } as any);
    } catch {
      // No hacemos fallar el lector por zoom.
    }
  };

  const scanWithJsQr = async (): Promise<string> => {
    const video = videoRef.current;

    if (
      !video ||
      video.readyState < 2 ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      return '';
    }

    await loadJsQr();

    if (!window.jsQR) return '';

    let canvas = fallbackCanvasRef.current;

    if (!canvas) {
      canvas = document.createElement('canvas');
      fallbackCanvasRef.current = canvas;
    }

    // Muy liviano: nunca procesamos más de 480 px de ancho.
    const targetWidth = Math.min(480, video.videoWidth);
    const scale = targetWidth / video.videoWidth;
    const targetHeight = Math.max(
      1,
      Math.round(video.videoHeight * scale),
    );

    if (
      canvas.width !== targetWidth ||
      canvas.height !== targetHeight
    ) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const ctx = canvas.getContext('2d', {
      willReadFrequently: true,
    });

    if (!ctx) return '';

    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    const image = ctx.getImageData(
      0,
      0,
      targetWidth,
      targetHeight,
    );

    const result = window.jsQR(
      image.data,
      targetWidth,
      targetHeight,
      {
        inversionAttempts: 'dontInvert',
      },
    );

    return (result?.data || '').trim();
  };

  const scheduleScan = () => {
    if (!streamRef.current || handledRef.current) return;

    scanTimerRef.current = window.setTimeout(async () => {
      if (
        scanningRef.current ||
        !streamRef.current ||
        handledRef.current
      ) {
        scheduleScan();
        return;
      }

      scanningRef.current = true;

      try {
        let detected = '';

        if (detectorRef.current && videoRef.current) {
          const results = await detectorRef.current.detect(videoRef.current);
          detected = (results?.[0]?.rawValue || '').trim();
        } else {
          detected = await scanWithJsQr();
        }

        if (detected) {
          await emitCode(detected);
          return;
        }
      } catch (error) {
        console.debug('Lectura QR:', error);
      } finally {
        scanningRef.current = false;
      }

      scheduleScan();
    }, 300);
  };

  const buildDetector = () => {
    try {
      if (typeof window.BarcodeDetector === 'function') {
        try {
          detectorRef.current = new window.BarcodeDetector({
            formats: ['qr_code', 'ean_13', 'ean_8', 'code_128'],
          });
        } catch {
          detectorRef.current = new window.BarcodeDetector();
        }

        setCameraMessage(
          'Usando el lector nativo del navegador, con menor consumo de memoria.',
        );
        return;
      }
    } catch {
      // fallback debajo
    }

    detectorRef.current = null;
    setCameraMessage(
      'Este navegador usará el lector QR liviano de respaldo.',
    );
  };

  const startCamera = async (deviceId?: string) => {
    stopCamera();
    handledRef.current = false;

    setStatus('loading');
    setErrorMessage('');
    setCameraMessage('');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Este navegador no permite usar la cámara.');
      }

      const videoConstraints: MediaTrackConstraints = deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 960, max: 1280 },
            height: { ideal: 540, max: 720 },
          }
        : {
            facingMode: { ideal: 'environment' },
            width: { ideal: 960, max: 1280 },
            height: { ideal: 540, max: 720 },
          };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints,
      });

      streamRef.current = stream;

      const video = videoRef.current;

      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        throw new Error('No se pudo iniciar la vista de cámara.');
      }

      video.srcObject = stream;
      await video.play();

      const track = stream.getVideoTracks()[0];

      if (track) {
        await configureTrack(track);

        const settings = track.getSettings?.();
        if (settings?.deviceId) {
          setSelectedDeviceId(settings.deviceId);
        }
      }

      await refreshDevices();
      buildDetector();

      setStatus('ready');
      scheduleScan();
    } catch (error: any) {
      console.error('Error abriendo cámara:', error);
      stopCamera();
      setStatus('error');

      const message = String(error?.message || '');

      if (/permission|notallowed/i.test(message)) {
        setErrorMessage(
          'No se otorgó permiso para usar la cámara.',
        );
      } else {
        setErrorMessage(
          message || 'No se pudo abrir la cámara.',
        );
      }
    }
  };

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    // Importante: NO abrimos la cámara automáticamente.
    // Esto evita reservar memoria si el usuario solo quiere escribir el código.
    handledRef.current = false;
    setStatus('idle');
    setErrorMessage('');
    setManualCode('');
    setDevices([]);
    setSelectedDeviceId('');
    setCameraMessage('');

    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();

    const code = manualCode.trim();
    if (!code) return;

    await emitCode(code);
  };

  return (
    <div className="fixed inset-0 z-[10080] bg-white sm:bg-black/60 sm:flex sm:items-center sm:justify-center sm:p-4">
      <div
        className="
          w-full h-[100dvh] bg-white flex flex-col overflow-hidden
          sm:h-auto sm:max-h-[94dvh] sm:max-w-xl sm:rounded-2xl sm:shadow-2xl
        "
      >
        {/* HEADER SIEMPRE VISIBLE */}
        <div className="shrink-0 px-4 py-3 border-b border-slate-200 bg-white flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide font-bold text-indigo-600">
              Lector liviano
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-0.5">
              {title}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Ya no se toman fotografías. La cámara se abre solo cuando tocás
              “Iniciar lector”.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X size={22} />
          </button>
        </div>

        {/* CONTENIDO: SCROLL INTERNO */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4">
          {status === 'idle' && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-center">
              <Camera
                size={34}
                className="mx-auto text-indigo-600 mb-3"
              />

              <div className="font-bold text-slate-900">
                Cámara detenida
              </div>

              <p className="text-sm text-slate-600 mt-2">
                Esto reduce el consumo de memoria y evita mantener la cámara
                activa cuando no hace falta.
              </p>

              <button
                type="button"
                onClick={() => void startCamera()}
                className="mt-4 w-full px-4 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-2"
              >
                <Camera size={19} />
                Iniciar lector QR
              </button>
            </div>
          )}

          {status === 'loading' && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 flex flex-col items-center justify-center gap-3">
              <Loader2
                size={30}
                className="animate-spin text-indigo-600"
              />
              <div className="font-semibold text-slate-700">
                Iniciando cámara…
              </div>
            </div>
          )}

          {(status === 'ready' || status === 'loading') && (
            <div className="space-y-3">
              <div
                className="relative bg-black rounded-2xl overflow-hidden mx-auto w-full max-w-[420px] aspect-square"
                onClick={() => void forceFocus()}
              >
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  muted
                  playsInline
                />

                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-[62%] aspect-square border-2 border-white rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.20)] relative">
                    <ScanLine
                      size={36}
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white"
                    />
                  </div>
                </div>
              </div>

              {status === 'ready' && (
                <>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 text-center">
                    Mantené el QR dentro del cuadrado. Si esta lente no enfoca
                    bien, probá otra cámara en el selector.
                  </div>

                  {devices.length > 1 && (
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                        Cámara / lente
                      </label>

                      <div className="flex gap-2">
                        <select
                          value={selectedDeviceId}
                          onChange={(e) => {
                            const value = e.target.value;
                            setSelectedDeviceId(value);
                            void startCamera(value);
                          }}
                          className="flex-1 min-w-0 border border-slate-300 rounded-xl px-3 py-3 bg-white text-sm"
                        >
                          {devices.map((device, index) => (
                            <option
                              key={device.deviceId || index}
                              value={device.deviceId}
                            >
                              {device.label || `Cámara ${index + 1}`}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => void refreshDevices()}
                          className="px-4 rounded-xl border border-slate-300 bg-white text-slate-700"
                          title="Actualizar cámaras"
                        >
                          <RefreshCw size={18} />
                        </button>
                      </div>

                      <p className="text-[11px] text-slate-400 mt-1">
                        En teléfonos con varias cámaras traseras, probá las
                        distintas opciones hasta encontrar la que enfoque mejor
                        de cerca.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void forceFocus()}
                      className="px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-semibold flex items-center justify-center gap-2"
                    >
                      <Focus size={18} />
                      Enfocar
                    </button>

                    {zoomSupported ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1">
                          <span className="flex items-center gap-1">
                            <ZoomIn size={14} />
                            Zoom
                          </span>
                          <span>{zoomValue.toFixed(1)}×</span>
                        </div>

                        <input
                          type="range"
                          min={zoomMin}
                          max={zoomMax}
                          step={0.1}
                          value={zoomValue}
                          onChange={(e) =>
                            void changeZoom(Number(e.target.value))
                          }
                          className="w-full"
                        />
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500 text-center">
                        Zoom no disponible en esta lente.
                      </div>
                    )}
                  </div>

                  {cameraMessage && (
                    <div className="text-xs text-center text-slate-500">
                      {cameraMessage}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setStatus('idle');
                    }}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold flex items-center justify-center gap-2"
                  >
                    <VideoOff size={18} />
                    Apagar cámara
                  </button>
                </>
              )}
            </div>
          )}

          {status === 'error' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              <div className="font-bold">No se pudo iniciar la cámara</div>
              <div className="text-sm mt-1">{errorMessage}</div>

              <button
                type="button"
                onClick={() => void startCamera()}
                className="mt-3 px-4 py-3 rounded-xl bg-red-600 text-white font-semibold"
              >
                Reintentar
              </button>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            <strong>Importante:</strong> eliminé por completo “Tomar foto del
            QR”. En este teléfono esa operación estaba provocando el error de
            memoria y el cierre de la página.
          </div>
        </div>

        {/* FOOTER SIEMPRE VISIBLE EN CELULAR */}
        <div
          className="shrink-0 border-t border-slate-200 bg-white p-3"
          style={{
            paddingBottom:
              'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <form
            onSubmit={(e) => void submitManual(e)}
            className="flex gap-2"
          >
            <div className="relative flex-1 min-w-0">
              <Keyboard
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="text"
                inputMode="numeric"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Código corto, ej. 1007"
                className="w-full border border-slate-300 rounded-xl pl-10 pr-3 py-3 text-base"
              />
            </div>

            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="px-4 py-3 rounded-xl bg-slate-900 text-white font-bold disabled:opacity-40"
            >
              Buscar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BarcodeScannerModal;
