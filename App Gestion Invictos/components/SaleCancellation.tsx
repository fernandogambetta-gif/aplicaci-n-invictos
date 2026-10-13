import React, { useState } from 'react';
import { Sale, User } from '../types';
import { StorageService } from '../services/storageService';

const money = (n: number) => Number(n || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
const collected = (sale: Sale) => (sale.receivable?.installments || []).reduce((sum, item) => sum + Number(item.paidAmount || 0), 0);

export const CancelSaleButton: React.FC<{ sale: Sale; user: User; onUpdate?: () => void | Promise<void> }> = ({ sale, user, onUpdate }) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  if (user.role !== 'admin') return null;
  const blocked = sale.adjustments?.length || sale.checkoutReturns?.length || sale.commissionPaid ||
    sale.operationType === 'sale_with_return' || sale.operationType === 'return_only';
  const save = async () => {
    if (busy || blocked) return;
    setBusy(true); setError('');
    try {
      await StorageService.cancelSale(sale.id, user.id, pin, reason, reviewed);
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
  return <>
    <button type="button" onClick={() => { setOpen(true); setError(''); setReason(''); setPin(''); setReviewed(false); }}
      className="block mt-2 px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold">Anular venta</button>
    {open && <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-3 text-left" role="dialog" aria-modal="true" aria-label="Anular venta">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <h3 className="text-xl font-bold text-slate-900">{done ? 'Venta anulada' : 'Anular venta completa'}</h3>
        <div className="text-sm text-slate-700 break-words">
          <strong>{sale.customerName || sale.receivable?.customerName || 'Sin cliente'}</strong>
          <div>{new Date(sale.timestamp).toLocaleString('es-AR')} · {sale.userName}</div>
          <div className="text-xs">Venta: {sale.id}</div>
          <div>Total: <strong>{money(sale.total)}</strong> · Cobros posteriores de cuotas: <strong>{money(collected(sale))}</strong></div>
          <ul className="mt-2 list-disc pl-5">{sale.items.map((item, i) => <li key={i}>{item.quantity} × {item.productName} {item.size || ''} {item.color || ''}</li>)}</ul>
        </div>
        {done ? <p className="text-green-800">Se restituyó el stock y se retiró la operación de ventas, comisiones pendientes y cuentas corrientes. Podés cargar una nueva venta desde Caja.</p> : <>
          <p className="text-sm bg-amber-50 text-amber-900 rounded-lg p-3">Se devolverán todas estas unidades al inventario y la venta completa dejará de contar en los reportes y deudas. El registro original y sus cobros quedarán conservados en la auditoría. Esta acción no devuelve dinero por banco ni tarjeta.</p>
          {blocked ? <p className="text-sm text-red-700">Esta venta tiene cambios, devoluciones o comisiones liquidadas. Es necesario revisar esas operaciones antes de anular; esta opción no las revierte automáticamente.</p> : <>
            <label className="block text-sm font-semibold">Motivo de anulación
              <textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} disabled={busy} className="mt-1 w-full border rounded-lg p-2" placeholder="Por ejemplo: venta cargada por error o duplicada" />
            </label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} disabled={busy} className="mt-1" />
              Confirmo que la mercadería está en el negocio y revisé los pagos y cobros. Si hubo dinero recibido, corresponde devolverlo o conciliarlo al rehacer la operación.
            </label>
            <label className="block text-sm font-semibold">Tu PIN de administrador
              <input type="password" autoComplete="off" value={pin} onChange={e => setPin(e.target.value)} disabled={busy} className="mt-1 w-full border rounded-lg p-2" />
            </label>
          </>}
        </>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={() => { setOpen(false); setPin(''); }} className="px-4 py-2 border rounded-lg">{done ? 'Cerrar' : 'Volver'}</button>
          {!done && !blocked && <button type="button" onClick={save} disabled={busy || !reviewed || reason.trim().length < 5 || !pin.trim()} className="px-4 py-2 bg-red-700 text-white rounded-lg disabled:opacity-40">{busy ? 'Anulando…' : 'Confirmar anulación'}</button>}
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
          <p>Anuló: {sale.cancellation!.userName} · Motivo: {sale.cancellation!.reason}</p>
          <p>Stock restituido. Forma de pago original: {({cash: 'Efectivo', debit: 'Débito', card: 'Crédito', transfer: 'Transferencia', account: 'Cuenta corriente', mixed: 'Mixto'})[sale.paymentMethod]}</p>
          {sale.items.map((item, i) => <p key={i}>{item.quantity} × {item.productName} {item.size || ''} {item.color || ''}</p>)}
          {sale.receivable?.installments.map((item, i) => <div key={item.id} className="border-t pt-1">Cuota {i + 1}: {money(item.amount)} · Cobrado antes de anular: {money(item.paidAmount)}
            {item.payments?.map(payment => <p key={payment.id} className="text-xs">{new Date(payment.timestamp).toLocaleString('es-AR')} · {money(payment.amount)} · {payment.method} · {payment.recordedByUserName}</p>)}
          </div>)}
        </div>
      </details>)}
    </div>}
  </div>;
};
