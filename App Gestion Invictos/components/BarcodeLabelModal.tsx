import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Loader2,
  Download,
  Share2,
  Image as ImageIcon,
  Copy,
  Check,
  QrCode,
  Hash,
} from 'lucide-react';
import { Product } from '../types';

declare global {
  interface Window {
    qrcode?: (
      typeNumber: number,
      errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H',
    ) => {
      addData: (data: string) => void;
      make: () => void;
      getModuleCount: () => number;
      isDark: (row: number, col: number) => boolean;
    };
  }
}

interface BarcodeLabelModalProps {
  open: boolean;
  product: Product | null;
  onClose: () => void;
  stockEntryQuantity?: number;
}

type LabelSize = '40x15' | '50x15' | '60x15';
type CopyMode = 'variant' | 'unit' | 'custom';

const loadQrCode = (): Promise<void> => {
  if (window.qrcode) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-invictos-qrcode="true"]',
  );

  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.qrcode) {
        resolve();
        return;
      }

      existing.addEventListener(
        'load',
        () => {
          if (window.qrcode) resolve();
          else reject(new Error('La librería QR cargó, pero no quedó disponible.'));
        },
        { once: true },
      );

      existing.addEventListener(
        'error',
        () => reject(new Error('No se pudo cargar el generador QR.')),
        { once: true },
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');

    // qrcode-generator expone globalmente window.qrcode().
    // Evitamos QRCode.toCanvas(), que no estaba disponible en algunos navegadores.
    script.src =
      'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';

    script.async = true;
    script.dataset.invictosQrcode = 'true';

    script.onload = () => {
      if (window.qrcode) {
        resolve();
      } else {
        reject(
          new Error(
            'El generador QR se descargó, pero el navegador no pudo inicializarlo.',
          ),
        );
      }
    };

    script.onerror = () =>
      reject(new Error('No se pudo cargar el generador QR.'));

    document.head.appendChild(script);
  });
};

const sizeToMm = (size: LabelSize) => {
  const [width, height] = size.split('x').map(Number);
  return { width, height };
};

const mmToPx = (mm: number, dpi = 203): number =>
  Math.max(1, Math.round((mm / 25.4) * dpi));

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
    product.shortCode ? `qr_${product.shortCode}` : '',
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

    if (ctx.measureText(trial).width <= maxWidth || !current) {
      current = trial;
    } else {
      lines.push(current);
      current = word;

      if (lines.length === maxLines - 1) break;
    }
  }

  if (lines.length < maxLines && current) lines.push(current);

  if (lines.length === maxLines && lines.join(' ') !== clean) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] =
      last.length > 1 ? `${last.slice(0, -1)}…` : `${last}…`;
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
  const [labelSize, setLabelSize] = useState<LabelSize>('50x15');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [copiedName, setCopiedName] = useState(false);

  const shortCode = (product?.shortCode || '').trim();

  const suggestedCopies = useMemo(
    () => Math.max(1, Math.min(100, Number(copies) || 1)),
    [copies],
  );

  const fileName = useMemo(
    () => buildLabelFileName(product, labelSize),
    [product, labelSize],
  );

  useEffect(() => {
    if (!open) return;

    const entryQty = Math.max(0, Number(stockEntryQuantity || 0));

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
    if (!open || !product || !shortCode) return;

    let cancelled = false;

    const renderLabel = async () => {
      setError('');
      setIsLoading(true);

      try {
        await loadQrCode();

        if (!window.qrcode) {
          throw new Error('No se pudo inicializar el generador QR.');
        }

        const { width: widthMm, height: heightMm } = sizeToMm(labelSize);
        const dpi = 203;
        const widthPx = mmToPx(widthMm, dpi);
        const heightPx = mmToPx(heightMm, dpi);

        const canvas = document.createElement('canvas');
        canvas.width = widthPx;
        canvas.height = heightPx;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No se pudo crear la imagen PNG.');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, widthPx, heightPx);

        // Ajuste fino:
        // 1) QR todavía más grande.
        // 2) Bloque de texto a la derecha centrado verticalmente.
        const outerPad = 1;
        const qrPanelWidth = heightPx - outerPad * 2;
        const separatorX = qrPanelWidth + outerPad * 2;

        const qr = window.qrcode(0, 'L');
        qr.addData(shortCode);
        qr.make();

        const moduleCount = qr.getModuleCount();

        // Reducimos un poco la quiet zone para ganar tamaño manteniendo lectura.
        const quietModules = 2;
        const totalModules = moduleCount + quietModules * 2;

        // El QR usa prácticamente todo el alto disponible.
        const availableQrPx = heightPx - outerPad * 2;

        const moduleSize = Math.max(
          2,
          Math.floor(availableQrPx / totalModules),
        );

        const qrSize = totalModules * moduleSize;

        const qrX = outerPad + Math.round((qrPanelWidth - qrSize) / 2);
        const qrY = outerPad + Math.round((availableQrPx - qrSize) / 2);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(qrX, qrY, qrSize, qrSize);

        ctx.fillStyle = '#000000';

        for (let row = 0; row < moduleCount; row += 1) {
          for (let col = 0; col < moduleCount; col += 1) {
            if (!qr.isDark(row, col)) continue;

            ctx.fillRect(
              qrX + (col + quietModules) * moduleSize,
              qrY + (row + quietModules) * moduleSize,
              moduleSize,
              moduleSize,
            );
          }
        }

        // Separador más ajustado al alto total
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(separatorX, 0);
        ctx.lineTo(separatorX, heightPx);
        ctx.stroke();

        // Bloque de texto a la derecha
        const textX = separatorX + 6;
        const textMaxWidth = widthPx - textX - 4;

        const codeFont =
          widthMm <= 40 ? 15 : widthMm >= 60 ? 20 : 17;
        const titleFont =
          widthMm <= 40 ? 9 : widthMm >= 60 ? 13 : 11;
        const variantFont =
          widthMm <= 40 ? 8 : widthMm >= 60 ? 11 : 9;

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#000000';

        const variant = [
          product.color,
          product.size ? `T. ${product.size}` : '',
        ]
          .filter(Boolean)
          .join(' · ');

        // Precalculamos las líneas para centrar verticalmente
        ctx.font = `800 ${titleFont}px Arial`;
        const nameLines = wrapLines(
          ctx,
          product.name || '',
          textMaxWidth,
          2,
        );

        ctx.font = `700 ${variantFont}px Arial`;
        const variantLines = variant
          ? wrapLines(ctx, variant, textMaxWidth, 2)
          : [];

        const codeHeight = Math.round(codeFont * 1.0);
        const nameHeight = nameLines.length * Math.round(titleFont * 1.05);
        const variantHeight = variantLines.length * Math.round(variantFont * 1.04);
        const gap1 = 2;
        const gap2 = variantLines.length ? 2 : 0;

        const totalTextHeight =
          codeHeight + gap1 + nameHeight + gap2 + variantHeight;

        let y = Math.max(
          1,
          Math.round((heightPx - totalTextHeight) / 2),
        );

        // Código corto grande
        ctx.font = `900 ${codeFont}px Arial`;
        ctx.fillText(shortCode, textX, y);
        y += codeHeight + gap1;

        // Nombre del producto
        ctx.font = `800 ${titleFont}px Arial`;
        nameLines.forEach((line) => {
          ctx.fillText(line, textX, y);
          y += Math.round(titleFont * 1.05);
        });

        // Color / talle
        if (variantLines.length) {
          y += gap2;
          ctx.font = `700 ${variantFont}px Arial`;

          variantLines.forEach((line) => {
            ctx.fillText(line, textX, y);
            y += Math.round(variantFont * 1.04);
          });
        }

        const url = canvas.toDataURL('image/png');

        if (!cancelled) setPreviewUrl(url);
      } catch (e: any) {
        console.error(e);

        if (!cancelled) {
          setError(
            e?.message || 'No se pudo crear el código QR.',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void renderLabel();

    return () => {
      cancelled = true;
    };
  }, [open, product, shortCode, labelSize]);

  if (!open || !product) return null;

  const handleDownload = () => {
    if (!previewUrl) {
      setError('La imagen todavía se está generando.');
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
        setError('La imagen todavía se está generando.');
        return;
      }

      if (!navigator.share || typeof navigator.canShare !== 'function') {
        setError(
          'Este dispositivo no admite compartir archivos directamente.',
        );
        return;
      }

      setIsSharing(true);

      const file = await dataUrlToFile(previewUrl, fileName);

      if (!navigator.canShare({ files: [file] })) {
        setError('Este dispositivo no permite compartir este PNG.');
        return;
      }

      await navigator.share({
        title: `Etiqueta ${product.name}`,
        text: `Etiqueta QR INVICTOS · Código ${shortCode}`,
        files: [file],
      });
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error(e);
        setError(e?.message || 'No se pudo compartir la etiqueta.');
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
    <div className="fixed inset-0 bg-black/50 z-[10020] flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[94vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-start gap-4 shrink-0">
          <div>
            <div className="text-xs uppercase tracking-wide font-semibold text-emerald-600">
              {stockEntryQuantity
                ? 'Etiquetas del ingreso · QR para NIIMBOT'
                : 'Etiqueta de producto · QR para NIIMBOT'}
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

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {!shortCode ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
              Este producto todavía no tiene código corto. Cerrá esta ventana y actualizá Inventario para que INVICTOS lo genere automáticamente.
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
                      className={`p-3 rounded-xl border text-left ${
                        copyMode === 'variant'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      <div className="font-bold text-sm">Una por variante</div>
                      <div className="text-[11px] mt-1">1 etiqueta</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCopyMode('unit');
                        setCopies(Math.max(1, Number(stockEntryQuantity)));
                      }}
                      className={`p-3 rounded-xl border text-left ${
                        copyMode === 'unit'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      <div className="font-bold text-sm">Una por unidad</div>
                      <div className="text-[11px] mt-1">
                        {Number(stockEntryQuantity)} etiqueta(s)
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCopyMode('custom');
                        setCopies(1);
                      }}
                      className={`p-3 rounded-xl border text-left ${
                        copyMode === 'custom'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      <div className="font-bold text-sm">Cantidad manual</div>
                      <div className="text-[11px] mt-1">Elegir cantidad</div>
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-slate-100 rounded-xl p-5 overflow-x-auto">
                <div className="flex items-center justify-center min-h-[120px]">
                  {isLoading ? (
                    <div className="flex flex-col items-center gap-2 text-slate-500">
                      <Loader2 size={24} className="animate-spin" />
                      <span className="text-sm">Generando QR...</span>
                    </div>
                  ) : previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={`Etiqueta QR ${product.name}`}
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
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                    Tamaño etiqueta
                  </label>

                  <select
                    value={labelSize}
                    onChange={(e) => setLabelSize(e.target.value as LabelSize)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="40x15">40 × 15 mm</option>
                    <option value="50x15">50 × 15 mm</option>
                    <option value="60x15">60 × 15 mm</option>
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
                          Math.min(100, parseInt(e.target.value, 10) || 1),
                        ),
                      );
                    }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <QrCode size={22} className="text-emerald-700 shrink-0" />

                  <div>
                    <div className="text-xs uppercase font-bold tracking-wide text-emerald-600">
                      Código QR grande del producto
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <Hash size={17} className="text-emerald-700" />
                      <span className="font-mono text-2xl font-black text-emerald-800">
                        {shortCode}
                      </span>
                    </div>

                    <p className="text-xs text-emerald-700 mt-1">
                      El QR ahora ocupa todavía más superficie útil de la etiqueta. A la derecha, el código corto y la descripción quedan centrados verticalmente para mejorar la lectura.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-800 flex gap-2">
                <ImageIcon size={16} className="shrink-0 mt-0.5" />

                <div>
                  Descargá o compartí este PNG desde el celular y luego importalo en NIIMBOT.
                  Cantidad sugerida: <strong>{suggestedCopies}</strong>.
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
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4 shadow-[0_-8px_20px_rgba(15,23,42,0.08)]">
          <div className="grid grid-cols-1 sm:flex sm:justify-end gap-2">
            {typeof navigator !== 'undefined' &&
              typeof navigator.share === 'function' && (
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  disabled={!shortCode || isLoading || !previewUrl || isSharing}
                  className="w-full sm:w-auto px-4 py-3 sm:py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
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
              disabled={!shortCode || isLoading || !previewUrl}
              className="w-full sm:w-auto px-4 py-3 sm:py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download size={18} />
              Descargar PNG
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-3 sm:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarcodeLabelModal;
