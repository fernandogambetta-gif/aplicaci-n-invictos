import { Product, Sale, User, AppConfig, CategoryItem, ProviderItem, UserSecurity } from '../types';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';

// 🔹 Helper: quita todas las propiedades con valor undefined
const cleanData = <T extends Record<string, any>>(data: T): T => {
  return Object.fromEntries(
    Object.entries(data).filter(([_, v]) => v !== undefined)
  ) as T;
};

// Collections
const COLLECTIONS = {
  PRODUCTS: 'products',
  SALES: 'sales',
  USERS: 'users',
  CONFIG: 'config', // doc id: 'main'
  CATEGORIES: 'categories',
  PROVIDERS: 'providers',
};

const DEFAULT_SECURITY: UserSecurity = {
  failedAttempts: 0,
  lockoutUntil: null,
  consecutiveLockouts: 0,
  isPermanentlyBlocked: false,
};

const INITIAL_USERS: User[] = [
  { id: 'u1', name: 'Administrador', role: 'admin', pin: '1234', security: DEFAULT_SECURITY },
  { id: 'u2', name: 'Vendedor 1', role: 'seller', pin: '0000', commissionPercentage: 3, security: DEFAULT_SECURITY },
];

// --- HELPER TO MAP FIRESTORE DOCS ---
const mapDocs = <T>(snapshot: any): T[] => {
  return snapshot.docs.map((d: any) => ({ ...d.data(), id: d.id })) as T[];
};

export const StorageService = {
  // --- USERS ---
  getUsers: async (): Promise<User[]> => {
    if (!db) return INITIAL_USERS;
    const snap = await getDocs(collection(db, COLLECTIONS.USERS));
    const users = mapDocs<User>(snap);

    if (users.length === 0) {
      await Promise.all(
        INITIAL_USERS.map((u) =>
          setDoc(doc(db, COLLECTIONS.USERS, u.id), cleanData(u))
        )
      );
      return INITIAL_USERS;
    }
    return users.map((u) => ({ ...u, security: u.security || { ...DEFAULT_SECURITY } }));
  },

  addUser: async (user: User): Promise<void> => {
    if (!db) return;
    await setDoc(
      doc(db, COLLECTIONS.USERS, user.id),
      cleanData({ ...user, security: { ...DEFAULT_SECURITY } })
    );
  },

  updateUser: async (updatedUser: User): Promise<void> => {
    if (!db) return;
    await setDoc(
      doc(db, COLLECTIONS.USERS, updatedUser.id),
      cleanData(updatedUser),
      { merge: true }
    );
  },

  deleteUser: async (userId: string): Promise<void> => {
    if (!db) return;
    await deleteDoc(doc(db, COLLECTIONS.USERS, userId));
  },

  // --- SECURITY ---
  recordFailedAttempt: async (userId: string): Promise<User | null> => {
    if (!db) return null;

    const userRef = doc(db, COLLECTIONS.USERS, userId);
    const users = await StorageService.getUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) return null;

    user.security = user.security || { ...DEFAULT_SECURITY };
    user.security.failedAttempts += 1;

    if (user.security.failedAttempts >= 3) {
      user.security.lockoutUntil = Date.now() + 5 * 60 * 1000;
      user.security.consecutiveLockouts += 1;
      user.security.failedAttempts = 0;

      if (user.security.consecutiveLockouts >= 3) {
        user.security.isPermanentlyBlocked = true;
        user.security.lockoutUntil = null;
      }
    }

    await updateDoc(userRef, cleanData({ security: user.security }));
    return user;
  },

  resetAttempts: async (userId: string) => {
    if (!db) return;
    const userRef = doc(db, COLLECTIONS.USERS, userId);
    await updateDoc(userRef, cleanData({ security: { ...DEFAULT_SECURITY } }));
  },

  unlockUser: async (userId: string) => {
    if (!db) return;
    const userRef = doc(db, COLLECTIONS.USERS, userId);
    await updateDoc(userRef, cleanData({ security: { ...DEFAULT_SECURITY } }));
  },

  // --- CONFIG ---
  getConfig: async (): Promise<AppConfig> => {
    if (!db) return { commissionPercentage: 5 };
    const snap = await getDocs(collection(db, COLLECTIONS.CONFIG));
    if (snap.empty) return { commissionPercentage: 5 };
    return snap.docs[0].data() as AppConfig;
  },

  saveConfig: async (config: AppConfig): Promise<void> => {
    if (!db) return;
    await setDoc(
      doc(db, COLLECTIONS.CONFIG, 'main'),
      cleanData(config)
    );
  },

  // --- CATEGORIES ---
  getCategories: async (): Promise<CategoryItem[]> => {
    if (!db) return [];
    const snap = await getDocs(collection(db, COLLECTIONS.CATEGORIES));
    return mapDocs<CategoryItem>(snap);
  },

  saveCategory: async (category: CategoryItem): Promise<void> => {
    if (!db) return;
    await setDoc(
      doc(db, COLLECTIONS.CATEGORIES, category.id),
      cleanData(category)
    );
  },

  deleteCategory: async (id: string): Promise<void> => {
    if (!db) return;
    await deleteDoc(doc(db, COLLECTIONS.CATEGORIES, id));
  },

  // --- PROVIDERS ---
  getProviders: async (): Promise<ProviderItem[]> => {
    if (!db) return [];
    const snap = await getDocs(collection(db, COLLECTIONS.PROVIDERS));
    return mapDocs<ProviderItem>(snap);
  },

  saveProvider: async (provider: ProviderItem): Promise<void> => {
    if (!db) return;
    await setDoc(
      doc(db, COLLECTIONS.PROVIDERS, provider.id),
      cleanData(provider)
    );
  },

  deleteProvider: async (id: string): Promise<void> => {
    if (!db) return;
    await deleteDoc(doc(db, COLLECTIONS.PROVIDERS, id));
  },

  // --- PRODUCTS ---
  getProducts: async (): Promise<Product[]> => {
    if (!db) return [];
    const snap = await getDocs(collection(db, COLLECTIONS.PRODUCTS));
    return mapDocs<Product>(snap);
  },

  saveProduct: async (product: Product): Promise<void> => {
    if (!db) return;
    // 🔹 Limpiamos cualquier campo extra / undefined (como commissionPercentage)
    const safeProduct = cleanData(product as any);
    await setDoc(
      doc(db, COLLECTIONS.PRODUCTS, product.id),
      safeProduct
    );
  },

  deleteProduct: async (id: string): Promise<void> => {
    if (!db) return;
    await deleteDoc(doc(db, COLLECTIONS.PRODUCTS, id));
  },

  updateStock: async (productId: string, quantityChange: number): Promise<void> => {
    if (!db) return;
    const prodRef = doc(db, COLLECTIONS.PRODUCTS, productId);
    const products = await StorageService.getProducts();
    const product = products.find((p) => p.id === productId);
    if (product) {
      await updateDoc(
        prodRef,
        cleanData({ stock: product.stock + quantityChange })
      );
    }
  },

  // --- SALES ---
  getSales: async (): Promise<Sale[]> => {
    if (!db) return [];
    const snap = await getDocs(collection(db, COLLECTIONS.SALES));
    return mapDocs<Sale>(snap).sort((a, b) => b.timestamp - a.timestamp);
  },

  addSale: async (sale: Sale): Promise<void> => {
    if (!db) return;

    // 🔹 Limpiamos posibles commissionAmount undefined en items, etc.
    const safeSale: Sale = {
      ...sale,
      items: sale.items.map((item) => cleanData(item)) as any,
    };

    await setDoc(
      doc(db, COLLECTIONS.SALES, sale.id),
      cleanData(safeSale as any)
    );

    for (const item of sale.items) {
      await StorageService.updateStock(item.productId, -item.quantity);
    }
  },

  markCommissionsAsPaid: async (saleIds: string[]): Promise<void> => {
    if (!db) return;
    const batchPromises = saleIds.map((id) =>
      updateDoc(
        doc(db, COLLECTIONS.SALES, id),
        cleanData({
          commissionPaid: true,
          commissionPaidDate: Date.now(),
        })
      )
    );
    await Promise.all(batchPromises);
  },

  // --- EXPORT HELPERS ---
  exportSalesToCSV: (sales: Sale[]) => {
    if (!sales.length) return;
    const headers = ['ID Venta,Fecha,Vendedor,Producto,Cantidad,Precio Unitario,Subtotal,Total Venta,Metodo Pago'];
    const rows = sales.flatMap((sale) => {
      return sale.items.map((item) => {
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
    const rows = products.map((p) => {
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
    if (
      confirm(
        "Al usar Base de Datos en la Nube, 'resetear' datos locales no elimina la base de datos real. Debes borrar las colecciones en Firebase Console.",
      )
    ) {
      window.location.reload();
    }
  },
};

