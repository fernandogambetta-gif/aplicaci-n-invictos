import { Product, Sale, User, AppConfig, CategoryItem } from '../types';

// Keys for localStorage
const PRODUCTS_KEY = 'invictos_products';
const SALES_KEY = 'invictos_sales';
const USERS_KEY = 'invictos_users';
const CONFIG_KEY = 'invictos_config';
const CATEGORIES_KEY = 'invictos_categories';

// Helper to get timestamps for past days
const daysAgo = (days: number) => Date.now() - (days * 24 * 60 * 60 * 1000);

// Initial Users
const INITIAL_USERS: User[] = [
  { id: 'u1', name: 'Administrador', role: 'admin', pin: '1234' },
  { id: 'u2', name: 'Vendedor 1', role: 'seller', pin: '0000', commissionPercentage: 3 },
  { id: 'u3', name: 'Vendedor 2', role: 'seller', pin: '1111' },
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

export const StorageService = {
  getUsers: (): User[] => {
    const data = localStorage.getItem(USERS_KEY);
    if (!data) {
      localStorage.setItem(USERS_KEY, JSON.stringify(INITIAL_USERS));
      return INITIAL_USERS;
    }
    return JSON.parse(data);
  },

  addUser: (user: User): void => {
    const users = StorageService.getUsers();
    users.push(user);
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

  deleteUser: (userId: string): void => {
      const users = StorageService.getUsers().filter(u => u.id !== userId);
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  getConfig: (): AppConfig => {
    const data = localStorage.getItem(CONFIG_KEY);
    if (!data) {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(INITIAL_CONFIG));
        return INITIAL_CONFIG;
    }
    return JSON.parse(data);
  },

  saveConfig: (config: AppConfig): void => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  },

  getCategories: (): CategoryItem[] => {
    const data = localStorage.getItem(CATEGORIES_KEY);
    if (!data) {
        localStorage.setItem(CATEGORIES_KEY, JSON.stringify(INITIAL_CATEGORIES));
        return INITIAL_CATEGORIES;
    }
    return JSON.parse(data);
  },

  saveCategory: (category: CategoryItem): void => {
    const categories = StorageService.getCategories();
    // Check if exists update, else add
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

  getProducts: (): Product[] => {
    const data = localStorage.getItem(PRODUCTS_KEY);
    if (!data) {
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(INITIAL_PRODUCTS));
      return INITIAL_PRODUCTS;
    }
    return JSON.parse(data);
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
    const data = localStorage.getItem(SALES_KEY);
    if (!data) {
        localStorage.setItem(SALES_KEY, JSON.stringify(INITIAL_SALES));
        return INITIAL_SALES;
    }
    return JSON.parse(data);
  },

  addSale: (sale: Sale): void => {
    const sales = StorageService.getSales();
    sales.push(sale);
    localStorage.setItem(SALES_KEY, JSON.stringify(sales));

    // Update stock for each item sold
    sale.items.forEach(item => {
      StorageService.updateStock(item.productId, -item.quantity);
    });
  },

  markCommissionsAsPaid: (saleIds: string[]): void => {
      const sales = StorageService.getSales();
      // Force string conversion for robust comparison
      const idsSet = new Set(saleIds.map(id => String(id)));
      
      const updatedSales = sales.map(sale => {
          if (idsSet.has(String(sale.id))) {
              return { ...sale, commissionPaid: true, commissionPaidDate: Date.now() };
          }
          return sale;
      });
      localStorage.setItem(SALES_KEY, JSON.stringify(updatedSales));
  },

  resetData: () => {
    localStorage.removeItem(PRODUCTS_KEY);
    localStorage.removeItem(SALES_KEY);
    localStorage.removeItem(USERS_KEY);
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(CATEGORIES_KEY);
    window.location.reload();
  }
};