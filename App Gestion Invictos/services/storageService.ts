
import { Product, Sale, User, AppConfig, CategoryItem, ProviderItem, UserSecurity } from '../types';

// Keys for localStorage
const PRODUCTS_KEY = 'invictos_products';
const SALES_KEY = 'invictos_sales';
const USERS_KEY = 'invictos_users';
const CONFIG_KEY = 'invictos_config';
const CATEGORIES_KEY = 'invictos_categories';
const PROVIDERS_KEY = 'invictos_providers';

// Helper to get timestamps for past days
const daysAgo = (days: number) => Date.now() - (days * 24 * 60 * 60 * 1000);

const DEFAULT_SECURITY: UserSecurity = {
  failedAttempts: 0,
  lockoutUntil: null,
  consecutiveLockouts: 0,
  isPermanentlyBlocked: false
};

// Initial Users
const INITIAL_USERS: User[] = [
  { id: 'u1', name: 'Administrador', role: 'admin', pin: '1234', security: DEFAULT_SECURITY },
  { id: 'u2', name: 'Vendedor 1', role: 'seller', pin: '0000', commissionPercentage: 3, security: DEFAULT_SECURITY },
  { id: 'u3', name: 'Vendedor 2', role: 'seller', pin: '1111', security: DEFAULT_SECURITY },
];

const INITIAL_CONFIG: AppConfig = {
  commissionPercentage: 5,
};

const INITIAL_CATEGORIES: CategoryItem[] = [
  { id: 'c1', name: 'Jerseys' },
  { id: 'c2', name: 'Shorts' },
  { id: 'c3', name: 'Calzado' },
  { id: 'c4', name: 'Accesorios' },
  { id: 'c5', name: 'Equipamiento' },
];

const INITIAL_PROVIDERS: ProviderItem[] = [
  { id: 'p1', name: 'Adidas Oficial' },
  { id: 'p2', name: 'Importadora Depor' },
  { id: 'p3', name: 'Nike Dist' },
  { id: 'p4', name: 'Textil Local' },
];

const INITIAL_PRODUCTS: Product[] = [
  { id: '1', code: 'J-ARG-24', name: 'Camiseta Selección Arg 2024', category: 'Jerseys', provider: 'Adidas Oficial', price: 65000, cost: 40000, stock: 15, description: 'Titular oficial' },
  { id: '2', code: 'S-RUN-01', name: 'Short Deportivo Running', category: 'Shorts', provider: 'Importadora Depor', price: 25000, cost: 12000, stock: 8, description: 'Tela dry-fit' },
  { id: '3', code: 'Z-RUN-X', name: 'Zapatillas Runner X', category: 'Calzado', provider: 'Nike Dist', price: 120000, cost: 80000, stock: 4, description: 'Alta performance', commissionPercentage: 10 },
  { id: '4', code: 'A-SOC-03', name: 'Medias 3/4 Pack x3', category: 'Accesorios', provider: 'Textil Local', price: 8000, cost: 3000, stock: 50 },
  { id: '5', code: 'E-BAL-PRO', name: 'Pelota Fútbol Pro', category: 'Equipamiento', provider: 'Adidas Oficial', price: 45000, cost: 25000, stock: 2 },
];

const INITIAL_SALES: Sale[] = [
  {
    id: 's1',
    timestamp: daysAgo(0),
    subtotal: 90000,
    discount: 0,
    total: 90000,
    paymentMethod: 'card',
    userId: 'u1',
    userName: 'Administrador',
    commissionPaid: false,
    items: [
      { productId: '1', productName: 'Camiseta Selección Arg 2024', quantity: 1, priceAtSale: 65000, subtotal: 65000, commissionAmount: 3250 },
      { productId: '2', productName: 'Short Deportivo Running', quantity: 1, priceAtSale: 25000, subtotal: 25000, commissionAmount: 1250 }
    ]
  },
  {
    id: 's2',
    timestamp: daysAgo(1),
    subtotal: 120000,
    discount: 0,
    total: 120000,
    paymentMethod: 'cash',
    userId: 'u2',
    userName: 'Vendedor 1',
    commissionPaid: true, // Ejemplo pagado
    commissionPaidDate: daysAgo(0),
    items: [
       { productId: '3', productName: 'Zapatillas Runner X', quantity: 1, priceAtSale: 120000, subtotal: 120000, commissionAmount: 12000 }
    ]
  },
  {
    id: 's3',
    timestamp: daysAgo(2),
    subtotal: 16000,
    discount: 0,
    total: 16000,
    paymentMethod: 'cash',
    userId: 'u3',
    userName: 'Vendedor 2',
    commissionPaid: false,
    items: [
       { productId: '4', productName: 'Medias 3/4 Pack x3', quantity: 2, priceAtSale: 8000, subtotal: 16000, commissionAmount: 800 }
    ]
  }
];

// Robust helper to parse JSON with fallback
const safeGet = <T>(key: string, initial: T): T => {
  try {
    const data = localStorage.getItem(key);
    if (!data) {
      localStorage.setItem(key, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(data);
    return parsed === null ? initial : parsed;
  } catch (error) {
    console.warn(`Data corruption detected for ${key}. Resetting to defaults.`, error);
    localStorage.setItem(key, JSON.stringify(initial));
    return initial;
  }
};

export const StorageService = {
  getUsers: (): User[] => {
      const users = safeGet(USERS_KEY, INITIAL_USERS);
      const safeUsers = Array.isArray(users) ? users : INITIAL_USERS;
      // Ensure all users have security object
      return safeUsers.map(u => ({
          ...u,
          security: u.security || { ...DEFAULT_SECURITY }
      }));
  },

  addUser: (user: User): void => {
    const users = StorageService.getUsers();
    users.push({ ...user, security: { ...DEFAULT_SECURITY } });
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  updateUser: (updatedUser: User): void => {
    const users = StorageService.getUsers();
    const index = users.findIndex(u => u.id === updatedUser.id);
    if (index !== -1) {
      users[index] = updatedUser;
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
  },

  // SECURITY METHODS
  recordFailedAttempt: (userId: string) => {
    const users = StorageService.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) return;

    const user = users[index];
    user.security = user.security || { ...DEFAULT_SECURITY };
    
    user.security.failedAttempts += 1;

    // Check Logic: 3 strikes = temporary block
    if (user.security.failedAttempts >= 3) {
       user.security.lockoutUntil = Date.now() + (5 * 60 * 1000); // 5 minutes
       user.security.consecutiveLockouts += 1;
       user.security.failedAttempts = 0; // Reset attempts for next cycle

       // Check Logic: 3 consecutive lockouts = permaban
       if (user.security.consecutiveLockouts >= 3) {
           user.security.isPermanentlyBlocked = true;
           user.security.lockoutUntil = null; // Permanent
       }
    }

    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    return user;
  },

  resetAttempts: (userId: string) => {
    const users = StorageService.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) return;

    const user = users[index];
    // Full Reset on success
    user.security = { ...DEFAULT_SECURITY };
    
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  unlockUser: (userId: string) => {
      // Used by Admin Recovery
      const users = StorageService.getUsers();
      const index = users.findIndex(u => u.id === userId);
      if (index === -1) return;

      users[index].security = { ...DEFAULT_SECURITY };
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  deleteUser: (userId: string): void => {
      const users = StorageService.getUsers().filter(u => u.id !== userId);
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  getConfig: (): AppConfig => safeGet(CONFIG_KEY, INITIAL_CONFIG),

  saveConfig: (config: AppConfig): void => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  },

  getCategories: (): CategoryItem[] => {
      const cats = safeGet(CATEGORIES_KEY, INITIAL_CATEGORIES);
      return Array.isArray(cats) ? cats : INITIAL_CATEGORIES;
  },

  saveCategory: (category: CategoryItem): void => {
    const categories = StorageService.getCategories();
    const idx = categories.findIndex(c => c.id === category.id);
    if (idx >= 0) {
        categories[idx] = category;
    } else {
        categories.push(category);
    }
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  },

  deleteCategory: (id: string): void => {
      const categories = StorageService.getCategories().filter(c => c.id !== id);
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  },

  getProviders: (): ProviderItem[] => {
      const providers = safeGet(PROVIDERS_KEY, INITIAL_PROVIDERS);
      return Array.isArray(providers) ? providers : INITIAL_PROVIDERS;
  },

  saveProvider: (provider: ProviderItem): void => {
    const providers = StorageService.getProviders();
    const idx = providers.findIndex(p => p.id === provider.id);
    if (idx >= 0) {
        providers[idx] = provider;
    } else {
        providers.push(provider);
    }
    localStorage.setItem(PROVIDERS_KEY, JSON.stringify(providers));
  },

  deleteProvider: (id: string): void => {
      const providers = StorageService.getProviders().filter(p => p.id !== id);
      localStorage.setItem(PROVIDERS_KEY, JSON.stringify(providers));
  },

  getProducts: (): Product[] => {
      const prods = safeGet(PRODUCTS_KEY, INITIAL_PRODUCTS);
      if (!Array.isArray(prods)) return INITIAL_PRODUCTS;
      return prods.filter(p => p && typeof p === 'object').map(p => ({
          ...p,
          stock: typeof p.stock === 'number' ? p.stock : 0,
          price: typeof p.price === 'number' ? p.price : 0,
          cost: typeof p.cost === 'number' ? p.cost : 0
      }));
  },

  saveProduct: (product: Product): void => {
    const products = StorageService.getProducts();
    const existingIndex = products.findIndex(p => p.id === product.id);
    
    if (existingIndex >= 0) {
      products[existingIndex] = product;
    } else {
      products.push(product);
    }
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  },

  deleteProduct: (id: string): void => {
    const products = StorageService.getProducts().filter(p => p.id !== id);
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  },

  updateStock: (productId: string, quantityChange: number): void => {
    const products = StorageService.getProducts();
    const product = products.find(p => p.id === productId);
    if (product) {
      product.stock += quantityChange;
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
    }
  },

  getSales: (): Sale[] => {
      const sales = safeGet(SALES_KEY, INITIAL_SALES);
      if (!Array.isArray(sales)) return INITIAL_SALES;
      
      return sales.filter(s => s && typeof s === 'object').map(s => ({
          ...s,
          items: Array.isArray(s.items) ? s.items : [],
          total: typeof s.total === 'number' ? s.total : 0,
          timestamp: s.timestamp || Date.now(),
          userId: s.userId || 'unknown',
          userName: s.userName || 'Desconocido'
      }));
  },

  addSale: (sale: Sale): void => {
    const sales = StorageService.getSales();
    sales.push(sale);
    localStorage.setItem(SALES_KEY, JSON.stringify(sales));

    if (Array.isArray(sale.items)) {
        sale.items.forEach(item => {
            StorageService.updateStock(item.productId, -item.quantity);
        });
    }
  },

  markCommissionsAsPaid: (saleIds: string[]): void => {
      const sales = StorageService.getSales();
      const idsSet = new Set(saleIds.map(id => String(id)));
      
      const updatedSales = sales.map(sale => {
          if (idsSet.has(String(sale.id))) {
              return { ...sale, commissionPaid: true, commissionPaidDate: Date.now() };
          }
          return sale;
      });
      localStorage.setItem(SALES_KEY, JSON.stringify(updatedSales));
  },

  // EXPORT FUNCTIONS
  exportSalesToCSV: (sales: Sale[]) => {
      if (!sales.length) return;
      
      const headers = ['ID Venta,Fecha,Vendedor,Producto,Cantidad,Precio Unitario,Subtotal,Total Venta,Metodo Pago'];
      const rows = sales.flatMap(sale => {
          return sale.items.map(item => {
              const date = new Date(sale.timestamp).toLocaleString().replace(',', '');
              return `${sale.id},"${date}","${sale.userName}","${item.productName}",${item.quantity},${item.priceAtSale},${item.subtotal},${sale.total},${sale.paymentMethod}`;
          });
      });

      const csvContent = headers.concat(rows).join('\n');
      StorageService.downloadCSV(csvContent, 'reporte_ventas.csv');
  },

  exportInventoryToCSV: (products: Product[]) => {
      if (!products.length) return;

      const headers = ['Codigo,Producto,Categoria,Proveedor,Costo,Precio,Stock,Descripcion'];
      const rows = products.map(p => {
          return `${p.code},"${p.name}","${p.category}","${p.provider}",${p.cost},${p.price},${p.stock},"${p.description || ''}"`;
      });

      const csvContent = headers.concat(rows).join('\n');
      StorageService.downloadCSV(csvContent, 'inventario_invictos.csv');
  },

  downloadCSV: (content: string, fileName: string) => {
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  },

  resetData: () => {
    localStorage.removeItem(PRODUCTS_KEY);
    localStorage.removeItem(SALES_KEY);
    localStorage.removeItem(USERS_KEY);
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(CATEGORIES_KEY);
    localStorage.removeItem(PROVIDERS_KEY);
    window.location.reload();
  }
};
