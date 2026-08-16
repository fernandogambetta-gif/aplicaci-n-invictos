import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, Loader2, Keyboard, AlertTriangle, ScanLine, Focus, ZoomIn, ImagePlus } from 'lucide-react';

interface BarcodeScannerModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  onDetected: (code: string) => void | Promise<void>;
}


declare global {
  interface Window {
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

const ZXING_URL = 'https://unpkg.com/@zxing/browser@0.2.1/umd/zxing-browser.min.js';
let zxingLoader: Promise<any> | null = null;

const loadZXing = (): Promise<any> => {
  const existing = (window as any).ZXingBrowser;
  if (existing) return Promise.resolve(existing);

  if (zxingLoader) return zxingLoader;

  zxingLoader = new Promise((resolve, reject) => {
    const previous = document.querySelector(`script[src="${ZXING_URL}"]`) as HTMLScriptElement | null;

    if (previous) {
      previous.addEventListener('load', () => resolve((window as any).ZXingBrowser), { once: true });
      previous.addEventListener('error', () => reject(new Error('No se pudo cargar el lector de códigos.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = ZXING_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      const zxing = (window as any).ZXingBrowser;
      if (zxing) resolve(zxing);
      else reject(new Error('El lector de códigos no quedó disponible.'));
    };
    script.onerror = () => reject(new Error('No se pudo cargar el lector de códigos.'));
    document.head.appendChild(script);
  });

  return zxingLoader;
};

const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  open,
  title = 'Escanear código de barras',
  onClose,
  onDetected,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<any>(null);
  const handledRef = useRef(false);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [focusSupported, setFocusSupported] = useState(false);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomValue, setZoomValue] = useState(1);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  const [focusMessage, setFocusMessage] = useState('');
  const [isReadingPhoto, setIsReadingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState('');

  const stopScanner = () => {
    try {
      controlsRef.current?.stop?.();
    } catch {
      // noop
    }
    controlsRef.current = null;
    videoTrackRef.current = null;

    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const loadJsQr = (): Promise<void> => {
    if (window.jsQR) return Promise.resolve();

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-invictos-jsqr="true"]',
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
            else reject(new Error('El lector QR cargó pero no quedó disponible.'));
          },
          { once: true },
        );

        existing.addEventListener(
          'error',
          () => reject(new Error('No se pudo cargar el lector de QR para fotos.')),
          { once: true },
        );
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src =
        'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
      script.async = true;
      script.dataset.invictosJsqr = 'true';

      script.onload = () => {
        if (window.jsQR) resolve();
        else reject(new Error('No se pudo inicializar el lector QR para fotos.'));
      };

      script.onerror = () =>
        reject(new Error('No se pudo cargar el lector QR para fotos.'));

      document.head.appendChild(script);
    });
  };

  const readQrFromPhoto = async (file: File) => {
    if (!file) return;

    setPhotoMessage('');
    setIsReadingPhoto(true);

    let bitmap: ImageBitmap | null = null;

    try {
      await loadJsQr();

      if (!window.jsQR) {
        throw new Error('No se pudo inicializar el lector QR.');
      }

      /*
       * IMPORTANTE PARA CELULARES:
       * No cargamos primero la foto completa en <img>, porque una foto de
       * 12/50 MP puede ocupar decenas o cientos de MB una vez descomprimida.
       *
       * createImageBitmap permite pedir al navegador una versión reducida
       * desde el comienzo. Para un QR pequeño no necesitamos más de ~1200 px.
       */
      const targetMaxSide = 1200;

      if (typeof createImageBitmap === 'function') {
        // Primero obtenemos dimensiones sin mantener múltiples copias grandes.
        const originalBitmap = await createImageBitmap(file);

        const originalWidth = originalBitmap.width;
        const originalHeight = originalBitmap.height;

        const scale = Math.min(
          1,
          targetMaxSide / Math.max(originalWidth, originalHeight),
        );

        const targetWidth = Math.max(
          1,
          Math.round(originalWidth * scale),
        );
        const targetHeight = Math.max(
          1,
          Math.round(originalHeight * scale),
        );

        if (scale < 1) {
          originalBitmap.close();

          bitmap = await createImageBitmap(file, {
            resizeWidth: targetWidth,
            resizeHeight: targetHeight,
            resizeQuality: 'medium',
          });
        } else {
          bitmap = originalBitmap;
        }
      } else {
        /*
         * Fallback para navegadores viejos.
         * Limitamos igualmente el canvas final a 1200 px.
         */
        const objectUrl = URL.createObjectURL(file);

        try {
          const image = new Image();

          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () =>
              reject(new Error('No se pudo abrir la foto tomada.'));
            image.src = objectUrl;
          });

          const scale = Math.min(
            1,
            targetMaxSide /
              Math.max(image.naturalWidth, image.naturalHeight),
          );

          const targetWidth = Math.max(
            1,
            Math.round(image.naturalWidth * scale),
          );
          const targetHeight = Math.max(
            1,
            Math.round(image.naturalHeight * scale),
          );

          const temporaryCanvas = document.createElement('canvas');
          temporaryCanvas.width = targetWidth;
          temporaryCanvas.height = targetHeight;

          const temporaryContext = temporaryCanvas.getContext('2d');

          if (!temporaryContext) {
            throw new Error('No se pudo reducir la fotografía.');
          }

          temporaryContext.drawImage(
            image,
            0,
            0,
            targetWidth,
            targetHeight,
          );

          bitmap = await createImageBitmap(temporaryCanvas);

          temporaryCanvas.width = 1;
          temporaryCanvas.height = 1;
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }

      if (!bitmap) {
        throw new Error('No se pudo preparar la fotografía.');
      }

      const width = bitmap.width;
      const height = bitmap.height;

      /*
       * Primera lectura: recorte central cuadrado.
       * Es la opción que menos memoria usa y coincide con la forma en que
       * se le pide al usuario encuadrar el QR.
       */
      const cropSize = Math.max(
        1,
        Math.round(Math.min(width, height) * 0.82),
      );
      const cropX = Math.max(0, Math.round((width - cropSize) / 2));
      const cropY = Math.max(0, Math.round((height - cropSize) / 2));

      const canvas = document.createElement('canvas');
      canvas.width = cropSize;
      canvas.height = cropSize;

      const ctx = canvas.getContext('2d', {
        willReadFrequently: true,
      });

      if (!ctx) {
        throw new Error('No se pudo analizar la fotografía.');
      }

      ctx.drawImage(
        bitmap,
        cropX,
        cropY,
        cropSize,
        cropSize,
        0,
        0,
        cropSize,
        cropSize,
      );

      let imageData = ctx.getImageData(
        0,
        0,
        cropSize,
        cropSize,
      );

      let result = window.jsQR(
        imageData.data,
        cropSize,
        cropSize,
        { inversionAttempts: 'dontInvert' },
      );

      /*
       * Segundo intento: misma imagen con inversión permitida.
       * Reutilizamos exactamente el mismo buffer para no duplicar memoria.
       */
      if (!result) {
        result = window.jsQR(
          imageData.data,
          cropSize,
          cropSize,
          { inversionAttempts: 'attemptBoth' },
        );
      }

      // Liberamos referencia grande antes de continuar.
      imageData = null as any;

      /*
       * Si no apareció en el centro, probamos una versión completa,
       * pero todavía limitada a 1200 px.
       */
      if (!result) {
        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(bitmap, 0, 0, width, height);

        let fullData = ctx.getImageData(0, 0, width, height);

        result = window.jsQR(
          fullData.data,
          width,
          height,
          { inversionAttempts: 'attemptBoth' },
        );

        fullData = null as any;
      }

      // Liberamos memoria inmediatamente.
      bitmap.close();
      bitmap = null;

      canvas.width = 1;
      canvas.height = 1;

      const detected = (result?.data || '').trim();

      if (!detected) {
        setPhotoMessage(
          'No pude detectar el QR. Sacá la foto con el QR centrado, nítido y ocupando una parte importante de la imagen.',
        );
        return;
      }

      setPhotoMessage(`QR leído: ${detected}`);
      await emitCode(detected);
    } catch (error: any) {
      console.error('Error leyendo QR desde foto:', error);

      const message = String(error?.message || '');

      if (
        /memory|memoria|allocation|out of/i.test(message)
      ) {
        setPhotoMessage(
          'El teléfono no pudo procesar la foto por falta de memoria. Cerrá otras aplicaciones y volvé a intentar. INVICTOS ahora usa una versión reducida de la imagen.',
        );
      } else {
        setPhotoMessage(
          message || 'No se pudo leer el QR de la fotografía.',
        );
      }
    } finally {
      if (bitmap) {
        try {
          bitmap.close();
        } catch {
          // sin acción
        }
      }

      setIsReadingPhoto(false);

      if (photoInputRef.current) {
        photoInputRef.current.value = '';
      }
    }
  };


  const applyCameraEnhancements = async (
    track: MediaStreamTrack,
    initial = false,
  ) => {
    try {
      const capabilities =
        typeof track.getCapabilities === 'function'
          ? (track.getCapabilities() as any)
          : {};

      const advanced: any[] = [];

      const focusModes: string[] = Array.isArray(capabilities.focusMode)
        ? capabilities.focusMode
        : [];

      const canContinuousFocus = focusModes.includes('continuous');
      const canSingleFocus = focusModes.includes('single-shot');

      setFocusSupported(canContinuousFocus || canSingleFocus);

      if (canContinuousFocus) {
        advanced.push({ focusMode: 'continuous' });
      } else if (canSingleFocus) {
        advanced.push({ focusMode: 'single-shot' });
      }

      const zoomCapability = capabilities.zoom;

      if (
        zoomCapability &&
        Number.isFinite(Number(zoomCapability.min)) &&
        Number.isFinite(Number(zoomCapability.max))
      ) {
        const min = Number(zoomCapability.min);
        const max = Number(zoomCapability.max);
        const target = Math.min(
          max,
          Math.max(min, initial ? 2 : zoomValue),
        );

        setZoomSupported(max > min);
        setZoomMin(min);
        setZoomMax(max);
        setZoomValue(target);

        if (max > min) {
          advanced.push({ zoom: target });
        }
      } else {
        setZoomSupported(false);
      }

      if (advanced.length > 0) {
        await track.applyConstraints({
          advanced,
        } as any);
      }

      if (initial) {
        setFocusMessage(
          canContinuousFocus
            ? 'Autofoco continuo activado.'
            : canSingleFocus
              ? 'Enfoque automático activado.'
              : 'La cámara no informa control manual de foco.',
        );
      }
    } catch (error) {
      console.debug('No se pudieron aplicar mejoras de cámara:', error);

      if (initial) {
        setFocusMessage(
          'La cámara está activa, pero el navegador no permitió controlar el foco.',
        );
      }
    }
  };

  const forceFocus = async () => {
    const track = videoTrackRef.current;
    if (!track) return;

    try {
      const capabilities =
        typeof track.getCapabilities === 'function'
          ? (track.getCapabilities() as any)
          : {};

      const focusModes: string[] = Array.isArray(capabilities.focusMode)
        ? capabilities.focusMode
        : [];

      if (focusModes.includes('single-shot')) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'single-shot' }],
        } as any);

        window.setTimeout(() => {
          void track
            .applyConstraints({
              advanced: [
                {
                  focusMode: focusModes.includes('continuous')
                    ? 'continuous'
                    : 'single-shot',
                },
              ],
            } as any)
            .catch(() => undefined);
        }, 600);

        setFocusMessage('Reenfocando… mantené el QR quieto.');
      } else if (focusModes.includes('continuous')) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'continuous' }],
        } as any);

        setFocusMessage('Autofoco continuo reactivado.');
      } else {
        setFocusMessage(
          'Este navegador no permite forzar el foco. Alejá un poco el teléfono y usá zoom.',
        );
      }
    } catch (error) {
      console.debug('Error forzando foco:', error);
      setFocusMessage(
        'No se pudo forzar el foco. Probá alejando el teléfono unos centímetros.',
      );
    }
  };

  const changeZoom = async (nextZoom: number) => {
    const track = videoTrackRef.current;
    if (!track) return;

    const value = Math.min(zoomMax, Math.max(zoomMin, nextZoom));
    setZoomValue(value);

    try {
      await track.applyConstraints({
        advanced: [{ zoom: value }],
      } as any);
    } catch (error) {
      console.debug('No se pudo cambiar zoom:', error);
    }
  };

  const emitCode = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code || handledRef.current) return;

    handledRef.current = true;
    stopScanner();

    try {
      if ('vibrate' in navigator) navigator.vibrate?.(120);
      await Promise.resolve(onDetected(code));
      onClose();
    } catch (error: any) {
      handledRef.current = false;
      setStatus('error');
      setErrorMessage(error?.message || 'No se pudo procesar el código leído.');
    }
  };

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    handledRef.current = false;
    setStatus('loading');
    setErrorMessage('');
    setManualCode('');
    setFocusSupported(false);
    setZoomSupported(false);
    setZoomValue(1);
    setZoomMin(1);
    setZoomMax(1);
    setFocusMessage('');
    setIsReadingPhoto(false);
    setPhotoMessage('');

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Este navegador no permite acceder a la cámara. Podés ingresar el código manualmente.');
        }

        const ZXingBrowser = await loadZXing();
        if (cancelled || !videoRef.current) return;

        const codeReader = new ZXingBrowser.BrowserMultiFormatReader();

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        };

        const controls = await codeReader.decodeFromConstraints(
          constraints,
          videoRef.current,
          (result: any, error: any) => {
            if (cancelled || handledRef.current) return;

            if (result) {
              const text = typeof result.getText === 'function' ? result.getText() : result.text;
              if (text) void emitCode(String(text));
              return;
            }

            if (error) {
              const name = error?.name || error?.constructor?.name || '';
              if (!['NotFoundException', 'ChecksumException', 'FormatException'].includes(name)) {
                console.debug('Scanner:', error);
              }
            }
          },
        );

        if (cancelled) {
          controls?.stop?.();
          return;
        }

        controlsRef.current = controls;

        const stream = videoRef.current?.srcObject as MediaStream | null;
        const videoTrack = stream?.getVideoTracks?.()[0] || null;

        if (videoTrack) {
          videoTrackRef.current = videoTrack;
          await applyCameraEnhancements(videoTrack, true);
        }

        setStatus('ready');
      } catch (error: any) {
        console.error('Error iniciando cámara / lector:', error);
        setStatus('error');

        if (error?.name === 'NotAllowedError') {
          setErrorMessage('No se otorgó permiso para usar la cámara. Habilitalo en el navegador o ingresá el código manualmente.');
        } else if (error?.name === 'NotFoundError') {
          setErrorMessage('No se encontró una cámara disponible. Podés ingresar el código manualmente.');
        } else {
          setErrorMessage(error?.message || 'No se pudo iniciar el escáner. Podés ingresar el código manualmente.');
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Camera size={20} className="text-indigo-600" />
              {title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Para etiquetas pequeñas, usá preferentemente “Tomar foto del QR”. La cámara nativa del celular puede enfocar mucho mejor.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <ImagePlus size={20} />
              </div>

              <div className="flex-1">
                <div className="font-bold text-emerald-900">
                  Recomendado: tomar foto del QR
                </div>

                <p className="text-xs text-emerald-700 mt-1">
                  Usa la cámara nativa del teléfono. INVICTOS reduce la foto antes de analizarla para evitar problemas de memoria.
                </p>

                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isReadingPhoto}
                  className="mt-3 w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isReadingPhoto ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Camera size={18} />
                  )}

                  {isReadingPhoto ? 'Leyendo foto…' : 'Tomar foto del QR'}
                </button>

                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];

                    if (file) {
                      void readQrFromPhoto(file);
                    }
                  }}
                />

                {photoMessage && (
                  <div
                    className={`mt-2 text-xs rounded-lg px-3 py-2 ${
                      photoMessage.startsWith('QR leído:')
                        ? 'bg-white text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {photoMessage}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="relative flex items-center gap-3 py-1">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-[11px] uppercase font-bold tracking-wide text-slate-400">
              o lector en vivo
            </span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          <div
            className="relative bg-black rounded-xl overflow-hidden aspect-[4/3] flex items-center justify-center"
            onClick={() => void forceFocus()}
            title="Tocá la imagen para reenfocar"
          >
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              autoPlay
              muted
              playsInline
            />

            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-[58%] max-w-[230px] aspect-square border-2 border-white/90 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.20)] relative">
                <ScanLine className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 text-white/90" size={34} />
              </div>
            </div>

            {status === 'loading' && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white gap-3">
                <Loader2 className="animate-spin" size={30} />
                <span className="text-sm">Iniciando cámara...</span>
              </div>
            )}
          </div>

          {status === 'ready' && (
            <div className="space-y-3">
              <div className="text-center text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
                Cámara lista. Colocá el QR dentro del cuadrado. Si se ve borroso,
                <strong> alejá un poco el teléfono</strong> y usá el zoom.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void forceFocus()}
                  className="px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center gap-2"
                >
                  <Focus size={18} />
                  Enfocar
                </button>

                {zoomSupported ? (
                  <div className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600 mb-1">
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
                  <div className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center justify-center">
                    Zoom manual no disponible en este navegador.
                  </div>
                )}
              </div>

              {focusMessage && (
                <div className="text-xs text-center text-slate-500">
                  {focusMessage}
                </div>
              )}

              <div className="text-[11px] text-center text-slate-400">
                También podés tocar directamente la imagen para intentar reenfocar.
              </div>
            </div>
          )}

          {status === 'error' && errorMessage && (
            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="border-t border-slate-200 pt-4">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5 mb-2">
              <Keyboard size={14} /> Ingreso manual / lector externo
            </label>
            <div className="flex gap-2">
              <input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void emitCode(manualCode);
                }}
                autoComplete="off"
                inputMode="numeric"
                placeholder="Código corto QR, SKU o código de barras"
                className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2.5 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void emitCode(manualCode)}
                disabled={!manualCode.trim()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Buscar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarcodeScannerModal;
