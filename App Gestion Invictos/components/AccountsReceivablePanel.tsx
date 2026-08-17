import React, { useMemo, useState } from 'react';
import {
  Sale,
  User,
  PaymentMethod,
  ReceivableInstallment,
} from '../types';
import { StorageService } from '../services/storageService';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Landmark,
  Banknote,
  X,
  Save,
  Search,
} from 'lucide-react';

interface AccountsReceivablePanelProps {
  sales: Sale[];
  currentUser: User;
  onUpdate?: () => void | Promise<void>;
}

type ReceivableFilter =
  | 'alerts'
  | 'pending'
  | 'overdue'
  | 'paid'
  | 'all';

type CollectionMethod = Exclude<PaymentMethod, 'account'>;

interface ReceivableRow {
  sale: Sale;
  installment: ReceivableInstallment;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  reminderDaysAfterDue: number;
  remaining: number;
  overdue: boolean;
  alertDue: boolean;
  paid: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const money = (value: number): string =>
  Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const toDateInput = (date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(date.getDate()).padStart(2, '0')}`;

const parseLocalDate = (value: string): number => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(
    year,
    month - 1,
    day,
    12,
    0,
    0,
    0,
  ).getTime();
};

const AccountsReceivablePanel: React.FC<
  AccountsReceivablePanelProps
> = ({ sales, currentUser, onUpdate }) => {
  const isAdmin = currentUser.role === 'admin';

  const [filter, setFilter] =
    useState<ReceivableFilter>('alerts');

  const [search, setSearch] = useState('');

  const [selectedRow, setSelectedRow] =
    useState<ReceivableRow | null>(null);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<CollectionMethod>('cash');

  const [paymentReceipt, setPaymentReceipt] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentDate, setPaymentDate] =
    useState(toDateInput());

  const [paymentError, setPaymentError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const rows = useMemo<ReceivableRow[]>(() => {
    const now = Date.now();
    const result: ReceivableRow[] = [];

    sales.forEach((sale) => {
      if (!sale.receivable) return;

      if (
        !isAdmin &&
        sale.userId !== currentUser.id
      ) {
        return;
      }

      const reminderDays = Math.max(
        0,
        Number(
          sale.receivable.reminderDaysAfterDue || 0,
        ),
      );

      sale.receivable.installments.forEach(
        (installment) => {
          const amount = Math.max(
            0,
            Number(installment.amount || 0),
          );

          const paidAmount = Math.max(
            0,
            Number(installment.paidAmount || 0),
          );

          const remaining = Math.max(
            0,
            amount - paidAmount,
          );

          const paid = remaining <= 0.009;

          const dueDate = Number(
            installment.dueDate || 0,
          );

          const dueStartDate = new Date(dueDate);
          dueStartDate.setHours(0, 0, 0, 0);

          const dueEndDate = new Date(dueDate);
          dueEndDate.setHours(23, 59, 59, 999);

          const overdue =
            !paid && now > dueEndDate.getTime();

          const alertTimestamp =
            dueStartDate.getTime() +
            reminderDays * DAY_MS;

          const alertDue =
            !paid && now >= alertTimestamp;

          result.push({
            sale,
            installment,
            customerName:
              sale.receivable?.customerName ||
              'Sin cliente',
            customerPhone:
              sale.receivable?.customerPhone,
            customerEmail:
              sale.receivable?.customerEmail,
            reminderDaysAfterDue:
              reminderDays,
            remaining,
            overdue,
            alertDue,
            paid,
          });
        },
      );
    });

    return result.sort(
      (a, b) =>
        Number(a.installment.dueDate || 0) -
        Number(b.installment.dueDate || 0),
    );
  }, [sales, isAdmin, currentUser.id]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesFilter =
        filter === 'all'
          ? true
          : filter === 'alerts'
            ? row.alertDue
            : filter === 'pending'
              ? !row.paid
              : filter === 'overdue'
                ? row.overdue
                : row.paid;

      if (!matchesFilter) return false;

      if (!term) return true;

      const searchable = [
        row.customerName,
        row.customerPhone || '',
        row.customerEmail || '',
        row.sale.userName || '',
        row.sale.id || '',
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [rows, filter, search]);

  const totals = useMemo(() => {
    const totalFinanced = rows.reduce(
      (acc, row) =>
        acc +
        Number(row.installment.amount || 0),
      0,
    );

    const totalRemaining = rows.reduce(
      (acc, row) => acc + row.remaining,
      0,
    );

    const overdueRemaining = rows.reduce(
      (acc, row) =>
        acc + (row.overdue ? row.remaining : 0),
      0,
    );

    const alertCount = rows.filter(
      (row) => row.alertDue,
    ).length;

    return {
      totalFinanced,
      totalRemaining,
      overdueRemaining,
      alertCount,
    };
  }, [rows]);

  const openCollection = (row: ReceivableRow) => {
    setSelectedRow(row);
    setPaymentAmount(row.remaining.toFixed(2));
    setPaymentMethod('cash');
    setPaymentReceipt('');
    setPaymentNotes('');
    setPaymentDate(toDateInput());
    setPaymentError('');
  };

  const closeCollection = () => {
    if (isSaving) return;

    setSelectedRow(null);
    setPaymentError('');
  };

  const saveCollection = async () => {
    if (!selectedRow) return;

    const amount = Number(
      paymentAmount
        .replace(',', '.')
        .trim(),
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setPaymentError(
        'Ingresá un importe mayor que cero.',
      );
      return;
    }

    if (
      amount - selectedRow.remaining >
      0.009
    ) {
      setPaymentError(
        `El importe supera el saldo de la cuota ($${money(
          selectedRow.remaining,
        )}).`,
      );
      return;
    }

    if (!paymentDate) {
      setPaymentError(
        'Seleccioná la fecha del cobro.',
      );
      return;
    }

    setIsSaving(true);
    setPaymentError('');

    try {
      await StorageService.recordReceivablePayment(
        selectedRow.sale.id,
        selectedRow.installment.id,
        {
          amount,
          method: paymentMethod,
          receiptNumber:
            paymentMethod === 'debit' ||
            paymentMethod === 'card'
              ? paymentReceipt.trim() ||
                undefined
              : undefined,
          notes:
            paymentNotes.trim() || undefined,
          userId: currentUser.id,
          userName: currentUser.name,
          timestamp:
            parseLocalDate(paymentDate),
        },
      );

      await Promise.resolve(onUpdate?.());
      setSelectedRow(null);
    } catch (error: any) {
      setPaymentError(
        error?.message ||
          'No se pudo registrar el cobro.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {totals.alertCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-900">
          <AlertTriangle
            size={22}
            className="shrink-0 mt-0.5"
          />

          <div>
            <div className="font-bold">
              Hay {totals.alertCount} cuota(s)
              que requieren gestión de cobro.
            </div>

            <div className="text-sm text-amber-800 mt-1">
              El aviso respeta los días de
              espera acordados en cada cuenta
              corriente.
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Financiado"
          value={`$${money(
            totals.totalFinanced,
          )}`}
        />

        <StatCard
          label="Pendiente"
          value={`$${money(
            totals.totalRemaining,
          )}`}
        />

        <StatCard
          label="Vencido"
          value={`$${money(
            totals.overdueRemaining,
          )}`}
          danger={
            totals.overdueRemaining > 0
          }
        />

        <StatCard
          label="Avisos activos"
          value={String(totals.alertCount)}
          danger={totals.alertCount > 0}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div>
            <div className="font-bold text-slate-800 flex items-center gap-2">
              <CalendarClock
                size={19}
                className="text-indigo-600"
              />
              Cuentas corrientes
            </div>

            <div className="text-xs text-slate-500 mt-1">
              Cuotas, vencimientos y cobros
              posteriores a la venta.
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-2">
            <div className="flex flex-wrap gap-2">
              {[
                ['alerts', 'Para cobrar'],
                ['pending', 'Pendientes'],
                ['overdue', 'Vencidas'],
                ['paid', 'Pagadas'],
                ['all', 'Todas'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setFilter(
                      value as ReceivableFilter,
                    )
                  }
                  className={`px-3 py-2 rounded-lg text-xs font-bold ${
                    filter === value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative flex-1 lg:max-w-sm lg:ml-auto">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="text"
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                placeholder="Cliente, teléfono, vendedor..."
                className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1050px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <Th>Cliente</Th>
                <Th>Vendedor</Th>
                <Th>Cuota</Th>
                <Th>Vencimiento</Th>
                <Th>Estado</Th>
                <Th align="right">
                  Importe
                </Th>
                <Th align="right">
                  Cobrado
                </Th>
                <Th align="right">
                  Saldo
                </Th>
                <Th align="right">
                  Acción
                </Th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => {
                const paidAmount = Math.max(
                  0,
                  Number(
                    row.installment.paidAmount ||
                      0,
                  ),
                );

                return (
                  <tr
                    key={`${row.sale.id}-${row.installment.id}`}
                    className="hover:bg-slate-50"
                  >
                    <Td>
                      <div className="font-bold text-slate-900">
                        {row.customerName}
                      </div>

                      {(row.customerPhone ||
                        row.customerEmail) && (
                        <div className="text-[11px] text-slate-400 mt-1">
                          {row.customerPhone || ''}
                          {row.customerPhone &&
                          row.customerEmail
                            ? ' · '
                            : ''}
                          {row.customerEmail || ''}
                        </div>
                      )}
                    </Td>

                    <Td>
                      {row.sale.userName}
                    </Td>

                    <Td>
                      <div className="font-bold">
                        #{row.installment.number}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Venta{' '}
                        {row.sale.id.slice(-8)}
                      </div>
                    </Td>

                    <Td>
                      {new Date(
                        row.installment.dueDate,
                      ).toLocaleDateString(
                        'es-AR',
                      )}

                      {row.reminderDaysAfterDue >
                        0 && (
                        <div className="text-[10px] text-slate-400 mt-1">
                          Avisar +
                          {
                            row.reminderDaysAfterDue
                          }{' '}
                          día(s)
                        </div>
                      )}
                    </Td>

                    <Td>
                      {row.paid ? (
                        <StatusPill
                          label="Pagada"
                          kind="paid"
                        />
                      ) : row.alertDue ? (
                        <StatusPill
                          label="Cobrar"
                          kind="alert"
                        />
                      ) : row.overdue ? (
                        <StatusPill
                          label="Vencida"
                          kind="overdue"
                        />
                      ) : (
                        <StatusPill
                          label="Pendiente"
                          kind="pending"
                        />
                      )}
                    </Td>

                    <Td align="right">
                      $
                      {money(
                        row.installment.amount,
                      )}
                    </Td>

                    <Td align="right">
                      ${money(paidAmount)}
                    </Td>

                    <Td align="right">
                      <span
                        className={
                          row.remaining > 0
                            ? 'font-bold text-slate-900'
                            : 'font-bold text-emerald-700'
                        }
                      >
                        ${money(row.remaining)}
                      </span>
                    </Td>

                    <Td align="right">
                      {!row.paid ? (
                        <button
                          type="button"
                          onClick={() =>
                            openCollection(row)
                          }
                          className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                        >
                          Registrar cobro
                        </button>
                      ) : (
                        <CheckCircle2
                          size={20}
                          className="ml-auto text-emerald-600"
                        />
                      )}
                    </Td>
                  </tr>
                );
              })}

              {!filteredRows.length && (
                <tr>
                  <td
                    colSpan={9}
                    className="p-10 text-center text-slate-400"
                  >
                    No hay cuotas para este
                    filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRow && (
        <div className="fixed inset-0 z-[10080] bg-black/60 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-lg max-h-[94dvh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="shrink-0 px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Registrar cobro
                </h3>

                <p className="text-xs text-slate-500 mt-1">
                  {selectedRow.customerName} ·
                  Cuota #
                  {
                    selectedRow
                      .installment.number
                  }
                </p>
              </div>

              <button
                type="button"
                onClick={closeCollection}
                disabled={isSaving}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={21} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InfoBox
                  label="Cuota"
                  value={`$${money(
                    selectedRow.installment
                      .amount,
                  )}`}
                />

                <InfoBox
                  label="Saldo"
                  value={`$${money(
                    selectedRow.remaining,
                  )}`}
                />
              </div>

              {paymentError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  {paymentError}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Fecha del cobro
                </label>

                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) =>
                    setPaymentDate(
                      e.target.value,
                    )
                  }
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Importe cobrado
                </label>

                <div className="relative">
                  <DollarSign
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="number"
                    min="0.01"
                    max={selectedRow.remaining}
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) =>
                      setPaymentAmount(
                        e.target.value,
                      )
                    }
                    className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 text-lg font-bold"
                  />
                </div>

                <p className="text-[11px] text-slate-400 mt-1">
                  Puede ser un cobro parcial.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Forma de cobro
                </label>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['cash', 'Efectivo', Banknote],
                    ['debit', 'Débito', CreditCard],
                    ['card', 'Tarjeta', CreditCard],
                    [
                      'transfer',
                      'Transferencia',
                      Landmark,
                    ],
                  ].map(
                    ([value, label, Icon]) => {
                      const Cmp = Icon as any;

                      return (
                        <button
                          key={String(value)}
                          type="button"
                          onClick={() => {
                            setPaymentMethod(
                              value as CollectionMethod,
                            );
                            setPaymentReceipt('');
                          }}
                          className={`px-3 py-2.5 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 ${
                            paymentMethod ===
                            value
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-white border-slate-300 text-slate-700'
                          }`}
                        >
                          <Cmp size={16} />
                          {label}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              {(paymentMethod === 'debit' ||
                paymentMethod === 'card') && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    N.º de comprobante
                    (opcional)
                  </label>

                  <input
                    type="text"
                    value={paymentReceipt}
                    onChange={(e) =>
                      setPaymentReceipt(
                        e.target.value,
                      )
                    }
                    placeholder="Ej.: 001245"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Nota (opcional)
                </label>

                <textarea
                  rows={3}
                  value={paymentNotes}
                  onChange={(e) =>
                    setPaymentNotes(
                      e.target.value,
                    )
                  }
                  placeholder="Observación del cobro..."
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 resize-none"
                />
              </div>
            </div>

            <div className="shrink-0 p-4 border-t border-slate-200 bg-white flex gap-2">
              <button
                type="button"
                onClick={closeCollection}
                disabled={isSaving}
                className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() =>
                  void saveCollection()
                }
                disabled={isSaving}
                className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save size={18} />
                {isSaving
                  ? 'Guardando…'
                  : 'Registrar cobro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: string;
  danger?: boolean;
}> = ({ label, value, danger }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
    <div className="text-[11px] uppercase font-bold tracking-wide text-slate-400">
      {label}
    </div>

    <div
      className={`text-xl sm:text-2xl font-black mt-1 ${
        danger
          ? 'text-red-600'
          : 'text-slate-900'
      }`}
    >
      {value}
    </div>
  </div>
);

const StatusPill: React.FC<{
  label: string;
  kind:
    | 'paid'
    | 'alert'
    | 'overdue'
    | 'pending';
}> = ({ label, kind }) => {
  const className =
    kind === 'paid'
      ? 'bg-emerald-100 text-emerald-700'
      : kind === 'alert'
        ? 'bg-red-100 text-red-700'
        : kind === 'overdue'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-slate-100 text-slate-600';

  return (
    <span
      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${className}`}
    >
      {label}
    </span>
  );
};

const InfoBox: React.FC<{
  label: string;
  value: string;
}> = ({ label, value }) => (
  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
    <div className="text-[10px] uppercase font-bold text-slate-400">
      {label}
    </div>
    <div className="text-lg font-black text-slate-900 mt-1">
      {value}
    </div>
  </div>
);

const Th: React.FC<{
  children: React.ReactNode;
  align?: 'left' | 'right';
}> = ({ children, align = 'left' }) => (
  <th
    className={`px-4 py-3 text-xs uppercase tracking-wide font-bold text-slate-500 ${
      align === 'right'
        ? 'text-right'
        : 'text-left'
    }`}
  >
    {children}
  </th>
);

const Td: React.FC<{
  children: React.ReactNode;
  align?: 'left' | 'right';
}> = ({ children, align = 'left' }) => (
  <td
    className={`px-4 py-3 text-sm text-slate-700 ${
      align === 'right'
        ? 'text-right'
        : 'text-left'
    }`}
  >
    {children}
  </td>
);

export default AccountsReceivablePanel;
