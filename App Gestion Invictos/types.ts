export type UserRole = 'admin' | 'seller';

export interface UserSecurity {
  failedAttempts: number;
  lockoutUntil: number | null;
  consecutiveLockouts: number;
  isPermanentlyBlocked: boolean;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  pin: string;
  commissionPercentage?: number;
  security?: UserSecurity;

  // Si el administrador blanqueó la clave, el usuario debe
  // cambiar el PIN temporal al volver a ingresar.
  mustChangePin?: boolean;
  pinUpdatedAt?: number;
}

export interface AppConfig {
  commissionPercentage: number;
}

export interface CategoryItem {
  id: string;
  name: string;
}

export interface ProviderContact {
  id: string;
  name: string;
  role?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  isPrimary?: boolean;
  notes?: string;
}

export interface ProviderItem {
  id: string;

  // Nombre comercial / empresa. Se conserva "name" para mantener
  // compatibilidad con los productos ya cargados.
  name: string;

  // Datos generales de la empresa
  taxId?: string;
  address?: string;
  city?: string;
  province?: string;
  website?: string;
  notes?: string;

  // Compatibilidad con registros antiguos
  contact?: string;

  // Uno o varios contactos de la empresa
  contacts?: ProviderContact[];

  createdAt?: number;
  updatedAt?: number;
}

export interface Product {
  id: string;
  code: string;

  // Código corto numérico usado por el QR y la búsqueda rápida.
  shortCode?: string;

  // Se conserva el código de barras largo por compatibilidad.
  barcode?: string;
  parentProductId?: string;

  name: string;
  category: string;
  provider: string;
  price: number;
  cost: number;
  stock: number;

  size?: string;
  color?: string;
  gender?: string;
  description?: string;

  // Aviso visible durante la venta: promociones, condiciones, advertencias, etc.
  salesNote?: string;

  minStock?: number;
  active?: boolean;
  createdAt?: number;
  updatedAt?: number;

  commissionPercentage?: number;
}

export type ItemDiscountType = 'percent' | 'amount';
export type PaymentMethod = 'cash' | 'debit' | 'card' | 'transfer' | 'account';
export type SalePaymentMethod = PaymentMethod | 'mixed';

export interface PaymentAllocation {
  method: PaymentMethod;
  amount: number;

  // Opcional para débito / tarjeta.
  receiptNumber?: string;
}

export interface ReceivablePayment {
  id: string;
  amount: number;
  timestamp: number;

  // Una deuda no puede pagarse nuevamente con "cuenta corriente".
  method: Exclude<PaymentMethod, 'account'>;

  receiptNumber?: string;
  notes?: string;

  recordedByUserId: string;
  recordedByUserName: string;
}

export interface ReceivableInstallment {
  id: string;
  number: number;
  dueDate: number;
  amount: number;
  paidAmount: number;
  payments?: ReceivablePayment[];
}

export interface Receivable {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;

  financedAmount: number;

  // Cantidad de días posteriores al vencimiento para comenzar a alertar.
  // 0 = avisar desde el día del vencimiento.
  reminderDaysAfterDue: number;

  installments: ReceivableInstallment[];
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  priceAtSale: number;

  // Costo unitario real del producto al momento de confirmar la venta.
  // Queda congelado para que un cambio de costo futuro no altere
  // la rentabilidad histórica.
  costAtSale?: number;

  // Total bruto de la línea antes del descuento.
  originalSubtotal?: number;

  // Descuento aplicado únicamente a este producto/línea.
  discountType?: ItemDiscountType;
  discountValue?: number;
  discountAmount?: number;

  // Total neto de la línea después del descuento.
  subtotal: number;

  commissionAmount?: number;

  productCode?: string;
  shortCode?: string;
  barcode?: string;
  size?: string;
  color?: string;

  // Copia del aviso que tenía el producto al momento de la venta.
  salesNote?: string;
}

export type SaleAdjustmentType = 'exchange' | 'return';

export interface SaleAdjustmentLine {
  // Identifica la línea dentro de la venta efectiva.
  // Las líneas originales usan orig-<indice>; los reemplazos tienen un id propio.
  lineId: string;

  productId: string;
  productName: string;
  productCode?: string;
  shortCode?: string;
  barcode?: string;
  size?: string;
  color?: string;

  quantity: number;
  unitAmount: number;
  totalAmount: number;
  costAtSale?: number;
}

export interface SaleReturnedLine extends SaleAdjustmentLine {
  sourceLineId: string;
  returnToStock: boolean;
}

export interface SaleAdjustmentSettlement {
  direction: 'charge' | 'refund' | 'none';
  amount: number;
  method?: Exclude<PaymentMethod, 'account'>;
  receiptNumber?: string;
}

export interface SaleAdjustment {
  id: string;
  type: SaleAdjustmentType;
  timestamp: number;

  returnedItem: SaleReturnedLine;
  replacementItem?: SaleAdjustmentLine;

  // Positivo: diferencia cobrada al cliente.
  // Negativo: devolución/saldo a favor del cliente.
  difference: number;
  settlement: SaleAdjustmentSettlement;

  notes?: string;
  recordedByUserId: string;
  recordedByUserName: string;

  // Ajuste de comisión generado por este movimiento.
  commissionAdjustment: number;
  commissionWasAlreadyPaid?: boolean;
}

export interface Sale {
  id: string;
  items: SaleItem[];

  // Suma bruta de todos los productos antes de descuentos por línea.
  subtotal: number;

  // Suma total de descuentos aplicados a los productos.
  discount: number;

  // Importe final de la venta.
  total: number;

  timestamp: number;

  // Cliente de la venta. Es opcional para ventas comunes.
  // Permite localizar rápidamente la operación ante cambios/devoluciones.
  customerName?: string;

  // Para ventas mixtas se guarda 'mixed' y el detalle queda en payments.
  paymentMethod: SalePaymentMethod;
  payments?: PaymentAllocation[];

  // Solo existe cuando parte o toda la venta queda a cuenta corriente.
  receivable?: Receivable;

  // Usuario al que se imputa la venta (quien realmente la realizó).
  userId: string;
  userName: string;

  // Trazabilidad de la carga administrativa.
  recordedAt?: number;
  recordedByUserId?: string;
  recordedByUserName?: string;

  commissionPaid?: boolean;
  commissionPaidDate?: number;

  // Cambios/devoluciones vinculados a la venta original.
  adjustments?: SaleAdjustment[];

  // Base histórica para recalcular comisión sin perder la tasa original.
  commissionBaseAmount?: number;
  commissionBaseItemAmounts?: number[];
  commissionAdjustmentTotal?: number;
}

export type ExpenseCategory =
  | 'rent'
  | 'energy'
  | 'staff'
  | 'taxes'
  | 'services'
  | 'marketing'
  | 'transport'
  | 'maintenance'
  | 'other';

export interface Expense {
  id: string;

  // Mes contable al que corresponde el gasto, formato YYYY-MM.
  // Ej.: una factura pagada en septiembre puede imputarse a agosto.
  periodMonth: string;

  // Fecha real de pago, solo informativa. Puede quedar vacía.
  paymentDate?: number;

  category: ExpenseCategory;
  description: string;
  amount: number;
  notes?: string;

  createdByUserId: string;
  createdByUserName: string;

  // Fecha/hora real en que se cargó el registro en INVICTOS.
  createdAt?: number;
  updatedAt?: number;
}

export type InventoryMovementType =
  | 'INITIAL'
  | 'PURCHASE'
  | 'SALE'
  | 'ADJUSTMENT'
  | 'RETURN'
  | 'CANCELLED_SALE';

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  barcode?: string;
  size?: string;
  color?: string;

  type: InventoryMovementType;
  quantityChange: number;
  previousStock: number;
  newStock: number;

  timestamp: number;
  userId?: string;
  userName?: string;
  referenceId?: string;
  note?: string;
  unitCost?: number;
}

export interface DashboardStats {
  totalRevenue: number;
  totalSalesCount: number;
  lowStockCount: number;
  topSellingCategory: string;
}
