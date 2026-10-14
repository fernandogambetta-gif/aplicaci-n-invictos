import { cancellationStockPlan, cancellationSignature, CancellationStockMode } from '../services/saleCancellationPlan';
import React, { useState } from 'react';
import { Sale, User } from '../types';
import { StorageService } from '../services/storageService';

const money = (n: number) => Number(n || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
const collected = (sale: Sale) => (sale.receivable?.installments || []).reduce((sum, item) => sum + Number(item.paidAmount || 0), 0);

export const CancelSaleButton: React.FC<{ sale: Sale; user: User; onUpdate?: () => void | Promise<void> }> = ({ sale: originalSale, user, onUpdate }) => {
  const [open, setOpen] = useState(false);
  const [sale, setSale] = useState(originalSale);
  const [linkedSales, setLinkedSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [stockMode, setStockMode] = useState<CancellationStockMode>('automatic');
  if (user.role !== 'admin') return null;
  let blocked = '';
  let stockPlan: ReturnType<typeof cancellationStockPlan> = [];
  try { stockPlan = cancellationStockPlan(sale, linkedSales); }
  catch (err) { blocked = err instanceof Error ? err.message : 'No se pudo calcular el stock.'; }
  const save = async () => {
    if (busy || blocked || loading || !previewReady) return;
    setBusy(true); setError('');
    try {
      await StorageService.cancelSale(sale.id, user.id, pin, reason, reviewed, stockMode, cancellationSignature(sale), linkedSales.map(item => ({ id: item.id, signature: cancellationSignature(item) })));
      setPin(''); setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular la venta.');
      setBusy(false); return;
    }
    try {
      await onUpdate?.();
    } catch {
      setError('La venta quedó anulada, pero no se pudo actualizar la pantalla. Recargá antes de operar.');
    } finally { setBusy(false); }
  };
  const openPreview = async () => {
    setOpen(true); setError(''); setReason(''); setPin(''); setReviewed(false);
    setStockMode('automatic'); setDone(false); setPreviewReady(false); setLoading(true);
    setSale(originalSale); setLinkedSales([]);
    try {
      const preview = await StorageService.getSaleCancellationPreview(originalSale.id, user.id);
      setSale(preview.sale); setLinkedSales(preview.linkedSales); setPreviewReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo revisar la operación.');
    } finally { setLoading(false); }
  };
  return <>
    <button type="button" disabled={loading} onClick={openPreview}
      className="block mt-2 px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold">Anular venta</button>
    {open && <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-3 text-left" role="dialog" aria-modal="true" aria-label="Anular venta">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <h3 className="text-xl font-bold text-slate-900">{done ? 'Operación anulada' : 'Anular venta y devoluciones vinculadas'}</h3>
        <div className="text-sm text-slate-700 break-words">
          <strong>{sale.customerName || sale.receivable?.customerName || 'Sin cliente'}</strong>
          <div>{new Date(sale.timestamp).toLocaleString('es-AR')} · {sale.userName}</div>
          <div className="text-xs">Venta: {sale.id}</div>
          <div>Total: <strong>{money(sale.total)}</strong> · Cobros posteriores de cuotas: <strong>{money(collected(sale))}</strong></div>
          <ul className="mt-2 list-disc pl-5">{sale.items.map((item, i) => <li key={i}>{item.quantity} × {item.productName} {item.size || ''} {item.color || ''}</li>)}</ul>
        </div>
        {done ? <p className="text-green-800">La operación quedó anulada y fuera de ventas y cuentas corrientes. Se aplicó la opción de stock seleccionada. No hace falta cargar otra venta si solo fue un préstamo.</p> : <>
          <p className="text-sm bg-amber-50 text-amber-900 rounded-lg p-3">La operación completa dejará de contar como venta y deuda. El ajuste de stock descontará las unidades que ya reingresaron mediante devoluciones registradas. El registro original y sus cobros quedarán conservados en la auditoría. Esta acción no devuelve dinero por banco ni tarjeta.</p>
          {loading ? <p className="text-sm text-indigo-700">Consultando la venta y sus devoluciones…</p> : !previewReady ? null : blocked ? <p className="text-sm text-red-700">{blocked}</p> : <>
            {!!linkedSales.length && <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50 text-sm space-y-2">
              <strong>Se anularán juntos estos registros:</strong>
              <p>Venta original {sale.id} · {money(sale.total)}</p>
              {linkedSales.map(item => <p key={item.id}>Devolución de Caja {item.id} · {new Date(item.timestamp).toLocaleString('es-AR')} · Reintegro registrado: {money(Math.abs(Number(item.settlementTotal || 0)))}</p>)}
              <p>Se quitarán la deuda y el reintegro registrado de los reportes activos. La devolución no sumará stock nuevamente. Los registros originales se conservarán en auditoría.</p>
              <p className="font-semibold">Si se entregó dinero realmente al cliente, revisá ese reintegro: anular el registro no recupera el dinero.</p>
            </div>}
            {sale.commissionPaid && <p className="text-sm bg-amber-50 p-3 rounded-lg text-amber-900">Figura una comisión liquidada. Podés anular igualmente: se conservará esa marca y quedará una advertencia de revisión en la auditoría. La anulación no recupera dinero ya entregado a la vendedora.</p>}
            <fieldset className="border rounded-lg p-3 text-sm space-y-2">
              <legend className="font-semibold px-1">Inventario al anular</legend>
              <label className="flex items-start gap-2"><input type="radio" name={`stock-${sale.id}`} checked={stockMode === 'automatic'} disabled={busy} onChange={() => setStockMode('automatic')} />Ajustar automáticamente según los movimientos registrados</label>
              <div className="pl-5 text-slate-600">{stockPlan.length ? stockPlan.map(item => <div key={item.productId}>Reingresan {item.quantity} × {item.productName}</div>) : 'No se sumarán unidades: el stock ya fue restituido por las devoluciones registradas.'}</div>
              <label className="flex items-start gap-2"><input type="radio" name={`stock-${sale.id}`} checked={stockMode === 'already_correct'} disabled={busy} onChange={() => setStockMode('already_correct')} />El stock del sistema ya está correcto por un ajuste manual: anular sin modificar cantidades</label>
              {stockMode === 'already_correct' && <p className="text-amber-800">Elegí esta opción solo si verificaste el stock en pantalla. Que la prenda haya vuelto físicamente no significa que haya reingresado en el sistema.</p>}
            </fieldset>
            <label className="block text-sm font-semibold">Motivo de anulación
              <textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} disabled={busy} className="mt-1 w-full border rounded-lg p-2" placeholder="Por ejemplo: préstamo para prueba devuelto sin compra" />
            </label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} disabled={busy} className="mt-1" />
              Confirmo que no hubo una venta válida, que la mercadería está en el negocio y que revisé todos los registros indicados, la opción de stock, los cobros, reintegros y comisiones. Si hubo dinero entregado o recibido, revisaré su devolución o conciliación.
            </label>
            <label className="block text-sm font-semibold">Tu PIN de administrador
              <input type="password" autoComplete="off" value={pin} onChange={e => setPin(e.target.value)} disabled={busy} className="mt-1 w-full border rounded-lg p-2" />
            </label>
          </>}
        </>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy || loading} onClick={() => { setOpen(false); setPin(''); }} className="px-4 py-2 border rounded-lg">{done ? 'Cerrar' : 'Volver'}</button>
          {!done && previewReady && !loading && !blocked && <button type="button" onClick={save} disabled={busy || !reviewed || reason.trim().length < 5 || !pin.trim()} className="px-4 py-2 bg-red-700 text-white rounded-lg disabled:opacity-40">{busy ? 'Anulando…' : linkedSales.length ? 'Confirmar anulación conjunta' : 'Confirmar anulación'}</button>}
        </div>
      </div>
    </div>}
  </>;
};

export const CancelledSalesAudit: React.FC<{ user: User }> = ({ user }) => {
  const [open, setOpen] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  if (user.role !== 'admin') return null;
  const load = async () => {
    setBusy(true); setError('');
    try { setSales(await StorageService.getCancelledSales(user.id)); setOpen(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cargar la auditoría.'); }
    finally { setBusy(false); }
  };
  const filtered = sales.filter(sale => [sale.id, sale.customerName, sale.receivable?.customerName, sale.userName, sale.cancellation?.reason].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="bg-white rounded-xl border p-4">
    <div className="flex gap-3 items-center"><button type="button" disabled={busy} onClick={load} className="text-sm font-bold text-red-700">{busy ? 'Cargando…' : 'Consultar / actualizar ventas anuladas'}</button>
      {open && <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500">Ocultar</button>}
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {open && <div className="mt-3 space-y-3">
      <p className="text-xs text-slate-500">Auditoría de todas las fechas. Estas operaciones no participan de los totales activos.</p>
      <input aria-label="Buscar ventas anuladas" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar cliente, venta, vendedor o motivo" className="w-full border rounded-lg p-2 text-sm" />
      {!filtered.length && <p className="text-sm text-slate-500">No hay ventas anuladas para mostrar.</p>}
      {filtered.map(sale => <details key={sale.id} className="border rounded-lg p-3 text-sm">
        <summary className="cursor-pointer font-semibold">{sale.customerName || sale.receivable?.customerName || 'Sin cliente'} · {money(sale.total)} · Anulada el {new Date(sale.cancellation!.timestamp).toLocaleString('es-AR')}</summary>
        <div className="mt-2 space-y-1 break-words">
          <p>Venta: {sale.id} · {new Date(sale.timestamp).toLocaleString('es-AR')} · Vendedor: {sale.userName}</p>
          {!!sale.cancellation!.relatedSaleIds?.length && <p>Anulación conjunta · Venta de origen: {sale.cancellation!.groupRootSaleId} · Registros relacionados: {sale.cancellation!.relatedSaleIds!.join(', ')}</p>}
          <p>Anuló: {sale.cancellation!.userName} · Motivo: {sale.cancellation!.reason}</p>
          <p>{sale.cancellation!.groupRootSaleId && sale.cancellation!.groupRootSaleId !== sale.id ? 'Stock compensado junto con la venta de origen, sin duplicar el reingreso.' : sale.cancellation!.stockMode === 'already_correct' ? 'Stock sin modificar por confirmación del administrador.' : 'Stock compensado según movimientos registrados.'} Forma de pago original: {({cash: 'Efectivo', debit: 'Débito', card: 'Crédito', transfer: 'Transferencia', account: 'Cuenta corriente', mixed: 'Mixto'})[sale.paymentMethod]}</p>
          {sale.cancellation!.commissionReviewRequired && <p className="bg-amber-50 text-amber-900 p-2 rounded-lg">Revisar comisión: esta operación figuraba liquidada. Comisión registrada al anular: {money(sale.cancellation!.commissionRecordedAtCancellation || 0)}. El historial original se conserva; este valor no acredita un recupero de dinero.</p>}
          {sale.items.map((item, i) => <p key={i}>{item.quantity} × {item.productName} {item.size || ''} {item.color || ''}</p>)}
          {sale.receivable?.installments.map((item, i) => <div key={item.id} className="border-t pt-1">Cuota {i + 1}: {money(item.amount)} · Cobrado antes de anular: {money(item.paidAmount)}
            {item.payments?.map(payment => <p key={payment.id} className="text-xs">{new Date(payment.timestamp).toLocaleString('es-AR')} · {money(payment.amount)} · {payment.method} · {payment.recordedByUserName}</p>)}
          </div>)}
        </div>
      </details>)}
    </div>}
  </div>;
};
