import React, { useEffect, useMemo, useState } from 'react';
import {
  Product,
  LegacySaleAdjustment,
  User,
  PaymentMethod,
} from '../types';
import { StorageService } from '../services/storageService';
import LegacySaleAdjustmentReceiptModal from './LegacySaleAdjustmentReceiptModal';
import {
  ArrowLeftRight,
  PackagePlus,
  PackageMinus,
  Search,
  X,
  Save,
  CreditCard,
  Banknote,
  Landmark,
  History,
  AlertTriangle,
} from 'lucide-react';

interface LegacySaleAdjustmentModalProps {
  currentUser: User;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

type SettlementMethod = Exclude<PaymentMethod, 'account'>;

const money = (value: number): string =>
  Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const lineLabel = (line: {
  name?: string;
  productName?: string;
  size?: string;
  color?: string;
}) => {
  const name = line.productName || line.name || 'Producto';
  return `${name}${line.size ? ` · T. ${line.size}` : ''}${
    line.color ? ` · ${line.color}` : ''
  }`;
};

const parseLocalDate = (value: string): number | undefined => {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
};

const LegacySaleAdjustmentModal: React.FC<LegacySaleAdjustmentModalProps> = ({
  currentUser,
  onClose,
  onSaved,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [customerName, setCustomerName] = useState('');
  const [originalSaleDate, setOriginalSaleDate] = useState('');

  const [returnSearch, setReturnSearch] = useState('');
  const [returnedProductId, setReturnedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [originalUnitAmount, setOriginalUnitAmount] = useState('');
  const [returnToStock, setReturnToStock] = useState(true);

  const [mode, setMode] = useState<'exchange' | 'return'>('exchange');
  const [replacementSearch, setReplacementSearch] = useState('');
  const [replacementProductId, setReplacementProductId] = useState('');
  const [replacementQuantity, setReplacementQuantity] = useState(1);

  const [settlementMethod, setSettlementMethod] =
    useState<SettlementMethod>('cash');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAdjustment, setSavedAdjustment] =
    useState<LegacySaleAdjustment | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingProducts(true);
      try {
        const result = await StorageService.getProducts();
        if (!cancelled) setProducts(Array.isArray(result) ? result : []);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError('No se pudo cargar el inventario.');
        }
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const returnedProduct = products.find(
    (product) => product.id === returnedProductId,
  );

  const selectedReplacement = products.find(
    (product) => product.id === replacementProductId,
  );

  const matchesTerm = (product: Product, term: string) =>
    [
      product.name,
      product.code,
      product.shortCode,
      product.barcode,
      product.size,
      product.color,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(term);

  const returnedProducts = useMemo(() => {
    const term = returnSearch.trim().toLowerCase();
    return products
      .filter((product) => !term || matchesTerm(product, term))
      .slice(0, 40);
  }, [products, returnSearch]);

  const replacementProducts = useMemo(() => {
    const term = replacementSearch.trim().toLowerCase();

    return products
      .filter((product) => product.active !== false)
      .filter((product) => {
        const available = Number(product.stock || 0);
        const sameReturnedProduct =
          returnToStock && product.id === returnedProductId;
        return available > 0 || sameReturnedProduct;
      })
      .filter((product) => !term || matchesTerm(product, term))
      .slice(0, 40);
  }, [products, replacementSearch, returnToStock, returnedProductId]);

  const originalUnit = Math.max(0, Number(originalUnitAmount || 0));
  const returnCredit = originalUnit * quantity;
  const replacementTotal =
    mode === 'exchange' && selectedReplacement
      ? Math.max(0, Number(selectedReplacement.price || 0)) *
        replacementQuantity
      : 0;
  const difference = replacementTotal - returnCredit;

  const availableReplacementStock = selectedReplacement
    ? Number(selectedReplacement.stock || 0) +
      (returnToStock && selectedReplacement.id === returnedProductId
        ? quantity
        : 0)
    : 0;

  const handleSave = async () => {
    setError('');

    if (!returnedProduct) {
      setError('Seleccioná el producto que devuelve el cliente.');
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('La cantidad devuelta debe ser mayor que cero.');
      return;
    }

    if (!Number.isFinite(originalUnit) || originalUnit <= 0) {
      setError('Ingresá cuánto pagó originalmente el cliente por cada unidad.');
      return;
    }

    if (mode === 'exchange' && !selectedReplacement) {
      setError('Seleccioná el producto que se lleva el cliente.');
      return;
    }

    if (
      mode === 'exchange' &&
      selectedReplacement &&
      (replacementQuantity <= 0 ||
        replacementQuantity > availableReplacementStock)
    ) {
      setError('La cantidad del producto nuevo supera el stock disponible.');
      return;
    }

    setSaving(true);

    try {
      const adjustment = await StorageService.registerLegacySaleAdjustment({
        returnedProductId: returnedProduct.id,
        quantity,
        originalUnitAmount: originalUnit,
        returnToStock,
        replacementProductId:
          mode === 'exchange' ? selectedReplacement?.id : undefined,
        replacementQuantity:
          mode === 'exchange' ? replacementQuantity : undefined,
        settlementMethod:
          Math.abs(difference) >= 0.01 ? settlementMethod : undefined,
        receiptNumber:
          (settlementMethod === 'debit' || settlementMethod === 'card') &&
          Math.abs(difference) >= 0.01
            ? receiptNumber.trim() || undefined
            : undefined,
        customerName: customerName.trim() || undefined,
        originalSaleDate: parseLocalDate(originalSaleDate),
        notes: notes.trim() || undefined,
        userId: currentUser.id,
        userName: currentUser.name,
      });

      await Promise.resolve(onSaved());
      setSavedAdjustment(adjustment);
    } catch (e: any) {
      console.error(e);
      setError(
        e?.message ||
          'No se pudo registrar el cambio/devolución de la venta anterior.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (savedAdjustment) {
    return (
      <LegacySaleAdjustmentReceiptModal
        adjustment={savedAdjustment}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[10100] bg-black/60 sm:flex sm:items-center sm:justify-center sm:p-4">
      <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[94dvh] sm:max-w-4xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-200 bg-amber-50 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide font-bold text-amber-700 flex items-center gap-1.5">
              <History size={15} /> Venta anterior a INVICTOS
            </div>
            <h3 className="text-xl font-black text-slate-900 mt-1 flex items-center gap-2">
              <ArrowLeftRight size={21} />
              Cambio / Devolución
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Se registra solo el movimiento actual. No se crea una venta histórica ni una comisión retroactiva.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-40"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-sm text-amber-800">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              El importe original se carga manualmente porque la venta no existe en INVICTOS. La operación quedará identificada como anterior al sistema.
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="border border-slate-200 rounded-xl p-4">
            <div className="font-bold text-slate-800 mb-3">Datos de la compra anterior</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Cliente (opcional)
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nombre del cliente"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Fecha aproximada de compra (opcional)
                </label>
                <input
                  type="date"
                  value={originalSaleDate}
                  onChange={(e) => setOriginalSaleDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5"
                />
              </div>
            </div>
          </section>

          <section className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 font-bold text-slate-800 flex items-center gap-2">
              <PackagePlus size={18} className="text-emerald-600" />
              Producto que vuelve
            </div>

            <div className="p-4 space-y-3">
              <div className="relative">
                <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={returnSearch}
                  onChange={(e) => setReturnSearch(e.target.value)}
                  placeholder="Buscar producto vendido antes del sistema..."
                  className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5"
                />
              </div>

              {loadingProducts ? (
                <div className="text-sm text-slate-400 py-4 text-center">Cargando inventario…</div>
              ) : (
                <div className="border border-slate-200 rounded-xl max-h-52 overflow-y-auto divide-y divide-slate-100">
                  {returnedProducts.map((product) => {
                    const selected = product.id === returnedProductId;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => {
                          setReturnedProductId(product.id);
                          setQuantity(1);
                          setError('');
                        }}
                        className={`w-full text-left p-3 flex items-center justify-between gap-3 ${
                          selected ? 'bg-emerald-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">{lineLabel(product)}</div>
                          <div className="text-xs text-slate-500 mt-1">
                            QR {product.shortCode || '—'} · SKU {product.code || '—'}
                          </div>
                        </div>
                        <div className="text-right shrink-0 text-xs text-slate-500">
                          Stock actual {Number(product.stock || 0)}
                        </div>
                      </button>
                    );
                  })}

                  {!returnedProducts.length && (
                    <div className="p-5 text-center text-sm text-slate-400">
                      No se encontraron productos.
                    </div>
                  )}
                </div>
              )}

              {returnedProduct && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <div className="sm:col-span-1">
                    <div className="text-xs uppercase font-bold text-emerald-700">Seleccionado</div>
                    <div className="font-bold text-emerald-950 mt-1">{lineLabel(returnedProduct)}</div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-emerald-700 uppercase mb-1">Cantidad</label>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full border border-emerald-200 rounded-lg px-3 py-2 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-emerald-700 uppercase mb-1">
                      Pagó originalmente c/u
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={originalUnitAmount}
                      onChange={(e) => setOriginalUnitAmount(e.target.value)}
                      placeholder="0"
                      className="w-full border border-emerald-200 rounded-lg px-3 py-2 bg-white"
                    />
                  </div>
                </div>
              )}

              <label className="flex items-center gap-3 border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={returnToStock}
                  onChange={(e) => setReturnToStock(e.target.checked)}
                  className="w-4 h-4"
                />
                <div>
                  <div className="text-sm font-bold text-slate-800">Vuelve al stock disponible</div>
                  <div className="text-[11px] text-slate-500">Destildar si está roto, manchado o no puede venderse.</div>
                </div>
              </label>

              <div className="text-sm text-slate-600">
                Valor reconocido por lo devuelto: <b className="text-slate-900">${money(returnCredit)}</b>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('exchange')}
              className={`py-3 rounded-xl border font-bold flex items-center justify-center gap-2 ${
                mode === 'exchange'
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-slate-300 text-slate-700'
              }`}
            >
              <ArrowLeftRight size={18} /> Cambio
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('return');
                setReplacementProductId('');
              }}
              className={`py-3 rounded-xl border font-bold flex items-center justify-center gap-2 ${
                mode === 'return'
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'bg-white border-slate-300 text-slate-700'
              }`}
            >
              <PackageMinus size={18} /> Solo devolución
            </button>
          </div>

          {mode === 'exchange' && (
            <section className="border border-indigo-200 rounded-xl overflow-hidden">
              <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100 font-bold text-indigo-900 flex items-center gap-2">
                <PackageMinus size={18} /> Producto que se lleva
              </div>
              <div className="p-4 space-y-3">
                <div className="relative">
                  <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={replacementSearch}
                    onChange={(e) => setReplacementSearch(e.target.value)}
                    placeholder="Buscar por nombre, QR, SKU, talle o color..."
                    className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5"
                  />
                </div>

                <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {replacementProducts.map((product) => {
                    const selected = product.id === replacementProductId;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => {
                          setReplacementProductId(product.id);
                          setReplacementQuantity(1);
                          setError('');
                        }}
                        className={`w-full text-left p-3 flex items-center justify-between gap-3 ${
                          selected ? 'bg-indigo-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">{lineLabel(product)}</div>
                          <div className="text-xs text-slate-500 mt-1">QR {product.shortCode || '—'} · SKU {product.code || '—'}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-slate-900">${money(product.price)}</div>
                          <div className="text-xs text-slate-500">Stock {Number(product.stock || 0)}</div>
                        </div>
                      </button>
                    );
                  })}

                  {!replacementProducts.length && (
                    <div className="p-5 text-center text-sm text-slate-400">No hay productos con stock para esta búsqueda.</div>
                  )}
                </div>

                {selectedReplacement && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                    <div>
                      <div className="text-xs text-indigo-600 uppercase font-bold">Seleccionado</div>
                      <div className="font-bold text-indigo-950 mt-1">{lineLabel(selectedReplacement)}</div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-indigo-700 uppercase mb-1">Cantidad que se lleva</label>
                      <input
                        type="number"
                        min="1"
                        value={replacementQuantity}
                        onChange={(e) => setReplacementQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full border border-indigo-200 rounded-lg px-3 py-2 bg-white"
                      />
                      <div className="text-[11px] text-indigo-600 mt-1">Disponible para esta operación: {availableReplacementStock}</div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="font-bold text-slate-700">
                {Math.abs(difference) < 0.01
                  ? 'Sin diferencia'
                  : difference > 0
                    ? 'Diferencia a cobrar'
                    : 'Devolución al cliente'}
              </span>
              <span className={`text-2xl font-black ${
                difference > 0
                  ? 'text-emerald-700'
                  : difference < 0
                    ? 'text-red-600'
                    : 'text-slate-700'
              }`}>
                ${money(Math.abs(difference))}
              </span>
            </div>

            {Math.abs(difference) >= 0.01 && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    ['cash', 'Efectivo', Banknote],
                    ['debit', 'Débito', CreditCard],
                    ['card', 'Tarjeta', CreditCard],
                    ['transfer', 'Transfer.', Landmark],
                  ].map(([value, label, Icon]) => {
                    const Cmp = Icon as any;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => {
                          setSettlementMethod(value as SettlementMethod);
                          setReceiptNumber('');
                        }}
                        className={`py-2.5 rounded-lg border text-sm font-bold flex items-center justify-center gap-1.5 ${
                          settlementMethod === value
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'bg-white border-slate-300 text-slate-700'
                        }`}
                      >
                        <Cmp size={15} /> {label}
                      </button>
                    );
                  })}
                </div>

                {(settlementMethod === 'debit' || settlementMethod === 'card') && (
                  <input
                    type="text"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    placeholder="N.º de comprobante (opcional)"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white"
                  />
                )}
              </div>
            )}
          </section>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Observación (opcional)</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Motivo del cambio, estado de la prenda, comprobante antiguo, acuerdo con el cliente..."
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 resize-none"
            />
          </div>
        </div>

        <div
          className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={18} />
              {saving
                ? 'Registrando…'
                : mode === 'exchange'
                  ? 'Confirmar cambio'
                  : 'Confirmar devolución'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LegacySaleAdjustmentModal;
