import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Search,
  ChevronDown,
  ChevronUp,
  Barcode,
  PackagePlus,
  Shirt,
  Megaphone,
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import BarcodeScannerModal from './BarcodeScannerModal';
import VariantLookupModal from './VariantLookupModal';

interface POSProps {
  products: Product[];
  onSaleComplete: () => void;
  currentUser: User;
}

type MixedPaymentState = Record<PaymentMethod, string>;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const POS: React.FC<POSProps> = ({ products, onSaleComplete, currentUser }) => {
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Selector de productos en formato lista
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [letterFilter, setLetterFilter] = useState<string>('ALL');
  const productSearchRef = useRef<HTMLInputElement | null>(null);

  const [paymentMethod, setPaymentMethod] =
    useState<SalePaymentMethod>('cash');
  const [mixedPayments, setMixedPayments] = useState<MixedPaymentState>({
    cash: '',
    card: '',
    transfer: '',
  });

  const [successMsg, setSuccessMsg] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [config, setConfig] = useState<AppConfig>({
    commissionPercentage: 5,
  });
  const [isProcessing, setIsProcessing] = useState(false);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanError, setScanError] = useState('');
  const [isVariantLookupOpen, setIsVariantLookupOpen] = useState(false);

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

    return {
      originalSubtotal,
      discountAmount,
      subtotal: Math.max(0, originalSubtotal - discountAmount),
    };
  };

  const normalizeCartItem = (
    item: SaleItem,
    updates: Partial<SaleItem> = {},
  ): SaleItem => {
    const merged = { ...item, ...updates };

    const quantity = Math.max(1, toNumber(merged.quantity, 1));
    const priceAtSale = Math.max(0, toNumber(merged.priceAtSale, 0));
    const discountType: ItemDiscountType =
      merged.discountType || 'percent';
    const discountValue = Math.max(
      0,
      toNumber(merged.discountValue, 0),
    );

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

  useEffect(() => {
    if (!productPickerOpen) return;

    const timer = window.setTimeout(() => {
      productSearchRef.current?.focus();
    }, 50);

    return () => window.clearTimeout(timer);
  }, [productPickerOpen]);

  const showTemporarySuccess = (message: string) => {
    setSuccessMsg(message);

    window.setTimeout(() => {
      setSuccessMsg('');
    }, 1700);
  };

  const closeProductPicker = () => {
    setProductPickerOpen(false);
    setProductSearch('');
    setLetterFilter('ALL');
  };

  const addToCart = (product: Product) => {
    const stock = toNumber(product.stock, 0);
    const price = toNumber(product.price, 0);

    if (stock <= 0) {
      setCheckoutError(`${product.name} no tiene stock disponible.`);
      return;
    }

    if (price <= 0) {
      setCheckoutError(`${product.name} no tiene un precio válido.`);
      return;
    }

    setCheckoutError('');
    setScanError('');

    let added = false;

    setCart((prev) => {
      const existing = prev.find(
        (item) => item.productId === product.id,
      );

      if (existing) {
        if (existing.quantity >= stock) {
          return prev;
        }

        added = true;

        return prev.map((item) =>
          item.productId === product.id
            ? normalizeCartItem(item, {
                quantity: item.quantity + 1,
                salesNote: product.salesNote,
              })
            : item,
        );
      }

      added = true;

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
        salesNote: product.salesNote,
      };

      return [...prev, newItem];
    });

    // React actualiza el estado de forma asincrónica. Este mensaje es
    // deliberadamente simple: el control de stock definitivo también
    // se valida al confirmar la venta en StorageService.
    if (added || stock > 0) {
      showTemporarySuccess(
        `${product.name}${
          product.color ? ` · ${product.color}` : ''
        }${product.size ? ` · T. ${product.size}` : ''} agregado`,
      );
    }

    closeProductPicker();
  };

  const handleBarcodeDetected = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    setScanError('');
    setCheckoutError('');

    let product = products.find(
      (p) =>
        (p.barcode || '').trim() === code ||
        (p.code || '').trim().toLowerCase() ===
          code.toLowerCase(),
    );

    if (!product) {
      product =
        (await StorageService.getProductByBarcode(code)) ||
        undefined;
    }

    if (!product) {
      setScanError(
        `No existe un producto registrado con el código ${code}.`,
      );
      return;
    }

    addToCart(product);
  };

  const handleProductSearchEnter = () => {
    const value = productSearch.trim();

    if (!value) return;

    const exact = products.find(
      (product) =>
        (product.barcode || '').trim() === value ||
        (product.code || '').trim().toLowerCase() ===
          value.toLowerCase(),
    );

    if (exact) {
      addToCart(exact);
    }
  };

  const removeFromCart = (productId: string) => {
    setCheckoutError('');
    setCart((prev) =>
      prev.filter((item) => item.productId !== productId),
    );
  };

  const clearCart = () => {
    if (!cart.length) return;

    if (!confirm('¿Vaciar todos los productos de la venta?')) {
      return;
    }

    setCart([]);
    setMixedPayments({
      cash: '',
      card: '',
      transfer: '',
    });
    setCheckoutError('');
  };

  const updateQuantity = (
    productId: string,
    delta: number,
  ) => {
    setCheckoutError('');

    setCart((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;

        const product = products.find(
          (p) => p.id === productId,
        );
        const maxStock = product
          ? toNumber(product.stock, 0)
          : 0;

        const newQuantity = item.quantity + delta;

        if (
          newQuantity < 1 ||
          newQuantity > maxStock
        ) {
          return item;
        }

        return normalizeCartItem(item, {
          quantity: newQuantity,
        });
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
          ? normalizeCartItem(item, {
              discountType,
              discountValue: 0,
            })
          : item,
      ),
    );
  };

  const updateDiscountValue = (
    productId: string,
    value: string,
  ) => {
    const discountValue = Math.max(
      0,
      toNumber(value, 0),
    );

    setCheckoutError('');

    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? normalizeCartItem(item, {
              discountValue,
            })
          : item,
      ),
    );
  };

  const grossSubtotal = cart.reduce(
    (acc, item) =>
      acc +
      toNumber(
        item.originalSubtotal,
        toNumber(item.quantity, 0) *
          toNumber(item.priceAtSale, 0),
      ),
    0,
  );

  const totalDiscount = cart.reduce(
    (acc, item) =>
      acc + toNumber(item.discountAmount, 0),
    0,
  );

  const finalTotal = cart.reduce(
    (acc, item) =>
      acc + toNumber(item.subtotal, 0),
    0,
  );

  const totalUnits = cart.reduce(
    (acc, item) =>
      acc + toNumber(item.quantity, 0),
    0,
  );

  const parsedMixedPayments: PaymentAllocation[] = [
    {
      method: 'cash',
      amount: Math.max(
        0,
        toNumber(mixedPayments.cash, 0),
      ),
    },
    {
      method: 'card',
      amount: Math.max(
        0,
        toNumber(mixedPayments.card, 0),
      ),
    },
    {
      method: 'transfer',
      amount: Math.max(
        0,
        toNumber(mixedPayments.transfer, 0),
      ),
    },
  ].filter((payment) => payment.amount > 0);

  const mixedAssigned = parsedMixedPayments.reduce(
    (acc, payment) => acc + payment.amount,
    0,
  );

  const paymentDifference =
    finalTotal - mixedAssigned;

  const mixedPaymentValid =
    Math.abs(paymentDifference) < 0.01;

  const setPaymentAndReset = (
    method: SalePaymentMethod,
  ) => {
    setPaymentMethod(method);
    setCheckoutError('');

    if (method !== 'mixed') {
      setMixedPayments({
        cash: '',
        card: '',
        transfer: '',
      });
    }
  };

  const completeRemainingWith = (
    method: PaymentMethod,
  ) => {
    const others = (
      ['cash', 'card', 'transfer'] as PaymentMethod[]
    )
      .filter((m) => m !== method)
      .reduce(
        (acc, m) =>
          acc +
          Math.max(
            0,
            toNumber(mixedPayments[m], 0),
          ),
        0,
      );

    const remaining = Math.max(
      0,
      finalTotal - others,
    );

    setMixedPayments((prev) => ({
      ...prev,
      [method]:
        remaining > 0
          ? remaining.toFixed(2)
          : '',
    }));
  };

  const getPaymentsForSale =
    (): PaymentAllocation[] => {
      if (paymentMethod === 'mixed') {
        return parsedMixedPayments;
      }

      return [
        {
          method: paymentMethod,
          amount: finalTotal,
        },
      ];
    };

  const handleCheckout = async () => {
    if (
      cart.length === 0 ||
      finalTotal <= 0
    ) {
      return;
    }

    setCheckoutError('');

    if (
      paymentMethod === 'mixed' &&
      !mixedPaymentValid
    ) {
      setCheckoutError(
        paymentDifference > 0
          ? `Faltan asignar $${formatMoney(
              paymentDifference,
            )} en la forma de pago.`
          : `Los pagos superan el total en $${formatMoney(
              Math.abs(paymentDifference),
            )}.`,
      );
      return;
    }

    setIsProcessing(true);

    try {
      const configRate = toRate(
        config?.commissionPercentage,
        5,
      );

      const userRate = toRate(
        currentUser?.commissionPercentage,
        configRate,
      );

      const itemsWithCommission = cart.map(
        (item) => ({
          ...item,
          commissionAmount:
            toNumber(item.subtotal, 0) *
            (userRate / 100),
        }),
      );

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
      setMixedPayments({
        cash: '',
        card: '',
        transfer: '',
      });

      await onSaleComplete();

      setSuccessMsg(
        'Venta registrada correctamente.',
      );

      window.setTimeout(
        () => setSuccessMsg(''),
        3000,
      );
    } catch (error: any) {
      console.error(
        'Error procesando venta:',
        error,
      );

      setCheckoutError(
        error?.message ||
          'No se pudo registrar la venta. Intentá nuevamente.',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const term = productSearch
      .trim()
      .toLowerCase();

    return products
      .filter((product) => {
        const matchesCategory =
          selectedCategory === 'ALL' ||
          product.category === selectedCategory;

        const initial = (product.name || '')
          .trim()
          .charAt(0)
          .toUpperCase();

        const matchesLetter =
          letterFilter === 'ALL' ||
          initial === letterFilter;

        const searchable = [
          product.name,
          product.code,
          product.barcode,
          product.color,
          product.size,
          product.category,
          product.provider,
          product.salesNote,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const matchesSearch =
          !term || searchable.includes(term);

        return (
          matchesCategory &&
          matchesLetter &&
          matchesSearch
        );
      })
      .sort((a, b) =>
        (a.name || '').localeCompare(
          b.name || '',
          'es',
        ),
      );
  }, [
    products,
    productSearch,
    letterFilter,
    selectedCategory,
  ]);

  const paymentButtonClass = (
    active: boolean,
  ) =>
    `flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-lg border transition-colors ${
      active
        ? 'bg-indigo-600 text-white border-indigo-600'
        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
    }`;

  return (
    <div className="space-y-5">
      {/* CABECERA */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ShoppingCart size={25} />
            Nueva venta
          </h2>

          <p className="text-sm text-slate-500 mt-1">
            La venta se arma por filas. Seleccioná, buscá o escaneá cada producto.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-2">
            <div className="text-[10px] uppercase font-semibold text-slate-400">
              Productos
            </div>
            <div className="font-bold text-slate-800">
              {cart.length}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl px-4 py-2">
            <div className="text-[10px] uppercase font-semibold text-slate-400">
              Unidades
            </div>
            <div className="font-bold text-slate-800">
              {totalUnits}
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2 min-w-[150px]">
            <div className="text-[10px] uppercase font-semibold text-indigo-500">
              Total actual
            </div>
            <div className="text-xl font-bold text-indigo-700">
              ${formatMoney(finalTotal)}
            </div>
          </div>
        </div>
      </div>

      {scanError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertTriangle
            size={18}
            className="mt-0.5 shrink-0"
          />
          <div className="flex-1 text-sm">
            {scanError}
          </div>
          <button
            type="button"
            onClick={() => setScanError('')}
            className="text-red-500 hover:text-red-700"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {/* TABLA PRINCIPAL DE LA VENTA */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="font-bold text-slate-800">
              Detalle de la venta
            </div>
            <div className="text-xs text-slate-500">
              Vendedor: {currentUser.name}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsVariantLookupOpen(true)}
              className="bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold"
            >
              <Shirt size={18} />
              Talles / Colores
            </button>

            <button
              type="button"
              onClick={() => {
                setScanError('');
                setIsScannerOpen(true);
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold"
            >
              <Camera size={18} />
              Escanear
            </button>

            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-semibold"
              >
                Vaciar venta
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[980px]">
            <thead className="bg-white border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">
                  Producto
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">
                  Variante
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">
                  P. unitario
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-center">
                  Cantidad
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">
                  Descuento
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">
                  Total
                </th>
                <th className="w-12" />
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {cart.map((item) => {
                const discountAmount =
                  toNumber(
                    item.discountAmount,
                    0,
                  );

                return (
                  <tr
                    key={item.productId}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">
                        {item.productName}
                      </div>

                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                        {item.productCode && (
                          <span className="font-mono">
                            {item.productCode}
                          </span>
                        )}

                        {item.barcode && (
                          <span className="font-mono flex items-center gap-1">
                            <Barcode size={11} />
                            {item.barcode}
                          </span>
                        )}
                      </div>

                      {item.salesNote && (
                        <div className="mt-2 flex items-start gap-1.5 px-2.5 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold max-w-md">
                          <Megaphone size={14} className="shrink-0 mt-0.5" />
                          <span>{item.salesNote}</span>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm text-slate-600">
                      {[item.color, item.size ? `T. ${item.size}` : '']
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>

                    <td className="px-4 py-3 text-right font-medium text-slate-700">
                      ${formatMoney(item.priceAtSale)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              item.productId,
                              -1,
                            )
                          }
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100"
                        >
                          <Minus size={14} />
                        </button>

                        <div className="w-10 text-center font-bold text-slate-800">
                          {item.quantity}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              item.productId,
                              1,
                            )
                          }
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-[190px]">
                        <select
                          value={
                            item.discountType ||
                            'percent'
                          }
                          onChange={(e) =>
                            updateDiscountType(
                              item.productId,
                              e.target
                                .value as ItemDiscountType,
                            )
                          }
                          className="border border-slate-300 rounded-lg px-2 py-2 bg-white text-sm"
                        >
                          <option value="percent">
                            %
                          </option>
                          <option value="amount">
                            $
                          </option>
                        </select>

                        <input
                          type="number"
                          min="0"
                          max={
                            item.discountType ===
                            'percent'
                              ? 100
                              : undefined
                          }
                          value={
                            item.discountValue || ''
                          }
                          onChange={(e) =>
                            updateDiscountValue(
                              item.productId,
                              e.target.value,
                            )
                          }
                          placeholder="0"
                          className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        {discountAmount > 0 && (
                          <span className="text-xs font-semibold text-emerald-600 whitespace-nowrap">
                            -$
                            {formatMoney(
                              discountAmount,
                            )}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-indigo-700 text-base">
                        $
                        {formatMoney(
                          item.subtotal,
                        )}
                      </div>
                    </td>

                    <td className="px-2 py-3 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          removeFromCart(
                            item.productId,
                          )
                        }
                        title="Quitar producto"
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* FILA PARA AGREGAR EL SIGUIENTE PRODUCTO */}
              <tr className="bg-slate-50/70">
                <td colSpan={7} className="p-0">
                  <button
                    type="button"
                    onClick={() =>
                      setProductPickerOpen(
                        (prev) => !prev,
                      )
                    }
                    className="w-full px-4 py-4 flex items-center justify-between gap-3 text-left hover:bg-indigo-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                        <PackagePlus size={19} />
                      </div>

                      <div>
                        <div className="font-semibold text-indigo-700">
                          + Agregar otro producto
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Hacé clic para buscar por nombre, primera letra, SKU o código de barras.
                        </div>
                      </div>
                    </div>

                    {productPickerOpen ? (
                      <ChevronUp
                        size={19}
                        className="text-slate-400"
                      />
                    ) : (
                      <ChevronDown
                        size={19}
                        className="text-slate-400"
                      />
                    )}
                  </button>
                </td>
              </tr>

              {productPickerOpen && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-0 border-t border-indigo-100"
                  >
                    <div className="p-4 bg-indigo-50/40 space-y-3">
                      {/* Búsqueda + categoría + cámara */}
                      <div className="flex flex-col lg:flex-row gap-2">
                        <div className="relative flex-1">
                          <Search
                            size={18}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          />

                          <input
                            ref={productSearchRef}
                            type="text"
                            value={productSearch}
                            onChange={(e) =>
                              setProductSearch(
                                e.target.value,
                              )
                            }
                            onKeyDown={(e) => {
                              if (
                                e.key === 'Enter'
                              ) {
                                e.preventDefault();
                                handleProductSearchEnter();
                              }
                            }}
                            placeholder="Escribí nombre o escaneá/ingresá SKU o código y presioná Enter..."
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        <select
                          value={selectedCategory}
                          onChange={(e) =>
                            setSelectedCategory(
                              e.target.value,
                            )
                          }
                          className="px-3 py-2.5 border border-slate-300 rounded-lg bg-white"
                        >
                          <option value="ALL">
                            Todas las categorías
                          </option>
                          {categories.map((cat) => (
                            <option
                              key={cat.id}
                              value={cat.name}
                            >
                              {cat.name}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            setScanError('');
                            setIsScannerOpen(true);
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-semibold"
                        >
                          <Camera size={18} />
                          Cámara
                        </button>
                      </div>

                      {/* Filtro alfabético */}
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setLetterFilter(
                              'ALL',
                            )
                          }
                          className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border ${
                            letterFilter === 'ALL'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Todos
                        </button>

                        {ALPHABET.map((letter) => (
                          <button
                            key={letter}
                            type="button"
                            onClick={() =>
                              setLetterFilter(
                                letter,
                              )
                            }
                            className={`w-8 h-8 rounded-md text-xs font-semibold border ${
                              letterFilter ===
                              letter
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {letter}
                          </button>
                        ))}
                      </div>

                      {/* Lista de productos en filas */}
                      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                        <div className="max-h-[330px] overflow-y-auto">
                          <table className="w-full text-left min-w-[760px]">
                            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                              <tr>
                                <th className="px-3 py-2 text-[11px] uppercase text-slate-500 font-semibold">
                                  Producto
                                </th>
                                <th className="px-3 py-2 text-[11px] uppercase text-slate-500 font-semibold">
                                  Variante
                                </th>
                                <th className="px-3 py-2 text-[11px] uppercase text-slate-500 font-semibold">
                                  Código
                                </th>
                                <th className="px-3 py-2 text-[11px] uppercase text-slate-500 font-semibold text-right">
                                  Precio
                                </th>
                                <th className="px-3 py-2 text-[11px] uppercase text-slate-500 font-semibold text-center">
                                  Stock
                                </th>
                              </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-100">
                              {filteredProducts.map(
                                (product) => {
                                  const stock =
                                    toNumber(
                                      product.stock,
                                      0,
                                    );
                                  const price =
                                    toNumber(
                                      product.price,
                                      0,
                                    );
                                  const disabled =
                                    stock <= 0 ||
                                    price <= 0;

                                  return (
                                    <tr
                                      key={
                                        product.id
                                      }
                                      onClick={() => {
                                        if (
                                          !disabled
                                        ) {
                                          addToCart(
                                            product,
                                          );
                                        }
                                      }}
                                      className={`${
                                        disabled
                                          ? 'bg-slate-50 opacity-55 cursor-not-allowed'
                                          : 'cursor-pointer hover:bg-indigo-50'
                                      }`}
                                    >
                                      <td className="px-3 py-2.5">
                                        <div className="font-medium text-slate-800">
                                          {
                                            product.name
                                          }
                                        </div>
                                        <div className="text-[11px] text-slate-400">
                                          {
                                            product.category
                                          }
                                        </div>

                                        {product.salesNote && (
                                          <div className="mt-1 inline-flex items-start gap-1 px-2 py-1 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold">
                                            <Megaphone size={11} className="shrink-0 mt-0.5" />
                                            <span>{product.salesNote}</span>
                                          </div>
                                        )}
                                      </td>

                                      <td className="px-3 py-2.5 text-sm text-slate-600">
                                        {[
                                          product.color,
                                          product.size
                                            ? `T. ${product.size}`
                                            : '',
                                        ]
                                          .filter(
                                            Boolean,
                                          )
                                          .join(
                                            ' · ',
                                          ) ||
                                          '—'}
                                      </td>

                                      <td className="px-3 py-2.5">
                                        <div className="font-mono text-xs text-slate-600">
                                          {
                                            product.code
                                          }
                                        </div>
                                        {product.barcode && (
                                          <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                                            {
                                              product.barcode
                                            }
                                          </div>
                                        )}
                                      </td>

                                      <td className="px-3 py-2.5 text-right font-semibold text-slate-800">
                                        $
                                        {formatMoney(
                                          price,
                                        )}
                                      </td>

                                      <td className="px-3 py-2.5 text-center">
                                        <span
                                          className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${
                                            stock <= 0
                                              ? 'bg-red-100 text-red-700'
                                              : stock <=
                                                  Number(
                                                    product.minStock ??
                                                      3,
                                                  )
                                                ? 'bg-amber-100 text-amber-700'
                                                : 'bg-emerald-100 text-emerald-700'
                                          }`}
                                        >
                                          {stock}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                },
                              )}

                              {filteredProducts.length ===
                                0 && (
                                <tr>
                                  <td
                                    colSpan={5}
                                    className="px-4 py-8 text-center text-slate-400"
                                  >
                                    No hay productos con ese filtro.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                        <span>
                          {filteredProducts.length}{' '}
                          producto(s) mostrado(s)
                        </span>

                        <button
                          type="button"
                          onClick={closeProductPicker}
                          className="text-slate-600 hover:text-slate-900 font-semibold"
                        >
                          Cerrar selector
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RESUMEN + PAGO */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.15fr] gap-5">
        {/* Totales */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">
            Resumen
          </h3>

          <div className="space-y-2">
            <div className="flex justify-between text-sm text-slate-500">
              <span>
                Subtotal de productos
              </span>
              <span>
                ${formatMoney(grossSubtotal)}
              </span>
            </div>

            <div className="flex justify-between text-sm text-emerald-600 font-medium">
              <span>Descuentos</span>
              <span>
                - ${formatMoney(totalDiscount)}
              </span>
            </div>

            <div className="flex justify-between items-end pt-3 mt-3 border-t border-slate-200">
              <div>
                <div className="text-xs uppercase font-bold text-slate-500">
                  Total venta
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {cart.length} producto(s) ·{' '}
                  {totalUnits} unidad(es)
                </div>
              </div>

              <div className="text-3xl font-bold text-indigo-700">
                ${formatMoney(finalTotal)}
              </div>
            </div>
          </div>
        </div>

        {/* Forma de pago */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-slate-800">
              Forma de pago
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Puede ser simple o mixta.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() =>
                setPaymentAndReset('cash')
              }
              className={paymentButtonClass(
                paymentMethod === 'cash',
              )}
            >
              <Banknote size={15} />
              Efectivo
            </button>

            <button
              type="button"
              onClick={() =>
                setPaymentAndReset('card')
              }
              className={paymentButtonClass(
                paymentMethod === 'card',
              )}
            >
              <CreditCard size={15} />
              Tarjeta
            </button>

            <button
              type="button"
              onClick={() =>
                setPaymentAndReset(
                  'transfer',
                )
              }
              className={paymentButtonClass(
                paymentMethod ===
                  'transfer',
              )}
            >
              <Landmark size={15} />
              Transfer.
            </button>

            <button
              type="button"
              onClick={() =>
                setPaymentAndReset('mixed')
              }
              className={paymentButtonClass(
                paymentMethod === 'mixed',
              )}
            >
              <WalletCards size={15} />
              Mixto
            </button>
          </div>

          {paymentMethod === 'mixed' && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
              <div className="text-sm font-semibold text-slate-700">
                Distribuir $
                {formatMoney(finalTotal)}
              </div>

              {(
                [
                  [
                    'cash',
                    'Efectivo',
                    Banknote,
                  ],
                  [
                    'card',
                    'Tarjeta',
                    CreditCard,
                  ],
                  [
                    'transfer',
                    'Transferencia',
                    Landmark,
                  ],
                ] as const
              ).map(
                ([method, label, Icon]) => (
                  <div
                    key={method}
                    className="grid grid-cols-[115px_1fr_auto] gap-2 items-center"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                      <Icon size={15} />
                      {label}
                    </div>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="$ 0"
                      value={
                        mixedPayments[
                          method
                        ]
                      }
                      onChange={(e) => {
                        setCheckoutError(
                          '',
                        );
                        setMixedPayments(
                          (prev) => ({
                            ...prev,
                            [method]:
                              e.target
                                .value,
                          }),
                        );
                      }}
                      className="min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        completeRemainingWith(
                          method,
                        )
                      }
                      className="text-[11px] font-semibold px-2 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600"
                    >
                      Resto
                    </button>
                  </div>
                ),
              )}

              <div className="pt-2 border-t border-slate-200">
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
                      : paymentDifference >
                          0
                        ? 'Falta'
                        : 'Excede'}
                  </span>

                  <span>
                    {mixedPaymentValid
                      ? `Asignado $${formatMoney(
                          mixedAssigned,
                        )}`
                      : `$${formatMoney(
                          Math.abs(
                            paymentDifference,
                          ),
                        )}`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {checkoutError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 flex gap-2 text-sm">
              <AlertTriangle
                size={17}
                className="shrink-0 mt-0.5"
              />
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
              (paymentMethod === 'mixed' &&
                !mixedPaymentValid)
            }
            className={`w-full py-4 rounded-xl font-bold text-lg shadow-md transition-all flex items-center justify-center gap-2 ${
              cart.length > 0 &&
              finalTotal > 0 &&
              !isProcessing &&
              (paymentMethod !== 'mixed' ||
                mixedPaymentValid)
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isProcessing && (
              <Loader2 className="animate-spin" />
            )}

            {isProcessing
              ? 'Procesando...'
              : `Confirmar venta · $${formatMoney(
                  finalTotal,
                )}`}
          </button>
        </div>
      </div>

      <VariantLookupModal
        open={isVariantLookupOpen}
        products={products}
        onClose={() => setIsVariantLookupOpen(false)}
        onSelectProduct={addToCart}
        closeOnSelect
      />

      <BarcodeScannerModal
        open={isScannerOpen}
        title="Escanear para agregar a la venta"
        onClose={() =>
          setIsScannerOpen(false)
        }
        onDetected={handleBarcodeDetected}
      />

      {successMsg && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-5 py-3 rounded-xl shadow-lg z-50 flex items-center gap-3 animate-fade-in-up">
          <CheckCircle size={22} />
          <span className="font-semibold">
            {successMsg}
          </span>
        </div>
      )}
    </div>
  );
};

export default POS;
