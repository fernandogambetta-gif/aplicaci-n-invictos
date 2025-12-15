
export type UserRole = 'admin' | 'seller';

export interface UserSecurity {
  failedAttempts: number;
  lockoutUntil: number | null; // Timestamp
  consecutiveLockouts: number;
  isPermanentlyBlocked: boolean;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  pin: string;
  commissionPercentage?: number;
  security?: UserSecurity; // New security field
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
  name: string;
  category: string;
  provider: string;
  price: number;
  cost: number;
  stock: number;
  description?: string;
  // ❌ commissionPercentage NO va acá
}


export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  priceAtSale: number;
  subtotal: number;
  commissionAmount?: number;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  subtotal: number; // Suma de los items antes de descuento
  discount: number; // Monto descontado
  total: number; // Total final pagado
  timestamp: number;
  paymentMethod: 'cash' | 'card' | 'transfer';
  userId: string;
  userName: string;
  commissionPaid?: boolean; // Nuevo: Estado de pago de la comisión
  commissionPaidDate?: number; // Nuevo: Fecha en que se pagó la comisión
}

export interface DashboardStats {
  totalRevenue: number;
  totalSalesCount: number;
  lowStockCount: number;
  topSellingCategory: string;
}
