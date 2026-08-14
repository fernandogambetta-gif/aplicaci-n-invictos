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

type LabelSize = '40x20' | '50x30' | '50x20';

const loadJsBarcode = (): Promise<void> => {
  if (window.JsBarcode) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-invictos-jsbarcode="true"]',
  );

  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('No se pudo cargar el generador de códigos de barras.')),
        { once: true },
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.12.1/dist/JsBarcode.all.min.js';
    script.async = true;
    script.dataset.invictosJsbarcode = 'true';
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('No se pudo cargar el generador de códigos de barras.'));
    document.head.appendChild(script);
  });
};

const sizeToMm = (size: LabelSize) => {
  const [width, height] = size.split('x').map(Number);
  return { width, height };
};

const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  open,
  product,
  onClose,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [copies, setCopies] = useState(1);
  const [showPrice, setShowPrice] = useState(true);
  const [labelSize, setLabelSize] = useState<LabelSize>('40x20');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const barcodeValue = (product?.barcode || product?.code || '').trim();

  useEffect(() => {
    if (!open || !product || !barcodeValue) return;

    let cancelled = false;

    const renderBarcode = async () => {
      setError('');
      setIsLoading(true);

      try {
        await loadJsBarcode();
        if (cancelled || !svgRef.current || !window.JsBarcode) return;

        window.JsBarcode(svgRef.current, barcodeValue, {
          format: 'CODE128',
          displayValue: true,
          fontSize: 11,
          textMargin: 1,
          height: 38,
          width: 1.5,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch (e: any) {
        console.error(e);
        if (!cancelled) {
          setError(e?.message || 'No se pudo generar el código de barras.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void renderBarcode();

    return () => {
      cancelled = true;
    };
  }, [open, product, barcodeValue, labelSize]);

  useEffect(() => {
    if (open) {
      setCopies(1);
      setShowPrice(true);
      setError('');
    }
  }, [open, product?.id]);

  if (!open || !product) return null;

  const variant = [product.color, product.size ? `T. ${product.size}` : '']
    .filter(Boolean)
    .join(' · ');

  const handlePrint = () => {
    if (!svgRef.current || !barcodeValue) {
      setError('Este producto no tiene un código para imprimir.');
      return;
    }

    const { width, height } = sizeToMm(labelSize);
    const svgMarkup = svgRef.current.outerHTML;
    const safeCopies = Math.max(1, Math.min(100, Number(copies) || 1));
    const priceText = `$${Number(product.price || 0).toLocaleString('es-AR')}`;

    const labels = Array.from({ length: safeCopies })
      .map(
        () => `
          <section class="label">
            <div class="brand">INVICTOS</div>
            <div class="name">${escapeHtml(product.name)}</div>
            ${variant ? `<div class="variant">${escapeHtml(variant)}</div>` : ''}
            ${showPrice ? `<div class="price">${escapeHtml(priceText)}</div>` : ''}
            <div class="barcode">${svgMarkup}</div>
          </section>
        `,
      )
      .join('');

    const printWindow = window.open('', '_blank', 'width=700,height=700');

    if (!printWindow) {
      setError('El navegador bloqueó la ventana de impresión. Permití ventanas emergentes para INVICTOS.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Etiqueta - ${escapeHtml(product.name)}</title>
  <style>
    @page { size: ${width}mm ${height}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; }
    .label {
      width: ${width}mm;
      height: ${height}mm;
      padding: 1.2mm 1.5mm;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #000;
      background: #fff;
      break-after: page;
      page-break-after: always;
    }
    .label:last-child { break-after: auto; page-break-after: auto; }
    .brand { font-size: ${height <= 20 ? '7pt' : '8pt'}; font-weight: 900; font-style: italic; letter-spacing: .4px; line-height: 1; }
    .name { width: 100%; text-align: center; font-size: ${height <= 20 ? '7pt' : '9pt'}; font-weight: 700; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: .6mm; }
    .variant { font-size: ${height <= 20 ? '6pt' : '7pt'}; line-height: 1; margin-top: .4mm; }
    .price { font-size: ${height <= 20 ? '8pt' : '11pt'}; font-weight: 900; line-height: 1; margin-top: .4mm; }
    .barcode { width: 100%; display: flex; justify-content: center; align-items: center; margin-top: .5mm; overflow: hidden; }
    .barcode svg { max-width: 100%; width: 100%; height: ${height <= 20 ? '7mm' : '10mm'}; }
    @media print {
      html, body { width: ${width}mm; }
    }
  </style>
</head>
<body>
${labels}
<script>
  window.onload = function() {
    setTimeout(function() { window.print(); }, 120);
  };
<\/script>
</body>
</html>`);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[10020] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-start gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide font-semibold text-indigo-600">
              Etiqueta de producto
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
              <div className="flex items-center justify-center bg-slate-100 rounded-xl p-5">
                <div
                  className="bg-white border border-slate-300 shadow-sm flex flex-col items-center justify-center overflow-hidden px-2 py-1.5"
                  style={{
                    width: `${Math.min(sizeToMm(labelSize).width * 5.8, 300)}px`,
                    minHeight: `${Math.min(sizeToMm(labelSize).height * 5.8, 174)}px`,
                  }}
                >
                  <div className="text-[9px] font-black italic tracking-wide leading-none">
                    INVICTOS
                  </div>
                  <div className="text-[11px] font-bold text-center leading-tight truncate w-full mt-1">
                    {product.name}
                  </div>
                  {variant && (
                    <div className="text-[9px] text-center leading-none mt-1">
                      {variant}
                    </div>
                  )}
                  {showPrice && (
                    <div className="text-sm font-black leading-none mt-1">
                      ${Number(product.price || 0).toLocaleString('es-AR')}
                    </div>
                  )}
                  <div className="w-full mt-1 flex justify-center overflow-hidden">
                    {isLoading && <Loader2 size={20} className="animate-spin text-slate-400" />}
                    <svg ref={svgRef} className={isLoading ? 'hidden' : 'max-w-full'} />
                  </div>
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
                    <option value="40x20">40 × 20 mm</option>
                    <option value="50x20">50 × 20 mm</option>
                    <option value="50x30">50 × 30 mm</option>
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
                    onChange={(e) => setCopies(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={(e) => setShowPrice(e.target.checked)}
                  className="rounded"
                />
                Mostrar precio en la etiqueta
              </label>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-500 flex gap-2">
                <BarcodeIcon size={16} className="shrink-0 mt-0.5" />
                <span>
                  Código a imprimir: <strong className="font-mono text-slate-700">{barcodeValue}</strong>
                </span>
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
              disabled={!barcodeValue || isLoading}
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

const escapeHtml = (value: string): string =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export default BarcodeLabelModal;
