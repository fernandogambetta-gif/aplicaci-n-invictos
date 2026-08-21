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
  SaleAdjustment,
  SaleAdjustmentLine,
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

const DEFAULT_PRODUCT_SIZES = [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  '3XL',
  'Único',
];

const DEFAULT_PRODUCT_COLORS = [
  'Negro',
  'Blanco',
  'Gris',
  'Azul',
  'Azul Marino',
  'Rojo',
  'Verde',
  'Amarillo',
  'Rosa',
  'Violeta',
  'Beige',
  'Marrón',
  'Fucsia',
];

const normalizeComparableText = (value: unknown): string =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const canonicalizeColor = (value: unknown): string => {
  const clean = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');

  if (!clean) return '';

  const key = normalizeComparableText(clean);

  const aliases: Record<string, string> = {
    negro: 'Negro',
    negra: 'Negro',

    blanco: 'Blanco',
    blanca: 'Blanco',

    rojo: 'Rojo',
    roja: 'Rojo',

    amarillo: 'Amarillo',
    amarilla: 'Amarillo',

    morado: 'Morado',
    morada: 'Morado',

    marron: 'Marrón',

    fucsia: 'Fucsia',
    fuxia: 'Fucsia',
    fuxsia: 'Fucsia',
    fuchsia: 'Fucsia',
  };

  return aliases[key] || clean;
};

const colorComparisonKey = (value: unknown): string =>
  normalizeComparableText(canonicalizeColor(value));

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

  /**
   * Opciones reutilizables para el alta de productos.
   * Combina valores predefinidos + valores guardados en config.
   */
  getVariantOptions: async (): Promise<{
    sizes: string[];
    colors: string[];
  }> => {
    if (!db) {
      return {
        sizes: [...DEFAULT_PRODUCT_SIZES],
        colors: [...DEFAULT_PRODUCT_COLORS],
      };
    }

    const snap = await getDoc(
      doc(db, COLLECTIONS.CONFIG, 'main'),
    );

    const data: any = snap.exists() ? snap.data() : {};

    const storedSizes = Array.isArray(data.productSizes)
      ? data.productSizes
      : [];

    const storedColors = Array.isArray(data.productColors)
      ? data.productColors
      : [];

    const mergeUniqueSizes = (values: unknown[]): string[] => {
      const seen = new Set<string>();
      const result: string[] = [];

      values.forEach((value) => {
        const clean = String(value || '')
          .trim()
          .replace(/\s+/g, ' ');

        if (!clean) return;

        const key = normalizeComparableText(clean);

        if (seen.has(key)) return;

        seen.add(key);
        result.push(clean);
      });

      return result;
    };

    const mergeUniqueColors = (values: unknown[]): string[] => {
      const seen = new Set<string>();
      const result: string[] = [];

      values.forEach((value) => {
        const canonical = canonicalizeColor(value);

        if (!canonical) return;

        const key = colorComparisonKey(canonical);

        if (seen.has(key)) return;

        seen.add(key);
        result.push(canonical);
      });

      return result;
    };

    return {
      sizes: mergeUniqueSizes([
        ...DEFAULT_PRODUCT_SIZES,
        ...storedSizes,
      ]),
      colors: mergeUniqueColors([
        ...DEFAULT_PRODUCT_COLORS,
        ...storedColors,
      ]),
    };
  },

  /**
   * Guarda una nueva opción para futuras cargas.
   * Usa transacción para no pisar opciones agregadas por otro usuario.
   */
  addVariantOption: async (
    type: 'size' | 'color',
    value: string,
  ): Promise<string[]> => {
    if (!db) throw new Error('Firestore no inicializado');

    const rawValue = (value || '')
      .trim()
      .replace(/\s+/g, ' ');

    const cleanValue =
      type === 'color'
        ? canonicalizeColor(rawValue)
        : rawValue;

    if (!cleanValue) {
      throw new Error('La opción no puede quedar vacía.');
    }

    const configRef = doc(db, COLLECTIONS.CONFIG, 'main');

    return runTransaction(db, async (transaction) => {
      const snap = await transaction.get(configRef);
      const data: any = snap.exists() ? snap.data() : {};

      const field =
        type === 'size'
          ? 'productSizes'
          : 'productColors';

      const defaults =
        type === 'size'
          ? DEFAULT_PRODUCT_SIZES
          : DEFAULT_PRODUCT_COLORS;

      const stored = Array.isArray(data[field])
        ? data[field]
        : [];

      const combined = [...defaults, ...stored, cleanValue];

      const seen = new Set<string>();

      const normalized = combined
        .map((item) => {
          const clean = String(item || '')
            .trim()
            .replace(/\s+/g, ' ');

          return type === 'color'
            ? canonicalizeColor(clean)
            : clean;
        })
        .filter((item) => {
          if (!item) return false;

          const key =
            type === 'color'
              ? colorComparisonKey(item)
              : normalizeComparableText(item);

          if (seen.has(key)) return false;

          seen.add(key);
          return true;
        });

      transaction.set(
        configRef,
        {
          [field]: normalized,
        },
        { merge: true },
      );

      return normalized;
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

  /**
   * CAMBIO / DEVOLUCIÓN ATÓMICA
   *
   * - conserva la venta original;
   * - registra un adjustment dentro de la venta;
   * - devuelve stock cuando corresponde;
   * - descuenta el producto de reemplazo;
   * - permite volver a cambiar productos que provinieron de un cambio anterior;
   * - recalcula la comisión total de la venta usando la tasa original.
   */
  registerSaleAdjustment: async (
    saleId: string,
    input: {
      sourceLineId: string;
      quantity: number;
      returnToStock: boolean;
      replacementProductId?: string;
      replacementQuantity?: number;
      settlementMethod?: Exclude<PaymentMethod, 'account'>;
      receiptNumber?: string;
      notes?: string;
      userId: string;
      userName: string;
      timestamp?: number;
    },
  ): Promise<SaleAdjustment> => {
    if (!db) throw new Error('Firestore no inicializado');

    const quantity = Math.floor(Number(input.quantity));

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('La cantidad devuelta debe ser mayor que cero.');
    }

    const replacementQuantity = input.replacementProductId
      ? Math.floor(Number(input.replacementQuantity || 1))
      : 0;

    if (
      input.replacementProductId &&
      (!Number.isFinite(replacementQuantity) || replacementQuantity <= 0)
    ) {
      throw new Error('La cantidad del producto nuevo debe ser mayor que cero.');
    }

    const result = await runTransaction(db, async (transaction) => {
      const saleRef = doc(db, COLLECTIONS.SALES, saleId);
      const saleSnap = await transaction.get(saleRef);

      if (!saleSnap.exists()) {
        throw new Error('La venta ya no existe.');
      }

      const sale = saleSnap.data() as Sale;
      const adjustments = Array.isArray(sale.adjustments)
        ? sale.adjustments
        : [];

      if (sale.receivable) {
        const outstanding = (Array.isArray(sale.receivable.installments)
          ? sale.receivable.installments
          : []
        ).reduce(
          (sum, installment) =>
            sum +
            Math.max(
              0,
              Number(installment.amount || 0) -
                Number(installment.paidAmount || 0),
            ),
          0,
        );

        if (outstanding > 0.009) {
          throw new Error(
            `Esta venta tiene $${outstanding.toLocaleString('es-AR')} pendientes en cuenta corriente. Regularizá primero ese saldo antes de registrar un cambio/devolución.`,
          );
        }
      }

      type EffectiveLine = SaleAdjustmentLine & {
        availableQuantity: number;
      };

      const lines = new Map<string, EffectiveLine>();

      sale.items.forEach((item, index) => {
        const originalQuantity = Math.max(
          0,
          Math.floor(Number(item.quantity || 0)),
        );

        const unitAmount = originalQuantity > 0
          ? Number(item.subtotal || 0) / originalQuantity
          : Number(item.priceAtSale || 0);

        const lineId = `orig-${index}`;

        lines.set(lineId, {
          lineId,
          productId: item.productId,
          productName: item.productName,
          productCode: item.productCode,
          shortCode: item.shortCode,
          barcode: item.barcode,
          size: item.size,
          color: item.color,
          quantity: originalQuantity,
          availableQuantity: originalQuantity,
          unitAmount: Math.max(0, unitAmount),
          totalAmount: Math.max(0, unitAmount) * originalQuantity,
          costAtSale: Number.isFinite(Number(item.costAtSale))
            ? Math.max(0, Number(item.costAtSale))
            : undefined,
        });
      });

      adjustments.forEach((adjustment) => {
        const source = lines.get(adjustment.returnedItem.sourceLineId);

        if (source) {
          source.availableQuantity = Math.max(
            0,
            source.availableQuantity -
              Math.max(0, Number(adjustment.returnedItem.quantity || 0)),
          );
        }

        if (adjustment.replacementItem) {
          const replacement = adjustment.replacementItem;

          lines.set(replacement.lineId, {
            ...replacement,
            availableQuantity: Math.max(
              0,
              Number(replacement.quantity || 0),
            ),
          });
        }
      });

      const sourceLine = lines.get(input.sourceLineId);

      if (!sourceLine) {
        throw new Error('No se encontró el producto que se quiere devolver.');
      }

      if (sourceLine.availableQuantity < quantity) {
        throw new Error(
          `Solo quedan ${sourceLine.availableQuantity} unidad(es) disponibles para cambio/devolución.`,
        );
      }

      const productIds = new Set<string>();

      if (input.returnToStock) {
        productIds.add(sourceLine.productId);
      }

      if (input.replacementProductId) {
        productIds.add(input.replacementProductId);
      }

      const productSnapshots = new Map<string, any>();

      for (const productId of Array.from(productIds)) {
        const productRef = doc(db, COLLECTIONS.PRODUCTS, productId);
        const snap = await transaction.get(productRef);

        if (!snap.exists()) {
          throw new Error(
            productId === input.replacementProductId
              ? 'El producto de reemplazo ya no existe.'
              : 'El producto devuelto ya no existe en inventario.',
          );
        }

        productSnapshots.set(productId, snap);
      }

      const stockDeltas = new Map<string, number>();

      const addDelta = (productId: string, delta: number) => {
        stockDeltas.set(
          productId,
          Number(stockDeltas.get(productId) || 0) + delta,
        );
      };

      if (input.returnToStock) {
        addDelta(sourceLine.productId, quantity);
      }

      let replacementItem: SaleAdjustmentLine | undefined;
      const adjustmentId = `adj-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      if (input.replacementProductId) {
        const replacementSnap = productSnapshots.get(
          input.replacementProductId,
        );

        const product = replacementSnap.data() as Product;

        addDelta(input.replacementProductId, -replacementQuantity);

        replacementItem = {
          lineId: `${adjustmentId}-new`,
          productId: replacementSnap.id,
          productName: product.name || 'Producto',
          productCode: product.code,
          shortCode: product.shortCode,
          barcode: product.barcode,
          size: product.size,
          color: product.color,
          quantity: replacementQuantity,
          unitAmount: Math.max(0, Number(product.price || 0)),
          totalAmount:
            Math.max(0, Number(product.price || 0)) * replacementQuantity,
          costAtSale: Math.max(0, Number(product.cost || 0)),
        };
      }

      // Validar stocks resultantes considerando el movimiento neto.
      for (const [productId, delta] of Array.from(stockDeltas.entries())) {
        const snap = productSnapshots.get(productId);
        const product = snap.data() as Product;
        const currentStock = getNumericStock(product.stock);
        const nextStock = currentStock + delta;

        if (nextStock < 0) {
          throw new Error(
            `Stock insuficiente para "${product.name}". Disponible: ${currentStock}.`,
          );
        }
      }

      const returnedUnitAmount = Math.max(0, Number(sourceLine.unitAmount || 0));
      const returnedTotal = returnedUnitAmount * quantity;

      const returnedCostAtSale = Number.isFinite(Number(sourceLine.costAtSale))
        ? Math.max(0, Number(sourceLine.costAtSale))
        : input.returnToStock
          ? Math.max(
              0,
              Number(
                (productSnapshots.get(sourceLine.productId)?.data() as Product | undefined)
                  ?.cost || 0,
              ),
            )
          : undefined;
      const replacementTotal = replacementItem
        ? Number(replacementItem.totalAmount || 0)
        : 0;
      const difference = replacementTotal - returnedTotal;

      if (Math.abs(difference) >= 0.01 && !input.settlementMethod) {
        throw new Error(
          difference > 0
            ? 'Seleccioná cómo se cobrará la diferencia.'
            : 'Seleccioná cómo se realizará la devolución.',
        );
      }

      const baseItemCommissions = Array.isArray(
        sale.commissionBaseItemAmounts,
      )
        ? sale.commissionBaseItemAmounts.map((value) =>
            Math.max(0, Number(value || 0)),
          )
        : sale.items.map((item) =>
            Math.max(0, Number(item.commissionAmount || 0)),
          );

      const baseCommission = Number.isFinite(
        Number(sale.commissionBaseAmount),
      )
        ? Math.max(0, Number(sale.commissionBaseAmount))
        : baseItemCommissions.reduce((sum, value) => sum + value, 0);

      const commissionRate = Number(sale.total || 0) > 0
        ? baseCommission / Number(sale.total || 0)
        : 0;

      const commissionAdjustment = difference * commissionRate;
      const previousCommissionAdjustment = Number(
        sale.commissionAdjustmentTotal || 0,
      );
      const nextCommissionAdjustment =
        previousCommissionAdjustment + commissionAdjustment;
      const targetCommission = Math.max(
        0,
        baseCommission + nextCommissionAdjustment,
      );

      let adjustedItems = sale.items;

      if (baseCommission > 0 && sale.items.length > 0) {
        let accumulated = 0;

        adjustedItems = sale.items.map((item, index) => {
          let amount: number;

          if (index === sale.items.length - 1) {
            amount = Math.max(0, targetCommission - accumulated);
          } else {
            const baseItem = Math.max(
              0,
              Number(baseItemCommissions[index] || 0),
            );
            amount = targetCommission * (baseItem / baseCommission);
            accumulated += amount;
          }

          return {
            ...item,
            commissionAmount: amount,
          };
        });
      }

      const now = input.timestamp || Date.now();

      const adjustment: SaleAdjustment = {
        id: adjustmentId,
        type: replacementItem ? 'exchange' : 'return',
        timestamp: now,
        returnedItem: {
          lineId: `${adjustmentId}-returned`,
          sourceLineId: sourceLine.lineId,
          productId: sourceLine.productId,
          productName: sourceLine.productName,
          productCode: sourceLine.productCode,
          shortCode: sourceLine.shortCode,
          barcode: sourceLine.barcode,
          size: sourceLine.size,
          color: sourceLine.color,
          quantity,
          unitAmount: returnedUnitAmount,
          totalAmount: returnedTotal,
          costAtSale: returnedCostAtSale,
          returnToStock: Boolean(input.returnToStock),
        },
        replacementItem,
        difference,
        settlement: {
          direction:
            Math.abs(difference) < 0.01
              ? 'none'
              : difference > 0
                ? 'charge'
                : 'refund',
          amount: Math.abs(difference),
          method:
            Math.abs(difference) < 0.01
              ? undefined
              : input.settlementMethod,
          receiptNumber:
            input.receiptNumber?.trim() || undefined,
        },
        notes: input.notes?.trim() || undefined,
        recordedByUserId: input.userId,
        recordedByUserName: input.userName,
        commissionAdjustment,
        commissionWasAlreadyPaid: Boolean(sale.commissionPaid),
      };

      // Aplicar stocks.
      for (const [productId, delta] of Array.from(stockDeltas.entries())) {
        const snap = productSnapshots.get(productId);
        const product = snap.data() as Product;
        const currentStock = getNumericStock(product.stock);

        transaction.update(
          doc(db, COLLECTIONS.PRODUCTS, productId),
          {
            stock: currentStock + delta,
            updatedAt: Date.now(),
          },
        );
      }

      transaction.update(
        saleRef,
        cleanData({
          items: adjustedItems,
          adjustments: [...adjustments, adjustment],
          commissionBaseAmount: baseCommission,
          commissionBaseItemAmounts: baseItemCommissions,
          commissionAdjustmentTotal: nextCommissionAdjustment,
        }),
      );

      return adjustment;
    });

    return result;
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
