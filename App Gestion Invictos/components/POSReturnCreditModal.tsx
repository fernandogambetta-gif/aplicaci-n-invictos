import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArchiveRestore,
  CalendarClock,
  CheckCircle2,
  History,
  PackagePlus,
  Search,
  X,
} from 'lucide-react';
import {
  CheckoutReturnCredit,
  Product,
  Sale,
  SaleAdjustmentLine,
  User,
} from '../types';
import { StorageService } from '../services/storageService';

interface Props {
  open: boolean;
  products: Product[];
  currentUser: User;
  onClose: () => void;
  onAdd: (credit: CheckoutReturnCredit) => void;
}

type EffectiveLine = SaleAdjustmentLine & { availableQuantity: number };
type LegacySource = 'inventory' | 'manual';

const money = (value: number): string =>
  Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const dateInputToTimestamp = (value: string): number | undefined => {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
};

const effectiveLinesForSale = (sale: Sale): EffectiveLine[] => {
  const map = new Map<string, EffectiveLine>();

  (sale.items || []).forEach((item, index) => {
    const quantity = Math.max(0, Math.floor(Number(item.quantity || 0)));
    const unitAmount =
      quantity > 0
        ? Math.max(0, Number(item.subtotal || 0)) / quantity
        : Math.max(0, Number(item.priceAtSale || 0));

    const lineId = `orig-${index}`;
    map.set(lineId, {
      lineId,
      productId: item.productId,
      productName: item.productName,
      productCode: item.productCode,
      shortCode: item.shortCode,
      barcode: item.barcode,
      size: item.size,
      color: item.color,
      quantity,
      availableQuantity: quantity,
      unitAmount,
      totalAmount: unitAmount * quantity,
      costAtSale: item.costAtSale,
    });
  });

  (sale.adjustments || []).forEach((adjustment) => {
    const source = map.get(adjustment.returnedItem.sourceLineId);
    if (source) {
      source.availableQuantity = Math.max(
        0,
        source.availableQuantity -
          Math.max(0, Number(adjustment.returnedItem.quantity || 0)),
      );
    }

    if (adjustment.replacementItem) {
      const replacement = adjustment.replacementItem;
      map.set(replacement.lineId, {
        ...replacement,
        availableQuantity: Math.max(0, Number(replacement.quantity || 0)),
      });
    }
  });

  return Array.from(map.values()).filter((line) => line.availableQuantity > 0);
};

const POSReturnCreditModal: React.FC<Props> = ({
  open,
  products,
  currentUser,
  onClose,
  onAdd,
}) => {
  const [origin, setOrigin] = useState<'registered' | 'legacy'>('registered');
  const [sales, setSales] = useState<Sale[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [sourceLineId, setSourceLineId] = useState('');

  const [legacySource, setLegacySource] = useState<LegacySource>('inventory');
  const [legacyProductSearch, setLegacyProductSearch] = useState('');
  const [legacyProductId, setLegacyProductId] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualReference, setManualReference] = useState('');
  const [manualSize, setManualSize] = useState('');
  const [manualColor, setManualColor] = useState('');
  const [manualCategory, setManualCategory] = useState('');
  const [manualProvider, setManualProvider] = useState('');
  const [manualResalePrice, setManualResalePrice] = useState('');
  const [manualCost, setManualCost] = useState('');

  const [quantity, setQuantity] = useState(1);
  const [originalUnitAmount, setOriginalUnitAmount] = useState('');
  const [returnToStock, setReturnToStock] = useState(true);
  const [customerName, setCustomerName] = useState('');
  const [originalSaleDate, setOriginalSaleDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadingSales(true);
    setError('');

    StorageService.getSales()
      .then((loaded) => {
        if (!cancelled) setSales(Array.isArray(loaded) ? loaded : []);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setError('No se pudo cargar el historial de ventas.');
      })
      .finally(() => {
        if (!cancelled) setLoadingSales(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setOrigin('registered');
    setSearch('');
    setSelectedSaleId('');
    setSourceLineId('');
    setLegacySource('inventory');
    setLegacyProductSearch('');
    setLegacyProductId('');
    setManualName('');
    setManualReference('');
    setManualSize('');
    setManualColor('');
    setManualCategory('');
    setManualProvider('');
    setManualResalePrice('');
    setManualCost('');
    setQuantity(1);
    setOriginalUnitAmount('');
    setReturnToStock(true);
    setCustomerName('');
    setOriginalSaleDate('');
    setNotes('');
    setError('');
  }, [open]);

  const selectedSale = useMemo(
    () => sales.find((sale) => sale.id === selectedSaleId),
    [sales, selectedSaleId],
  );

  const selectedSaleLines = useMemo(
    () => (selectedSale ? effectiveLinesForSale(selectedSale) : []),
    [selectedSale],
  );

  const selectedLine = selectedSaleLines.find((line) => line.lineId === sourceLineId);

  useEffect(() => {
    if (!selectedLine) return;
    setQuantity(1);
    setOriginalUnitAmount(String(selectedLine.unitAmount || ''));
  }, [sourceLineId]);

  const matchingSales = useMemo(() => {
    const term = search.trim().toLowerCase();

    return sales
      .filter((sale) => effectiveLinesForSale(sale).length > 0)
      .filter((sale) => {
        if (!term) return true;

        const text = [
          sale.id,
          sale.customerName,
          sale.receivable?.customerName,
          sale.userName,
          ...(sale.items || []).flatMap((item) => [
            item.productName,
            item.productCode,
            item.shortCode,
            item.barcode,
            item.size,
            item.color,
          ]),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return text.includes(term);
      })
      .slice(0, 25);
  }, [sales, search]);

  const matchingLegacyProducts = useMemo(() => {
    const term = legacyProductSearch.trim().toLowerCase();

    return products
      .filter((product) => {
        if (!term) return true;
        return [
          product.name,
          product.code,
          product.shortCode,
          product.barcode,
          product.size,
          product.color,
          product.category,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term);
      })
      .slice(0, 30);
  }, [products, legacyProductSearch]);

  const legacyProduct = products.find((product) => product.id === legacyProductId);

  const creditAmount = useMemo(() => {
    const unit = Math.max(0, Number(originalUnitAmount || 0));
    return unit * Math.max(1, Math.floor(Number(quantity || 1)));
  }, [originalUnitAmount, quantity]);

  const addCredit = () => {
    setError('');

    const cleanQuantity = Math.max(1, Math.floor(Number(quantity || 1)));
    const cleanUnit = Math.max(0, Number(originalUnitAmount || 0));

    if (!Number.isFinite(cleanUnit) || cleanUnit <= 0) {
      setError('Ingresá el valor que se reconoce por cada unidad devuelta.');
      return;
    }

    const id = `ret-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    if (origin === 'registered') {
      if (!selectedSale || !selectedLine) {
        setError('Seleccioná la venta y el producto que vuelve.');
        return;
      }

      if (cleanQuantity > selectedLine.availableQuantity) {
        setError(`Solo hay ${selectedLine.availableQuantity} unidad(es) disponibles para devolver.`);
        return;
      }

      const credit: CheckoutReturnCredit = {
        id,
        origin: 'registered',
        timestamp: now,
        originalSaleId: selectedSale.id,
        sourceLineId: selectedLine.lineId,
        customerName:
          selectedSale.customerName || selectedSale.receivable?.customerName || undefined,
        originalSaleDate: selectedSale.timestamp,
        originalPaidAmount: cleanUnit * cleanQuantity,
        returnedItem: {
          lineId: `${id}-returned`,
          sourceLineId: selectedLine.lineId,
          productId: selectedLine.productId,
          productName: selectedLine.productName,
          productCode: selectedLine.productCode,
          shortCode: selectedLine.shortCode,
          barcode: selectedLine.barcode,
          size: selectedLine.size,
          color: selectedLine.color,
          quantity: cleanQuantity,
          unitAmount: cleanUnit,
          totalAmount: cleanUnit * cleanQuantity,
          costAtSale: selectedLine.costAtSale,
          returnToStock,
        },
        notes: notes.trim() || undefined,
      };

      onAdd(credit);
      onClose();
      return;
    }

    if (legacySource === 'inventory') {
      if (!legacyProduct) {
        setError('Seleccioná el producto que devuelve el cliente.');
        return;
      }

      const credit: CheckoutReturnCredit = {
        id,
        origin: 'legacy',
        timestamp: now,
        originalSaleDate: dateInputToTimestamp(originalSaleDate),
        customerName: customerName.trim() || undefined,
        originalPaidAmount: cleanUnit * cleanQuantity,
        returnedItem: {
          lineId: `${id}-returned`,
          sourceLineId: `legacy-${id}`,
          productId: legacyProduct.id,
          productName: legacyProduct.name,
          productCode: legacyProduct.code,
          shortCode: legacyProduct.shortCode,
          barcode: legacyProduct.barcode,
          size: legacyProduct.size,
          color: legacyProduct.color,
          quantity: cleanQuantity,
          unitAmount: cleanUnit,
          totalAmount: cleanUnit * cleanQuantity,
          costAtSale: Math.max(0, Number(legacyProduct.cost || 0)),
          returnToStock,
        },
        returnedProductWasMissing: false,
        notes: notes.trim() || undefined,
      };

      onAdd(credit);
      onClose();
      return;
    }

    if (!manualName.trim()) {
      setError('Ingresá una descripción del producto que ya no está en Inventario.');
      return;
    }

    if (returnToStock && Math.max(0, Number(manualResalePrice || 0)) <= 0) {
      setError('Para reincorporarlo al stock ingresá el precio actual de venta.');
      return;
    }

    const credit: CheckoutReturnCredit = {
      id,
      origin: 'legacy',
      timestamp: now,
      originalSaleDate: dateInputToTimestamp(originalSaleDate),
      customerName: customerName.trim() || undefined,
      originalPaidAmount: cleanUnit * cleanQuantity,
      returnedProductWasMissing: true,
      returnedProductOriginalReference: manualReference.trim() || undefined,
      manualReturnedProduct: {
        name: manualName.trim(),
        referenceCode: manualReference.trim() || undefined,
        size: manualSize.trim() || undefined,
        color: manualColor.trim() || undefined,
        category: manualCategory.trim() || undefined,
        provider: manualProvider.trim() || undefined,
        resalePrice: Math.max(0, Number(manualResalePrice || 0)),
        cost: Math.max(0, Number(manualCost || 0)),
      },
      returnedItem: {
        lineId: `${id}-returned`,
        sourceLineId: `legacy-${id}`,
        productId: `legacy-manual:${id}`,
        productName: manualName.trim(),
        productCode: manualReference.trim() || undefined,
        size: manualSize.trim() || undefined,
        color: manualColor.trim() || undefined,
        quantity: cleanQuantity,
        unitAmount: cleanUnit,
        totalAmount: cleanUnit * cleanQuantity,
        costAtSale: Math.max(0, Number(manualCost || 0)),
        returnToStock,
      },
      notes: notes.trim() || undefined,
    };

    onAdd(credit);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10060] bg-black/60 flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-4xl max-h-[95vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="shrink-0 px-4 sm:px-5 py-4 bg-amber-50 border-b border-amber-200 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide font-bold text-amber-700">
              Caja · Cambio / Devolución
            </div>
            <h3 className="text-xl font-black text-slate-900 mt-1">
              Agregar producto que vuelve
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              El importe reconocido se descuenta de los productos nuevos de esta misma operación.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X size={22} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setOrigin('registered')}
              className={`rounded-xl border p-3 text-left ${origin === 'registered' ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700'}`}
            >
              <div className="font-bold flex items-center gap-2"><History size={18} /> Venta registrada</div>
              <div className="text-xs mt-1 opacity-75">Buscar una venta de INVICTOS.</div>
            </button>
            <button
              type="button"
              onClick={() => setOrigin('legacy')}
              className={`rounded-xl border p-3 text-left ${origin === 'legacy' ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-700'}`}
            >
              <div className="font-bold flex items-center gap-2"><ArchiveRestore size={18} /> Venta anterior</div>
              <div className="text-xs mt-1 opacity-75">Compra realizada antes de INVICTOS.</div>
            </button>
          </div>

          {origin === 'registered' ? (
            <section className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por cliente, ticket, producto, QR o SKU..."
                    className="w-full border border-slate-300 rounded-lg pl-10 pr-3 py-2.5 bg-white"
                  />
                </div>
              </div>

              <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                {loadingSales ? (
                  <div className="p-4 text-sm text-slate-500">Cargando ventas…</div>
                ) : matchingSales.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500">No hay ventas con productos disponibles para devolución.</div>
                ) : (
                  matchingSales.map((sale) => (
                    <button
                      type="button"
                      key={sale.id}
                      onClick={() => {
                        setSelectedSaleId(sale.id);
                        setSourceLineId('');
                      }}
                      className={`w-full p-3 text-left hover:bg-slate-50 ${selectedSaleId === sale.id ? 'bg-indigo-50' : 'bg-white'}`}
                    >
                      <div className="flex justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-800">
                            {sale.customerName || sale.receivable?.customerName || 'Cliente no indicado'}
                          </div>
                          <div className="text-xs text-slate-500">
                            {new Date(sale.timestamp).toLocaleString('es-AR')} · Ticket {sale.id.slice(-8)}
                          </div>
                        </div>
                        <div className="text-sm font-bold text-indigo-700">${money(sale.total)}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {selectedSale && (
                <div className="p-4 border-t border-slate-200 space-y-3">
                  <div className="text-sm font-bold text-slate-700">Producto que vuelve</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedSaleLines.map((line) => (
                      <button
                        type="button"
                        key={line.lineId}
                        onClick={() => setSourceLineId(line.lineId)}
                        className={`rounded-lg border p-3 text-left ${sourceLineId === line.lineId ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}
                      >
                        <div className="font-semibold text-slate-800">{line.productName}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {[line.size ? `T. ${line.size}` : '', line.color, line.shortCode ? `QR ${line.shortCode}` : ''].filter(Boolean).join(' · ')}
                        </div>
                        <div className="text-xs font-semibold text-slate-600 mt-1">
                          Disponible para devolver: {line.availableQuantity} · Valor unitario: ${money(line.unitAmount)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section className="border border-slate-200 rounded-xl p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Cliente (opcional)</label>
                  <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" placeholder="Nombre del cliente" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Fecha aproximada (opcional)</label>
                  <div className="relative">
                    <CalendarClock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="date" value={originalSaleDate} onChange={(e) => setOriginalSaleDate(e.target.value)} className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5" />
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-bold text-slate-700 mb-2">Producto que vuelve</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLegacySource('inventory')}
                    className={`rounded-lg border p-3 text-left ${legacySource === 'inventory' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}
                  >
                    <div className="font-bold">Existe en Inventario</div>
                    <div className="text-xs text-slate-500 mt-1">Puede tener stock 0 o estar inactivo.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLegacySource('manual')}
                    className={`rounded-lg border p-3 text-left ${legacySource === 'manual' ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}
                  >
                    <div className="font-bold">Ya no está en Inventario</div>
                    <div className="text-xs text-slate-500 mt-1">Cargar sus datos manualmente.</div>
                  </button>
                </div>
              </div>

              {legacySource === 'inventory' ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={legacyProductSearch} onChange={(e) => setLegacyProductSearch(e.target.value)} className="w-full border border-slate-300 rounded-lg pl-10 pr-3 py-2.5" placeholder="Buscar producto, incluso agotado..." />
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {matchingLegacyProducts.map((product) => (
                      <button
                        type="button"
                        key={product.id}
                        onClick={() => setLegacyProductId(product.id)}
                        className={`w-full p-3 text-left ${legacyProductId === product.id ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                      >
                        <div className="flex justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-800">{product.name}</div>
                            <div className="text-xs text-slate-500">{[product.size ? `T. ${product.size}` : '', product.color, product.shortCode ? `QR ${product.shortCode}` : ''].filter(Boolean).join(' · ')}</div>
                          </div>
                          <div className="text-xs font-semibold text-slate-500">Stock {Number(product.stock || 0)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Producto / descripción *</label>
                    <input value={manualName} onChange={(e) => setManualName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" placeholder="Ej.: Camiseta Argentina" />
                  </div>
                  <input value={manualReference} onChange={(e) => setManualReference(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2.5" placeholder="Código/referencia anterior" />
                  <input value={manualSize} onChange={(e) => setManualSize(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2.5" placeholder="Talle" />
                  <input value={manualColor} onChange={(e) => setManualColor(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2.5" placeholder="Color" />
                  <input value={manualCategory} onChange={(e) => setManualCategory(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2.5" placeholder="Categoría (opcional)" />
                  <input value={manualProvider} onChange={(e) => setManualProvider(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2.5" placeholder="Proveedor (opcional)" />
                  {returnToStock && (
                    <>
                      <input type="number" min="0" value={manualResalePrice} onChange={(e) => setManualResalePrice(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2.5" placeholder="Precio actual de venta *" />
                      <input type="number" min="0" value={manualCost} onChange={(e) => setManualCost(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2.5" placeholder="Costo actual (opcional)" />
                    </>
                  )}
                </div>
              )}
            </section>
          )}

          <section className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Cantidad</label>
                <input
                  type="number"
                  min="1"
                  max={origin === 'registered' && selectedLine ? selectedLine.availableQuantity : undefined}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Valor reconocido por unidad *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={originalUnitAmount}
                  onChange={(e) => setOriginalUnitAmount(e.target.value)}
                  readOnly={origin === 'registered' && Boolean(selectedLine)}
                  className={`w-full border border-slate-300 rounded-lg px-3 py-2.5 ${origin === 'registered' && selectedLine ? 'bg-slate-100' : 'bg-white'}`}
                  placeholder="$ 0"
                />
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 cursor-pointer">
              <input type="checkbox" checked={returnToStock} onChange={(e) => setReturnToStock(e.target.checked)} className="mt-1" />
              <div>
                <div className="font-semibold text-slate-800">Vuelve al stock disponible</div>
                <div className="text-xs text-slate-500">Destildar si está roto, manchado o no puede volver a venderse.</div>
              </div>
            </label>

            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 resize-none" placeholder="Observación (opcional)" />

            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex justify-between items-center gap-3">
              <div>
                <div className="text-xs uppercase font-bold text-amber-700">Crédito que se aplicará en Caja</div>
                <div className="text-xs text-amber-700 mt-1">Se descontará del total de productos nuevos.</div>
              </div>
              <div className="text-2xl font-black text-amber-800">−${money(creditAmount)}</div>
            </div>
          </section>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 flex gap-2 text-sm">
              <AlertTriangle size={17} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold">Cancelar</button>
          <button type="button" onClick={addCredit} className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-2">
            <PackagePlus size={18} />
            Agregar a la operación
          </button>
        </div>
      </div>
    </div>
  );
};

export default POSReturnCreditModal;
