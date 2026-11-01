import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StoreVoucher, User } from '../types';
import { StorageService } from '../services/storageService';

type Period = 'today' | 'week' | 'month' | 'year' | 'all';

const money = (n: number) => Number(n || 0).toLocaleString('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const methodLabel: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', debit: 'Débito', card: 'Tarjeta',
};

function fromPeriod(period: Period): number {
  if (period === 'all') return 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const day = start.getDay();
    start.setDate(start.getDate() - ((day + 6) % 7));
  } else if (period === 'month') start.setDate(1);
  else if (period === 'year') start.setMonth(0, 1);
  return start.getTime();
}

export default function VoucherCashPanel({ currentUser, compact = false }: {
  currentUser: User;
  compact?: boolean;
}) {
  const [vouchers, setVouchers] = useState<StoreVoucher[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await StorageService.getStoreVouchers();
      setVouchers(result);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron leer los vales.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const accessible = useMemo(() => vouchers.filter(v =>
    currentUser.role === 'admin' || v.createdById === currentUser.id
  ), [vouchers, currentUser.role, currentUser.id]);
  const gifts = useMemo(() => accessible.filter(v => v.kind === 'gift_card'), [accessible]);
  const shown = useMemo(() => gifts.filter(v =>
    Number(v.createdAt || 0) >= fromPeriod(period)
  ).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)), [gifts, period]);
  const totalCollected = shown.reduce((sum, v) => sum + Number(v.initialAmount || 0), 0);
  const outstanding = gifts.reduce((sum, v) => sum + Math.max(0, Number(v.balance || 0)), 0);
  const creditsOutstanding = accessible.filter(v => v.kind === 'credit_note')
    .reduce((sum, v) => sum + Math.max(0, Number(v.balance || 0)), 0);
  const methods = ['cash', 'transfer', 'debit', 'card'] as const;

  return (
    <section className="bg-white border border-indigo-200 rounded-2xl p-4 space-y-4 shadow-sm">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h3 className="font-bold text-slate-800">Cobros por Gift Cards</h3>
          <p className="text-xs text-slate-500">Ingresan al emitir el vale. Los canjes no vuelven a ingresar dinero.</p>
        </div>
        <div className="flex gap-2">
          <select aria-label="Período de cobro" value={period} onChange={e => setPeriod(e.target.value as Period)} className="border rounded-lg p-2 text-sm">
            <option value="today">Hoy</option><option value="week">Semana</option><option value="month">Mes</option><option value="year">Año</option><option value="all">Todo</option>
          </select>
          <button type="button" className="border rounded-lg px-3 py-2 text-sm" onClick={() => void refresh()}>Actualizar</button>
        </div>
      </div>
      {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
      {loading ? <p className="text-slate-500 text-sm">Consultando cobros...</p> : <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-indigo-50 rounded-xl p-3"><div className="text-xs text-slate-600">Cobrado por Gift Cards (período)</div><div className="text-xl font-bold">${money(totalCollected)}</div></div>
          <div className="bg-amber-50 rounded-xl p-3"><div className="text-xs text-slate-600">Saldo pendiente Gift Cards (total histórico)</div><div className="text-xl font-bold">${money(outstanding)}</div></div>
          <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-600">Notas de crédito pendientes (total histórico)</div><div className="text-xl font-bold">${money(creditsOutstanding)}</div></div>
        </div>
        <div className="text-sm text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
          {methods.map(m => <span key={m}>{methodLabel[m]}: <strong>${money(shown.filter(v => v.paymentMethod === m).reduce((acc, v) => acc + Number(v.initialAmount || 0), 0))}</strong></span>)}
        </div>
        {!compact && <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-slate-50"><tr><th className="p-2">Fecha</th><th className="p-2">Comprobante / código</th><th className="p-2">Vendedor</th><th className="p-2">Medio de cobro</th><th className="p-2 text-right">Cobrado</th><th className="p-2 text-right">Saldo actual</th></tr></thead>
            <tbody>{shown.map(v => <tr key={v.code} className="border-t"><td className="p-2">{new Date(v.createdAt).toLocaleString('es-AR')}</td><td className="p-2 font-mono">{v.code}</td><td className="p-2">{v.createdByName}</td><td className="p-2">{methodLabel[v.paymentMethod || ''] || 'No indicado'}</td><td className="p-2 text-right">${money(v.initialAmount)}</td><td className="p-2 text-right">${money(v.balance)}</td></tr>)}</tbody>
          </table>
          {!shown.length && <p className="p-3 text-sm text-slate-500">No hay emisiones de Gift Card en el período.</p>}
        </div>}
      </>}
      <p className="text-xs text-slate-500">Registro financiero derivado de storeVouchers: no crea una segunda venta ni altera el stock. La suma de ventas de mercadería es un indicador distinto del dinero efectivamente cobrado. Para una conciliación completa de Caja deben incluirse también cobros y devoluciones de las demás formas de pago.</p>
    </section>
  );
}
