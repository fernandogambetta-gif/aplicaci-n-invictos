import { Product, Sale, User, AppConfig, CategoryItem, ProviderItem, UserSecurity } from '../types';
import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
} from 'firebase/firestore';
import { db } from './firebase';

// 🔧 Helper para eliminar campos undefined antes de guardar en Firestore
const cleanData = (data: any): any => {
  if (data === null || typeof data !== 'object') return data;
  const clone: any = Array.isArray(data) ? [...data] : { ...data };

  Object.keys(clone).forEach((key) => {
    const value = clone[key];
    if (value === undefined) {
      delete clone[key];
    } else if (typeof value === 'object' && value !== null) {
      clone[key] = cleanData(value);
    }
  });

  return clone;
};

// 🔐 Colecciones Firestore (case-sensitive)
const COLLECTIONS = {
  PRODUCTS: 'products',
  SALES: 'sales',
  USERS: 'users',
  CONFIG: 'config', // doc id: 'main'
  CATEGORIES: 'categories',
  PROVIDERS: 'providers',
};

// 🔐 Seguridad por defecto
const DEFAULT_SECURITY: UserSecurity = {
  failedAttempts: 0,
  lockoutUntil: null,
  consecutiveLockouts: 0,
  isPermanentlyBlocked: false,
};

// --- HELPER TO MAP FIRESTORE DOCS ---
const mapDocs = <T>(snapshot: any): T[] =>
  snapshot.docs.map((d: any) => ({ ...d.data(), id: d.id })) as T[];

// --- LOG DE CONEXIÓN (solo diagnóstico) ---
const logFirestoreInfo = () => {
  try {
    console.log('🔥 Firestore conectado a:', {
      projectId: (db as any)?.app?.options?.projectId,
      authDomain: (db as any)?.app?.options?.authDomain,
    });
  } catch {
    /* noop */
  }
};

export const StorageService = {
  // ================= USERS =================
  getUsers: async (): Promise<User[]> => {
    if (!db) {
      console.error('❌ Firestore no inicializado');
      return [];
    }

    try {
      logFirestoreInfo();

      const snap = await getDocs(collection(db, COLLECTIONS.USERS));
      console.log(`📦 Usuarios encontrados: ${snap.size}`);

      return mapDocs<User>(snap).map((u) => ({
        ...u,
        security: u.security || { ...DEFAULT_SECURITY },
      }));
    } catch (e: any) {
      console.error('❌ Error leyendo users:', e?.code || e);
      throw e;
    }
  },

  addUser: async (user: User): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await setDoc(
      doc(db, COLLECTIONS.USERS, user.id),
      cleanData({ ...user, security: { ...DEFAULT_SECURITY } }),
    );
  },

  updateUser: async (updatedUser: User): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await setDoc(
      doc(db, COLLECTIONS.USERS, updatedUser.id),
      cleanData(updatedUser),
      { merge: true },
    );
  },

  deleteUser: async (userId: string): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await deleteDoc(doc(db, COLLECTIONS.USERS, userId));
  },

  // ================= SECURITY =================
  recordFailedAttempt: async (userId: string): Promise<User | null> => {
    if (!db) throw new Error('Firestore no inicializado');

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

    await updateDoc(userRef, { security: cleanData(user.security) });
    return user;
  },

  resetAttempts: async (userId: string) => {
    if (!db) throw new Error('Firestore no inicializado');
    await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
      security: cleanData(DEFAULT_SECURITY),
    });
  },

  unlockUser: async (userId: string) => {
    if (!db) throw new Error('Firestore no inicializado');
    await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
      security: cleanData(DEFAULT_SECURITY),
    });
  },

  // ================= CONFIG =================
  getConfig: async (): Promise<AppConfig> => {
    if (!db) return { commissionPercentage: 5 };
    const snap = await getDoc(doc(db, COLLECTIONS.CONFIG, 'main'));
    return snap.exists() ? (snap.data() as AppConfig) : { commissionPercentage: 5 };
  },

  saveConfig: async (config: AppConfig): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await setDoc(doc(db, COLLECTIONS.CONFIG, 'main'), cleanData(config), {
      merge: true,
    });
  },

  // ================= CATEGORIES =================
  getCategories: async (): Promise<CategoryItem[]> => {
    if (!db) return [];
    const snap = await getDocs(collection(db, COLLECTIONS.CATEGORIES));
    return mapDocs<CategoryItem>(snap);
  },

  saveCategory: async (category: CategoryItem): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await setDoc(doc(db, COLLECTIONS.CATEGORIES, category.id), cleanData(category));
  },

  deleteCategory: async (id: string): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await deleteDoc(doc(db, COLLECTIONS.CATEGORIES, id));
  },

  // ================= PROVIDERS =================
  getProviders: async (): Promise<ProviderItem[]> => {
    if (!db) return [];
    const snap = await getDocs(collection(db, COLLECTIONS.PROVIDERS));
    return mapDocs<ProviderItem>(snap);
  },

  saveProvider: async (provider: ProviderItem): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await setDoc(doc(db, COLLECTIONS.PROVIDERS, provider.id), cleanData(provider));
  },

  deleteProvider: async (id: string): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await deleteDoc(doc(db, COLLECTIONS.PROVIDERS, id));
  },

  // ================= PRODUCTS =================
  getProducts: async (): Promise<Product[]> => {
    if (!db) return [];
    const snap = await getDocs(collection(db, COLLECTIONS.PRODUCTS));
    return mapDocs<Product>(snap);
  },

  saveProduct: async (product: Product): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    const data: any = cleanData(product);
    delete data.commissionPercentage;
    await setDoc(doc(db, COLLECTIONS.PRODUCTS, product.id), data, { merge: true });
  },

  updateProductCost: async (productId: string, newCost: number): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await updateDoc(doc(db, COLLECTIONS.PRODUCTS, productId), { cost: newCost });
  },

  deleteProduct: async (id: string): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await deleteDoc(doc(db, COLLECTIONS.PRODUCTS, id));
  },

  updateStock: async (productId: string, quantityChange: number): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await updateDoc(doc(db, COLLECTIONS.PRODUCTS, productId), {
      stock: increment(quantityChange),
    });
  },

  // ================= SALES =================
  getSales: async (): Promise<Sale[]> => {
    if (!db) return [];
    const snap = await getDocs(collection(db, COLLECTIONS.SALES));
    return mapDocs<Sale>(snap).sort((a, b) => b.timestamp - a.timestamp);
  },

  addSale: async (sale: Sale): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');

    await setDoc(doc(db, COLLECTIONS.SALES, sale.id), cleanData(sale));
    for (const item of sale.items) {
      await StorageService.updateStock(item.productId, -item.quantity);
    }
  },

  markCommissionsAsPaid: async (saleIds: string[]): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await Promise.all(
      saleIds.map((id) =>
        updateDoc(doc(db, COLLECTIONS.SALES, id), {
          commissionPaid: true,
          commissionPaidDate: Date.now(),
        }),
      ),
    );
  },

  // ================= EXPORT =================
  exportSalesToCSV: (sales: Sale[]) => {
    if (!sales.length) return;
    const headers = ['ID Venta,Fecha,Vendedor,Producto,Cantidad,Precio Unitario,Subtotal,Total Venta,Metodo Pago'];
    const rows = sales.flatMap((sale) =>
      sale.items.map((item) => {
        const date = new Date(sale.timestamp).toLocaleString().replace(',', '');
        return `${sale.id},"${date}","${sale.userName}","${item.productName}",${item.quantity},${item.priceAtSale},${item.subtotal},${sale.total},${sale.paymentMethod}`;
      }),
    );
    StorageService.downloadCSV(headers.concat(rows).join('\n'), 'reporte_ventas.csv');
  },

  exportInventoryToCSV: (products: Product[]) => {
    if (!products.length) return;
    const headers = ['Codigo,Producto,Categoria,Proveedor,Costo,Precio,Stock,Descripcion'];
    const rows = products.map(
      (p) =>
        `${p.code},"${p.name}","${p.category}","${p.provider}",${p.cost},${p.price},${p.stock},"${p.description || ''}"`,
    );
    StorageService.downloadCSV(headers.concat(rows).join('\n'), 'inventario_invictos.csv');
  },

  downloadCSV: (content: string, fileName: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
  },
};
