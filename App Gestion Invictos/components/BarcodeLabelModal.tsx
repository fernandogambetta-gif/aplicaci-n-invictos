import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Loader2,
  Barcode as BarcodeIcon,
  Download,
  Share2,
  Image as ImageIcon,
  Copy,
  Check,
} from 'lucide-react';
import { Product } from '../types';

declare global {
  interface Window {
    JsBarcode?: (
      element: SVGElement | HTMLCanvasElement,
      value: string,
      options?: Record<string, unknown>,
    ) => void;
  }
}

interface BarcodeLabelModalProps {
  open: boolean;
  product: Product | null;
  onClose: () => void;

  // Si viene desde un ingreso de mercadería, permite elegir
  // la cantidad sugerida de etiquetas a imprimir luego en NIIMBOT.
  stockEntryQuantity?: number;
}

type LabelSize = '40x15' | '50x15' | '60x15';
type CopyMode = 'variant' | 'unit' | 'custom';

const loadJsBarcode = (): Promise<void> => {
  if (window.JsBarcode) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-invictos-jsbarcode="true"]',
  );

  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.JsBarcode) {
        resolve();
        return;
      }

      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () =>
          reject(
            new Error(
              'No se pudo cargar el generador de códigos de barras.',
            ),
          ),
        { once: true },
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src =
      'https://cdn.jsdelivr.net/npm/jsbarcode@3.12.1/dist/JsBarcode.all.min.js';
    script.async = true;
    script.dataset.invictosJsbarcode = 'true';
    script.onload = () => resolve();
    script.onerror = () =>
      reject(
        new Error(
          'No se pudo cargar el generador de códigos de barras.',
        ),
      );

    document.head.appendChild(script);
  });
};

const sizeToMm = (size: LabelSize) => {
  const [width, height] = size.split('x').map(Number);
  return { width, height };
};

const mmToPx = (mm: number, dpi = 203): number =>
  Math.max(1, Math.round((mm / 25.4) * dpi));

const getBarcodeFormat = (
  value: string,
): 'EAN13' | 'EAN8' | 'CODE128' => {
  if (/^\d{13}$/.test(value)) return 'EAN13';
  if (/^\d{8}$/.test(value)) return 'EAN8';
  return 'CODE128';
};

const sanitizeFileName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 100) || 'etiqueta';

const buildLabelFileName = (
  product: Product | null,
  labelSize: LabelSize,
): string => {
  if (!product) return `etiqueta_${labelSize}.png`;

  const parts = [
    product.name,
    product.color,
    product.size ? `t_${product.size}` : '',
    product.barcode || product.code,
    labelSize,
  ]
    .filter(Boolean)
    .map((part) => sanitizeFileName(String(part)));

  return `${parts.join('_') || 'etiqueta'}.png`;
};

const wrapLines = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] => {
  const clean = (text || '').trim();
  if (!clean) return [];

  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    const width = ctx.measureText(trial).width;

    if (width <= maxWidth || !current) {
      current = trial;
    } else {
      lines.push(current);
      current = word;

      if (lines.length === maxLines - 1) {
        break;
      }
    }
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  if (
    words.length > 0 &&
    lines.length === maxLines &&
    lines.join(' ') !== clean
  ) {
    const last = lines[maxLines - 1];
    if (!last.endsWith('…')) {
      lines[maxLines - 1] =
        last.length > 1 ? `${last.slice(0, -1)}…` : `${last}…`;
    }
  }

  return lines;
};

const dataUrlToFile = async (
  dataUrl: string,
  fileName: string,
): Promise<File> => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: 'image/png' });
};

const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  open,
  product,
  onClose,
  stockEntryQuantity,
}) => {
  const [copies, setCopies] = useState(1);
  const [copyMode, setCopyMode] = useState<CopyMode>('custom');
  const [labelSize, setLabelSize] =
    useState<LabelSize>('50x15');
  const [isLoading, setIsLoading] =
    useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [copiedName, setCopiedName] = useState(false);

  const barcodeValue = (
    product?.barcode ||
    product?.code ||
    ''
  ).trim();

  const barcodeFormat =
    getBarcodeFormat(barcodeValue);

  const suggestedCopies = useMemo(
    () =>
      Math.max(
        1,
        Math.min(100, Number(copies) || 1),
      ),
    [copies],
  );

  const fileName = useMemo(
    () => buildLabelFileName(product, labelSize),
    [product, labelSize],
  );

  useEffect(() => {
    if (!open) return;

    const entryQty = Math.max(
      0,
      Number(stockEntryQuantity || 0),
    );

    if (entryQty > 0) {
      setCopyMode('unit');
      setCopies(entryQty);
    } else {
      setCopyMode('custom');
      setCopies(1);
    }

    setLabelSize('50x15');
    setError('');
    setPreviewUrl('');
    setCopiedName(false);
  }, [open, product?.id, stockEntryQuantity]);

  useEffect(() => {
    if (!open || !product || !barcodeValue) return;

    let cancelled = false;

    const renderLabel = async () => {
      setError('');
      setIsLoading(true);

      try {
        await loadJsBarcode();

        if (!window.JsBarcode) {
          throw new Error(
            'No se pudo inicializar el generador de códigos de barras.',
          );
        }

        const { width: widthMm, height: heightMm } =
          sizeToMm(labelSize);

        const dpi = 203;
        const widthPx = mmToPx(widthMm, dpi);
        const heightPx = mmToPx(heightMm, dpi);

        const canvas =
          document.createElement('canvas');
        canvas.width = widthPx;
        canvas.height = heightPx;

        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error(
            'No se pudo crear la imagen PNG.',
          );
        }

        // Fondo
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, widthPx, heightPx);

        const barcodeZoneWidth = Math.round(
          widthPx * (widthMm <= 40 ? 0.70 : 0.68),
        );
        const descriptionZoneX = barcodeZoneWidth + 1;
        const descriptionZoneWidth =
          widthPx - descriptionZoneX - 1;

        // Canvas temporal para barcode
        const barcodeCanvas =
          document.createElement('canvas');

        window.JsBarcode(
          barcodeCanvas,
          barcodeValue,
          {
            format: barcodeFormat,
            displayValue: true,
            font: 'Arial',
            fontOptions: 'bold',
            fontSize:
              barcodeFormat === 'CODE128'
                ? 12
                : 13,
            textMargin: 2,
            height:
              barcodeFormat === 'CODE128'
                ? Math.max(
                    32,
                    Math.round(heightPx * 0.48),
                  )
                : Math.max(
                    34,
                    Math.round(heightPx * 0.52),
                  ),
            width:
              barcodeFormat === 'CODE128'
                ? 1.6
                : 1.35,
            margin: 4,
            background: '#ffffff',
            lineColor: '#000000',
          },
        );

        // Dibujo del barcode
        const padX = Math.max(4, Math.round(widthPx * 0.01));
        const padY = Math.max(4, Math.round(heightPx * 0.04));

        const targetW = barcodeZoneWidth - padX * 2;
        const targetH = heightPx - padY * 2;

        const barcodeAspect =
          barcodeCanvas.width / barcodeCanvas.height;

        let drawW = targetW;
        let drawH = drawW / barcodeAspect;

        if (drawH > targetH) {
          drawH = targetH;
          drawW = drawH * barcodeAspect;
        }

        const drawX =
          Math.round((barcodeZoneWidth - drawW) / 2);
        const drawY =
          Math.round((heightPx - drawH) / 2);

        ctx.drawImage(
          barcodeCanvas,
          drawX,
          drawY,
          drawW,
          drawH,
        );

        // Separador vertical
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(barcodeZoneWidth, 0);
        ctx.lineTo(barcodeZoneWidth, heightPx);
        ctx.stroke();

        // Texto a la derecha
        const textPadX = Math.max(
          7,
          Math.round(widthPx * 0.018),
        );
        const textPadY = Math.max(
          10,
          Math.round(heightPx * 0.1),
        );
        const textX = descriptionZoneX + textPadX;
        const textMaxWidth =
          descriptionZoneWidth - textPadX * 2;

        const variant = [
          product.color,
          product.size
            ? `T. ${product.size}`
            : '',
        ]
          .filter(Boolean)
          .join(' · ');

        const titleFontSize =
          widthMm <= 40 ? 11 : widthMm >= 60 ? 14 : 12;
        const variantFontSize =
          widthMm <= 40 ? 9 : widthMm >= 60 ? 11 : 10;

        ctx.fillStyle = '#000000';
        ctx.textBaseline = 'top';

        ctx.font = `700 ${titleFontSize}px Arial`;
        const nameLines = wrapLines(
          ctx,
          product.name || '',
          textMaxWidth,
          variant ? 2 : 3,
        );

        let cursorY = textPadY;

        nameLines.forEach((line) => {
          ctx.fillText(line, textX, cursorY);
          cursorY += Math.round(titleFontSize * 1.1);
        });

        if (variant) {
          cursorY += 2;
          ctx.font = `700 ${variantFontSize}px Arial`;
          const variantLines = wrapLines(
            ctx,
            variant,
            textMaxWidth,
            2,
          );

          variantLines.forEach((line) => {
            ctx.fillText(line, textX, cursorY);
            cursorY += Math.round(
              variantFontSize * 1.08,
            );
          });
        }

        const url = canvas.toDataURL('image/png');

        if (!cancelled) {
          setPreviewUrl(url);
        }
      } catch (e: any) {
        console.error(e);

        if (!cancelled) {
          setError(
            e?.message ||
              'No se pudo generar la imagen PNG de la etiqueta.',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void renderLabel();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    product,
    barcodeValue,
    barcodeFormat,
    labelSize,
  ]);

  if (!open || !product) return null;

  const handleDownload = () => {
    if (!previewUrl) {
      setError(
        'La imagen todavía se está generando. Esperá un momento e intentá nuevamente.',
      );
      return;
    }

    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = fileName;
    link.click();
  };

  const handleShare = async () => {
    try {
      if (!previewUrl) {
        setError(
          'La imagen todavía se está generando. Esperá un momento e intentá nuevamente.',
        );
        return;
      }

      if (
        !navigator.share ||
        typeof navigator.canShare !== 'function'
      ) {
        setError(
          'Este dispositivo no admite compartir archivos directamente.',
        );
        return;
      }

      setIsSharing(true);

      const file = await dataUrlToFile(
        previewUrl,
        fileName,
      );

      if (!navigator.canShare({ files: [file] })) {
        setError(
          'Este dispositivo no permite compartir este archivo PNG.',
        );
        return;
      }

      await navigator.share({
        title: `Etiqueta ${product.name}`,
        text:
          'Etiqueta PNG generada desde INVICTOS para imprimir en NIIMBOT.',
        files: [file],
      });
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error(e);
        setError(
          e?.message ||
            'No se pudo compartir la imagen PNG.',
        );
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyFileName = async () => {
    try {
      await navigator.clipboard.writeText(fileName);
      setCopiedName(true);
      window.setTimeout(() => setCopiedName(false), 1800);
    } catch {
      setError('No se pudo copiar el nombre del archivo.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[10020] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-start gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide font-semibold text-indigo-600">
              {stockEntryQuantity
                ? 'Etiquetas del ingreso · PNG para NIIMBOT'
                : 'Etiqueta de producto · PNG para NIIMBOT'}
            </div>

            <h3 className="text-lg font-bold text-slate-900 mt-1">
              {product.name}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X size={21} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!barcodeValue ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
              Este producto no tiene código de barras ni SKU para generar la etiqueta.
            </div>
          ) : (
            <>
              {Boolean(stockEntryQuantity && stockEntryQuantity > 0) && (
                <div className="border border-indigo-200 bg-indigo-50/50 rounded-xl p-4 space-y-3">
                  <div>
                    <div className="font-bold text-slate-800">
                      Cantidad sugerida de etiquetas
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Ingreso registrado: {Number(stockEntryQuantity)} unidad(es) de esta variante.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCopyMode('variant');
                        setCopies(1);
                      }}
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        copyMode === 'variant'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <div className="font-bold text-sm">Una por variante</div>
                      <div className={`text-[11px] mt-1 ${
                        copyMode === 'variant' ? 'text-indigo-100' : 'text-slate-400'
                      }`}>
                        1 etiqueta
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCopyMode('unit');
                        setCopies(Math.max(1, Number(stockEntryQuantity)));
                      }}
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        copyMode === 'unit'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <div className="font-bold text-sm">Una por unidad</div>
                      <div className={`text-[11px] mt-1 ${
                        copyMode === 'unit' ? 'text-indigo-100' : 'text-slate-400'
                      }`}>
                        {Number(stockEntryQuantity)} etiqueta(s)
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCopyMode('custom');
                        setCopies(1);
                      }}
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        copyMode === 'custom'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <div className="font-bold text-sm">Cantidad manual</div>
                      <div className={`text-[11px] mt-1 ${
                        copyMode === 'custom' ? 'text-indigo-100' : 'text-slate-400'
                      }`}>
                        Elegir cantidad
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* PREVISUALIZACION */}
              <div className="bg-slate-100 rounded-xl p-5 overflow-x-auto">
                <div className="flex items-center justify-center min-h-[120px]">
                  {isLoading ? (
                    <div className="flex flex-col items-center gap-2 text-slate-500">
                      <Loader2
                        size={24}
                        className="animate-spin"
                      />
                      <span className="text-sm">
                        Generando PNG...
                      </span>
                    </div>
                  ) : previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={`Etiqueta ${product.name}`}
                      className="bg-white border border-slate-300 shadow-sm max-w-full h-auto"
                      style={{
                        width:
                          labelSize === '40x15'
                            ? 260
                            : labelSize === '50x15'
                            ? 320
                            : 380,
                      }}
                    />
                  ) : (
                    <div className="text-slate-400 text-sm">
                      No se pudo generar la previsualización.
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                    Tamaño etiqueta
                  </label>

                  <select
                    value={labelSize}
                    onChange={(e) =>
                      setLabelSize(
                        e.target
                          .value as LabelSize,
                      )
                    }
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="40x15">
                      40 × 15 mm
                    </option>
                    <option value="50x15">
                      50 × 15 mm
                    </option>
                    <option value="60x15">
                      60 × 15 mm
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                    Cantidad sugerida
                  </label>

                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={copies}
                    onChange={(e) => {
                      setCopyMode('custom');
                      setCopies(
                        Math.max(
                          1,
                          Math.min(
                            100,
                            parseInt(
                              e.target.value,
                              10,
                            ) || 1,
                          ),
                        ),
                      );
                    }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 flex gap-2">
                <BarcodeIcon
                  size={16}
                  className="shrink-0 mt-0.5"
                />

                <div>
                  <div>
                    Formato:{' '}
                    <strong>
                      {barcodeFormat}
                    </strong>
                  </div>

                  <div className="mt-1">
                    Código:{' '}
                    <strong className="font-mono text-sm text-slate-900">
                      {barcodeValue}
                    </strong>
                  </div>

                  <div className="mt-1">
                    Cantidad sugerida para imprimir en NIIMBOT:{' '}
                    <strong className="text-slate-900">
                      {suggestedCopies}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-800 flex gap-2">
                <ImageIcon
                  size={16}
                  className="shrink-0 mt-0.5"
                />
                <div>
                  Este archivo se descarga como <strong>PNG</strong>. En el celular podés usar <strong>Compartir / Guardar</strong> para mandarlo a Archivos, Drive, WhatsApp u otra app, y luego abrirlo/importarlo en NIIMBOT.
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-[11px] uppercase font-bold tracking-wide text-slate-500">
                  Nombre del archivo
                </div>

                <div className="mt-1 flex items-start justify-between gap-3">
                  <div className="font-mono text-sm text-slate-900 break-all">
                    {fileName}
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleCopyFileName()}
                    className="shrink-0 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  >
                    {copiedName ? <Check size={14} /> : <Copy size={14} />}
                    {copiedName ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
            >
              Cerrar
            </button>

            {typeof navigator !== 'undefined' &&
              typeof navigator.share === 'function' && (
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  disabled={!barcodeValue || isLoading || !previewUrl || isSharing}
                  className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-lg font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {isSharing ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Share2 size={18} />
                  )}
                  Compartir / Guardar
                </button>
              )}

            <button
              type="button"
              onClick={handleDownload}
              disabled={!barcodeValue || isLoading || !previewUrl}
              className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              <Download size={18} />
              Descargar / Guardar PNG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarcodeLabelModal;
