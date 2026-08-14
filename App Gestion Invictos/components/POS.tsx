import React, { useEffect, useMemo, useState } from 'react';
import {
  Product,
  SaleItem,
  Sale,
  User,
  AppConfig,
  CategoryItem,
  ItemDiscountType,
  PaymentMethod,
  SalePaymentMethod,
  PaymentAllocation,
} from '../types';
import {
  ShoppingCart,
  Minus,
  Plus,
  Trash,
  CheckCircle,
  Percent,
  DollarSign,
  Loader2,
  Camera,
  AlertTriangle,
  Banknote,
  CreditCard,
  Landmark,
  WalletCards,
  X,
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import BarcodeScannerModal from './BarcodeScannerModal';

interface POSProps {
  products: Product[];
  onSaleComplete: () => void;
  currentUser: User;
}

type MixedPaymentState = Record<PaymentMethod, string>;

const POS: React.FC<POSProps> = ({ products, onSaleComplete, currentUser }) => {
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('cash');
  const [mixedPayments, setMixedPayments] = useState<MixedPaymentState>({
    cash: '',
    card: '',
    transfer: '',
  });
  const [successMsg, setSuccessMsg] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [config, setConfig] = useState<AppConfig>({ commissionPercentage: 5 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanError, setScanError] = useState('');

  const toNumber = (value: unknown, fallback = 0): number => {
    const n =
      typeof value === 'string'
        ? Number(value.replace('%', '').replace(',', '.').trim())
        : Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const toRate = (value: unknown, fallback: number): number => {
    const n = toNumber(value, fallback);
    if (!Number.isFinite(n)) return fallback;
    if (n < 0) return 0;
    return n;
  };

  const formatMoney = (value: number): string =>
    Number(value || 0).toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  const calculateLine = (
    quantity: number,
    unitPrice: number,
    discountType: ItemDiscountType,
    discountValue: number,
  ) => {
    const originalSubtotal = Math.max(0, quantity * unitPrice);
    const normalizedValue = Math.max(0, discountValue || 0);

    let discountAmount = 0;

    if (discountType === 'percent') {
      const percent = Math.min(normalizedValue, 100);
      discountAmount = originalSubtotal * (percent / 100);
    } else {
      discountAmount = Math.min(normalizedValue, originalSubtotal);
    }

    const subtotal = Math.max(0, originalSubtotal - discountAmount);

    return {
      originalSubtotal,
      discountAmount,
      subtotal,
    };
  };

  const normalizeCartItem = (
    item: SaleItem,
    updates: Partial<SaleItem> = {},
  ): SaleItem => {
    const merged = { ...item, ...updates };
    const quantity = Math.max(1, toNumber(merged.quantity, 1));
    const priceAtSale = Math.max(0, toNumber(merged.priceAtSale, 0));
    const discountType: ItemDiscountType = merged.discountType || 'percent';
    const discountValue = Math.max(0, toNumber(merged.discountValue, 0));

    const totals = calculateLine(
      quantity,
      priceAtSale,
      discountType,
      discountValue,
    );

    return {
      ...merged,
      quantity,
      priceAtSale,
      discountType,
      discountValue,
      originalSubtotal: totals.originalSubtotal,
      discountAmount: totals.discountAmount,
      subtotal: totals.subtotal,
    };
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [conf, cats] = await Promise.all([
          StorageService.getConfig(),
          StorageService.getCategories(),
        ]);

        setConfig(
          conf && typeof conf === 'object'
            ? conf
            : { commissionPercentage: 5 },
        );
        setCategories(Array.isArray(cats) ? cats : []);
      } catch (error) {
        console.error('Error loading config/categories', error);
        setConfig({ commissionPercentage: 5 });
        setCategories([]);
      }
    };

    void load();
  }, []);

  const addToCart = (product: Product) => {
    const stock = toNumber(product.stock, 0);
    const price = toNumber(product.price, 0);

    if (stock <= 0 || price <= 0) return;

    setCheckoutError('');

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);

      if (existing) {
        if (existing.quantity >= stock) return prev;

        return prev.map((item) =>
          item.productId === product.id
            ? normalizeCartItem(item, { quantity: item.quantity + 1 })
            : item,
        );
      }

      const newItem: SaleItem = {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        priceAtSale: price,
        originalSubtotal: price,
        discountType: 'percent',
        discountValue: 0,
        discountAmount: 0,
        subtotal: price,
        productCode: product.code,
        barcode: product.barcode,
        size: product.size,
        color: product.color,
      };

      return [...prev, newItem];
    });
  };

  const handleBarcodeDetected = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    setScanError('');

    let product = products.find(
      (p) =>
        (p.barcode || '').trim() === code ||
        (p.code || '').trim().toLowerCase() === code.toLowerCase(),
    );

    if (!product) {
      product = (await StorageService.getProductByBarcode(code)) || undefined;
    }

    if (!product) {
      setScanError(`No existe un producto con el código ${code}.`);
      return;
    }

    const stock = toNumber(product.stock, 0);
    const price = toNumber(product.price, 0);

    if (stock <= 0) {
      setScanError(`${product.name} no tiene stock disponible.`);
      return;
    }

    if (price <= 0) {
      setScanError(`${product.name} no tiene un precio válido.`);
      return;
    }

    addToCart(product);
    setSuccessMsg(
      `${product.name}${product.color ? ` · ${product.color}` : ''}${
        product.size ? ` · ${product.size}` : ''
      } agregado a la venta`,
    );
    setTimeout(() => setSuccessMsg(''), 1600);
  };

  const removeFromCart = (productId: string) => {
    setCheckoutError('');
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const clearCart = () => {
    if (!cart.length) return;
    if (!confirm('¿Vaciar todos los productos de la venta?')) return;

    setCart([]);
    setMixedPayments({ cash: '', card: '', transfer: '' });
    setCheckoutError('');
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCheckoutError('');

    setCart((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;

        const product = products.find((p) => p.id === productId);
        const maxStock = product ? toNumber(product.stock, 0) : 0;
        const newQuantity = item.quantity + delta;

        if (newQuantity < 1 || newQuantity > maxStock) return item;

        return normalizeCartItem(item, { quantity: newQuantity });
      }),
    );
  };

  const updateDiscountType = (
    productId: string,
    discountType: ItemDiscountType,
  ) => {
    setCheckoutError('');
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? normalizeCartItem(item, { discountType, discountValue: 0 })
          : item,
      ),
    );
  };

  const updateDiscountValue = (productId: string, value: string) => {
    const discountValue = Math.max(0, toNumber(value, 0));
    setCheckoutError('');

    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? normalizeCartItem(item, { discountValue })
          : item,
      ),
    );
  };

  const grossSubtotal = cart.reduce(
    (acc, item) =>
      acc +
      toNumber(
        item.originalSubtotal,
        toNumber(item.quantity, 0) * toNumber(item.priceAtSale, 0),
      ),
    0,
  );

  const totalDiscount = cart.reduce(
    (acc, item) => acc + toNumber(item.discountAmount, 0),
    0,
  );

  const finalTotal = cart.reduce(
    (acc, item) => acc + toNumber(item.subtotal, 0),
    0,
  );

  const totalUnits = cart.reduce(
    (acc, item) => acc + toNumber(item.quantity, 0),
    0,
  );

  const parsedMixedPayments: PaymentAllocation[] = [
    { method: 'cash', amount: Math.max(0, toNumber(mixedPayments.cash, 0)) },
    { method: 'card', amount: Math.max(0, toNumber(mixedPayments.card, 0)) },
    {
      method: 'transfer',
      amount: Math.max(0, toNumber(mixedPayments.transfer, 0)),
    },
  ].filter((payment) => payment.amount > 0);

  const mixedAssigned = parsedMixedPayments.reduce(
    (acc, payment) => acc + payment.amount,
    0,
  );

  const paymentDifference = finalTotal - mixedAssigned;
  const mixedPaymentValid = Math.abs(paymentDifference) < 0.01;

  const setPaymentAndReset = (method: SalePaymentMethod) => {
    setPaymentMethod(method);
    setCheckoutError('');

    if (method !== 'mixed') {
      setMixedPayments({ cash: '', card: '', transfer: '' });
    }
  };

  const completeRemainingWith = (method: PaymentMethod) => {
    const others = (['cash', 'card', 'transfer'] as PaymentMethod[])
      .filter((m) => m !== method)
      .reduce((acc, m) => acc + Math.max(0, toNumber(mixedPayments[m], 0)), 0);

    const remaining = Math.max(0, finalTotal - others);

    setMixedPayments((prev) => ({
      ...prev,
      [method]: remaining > 0 ? remaining.toFixed(2) : '',
    }));
  };

  const getPaymentsForSale = (): PaymentAllocation[] => {
    if (paymentMethod === 'mixed') return parsedMixedPayments;

    return [
      {
        method: paymentMethod,
        amount: finalTotal,
      },
    ];
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || finalTotal <= 0) return;

    setCheckoutError('');

    if (paymentMethod === 'mixed' && !mixedPaymentValid) {
      setCheckoutError(
        paymentDifference > 0
          ? `Faltan asignar $${formatMoney(paymentDifference)} en la forma de pago.`
          : `Los pagos superan el total en $${formatMoney(Math.abs(paymentDifference))}.`,
      );
      return;
    }

    setIsProcessing(true);

    try {
      const configRate = toRate(config?.commissionPercentage, 5);
      const userRate = toRate(currentUser?.commissionPercentage, configRate);

      // La comisión se calcula sobre el importe neto de cada producto,
      // es decir, después de su descuento individual.
      const itemsWithCommission = cart.map((item) => ({
        ...item,
        commissionAmount: toNumber(item.subtotal, 0) * (userRate / 100),
      }));

      const sale: Sale = {
        id: Date.now().toString(),
        items: itemsWithCommission,
        subtotal: grossSubtotal,
        discount: totalDiscount,
        total: finalTotal,
        timestamp: Date.now(),
        paymentMethod,
        payments: getPaymentsForSale(),
        userId: currentUser.id,
        userName: currentUser.name,
      };

      await StorageService.addSale(sale);

      setCart([]);
      setPaymentMethod('cash');
      setMixedPayments({ cash: '', card: '', transfer: '' });
      await onSaleComplete();

      setSuccessMsg('Venta registrada correctamente.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (error: any) {
      console.error('Error procesando venta:', error);
      setCheckoutError(
        error?.message || 'No se pudo registrar la venta. Intentá nuevamente.',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const searchLower = search.toLowerCase().trim();

    return products.filter((p) => {
      const matchesCat =
        selectedCategory === 'ALL' || p.category === selectedCategory;

      const searchable = [
        p.name,
        p.code,
        p.barcode,
        p.color,
        p.size,
        p.category,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return matchesCat && (!searchLower || searchable.includes(searchLower));
    });
  }, [products, selectedCategory, search]);

  const paymentButtonClass = (active: boolean) =>
    `flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-lg border transition-colors ${
      active
        ? 'bg-indigo-600 text-white border-indigo-600'
        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
    }`;

  return (
    <div className="flex flex-col xl:flex-row gap-5 min-h-[calc(100vh-8rem)]">
      {/* PRODUCTOS */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-3">
          <div className="flex flex-1 gap-2">
            <input
              type="text"
              placeholder="Buscar por nombre, SKU, código, talle o color..."
              className="flex-1 min-w-0 px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <button
              type="button"
              onClick={() => {
                setScanError('');
                setIsScannerOpen(true);
              }}
              className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 font-semibold shadow-sm"
              title="Escanear con la cámara"
            >
              <Camera size={20} />
              <span className="hidden md:inline">Escanear</span>
            </button>
          </div>

          <select
            className="px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none bg-white"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="ALL">Todas las Categorías</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {scanError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1 text-sm">{scanError}</div>
            <button
              type="button"
              onClick={() => setScanError('')}
              className="text-red-500 hover:text-red-700"
            >
              <X size={17} />
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-3 content-start">
          {filteredProducts.map((product) => {
            const stock = toNumber(product.stock, 0);
            const price = toNumber(product.price, 0);
            const inCart = cart.find((item) => item.productId === product.id);

            return (
              <button
                key={product.id}
                type="button"
                onClick={() => addToCart(product)}
                disabled={stock <= 0}
                className={`flex flex-col items-start p-4 rounded-xl border transition-all text-left relative min-h-[150px] ${
                  stock > 0
                    ? 'bg-white border-slate-200 hover:border-indigo-500 hover:shadow-md cursor-pointer'
                    : 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                }`}
              >
                {inCart && (
                  <span className="absolute top-2 right-2 min-w-6 h-6 px-1.5 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                    {inCart.quantity}
                  </span>
                )}

                <div className="text-[10px] font-mono text-slate-400 pr-7">
                  {product.code}
                </div>

                <h3 className="font-semibold text-slate-800 leading-tight mt-1 line-clamp-2">
                  {product.name}
                </h3>

                {(product.color || product.size) && (
                  <div className="text-xs text-slate-500 mt-1">
                    {[product.color, product.size ? `T. ${product.size}` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}

                <div className="mt-auto pt-3 w-full flex justify-between items-end gap-2">
                  <span className="text-lg font-bold text-indigo-600">
                    ${formatMoney(price)}
                  </span>
                  <span
                    className={`text-[11px] px-2 py-1 rounded ${
                      stock < 3
                        ? 'bg-red-100 text-red-600'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Stock {stock}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {filteredProducts.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl py-12 text-center text-slate-400">
            No se encontraron productos.
          </div>
        )}
      </div>

      {/* VENTA / CARRITO */}
      <div className="w-full xl:w-[520px] bg-white rounded-xl shadow-lg border border-slate-200 flex flex-col xl:sticky xl:top-4 xl:max-h-[calc(100vh-7rem)]">
        <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <ShoppingCart size={23} /> Venta
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {cart.length} productos diferentes · {totalUnits} unidades · Vendedor: {currentUser.name}
            </p>
          </div>

          {cart.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="text-xs text-red-500 hover:bg-red-50 rounded-lg px-2.5 py-2 font-semibold"
            >
              Vaciar
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[240px]">
          {cart.length === 0 ? (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-slate-400 space-y-2">
              <ShoppingCart size={48} className="opacity-20" />
              <p className="font-medium">La venta está vacía</p>
              <p className="text-xs text-center max-w-xs">
                Tocá distintos productos o escaneá sus códigos. Cada producto se irá agregando a esta misma venta.
              </p>
            </div>
          ) : (
            cart.map((item) => {
              const originalSubtotal = toNumber(
                item.originalSubtotal,
                item.quantity * item.priceAtSale,
              );
              const discountAmount = toNumber(item.discountAmount, 0);

              return (
                <div
                  key={item.productId}
                  className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 leading-tight">
                        {item.productName}
                      </p>

                      {(item.color || item.size) && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {[item.color, item.size ? `Talle ${item.size}` : '']
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}

                      <p className="text-xs text-slate-400 mt-1">
                        ${formatMoney(item.priceAtSale)} c/u
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFromCart(item.productId)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Quitar producto"
                    >
                      <Trash size={17} />
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-[auto_1fr] gap-3 items-center">
                    <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-1">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, -1)}
                        className="p-1.5 hover:bg-white rounded-md"
                      >
                        <Minus size={15} />
                      </button>

                      <span className="w-8 text-center font-bold text-sm">
                        {item.quantity}
                      </span>

                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, 1)}
                        className="p-1.5 hover:bg-white rounded-md"
                      >
                        <Plus size={15} />
                      </button>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] uppercase font-semibold text-slate-400">
                        Bruto
                      </div>
                      <div className="font-semibold text-slate-700">
                        ${formatMoney(originalSubtotal)}
                      </div>
                    </div>
                  </div>

                  {/* DESCUENTO POR PRODUCTO */}
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-bold uppercase text-slate-500">
                        Descuento de este producto
                      </span>

                      {discountAmount > 0 && (
                        <span className="text-xs font-semibold text-emerald-600">
                          - ${formatMoney(discountAmount)}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200 shrink-0">
                        <button
                          type="button"
                          title="Descuento porcentual"
                          onClick={() => updateDiscountType(item.productId, 'percent')}
                          className={`p-1.5 rounded ${
                            (item.discountType || 'percent') === 'percent'
                              ? 'bg-white shadow text-indigo-600'
                              : 'text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          <Percent size={15} />
                        </button>

                        <button
                          type="button"
                          title="Descuento en pesos"
                          onClick={() => updateDiscountType(item.productId, 'amount')}
                          className={`p-1.5 rounded ${
                            item.discountType === 'amount'
                              ? 'bg-white shadow text-indigo-600'
                              : 'text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          <DollarSign size={15} />
                        </button>
                      </div>

                      <input
                        type="number"
                        min="0"
                        max={item.discountType === 'percent' ? 100 : undefined}
                        placeholder={item.discountType === 'amount' ? '$ 0' : '0 %'}
                        className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={item.discountValue || ''}
                        onChange={(e) =>
                          updateDiscountValue(item.productId, e.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex justify-between items-end bg-indigo-50 rounded-lg px-3 py-2">
                    <span className="text-xs font-semibold text-indigo-700 uppercase">
                      Total producto
                    </span>
                    <span className="text-lg font-bold text-indigo-700">
                      ${formatMoney(item.subtotal)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-xl space-y-4">
          {/* TOTAL GENERAL */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1.5">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Subtotal productos</span>
              <span>${formatMoney(grossSubtotal)}</span>
            </div>

            {totalDiscount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600 font-medium">
                <span>Descuentos</span>
                <span>- ${formatMoney(totalDiscount)}</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <span className="text-base font-bold text-slate-800">TOTAL</span>
              <span className="text-3xl font-bold text-indigo-600">
                ${formatMoney(finalTotal)}
              </span>
            </div>
          </div>

          {/* FORMA DE PAGO */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
              Forma de pago
            </label>

            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setPaymentAndReset('cash')}
                className={paymentButtonClass(paymentMethod === 'cash')}
              >
                <Banknote size={15} />
                <span className="hidden sm:inline">Efectivo</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentAndReset('card')}
                className={paymentButtonClass(paymentMethod === 'card')}
              >
                <CreditCard size={15} />
                <span className="hidden sm:inline">Tarjeta</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentAndReset('transfer')}
                className={paymentButtonClass(paymentMethod === 'transfer')}
              >
                <Landmark size={15} />
                <span className="hidden sm:inline">Transf.</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentAndReset('mixed')}
                className={paymentButtonClass(paymentMethod === 'mixed')}
              >
                <WalletCards size={15} />
                <span className="hidden sm:inline">Mixto</span>
              </button>
            </div>
          </div>

          {paymentMethod === 'mixed' && (
            <div className="bg-white border border-indigo-200 rounded-xl p-3 space-y-3">
              <div className="text-sm font-bold text-slate-700">
                Distribuir ${formatMoney(finalTotal)} entre medios de pago
              </div>

              {(
                [
                  ['cash', 'Efectivo', Banknote],
                  ['card', 'Tarjeta', CreditCard],
                  ['transfer', 'Transferencia', Landmark],
                ] as const
              ).map(([method, label, Icon]) => (
                <div key={method} className="grid grid-cols-[120px_1fr_auto] gap-2 items-center">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <Icon size={15} /> {label}
                  </div>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="$ 0"
                    className="min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={mixedPayments[method]}
                    onChange={(e) => {
                      setCheckoutError('');
                      setMixedPayments((prev) => ({
                        ...prev,
                        [method]: e.target.value,
                      }));
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => completeRemainingWith(method)}
                    className="text-[11px] font-semibold px-2 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
                    title="Completar el importe que falta con este medio"
                  >
                    Resto
                  </button>
                </div>
              ))}

              <div className="pt-2 border-t border-slate-100 space-y-1">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Asignado</span>
                  <span>${formatMoney(mixedAssigned)}</span>
                </div>

                <div
                  className={`flex justify-between text-sm font-bold ${
                    mixedPaymentValid
                      ? 'text-emerald-600'
                      : paymentDifference > 0
                        ? 'text-amber-600'
                        : 'text-red-600'
                  }`}
                >
                  <span>
                    {mixedPaymentValid
                      ? 'Pago completo'
                      : paymentDifference > 0
                        ? 'Falta'
                        : 'Excede'}
                  </span>
                  <span>
                    {mixedPaymentValid
                      ? 'OK'
                      : `$${formatMoney(Math.abs(paymentDifference))}`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {checkoutError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 flex gap-2 text-sm">
              <AlertTriangle size={17} className="shrink-0 mt-0.5" />
              <span>{checkoutError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleCheckout}
            disabled={
              cart.length === 0 ||
              finalTotal <= 0 ||
              isProcessing ||
              (paymentMethod === 'mixed' && !mixedPaymentValid)
            }
            className={`w-full py-4 rounded-xl font-bold text-lg shadow-md transition-all flex items-center justify-center gap-2 ${
              cart.length > 0 &&
              finalTotal > 0 &&
              !isProcessing &&
              (paymentMethod !== 'mixed' || mixedPaymentValid)
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isProcessing && <Loader2 className="animate-spin" />}
            {isProcessing
              ? 'Procesando...'
              : `Confirmar venta · $${formatMoney(finalTotal)}`}
          </button>
        </div>
      </div>

      <BarcodeScannerModal
        open={isScannerOpen}
        title="Escanear para agregar a la venta"
        onClose={() => setIsScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />

      {successMsg && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-4 rounded-xl shadow-lg z-50 flex items-center gap-3 animate-fade-in-up">
          <CheckCircle size={24} />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}
    </div>
  );
};

export default POS;
