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
export type PaymentMethod = 'cash' | 'card' | 'transfer';
export type SalePaymentMethod = PaymentMethod | 'mixed';

export interface PaymentAllocation {
  method: PaymentMethod;
  amount: number;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  priceAtSale: number;

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

  // Para ventas mixtas se guarda 'mixed' y el detalle queda en payments.
  paymentMethod: SalePaymentMethod;
  payments?: PaymentAllocation[];

  userId: string;
  userName: string;
  commissionPaid?: boolean;
  commissionPaidDate?: number;
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
