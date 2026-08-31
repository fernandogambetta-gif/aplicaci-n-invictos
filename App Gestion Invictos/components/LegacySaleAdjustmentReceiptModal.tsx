import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Printer,
  Share2,
  X,
  ArrowLeftRight,
  PackageMinus,
  PackagePlus,
  History,
} from 'lucide-react';
import { LegacySaleAdjustment, PaymentMethod } from '../types';

interface LegacySaleAdjustmentReceiptModalProps {
  adjustment: LegacySaleAdjustment;
  onClose: () => void;
}

const money = (value: number): string =>
  Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const paymentLabel = (method?: Exclude<PaymentMethod, 'account'>): string => {
  if (method === 'cash') return 'Efectivo';
  if (method === 'debit') return 'Débito';
  if (method === 'card') return 'Tarjeta';
  if (method === 'transfer') return 'Transferencia';
  return '—';
};

const lineLabel = (line: {
  productName: string;
  size?: string;
  color?: string;
}): string =>
  `${line.productName}${line.size ? ` · T. ${line.size}` : ''}${
    line.color ? ` · ${line.color}` : ''
  }`;

const cleanFileName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const loadJsPdf = (): Promise<void> => {
  const win = window as any;
  if (win.jspdf?.jsPDF) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-invictos-jspdf="true"]',
  );

  if (existing) {
    return new Promise((resolve, reject) => {
      if (win.jspdf?.jsPDF) {
        resolve();
        return;
      }

      existing.addEventListener(
        'load',
        () =>
          win.jspdf?.jsPDF
            ? resolve()
            : reject(new Error('jsPDF cargó pero no quedó disponible.')),
        { once: true },
      );
      existing.addEventListener(
        'error',
        () => reject(new Error('No se pudo cargar el generador PDF.')),
        { once: true },
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
    script.async = true;
    script.dataset.invictosJspdf = 'true';
    script.onload = () =>
      win.jspdf?.jsPDF
        ? resolve()
        : reject(new Error('No se pudo inicializar jsPDF.'));
    script.onerror = () => reject(new Error('No se pudo cargar el generador PDF.'));
    document.head.appendChild(script);
  });
};

const LegacySaleAdjustmentReceiptModal: React.FC<LegacySaleAdjustmentReceiptModalProps> = ({
  adjustment,
  onClose,
}) => {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const receiptNumber = useMemo(
    () => adjustment.id.slice(0, 18),
    [adjustment.id],
  );

  const title =
    adjustment.type === 'exchange'
      ? 'Comprobante de cambio'
      : 'Comprobante de devolución';

  const fileName = useMemo(
    () =>
      `comprobante_${adjustment.type === 'exchange' ? 'cambio' : 'devolucion'}_venta_anterior_invictos_${cleanFileName(
        receiptNumber,
      )}.pdf`,
    [adjustment.type, receiptNumber],
  );

  const difference = Number(adjustment.difference || 0);

  const buildPdf = async () => {
    setError('');
    setWorking(true);

    try {
      await loadJsPdf();
      const jsPDF = (window as any).jspdf?.jsPDF;
      if (!jsPDF) throw new Error('No se pudo inicializar el PDF.');

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const left = 16;
      const right = 194;
      const width = right - left;
      let y = 18;

      const addText = (text: string, size = 10, bold = false, gap = 6) => {
        doc.setFontSize(size);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        const lines = doc.splitTextToSize(text, width);
        doc.text(lines, left, y);
        y += Math.max(gap, lines.length * 5);
      };

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('INVICTOS', 105, y, { align: 'center' });
      y += 8;
      doc.setFontSize(12);
      doc.text(title.toUpperCase(), 105, y, { align: 'center' });
      y += 6;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('VENTA ANTERIOR A INVICTOS', 105, y, { align: 'center' });
      y += 5;
      doc.text(`N.º ${receiptNumber}`, 105, y, { align: 'center' });
      y += 8;
      doc.line(left, y, right, y);
      y += 8;

      addText(`Fecha del movimiento: ${new Date(adjustment.timestamp).toLocaleString('es-AR')}`);
      addText(
        `Fecha aproximada de compra anterior: ${
          adjustment.originalSaleDate
            ? new Date(adjustment.originalSaleDate).toLocaleDateString('es-AR')
            : 'No informada'
        }`,
      );
      addText(`Cliente: ${adjustment.customerName || 'No informado'}`);
      addText(`Registrado por: ${adjustment.recordedByUserName}`);

      y += 2;
      doc.line(left, y, right, y);
      y += 8;

      addText('PRODUCTO QUE VUELVE', 10, true);
      addText(
        `${adjustment.returnedItem.quantity} × ${lineLabel(adjustment.returnedItem)} · Valor original reconocido $${money(
          adjustment.returnedItem.unitAmount,
        )} c/u · Total $${money(adjustment.returnedItem.totalAmount)}`,
      );
      addText(
        adjustment.returnedItem.returnToStock
          ? adjustment.returnedProductCreatedInInventory
            ? 'Destino: reincorporado al inventario como producto nuevo.'
            : 'Destino: vuelve al stock disponible.'
          : 'Destino: no vuelve al stock disponible.',
        9,
      );
      if (adjustment.returnedProductWasMissing) {
        addText(
          `Producto no existente en el inventario al momento del cambio${
            adjustment.returnedProductOriginalReference
              ? ` · Referencia anterior: ${adjustment.returnedProductOriginalReference}`
              : ''
          }.`,
          9,
        );
      }

      if (adjustment.replacementItem) {
        y += 2;
        addText('PRODUCTO ENTREGADO', 10, true);
        addText(
          `${adjustment.replacementItem.quantity} × ${lineLabel(adjustment.replacementItem)} · $${money(
            adjustment.replacementItem.unitAmount,
          )} c/u · Total $${money(adjustment.replacementItem.totalAmount)}`,
        );
      }

      y += 2;
      doc.line(left, y, right, y);
      y += 8;

      if (Math.abs(difference) < 0.01) {
        addText('Diferencia: $0,00 (sin diferencia)', 11, true);
      } else if (difference > 0) {
        addText(`Diferencia cobrada al cliente: $${money(Math.abs(difference))}`, 11, true);
        addText(`Forma de pago: ${paymentLabel(adjustment.settlement.method)}`);
      } else {
        addText(`Importe devuelto al cliente: $${money(Math.abs(difference))}`, 11, true);
        addText(`Forma de devolución: ${paymentLabel(adjustment.settlement.method)}`);
      }

      if (adjustment.settlement.receiptNumber) {
        addText(`N.º de comprobante de pago: ${adjustment.settlement.receiptNumber}`);
      }

      if (adjustment.notes) {
        y += 2;
        addText('OBSERVACIÓN', 10, true);
        addText(adjustment.notes);
      }

      y += 6;
      doc.line(left, y, right, y);
      y += 7;
      addText(
        'Esta operación corresponde a una venta realizada antes de la implementación de INVICTOS. No crea una venta histórica ni genera comisión retroactiva; registra únicamente el cambio/devolución actual y sus movimientos de stock.',
        8,
      );

      return doc;
    } finally {
      setWorking(false);
    }
  };

  const handleDownload = async () => {
    try {
      const doc = await buildPdf();
      doc.save(fileName);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'No se pudo generar el comprobante.');
    }
  };

  const handlePrint = async () => {
    try {
      const doc = await buildPdf();
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (!printWindow) {
        URL.revokeObjectURL(url);
        throw new Error('El navegador bloqueó la ventana de impresión.');
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'No se pudo abrir el comprobante para imprimir.');
    }
  };

  const handleShare = async () => {
    try {
      const doc = await buildPdf();
      const blob = doc.output('blob');
      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title,
          text: `${title} INVICTOS · venta anterior al sistema`,
          files: [file],
        });
        return;
      }

      doc.save(fileName);
      setError(
        'El navegador no permite compartir el PDF directamente. Se descargó el archivo para adjuntarlo.',
      );
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error(e);
      setError(e?.message || 'No se pudo compartir el comprobante.');
    }
  };

  return (
    <div className="fixed inset-0 z-[10200] bg-black/60 sm:flex sm:items-center sm:justify-center sm:p-4">
      <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[94dvh] sm:max-w-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-200 bg-emerald-50 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide font-bold text-emerald-700 flex items-center gap-1.5">
              <CheckCircle2 size={15} /> Operación registrada correctamente
            </div>
            <h3 className="text-xl font-black text-slate-900 mt-1">{title}</h3>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <History size={13} /> Venta anterior a INVICTOS · N.º {receiptNumber}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Esta compra no fue cargada como venta histórica. Solo queda registrado el movimiento realizado ahora.
          </div>

          <section className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 font-bold text-slate-800 flex items-center gap-2">
              <PackagePlus size={18} className="text-emerald-600" /> Producto que vuelve
            </div>
            <div className="p-4 text-sm text-slate-700">
              <div className="font-bold text-slate-900">
                {adjustment.returnedItem.quantity} × {lineLabel(adjustment.returnedItem)}
              </div>
              <div className="mt-1">Importe original reconocido: ${money(adjustment.returnedItem.totalAmount)}</div>
              <div className="mt-1 text-xs text-slate-500">
                {adjustment.returnedItem.returnToStock
                  ? adjustment.returnedProductCreatedInInventory
                    ? 'No existía en el inventario y fue reincorporado como producto nuevo.'
                    : 'Reingresó al stock disponible.'
                  : adjustment.returnedProductWasMissing
                    ? 'No existía en el inventario y no fue reincorporado.'
                    : 'No reingresó al stock disponible.'}
                {adjustment.returnedProductOriginalReference
                  ? ` · Ref. anterior: ${adjustment.returnedProductOriginalReference}`
                  : ''}
              </div>
            </div>
          </section>

          {adjustment.replacementItem && (
            <section className="rounded-xl border border-indigo-200 overflow-hidden">
              <div className="bg-indigo-50 px-4 py-3 font-bold text-indigo-900 flex items-center gap-2">
                <PackageMinus size={18} /> Producto entregado
              </div>
              <div className="p-4 text-sm text-slate-700">
                <div className="font-bold text-slate-900">
                  {adjustment.replacementItem.quantity} × {lineLabel(adjustment.replacementItem)}
                </div>
                <div className="mt-1">Valor: ${money(adjustment.replacementItem.totalAmount)}</div>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="font-bold text-slate-700 flex items-center gap-2">
                <ArrowLeftRight size={17} />
                {Math.abs(difference) < 0.01
                  ? 'Sin diferencia'
                  : difference > 0
                    ? 'Diferencia cobrada'
                    : 'Importe devuelto'}
              </span>
              <span className="text-2xl font-black text-slate-900">${money(Math.abs(difference))}</span>
            </div>
            {Math.abs(difference) >= 0.01 && (
              <div className="text-sm text-slate-600 mt-2">
                {difference > 0 ? 'Cobro' : 'Devolución'} por {paymentLabel(adjustment.settlement.method)}
                {adjustment.settlement.receiptNumber
                  ? ` · Comprobante ${adjustment.settlement.receiptNumber}`
                  : ''}
              </div>
            )}
          </section>

          <div className="text-sm text-slate-500">
            Cliente: <b className="text-slate-700">{adjustment.customerName || 'No informado'}</b>
            {' · '}Registrado por <b className="text-slate-700">{adjustment.recordedByUserName}</b> el{' '}
            {new Date(adjustment.timestamp).toLocaleString('es-AR')}.
          </div>

          {adjustment.notes && (
            <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
              <div className="text-xs uppercase font-bold text-slate-500 mb-1">Observación</div>
              {adjustment.notes}
            </div>
          )}
        </div>

        <div
          className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button type="button" onClick={() => void handleDownload()} disabled={working} className="py-3 rounded-xl border border-slate-300 text-slate-700 font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              <Download size={17} /> PDF
            </button>
            <button type="button" onClick={() => void handlePrint()} disabled={working} className="py-3 rounded-xl border border-slate-300 text-slate-700 font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              <Printer size={17} /> Imprimir
            </button>
            <button type="button" onClick={() => void handleShare()} disabled={working} className="py-3 rounded-xl border border-slate-300 text-slate-700 font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              <Share2 size={17} /> Compartir
            </button>
            <button type="button" onClick={onClose} disabled={working} className="py-3 rounded-xl bg-slate-900 text-white font-bold disabled:opacity-50">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LegacySaleAdjustmentReceiptModal;
