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
}

export interface AppConfig {
  commissionPercentage: number;
}

export interface CategoryItem {
  id: string;
  name: string;
}

export interface ProviderItem {
  id: string;
  name: string;
  contact?: string;
}

export interface Product {
  id: string;
  code: string;
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

  minStock?: number;
  active?: boolean;
  createdAt?: number;
  updatedAt?: number;

  // Compatibilidad con Inventory.tsx actual
  commissionPercentage?: number;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  priceAtSale: number;
  subtotal: number;
  commissionAmount?: number;

  productCode?: string;
  barcode?: string;
  size?: string;
  color?: string;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  timestamp: number;
  paymentMethod: 'cash' | 'card' | 'transfer';
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
