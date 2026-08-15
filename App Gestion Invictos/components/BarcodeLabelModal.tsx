import React, { useEffect, useRef, useState } from 'react';
import { X, Printer, Loader2, Barcode as BarcodeIcon } from 'lucide-react';
import { Product } from '../types';

declare global {
  interface Window {
    JsBarcode?: (
      element: SVGElement,
      value: string,
      options?: Record<string, unknown>,
    ) => void;
  }
}

interface BarcodeLabelModalProps {
  open: boolean;
  product: Product | null;
  onClose: () => void;
}

type LabelSize = '40x15' | '50x15' | '60x15';

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

const getBarcodeFormat = (
  value: string,
): 'EAN13' | 'EAN8' | 'CODE128' => {
  if (/^\d{13}$/.test(value)) return 'EAN13';
  if (/^\d{8}$/.test(value)) return 'EAN8';
  return 'CODE128';
};

const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  open,
  product,
  onClose,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [copies, setCopies] = useState(1);
  const [labelSize, setLabelSize] =
    useState<LabelSize>('50x15');
  const [isLoading, setIsLoading] =
    useState(false);
  const [error, setError] = useState('');

  const barcodeValue = (
    product?.barcode ||
    product?.code ||
    ''
  ).trim();

  const barcodeFormat =
    getBarcodeFormat(barcodeValue);

  useEffect(() => {
    if (!open || !product || !barcodeValue) return;

    let cancelled = false;

    const renderBarcode = async () => {
      setError('');
      setIsLoading(true);

      try {
        await loadJsBarcode();

        if (
          cancelled ||
          !svgRef.current ||
          !window.JsBarcode
        ) {
          return;
        }

        /*
         * Para etiquetas de 15 mm de alto:
         * - barras altas y limpias;
         * - número claramente visible;
         * - EAN13/EAN8 cuando corresponde;
         * - CODE128 solo como respaldo para SKU/códigos alfanuméricos.
         */
        window.JsBarcode(
          svgRef.current,
          barcodeValue,
          {
            format: barcodeFormat,
            displayValue: true,
            font: 'Arial',
            fontOptions: 'bold',
            fontSize:
              barcodeFormat === 'CODE128'
                ? 13
                : 14,
            textMargin: 2,
            height:
              barcodeFormat === 'CODE128'
                ? 34
                : 37,
            width:
              barcodeFormat === 'CODE128'
                ? 1.35
                : 1.15,
            margin: 2,
            marginLeft: 4,
            marginRight: 4,
            background: '#ffffff',
            lineColor: '#000000',
          },
        );
      } catch (e: any) {
        console.error(e);

        if (!cancelled) {
          setError(
            e?.message ||
              'No se pudo generar el código de barras.',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void renderBarcode();

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

  useEffect(() => {
    if (!open) return;

    setCopies(1);
    setLabelSize('50x15');
    setError('');
  }, [open, product?.id]);

  if (!open || !product) return null;

  const variant = [
    product.color,
    product.size
      ? `T. ${product.size}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const handlePrint = () => {
    if (!svgRef.current || !barcodeValue) {
      setError(
        'Este producto no tiene un código para imprimir.',
      );
      return;
    }

    const { width, height } =
      sizeToMm(labelSize);

    const svgMarkup =
      svgRef.current.outerHTML;

    const safeCopies = Math.max(
      1,
      Math.min(
        100,
        Number(copies) || 1,
      ),
    );

    /*
     * Repartimos la etiqueta horizontalmente.
     * En 50x15:
     *   aprox. 34 mm para barcode + número
     *   aprox. 16 mm para descripción
     */
    const barcodeWidthPercent =
      width <= 40 ? 70 : 68;

    const descriptionWidthPercent =
      100 - barcodeWidthPercent;

    const labels = Array.from({
      length: safeCopies,
    })
      .map(
        () => `
          <section class="label">
            <div class="barcode-zone">
              <div class="barcode">
                ${svgMarkup}
              </div>
            </div>

            <div class="description-zone">
              <div class="name">
                ${escapeHtml(product.name)}
              </div>

              ${
                variant
                  ? `<div class="variant">${escapeHtml(
                      variant,
                    )}</div>`
                  : ''
              }
            </div>
          </section>
        `,
      )
      .join('');

    const printWindow = window.open(
      '',
      '_blank',
      'width=800,height=650',
    );

    if (!printWindow) {
      setError(
        'El navegador bloqueó la ventana de impresión. Permití ventanas emergentes para INVICTOS.',
      );
      return;
    }

    printWindow.document.open();

    printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Etiqueta - ${escapeHtml(
    product.name,
  )}</title>

  <style>
    @page {
      size: ${width}mm ${height}mm;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
    }

    .label {
      width: ${width}mm;
      height: ${height}mm;
      overflow: hidden;
      display: flex;
      flex-direction: row;
      align-items: stretch;
      justify-content: flex-start;
      background: #fff;
      color: #000;
      break-after: page;
      page-break-after: always;
    }

    .label:last-child {
      break-after: auto;
      page-break-after: auto;
    }

    .barcode-zone {
      width: ${barcodeWidthPercent}%;
      height: 100%;
      padding: 0.7mm 0.4mm 0.45mm 0.7mm;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .barcode {
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .barcode svg {
      display: block;
      width: 100% !important;
      height: 13.4mm !important;
      max-width: 100%;
      overflow: visible;
    }

    .description-zone {
      width: ${descriptionWidthPercent}%;
      height: 100%;
      border-left: 0.25mm solid #000;
      padding: 1.1mm 0.8mm 0.8mm 0.9mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      overflow: hidden;
    }

    .name {
      width: 100%;
      font-size: ${
        width <= 40 ? '6.8pt' : '7.5pt'
      };
      line-height: 1.08;
      font-weight: 800;
      overflow-wrap: anywhere;
      word-break: normal;
    }

    .variant {
      width: 100%;
      margin-top: 0.7mm;
      font-size: ${
        width <= 40 ? '6pt' : '6.6pt'
      };
      line-height: 1.05;
      font-weight: 700;
      color: #111;
      overflow-wrap: anywhere;
    }

    @media print {
      html,
      body {
        width: ${width}mm;
        height: ${height}mm;
      }
    }
  </style>
</head>

<body>
  ${labels}

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 160);
    };
  <\/script>
</body>
</html>`);

    printWindow.document.close();
  };

  const previewWidth =
    Math.min(
      sizeToMm(labelSize).width * 6.6,
      390,
    );

  return (
    <div className="fixed inset-0 bg-black/50 z-[10020] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-start gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide font-semibold text-indigo-600">
              Etiqueta compacta 15 mm
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
              Este producto no tiene código de barras ni SKU para imprimir.
            </div>
          ) : (
            <>
              {/* PREVISUALIZACION */}
              <div className="bg-slate-100 rounded-xl p-5 overflow-x-auto">
                <div
                  className="bg-white border border-slate-300 shadow-sm flex flex-row overflow-hidden mx-auto"
                  style={{
                    width: `${previewWidth}px`,
                    height: `${15 * 6.6}px`,
                  }}
                >
                  <div
                    className="h-full flex items-center justify-center overflow-hidden px-1"
                    style={{ width: '68%' }}
                  >
                    {isLoading && (
                      <Loader2
                        size={22}
                        className="animate-spin text-slate-400"
                      />
                    )}

                    <svg
                      ref={svgRef}
                      className={
                        isLoading
                          ? 'hidden'
                          : 'w-full max-h-full'
                      }
                    />
                  </div>

                  <div
                    className="h-full border-l border-black px-2 py-1.5 flex flex-col justify-center overflow-hidden"
                    style={{ width: '32%' }}
                  >
                    <div className="text-[11px] leading-tight font-extrabold break-words">
                      {product.name}
                    </div>

                    {variant && (
                      <div className="text-[9px] leading-tight font-bold mt-1">
                        {variant}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* CONTROLES */}
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
                    Cantidad
                  </label>

                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={copies}
                    onChange={(e) =>
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
                      )
                    }
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
                </div>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-800">
                Para mejorar la lectura, la etiqueta deja únicamente el código con su número y la descripción al costado. No imprime marca ni precio.
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={
                !barcodeValue || isLoading
              }
              className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              <Printer size={18} />
              Imprimir etiqueta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const escapeHtml = (
  value: string,
): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export default BarcodeLabelModal;
