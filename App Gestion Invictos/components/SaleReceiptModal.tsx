import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  ReceiptText,
  Download,
  Share2,
  Printer,
  Landmark,
  Loader2,
  CheckCircle2,
  Mail,
  MessageCircle,
  AlertTriangle,
} from 'lucide-react';
import { Sale, PaymentMethod } from '../types';

declare global {
  interface Window {
    jspdf?: {
      jsPDF: new (options?: Record<string, unknown>) => {
        setFontSize: (size: number) => void;
        setFont: (fontName: string, fontStyle?: string) => void;
        text: (
          text: string | string[],
          x: number,
          y: number,
          options?: Record<string, unknown>,
        ) => void;
        line: (x1: number, y1: number, x2: number, y2: number) => void;
        splitTextToSize: (text: string, maxWidth: number) => string[];
        addPage: () => void;
        output: (type: 'blob') => Blob;
        save: (fileName: string) => void;
      };
    };
  }
}

interface SaleReceiptModalProps {
  open: boolean;
  sale: Sale | null;
  onClose: () => void;
  onRequestInvoice: () => void;
}

const loadJsPdf = (): Promise<void> => {
  if (window.jspdf?.jsPDF) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-invictos-jspdf="true"]',
  );

  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.jspdf?.jsPDF) {
        resolve();
        return;
      }

      existing.addEventListener(
        'load',
        () => {
          if (window.jspdf?.jsPDF) resolve();
          else reject(new Error('jsPDF cargó pero no quedó disponible.'));
        },
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
    script.src =
      'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
    script.async = true;
    script.dataset.invictosJspdf = 'true';

    script.onload = () => {
      if (window.jspdf?.jsPDF) resolve();
      else reject(new Error('No se pudo inicializar jsPDF.'));
    };

    script.onerror = () =>
      reject(new Error('No se pudo cargar el generador PDF.'));

    document.head.appendChild(script);
  });
};

const money = (value: number): string =>
  Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const paymentLabel = (method: PaymentMethod | 'mixed'): string => {
  if (method === 'cash') return 'Efectivo';
  if (method === 'debit') return 'Débito';
  if (method === 'card') return 'Tarjeta';
  if (method === 'transfer') return 'Transferencia';
  if (method === 'account') return 'Cuenta corriente';
  return 'Pago mixto';
};

const cleanFileName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const SaleReceiptModal: React.FC<SaleReceiptModalProps> = ({
  open,
  sale,
  onClose,
  onRequestInvoice,
}) => {
  const [isBuildingPdf, setIsBuildingPdf] = useState(false);
  const [error, setError] = useState('');
  const [shareSupported, setShareSupported] = useState(false);

  useEffect(() => {
    setShareSupported(
      typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function',
    );
  }, []);

  useEffect(() => {
    if (!open) {
      setError('');
      setIsBuildingPdf(false);
    }
  }, [open]);

  const receiptNumber = useMemo(() => {
    if (!sale) return '';
    return sale.id.slice(-8).padStart(8, '0');
  }, [sale]);

  const fileName = useMemo(() => {
    if (!sale) return 'ticket_invictos.pdf';
    return `ticket_invictos_${cleanFileName(receiptNumber)}.pdf`;
  }, [sale, receiptNumber]);

  if (!open || !sale) return null;

  const buildPdf = async () => {
    setError('');
    setIsBuildingPdf(true);

    try {
      await loadJsPdf();

      if (!window.jspdf?.jsPDF) {
        throw new Error('No se pudo inicializar el PDF.');
      }

      const { jsPDF } = window.jspdf;

      // A4 para que funcione bien en celular, email, WhatsApp e impresión.
      const doc = new jsPDF({
        unit: 'mm',
        format: 'a4',
      });

      const left = 16;
      const right = 194;
      const width = right - left;
      let y = 18;

      const ensureSpace = (needed: number) => {
        if (y + needed <= 278) return;

        doc.addPage();
        y = 18;
      };

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('INVICTOS', 105, y, { align: 'center' });
      y += 7;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Comprobante interno de venta - NO ES FACTURA FISCAL', 105, y, {
        align: 'center',
      });
      y += 10;

      doc.line(left, y, right, y);
      y += 7;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Ticket N° ${receiptNumber}`, left, y);

      doc.setFont('helvetica', 'normal');
      const dateText = new Date(sale.timestamp).toLocaleString('es-AR');
      doc.text(dateText, right, y, { align: 'right' });
      y += 6;

      doc.text(`Vendedor: ${sale.userName}`, left, y);
      y += 9;

      doc.setFont('helvetica', 'bold');
      doc.text('PRODUCTOS', left, y);
      y += 5;

      doc.line(left, y, right, y);
      y += 5;

      sale.items.forEach((item) => {
        ensureSpace(26);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);

        const productLines = doc.splitTextToSize(
          `${item.productName}${item.size ? ` · T. ${item.size}` : ''}${
            item.color ? ` · ${item.color}` : ''
          }`,
          112,
        );

        doc.text(productLines, left, y);

        const lineHeight = productLines.length * 4.2;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);

        let detail = '';
        if (item.shortCode) detail += `QR ${item.shortCode}`;
        if (item.productCode) {
          detail += `${detail ? ' · ' : ''}SKU ${item.productCode}`;
        }

        if (detail) {
          doc.text(detail, left, y + lineHeight + 1);
        }

        const quantityText = `${item.quantity} x $${money(item.priceAtSale)}`;
        doc.setFontSize(9);
        doc.text(quantityText, 145, y, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.text(`$${money(item.subtotal)}`, right, y, { align: 'right' });

        if ((item.discountAmount || 0) > 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.text(
            `Descuento: -$${money(item.discountAmount || 0)}`,
            right,
            y + 5,
            { align: 'right' },
          );
        }

        y += Math.max(13, lineHeight + 7);
        doc.line(left, y, right, y);
        y += 5;
      });

      ensureSpace(48);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Subtotal:', 152, y, { align: 'right' });
      doc.text(`$${money(sale.subtotal)}`, right, y, { align: 'right' });
      y += 6;

      if ((sale.discount || 0) > 0) {
        doc.text('Descuentos:', 152, y, { align: 'right' });
        doc.text(`-$${money(sale.discount)}`, right, y, { align: 'right' });
        y += 6;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('TOTAL:', 152, y, { align: 'right' });
      doc.text(`$${money(sale.total)}`, right, y, { align: 'right' });
      y += 9;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Forma de pago: ${paymentLabel(sale.paymentMethod)}`, left, y);
      y += 5;

      if (sale.payments?.length) {
        sale.payments.forEach((payment) => {
          const receiptText = payment.receiptNumber
            ? ` · Comp. ${payment.receiptNumber}`
            : '';

          doc.text(
            `• ${paymentLabel(payment.method)}: $${money(payment.amount)}${receiptText}`,
            left + 4,
            y,
          );
          y += 4.5;
        });
      }

      if (sale.receivable) {
        ensureSpace(26);

        y += 3;
        doc.setFont('helvetica', 'bold');
        doc.text(
          `Cuenta corriente: ${sale.receivable.customerName}`,
          left,
          y,
        );
        y += 5;

        doc.setFont('helvetica', 'normal');

        sale.receivable.installments.forEach((installment) => {
          doc.text(
            `Cuota ${installment.number}: $${money(installment.amount)} · vence ${new Date(
              installment.dueDate,
            ).toLocaleDateString('es-AR')}`,
            left + 4,
            y,
          );
          y += 4.5;
        });
      }

      y += 5;
      doc.line(left, y, right, y);
      y += 7;

      doc.setFontSize(8);
      doc.text(
        'Gracias por tu compra.',
        105,
        y,
        { align: 'center' },
      );
      y += 4;

      doc.text(
        'Conservá este comprobante para cambios o consultas.',
        105,
        y,
        { align: 'center' },
      );

      return doc;
    } finally {
      setIsBuildingPdf(false);
    }
  };

  const handleDownload = async () => {
    try {
      const doc = await buildPdf();
      doc.save(fileName);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'No se pudo generar el ticket PDF.');
    }
  };

  const handleShare = async () => {
    try {
      const doc = await buildPdf();
      const blob = doc.output('blob');
      const file = new File([blob], fileName, {
        type: 'application/pdf',
      });

      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: `Ticket INVICTOS ${receiptNumber}`,
          text: `Comprobante de venta INVICTOS por $${money(sale.total)}.`,
          files: [file],
        });
        return;
      }

      // Fallback: descarga.
      doc.save(fileName);

      setError(
        'Este navegador no permite compartir archivos directamente. El PDF se descargó para que puedas adjuntarlo en WhatsApp o email.',
      );
    } catch (e: any) {
      if (e?.name === 'AbortError') return;

      console.error(e);
      setError(e?.message || 'No se pudo compartir el ticket.');
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
        throw new Error(
          'El navegador bloqueó la ventana de impresión. Permití ventanas emergentes para INVICTOS.',
        );
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'No se pudo abrir el ticket para imprimir.');
    }
  };

  return (
    <div className="fixed inset-0 z-[10050] bg-black/60 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-2xl max-h-[94vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="text-xs uppercase tracking-wide font-bold text-emerald-600">
              Venta registrada correctamente
            </div>

            <h3 className="text-xl font-bold text-slate-900 mt-1 flex items-center gap-2">
              <CheckCircle2 size={22} className="text-emerald-600" />
              ¿Qué querés hacer?
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700"
          >
            <X size={21} />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto flex-1 min-h-0 space-y-4">
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-900 text-white p-4 text-center">
              <div className="text-lg font-black tracking-wide">INVICTOS</div>
              <div className="text-xs text-slate-300 mt-1">
                Ticket interno · N° {receiptNumber}
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex justify-between gap-4 text-sm">
                <span className="text-slate-500">Fecha</span>
                <span className="font-medium text-right">
                  {new Date(sale.timestamp).toLocaleString('es-AR')}
                </span>
              </div>

              <div className="flex justify-between gap-4 text-sm">
                <span className="text-slate-500">Vendedor</span>
                <span className="font-medium text-right">{sale.userName}</span>
              </div>

              <div className="border-t border-slate-200 pt-3 space-y-3">
                {sale.items.map((item, index) => (
                  <div
                    key={`${item.productId}-${index}`}
                    className="flex justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">
                        {item.productName}
                      </div>

                      <div className="text-xs text-slate-500 mt-0.5">
                        {item.quantity} × ${money(item.priceAtSale)}
                        {item.size ? ` · T. ${item.size}` : ''}
                        {item.color ? ` · ${item.color}` : ''}
                      </div>

                      {item.shortCode && (
                        <div className="text-[11px] font-mono font-bold text-emerald-700 mt-1">
                          QR {item.shortCode}
                        </div>
                      )}
                    </div>

                    <div className="font-bold text-slate-900 shrink-0">
                      ${money(item.subtotal)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 pt-3">
                {(sale.discount || 0) > 0 && (
                  <div className="flex justify-between text-sm text-slate-600 mb-1">
                    <span>Descuentos</span>
                    <span>-${money(sale.discount)}</span>
                  </div>
                )}

                <div className="flex justify-between items-end">
                  <span className="text-sm font-bold text-slate-700">TOTAL</span>
                  <span className="text-2xl font-black text-slate-900">
                    ${money(sale.total)}
                  </span>
                </div>

                <div className="text-xs text-slate-500 mt-2">
                  Forma de pago: {paymentLabel(sale.paymentMethod)}
                </div>

                {sale.payments?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {sale.payments.map((payment, index) => (
                      <div
                        key={`${payment.method}-${index}`}
                        className="flex justify-between gap-3 text-xs text-slate-600"
                      >
                        <span>
                          {paymentLabel(payment.method)}
                          {payment.receiptNumber
                            ? ` · Comp. ${payment.receiptNumber}`
                            : ''}
                        </span>

                        <span className="font-semibold">
                          ${money(payment.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {sale.receivable && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="text-xs font-bold text-amber-900">
                      Cuenta corriente · {sale.receivable.customerName}
                    </div>

                    <div className="text-xs text-amber-800 mt-1">
                      Pendiente financiado: ${money(
                        sale.receivable.financedAmount,
                      )} en {sale.receivable.installments.length} cuota(s).
                    </div>

                    <div className="mt-2 space-y-1">
                      {sale.receivable.installments.map((installment) => (
                        <div
                          key={installment.id}
                          className="flex justify-between gap-3 text-[11px] text-amber-800"
                        >
                          <span>
                            Cuota {installment.number} · vence{' '}
                            {new Date(
                              installment.dueDate,
                            ).toLocaleDateString('es-AR')}
                          </span>

                          <span className="font-bold">
                            ${money(installment.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-sm text-amber-800">
            <AlertTriangle size={17} className="shrink-0 mt-0.5" />
            <span>
              Este ticket es un comprobante interno de INVICTOS y no reemplaza una factura fiscal de ARCA.
            </span>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={isBuildingPdf}
              className="px-3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isBuildingPdf ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Download size={18} />
              )}
              PDF
            </button>

            <button
              type="button"
              onClick={() => void handlePrint()}
              disabled={isBuildingPdf}
              className="px-3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Printer size={18} />
              Imprimir
            </button>

            <button
              type="button"
              onClick={() => void handleShare()}
              disabled={isBuildingPdf}
              className="px-3 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              title={
                shareSupported
                  ? 'En el celular podés elegir WhatsApp, Gmail u otra app'
                  : 'Si no está disponible, descargará el PDF'
              }
            >
              <Share2 size={18} />
              Compartir
            </button>

            <button
              type="button"
              onClick={onRequestInvoice}
              className="px-3 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
            >
              <Landmark size={18} />
              Facturar ARCA
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <MessageCircle size={12} />
              WhatsApp desde Compartir
            </span>
            <span className="flex items-center gap-1">
              <Mail size={12} />
              Email desde Compartir
            </span>
            <span className="flex items-center gap-1">
              <ReceiptText size={12} />
              PDF adjunto
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SaleReceiptModal;
