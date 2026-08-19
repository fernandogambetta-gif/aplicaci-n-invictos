import {
  Product,
  Sale,
  User,
  AppConfig,
  CategoryItem,
  ProviderItem,
  UserSecurity,
  Expense,
  PaymentMethod,
  ReceivablePayment,
} from '../types';

import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
  query,
  where,
  limit,
  runTransaction,
  writeBatch,
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
  CONFIG: 'config',
  CATEGORIES: 'categories',
  PROVIDERS: 'providers',
  EXPENSES: 'expenses',

  // Preparada para el próximo paso.
  INVENTORY_MOVEMENTS: 'inventoryMovements',
};

const DEFAULT_SECURITY: UserSecurity = {
  failedAttempts: 0,
  lockoutUntil: null,
  consecutiveLockouts: 0,
  isPermanentlyBlocked: false,
};

const mapDocs = <T>(snapshot: any): T[] =>
  snapshot.docs.map((d: any) => ({ ...d.data(), id: d.id })) as T[];

const normalizeBarcode = (value: string): string => (value || '').trim();
const normalizeShortCode = (value: string): string =>
  (value || '').replace(/\D/g, '').trim();

const getNumericStock = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

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
  /**
   * Seguridad de PIN:
   * - 1er error: quedan 2 intentos.
   * - 2do error: queda 1 intento.
   * - 3er error: bloqueo temporal por 5 minutos.
   * - terminado el bloqueo, vuelve a disponer de 3 intentos.
   *
   * No genera nuevos bloqueos permanentes automáticos.
   * La operación es atómica mediante transacción de Firestore.
   */
  recordFailedAttempt: async (userId: string): Promise<User | null> => {
    if (!db) throw new Error('Firestore no inicializado');

    const userRef = doc(db, COLLECTIONS.USERS, userId);

    return runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists()) return null;

      const user = {
        ...(userSnap.data() as User),
        id: userSnap.id,
      };

      const now = Date.now();

      const currentSecurity: UserSecurity = {
        ...DEFAULT_SECURITY,
        ...(user.security || {}),
      };

      // Conservamos un bloqueo permanente antiguo hasta que un admin lo quite.
      if (currentSecurity.isPermanentlyBlocked) {
        return {
          ...user,
          security: currentSecurity,
        };
      }

      // Si todavía está dentro de los 5 minutos, no sumamos intentos.
      if (
        currentSecurity.lockoutUntil &&
        currentSecurity.lockoutUntil > now
      ) {
        return {
          ...user,
          security: currentSecurity,
        };
      }

      // Si había un bloqueo temporal ya vencido, comenzamos un ciclo nuevo.
      const previousAttempts =
        currentSecurity.lockoutUntil &&
        currentSecurity.lockoutUntil <= now
          ? 0
          : Number(currentSecurity.failedAttempts || 0);

      const nextAttempts = previousAttempts + 1;

      let nextSecurity: UserSecurity;

      if (nextAttempts >= 3) {
        nextSecurity = {
          ...currentSecurity,
          failedAttempts: 0,
          lockoutUntil: now + 5 * 60 * 1000,
          // Ya no acumulamos ciclos para bloquear permanentemente.
          consecutiveLockouts: 0,
          isPermanentlyBlocked: false,
        };
      } else {
        nextSecurity = {
          ...currentSecurity,
          failedAttempts: nextAttempts,
          lockoutUntil: null,
          consecutiveLockouts: 0,
          isPermanentlyBlocked: false,
        };
      }

      transaction.update(userRef, {
        security: cleanData(nextSecurity),
      });

      return {
        ...user,
        security: nextSecurity,
      };
    });
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

  /**
   * Blanqueo de PIN realizado por un administrador.
   *
   * - valida nuevamente al administrador contra Firestore;
   * - asigna un PIN temporal al usuario;
   * - desbloquea la cuenta;
   * - obliga a cambiar el PIN al próximo ingreso.
   */
  resetUserPinByAdmin: async (
    adminUserId: string,
    adminPin: string,
    targetUserId: string,
    temporaryPin: string,
  ): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');

    if (!/^\d{4}$/.test((temporaryPin || '').trim())) {
      throw new Error('El PIN temporal debe tener exactamente 4 números.');
    }

    const adminSnap = await getDoc(
      doc(db, COLLECTIONS.USERS, adminUserId),
    );

    if (!adminSnap.exists()) {
      throw new Error('No se encontró el usuario administrador.');
    }

    const admin = {
      ...(adminSnap.data() as User),
      id: adminSnap.id,
    };

    if (admin.role !== 'admin') {
      throw new Error('Acceso denegado. Solo un administrador puede blanquear claves.');
    }

    if ((admin.pin || '').trim() !== (adminPin || '').trim()) {
      throw new Error('PIN del administrador incorrecto.');
    }

    const targetRef = doc(db, COLLECTIONS.USERS, targetUserId);
    const targetSnap = await getDoc(targetRef);

    if (!targetSnap.exists()) {
      throw new Error('No se encontró el usuario a blanquear.');
    }

    await updateDoc(targetRef, {
      pin: temporaryPin.trim(),
      mustChangePin: true,
      pinUpdatedAt: Date.now(),
      security: cleanData(DEFAULT_SECURITY),
    });
  },

  // ================= CONFIG =================
  getConfig: async (): Promise<AppConfig> => {
    if (!db) return { commissionPercentage: 5 };

    const snap = await getDoc(doc(db, COLLECTIONS.CONFIG, 'main'));

    return snap.exists()
      ? (snap.data() as AppConfig)
      : { commissionPercentage: 5 };
  },

  saveConfig: async (config: AppConfig): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');

    await setDoc(
      doc(db, COLLECTIONS.CONFIG, 'main'),
      cleanData(config),
      { merge: true },
    );
  },

  // ================= CATEGORIES =================
  getCategories: async (): Promise<CategoryItem[]> => {
    if (!db) return [];

    const snap = await getDocs(collection(db, COLLECTIONS.CATEGORIES));
    return mapDocs<CategoryItem>(snap);
  },

  saveCategory: async (category: CategoryItem): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');

    await setDoc(
      doc(db, COLLECTIONS.CATEGORIES, category.id),
      cleanData(category),
    );
  },

  deleteCategory: async (id: string): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await deleteDoc(doc(db, COLLECTIONS.CATEGORIES, id));
  },

  /**
   * Renombra una categoría y actualiza TODOS los productos que la tengan
   * asignada. La relación actual se guarda por nombre, por eso el cambio
   * debe propagarse a products.category.
   *
   * Devuelve la cantidad de productos actualizados.
   */
  renameCategoryAndProducts: async (
    categoryId: string,
    oldName: string,
    newName: string,
  ): Promise<number> => {
    if (!db) throw new Error('Firestore no inicializado');

    const cleanOldName = (oldName || '').trim();
    const cleanNewName = (newName || '').trim();

    if (!categoryId) {
      throw new Error('No se pudo identificar la categoría.');
    }

    if (!cleanNewName) {
      throw new Error('El nombre de la categoría no puede quedar vacío.');
    }

    // Evita nombres duplicados.
    const categoriesSnap = await getDocs(
      collection(db, COLLECTIONS.CATEGORIES),
    );

    const duplicateCategory = categoriesSnap.docs.find((categoryDoc) => {
      if (categoryDoc.id === categoryId) return false;

      const data = categoryDoc.data() as CategoryItem;

      return (
        (data.name || '').trim().toLowerCase() ===
        cleanNewName.toLowerCase()
      );
    });

    if (duplicateCategory) {
      throw new Error(
        `Ya existe una categoría llamada "${cleanNewName}".`,
      );
    }

    // Se recorren los productos para cubrir también registros antiguos
    // con diferencias de espacios o mayúsculas/minúsculas.
    const productsSnap = await getDocs(
      collection(db, COLLECTIONS.PRODUCTS),
    );

    const affectedProducts = productsSnap.docs.filter((productDoc) => {
      const data = productDoc.data() as Product;

      return (
        (data.category || '').trim().toLowerCase() ===
        cleanOldName.toLowerCase()
      );
    });

    const now = Date.now();

    // Firestore limita los batch a 500 operaciones.
    for (let i = 0; i < affectedProducts.length; i += 400) {
      const batch = writeBatch(db);

      affectedProducts.slice(i, i + 400).forEach((productDoc) => {
        batch.update(
          doc(db, COLLECTIONS.PRODUCTS, productDoc.id),
          {
            category: cleanNewName,
            updatedAt: now,
          },
        );
      });

      await batch.commit();
    }

    await setDoc(
      doc(db, COLLECTIONS.CATEGORIES, categoryId),
      cleanData({
        id: categoryId,
        name: cleanNewName,
      }),
      { merge: true },
    );

    return affectedProducts.length;
  },

  // ================= PROVIDERS =================
  getProviders: async (): Promise<ProviderItem[]> => {
    if (!db) return [];

    const snap = await getDocs(collection(db, COLLECTIONS.PROVIDERS));
    return mapDocs<ProviderItem>(snap);
  },

  saveProvider: async (provider: ProviderItem): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');

    await setDoc(
      doc(db, COLLECTIONS.PROVIDERS, provider.id),
      cleanData(provider),
    );
  },

  deleteProvider: async (id: string): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await deleteDoc(doc(db, COLLECTIONS.PROVIDERS, id));
  },

  // ================= EXPENSES / GASTOS =================
  getExpenses: async (): Promise<Expense[]> => {
    if (!db) return [];

    const snap = await getDocs(collection(db, COLLECTIONS.EXPENSES));

    return mapDocs<Expense>(snap).sort((a, b) => {
      const periodCompare = String(b.periodMonth || '').localeCompare(
        String(a.periodMonth || ''),
      );

      if (periodCompare !== 0) return periodCompare;

      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });
  },

  saveExpense: async (expense: Expense): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');

    const amount = Number(expense.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('El importe del gasto debe ser mayor que cero.');
    }

    if (!expense.description?.trim()) {
      throw new Error('Ingresá una descripción para el gasto.');
    }

    if (!/^\d{4}-\d{2}$/.test(expense.periodMonth || '')) {
      throw new Error('Seleccioná el mes al que corresponde el gasto.');
    }

    const now = Date.now();

    await setDoc(
      doc(db, COLLECTIONS.EXPENSES, expense.id),
      cleanData({
        ...expense,
        description: expense.description.trim(),
        amount,
        createdAt: expense.createdAt || now,
        updatedAt: now,
      }),
      { merge: true },
    );
  },

  deleteExpense: async (expenseId: string): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await deleteDoc(doc(db, COLLECTIONS.EXPENSES, expenseId));
  },

  // ================= PRODUCTS =================
  getProducts: async (): Promise<Product[]> => {
    if (!db) return [];

    const snap = await getDocs(collection(db, COLLECTIONS.PRODUCTS));

    return mapDocs<Product>(snap).map((p) => ({
      ...p,
      stock: getNumericStock(p.stock),
      active: p.active !== false,
    }));
  },

  getProductById: async (productId: string): Promise<Product | null> => {
    if (!db) return null;

    const snap = await getDoc(doc(db, COLLECTIONS.PRODUCTS, productId));
    if (!snap.exists()) return null;

    const data = snap.data() as Product;

    return {
      ...data,
      id: snap.id,
      stock: getNumericStock(data.stock),
    };
  },

  /**
   * Busca por código corto QR, luego barcode largo y finalmente SKU.
   * Se mantiene este nombre de función para no romper componentes existentes.
   */
  getProductByBarcode: async (valueToFind: string): Promise<Product | null> => {
    if (!db) return null;

    const value = (valueToFind || '').trim();
    if (!value) return null;

    const searches: Array<{
      field: 'shortCode' | 'barcode' | 'code';
      value: string;
    }> = [
      { field: 'shortCode', value: normalizeShortCode(value) },
      { field: 'barcode', value },
      { field: 'code', value },
    ];

    for (const search of searches) {
      if (!search.value) continue;

      const productQuery = query(
        collection(db, COLLECTIONS.PRODUCTS),
        where(search.field, '==', search.value),
        limit(1),
      );

      const productSnap = await getDocs(productQuery);

      if (!productSnap.empty) {
        const d = productSnap.docs[0];
        const data = d.data() as Product;

        return {
          ...data,
          id: d.id,
          stock: getNumericStock(data.stock),
        };
      }
    }

    return null;
  },

  /**
   * Migra productos anteriores para que todos tengan un código corto único.
   * También corrige códigos cortos duplicados o inválidos.
   */
  ensureProductShortCodes: async (): Promise<number> => {
    if (!db) throw new Error('Firestore no inicializado');

    const snap = await getDocs(collection(db, COLLECTIONS.PRODUCTS));
    if (snap.empty) return 0;

    const productDocs = [...snap.docs].sort((a, b) =>
      a.id.localeCompare(b.id),
    );

    const used = new Set<string>();
    const toAssign: typeof productDocs = [];

    productDocs.forEach((productDoc) => {
      const data = productDoc.data() as Product;
      const current = normalizeShortCode(data.shortCode || '');
      const valid = /^\d{4,6}$/.test(current);

      if (valid && !used.has(current)) {
        used.add(current);
      } else {
        toAssign.push(productDoc);
      }
    });

    if (toAssign.length === 0) return 0;

    let candidate = 1000;

    const nextFree = (): string => {
      while (used.has(String(candidate))) {
        candidate += 1;
      }

      const code = String(candidate);
      used.add(code);
      candidate += 1;
      return code;
    };

    let updated = 0;

    for (let startIndex = 0; startIndex < toAssign.length; startIndex += 400) {
      const batch = writeBatch(db);
      const chunk = toAssign.slice(startIndex, startIndex + 400);
      const now = Date.now();

      chunk.forEach((productDoc) => {
        batch.update(productDoc.ref, {
          shortCode: nextFree(),
          updatedAt: now,
        });
      });

      await batch.commit();
      updated += chunk.length;
    }

    return updated;
  },


  saveProduct: async (product: Product): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');

    const now = Date.now();

    const data: any = cleanData({
      ...product,
      shortCode: product.shortCode
        ? normalizeShortCode(product.shortCode)
        : undefined,
      barcode: product.barcode
        ? normalizeBarcode(product.barcode)
        : undefined,
      active: product.active !== false,
      createdAt: product.createdAt || now,
      updatedAt: now,
    });

    // La comisión pertenece al usuario/configuración, no al producto.
    delete data.commissionPercentage;

    await setDoc(
      doc(db, COLLECTIONS.PRODUCTS, product.id),
      data,
      { merge: true },
    );
  },

  /**
   * Alta masiva de variantes de un producto.
   * Se usa únicamente desde "Nuevo Producto".
   *
   * Todas las variantes siguen siendo documentos Product independientes,
   * pero se guardan juntas y comparten parentProductId.
   */
  saveProductsBatch: async (products: Product[]): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');

    if (!products.length) {
      throw new Error('No hay variantes para guardar.');
    }

    if (products.length > 400) {
      throw new Error(
        'La carga masiva admite hasta 400 variantes por producto.',
      );
    }

    const currentSnapshot = await getDocs(
      collection(db, COLLECTIONS.PRODUCTS),
    );

    const existingCodes = new Set<string>();
    const existingShortCodes = new Set<string>();
    const existingBarcodes = new Set<string>();

    currentSnapshot.docs.forEach((productDoc) => {
      const data = productDoc.data() as Product;

      const code = (data.code || '').trim().toLowerCase();
      const shortCode = (data.shortCode || '').trim();
      const barcode = (data.barcode || '').trim();

      if (code) existingCodes.add(code);
      if (shortCode) existingShortCodes.add(shortCode);
      if (barcode) existingBarcodes.add(barcode);
    });

    const newIds = new Set<string>();
    const newCodes = new Set<string>();
    const newShortCodes = new Set<string>();
    const newBarcodes = new Set<string>();

    products.forEach((product) => {
      const id = (product.id || '').trim();
      const code = (product.code || '').trim().toLowerCase();
      const shortCode = normalizeShortCode(product.shortCode || '');
      const barcode = normalizeBarcode(product.barcode || '');

      if (!id || !code || !shortCode || !barcode) {
        throw new Error(
          'Una de las variantes no tiene identificación completa.',
        );
      }

      if (newIds.has(id)) {
        throw new Error('Se generó un identificador de variante duplicado.');
      }

      if (existingCodes.has(code) || newCodes.has(code)) {
        throw new Error(`El SKU "${product.code}" ya existe.`);
      }

      if (
        existingShortCodes.has(shortCode) ||
        newShortCodes.has(shortCode)
      ) {
        throw new Error(
          `El código corto "${shortCode}" ya existe.`,
        );
      }

      if (
        existingBarcodes.has(barcode) ||
        newBarcodes.has(barcode)
      ) {
        throw new Error(
          `El código de barras "${barcode}" ya existe.`,
        );
      }

      newIds.add(id);
      newCodes.add(code);
      newShortCodes.add(shortCode);
      newBarcodes.add(barcode);
    });

    const batch = writeBatch(db);
    const now = Date.now();

    products.forEach((product) => {
      const data: any = cleanData({
        ...product,
        shortCode: normalizeShortCode(product.shortCode || ''),
        barcode: normalizeBarcode(product.barcode || ''),
        active: product.active !== false,
        createdAt: product.createdAt || now,
        updatedAt: now,
      });

      delete data.commissionPercentage;

      batch.set(
        doc(db, COLLECTIONS.PRODUCTS, product.id),
        data,
      );
    });

    await batch.commit();
  },

  updateProductCost: async (
    productId: string,
    newCost: number,
  ): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');

    await updateDoc(doc(db, COLLECTIONS.PRODUCTS, productId), {
      cost: newCost,
      updatedAt: Date.now(),
    });
  },

  deleteProduct: async (id: string): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await deleteDoc(doc(db, COLLECTIONS.PRODUCTS, id));
  },

  /**
   * Se mantiene por compatibilidad con Inventory.tsx actual.
   * Más adelante el ingreso de mercadería registrará historial.
   */
  updateStock: async (
    productId: string,
    quantityChange: number,
  ): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');

    if (!Number.isFinite(quantityChange) || quantityChange === 0) return;

    await updateDoc(doc(db, COLLECTIONS.PRODUCTS, productId), {
      stock: increment(quantityChange),
      updatedAt: Date.now(),
    });
  },

  // ================= SALES =================
  getSales: async (): Promise<Sale[]> => {
    if (!db) return [];

    const snap = await getDocs(collection(db, COLLECTIONS.SALES));

    return mapDocs<Sale>(snap).sort(
      (a, b) => b.timestamp - a.timestamp,
    );
  },

  /**
   * VENTA ATÓMICA:
   * - lee todos los stocks;
   * - verifica que haya disponibilidad;
   * - registra la venta;
   * - descuenta todos los productos.
   *
   * Si algo falla, no queda una venta parcialmente procesada.
   */
  addSale: async (sale: Sale): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');

    if (!sale.items.length) {
      throw new Error('La venta no contiene productos.');
    }

    await runTransaction(db, async (transaction) => {
      const productRefs = sale.items.map((item) =>
        doc(db, COLLECTIONS.PRODUCTS, item.productId),
      );

      // Todas las lecturas primero.
      const productSnapshots = [];

      for (const productRef of productRefs) {
        productSnapshots.push(await transaction.get(productRef));
      }

      const enrichedItems = sale.items.map((item, index) => {
        const snap = productSnapshots[index];

        if (!snap.exists()) {
          throw new Error(
            `El producto "${item.productName}" ya no existe en inventario.`,
          );
        }

        const productData = snap.data() as Product;
        const currentStock = getNumericStock(productData.stock);
        const requestedQuantity = Number(item.quantity);

        if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
          throw new Error(
            `Cantidad inválida para "${item.productName}".`,
          );
        }

        if (currentStock < requestedQuantity) {
          throw new Error(
            `Stock insuficiente para "${item.productName}". Disponible: ${currentStock}.`,
          );
        }

        return {
          item: {
            ...item,
            costAtSale: Math.max(0, Number(productData.cost || 0)),
          },
          ref: productRefs[index],
          newStock: currentStock - requestedQuantity,
        };
      });

      const saleRef = doc(db, COLLECTIONS.SALES, sale.id);

      const saleToSave: Sale = {
        ...sale,
        items: enrichedItems.map((entry) => entry.item),
      };

      transaction.set(saleRef, cleanData(saleToSave));

      enrichedItems.forEach(({ ref, newStock }) => {
        transaction.update(ref, {
          stock: newStock,
          updatedAt: Date.now(),
        });
      });
    });
  },

  /**
   * REGISTRAR COBRO DE CUENTA CORRIENTE
   * - permite cobros parciales o totales;
   * - conserva historial de cada pago;
   * - la cuota nunca puede quedar sobrepagada.
   */
  recordReceivablePayment: async (
    saleId: string,
    installmentId: string,
    payment: {
      amount: number;
      method: Exclude<PaymentMethod, 'account'>;
      receiptNumber?: string;
      notes?: string;
      userId: string;
      userName: string;
      timestamp?: number;
    },
  ): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');

    const amount = Number(payment.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('El importe cobrado debe ser mayor que cero.');
    }

    if (payment.method === ('account' as any)) {
      throw new Error(
        'Un cobro de cuenta corriente no puede registrarse nuevamente como cuenta corriente.',
      );
    }

    await runTransaction(db, async (transaction) => {
      const saleRef = doc(db, COLLECTIONS.SALES, saleId);
      const saleSnap = await transaction.get(saleRef);

      if (!saleSnap.exists()) {
        throw new Error('La venta ya no existe.');
      }

      const saleData = saleSnap.data() as Sale;
      const receivable = saleData.receivable;

      if (!receivable) {
        throw new Error('Esta venta no tiene cuenta corriente asociada.');
      }

      const installmentIndex = receivable.installments.findIndex(
        (item) => item.id === installmentId,
      );

      if (installmentIndex < 0) {
        throw new Error('No se encontró la cuota seleccionada.');
      }

      const installment = receivable.installments[installmentIndex];

      const currentPaid = Math.max(
        0,
        Number(installment.paidAmount || 0),
      );

      const installmentAmount = Math.max(
        0,
        Number(installment.amount || 0),
      );

      const remaining = Math.max(
        0,
        installmentAmount - currentPaid,
      );

      if (remaining <= 0.009) {
        throw new Error('Esta cuota ya está cancelada.');
      }

      if (amount - remaining > 0.009) {
        throw new Error(
          `El cobro supera el saldo de la cuota. Saldo: $${remaining.toLocaleString(
            'es-AR',
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            },
          )}.`,
        );
      }

      const now = payment.timestamp || Date.now();

      const paymentRecord: ReceivablePayment = {
        id: `pay-${now}-${Math.random().toString(36).slice(2, 8)}`,
        amount,
        timestamp: now,
        method: payment.method,
        receiptNumber: payment.receiptNumber?.trim() || undefined,
        notes: payment.notes?.trim() || undefined,
        recordedByUserId: payment.userId,
        recordedByUserName: payment.userName,
      };

      const nextInstallments = receivable.installments.map(
        (item, index) => {
          if (index !== installmentIndex) return item;

          return {
            ...item,
            paidAmount: Math.min(
              Number(item.amount || 0),
              Number(item.paidAmount || 0) + amount,
            ),
            payments: [
              ...(item.payments || []),
              paymentRecord,
            ],
          };
        },
      );

      transaction.update(saleRef, {
        receivable: cleanData({
          ...receivable,
          installments: nextInstallments,
        }),
      });
    });
  },

  markCommissionsAsPaid: async (
    saleIds: string[],
  ): Promise<void> => {
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

  /**
   * RESET ADMINISTRATIVO DE VENTAS / HISTORIAL
   *
   * Seguridad funcional:
   * - solo acepta un usuario con rol admin;
   * - exige reingresar el PIN actual del administrador.
   *
   * Efectos:
   * - elimina TODAS las ventas;
   * - por lo tanto también queda vacío el Historial de Ventas;
   * - devuelve al stock las cantidades descontadas por esas ventas;
   * - no elimina productos, usuarios, categorías ni proveedores.
   *
   * Se limita a un batch seguro para evitar un reseteo parcial.
   */
  resetSalesAndRestoreStock: async (
    adminUser: User,
    confirmationPin: string,
  ): Promise<{
    salesDeleted: number;
    unitsRestored: number;
    productsAdjusted: number;
    missingProducts: number;
  }> => {
    if (!db) throw new Error('Firestore no inicializado');

    if (!adminUser || adminUser.role !== 'admin') {
      throw new Error('Acceso denegado. Solo un administrador puede resetear ventas.');
    }

    if ((confirmationPin || '').trim() !== (adminUser.pin || '').trim()) {
      throw new Error('PIN de administrador incorrecto.');
    }

    const [salesSnap, productsSnap] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.SALES)),
      getDocs(collection(db, COLLECTIONS.PRODUCTS)),
    ]);

    if (salesSnap.empty) {
      return {
        salesDeleted: 0,
        unitsRestored: 0,
        productsAdjusted: 0,
        missingProducts: 0,
      };
    }

    const existingProductIds = new Set(
      productsSnap.docs.map((productDoc) => productDoc.id),
    );

    // Agrupa todas las unidades a devolver por producto.
    const restoreByProduct = new Map<string, number>();

    salesSnap.docs.forEach((saleDoc) => {
      const sale = saleDoc.data() as Sale;

      (sale.items || []).forEach((item) => {
        const quantity = Number(item.quantity);

        if (
          !item.productId ||
          !Number.isFinite(quantity) ||
          quantity <= 0
        ) {
          return;
        }

        restoreByProduct.set(
          item.productId,
          (restoreByProduct.get(item.productId) || 0) + quantity,
        );
      });
    });

    const validRestores = Array.from(restoreByProduct.entries()).filter(
      ([productId]) => existingProductIds.has(productId),
    );

    const missingProducts = Array.from(restoreByProduct.keys()).filter(
      (productId) => !existingProductIds.has(productId),
    ).length;

    // Firestore tiene límite de escrituras por batch.
    // Usamos margen para garantizar que, si es demasiado grande,
    // NO se haga ningún cambio parcial.
    const totalOperations = salesSnap.size + validRestores.length;

    if (totalOperations > 450) {
      throw new Error(
        `El reseteo requiere ${totalOperations} operaciones y supera el límite seguro. ` +
          'No se realizó ningún cambio. Se deberá hacer un reseteo administrativo por lotes.',
      );
    }

    const batch = writeBatch(db);
    const now = Date.now();
    let unitsRestored = 0;

    validRestores.forEach(([productId, quantity]) => {
      unitsRestored += quantity;

      batch.update(doc(db, COLLECTIONS.PRODUCTS, productId), {
        stock: increment(quantity),
        updatedAt: now,
      });
    });

    salesSnap.docs.forEach((saleDoc) => {
      batch.delete(saleDoc.ref);
    });

    await batch.commit();

    return {
      salesDeleted: salesSnap.size,
      unitsRestored,
      productsAdjusted: validRestores.length,
      missingProducts,
    };
  },

  // ================= EXPORT =================
  exportSalesToCSV: (sales: Sale[]) => {
    if (!sales.length) return;

    const headers = [
      'ID Venta,Fecha,Vendedor,Producto,Cantidad,Precio Unitario,Subtotal,Total Venta,Metodo Pago',
    ];

    const rows = sales.flatMap((sale) =>
      sale.items.map((item) => {
        const date = new Date(sale.timestamp)
          .toLocaleString()
          .replace(',', '');

        return `${sale.id},"${date}","${sale.userName}","${item.productName}",${item.quantity},${item.priceAtSale},${item.subtotal},${sale.total},${sale.paymentMethod}`;
      }),
    );

    StorageService.downloadCSV(
      headers.concat(rows).join('\n'),
      'reporte_ventas.csv',
    );
  },

  exportInventoryToCSV: (products: Product[]) => {
    if (!products.length) return;

    const headers = [
      'Codigo,Codigo Barras,Producto,Talle,Color,Categoria,Proveedor,Costo,Precio,Stock,Stock Minimo,Descripcion',
    ];

    const rows = products.map(
      (p) =>
        `"${p.code || ''}","${p.barcode || ''}","${p.name || ''}","${p.size || ''}","${p.color || ''}","${p.category || ''}","${p.provider || ''}",${p.cost || 0},${p.price || 0},${p.stock || 0},${p.minStock ?? ''},"${p.description || ''}"`,
    );

    StorageService.downloadCSV(
      headers.concat(rows).join('\n'),
      'inventario_invictos.csv',
    );
  },

  downloadCSV: (content: string, fileName: string) => {
    const blob = new Blob(
      [content],
      { type: 'text/csv;charset=utf-8;' },
    );

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.href = url;
    link.download = fileName;
    link.click();

    URL.revokeObjectURL(url);
  },
};
