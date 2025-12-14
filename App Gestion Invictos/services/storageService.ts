
import { Product, Sale, User, AppConfig, CategoryItem, ProviderItem, UserSecurity } from '../types';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, setDoc, deleteDoc, 
  enableIndexedDbPersistence, query, where, updateDoc
} from 'firebase/firestore';

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

// Initialize Firebase only if keys are present
let db: any = null;
if (firebaseConfig.apiKey) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app,'invictos-bd');
    // Enable offline persistence
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
             console.warn('Persistence failed: Multiple tabs open');
        } else if (err.code == 'unimplemented') {
             console.warn('Persistence not supported by browser');
        }
    });
} else {
    console.warn("⚠️ Firebase keys missing. App will fail to load data.");
}

// Collections
const COLLECTIONS = {
    PRODUCTS: 'products',
    SALES: 'sales',
    USERS: 'users',
    CONFIG: 'config', // doc id: 'main'
    CATEGORIES: 'categories',
    PROVIDERS: 'providers'
};

const DEFAULT_SECURITY: UserSecurity = {
  failedAttempts: 0,
  lockoutUntil: null,
  consecutiveLockouts: 0,
  isPermanentlyBlocked: false
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
      
      // If first run (no users in DB), seed initial admin
      if (users.length === 0) {
          await Promise.all(INITIAL_USERS.map(u => setDoc(doc(db, COLLECTIONS.USERS, u.id), u)));
          return INITIAL_USERS;
      }
      return users.map(u => ({ ...u, security: u.security || { ...DEFAULT_SECURITY } }));
  },

  addUser: async (user: User): Promise<void> => {
    if (!db) return;
    await setDoc(doc(db, COLLECTIONS.USERS, user.id), { ...user, security: { ...DEFAULT_SECURITY } });
  },

  updateUser: async (updatedUser: User): Promise<void> => {
    if (!db) return;
    await setDoc(doc(db, COLLECTIONS.USERS, updatedUser.id), updatedUser, { merge: true });
  },

  deleteUser: async (userId: string): Promise<void> => {
      if (!db) return;
      await deleteDoc(doc(db, COLLECTIONS.USERS, userId));
  },

  // --- SECURITY SPECIFIC ---
  recordFailedAttempt: async (userId: string): Promise<User | null> => {
    if (!db) return null;
    // We need fresh data first to avoid race conditions (simplistic approach)
    // In production, use transactions.
    const userRef = doc(db, COLLECTIONS.USERS, userId);
    // For this simple app, we assume the UI state is relatively fresh or we fetch.
    // Let's just update the local object logic and push to DB.
    // NOTE: This function expects the UI to re-fetch or use the returned object.
    
    // To make it robust, we'll fetch the user first
    const users = await StorageService.getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return null;

    user.security = user.security || { ...DEFAULT_SECURITY };
    user.security.failedAttempts += 1;

    if (user.security.failedAttempts >= 3) {
       user.security.lockoutUntil = Date.now() + (5 * 60 * 1000); 
       user.security.consecutiveLockouts += 1;
       user.security.failedAttempts = 0;

       if (user.security.consecutiveLockouts >= 3) {
           user.security.isPermanentlyBlocked = true;
           user.security.lockoutUntil = null;
       }
    }
    
    await updateDoc(userRef, { security: user.security });
    return user;
  },

  resetAttempts: async (userId: string) => {
    if (!db) return;
    const userRef = doc(db, COLLECTIONS.USERS, userId);
    await updateDoc(userRef, { security: { ...DEFAULT_SECURITY } });
  },

  unlockUser: async (userId: string) => {
      if (!db) return;
      const userRef = doc(db, COLLECTIONS.USERS, userId);
      await updateDoc(userRef, { security: { ...DEFAULT_SECURITY } });
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
    // We use a fixed ID 'main' for config
    await setDoc(doc(db, COLLECTIONS.CONFIG, 'main'), config);
  },

  // --- CATEGORIES ---
  getCategories: async (): Promise<CategoryItem[]> => {
      if (!db) return [];
      const snap = await getDocs(collection(db, COLLECTIONS.CATEGORIES));
      return mapDocs<CategoryItem>(snap);
  },

  saveCategory: async (category: CategoryItem): Promise<void> => {
    if (!db) return;
    await setDoc(doc(db, COLLECTIONS.CATEGORIES, category.id), category);
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
    await setDoc(doc(db, COLLECTIONS.PROVIDERS, provider.id), provider);
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
    await setDoc(doc(db, COLLECTIONS.PRODUCTS, product.id), product);
  },

  deleteProduct: async (id: string): Promise<void> => {
    if (!db) return;
    await deleteDoc(doc(db, COLLECTIONS.PRODUCTS, id));
  },

  updateStock: async (productId: string, quantityChange: number): Promise<void> => {
    if (!db) return;
    const prodRef = doc(db, COLLECTIONS.PRODUCTS, productId);
    // In a real app, use transaction to ensure atomicity. 
    // For this migration, we fetch-update.
    const products = await StorageService.getProducts();
    const product = products.find(p => p.id === productId);
    if (product) {
      await updateDoc(prodRef, { stock: product.stock + quantityChange });
    }
  },

  // --- SALES ---
  getSales: async (): Promise<Sale[]> => {
      if (!db) return [];
      const snap = await getDocs(collection(db, COLLECTIONS.SALES));
      return mapDocs<Sale>(snap).sort((a,b) => b.timestamp - a.timestamp);
  },

  addSale: async (sale: Sale): Promise<void> => {
    if (!db) return;
    await setDoc(doc(db, COLLECTIONS.SALES, sale.id), sale);
    
    // Update stock for each item
    for (const item of sale.items) {
        await StorageService.updateStock(item.productId, -item.quantity);
    }
  },

  markCommissionsAsPaid: async (saleIds: string[]): Promise<void> => {
      if (!db) return;
      const batchPromises = saleIds.map(id => 
         updateDoc(doc(db, COLLECTIONS.SALES, id), { 
             commissionPaid: true, 
             commissionPaidDate: Date.now() 
         })
      );
      await Promise.all(batchPromises);
  },

  // --- EXPORT HELPERS (Keep Client Side) ---
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
    if (confirm("Al usar Base de Datos en la Nube, 'resetear' datos locales no elimina la base de datos real. Debes borrar las colecciones en Firebase Console.")) {
        window.location.reload();
    }
  }
};
