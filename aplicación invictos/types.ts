export type UserRole = 'admin' | 'seller';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  pin: string;
  commissionPercentage?: number;
}

export interface AppConfig {
  commissionPercentage: number;
}

export interface CategoryItem {
  id: string;
  name: string;
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
  commissionPercentage?: number;
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
  total: number;
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