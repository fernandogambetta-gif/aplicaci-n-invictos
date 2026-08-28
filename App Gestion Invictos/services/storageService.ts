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
  SocietyValuation,
  SocietyAsset,
  SocietyPartner,
  SocietyContribution,
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
  SOCIETY_CONFIG: 'societyConfig',
  SOCIETY_ASSETS: 'societyAssets',
  SOCIETY_PARTNERS: 'societyPartners',
  SOCIETY_CONTRIBUTIONS: 'societyContributions',

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

const getUserByIdOrThrow = async (userId: string): Promise<User> => {
  if (!db) throw new Error('Firestore no inicializado');
  const snap = await getDoc(doc(db, COLLECTIONS.USERS, userId));
  if (!snap.exists()) {
    throw new Error('No se encontró el usuario que realiza la operación.');
  }
  return { ...(snap.data() as User), id: snap.id };
};

const assertAdminUser = async (userId: string): Promise<User> => {
  const user = await getUserByIdOrThrow(userId);
  if (user.role !== 'admin') {
    throw new Error('Acceso denegado. Esta operación requiere un administrador.');
  }
  const security: UserSecurity = {
    ...DEFAULT_SECURITY,
    ...(user.security || {}),
  };
  if (security.isPermanentlyBlocked) {
    throw new Error('El administrador seleccionado está bloqueado.');
  }
  if (security.lockoutUntil && security.lockoutUntil > Date.now()) {
    throw new Error('El administrador seleccionado está temporalmente bloqueado.');
  }
  return user;
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

  getAdminAuthorizationOptions: async (): Promise<Array<{ id: string; name: string }>> => {
    if (!db) return [];
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.USERS), where('role', '==', 'admin')),
    );
    return snap.docs
      .map((item) => {
        const data = item.data() as User;
        return {
          id: item.id,
          name: String(data.name || 'Administrador').trim(),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
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
    requestingUserId: string,
  ): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await assertAdminUser(requestingUserId);
    await updateDoc(doc(db, COLLECTIONS.PRODUCTS, productId), {
      cost: newCost,
      updatedAt: Date.now(),
    });
  },

  deleteProduct: async (
    id: string,
    requestingUserId: string,
  ): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await assertAdminUser(requestingUserId);
    await deleteDoc(doc(db, COLLECTIONS.PRODUCTS, id));
  },

  updateStock: async (
    productId: string,
    quantityChange: number,
    requestingUserId: string,
  ): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    if (!Number.isFinite(quantityChange) || quantityChange === 0) return;
    await assertAdminUser(requestingUserId);
    await updateDoc(doc(db, COLLECTIONS.PRODUCTS, productId), {
      stock: increment(quantityChange),
      updatedAt: Date.now(),
    });
  },

  restockProductAsAdmin: async (
    productId: string,
    quantity: number,
    newCost: number,
    adminUserId: string,
  ): Promise<{ newStock: number; authorizedByName: string }> => {
    if (!db) throw new Error('Firestore no inicializado');
    const cleanQuantity = Number(quantity);
    if (!Number.isFinite(cleanQuantity) || cleanQuantity <= 0) {
      throw new Error('La cantidad a ingresar debe ser mayor que cero.');
    }

    const productRef = doc(db, COLLECTIONS.PRODUCTS, productId);
    const adminRef = doc(db, COLLECTIONS.USERS, adminUserId);
    const movementRef = doc(collection(db, COLLECTIONS.INVENTORY_MOVEMENTS));

    return runTransaction(db, async (transaction) => {
      const adminSnap = await transaction.get(adminRef);
      const productSnap = await transaction.get(productRef);

      if (!adminSnap.exists()) throw new Error('No se encontró el administrador.');
      const admin = { ...(adminSnap.data() as User), id: adminSnap.id };
      if (admin.role !== 'admin') {
        throw new Error('Acceso denegado. Solo un administrador puede confirmar este ingreso.');
      }
      if (!productSnap.exists()) throw new Error('El producto ya no existe en inventario.');

      const product = { ...(productSnap.data() as Product), id: productSnap.id };
      const previousStock = getNumericStock(product.stock);
      const newStock = previousStock + cleanQuantity;
      const now = Date.now();
      const costToSave = Number(newCost);
      const productUpdate: Record<string, unknown> = { stock: newStock, updatedAt: now };
      if (Number.isFinite(costToSave) && costToSave > 0) productUpdate.cost = costToSave;

      transaction.update(productRef, productUpdate);
      transaction.set(movementRef, cleanData({
        id: movementRef.id,
        productId: product.id,
        productName: product.name,
        productCode: product.code,
        barcode: product.barcode,
        size: product.size,
        color: product.color,
        type: 'PURCHASE',
        quantityChange: cleanQuantity,
        previousStock,
        newStock,
        timestamp: now,
        userId: admin.id,
        userName: admin.name,
        referenceId: `ADMIN:${admin.id}`,
        note: 'Ingreso de mercadería confirmado por administrador.',
        unitCost: Number.isFinite(costToSave) && costToSave > 0 ? costToSave : Number(product.cost || 0),
      }));

      return { newStock, authorizedByName: admin.name };
    });
  },

  restockProductWithAdminAuthorization: async (
    productId: string,
    quantity: number,
    newCost: number,
    requestingUserId: string,
    adminUserId: string,
    adminPin: string,
  ): Promise<{ newStock: number; authorizedByName: string }> => {
    if (!db) throw new Error('Firestore no inicializado');
    const cleanQuantity = Number(quantity);
    const cleanPin = String(adminPin || '').trim();
    if (!Number.isFinite(cleanQuantity) || cleanQuantity <= 0) {
      throw new Error('La cantidad a ingresar debe ser mayor que cero.');
    }
    if (!/^\d{4}$/.test(cleanPin)) {
      throw new Error('El PIN del administrador debe tener 4 números.');
    }

    const requesterRef = doc(db, COLLECTIONS.USERS, requestingUserId);
    const adminRef = doc(db, COLLECTIONS.USERS, adminUserId);
    const productRef = doc(db, COLLECTIONS.PRODUCTS, productId);
    const movementRef = doc(collection(db, COLLECTIONS.INVENTORY_MOVEMENTS));

    return runTransaction(db, async (transaction) => {
      const requesterSnap = await transaction.get(requesterRef);
      const adminSnap = await transaction.get(adminRef);
      const productSnap = await transaction.get(productRef);

      if (!requesterSnap.exists()) throw new Error('No se encontró el vendedor que solicita el ingreso.');
      const requester = { ...(requesterSnap.data() as User), id: requesterSnap.id };
      if (requester.role !== 'seller') {
        throw new Error('Esta autorización está reservada para ingresos solicitados por vendedores.');
      }

      if (!adminSnap.exists()) throw new Error('No se encontró el administrador seleccionado.');
      const admin = { ...(adminSnap.data() as User), id: adminSnap.id };
      if (admin.role !== 'admin') throw new Error('El usuario seleccionado no es administrador.');

      const adminSecurity: UserSecurity = {
        ...DEFAULT_SECURITY,
        ...(admin.security || {}),
      };
      if (adminSecurity.isPermanentlyBlocked) {
        throw new Error('El administrador seleccionado está bloqueado.');
      }
      if (adminSecurity.lockoutUntil && adminSecurity.lockoutUntil > Date.now()) {
        throw new Error('El administrador seleccionado está temporalmente bloqueado.');
      }
      if (String(admin.pin || '').trim() !== cleanPin) {
        throw new Error('PIN del administrador incorrecto.');
      }
      if (!productSnap.exists()) throw new Error('El producto ya no existe en inventario.');

      const product = { ...(productSnap.data() as Product), id: productSnap.id };
      const previousStock = getNumericStock(product.stock);
      const newStock = previousStock + cleanQuantity;
      const now = Date.now();
      const costToSave = Number(newCost);
      const productUpdate: Record<string, unknown> = { stock: newStock, updatedAt: now };
      if (Number.isFinite(costToSave) && costToSave > 0) productUpdate.cost = costToSave;

      transaction.update(productRef, productUpdate);
      transaction.set(movementRef, cleanData({
        id: movementRef.id,
        productId: product.id,
        productName: product.name,
        productCode: product.code,
        barcode: product.barcode,
        size: product.size,
        color: product.color,
        type: 'PURCHASE',
        quantityChange: cleanQuantity,
        previousStock,
        newStock,
        timestamp: now,
        userId: requester.id,
        userName: requester.name,
        referenceId: `AUTHORIZED_BY:${admin.id}`,
        note: `Ingreso realizado por ${requester.name} y autorizado por ${admin.name}.`,
        unitCost: Number.isFinite(costToSave) && costToSave > 0 ? costToSave : Number(product.cost || 0),
      }));

      return { newStock, authorizedByName: admin.name };
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

  // ================= SOCIEDAD / PARTICIPACIONES =================
  getSocietyValuation: async (
    requestingUserId: string,
  ): Promise<SocietyValuation | null> => {
    if (!db) throw new Error('Firestore no inicializado');
    await assertAdminUser(requestingUserId);

    const snap = await getDoc(
      doc(db, COLLECTIONS.SOCIETY_CONFIG, 'main'),
    );

    if (!snap.exists()) return null;

    return {
      ...(snap.data() as SocietyValuation),
      id: 'main',
    };
  },

  saveSocietyValuationDraft: async (
    valuation: SocietyValuation,
    requestingUserId: string,
  ): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    const admin = await assertAdminUser(requestingUserId);

    const ref = doc(db, COLLECTIONS.SOCIETY_CONFIG, 'main');
    const existing = await getDoc(ref);

    if (
      existing.exists() &&
      (existing.data() as SocietyValuation).status === 'locked'
    ) {
      throw new Error(
        'La valuación inicial ya fue cerrada y no puede modificarse.',
      );
    }

    const inventorySuggestedValue = Number(
      valuation.inventorySuggestedValue,
    );
    const inventoryAgreedValue = Number(
      valuation.inventoryAgreedValue,
    );

    if (
      !Number.isFinite(inventorySuggestedValue) ||
      inventorySuggestedValue < 0 ||
      !Number.isFinite(inventoryAgreedValue) ||
      inventoryAgreedValue < 0
    ) {
      throw new Error('Los valores de inventario son inválidos.');
    }

    const now = Date.now();
    const previous = existing.exists()
      ? (existing.data() as SocietyValuation)
      : null;

    await setDoc(
      ref,
      cleanData({
        ...valuation,
        id: 'main',
        status: 'draft',
        inventorySuggestedValue,
        inventoryAgreedValue,
        createdAt: previous?.createdAt || valuation.createdAt || now,
        createdByUserId:
          previous?.createdByUserId || valuation.createdByUserId || admin.id,
        createdByUserName:
          previous?.createdByUserName || valuation.createdByUserName || admin.name,
        updatedAt: now,
        updatedByUserId: admin.id,
        updatedByUserName: admin.name,
      }),
      { merge: true },
    );
  },

  lockSocietyValuation: async (
    requestingUserId: string,
  ): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    const admin = await assertAdminUser(requestingUserId);
    const ref = doc(db, COLLECTIONS.SOCIETY_CONFIG, 'main');

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);

      if (!snap.exists()) {
        throw new Error(
          'Primero guardá la valuación inicial antes de cerrarla.',
        );
      }

      const data = snap.data() as SocietyValuation;

      if (data.status === 'locked') return;

      const now = Date.now();

      transaction.update(ref, {
        status: 'locked',
        lockedAt: now,
        lockedByUserId: admin.id,
        lockedByUserName: admin.name,
        updatedAt: now,
        updatedByUserId: admin.id,
        updatedByUserName: admin.name,
      });
    });
  },

  getSocietyAssets: async (
    requestingUserId: string,
  ): Promise<SocietyAsset[]> => {
    if (!db) throw new Error('Firestore no inicializado');
    await assertAdminUser(requestingUserId);

    const snap = await getDocs(
      collection(db, COLLECTIONS.SOCIETY_ASSETS),
    );

    return mapDocs<SocietyAsset>(snap).sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'es'),
    );
  },

  saveSocietyAsset: async (
    asset: SocietyAsset,
    requestingUserId: string,
  ): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    const admin = await assertAdminUser(requestingUserId);

    const valuationSnap = await getDoc(
      doc(db, COLLECTIONS.SOCIETY_CONFIG, 'main'),
    );

    if (
      valuationSnap.exists() &&
      (valuationSnap.data() as SocietyValuation).status === 'locked'
    ) {
      throw new Error(
        'La valuación inicial está cerrada. Los bienes de esa valuación ya no pueden modificarse.',
      );
    }

    const cleanName = String(asset.name || '').trim();
    const quantity = Number(asset.quantity);
    const agreedValue = Number(asset.agreedValue);

    if (!cleanName) throw new Error('Indicá el nombre del bien o pasivo.');
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('La cantidad debe ser mayor que cero.');
    }
    if (!Number.isFinite(agreedValue) || agreedValue < 0) {
      throw new Error('El valor acordado es inválido.');
    }
    if (!asset.includedInSociety && !String(asset.ownerName || '').trim()) {
      throw new Error(
        'Para un bien excluido indicá quién conserva su propiedad.',
      );
    }

    const ref = doc(db, COLLECTIONS.SOCIETY_ASSETS, asset.id);
    const existing = await getDoc(ref);
    const previous = existing.exists()
      ? (existing.data() as SocietyAsset)
      : null;
    const now = Date.now();

    await setDoc(
      ref,
      cleanData({
        ...asset,
        id: asset.id,
        name: cleanName,
        quantity,
        agreedValue,
        ownerName: asset.includedInSociety
          ? undefined
          : String(asset.ownerName || '').trim(),
        createdAt: previous?.createdAt || asset.createdAt || now,
        createdByUserId:
          previous?.createdByUserId || asset.createdByUserId || admin.id,
        createdByUserName:
          previous?.createdByUserName || asset.createdByUserName || admin.name,
        updatedAt: now,
        updatedByUserId: admin.id,
        updatedByUserName: admin.name,
      }),
      { merge: true },
    );
  },

  deleteSocietyAsset: async (
    assetId: string,
    requestingUserId: string,
  ): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await assertAdminUser(requestingUserId);

    const valuationSnap = await getDoc(
      doc(db, COLLECTIONS.SOCIETY_CONFIG, 'main'),
    );

    if (
      valuationSnap.exists() &&
      (valuationSnap.data() as SocietyValuation).status === 'locked'
    ) {
      throw new Error(
        'La valuación inicial está cerrada. Los bienes ya no pueden eliminarse.',
      );
    }

    await deleteDoc(doc(db, COLLECTIONS.SOCIETY_ASSETS, assetId));
  },

  getSocietyPartners: async (
    requestingUserId: string,
  ): Promise<SocietyPartner[]> => {
    if (!db) throw new Error('Firestore no inicializado');
    await assertAdminUser(requestingUserId);

    const snap = await getDocs(
      collection(db, COLLECTIONS.SOCIETY_PARTNERS),
    );

    return mapDocs<SocietyPartner>(snap).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'original' ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''), 'es');
    });
  },

  saveSocietyPartner: async (
    partner: SocietyPartner,
    requestingUserId: string,
  ): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    const admin = await assertAdminUser(requestingUserId);

    const cleanName = String(partner.name || '').trim();
    if (!cleanName) throw new Error('Indicá el nombre del socio.');

    if (partner.kind === 'original') {
      const initial = Number(partner.initialOwnershipPercentage);
      if (!Number.isFinite(initial) || initial <= 0 || initial > 100) {
        throw new Error(
          'La participación inicial del socio original debe ser mayor a 0 y hasta 100%.',
        );
      }
    } else {
      const target = Number(partner.targetPercentage);
      const required = Number(partner.requiredContribution);

      if (!Number.isFinite(target) || target <= 0 || target > 100) {
        throw new Error(
          'El porcentaje objetivo debe ser mayor a 0 y hasta 100%.',
        );
      }
      if (!Number.isFinite(required) || required <= 0) {
        throw new Error(
          'Indicá el aporte total acordado que debe integrar el nuevo socio.',
        );
      }

      const allPartnersSnap = await getDocs(
        collection(db, COLLECTIONS.SOCIETY_PARTNERS),
      );
      const otherIncomingTarget = allPartnersSnap.docs.reduce(
        (sum, partnerDoc) => {
          if (partnerDoc.id === partner.id) return sum;
          const item = partnerDoc.data() as SocietyPartner;
          if (item.kind !== 'incoming' || item.active === false) return sum;
          return sum + Number(item.targetPercentage || 0);
        },
        0,
      );

      if (otherIncomingTarget + target > 100.0001) {
        throw new Error(
          'La suma de los porcentajes objetivo de los socios entrantes no puede superar el 100%.',
        );
      }
    }

    const ref = doc(db, COLLECTIONS.SOCIETY_PARTNERS, partner.id);
    const existingSnap = await getDoc(ref);
    const previous = existingSnap.exists()
      ? ({ ...(existingSnap.data() as SocietyPartner), id: existingSnap.id })
      : null;

    if (previous) {
      const contributionsSnap = await getDocs(
        query(
          collection(db, COLLECTIONS.SOCIETY_CONTRIBUTIONS),
          where('partnerId', '==', partner.id),
        ),
      );

      const hasActiveContributions = contributionsSnap.docs.some(
        (item) => !(item.data() as SocietyContribution).voided,
      );

      if (hasActiveContributions) {
        const previousEconomic = JSON.stringify({
          kind: previous.kind,
          initialOwnershipPercentage:
            Number(previous.initialOwnershipPercentage || 0),
          targetPercentage: Number(previous.targetPercentage || 0),
          requiredContribution: Number(previous.requiredContribution || 0),
          installmentPlan: (previous.installmentPlan || []).map((item) => ({
            number: Number(item.number || 0),
            dueDate: Number(item.dueDate || 0),
            amount: Number(item.amount || 0),
          })),
        });
        const nextEconomic = JSON.stringify({
          kind: partner.kind,
          initialOwnershipPercentage:
            Number(partner.initialOwnershipPercentage || 0),
          targetPercentage: Number(partner.targetPercentage || 0),
          requiredContribution: Number(partner.requiredContribution || 0),
          installmentPlan: (partner.installmentPlan || []).map((item) => ({
            number: Number(item.number || 0),
            dueDate: Number(item.dueDate || 0),
            amount: Number(item.amount || 0),
          })),
        });

        if (previousEconomic !== nextEconomic) {
          throw new Error(
            'Este socio ya tiene aportes registrados. Para preservar la historia no se pueden cambiar sus condiciones económicas; solo nombre, notas o estado.',
          );
        }
      }
    }

    const now = Date.now();

    await setDoc(
      ref,
      cleanData({
        ...partner,
        id: partner.id,
        name: cleanName,
        active: partner.active !== false,
        createdAt: previous?.createdAt || partner.createdAt || now,
        createdByUserId:
          previous?.createdByUserId || partner.createdByUserId || admin.id,
        createdByUserName:
          previous?.createdByUserName || partner.createdByUserName || admin.name,
        updatedAt: now,
        updatedByUserId: admin.id,
        updatedByUserName: admin.name,
      }),
      { merge: true },
    );
  },

  deleteSocietyPartner: async (
    partnerId: string,
    requestingUserId: string,
  ): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    await assertAdminUser(requestingUserId);

    const contributionsSnap = await getDocs(
      query(
        collection(db, COLLECTIONS.SOCIETY_CONTRIBUTIONS),
        where('partnerId', '==', partnerId),
        limit(1),
      ),
    );

    if (!contributionsSnap.empty) {
      throw new Error(
        'No se puede eliminar un socio con aportes registrados. Podés dejarlo inactivo o conservarlo como parte del historial.',
      );
    }

    await deleteDoc(doc(db, COLLECTIONS.SOCIETY_PARTNERS, partnerId));
  },

  getSocietyContributions: async (
    requestingUserId: string,
  ): Promise<SocietyContribution[]> => {
    if (!db) throw new Error('Firestore no inicializado');
    await assertAdminUser(requestingUserId);

    const snap = await getDocs(
      collection(db, COLLECTIONS.SOCIETY_CONTRIBUTIONS),
    );

    return mapDocs<SocietyContribution>(snap).sort(
      (a, b) => Number(b.date || 0) - Number(a.date || 0),
    );
  },

  saveSocietyContribution: async (
    contribution: SocietyContribution,
    requestingUserId: string,
  ): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    const admin = await assertAdminUser(requestingUserId);

    const valuationSnap = await getDoc(
      doc(db, COLLECTIONS.SOCIETY_CONFIG, 'main'),
    );

    if (
      !valuationSnap.exists() ||
      (valuationSnap.data() as SocietyValuation).status !== 'locked'
    ) {
      throw new Error(
        'La valuación inicial debe estar cerrada antes de registrar aportes societarios.',
      );
    }

    const partnerSnap = await getDoc(
      doc(db, COLLECTIONS.SOCIETY_PARTNERS, contribution.partnerId),
    );

    if (!partnerSnap.exists()) {
      throw new Error('No se encontró el socio seleccionado.');
    }

    const partner = {
      ...(partnerSnap.data() as SocietyPartner),
      id: partnerSnap.id,
    };

    if (partner.kind !== 'incoming') {
      throw new Error(
        'Los aportes de integración se registran para socios entrantes.',
      );
    }

    const amount = Number(contribution.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('El importe del aporte debe ser mayor que cero.');
    }

    const contributionDate = Number(contribution.date || 0);
    if (!Number.isFinite(contributionDate) || contributionDate <= 0) {
      throw new Error('La fecha del aporte es inválida.');
    }

    const nowDate = new Date();
    const endOfToday = new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate(),
      23,
      59,
      59,
      999,
    ).getTime();

    if (contributionDate > endOfToday) {
      throw new Error(
        'No se puede registrar como pagado un aporte con fecha futura.',
      );
    }

    const required = Number(partner.requiredContribution || 0);
    if (!Number.isFinite(required) || required <= 0) {
      throw new Error(
        'El socio no tiene definido un aporte total acordado.',
      );
    }

    const previousSnap = await getDocs(
      query(
        collection(db, COLLECTIONS.SOCIETY_CONTRIBUTIONS),
        where('partnerId', '==', partner.id),
      ),
    );

    const alreadyPaid = previousSnap.docs.reduce((sum, item) => {
      const data = item.data() as SocietyContribution;
      if (data.voided) return sum;
      if (item.id === contribution.id) return sum;
      return sum + Number(data.amount || 0);
    }, 0);

    if (alreadyPaid + amount > required + 0.01) {
      throw new Error(
        `El aporte supera el saldo pendiente. Restan $${Math.max(
          0,
          required - alreadyPaid,
        ).toLocaleString('es-AR')}.`,
      );
    }

    const now = Date.now();

    await setDoc(
      doc(db, COLLECTIONS.SOCIETY_CONTRIBUTIONS, contribution.id),
      cleanData({
        ...contribution,
        id: contribution.id,
        partnerName: partner.name,
        amount,
        recordedAt: contribution.recordedAt || now,
        recordedByUserId: admin.id,
        recordedByUserName: admin.name,
        voided: false,
      }),
      { merge: false },
    );
  },

  voidSocietyContribution: async (
    contributionId: string,
    reason: string,
    requestingUserId: string,
  ): Promise<void> => {
    if (!db) throw new Error('Firestore no inicializado');
    const admin = await assertAdminUser(requestingUserId);
    const cleanReason = String(reason || '').trim();

    if (!cleanReason) {
      throw new Error('Indicá el motivo de la anulación.');
    }

    const ref = doc(
      db,
      COLLECTIONS.SOCIETY_CONTRIBUTIONS,
      contributionId,
    );

    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('No se encontró el aporte.');

    const data = snap.data() as SocietyContribution;
    if (data.voided) return;

    await updateDoc(ref, {
      voided: true,
      voidedAt: Date.now(),
      voidedByUserId: admin.id,
      voidedByUserName: admin.name,
      voidReason: cleanReason,
    });
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
