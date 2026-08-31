import React, { useEffect, useMemo, useState } from 'react';
import {
  Sale,
  SaleAdjustment,
  LegacySaleAdjustment,
  SaleItem,
  User,
  Product,
  Expense,
  ExpenseCategory,
  SalePaymentMethod,
} from '../types';
import { StorageService } from '../services/storageService';
import AccountsReceivablePanel from './AccountsReceivablePanel';
import SaleAdjustmentModal from './SaleAdjustmentModal';
import SaleAdjustmentReceiptModal from './SaleAdjustmentReceiptModal';
import LegacySaleAdjustmentModal from './LegacySaleAdjustmentModal';
import LegacySaleAdjustmentReceiptModal from './LegacySaleAdjustmentReceiptModal';
import {
  Calendar,
  DollarSign,
  ReceiptText,
  Plus,
  Trash2,
  Edit2,
  X,
  Save,
  Download,
  AlertTriangle,
  Filter,
  ArrowLeftRight,
  Search,
  History,
} from 'lucide-react';

interface SalesHistoryProps {
  sales: Sale[];
  currentUser: User;
  onUpdate?: () => void | Promise<void>;
}

type PeriodType = 'day' | 'week' | 'month' | 'year' | 'custom';
type HistoryTab = 'sales' | 'sellers' | 'expenses' | 'receivables';

interface Range {
  start: number;
  end: number;
  label: string;
}

interface CostResult {
  cost: number;
  estimated: boolean;
  missing: boolean;
}

interface SellerSummary {
  userId: string;
  userName: string;
  tickets: number;
  units: number;
  revenue: number;
  merchandiseCost: number;
  grossMargin: number;
  commissions: number;
  contribution: number;
  estimatedCostItems: number;
  missingCostItems: number;
}

const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  rent: 'Alquiler',
  energy: 'Energía',
  staff: 'Personal / Sueldos',
  taxes: 'Impuestos',
  services: 'Servicios',
  marketing: 'Publicidad / Marketing',
  transport: 'Transporte / Envíos',
  maintenance: 'Mantenimiento',
  other: 'Otros',
};

const money = (value: number): string =>
  Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const localDateParts = (date = new Date()) => ({
  year: date.getFullYear(),
  month: String(date.getMonth() + 1).padStart(2, '0'),
  day: String(date.getDate()).padStart(2, '0'),
});

const toDateInput = (date = new Date()) => {
  const p = localDateParts(date);
  return `${p.year}-${p.month}-${p.day}`;
};

const toMonthInput = (date = new Date()) => {
  const p = localDateParts(date);
  return `${p.year}-${p.month}`;
};

const parseLocalDate = (value: string): Date => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};

const endOfDay = (date: Date): number => {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result.getTime();
};

const startOfWeekMonday = (date: Date): Date => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));
  return result;
};

const formatDate = (timestamp: number): string =>
  new Date(timestamp).toLocaleDateString('es-AR');

const formatDateTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleString('es-AR');

const paymentLabel = (method: SalePaymentMethod): string => {
  if (method === 'cash') return 'Efectivo';
  if (method === 'debit') return 'Débito';
  if (method === 'card') return 'Tarjeta';
  if (method === 'transfer') return 'Transferencia';
  if (method === 'account') return 'Cuenta corriente';
  return 'Mixto';
};

const SalesHistory: React.FC<SalesHistoryProps> = ({
  sales,
  currentUser,
  onUpdate,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const today = new Date();

  const [tab, setTab] = useState<HistoryTab>(() => {
    try {
      const requested = window.localStorage.getItem(
        'invictos_history_requested_tab',
      );

      if (requested === 'receivables') {
        window.localStorage.removeItem(
          'invictos_history_requested_tab',
        );
        return 'receivables';
      }
    } catch {
      // Sin acción.
    }

    return 'sales';
  });

  const [adjustmentSale, setAdjustmentSale] = useState<Sale | null>(null);
  const [adjustmentReceipt, setAdjustmentReceipt] = useState<{
    sale: Sale;
    adjustment: SaleAdjustment;
  } | null>(null);

  const [legacyAdjustmentOpen, setLegacyAdjustmentOpen] = useState(false);
  const [legacyAdjustmentReceipt, setLegacyAdjustmentReceipt] =
    useState<LegacySaleAdjustment | null>(null);
  const [legacyAdjustments, setLegacyAdjustments] =
    useState<LegacySaleAdjustment[]>([]);

  // Búsqueda global del historial para ubicar ventas ante cambios/devoluciones.
  const [saleSearch, setSaleSearch] = useState('');

  const [periodType, setPeriodType] =
    useState<PeriodType>('month');

  const [dayValue, setDayValue] = useState(toDateInput(today));
  const [weekValue, setWeekValue] = useState(toDateInput(today));
  const [monthValue, setMonthValue] =
    useState(toMonthInput(today));
  const [yearValue, setYearValue] =
    useState(String(today.getFullYear()));

  const [customFrom, setCustomFrom] =
    useState(toDateInput(today));
  const [customTo, setCustomTo] =
    useState(toDateInput(today));

  const [sellerFilter, setSellerFilter] = useState(
    isAdmin ? 'ALL' : currentUser.id,
  );

  const [paymentFilter, setPaymentFilter] = useState('ALL');

  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [expenseCategoryFilter, setExpenseCategoryFilter] =
    useState('ALL');

  const [isExpenseModalOpen, setIsExpenseModalOpen] =
    useState(false);

  const [editingExpense, setEditingExpense] =
    useState<Expense | null>(null);

  const [expensePeriodMonth, setExpensePeriodMonth] =
    useState(toMonthInput(today));

  const [expensePaymentDate, setExpensePaymentDate] =
    useState('');

  const [expenseCategory, setExpenseCategory] =
    useState<ExpenseCategory>('rent');

  const [expenseDescription, setExpenseDescription] =
    useState('');

  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [expenseError, setExpenseError] = useState('');
  const [isSavingExpense, setIsSavingExpense] =
    useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [
          loadedUsers,
          loadedProducts,
          loadedExpenses,
          loadedLegacyAdjustments,
        ] = await Promise.all([
          StorageService.getUsers(),
          StorageService.getProducts(),
          isAdmin
            ? StorageService.getExpenses()
            : Promise.resolve([] as Expense[]),
          StorageService.getLegacySaleAdjustments(),
        ]);

        setUsers(loadedUsers);
        setProducts(loadedProducts);
        setExpenses(loadedExpenses);
        setLegacyAdjustments(loadedLegacyAdjustments);
      } catch (error) {
        console.error(
          'Error cargando datos auxiliares del historial:',
          error,
        );
      }
    };

    void load();
  }, [isAdmin]);

  useEffect(() => {
    if (
      !isAdmin &&
      (tab === 'sellers' || tab === 'expenses')
    ) {
      setTab('sales');
    }
  }, [isAdmin, tab]);

  const range = useMemo<Range>(() => {
    if (periodType === 'day') {
      const start = parseLocalDate(dayValue);

      return {
        start: start.getTime(),
        end: endOfDay(start),
        label: formatDate(start.getTime()),
      };
    }

    if (periodType === 'week') {
      const start = startOfWeekMonday(
        parseLocalDate(weekValue),
      );

      const end = new Date(start);
      end.setDate(end.getDate() + 6);

      return {
        start: start.getTime(),
        end: endOfDay(end),
        label: `${formatDate(start.getTime())} al ${formatDate(
          end.getTime(),
        )}`,
      };
    }

    if (periodType === 'month') {
      const [year, month] = monthValue.split('-').map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);

      return {
        start: start.getTime(),
        end: endOfDay(end),
        label: start.toLocaleDateString('es-AR', {
          month: 'long',
          year: 'numeric',
        }),
      };
    }

    if (periodType === 'year') {
      const year = Number(yearValue) || today.getFullYear();
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);

      return {
        start: start.getTime(),
        end: endOfDay(end),
        label: String(year),
      };
    }

    const from = parseLocalDate(customFrom);
    const to = parseLocalDate(customTo);

    const first = Math.min(from.getTime(), to.getTime());
    const last = new Date(
      Math.max(from.getTime(), to.getTime()),
    );

    return {
      start: first,
      end: endOfDay(last),
      label: `${formatDate(first)} al ${formatDate(
        last.getTime(),
      )}`,
    };
  }, [
    periodType,
    dayValue,
    weekValue,
    monthValue,
    yearValue,
    customFrom,
    customTo,
  ]);

  const accessibleSales = useMemo(
    () =>
      isAdmin
        ? sales
        : sales.filter(
            (sale) => sale.userId === currentUser.id,
          ),
    [sales, isAdmin, currentUser.id],
  );

  const sellerOptions = useMemo(() => {
    const map = new Map<string, string>();

    users.forEach((user) => {
      map.set(user.id, user.name);
    });

    accessibleSales.forEach((sale) => {
      if (!map.has(sale.userId)) {
        map.set(
          sale.userId,
          sale.userName || sale.userId,
        );
      }
    });

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'es'),
      );
  }, [users, accessibleSales]);

  const saleMatchesPayment = (sale: Sale): boolean => {
    if (paymentFilter === 'ALL') return true;

    if (sale.paymentMethod === paymentFilter) {
      return true;
    }

    return Boolean(
      sale.paymentMethod === 'mixed' &&
        sale.payments?.some(
          (p) => p.method === paymentFilter,
        ),
    );
  };

  const periodSales = useMemo(
    () =>
      accessibleSales.filter(
        (sale) =>
          sale.timestamp >= range.start &&
          sale.timestamp <= range.end &&
          saleMatchesPayment(sale),
      ),
    [
      accessibleSales,
      range.start,
      range.end,
      paymentFilter,
    ],
  );

  const filteredSales = useMemo(
    () =>
      periodSales.filter(
        (sale) =>
          sellerFilter === 'ALL' ||
          sale.userId === sellerFilter,
      ),
    [periodSales, sellerFilter],
  );

  const tableSales = useMemo(() => {
    const term = saleSearch.trim().toLowerCase();

    if (!term) return filteredSales;

    // Cuando hay búsqueda, consulta todo el historial accesible.
    return accessibleSales.filter((sale) => {
      if (
        sellerFilter !== 'ALL' &&
        sale.userId !== sellerFilter
      ) {
        return false;
      }

      if (!saleMatchesPayment(sale)) {
        return false;
      }

      const customer =
        sale.customerName ||
        sale.receivable?.customerName ||
        '';

      const adjustmentText = (sale.adjustments || [])
        .map((adjustment) =>
          [
            adjustment.returnedItem?.productName,
            adjustment.returnedItem?.productCode,
            adjustment.returnedItem?.shortCode,
            adjustment.replacementItem?.productName,
            adjustment.replacementItem?.productCode,
            adjustment.replacementItem?.shortCode,
          ]
            .filter(Boolean)
            .join(' '),
        )
        .join(' ');

      const itemText = sale.items
        .map((item) =>
          [
            item.productName,
            item.productCode,
            item.shortCode,
            item.barcode,
            item.size,
            item.color,
          ]
            .filter(Boolean)
            .join(' '),
        )
        .join(' ');

      const searchable = [
        customer,
        sale.userName,
        sale.id,
        itemText,
        adjustmentText,
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [
    saleSearch,
    filteredSales,
    accessibleSales,
    sellerFilter,
    paymentFilter,
  ]);

  const accessibleLegacyAdjustments = useMemo(
    () =>
      isAdmin
        ? legacyAdjustments
        : legacyAdjustments.filter(
            (adjustment) =>
              adjustment.recordedByUserId === currentUser.id,
          ),
    [legacyAdjustments, isAdmin, currentUser.id],
  );

  const periodLegacyAdjustments = useMemo(
    () =>
      accessibleLegacyAdjustments.filter((adjustment) => {
        if (
          adjustment.timestamp < range.start ||
          adjustment.timestamp > range.end
        ) {
          return false;
        }

        if (paymentFilter === 'ALL') return true;
        return adjustment.settlement?.method === paymentFilter;
      }),
    [
      accessibleLegacyAdjustments,
      range.start,
      range.end,
      paymentFilter,
    ],
  );

  const legacyFinancialAdjustments = useMemo(
    () =>
      isAdmin && sellerFilter === 'ALL'
        ? periodLegacyAdjustments
        : [],
    [isAdmin, sellerFilter, periodLegacyAdjustments],
  );

  const legacyAdjustmentNetCost = (
    adjustment: LegacySaleAdjustment,
  ): number => {
    let cost = 0;

    if (adjustment.returnedItem.returnToStock) {
      cost -=
        Math.max(0, Number(adjustment.returnedItem.costAtSale || 0)) *
        Math.max(0, Number(adjustment.returnedItem.quantity || 0));
    }

    if (adjustment.replacementItem) {
      cost +=
        Math.max(0, Number(adjustment.replacementItem.costAtSale || 0)) *
        Math.max(0, Number(adjustment.replacementItem.quantity || 0));
    }

    return cost;
  };

  const productMap = useMemo(
    () =>
      new Map(
        products.map((product) => [
          product.id,
          product,
        ]),
      ),
    [products],
  );

  const resolveItemCost = (
    item: SaleItem,
  ): CostResult => {
    const historical = Number(item.costAtSale);

    if (
      Number.isFinite(historical) &&
      historical >= 0
    ) {
      return {
        cost:
          historical * Number(item.quantity || 0),
        estimated: false,
        missing: false,
      };
    }

    const product = productMap.get(item.productId);
    const current = Number(product?.cost);

    if (Number.isFinite(current) && current >= 0) {
      return {
        cost:
          current * Number(item.quantity || 0),
        estimated: true,
        missing: false,
      };
    }

    return {
      cost: 0,
      estimated: false,
      missing: true,
    };
  };

  const fullMonthsInRange = useMemo(() => {
    const months: string[] = [];

    const startDate = new Date(range.start);
    const endDate = new Date(range.end);

    const cursor = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      1,
    );

    const lastMonth = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      1,
    );

    while (cursor <= lastMonth) {
      const monthStart = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        1,
        0,
        0,
        0,
        0,
      );

      const monthEnd = new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );

      // Solo se incorpora un gasto mensual cuando el período analizado
      // contiene el mes COMPLETO. Así un filtro de un solo día no
      // descuenta todo el alquiler mensual.
      if (
        range.start <= monthStart.getTime() &&
        range.end >= monthEnd.getTime()
      ) {
        const monthKey =
          `${cursor.getFullYear()}-${String(
            cursor.getMonth() + 1,
          ).padStart(2, '0')}`;

        months.push(monthKey);
      }

      cursor.setMonth(cursor.getMonth() + 1);
    }

    return months;
  }, [range.start, range.end]);

  const periodExpenses = useMemo(
    () =>
      expenses.filter((expense) =>
        fullMonthsInRange.includes(expense.periodMonth),
      ),
    [expenses, fullMonthsInRange],
  );

  const visibleExpenses = useMemo(
    () =>
      periodExpenses.filter(
        (expense) =>
          expenseCategoryFilter === 'ALL' ||
          expense.category === expenseCategoryFilter,
      ),
    [periodExpenses, expenseCategoryFilter],
  );

  const saleAdjustments = (sale: Sale) =>
    Array.isArray(sale.adjustments) ? sale.adjustments : [];

  const saleAdjustmentDifference = (sale: Sale): number =>
    saleAdjustments(sale).reduce(
      (sum, adjustment) => sum + Number(adjustment.difference || 0),
      0,
    );

  const saleNetTotal = (sale: Sale): number =>
    Number(sale.total || 0) + saleAdjustmentDifference(sale);

  const saleNetUnits = (sale: Sale): number => {
    const baseUnits = sale.items.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );

    return saleAdjustments(sale).reduce(
      (units, adjustment) =>
        units - Number(adjustment.returnedItem.quantity || 0) +
        Number(adjustment.replacementItem?.quantity || 0),
      baseUnits,
    );
  };

  const saleNetCost = (sale: Sale): {
    cost: number;
    estimated: boolean;
    missing: boolean;
  } => {
    let cost = 0;
    let estimated = false;
    let missing = false;

    sale.items.forEach((item) => {
      const result = resolveItemCost(item);
      cost += result.cost;
      estimated ||= result.estimated;
      missing ||= result.missing;
    });

    saleAdjustments(sale).forEach((adjustment) => {
      if (adjustment.returnedItem.returnToStock) {
        cost -=
          Math.max(0, Number(adjustment.returnedItem.costAtSale || 0)) *
          Math.max(0, Number(adjustment.returnedItem.quantity || 0));
      }

      if (adjustment.replacementItem) {
        cost +=
          Math.max(0, Number(adjustment.replacementItem.costAtSale || 0)) *
          Math.max(0, Number(adjustment.replacementItem.quantity || 0));
      }
    });

    return {
      cost: Math.max(0, cost),
      estimated,
      missing,
    };
  };

  const summary = useMemo(() => {
    let units = 0;
    let merchandiseCost = 0;
    let commissions = 0;
    let estimatedCostItems = 0;
    let missingCostItems = 0;

    tableSales.forEach((sale) => {
      units += saleNetUnits(sale);

      sale.items.forEach((item) => {
        commissions += Number(item.commissionAmount || 0);
      });

      const result = saleNetCost(sale);
      merchandiseCost += result.cost;

      if (result.estimated) estimatedCostItems += 1;
      if (result.missing) missingCostItems += 1;
    });

    const legacyNetMovement = legacyFinancialAdjustments.reduce(
      (acc, adjustment) =>
        acc + Number(adjustment.difference || 0),
      0,
    );

    const legacyCostImpact = legacyFinancialAdjustments.reduce(
      (acc, adjustment) => acc + legacyAdjustmentNetCost(adjustment),
      0,
    );

    merchandiseCost += legacyCostImpact;

    const revenue =
      filteredSales.reduce(
        (acc, sale) => acc + saleNetTotal(sale),
        0,
      ) + legacyNetMovement;

    const discounts = filteredSales.reduce(
      (acc, sale) =>
        acc + Number(sale.discount || 0),
      0,
    );

    const grossMargin = revenue - merchandiseCost;

    const contribution =
      grossMargin - commissions;

    // Los gastos generales solo se descuentan cuando se analiza
    // el negocio completo. No se adjudican a un vendedor individual.
    const operatingExpenses =
      isAdmin && sellerFilter === 'ALL'
        ? periodExpenses.reduce(
            (acc, expense) =>
              acc + Number(expense.amount || 0),
            0,
          )
        : 0;

    return {
      tickets: filteredSales.length,
      units,
      revenue,
      discounts,
      merchandiseCost,
      grossMargin,
      commissions,
      contribution,
      operatingExpenses,
      operatingResult:
        contribution - operatingExpenses,
      estimatedCostItems,
      missingCostItems,
      legacyAdjustmentCount: legacyFinancialAdjustments.length,
      legacyNetMovement,
      legacyCostImpact,
    };
  }, [
    filteredSales,
    periodExpenses,
    productMap,
    isAdmin,
    sellerFilter,
    legacyFinancialAdjustments,
  ]);

  const sellerSummaries =
    useMemo<SellerSummary[]>(() => {
      const map =
        new Map<string, SellerSummary>();

      filteredSales.forEach((sale) => {
        const current =
          map.get(sale.userId) || {
            userId: sale.userId,
            userName:
              sale.userName || sale.userId,
            tickets: 0,
            units: 0,
            revenue: 0,
            merchandiseCost: 0,
            grossMargin: 0,
            commissions: 0,
            contribution: 0,
            estimatedCostItems: 0,
            missingCostItems: 0,
          };

        current.tickets += 1;
        current.revenue += saleNetTotal(sale);
        current.units += saleNetUnits(sale);

        sale.items.forEach((item) => {
          current.commissions += Number(
            item.commissionAmount || 0,
          );
        });

        const cost = saleNetCost(sale);
        current.merchandiseCost += cost.cost;

        if (cost.estimated) {
          current.estimatedCostItems += 1;
        }

        if (cost.missing) {
          current.missingCostItems += 1;
        }

        current.grossMargin =
          current.revenue -
          current.merchandiseCost;

        current.contribution =
          current.grossMargin -
          current.commissions;

        map.set(sale.userId, current);
      });

      return Array.from(map.values()).sort(
        (a, b) => b.revenue - a.revenue,
      );
    }, [filteredSales, productMap]);

  const applyPreset = (
    type: 'day' | 'week' | 'month' | 'year',
  ) => {
    const now = new Date();

    if (type === 'day') {
      setDayValue(toDateInput(now));
    }

    if (type === 'week') {
      setWeekValue(toDateInput(now));
    }

    if (type === 'month') {
      setMonthValue(toMonthInput(now));
    }

    if (type === 'year') {
      setYearValue(
        String(now.getFullYear()),
      );
    }

    setPeriodType(type);
  };

  const openNewExpense = () => {
    setEditingExpense(null);
    setExpensePeriodMonth(toMonthInput(new Date()));
    setExpensePaymentDate('');
    setExpenseCategory('rent');
    setExpenseDescription('');
    setExpenseAmount('');
    setExpenseNotes('');
    setExpenseError('');
    setIsExpenseModalOpen(true);
  };

  const openEditExpense = (
    expense: Expense,
  ) => {
    setEditingExpense(expense);
    setExpensePeriodMonth(
      expense.periodMonth || toMonthInput(new Date()),
    );
    setExpensePaymentDate(
      expense.paymentDate
        ? toDateInput(new Date(expense.paymentDate))
        : '',
    );
    setExpenseCategory(expense.category);
    setExpenseDescription(
      expense.description || '',
    );
    setExpenseAmount(
      String(expense.amount || ''),
    );
    setExpenseNotes(expense.notes || '');
    setExpenseError('');
    setIsExpenseModalOpen(true);
  };

  const closeExpenseModal = () => {
    if (isSavingExpense) return;

    setIsExpenseModalOpen(false);
    setEditingExpense(null);
    setExpenseError('');
  };

  const saveExpense = async () => {
    if (!isAdmin) return;

    const amount = Number(
      expenseAmount
        .replace(',', '.')
        .trim(),
    );

    if (!expenseDescription.trim()) {
      setExpenseError(
        'Ingresá una descripción.',
      );
      return;
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setExpenseError(
        'Ingresá un importe mayor que cero.',
      );
      return;
    }

    setIsSavingExpense(true);
    setExpenseError('');

    try {
      const paymentDate = expensePaymentDate
        ? parseLocalDate(expensePaymentDate)
        : null;

      if (paymentDate) {
        // Mediodía evita desplazamientos de fecha por zonas horarias.
        paymentDate.setHours(12, 0, 0, 0);
      }

      const expense: Expense = {
        id:
          editingExpense?.id ||
          `exp-${Date.now()}`,
        periodMonth: expensePeriodMonth,
        paymentDate: paymentDate
          ? paymentDate.getTime()
          : undefined,
        category: expenseCategory,
        description:
          expenseDescription.trim(),
        amount,
        notes:
          expenseNotes.trim() ||
          undefined,
        createdByUserId:
          editingExpense?.createdByUserId ||
          currentUser.id,
        createdByUserName:
          editingExpense?.createdByUserName ||
          currentUser.name,
        createdAt:
          editingExpense?.createdAt ||
          Date.now(),
        updatedAt: Date.now(),
      };

      await StorageService.saveExpense(
        expense,
      );

      setExpenses(
        await StorageService.getExpenses(),
      );

      setIsExpenseModalOpen(false);
      setEditingExpense(null);
    } catch (error: any) {
      setExpenseError(
        error?.message ||
          'No se pudo guardar el gasto.',
      );
    } finally {
      setIsSavingExpense(false);
    }
  };

  const deleteExpense = async (
    expense: Expense,
  ) => {
    if (!isAdmin) return;

    if (
      !confirm(
        `¿Eliminar "${expense.description}" por $${money(
          expense.amount,
        )}?`,
      )
    ) {
      return;
    }

    await StorageService.deleteExpense(
      expense.id,
    );

    setExpenses((prev) =>
      prev.filter(
        (item) => item.id !== expense.id,
      ),
    );
  };

  const csvEscape = (value: unknown) =>
    `"${String(value ?? '').replace(
      /"/g,
      '""',
    )}"`;

  const exportSalesCsv = () => {
    if (!tableSales.length) return;

    const rows = [
      [
        'Venta',
        'Fecha venta',
        'Vendedor',
        'Cliente',
        'Cargada por',
        'Fecha carga',
        'Producto',
        'Cantidad',
        'Precio Unitario',
        'Descuento Linea',
        'Importe Linea',
        'Costo Unitario Historico',
        'Costo Total Usado',
        'Costo Estimado',
        'Comision',
        'Metodo Pago',
        'Total Venta',
      ].join(','),
    ];

    filteredSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const cost =
          resolveItemCost(item);

        rows.push(
          [
            csvEscape(sale.id),
            csvEscape(
              formatDateTime(
                sale.timestamp,
              ),
            ),
            csvEscape(sale.userName),
            csvEscape(
              sale.customerName || sale.receivable?.customerName || '',
            ),
            csvEscape(
              sale.recordedByUserName || sale.userName,
            ),
            csvEscape(
              sale.recordedAt
                ? formatDateTime(sale.recordedAt)
                : formatDateTime(sale.timestamp),
            ),
            csvEscape(
              `${item.productName}${
                item.color
                  ? ` · ${item.color}`
                  : ''
              }${
                item.size
                  ? ` · T. ${item.size}`
                  : ''
              }`,
            ),
            Number(item.quantity || 0),
            Number(
              item.priceAtSale || 0,
            ),
            Number(
              item.discountAmount || 0,
            ),
            Number(item.subtotal || 0),
            Number.isFinite(
              Number(item.costAtSale),
            )
              ? Number(item.costAtSale)
              : '',
            cost.cost,
            cost.estimated
              ? 'SI'
              : 'NO',
            Number(
              item.commissionAmount || 0,
            ),
            csvEscape(
              paymentLabel(
                sale.paymentMethod,
              ),
            ),
            saleNetTotal(sale),
          ].join(','),
        );
      });
    });

    StorageService.downloadCSV(
      rows.join('\n'),
      `ventas_${Date.now()}.csv`,
    );
  };

  const exportExpensesCsv = () => {
    if (!visibleExpenses.length) return;

    const rows = [
      'Periodo,Fecha pago,Fecha carga,Categoria,Descripcion,Importe,Notas,Cargado por',
      ...visibleExpenses.map(
        (expense) =>
          [
            csvEscape(expense.periodMonth),
            csvEscape(
              expense.paymentDate
                ? formatDate(expense.paymentDate)
                : '',
            ),
            csvEscape(
              expense.createdAt
                ? formatDateTime(expense.createdAt)
                : '',
            ),
            csvEscape(
              EXPENSE_LABELS[
                expense.category
              ],
            ),
            csvEscape(
              expense.description,
            ),
            Number(
              expense.amount || 0,
            ),
            csvEscape(
              expense.notes || '',
            ),
            csvEscape(
              expense.createdByUserName,
            ),
          ].join(','),
      ),
    ];

    StorageService.downloadCSV(
      rows.join('\n'),
      `gastos_${Date.now()}.csv`,
    );
  };

  const financialWarning =
    summary.estimatedCostItems > 0 ||
    summary.missingCostItems > 0;

  const analyzingWholeBusiness =
    isAdmin && sellerFilter === 'ALL';

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ReceiptText
              size={26}
              className="text-indigo-600"
            />
            Ventas y Rentabilidad
          </h2>

          <p className="text-sm text-slate-500 mt-1">
            Análisis por período,
            vendedor, costos, comisiones y
            gastos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ['day', 'Hoy'],
            ['week', 'Esta semana'],
            ['month', 'Este mes'],
            ['year', 'Este año'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                applyPreset(
                  value as
                    | 'day'
                    | 'week'
                    | 'month'
                    | 'year',
                )
              }
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 font-bold text-slate-800 mb-3">
          <Filter
            size={18}
            className="text-indigo-600"
          />
          Período y filtros
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Tipo de período
            </label>

            <select
              value={periodType}
              onChange={(e) =>
                setPeriodType(
                  e.target.value as PeriodType,
                )
              }
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 bg-white"
            >
              <option value="day">
                Día específico
              </option>
              <option value="week">
                Semana específica
              </option>
              <option value="month">
                Mes específico
              </option>
              <option value="year">
                Año específico
              </option>
              <option value="custom">
                Desde / Hasta
              </option>
            </select>
          </div>

          <div className="xl:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              {periodType === 'day'
                ? 'Día'
                : periodType === 'week'
                  ? 'Elegí un día de esa semana'
                  : periodType === 'month'
                    ? 'Mes'
                    : periodType === 'year'
                      ? 'Año'
                      : 'Rango personalizado'}
            </label>

            {periodType === 'day' && (
              <input
                type="date"
                value={dayValue}
                onChange={(e) =>
                  setDayValue(
                    e.target.value,
                  )
                }
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5"
              />
            )}

            {periodType === 'week' && (
              <input
                type="date"
                value={weekValue}
                onChange={(e) =>
                  setWeekValue(
                    e.target.value,
                  )
                }
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5"
              />
            )}

            {periodType === 'month' && (
              <input
                type="month"
                value={monthValue}
                onChange={(e) =>
                  setMonthValue(
                    e.target.value,
                  )
                }
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5"
              />
            )}

            {periodType === 'year' && (
              <input
                type="number"
                min="2020"
                max="2100"
                value={yearValue}
                onChange={(e) =>
                  setYearValue(
                    e.target.value,
                  )
                }
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5"
              />
            )}

            {periodType === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) =>
                    setCustomFrom(
                      e.target.value,
                    )
                  }
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5"
                />

                <input
                  type="date"
                  value={customTo}
                  onChange={(e) =>
                    setCustomTo(
                      e.target.value,
                    )
                  }
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Vendedor
            </label>

            <select
              value={sellerFilter}
              disabled={!isAdmin}
              onChange={(e) =>
                setSellerFilter(
                  e.target.value,
                )
              }
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 bg-white disabled:bg-slate-100"
            >
              {isAdmin && (
                <option value="ALL">
                  Todos
                </option>
              )}

              {sellerOptions
                .filter(
                  (seller) =>
                    isAdmin ||
                    seller.id ===
                      currentUser.id,
                )
                .map((seller) => (
                  <option
                    key={seller.id}
                    value={seller.id}
                  >
                    {seller.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Medio de pago
            </label>

            <select
              value={paymentFilter}
              onChange={(e) =>
                setPaymentFilter(
                  e.target.value,
                )
              }
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 bg-white"
            >
              <option value="ALL">
                Todos
              </option>
              <option value="cash">
                Efectivo
              </option>
              <option value="debit">
                Débito
              </option>
              <option value="card">
                Tarjeta
              </option>
              <option value="transfer">
                Transferencia
              </option>
              <option value="account">
                Cuenta corriente
              </option>
              <option value="mixed">
                Mixto
              </option>
            </select>
          </div>
        </div>

        <div className="mt-3 text-sm font-semibold text-indigo-700 flex items-center gap-2">
          <Calendar size={16} />
          Período analizado: {range.label}
        </div>

        {isAdmin && (
          <div className="mt-2 text-xs text-slate-500">
            Los gastos operativos se imputan por mes. En este filtro se consideran
            únicamente los meses completos incluidos en el período:
            {' '}
            <b>
              {fullMonthsInRange.length > 0
                ? fullMonthsInRange.join(', ')
                : 'ninguno'}
            </b>.
          </div>
        )}
      </div>

      <div
        className={`grid grid-cols-2 ${
          isAdmin
            ? 'lg:grid-cols-4'
            : 'lg:grid-cols-3'
        } gap-3`}
      >
        <SummaryCard
          label="Ventas"
          value={String(summary.tickets)}
          sub={`${summary.units} unidad(es)`}
        />

        <SummaryCard
          label="Ventas netas"
          value={`$${money(
            summary.revenue,
          )}`}
          sub={`Descuentos: $${money(
            summary.discounts,
          )}`}
        />

        {isAdmin && sellerFilter === 'ALL' && summary.legacyAdjustmentCount > 0 && (
          <SummaryCard
            label="Ventas previas · ajustes"
            value={`$${money(summary.legacyNetMovement)}`}
            sub={`${summary.legacyAdjustmentCount} cambio(s)/devolución(es) · sin venta histórica`}
          />
        )}

        {isAdmin && (
          <>
            <SummaryCard
              label="Costo mercadería"
              value={`$${money(
                summary.merchandiseCost,
              )}`}
              sub={
                summary.estimatedCostItems > 0
                  ? `${summary.estimatedCostItems} línea(s) estimada(s)`
                  : 'Costo histórico'
              }
            />

            <SummaryCard
              label="Margen bruto"
              value={`$${money(
                summary.grossMargin,
              )}`}
              sub="Ventas - mercadería"
            />
          </>
        )}

        <SummaryCard
          label="Comisiones"
          value={`$${money(
            summary.commissions,
          )}`}
          sub={
            isAdmin
              ? 'Total del período'
              : 'Tu comisión del período'
          }
        />

        {isAdmin && (
          <>
            <SummaryCard
              label="Aporte antes de gastos"
              value={`$${money(
                summary.contribution,
              )}`}
              sub="Margen - comisiones"
            />

            {analyzingWholeBusiness && (
              <>
                <SummaryCard
                  label="Gastos operativos"
                  value={`$${money(
                    summary.operatingExpenses,
                  )}`}
                  sub="Alquiler, energía, personal, etc."
                />

                <SummaryCard
                  label="Resultado operativo"
                  value={`$${money(
                    summary.operatingResult,
                  )}`}
                  sub="Después de costos, comisión y gastos"
                  positive={
                    summary.operatingResult >=
                    0
                  }
                />
              </>
            )}
          </>
        )}
      </div>

      {isAdmin &&
        sellerFilter !== 'ALL' && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm text-indigo-800">
            Al analizar un vendedor individual,
            los gastos generales del negocio
            (alquiler, energía, etc.) no se le
            descuentan. Se muestra su aporte
            después de mercadería y comisión.
          </div>
        )}

      {isAdmin &&
        financialWarning && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm text-amber-800">
            <AlertTriangle
              size={20}
              className="shrink-0 mt-0.5"
            />

            <div>
              <div className="font-bold">
                Hay ventas anteriores sin
                costo histórico guardado.
              </div>

              <div className="mt-1">
                {summary.estimatedCostItems >
                  0 &&
                  `${summary.estimatedCostItems} línea(s) usan el costo actual como estimación. `}

                {summary.missingCostItems >
                  0 &&
                  `${summary.missingCostItems} línea(s) no tienen costo disponible. `}

                Las nuevas ventas guardarán el
                costo real automáticamente.
              </div>
            </div>
          </div>
        )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <TabButton
          active={tab === 'sales'}
          onClick={() => setTab('sales')}
          label="Ventas"
        />

        <TabButton
          active={tab === 'receivables'}
          onClick={() => setTab('receivables')}
          label="Cuentas corrientes"
        />

        {isAdmin && (
          <>
            <TabButton
              active={tab === 'sellers'}
              onClick={() =>
                setTab('sellers')
              }
              label="Por vendedor"
            />

            <TabButton
              active={
                tab === 'expenses'
              }
              onClick={() =>
                setTab('expenses')
              }
              label="Gastos operativos"
            />
          </>
        )}
      </div>

      {tab === 'sales' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-bold text-slate-800">
                  Detalle de ventas
                </div>

                <div className="text-xs text-slate-500 mt-1">
                  {saleSearch.trim()
                    ? `${tableSales.length} resultado(s) en todo el historial`
                    : `${filteredSales.length} venta(s) en ${range.label}`}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => setLegacyAdjustmentOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold flex items-center justify-center gap-2"
                >
                  <History size={17} />
                  Venta anterior al sistema
                </button>

                <button
                  type="button"
                  onClick={exportSalesCsv}
                  disabled={!tableSales.length}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Download size={17} />
                  Exportar CSV
                </button>
              </div>
            </div>

            <div className="relative">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="text"
                value={saleSearch}
                onChange={(e) => setSaleSearch(e.target.value)}
                placeholder="Buscar cliente, producto, código, vendedor o venta..."
                className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              {saleSearch.trim() && (
                <div className="text-[11px] text-indigo-600 mt-1.5">
                  La búsqueda consulta todo el historial accesible, aunque el período seleccionado sea otro.
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[980px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <Th>Fecha</Th>
                  <Th>Cliente</Th>
                  <Th>Vendedor</Th>
                  <Th>Productos</Th>
                  <Th>Pago</Th>
                  <Th align="right">
                    Venta neta
                  </Th>

                  {isAdmin && (
                    <Th align="right">
                      Costo
                    </Th>
                  )}

                  <Th align="right">
                    Comisión
                  </Th>

                  {isAdmin && (
                    <Th align="right">
                      Aporte
                    </Th>
                  )}

                  <Th align="right">
                    Acción
                  </Th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {tableSales.map(
                  (sale) => {
                    const netCost = saleNetCost(sale);
                    const saleCost = netCost.cost;
                    const estimated = netCost.estimated;
                    const missing = netCost.missing;

                    const saleCommission = sale.items.reduce(
                      (sum, item) =>
                        sum + Number(item.commissionAmount || 0),
                      0,
                    );

                    const netTotal = saleNetTotal(sale);
                    const adjustments = saleAdjustments(sale);

                    const contribution =
                      netTotal - saleCost - saleCommission;

                    return (
                      <tr
                        key={sale.id}
                        className="hover:bg-slate-50 align-top"
                      >
                        <Td>
                          <div className="font-medium">
                            {formatDate(
                              sale.timestamp,
                            )}
                          </div>

                          <div className="text-xs text-slate-400">
                            {new Date(
                              sale.timestamp,
                            ).toLocaleTimeString(
                              'es-AR',
                              {
                                hour: '2-digit',
                                minute:
                                  '2-digit',
                              },
                            )}
                          </div>
                        </Td>

                        <Td>
                          <div className="font-medium text-slate-800">
                            {sale.customerName ||
                              sale.receivable?.customerName ||
                              '—'}
                          </div>
                        </Td>

                        <Td>
                          <div className="font-medium">
                            {sale.userName}
                          </div>

                          {isAdmin &&
                            sale.recordedByUserName &&
                            (sale.recordedByUserId !== sale.userId ||
                              (sale.recordedAt &&
                                Math.abs(
                                  sale.recordedAt - sale.timestamp,
                                ) > 60_000)) && (
                              <div className="text-[11px] text-slate-400 mt-1">
                                Cargada por {sale.recordedByUserName}
                                {sale.recordedAt
                                  ? ` · ${formatDateTime(sale.recordedAt)}`
                                  : ''}
                              </div>
                            )}
                        </Td>

                        <Td>
                          <div className="space-y-1">
                            {sale.items.map(
                              (
                                item,
                                index,
                              ) => (
                                <div
                                  key={`${sale.id}-${item.productId}-${index}`}
                                  className="text-sm"
                                >
                                  <span className="font-medium">
                                    {
                                      item.quantity
                                    }
                                    ×{' '}
                                    {
                                      item.productName
                                    }
                                  </span>

                                  {(item.color ||
                                    item.size) && (
                                    <span className="text-slate-400">
                                      {' '}
                                      ·{' '}
                                      {item.color ||
                                        ''}
                                      {item.color &&
                                      item.size
                                        ? ' · '
                                        : ''}
                                      {item.size
                                        ? `T. ${item.size}`
                                        : ''}
                                    </span>
                                  )}
                                </div>
                              ),
                            )}
                          </div>

                          {adjustments.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5">
                              {adjustments.map((adjustment) => (
                                <div
                                  key={adjustment.id}
                                  className="text-[11px] text-slate-600 bg-slate-50 rounded-lg px-2 py-1.5"
                                >
                                  <div className="font-bold text-indigo-700 flex items-center gap-1">
                                    <ArrowLeftRight size={12} />
                                    {adjustment.type === 'exchange'
                                      ? 'Cambio'
                                      : 'Devolución'}{' '}
                                    · {formatDate(adjustment.timestamp)}
                                  </div>
                                  <div className="mt-1">
                                    Volvió: {adjustment.returnedItem.quantity}×{' '}
                                    {adjustment.returnedItem.productName}
                                    {adjustment.returnedItem.size
                                      ? ` · T. ${adjustment.returnedItem.size}`
                                      : ''}
                                    {adjustment.returnedItem.color
                                      ? ` · ${adjustment.returnedItem.color}`
                                      : ''}
                                  </div>
                                  {adjustment.replacementItem && (
                                    <div>
                                      Salió: {adjustment.replacementItem.quantity}×{' '}
                                      {adjustment.replacementItem.productName}
                                      {adjustment.replacementItem.size
                                        ? ` · T. ${adjustment.replacementItem.size}`
                                        : ''}
                                      {adjustment.replacementItem.color
                                        ? ` · ${adjustment.replacementItem.color}`
                                        : ''}
                                    </div>
                                  )}
                                  <div className="mt-1 text-slate-500">
                                    {Math.abs(Number(adjustment.difference || 0)) < 0.01
                                      ? 'Sin diferencia'
                                      : Number(adjustment.difference || 0) > 0
                                        ? `Cobrado: $${money(Math.abs(Number(adjustment.difference || 0)))}`
                                        : `Devuelto al cliente: $${money(Math.abs(Number(adjustment.difference || 0)))}`}
                                    {' · '}Registrado por {adjustment.recordedByUserName}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAdjustmentReceipt({
                                        sale,
                                        adjustment,
                                      })
                                    }
                                    className="mt-1.5 text-[11px] font-bold text-indigo-700 hover:text-indigo-900"
                                  >
                                    Ver / reimprimir comprobante
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </Td>

                        <Td>
                          {paymentLabel(
                            sale.paymentMethod,
                          )}
                        </Td>

                        <Td align="right">
                          <span className="font-bold">
                            $
                            {money(
                              netTotal,
                            )}
                          </span>
                        </Td>

                        {isAdmin && (
                          <Td align="right">
                            <div className="font-semibold">
                              $
                              {money(
                                saleCost,
                              )}
                            </div>

                            {(estimated ||
                              missing) && (
                              <div className="text-[10px] text-amber-600">
                                {missing
                                  ? 'incompleto'
                                  : 'estimado'}
                              </div>
                            )}
                          </Td>
                        )}

                        <Td align="right">
                          $
                          {money(
                            saleCommission,
                          )}
                        </Td>

                        {isAdmin && (
                          <Td align="right">
                            <span
                              className={
                                contribution >=
                                0
                                  ? 'font-bold text-emerald-700'
                                  : 'font-bold text-red-600'
                              }
                            >
                              $
                              {money(
                                contribution,
                              )}
                            </span>
                          </Td>
                        )}

                        <Td align="right">
                          <button
                            type="button"
                            onClick={() =>
                              setAdjustmentSale(sale)
                            }
                            className="px-3 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <ArrowLeftRight size={15} />
                            Cambio / Devolución
                          </button>
                        </Td>
                      </tr>
                    );
                  },
                )}

                {!tableSales.length && (
                  <tr>
                    <td
                      colSpan={
                        isAdmin ? 10 : 8
                      }
                      className="p-10 text-center text-slate-400"
                    >
                      No hay ventas para los
                      filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'sales' && periodLegacyAdjustments.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-amber-100 bg-amber-50">
            <div className="font-bold text-amber-900 flex items-center gap-2">
              <History size={18} />
              Cambios / devoluciones de ventas anteriores al sistema
            </div>
            <div className="text-xs text-amber-700 mt-1">
              Estas operaciones no crean ventas históricas ni comisiones retroactivas. En el resultado global solo se considera la diferencia cobrada o devuelta ahora.
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <Th>Fecha</Th>
                  <Th>Cliente</Th>
                  <Th>Producto devuelto</Th>
                  <Th>Producto entregado</Th>
                  <Th align="right">Movimiento actual</Th>
                  <Th>Registrado por</Th>
                  <Th align="right">Comprobante</Th>
                </tr>
              </thead>
              <tbody>
                {periodLegacyAdjustments.map((adjustment) => (
                  <tr key={adjustment.id} className="border-b border-slate-100 last:border-b-0">
                    <Td>{formatDateTime(adjustment.timestamp)}</Td>
                    <Td>{adjustment.customerName || 'No informado'}</Td>
                    <Td>
                      <div className="font-semibold text-slate-800">
                        {adjustment.returnedItem.quantity} × {adjustment.returnedItem.productName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Reconocido: ${money(adjustment.returnedItem.totalAmount)} · {
                          adjustment.returnedProductCreatedInInventory
                            ? 'se reincorporó como producto nuevo'
                            : adjustment.returnedItem.returnToStock
                              ? 'volvió al stock'
                              : 'no volvió al stock'
                        }
                        {adjustment.returnedProductWasMissing ? ' · no existía en inventario' : ''}
                      </div>
                    </Td>
                    <Td>
                      {adjustment.replacementItem ? (
                        <>
                          <div className="font-semibold text-slate-800">
                            {adjustment.replacementItem.quantity} × {adjustment.replacementItem.productName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            ${money(adjustment.replacementItem.totalAmount)}
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-400">Solo devolución</span>
                      )}
                    </Td>
                    <Td align="right">
                      <span className={
                        Number(adjustment.difference || 0) > 0
                          ? 'font-bold text-emerald-700'
                          : Number(adjustment.difference || 0) < 0
                            ? 'font-bold text-red-600'
                            : 'font-bold text-slate-700'
                      }>
                        {Number(adjustment.difference || 0) > 0 ? '+' : ''}
                        ${money(Number(adjustment.difference || 0))}
                      </span>
                    </Td>
                    <Td>{adjustment.recordedByUserName}</Td>
                    <Td align="right">
                      <button
                        type="button"
                        onClick={() => setLegacyAdjustmentReceipt(adjustment)}
                        className="px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold"
                      >
                        Ver / imprimir
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'receivables' && (
        <AccountsReceivablePanel
          sales={sales}
          currentUser={currentUser}
          onUpdate={onUpdate}
        />
      )}

      {isAdmin &&
        tab === 'sellers' && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <div className="font-bold text-slate-800">
                Resultado por vendedor
              </div>

              <div className="text-xs text-slate-500 mt-1">
                Los gastos generales del
                negocio no se reparten entre
                vendedores.
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[950px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <Th>Vendedor</Th>
                    <Th align="right">
                      Ventas
                    </Th>
                    <Th align="right">
                      Unidades
                    </Th>
                    <Th align="right">
                      Ingresos
                    </Th>
                    <Th align="right">
                      Costo
                    </Th>
                    <Th align="right">
                      Margen
                    </Th>
                    <Th align="right">
                      Comisión
                    </Th>
                    <Th align="right">
                      Aporte
                    </Th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {sellerSummaries.map(
                    (seller) => (
                      <tr
                        key={
                          seller.userId
                        }
                        className="hover:bg-slate-50"
                      >
                        <Td>
                          <div className="font-bold">
                            {
                              seller.userName
                            }
                          </div>

                          {(seller.estimatedCostItems >
                            0 ||
                            seller.missingCostItems >
                              0) && (
                            <div className="text-[10px] text-amber-600">
                              costo histórico
                              parcialmente
                              estimado
                            </div>
                          )}
                        </Td>

                        <Td align="right">
                          {seller.tickets}
                        </Td>

                        <Td align="right">
                          {seller.units}
                        </Td>

                        <Td align="right">
                          $
                          {money(
                            seller.revenue,
                          )}
                        </Td>

                        <Td align="right">
                          $
                          {money(
                            seller.merchandiseCost,
                          )}
                        </Td>

                        <Td align="right">
                          $
                          {money(
                            seller.grossMargin,
                          )}
                        </Td>

                        <Td align="right">
                          $
                          {money(
                            seller.commissions,
                          )}
                        </Td>

                        <Td align="right">
                          <span
                            className={
                              seller.contribution >=
                              0
                                ? 'font-bold text-emerald-700'
                                : 'font-bold text-red-600'
                            }
                          >
                            $
                            {money(
                              seller.contribution,
                            )}
                          </span>
                        </Td>
                      </tr>
                    ),
                  )}

                  {!sellerSummaries.length && (
                    <tr>
                      <td
                        colSpan={8}
                        className="p-10 text-center text-slate-400"
                      >
                        No hay ventas en el
                        período seleccionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {isAdmin &&
        tab === 'expenses' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <div className="font-bold text-slate-800">
                  Gastos operativos
                </div>

                <div className="text-sm text-slate-500 mt-1">
                  Alquiler, energía,
                  personal, impuestos,
                  servicios y otros costos
                  del negocio.
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <select
                  value={
                    expenseCategoryFilter
                  }
                  onChange={(e) =>
                    setExpenseCategoryFilter(
                      e.target.value,
                    )
                  }
                  className="border border-slate-300 rounded-xl px-3 py-2.5 bg-white"
                >
                  <option value="ALL">
                    Todas las categorías
                  </option>

                  {(
                    Object.entries(
                      EXPENSE_LABELS,
                    ) as [
                      ExpenseCategory,
                      string,
                    ][]
                  ).map(
                    ([value, label]) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {label}
                      </option>
                    ),
                  )}
                </select>

                <button
                  type="button"
                  onClick={
                    exportExpensesCsv
                  }
                  disabled={
                    !visibleExpenses.length
                  }
                  className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-700 flex items-center gap-2 disabled:opacity-40"
                >
                  <Download
                    size={17}
                  />
                  CSV
                </button>

                <button
                  type="button"
                  onClick={
                    openNewExpense
                  }
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-2"
                >
                  <Plus size={18} />
                  Nuevo gasto
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex justify-between gap-4">
                <div>
                  <div className="text-xs uppercase font-bold text-slate-400">
                    Total gastos del
                    período
                  </div>

                  <div className="text-2xl font-black text-slate-900 mt-1">
                    $
                    {money(
                      periodExpenses.reduce(
                        (acc, e) =>
                          acc +
                          Number(
                            e.amount || 0,
                          ),
                        0,
                      ),
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs uppercase font-bold text-slate-400">
                    Registros visibles
                  </div>

                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {
                      visibleExpenses.length
                    }
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[850px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <Th>Período</Th>
                      <Th>Fecha pago</Th>
                      <Th>Categoría</Th>
                      <Th>Descripción</Th>
                      <Th>Notas</Th>
                      <Th align="right">Importe</Th>
                      <Th align="right">Acciones</Th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {visibleExpenses.map(
                      (expense) => (
                        <tr
                          key={
                            expense.id
                          }
                          className="hover:bg-slate-50"
                        >
                          <Td>
                            <div className="font-bold text-slate-800">
                              {new Date(
                                `${expense.periodMonth}-01T12:00:00`,
                              ).toLocaleDateString('es-AR', {
                                month: 'long',
                                year: 'numeric',
                              })}
                            </div>
                            {expense.createdAt && (
                              <div className="text-[10px] text-slate-400 mt-1">
                                Cargado {formatDate(expense.createdAt)}
                              </div>
                            )}
                          </Td>

                          <Td>
                            {expense.paymentDate
                              ? formatDate(expense.paymentDate)
                              : '—'}
                          </Td>

                          <Td>
                            <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                              {
                                EXPENSE_LABELS[
                                  expense
                                    .category
                                ]
                              }
                            </span>
                          </Td>

                          <Td>
                            <div className="font-medium">
                              {
                                expense.description
                              }
                            </div>

                            <div className="text-[10px] text-slate-400 mt-1">
                              Cargado por{' '}
                              {
                                expense.createdByUserName
                              }
                            </div>
                          </Td>

                          <Td>
                            <div className="text-sm text-slate-500 max-w-sm">
                              {expense.notes ||
                                '—'}
                            </div>
                          </Td>

                          <Td align="right">
                            <span className="font-bold">
                              $
                              {money(
                                expense.amount,
                              )}
                            </span>
                          </Td>

                          <Td align="right">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  openEditExpense(
                                    expense,
                                  )
                                }
                                className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-50"
                                title="Editar"
                              >
                                <Edit2
                                  size={
                                    17
                                  }
                                />
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void deleteExpense(
                                    expense,
                                  )
                                }
                                className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                                title="Eliminar"
                              >
                                <Trash2
                                  size={
                                    17
                                  }
                                />
                              </button>
                            </div>
                          </Td>
                        </tr>
                      ),
                    )}

                    {!visibleExpenses.length && (
                      <tr>
                        <td
                          colSpan={7}
                          className="p-10 text-center text-slate-400"
                        >
                          No hay gastos
                          cargados para este
                          período.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      {legacyAdjustmentOpen && (
        <LegacySaleAdjustmentModal
          currentUser={currentUser}
          onClose={() => setLegacyAdjustmentOpen(false)}
          onSaved={async () => {
            await Promise.resolve(onUpdate?.());
            const updated = await StorageService.getLegacySaleAdjustments();
            setLegacyAdjustments(updated);
          }}
        />
      )}

      {legacyAdjustmentReceipt && (
        <LegacySaleAdjustmentReceiptModal
          adjustment={legacyAdjustmentReceipt}
          onClose={() => setLegacyAdjustmentReceipt(null)}
        />
      )}

      {adjustmentSale && (
        <SaleAdjustmentModal
          sale={adjustmentSale}
          currentUser={currentUser}
          onClose={() => setAdjustmentSale(null)}
          onSaved={async () => {
            await Promise.resolve(onUpdate?.());
          }}
        />
      )}

      {adjustmentReceipt && (
        <SaleAdjustmentReceiptModal
          sale={adjustmentReceipt.sale}
          adjustment={adjustmentReceipt.adjustment}
          onClose={() => setAdjustmentReceipt(null)}
        />
      )}

      {isAdmin &&
        isExpenseModalOpen && (
          <div className="fixed inset-0 z-[10070] bg-black/60 flex items-center justify-center p-3 sm:p-4">
            <div className="w-full max-w-lg max-h-[94dvh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
              <div className="shrink-0 px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingExpense
                      ? 'Editar gasto'
                      : 'Nuevo gasto operativo'}
                  </h3>

                  <p className="text-xs text-slate-500 mt-1">
                    Elegí el mes al que corresponde. La fecha de carga no modifica
                    el período contable.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    closeExpenseModal
                  }
                  disabled={
                    isSavingExpense
                  }
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X size={21} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
                {expenseError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                    {expenseError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Mes al que corresponde
                  </label>

                  <input
                    type="month"
                    value={expensePeriodMonth}
                    onChange={(e) =>
                      setExpensePeriodMonth(e.target.value)
                    }
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5"
                  />

                  <p className="text-[11px] text-slate-400 mt-1">
                    Ejemplo: podés cargar en septiembre un alquiler que corresponde
                    a agosto.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Fecha de pago (opcional)
                  </label>

                  <input
                    type="date"
                    value={expensePaymentDate}
                    onChange={(e) =>
                      setExpensePaymentDate(e.target.value)
                    }
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5"
                  />

                  <p className="text-[11px] text-slate-400 mt-1">
                    Solo sirve como referencia; no cambia el mes al que se imputa.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Categoría
                  </label>

                  <select
                    value={
                      expenseCategory
                    }
                    onChange={(e) =>
                      setExpenseCategory(
                        e.target
                          .value as ExpenseCategory,
                      )
                    }
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5 bg-white"
                  >
                    {(
                      Object.entries(
                        EXPENSE_LABELS,
                      ) as [
                        ExpenseCategory,
                        string,
                      ][]
                    ).map(
                      ([
                        value,
                        label,
                      ]) => (
                        <option
                          key={
                            value
                          }
                          value={
                            value
                          }
                        >
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Descripción
                  </label>

                  <input
                    type="text"
                    value={
                      expenseDescription
                    }
                    onChange={(e) =>
                      setExpenseDescription(
                        e.target.value,
                      )
                    }
                    placeholder={
                      expenseCategory ===
                      'staff'
                        ? 'Ej.: Sueldo Juan - Agosto 2026'
                        : expenseCategory ===
                            'energy'
                          ? 'Ej.: Energía - Agosto 2026'
                          : expenseCategory ===
                              'rent'
                            ? 'Ej.: Alquiler - Agosto 2026'
                            : 'Detalle del gasto'
                    }
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Importe
                  </label>

                  <div className="relative">
                    <DollarSign
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        expenseAmount
                      }
                      onChange={(e) =>
                        setExpenseAmount(
                          e.target
                            .value,
                        )
                      }
                      className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 text-lg font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Notas opcionales
                  </label>

                  <textarea
                    value={
                      expenseNotes
                    }
                    onChange={(e) =>
                      setExpenseNotes(
                        e.target.value,
                      )
                    }
                    rows={3}
                    placeholder="Período, proveedor u otra información."
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5 resize-none"
                  />
                </div>
              </div>

              <div className="shrink-0 border-t border-slate-200 bg-white p-4 flex gap-2">
                <button
                  type="button"
                  onClick={
                    closeExpenseModal
                  }
                  disabled={
                    isSavingExpense
                  }
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void saveExpense()
                  }
                  disabled={
                    isSavingExpense
                  }
                  className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Save size={18} />
                  {isSavingExpense
                    ? 'Guardando…'
                    : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

const SummaryCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}> = ({
  label,
  value,
  sub,
  positive,
}) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
    <div className="text-[11px] uppercase tracking-wide font-bold text-slate-400">
      {label}
    </div>

    <div
      className={`text-xl sm:text-2xl font-black mt-1 ${
        positive === undefined
          ? 'text-slate-900'
          : positive
            ? 'text-emerald-700'
            : 'text-red-600'
      }`}
    >
      {value}
    </div>

    {sub && (
      <div className="text-[11px] text-slate-500 mt-1">
        {sub}
      </div>
    )}
  </div>
);

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
}> = ({
  active,
  onClick,
  label,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-4 py-2.5 rounded-xl font-semibold text-sm ${
      active
        ? 'bg-indigo-600 text-white'
        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
    }`}
  >
    {label}
  </button>
);

const Th: React.FC<{
  children: React.ReactNode;
  align?: 'left' | 'right';
}> = ({
  children,
  align = 'left',
}) => (
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
}> = ({
  children,
  align = 'left',
}) => (
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

export default SalesHistory;
