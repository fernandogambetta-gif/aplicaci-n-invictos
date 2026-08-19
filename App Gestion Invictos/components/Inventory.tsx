import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, CategoryItem, ProviderItem, User } from '../types';
import {
  Plus,
  Search,
  Trash2,
  Edit2,
  Save,
  X,
  Tag,
  Truck,
  Barcode,
  FolderCog,
  Briefcase,
  PackagePlus,
  ArrowRight,
  Download,
  Loader2,
  RefreshCw,
  Shirt,
  Palette,
  AlertTriangle,
  Camera,
  Printer,
  Megaphone,
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import BarcodeScannerModal from './BarcodeScannerModal';
import BarcodeLabelModal from './BarcodeLabelModal';
import ProviderManagementModal from './ProviderManagementModal';
import VariantLookupModal from './VariantLookupModal';

interface InventoryProps {
  products: Product[];
  currentUser: User;
  onUpdate: () => void | Promise<void>;
}

interface VariantDraft {
  key: string;
  size: string;
  color: string;
  stock: number;
  enabled: boolean;
}

/**
 * Portal fuera del componente:
 * evita que el modal se desmonte/monte en cada render y pierda el foco.
 */
const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

const Inventory: React.FC<InventoryProps> = ({
  products: incomingProducts,
  currentUser,
  onUpdate,
}) => {
  // Protección defensiva: Inventario nunca trabaja con products undefined/null.
  const products: Product[] = Array.isArray(incomingProducts)
    ? incomingProducts
    : [];

  const shortCodeMigrationStarted = useRef(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Management Modals
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [scanError, setScanError] = useState('');
  const [labelProduct, setLabelProduct] = useState<Product | null>(null);
  const [labelStockEntryQuantity, setLabelStockEntryQuantity] = useState<number | undefined>(undefined);
  const [generateRestockLabels, setGenerateRestockLabels] = useState(false);
  const [isVariantLookupOpen, setIsVariantLookupOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterSize, setFilterSize] = useState<string>('ALL');

  // Lists
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [providers, setProviders] = useState<ProviderItem[]>([]);

  // Input states for managers
  const [newCategoryName, setNewCategoryName] = useState('');

  const [editingCategoryId, setEditingCategoryId] =
    useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] =
    useState('');
  const [isSavingCategory, setIsSavingCategory] =
    useState(false);
  const [categoryMessage, setCategoryMessage] =
    useState('');

  const [formError, setFormError] = useState('');

  // Alta masiva de variantes desde el único botón "Nuevo Producto".
  const [newProductSizes, setNewProductSizes] = useState<string[]>([]);
  const [newProductColors, setNewProductColors] = useState<string[]>([]);
  const [newSizeInput, setNewSizeInput] = useState('');
  const [newColorInput, setNewColorInput] = useState('');
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([]);

  // Combinaciones eliminadas manualmente durante el alta.
  // Se mantienen fuera de la matriz aunque cambie el stock de otras variantes.
  const [excludedVariantKeys, setExcludedVariantKeys] = useState<string[]>([]);

  // Form State for Products
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    code: '',
    barcode: '',
    category: '',
    provider: '',
    price: 0,
    cost: 0,
    stock: 0,
    minStock: 3,
    size: '',
    color: '',
    gender: '',
    description: '',
    salesNote: '',
    active: true,
    commissionPercentage: undefined,
  });

  // State for Restock
  const [restockProductId, setRestockProductId] = useState<string>('');
  const [restockSearch, setRestockSearch] = useState('');
  const [restockQuantity, setRestockQuantity] = useState<number>(0);
  const [restockNewCost, setRestockNewCost] = useState<number>(0);

  const loadLists = useCallback(async () => {
    const [cats, provs] = await Promise.all([
      StorageService.getCategories(),
      StorageService.getProviders(),
    ]);

    setCategories(cats);
    setProviders(provs);

    setFormData((prev) => ({
      ...prev,
      category: prev.category || (cats.length > 0 ? cats[0].name : ''),
      provider: prev.provider || (provs.length > 0 ? provs[0].name : ''),
    }));
  }, []);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  // Completa automáticamente códigos cortos en productos anteriores.
  useEffect(() => {
    if (
      shortCodeMigrationStarted.current ||
      products.length === 0 ||
      !products.some((product) => !(product.shortCode || '').trim())
    ) {
      return;
    }

    shortCodeMigrationStarted.current = true;

    void (async () => {
      try {
        const updated = await StorageService.ensureProductShortCodes();

        if (updated > 0) {
          await Promise.resolve(onUpdate());
        }
      } catch (error) {
        console.error('No se pudieron completar los códigos cortos:', error);
      }
    })();
  }, [products, onUpdate]);

  // ===============================
  // Helpers de identificación
  // ===============================

  const calculateEanCheckDigit = (twelveDigits: string): number => {
    const digits = twelveDigits.split('').map(Number);
    const sum = digits.reduce(
      (acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3),
      0,
    );
    return (10 - (sum % 10)) % 10;
  };

  /**
   * Genera un código corto único para QR y búsqueda manual.
   */
  const generateShortCode = (): string => {
    const existing = new Set(
      products
        .map((p) => (p.shortCode || '').trim())
        .filter(Boolean),
    );

    let candidate = 1000;

    while (existing.has(String(candidate))) {
      candidate += 1;
    }

    return String(candidate);
  };

  /**
   * Genera un número de 13 dígitos para uso interno de INVICTOS.
   * Se valida contra los códigos ya cargados en memoria para evitar duplicados.
   */
  const generateInternalBarcode = (): string => {
    const existing = new Set(
      products
        .map((p) => (p.barcode || '').trim())
        .filter(Boolean),
    );

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const timePart = String(Date.now() + attempt).slice(-8);
      const randomPart = String(Math.floor(Math.random() * 100))
        .padStart(2, '0');

      const base12 = `20${timePart}${randomPart}`; // 12 dígitos
      const candidate = `${base12}${calculateEanCheckDigit(base12)}`;

      if (!existing.has(candidate)) return candidate;
    }

    // Fallback extremadamente improbable
    const base12 = `20${String(Date.now()).slice(-10)}`;
    return `${base12}${calculateEanCheckDigit(base12)}`;
  };

  const generateSku = (): string => {
    const existing = new Set(
      products
        .map((p) => (p.code || '').trim().toUpperCase())
        .filter(Boolean),
    );

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = `INV-${String(Date.now() + attempt).slice(-7)}`;
      if (!existing.has(candidate.toUpperCase())) return candidate;
    }

    return `INV-${Date.now()}`;
  };

  const buildEmptyForm = (): Partial<Product> => ({
    name: '',
    code: generateSku(),
    shortCode: generateShortCode(),
    barcode: generateInternalBarcode(),
    category: categories.length > 0 ? categories[0].name : '',
    provider: providers.length > 0 ? providers[0].name : '',
    price: 0,
    cost: 0,
    stock: 0,
    minStock: 3,
    size: '',
    color: '',
    gender: '',
    description: '',
    salesNote: '',
    active: true,
    commissionPercentage: undefined,
  });

  const normalizeVariantValue = (value: string): string =>
    value.trim().replace(/\s+/g, ' ');

  const variantKey = (size: string, color: string): string =>
    `${normalizeVariantValue(size).toLowerCase()}||${normalizeVariantValue(
      color,
    ).toLowerCase()}`;

  const addSize = () => {
    const value = normalizeVariantValue(newSizeInput);

    if (!value) return;

    if (
      newProductSizes.some(
        (item) => item.toLowerCase() === value.toLowerCase(),
      )
    ) {
      setNewSizeInput('');
      return;
    }

    setNewProductSizes((prev) => [...prev, value]);
    setNewSizeInput('');
  };

  const addColor = () => {
    const value = normalizeVariantValue(newColorInput);

    if (!value) return;

    if (
      newProductColors.some(
        (item) => item.toLowerCase() === value.toLowerCase(),
      )
    ) {
      setNewColorInput('');
      return;
    }

    setNewProductColors((prev) => [...prev, value]);
    setNewColorInput('');
  };

  const removeSize = (size: string) => {
    setNewProductSizes((prev) =>
      prev.filter((item) => item !== size),
    );
  };

  const removeColor = (color: string) => {
    setNewProductColors((prev) =>
      prev.filter((item) => item !== color),
    );
  };

  // Construye automáticamente talle × color.
  // Si no se carga talle ni color, queda una única variante "sin variante".
  useEffect(() => {
    if (!isModalOpen || formData.id) return;

    const sizes =
      newProductSizes.length > 0 ? newProductSizes : [''];

    const colors =
      newProductColors.length > 0 ? newProductColors : [''];

    const combinations = sizes
      .flatMap((size) =>
        colors.map((color) => ({
          key: variantKey(size, color),
          size,
          color,
        })),
      )
      .filter(
        (combination) =>
          !excludedVariantKeys.includes(combination.key),
      );

    setVariantDrafts((previous) => {
      const previousMap = new Map(
        previous.map((variant) => [variant.key, variant]),
      );

      return combinations.map((combination) => {
        const existing = previousMap.get(combination.key);

        if (existing) {
          return {
            ...existing,
            size: combination.size,
            color: combination.color,
          };
        }

        return {
          ...combination,
          stock: 0,
          enabled: true,
        };
      });
    });
  }, [
    isModalOpen,
    formData.id,
    newProductSizes,
    newProductColors,
    excludedVariantKeys,
  ]);

  const deleteVariantCombination = (key: string) => {
    setExcludedVariantKeys((prev) =>
      prev.includes(key) ? prev : [...prev, key],
    );

    setVariantDrafts((prev) =>
      prev.filter((variant) => variant.key !== key),
    );
  };

  const restoreVariantCombinations = () => {
    setExcludedVariantKeys([]);
  };

  const activeVariantDrafts = variantDrafts.filter(
    (variant) => variant.enabled,
  );

  const activeVariantUnits = activeVariantDrafts.reduce(
    (total, variant) => total + Number(variant.stock || 0),
    0,
  );

  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      code: '',
      shortCode: '',
      barcode: '',
      category: categories.length > 0 ? categories[0].name : '',
      provider: providers.length > 0 ? providers[0].name : '',
      price: 0,
      cost: 0,
      stock: 0,
      minStock: 3,
      size: '',
      color: '',
      gender: '',
      description: '',
      salesNote: '',
      active: true,
      commissionPercentage: undefined,
    });
    setNewProductSizes([]);
    setNewProductColors([]);
    setNewSizeInput('');
    setNewColorInput('');
    setVariantDrafts([]);
    setExcludedVariantKeys([]);
    setFormError('');
  }, [categories, providers]);

  const handleOpenNewProduct = () => {
    setFormError('');
    setNewProductSizes([]);
    setNewProductColors([]);
    setNewSizeInput('');
    setNewColorInput('');
    setVariantDrafts([]);
    setExcludedVariantKeys([]);
    setFormData(buildEmptyForm());
    setIsModalOpen(true);
  };

  // ===============================
  // Guardado de producto
  // ===============================

  const handleSave = async () => {
    const name = (formData.name || '').trim();
    const category = formData.category || '';
    const provider = formData.provider || '';

    const price = Number(formData.price);
    const cost = Number(formData.cost ?? 0);
    const minStock = Number(formData.minStock ?? 0);

    setFormError('');

    if (!name || !category || !provider) {
      setFormError('Completá nombre, categoría y proveedor.');
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setFormError('El precio debe ser mayor que cero.');
      return;
    }

    if (!Number.isFinite(cost) || cost < 0) {
      setFormError('El costo no puede ser negativo.');
      return;
    }

    if (!Number.isFinite(minStock) || minStock < 0) {
      setFormError('El stock mínimo no puede ser negativo.');
      return;
    }

    // ======================================================
    // EDICIÓN: sigue siendo individual, como hasta ahora.
    // ======================================================
    if (formData.id) {
      const code = (formData.code || '').trim();
      const shortCode = (formData.shortCode || '')
        .replace(/\D/g, '')
        .trim();
      const barcodeValue = (formData.barcode || '').trim();

      if (!code) {
        setFormError('El producto debe tener un código / SKU.');
        return;
      }

      if (!/^\d{4,6}$/.test(shortCode)) {
        setFormError(
          'El código corto / QR debe tener entre 4 y 6 números.',
        );
        return;
      }

      if (!barcodeValue) {
        setFormError(
          'El producto debe tener un código de barras.',
        );
        return;
      }

      const duplicateCode = products.find(
        (p) =>
          p.id !== formData.id &&
          (p.code || '').trim().toLowerCase() ===
            code.toLowerCase(),
      );

      if (duplicateCode) {
        setFormError(
          `El SKU "${code}" ya está usado por "${duplicateCode.name}".`,
        );
        return;
      }

      const duplicateShortCode = products.find(
        (p) =>
          p.id !== formData.id &&
          (p.shortCode || '').trim() === shortCode,
      );

      if (duplicateShortCode) {
        setFormError(
          `El código corto "${shortCode}" ya está usado por "${duplicateShortCode.name}".`,
        );
        return;
      }

      const duplicateBarcode = products.find(
        (p) =>
          p.id !== formData.id &&
          (p.barcode || '').trim() === barcodeValue,
      );

      if (duplicateBarcode) {
        setFormError(
          `El código de barras "${barcodeValue}" ya está usado por "${duplicateBarcode.name}".`,
        );
        return;
      }

      setIsSaving(true);

      try {
        const currentProduct = products.find(
          (p) => p.id === formData.id,
        );

        const updatedProduct: Product = {
          id: formData.id,
          code,
          shortCode,
          barcode: barcodeValue,
          parentProductId: formData.parentProductId,
          name,
          category,
          provider,
          price,
          cost,
          stock: Number(currentProduct?.stock ?? 0),
          minStock,
          size: (formData.size || '').trim(),
          color: (formData.color || '').trim(),
          gender: (formData.gender || '').trim(),
          description: (formData.description as string) || '',
          salesNote: (formData.salesNote as string) || '',
          active: formData.active !== false,
          createdAt: formData.createdAt,
          updatedAt: formData.updatedAt,
          commissionPercentage: formData.commissionPercentage,
        };

        await StorageService.saveProduct(updatedProduct);
        await Promise.resolve(onUpdate());

        setIsModalOpen(false);
        resetForm();
      } catch (error: any) {
        console.error('Error guardando producto:', error);
        setFormError(
          error?.message || 'No se pudo guardar el producto.',
        );
      } finally {
        setIsSaving(false);
      }

      return;
    }

    // ======================================================
    // NUEVO PRODUCTO: alta conjunta de todas las variantes.
    // ======================================================
    if (!activeVariantDrafts.length) {
      setFormError(
        'Debe quedar al menos una combinación de talle/color para crear.',
      );
      return;
    }

    const invalidStock = activeVariantDrafts.find(
      (variant) =>
        !Number.isFinite(Number(variant.stock)) ||
        Number(variant.stock) < 0,
    );

    if (invalidStock) {
      setFormError(
        'La cantidad inicial de cada variante debe ser cero o mayor.',
      );
      return;
    }

    // Impide duplicar una combinación ya existente con el mismo nombre.
    const duplicatedCombination = activeVariantDrafts.find(
      (variant) =>
        products.some(
          (product) =>
            (product.name || '').trim().toLowerCase() ===
              name.toLowerCase() &&
            (product.size || '').trim().toLowerCase() ===
              variant.size.trim().toLowerCase() &&
            (product.color || '').trim().toLowerCase() ===
              variant.color.trim().toLowerCase(),
        ),
    );

    if (duplicatedCombination) {
      setFormError(
        `Ya existe "${name}" con talle "${
          duplicatedCombination.size || 'sin talle'
        }" y color "${
          duplicatedCombination.color || 'sin color'
        }".`,
      );
      return;
    }

    setIsSaving(true);

    try {
      const familyId = `family-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      const reservedShortCodes = new Set(
        products
          .map((product) => (product.shortCode || '').trim())
          .filter(Boolean),
      );

      const reservedCodes = new Set(
        products
          .map((product) =>
            (product.code || '').trim().toUpperCase(),
          )
          .filter(Boolean),
      );

      const reservedBarcodes = new Set(
        products
          .map((product) => (product.barcode || '').trim())
          .filter(Boolean),
      );

      let nextShortCode = 1000;

      const takeShortCode = (): string => {
        while (
          reservedShortCodes.has(String(nextShortCode))
        ) {
          nextShortCode += 1;
        }

        const result = String(nextShortCode);
        reservedShortCodes.add(result);
        nextShortCode += 1;
        return result;
      };

      const takeSku = (index: number): string => {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const candidate = `INV-${String(
            Date.now() + index * 100 + attempt,
          ).slice(-7)}`;

          if (!reservedCodes.has(candidate.toUpperCase())) {
            reservedCodes.add(candidate.toUpperCase());
            return candidate;
          }
        }

        const fallback = `INV-${Date.now()}-${index + 1}`;
        reservedCodes.add(fallback.toUpperCase());
        return fallback;
      };

      const takeBarcode = (index: number): string => {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const timePart = String(
            Date.now() + index * 100 + attempt,
          ).slice(-8);

          const randomPart = String(
            Math.floor(Math.random() * 100),
          ).padStart(2, '0');

          const base12 = `20${timePart}${randomPart}`;
          const candidate = `${base12}${calculateEanCheckDigit(
            base12,
          )}`;

          if (!reservedBarcodes.has(candidate)) {
            reservedBarcodes.add(candidate);
            return candidate;
          }
        }

        const base12 = `20${String(
          Date.now() + index,
        ).slice(-10)}`;

        const fallback = `${base12}${calculateEanCheckDigit(
          base12,
        )}`;

        reservedBarcodes.add(fallback);
        return fallback;
      };

      const createdAt = Date.now();

      const newProducts: Product[] = activeVariantDrafts.map(
        (variant, index) => ({
          id: `${createdAt}-${index}-${Math.random()
            .toString(36)
            .slice(2, 7)}`,
          code: takeSku(index),
          shortCode: takeShortCode(),
          barcode: takeBarcode(index),
          parentProductId: familyId,

          name,
          category,
          provider,
          price,
          cost,
          stock: Math.max(0, Number(variant.stock || 0)),
          minStock,

          size: variant.size.trim(),
          color: variant.color.trim(),
          gender: (formData.gender || '').trim(),
          description: (formData.description as string) || '',
          salesNote: (formData.salesNote as string) || '',
          active: formData.active !== false,
          createdAt,
          updatedAt: createdAt,
          commissionPercentage: formData.commissionPercentage,
        }),
      );

      await StorageService.saveProductsBatch(newProducts);
      await Promise.resolve(onUpdate());

      setIsModalOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Error creando producto y variantes:', error);
      setFormError(
        error?.message ||
          'No se pudieron crear las variantes del producto.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;

    await StorageService.deleteProduct(id);
    await Promise.resolve(onUpdate());
  };

  const handleEdit = (product: Product) => {
    setFormError('');
    setNewProductSizes([]);
    setNewProductColors([]);
    setNewSizeInput('');
    setNewColorInput('');
    setVariantDrafts([]);
    setExcludedVariantKeys([]);
    setFormData({
      ...product,
      minStock: product.minStock ?? 3,
      shortCode: product.shortCode || generateShortCode(),
      barcode: product.barcode || '',
      size: product.size || '',
      color: product.color || '',
      gender: product.gender || '',
      salesNote: product.salesNote || '',
    });
    setIsModalOpen(true);
  };

  const openProductLabel = (product: Product) => {
    setLabelStockEntryQuantity(undefined);
    setLabelProduct(product);
  };

  const openStockEntryLabels = (product: Product, quantity: number) => {
    setLabelStockEntryQuantity(Math.max(1, quantity));
    setLabelProduct(product);
  };

  const closeLabelModal = () => {
    setLabelProduct(null);
    setLabelStockEntryQuantity(undefined);
  };

  // ===============================
  // Restock
  // ===============================

  const handleOpenRestock = (product?: Product) => {
    setRestockSearch('');
    setRestockQuantity(0);
    setGenerateRestockLabels(false);

    if (product) {
      setRestockProductId(product.id);
      setRestockNewCost(Number(product.cost ?? 0));
    } else {
      setRestockProductId('');
      setRestockNewCost(0);
    }

    setIsRestockModalOpen(true);
  };

  const handleSubmitRestock = async () => {
    if (!restockProductId || restockQuantity <= 0) return;

    setIsSaving(true);

    try {
      const product = products.find((p) => p.id === restockProductId);
      const enteredQuantity = restockQuantity;
      const shouldGenerateLabels = generateRestockLabels;

      if (product) {
        if (restockNewCost > 0 && restockNewCost !== product.cost) {
          await StorageService.updateProductCost(product.id, restockNewCost);
        }

        await StorageService.updateStock(product.id, enteredQuantity);
      }

      await Promise.resolve(onUpdate());

      setIsRestockModalOpen(false);
      setRestockQuantity(0);
      setGenerateRestockLabels(false);

      // Solo después de que el ingreso quedó guardado se ofrecen las etiquetas.
      if (product && shouldGenerateLabels) {
        openStockEntryLabels(product, enteredQuantity);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ===============================
  // Categories
  // ===============================

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;

    const newCat: CategoryItem = {
      id: Date.now().toString(),
      name: newCategoryName.trim(),
    };

    await StorageService.saveCategory(newCat);
    setNewCategoryName('');
    await loadLists();
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('¿Eliminar categoría?')) return;

    await StorageService.deleteCategory(id);
    await loadLists();
  };

  const startEditCategory = (category: CategoryItem) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
    setCategoryMessage('');
  };

  const cancelEditCategory = () => {
    setEditingCategoryId(null);
    setEditingCategoryName('');
    setCategoryMessage('');
  };

  const handleRenameCategory = async (category: CategoryItem) => {
    const nextName = editingCategoryName.trim();

    setCategoryMessage('');

    if (!nextName) {
      setCategoryMessage(
        'El nombre de la categoría no puede quedar vacío.',
      );
      return;
    }

    const duplicate = categories.find(
      (item) =>
        item.id !== category.id &&
        (item.name || '').trim().toLowerCase() ===
          nextName.toLowerCase(),
    );

    if (duplicate) {
      setCategoryMessage(
        `Ya existe una categoría llamada "${duplicate.name}".`,
      );
      return;
    }

    setIsSavingCategory(true);

    try {
      const oldName = category.name;

      const updatedProducts =
        await StorageService.renameCategoryAndProducts(
          category.id,
          oldName,
          nextName,
        );

      setFormData((prev) => ({
        ...prev,
        category:
          (prev.category || '').trim().toLowerCase() ===
          oldName.trim().toLowerCase()
            ? nextName
            : prev.category,
      }));

      setFilterCategory((prev) =>
        prev !== 'ALL' &&
        prev.trim().toLowerCase() ===
          oldName.trim().toLowerCase()
          ? nextName
          : prev,
      );

      await Promise.all([
        loadLists(),
        Promise.resolve(onUpdate()),
      ]);

      setEditingCategoryId(null);
      setEditingCategoryName('');

      setCategoryMessage(
        updatedProducts === 0
          ? `Categoría actualizada a "${nextName}".`
          : `Categoría actualizada a "${nextName}" en ${updatedProducts} producto(s).`,
      );
    } catch (error: any) {
      console.error('Error renombrando categoría:', error);

      setCategoryMessage(
        error?.message ||
          'No se pudo modificar la categoría.',
      );
    } finally {
      setIsSavingCategory(false);
    }
  };

  // ===============================
  // Filtros
  // ===============================

  const availableSizes = Array.from(
    new Set(
      products
        .map((p) => (p.size || '').trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const filteredProducts = products.filter((p) => {
    const term = searchTerm.trim().toLowerCase();

    const searchable = [
      p.name,
      p.code,
      p.shortCode,
      p.barcode,
      p.provider,
      p.category,
      p.size,
      p.color,
      p.gender,
      p.description,
      p.salesNote,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const matchesSearch = !term || searchable.includes(term);
    const matchesCategory =
      filterCategory === 'ALL' || p.category === filterCategory;
    const matchesSize =
      filterSize === 'ALL' || (p.size || '') === filterSize;

    return matchesSearch && matchesCategory && matchesSize;
  });

  const restockFilteredProducts = products.filter((p) => {
    const term = restockSearch.toLowerCase();

    return (
      (p.name || '').toLowerCase().includes(term) ||
      (p.code || '').toLowerCase().includes(term) ||
      (p.shortCode || '').toLowerCase().includes(term) ||
      (p.barcode || '').toLowerCase().includes(term) ||
      (p.size || '').toLowerCase().includes(term) ||
      (p.color || '').toLowerCase().includes(term)
    );
  });

  const selectedProductForRestock = products.find(
    (p) => p.id === restockProductId,
  );

  // ===============================
  // UI helpers
  // ===============================

  const getVariantLabel = (product: Product): string => {
    const parts = [product.color, product.size].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : 'Sin variante';
  };

  const handleBarcodeDetected = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    setScanError('');

    let product = products.find(
      (p) =>
        (p.shortCode || '').trim() === code ||
        (p.barcode || '').trim() === code ||
        (p.code || '').trim().toLowerCase() === code.toLowerCase(),
    );

    if (!product) {
      product = (await StorageService.getProductByBarcode(code)) || undefined;
    }

    if (!product) {
      setScannedProduct(null);
      setScanError(`No existe un producto registrado con el código ${code}.`);
      return;
    }

    setScannedProduct(product);
  };

  const inventoryValuation = products.reduce(
    (acc, product) => {
      const stock = Math.max(0, Number(product.stock || 0));
      const cost = Math.max(0, Number(product.cost || 0));
      const price = Math.max(0, Number(product.price || 0));

      if (stock <= 0) return acc;

      acc.units += stock;
      acc.costValue += stock * cost;
      acc.saleValue += stock * price;

      if (cost <= 0) {
        acc.unitsWithoutCost += stock;
        acc.variantsWithoutCost += 1;
      }

      return acc;
    },
    {
      units: 0,
      costValue: 0,
      saleValue: 0,
      unitsWithoutCost: 0,
      variantsWithoutCost: 0,
    },
  );

  const inventoryPotentialMargin =
    inventoryValuation.saleValue - inventoryValuation.costValue;

  const inventoryPotentialMarginPercent =
    inventoryValuation.saleValue > 0
      ? (inventoryPotentialMargin / inventoryValuation.saleValue) * 100
      : 0;

  const formatInventoryMoney = (value: number): string =>
    Number(value || 0).toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  return (
    <div className="space-y-6">
      {/* CABECERA */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Inventario</h2>
          <p className="text-sm text-slate-500 mt-1">
            Productos, variantes, códigos de barras y control de stock.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsVariantLookupOpen(true)}
            className="bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-medium"
          >
            <Shirt size={20} />
            Talles / Colores
          </button>

          <button
            type="button"
            onClick={() => {
              setScanError('');
              setIsScannerOpen(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-medium"
          >
            <Camera size={20} />
            Escanear
          </button>

          <button
            type="button"
            onClick={() => StorageService.exportInventoryToCSV(products)}
            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-medium"
          >
            <Download size={20} />
            <span className="hidden sm:inline">Exportar</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenRestock()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-medium"
          >
            <PackagePlus size={20} />
            Ingresar Mercadería
          </button>

          <div className="w-px bg-slate-300 mx-1 hidden md:block" />

          <button
            type="button"
            onClick={() => setIsProviderModalOpen(true)}
            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium shadow-sm"
          >
            <Briefcase size={18} />
            Proveedores
          </button>

          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium shadow-sm"
          >
            <FolderCog size={18} />
            Categorías
          </button>

          <button
            type="button"
            onClick={handleOpenNewProduct}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-medium"
          >
            <Plus size={20} />
            Nuevo Producto
          </button>
        </div>
      </div>

      {scanError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">{scanError}</div>
          <button type="button" onClick={() => setScanError('')} className="text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* FILTROS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
            size={20}
          />
          <input
            type="text"
            placeholder="Buscar nombre, SKU, código de barras, talle, color..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          className="px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="ALL">Todas las Categorías</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.name}>
              {cat.name}
            </option>
          ))}
        </select>

        <select
          className="px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
          value={filterSize}
          onChange={(e) => setFilterSize(e.target.value)}
        >
          <option value="ALL">Todos los Talles</option>
          {availableSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      {/* RESUMEN RÁPIDO */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase font-semibold text-slate-400">
            SKU / variantes
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-1">
            {products.length}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase font-semibold text-slate-400">
            Unidades
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-1">
            {products.reduce((acc, p) => acc + Number(p.stock || 0), 0)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase font-semibold text-slate-400">
            Stock bajo
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-1">
            {
              products.filter(
                (p) => Number(p.stock || 0) <= Number(p.minStock ?? 3),
              ).length
            }
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase font-semibold text-slate-400">
            Sin código de barras
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-1">
            {products.filter((p) => !(p.barcode || '').trim()).length}
          </div>
        </div>
      </div>

      {currentUser.role === 'admin' && (
        <div className="border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white rounded-2xl p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-xs uppercase tracking-wide font-bold text-indigo-600">
                Valor económico del inventario total
              </div>

              <h3 className="text-lg sm:text-xl font-black text-slate-900 mt-1">
                Capital actualmente invertido en mercadería
              </h3>

              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Calculado sobre todo el stock existente, sin depender de los filtros
                de búsqueda que tengas seleccionados.
              </p>
            </div>

            <div className="text-xs text-slate-500 bg-white border border-indigo-100 rounded-lg px-3 py-2">
              {inventoryValuation.units.toLocaleString('es-AR')}{' '}
              unidad(es) con stock
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border-2 border-indigo-200 rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-wide font-bold text-indigo-600">
                Valor a costo
              </div>

              <div className="text-2xl sm:text-3xl font-black text-indigo-900 mt-1">
                ${formatInventoryMoney(inventoryValuation.costValue)}
              </div>

              <div className="text-xs text-slate-500 mt-2">
                Capital inmovilizado según costo actual de cada producto.
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-wide font-bold text-slate-500">
                Valor potencial de venta
              </div>

              <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                ${formatInventoryMoney(inventoryValuation.saleValue)}
              </div>

              <div className="text-xs text-slate-500 mt-2">
                Si todo el stock se vendiera al precio actual, sin descuentos.
              </div>
            </div>

            <div className="bg-white border border-emerald-200 rounded-xl p-4">
              <div className="text-[11px] uppercase tracking-wide font-bold text-emerald-600">
                Margen bruto potencial
              </div>

              <div className="text-2xl sm:text-3xl font-black text-emerald-700 mt-1">
                ${formatInventoryMoney(inventoryPotentialMargin)}
              </div>

              <div className="text-xs text-slate-500 mt-2">
                Venta potencial − costo ·{' '}
                {inventoryPotentialMarginPercent.toLocaleString('es-AR', {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
                % sobre ventas.
              </div>
            </div>
          </div>

          {inventoryValuation.variantsWithoutCost > 0 && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />

              <div>
                Hay <b>{inventoryValuation.variantsWithoutCost}</b> variante(s) con
                stock y costo $0, equivalentes a{' '}
                <b>{inventoryValuation.unitsWithoutCost}</b> unidad(es). El valor
                a costo puede estar subestimado hasta completar esos costos.
              </div>
            </div>
          )}
        </div>
      )}

      {/* TABLA */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1050px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Identificación
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Producto / Variante
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Categoría / Proveedor
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">
                  Costo
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">
                  Precio
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">
                  Stock
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((product) => {
                const stock = Number(product.stock ?? 0);
                const minStock = Number(product.minStock ?? 3);
                const isLow = stock <= minStock;

                return (
                  <tr
                    key={product.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="text-xs font-mono text-slate-700">
                        {product.code || 'S/C'}
                      </div>

                      <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold font-mono">
                        QR {product.shortCode || 'pendiente'}
                      </div>

                      <div className="text-[11px] font-mono text-slate-400 mt-1 flex items-center gap-1">
                        <Barcode size={12} />
                        {product.barcode || 'Sin código de barras'}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">
                        {product.name}
                      </div>

                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {product.color && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-medium">
                            <Palette size={11} />
                            {product.color}
                          </span>
                        )}

                        {product.size && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                            <Shirt size={11} />
                            Talle {product.size}
                          </span>
                        )}

                        {!product.color && !product.size && (
                          <span className="text-xs text-slate-400">
                            Sin variante
                          </span>
                        )}
                      </div>

                      {product.description && (
                        <div className="text-xs text-slate-500 mt-1.5">
                          {product.description}
                        </div>
                      )}

                      {product.salesNote && (
                        <div className="mt-2 inline-flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                          <Megaphone size={13} className="shrink-0 mt-0.5" />
                          <span>{product.salesNote}</span>
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 mb-1">
                        {product.category}
                      </span>

                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <Truck size={12} />
                        {product.provider || 'N/A'}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-right text-slate-500">
                      ${Number(product.cost || 0).toLocaleString('es-AR')}
                    </td>

                    <td className="px-5 py-4 text-right font-semibold text-slate-900">
                      ${Number(product.price || 0).toLocaleString('es-AR')}
                    </td>

                    <td className="px-5 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded text-xs font-bold ${
                            isLow
                              ? 'bg-red-100 text-red-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {stock}
                        </span>

                        <span className="text-[10px] text-slate-400">
                          mín. {minStock}
                        </span>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenRestock(product)}
                          title="Ingresar mercadería"
                          className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 transition-colors p-2 rounded-lg"
                        >
                          <PackagePlus size={18} />
                        </button>

                        <button
                          type="button"
                          onClick={() => openProductLabel(product)}
                          title="Imprimir etiqueta"
                          className="text-slate-700 hover:text-slate-950 hover:bg-slate-100 transition-colors p-2 rounded-lg"
                        >
                          <Printer size={18} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEdit(product)}
                          title="Editar producto"
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors p-2 rounded-lg"
                        >
                          <Edit2 size={18} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(product.id)}
                          title="Eliminar producto"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors p-2 rounded-lg"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-slate-500"
                  >
                    No se encontraron productos con estos criterios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BarcodeScannerModal
        open={isScannerOpen}
        title="Escanear producto del inventario"
        onClose={() => setIsScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />

      <VariantLookupModal
        open={isVariantLookupOpen}
        products={Array.isArray(products) ? products : []}
        onClose={() => setIsVariantLookupOpen(false)}
      />

      <BarcodeLabelModal
        open={Boolean(labelProduct)}
        product={labelProduct}
        stockEntryQuantity={labelStockEntryQuantity}
        onClose={closeLabelModal}
      />

      {scannedProduct && (
        <Portal>
          <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-start gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide font-semibold text-indigo-600">Producto encontrado</div>
                  <h3 className="text-xl font-bold text-slate-900 mt-1">{scannedProduct.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{getVariantLabel(scannedProduct)}</p>
                </div>
                <button type="button" onClick={() => setScannedProduct(null)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X size={21} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <div className="text-[11px] uppercase font-semibold text-slate-400">Precio</div>
                    <div className="text-2xl font-bold text-indigo-600 mt-1">
                      ${Number(scannedProduct.price || 0).toLocaleString('es-AR')}
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <div className="text-[11px] uppercase font-semibold text-slate-400">Stock</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{Number(scannedProduct.stock || 0)} u.</div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 text-sm">
                  <div className="flex justify-between gap-4 p-3">
                    <span className="text-slate-500">SKU</span>
                    <span className="font-mono text-slate-800 text-right">{scannedProduct.code}</span>
                  </div>
                  <div className="flex justify-between gap-4 p-3">
                    <span className="text-slate-500">Código corto / QR</span>
                    <span className="font-mono font-bold text-emerald-700 text-right">
                      {scannedProduct.shortCode || 'Pendiente'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 p-3">
                    <span className="text-slate-500">Código de barras</span>
                    <span className="font-mono text-slate-800 text-right">{scannedProduct.barcode || 'Sin código'}</span>
                  </div>
                  <div className="flex justify-between gap-4 p-3">
                    <span className="text-slate-500">Categoría</span>
                    <span className="font-medium text-slate-800 text-right">{scannedProduct.category}</span>
                  </div>
                  <div className="flex justify-between gap-4 p-3">
                    <span className="text-slate-500">Proveedor</span>
                    <span className="font-medium text-slate-800 text-right">{scannedProduct.provider}</span>
                  </div>
                  <div className="flex justify-between gap-4 p-3">
                    <span className="text-slate-500">Costo</span>
                    <span className="font-medium text-slate-800 text-right">${Number(scannedProduct.cost || 0).toLocaleString('es-AR')}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const product = scannedProduct;
                      setScannedProduct(null);
                      openProductLabel(product);
                    }}
                    className="py-3 bg-slate-900 hover:bg-black text-white rounded-xl font-semibold flex items-center justify-center gap-2"
                  >
                    <Printer size={18} /> Etiqueta
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const product = scannedProduct;
                      setScannedProduct(null);
                      handleOpenRestock(product);
                    }}
                    className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
                  >
                    <PackagePlus size={18} /> Ingresar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const product = scannedProduct;
                      setScannedProduct(null);
                      handleEdit(product);
                    }}
                    className="py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
                  >
                    <Edit2 size={18} /> Editar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* RESTOCK MODAL */}
      {isRestockModalOpen && (
        <Portal>
          <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden animate-fade-in-up">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <PackagePlus size={20} className="text-emerald-600" />
                  Ingresar Mercadería
                </h3>

                <button
                  type="button"
                  onClick={() => setIsRestockModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Producto / Variante
                  </label>

                  <select
                    className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-medium"
                    value={restockProductId}
                    onChange={(e) => {
                      setRestockProductId(e.target.value);

                      const p = products.find(
                        (prod) => prod.id === e.target.value,
                      );

                      if (p) setRestockNewCost(Number(p.cost ?? 0));
                    }}
                  >
                    <option value="">-- Seleccionar Producto --</option>

                    {restockFilteredProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.color ? ` · ${p.color}` : ''}
                        {p.size ? ` · ${p.size}` : ''} ({p.code})
                      </option>
                    ))}
                  </select>

                  <div className="mt-2 flex items-center gap-2">
                    <Search size={14} className="text-slate-400" />

                    <input
                      type="text"
                      placeholder="Filtrar por nombre, código corto QR, SKU, barcode, talle o color..."
                      className="text-xs border-b border-slate-200 focus:border-indigo-500 focus:outline-none w-full py-1"
                      value={restockSearch}
                      onChange={(e) => setRestockSearch(e.target.value)}
                    />
                  </div>
                </div>

                {selectedProductForRestock && (
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-2">
                    <div className="flex justify-between gap-4">
                      <span className="text-sm text-slate-500">
                        Producto:
                      </span>
                      <span className="font-semibold text-slate-800 text-right">
                        {selectedProductForRestock.name}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-sm text-slate-500">
                        Variante:
                      </span>
                      <span className="font-medium text-slate-700 text-right">
                        {getVariantLabel(selectedProductForRestock)}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-sm text-slate-500">
                        Código:
                      </span>
                      <span className="font-mono text-xs text-slate-700 text-right">
                        {selectedProductForRestock.barcode ||
                          selectedProductForRestock.code}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                      <span className="text-sm text-slate-500">
                        Stock Actual:
                      </span>
                      <span className="font-bold text-slate-800 text-lg">
                        {selectedProductForRestock.stock} u.
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">
                        Costo Actual:
                      </span>
                      <span className="font-medium text-slate-700">
                        $
                        {Number(
                          selectedProductForRestock.cost || 0,
                        ).toLocaleString('es-AR')}
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Cantidad a Ingresar
                    </label>

                    <input
                      type="number"
                      min="1"
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-lg font-bold text-emerald-600"
                      value={restockQuantity}
                      onChange={(e) =>
                        setRestockQuantity(
                          parseInt(e.target.value, 10) || 0,
                        )
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nuevo Costo (Unit.)
                    </label>

                    <input
                      type="number"
                      min="0"
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      value={restockNewCost}
                      onChange={(e) =>
                        setRestockNewCost(
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      disabled={!selectedProductForRestock}
                    />

                    <p className="text-[10px] text-slate-400 mt-1">
                      Dejalo igual si el costo no cambió.
                    </p>
                  </div>
                </div>

                {selectedProductForRestock && restockQuantity > 0 && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex justify-between items-center">
                    <span className="text-sm text-emerald-800">
                      Stock resultante
                    </span>
                    <span className="text-lg font-bold text-emerald-700">
                      {Number(selectedProductForRestock.stock || 0) +
                        restockQuantity}{' '}
                      u.
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() =>
                    setGenerateRestockLabels((prev) => !prev)
                  }
                  disabled={
                    !selectedProductForRestock ||
                    restockQuantity <= 0 ||
                    isSaving
                  }
                  className={`w-full p-3 rounded-xl border text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    generateRestockLabels
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        generateRestockLabels
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Printer size={18} />
                    </div>

                    <div className="flex-1">
                      <div className="font-bold">
                        Generar etiquetas del ingreso
                      </div>

                      <div className="text-xs opacity-75 mt-0.5">
                        {generateRestockLabels
                          ? 'Activado: al confirmar el ingreso se abrirá la selección de etiquetas.'
                          : 'Opcional: activalo si querés imprimir etiquetas después de guardar el ingreso.'}
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center mt-1 ${
                        generateRestockLabels
                          ? 'bg-indigo-600 border-indigo-600'
                          : 'bg-white border-slate-300'
                      }`}
                    >
                      {generateRestockLabels && (
                        <span className="text-white text-xs">✓</span>
                      )}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleSubmitRestock}
                  disabled={
                    !selectedProductForRestock ||
                    restockQuantity <= 0 ||
                    isSaving
                  }
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ArrowRight size={20} />
                  )}
                  Confirmar Ingreso
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* PRODUCT MODAL */}
      {isModalOpen && (
        <Portal>
          <div className="fixed inset-0 bg-black/50 z-[9999] sm:flex sm:items-center sm:justify-center sm:p-4">
            <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[94dvh] sm:max-w-4xl sm:rounded-xl shadow-xl overflow-hidden animate-fade-in-up flex flex-col">
              <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    {formData.id ? 'Editar Producto' : 'Nuevo Producto'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formData.id
                      ? 'Edición individual de la variante.'
                      : 'Cargá una vez el modelo y definí debajo todos sus talles, colores y cantidades.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5">
                {formError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* IDENTIFICACIÓN */}
                {formData.id ? (
                <div className="border border-slate-200 rounded-xl p-4">
                  <h4 className="font-semibold text-slate-800 flex items-center gap-2 mb-4">
                    <Barcode size={18} className="text-indigo-600" />
                    Identificación
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Código / SKU
                      </label>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="INV-1234567"
                          className="flex-1 min-w-0 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                          value={formData.code || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              code: e.target.value,
                            })
                          }
                        />

                        <button
                          type="button"
                          title="Generar nuevo SKU"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              code: generateSku(),
                            })
                          }
                          className="px-3 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600"
                        >
                          <RefreshCw size={18} />
                        </button>
                      </div>

                      <p className="text-[11px] text-slate-400 mt-1">
                        Identificador interno del producto.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Código corto / QR
                      </label>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          readOnly
                          className="flex-1 min-w-0 border border-emerald-300 bg-emerald-50 rounded-lg p-2 font-mono font-bold text-emerald-800"
                          value={formData.shortCode || ''}
                        />

                        <button
                          type="button"
                          title="Generar otro código corto"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              shortCode: generateShortCode(),
                            })
                          }
                          className="px-3 border border-emerald-300 rounded-lg hover:bg-emerald-50 text-emerald-700"
                        >
                          <RefreshCw size={18} />
                        </button>
                      </div>

                      <p className="text-[11px] text-slate-400 mt-1">
                        Este número aparece grande en la etiqueta y es el contenido del QR.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Código de barras
                      </label>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Código del fabricante o generado"
                          className="flex-1 min-w-0 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                          value={formData.barcode || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              barcode: e.target.value.trim(),
                            })
                          }
                        />

                        <button
                          type="button"
                          title="Generar código de barras"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              barcode: generateInternalBarcode(),
                            })
                          }
                          className="px-3 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600"
                        >
                          <RefreshCw size={18} />
                        </button>
                      </div>

                      <p className="text-[11px] text-slate-400 mt-1">
                        Si la prenda ya trae código, podés escribirlo aquí. Si no, generamos uno.
                      </p>
                    </div>
                  </div>
                </div>

                ) : (
                  <div className="border border-indigo-200 bg-indigo-50 rounded-xl p-4">
                    <div className="font-semibold text-indigo-900 flex items-center gap-2">
                      <Barcode size={18} />
                      Identificación automática
                    </div>

                    <p className="text-sm text-indigo-700 mt-2">
                      INVICTOS generará automáticamente un SKU, un código corto QR
                      y un código de barras diferente para cada combinación de talle
                      y color. Luego podrás editar cada variante individualmente.
                    </p>
                  </div>
                )}

                {/* DATOS DEL PRODUCTO */}
                <div className="border border-slate-200 rounded-xl p-4">
                  <h4 className="font-semibold text-slate-800 mb-4">
                    Producto
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Nombre del Producto
                      </label>

                      <input
                        type="text"
                        placeholder="Ej.: Remera Dry Fit"
                        className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        value={formData.name || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            name: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                        <Tag size={14} />
                        Categoría
                      </label>

                      <select
                        className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                        value={formData.category || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            category: e.target.value,
                          })
                        }
                      >
                        {categories.length === 0 && (
                          <option value="">Sin Categorías</option>
                        )}

                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.name}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                        <Truck size={14} />
                        Proveedor
                      </label>

                      <select
                        className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                        value={formData.provider || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            provider: e.target.value,
                          })
                        }
                      >
                        <option value="">Seleccionar Proveedor</option>

                        {providers.map((p) => (
                          <option key={p.id} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Género / Línea
                      </label>

                      <select
                        className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                        value={formData.gender || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            gender: e.target.value,
                          })
                        }
                      >
                        <option value="">Sin especificar</option>
                        <option value="Unisex">Unisex</option>
                        <option value="Hombre">Hombre</option>
                        <option value="Mujer">Mujer</option>
                        <option value="Niño">Niño</option>
                        <option value="Niña">Niña</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Stock mínimo
                      </label>

                      <input
                        type="number"
                        min="0"
                        className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        value={Number(formData.minStock ?? 3)}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            minStock:
                              parseInt(e.target.value, 10) || 0,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* VARIANTES */}
                {!formData.id ? (
                  <div className="border border-indigo-200 rounded-xl overflow-hidden">
                    <div className="p-4 bg-indigo-50 border-b border-indigo-100">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div>
                          <h4 className="font-bold text-indigo-900 flex items-center gap-2">
                            <Shirt size={18} />
                            Talles, colores y cantidades
                          </h4>

                          <p className="text-xs text-indigo-700 mt-1">
                            Agregá los talles y colores disponibles. INVICTOS crea
                            automáticamente todas las combinaciones como productos
                            independientes.
                          </p>
                        </div>

                        <div className="text-xs font-bold text-indigo-700 bg-white border border-indigo-200 rounded-lg px-3 py-2 whitespace-nowrap">
                          {activeVariantDrafts.length}{' '}
                          {activeVariantDrafts.length === 1
                            ? 'variante'
                            : 'variantes'}
                          {' · '}
                          {activeVariantUnits} unidad(es)
                        </div>
                      </div>
                    </div>

                    <div className="p-4 space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
                            <Shirt size={14} />
                            Talles
                          </label>

                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newSizeInput}
                              onChange={(e) =>
                                setNewSizeInput(e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addSize();
                                }
                              }}
                              placeholder="Ej.: S, M, L, 40..."
                              className="flex-1 min-w-0 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />

                            <button
                              type="button"
                              onClick={addSize}
                              className="px-3 py-2 rounded-lg bg-slate-900 text-white font-semibold flex items-center gap-1"
                            >
                              <Plus size={16} />
                              Agregar
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-2 mt-3">
                            {newProductSizes.length === 0 && (
                              <span className="text-xs text-slate-400">
                                Si no agregás talles, se crea como talle único.
                              </span>
                            )}

                            {newProductSizes.map((size) => (
                              <span
                                key={size}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold"
                              >
                                {size}

                                <button
                                  type="button"
                                  onClick={() => removeSize(size)}
                                  className="text-slate-400 hover:text-red-600"
                                  title={`Quitar talle ${size}`}
                                >
                                  <X size={13} />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
                            <Palette size={14} />
                            Colores
                          </label>

                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newColorInput}
                              onChange={(e) =>
                                setNewColorInput(e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addColor();
                                }
                              }}
                              placeholder="Ej.: Negro, Blanco..."
                              className="flex-1 min-w-0 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />

                            <button
                              type="button"
                              onClick={addColor}
                              className="px-3 py-2 rounded-lg bg-slate-900 text-white font-semibold flex items-center gap-1"
                            >
                              <Plus size={16} />
                              Agregar
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-2 mt-3">
                            {newProductColors.length === 0 && (
                              <span className="text-xs text-slate-400">
                                Si no agregás colores, se crea sin color específico.
                              </span>
                            )}

                            {newProductColors.map((color) => (
                              <span
                                key={color}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold"
                              >
                                {color}

                                <button
                                  type="button"
                                  onClick={() => removeColor(color)}
                                  className="text-slate-400 hover:text-red-600"
                                  title={`Quitar color ${color}`}
                                >
                                  <X size={13} />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div>
                            <div className="font-semibold text-slate-800">
                              Combinaciones a crear
                            </div>

                            <div className="text-xs text-slate-500 mt-0.5">
                              Eliminá las combinaciones que no existan. En cada
                              combinación restante cargá la cantidad de stock inicial.
                            </div>
                          </div>
                        </div>

                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className="hidden sm:grid grid-cols-[1fr_1fr_150px_56px] gap-2 bg-slate-50 border-b border-slate-200 px-3 py-2 text-[11px] uppercase tracking-wide font-bold text-slate-500">
                            <div>Talle</div>
                            <div>Color</div>
                            <div className="text-right">Stock inicial</div>
                            <div className="text-center">Quitar</div>
                          </div>

                          <div className="divide-y divide-slate-100 max-h-[330px] overflow-y-auto">
                            {variantDrafts.map((variant) => (
                              <div
                                key={variant.key}
                                className="grid grid-cols-[1fr_105px_42px] sm:grid-cols-[1fr_1fr_150px_56px] gap-2 items-center px-3 py-3 bg-white"
                              >
                                <div className="min-w-0">
                                  <div className="sm:hidden text-[10px] uppercase font-bold text-slate-400">
                                    Variante
                                  </div>

                                  <div className="font-semibold text-slate-800 truncate">
                                    {variant.size || 'Talle único'}
                                    <span className="sm:hidden text-slate-400 font-normal">
                                      {' · '}
                                      {variant.color || 'Sin color'}
                                    </span>
                                  </div>
                                </div>

                                <div className="hidden sm:block font-medium text-slate-700 truncate">
                                  {variant.color || 'Sin color'}
                                </div>

                                <div>
                                  <input
                                    type="number"
                                    min="0"
                                    value={variant.stock}
                                    onChange={(e) =>
                                      setVariantDrafts((prev) =>
                                        prev.map((item) =>
                                          item.key === variant.key
                                            ? {
                                                ...item,
                                                stock: Math.max(
                                                  0,
                                                  parseInt(
                                                    e.target.value,
                                                    10,
                                                  ) || 0,
                                                ),
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                    className="w-full border border-slate-300 rounded-lg px-2 py-2 text-right font-bold"
                                    aria-label={`Stock inicial ${variant.size} ${variant.color}`}
                                  />
                                </div>

                                <div className="flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      deleteVariantCombination(variant.key)
                                    }
                                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700"
                                    title={`Eliminar ${variant.size || 'talle único'} / ${variant.color || 'sin color'}`}
                                  >
                                    <Trash2 size={17} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {excludedVariantKeys.length > 0 && (
                          <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <div className="text-sm text-amber-800">
                              Eliminaste <b>{excludedVariantKeys.length}</b>{' '}
                              combinación(es). No se crearán.
                            </div>

                            <button
                              type="button"
                              onClick={restoreVariantCombinations}
                              className="text-xs font-bold px-3 py-2 rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100"
                            >
                              Restaurar combinaciones
                            </button>
                          </div>
                        )}

                        <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
                          Se crearán <b>{activeVariantDrafts.length}</b>{' '}
                          producto(s) independientes con un total inicial de{' '}
                          <b>{activeVariantUnits}</b> unidad(es). Todos quedarán
                          vinculados al mismo modelo <b>{formData.name || 'nuevo producto'}</b>.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl p-4">
                    <h4 className="font-semibold text-slate-800 mb-1">
                      Variante
                    </h4>

                    <p className="text-xs text-slate-500 mb-4">
                      Estás editando una variante individual. Esto no modifica
                      las demás combinaciones del mismo producto.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                          <Shirt size={14} />
                          Talle
                        </label>

                        <input
                          type="text"
                          className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          value={formData.size || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              size: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                          <Palette size={14} />
                          Color
                        </label>

                        <input
                          type="text"
                          className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          value={formData.color || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              color: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* PRECIOS Y STOCK */}
                <div className="border border-slate-200 rounded-xl p-4">
                  <h4 className="font-semibold text-slate-800 mb-4">
                    Precio y costo
                  </h4>

                  <div className={`grid grid-cols-1 ${
                    formData.id ? 'md:grid-cols-3' : 'md:grid-cols-2'
                  } gap-4`}>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Costo ($)
                      </label>

                      <input
                        type="number"
                        min="0"
                        className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        value={Number(formData.cost ?? 0)}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            cost: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Precio ($)
                      </label>

                      <input
                        type="number"
                        min="0"
                        className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        value={Number(formData.price ?? 0)}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            price: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>

                    {formData.id && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Stock actual
                        </label>

                        <input
                          type="number"
                          min="0"
                          disabled
                          className="w-full border border-slate-300 rounded-lg p-2 bg-slate-100 text-slate-500 cursor-not-allowed"
                          value={Number(formData.stock ?? 0)}
                        />

                        <p className="text-[11px] text-slate-400 mt-1">
                          Para cambiar stock usá “Ingresar Mercadería”.
                        </p>
                      </div>
                    )}
                  </div>

                  {!formData.id && (
                    <p className="text-[11px] text-slate-400 mt-3">
                      El costo y precio se aplican inicialmente a todas las
                      variantes. Las cantidades se cargan arriba, por talle/color.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Descripción
                  </label>

                  <input
                    type="text"
                    placeholder="Información adicional..."
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={(formData.description as string) || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        description: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                    <Megaphone size={16} className="text-amber-600" />
                    Aviso en ventas / promoción
                  </label>

                  <textarea
                    rows={2}
                    placeholder="Ej.: 10% de descuento pagando en efectivo"
                    className="w-full border border-amber-300 bg-amber-50/40 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none resize-y"
                    value={(formData.salesNote as string) || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        salesNote: e.target.value,
                      })
                    }
                  />

                  <p className="text-[11px] text-slate-400 mt-1">
                    Esta leyenda se mostrará al vendedor en Caja. Es informativa: no aplica el descuento automáticamente.
                  </p>
                </div>
              </div>

              <div
                className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 bg-slate-50 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:justify-between gap-3"
                style={{
                  paddingBottom:
                    'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
                }}
              >
                <div className="text-xs text-slate-400 self-center">
                  {formData.id
                    ? 'Editar esta ficha no modifica las demás variantes.'
                    : `${activeVariantDrafts.length} variante(s) seleccionada(s) · ${activeVariantUnits} unidad(es) iniciales.`}
                </div>

                <div className="flex justify-end gap-3 flex-wrap">
                  {formData.id && (
                    <button
                      type="button"
                      onClick={() => {
                        const savedProduct = products.find(
                          (product) => product.id === formData.id,
                        );

                        if (savedProduct) {
                          openProductLabel(savedProduct);
                        }
                      }}
                      className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 rounded-lg font-medium flex items-center gap-2"
                    >
                      <Printer size={18} />
                      Generar etiqueta
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-60"
                  >
                    {isSaving ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <Save size={18} />
                    )}
                    {formData.id
                      ? 'Guardar'
                      : activeVariantDrafts.length === 1
                        ? 'Crear Producto'
                        : `Crear ${activeVariantDrafts.length} Variantes`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* CATEGORY MODAL */}
      {isCategoryModalOpen && (
        <Portal>
          <div className="fixed inset-0 bg-black/50 z-[9999] sm:flex sm:items-center sm:justify-center sm:p-4">
            <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-xl shadow-xl overflow-hidden animate-fade-in-up flex flex-col">
              <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <FolderCog size={20} className="text-slate-700" />
                  Categorías
                </h3>

                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
                <div className="sticky top-0 z-10 -mx-1 p-1 bg-white/95 backdrop-blur">
                  <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Nueva categoría..."
                    className="flex-1 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={newCategoryName}
                    onChange={(e) =>
                      setNewCategoryName(e.target.value)
                    }
                  />

                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium flex items-center gap-2"
                  >
                    <Plus size={18} />
                    Agregar
                  </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  {categories.length === 0 ? (
                    <div className="p-4 text-sm text-slate-500">
                      No hay categorías cargadas.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-[52dvh] sm:max-h-[48vh] overflow-y-auto">
                      {categories.map((cat) => {
                        const isEditing =
                          editingCategoryId === cat.id;

                        return (
                          <div
                            key={cat.id}
                            className="p-3 hover:bg-slate-50"
                          >
                            {isEditing ? (
                              <div className="space-y-2">
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingCategoryName}
                                    disabled={isSavingCategory}
                                    onChange={(e) =>
                                      setEditingCategoryName(
                                        e.target.value,
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void handleRenameCategory(cat);
                                      }

                                      if (e.key === 'Escape') {
                                        e.preventDefault();
                                        cancelEditCategory();
                                      }
                                    }}
                                    className="flex-1 min-w-0 border border-indigo-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                  />

                                  <div className="grid grid-cols-2 sm:flex gap-2">
                                    <button
                                      type="button"
                                      onClick={cancelEditCategory}
                                      disabled={isSavingCategory}
                                      className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold disabled:opacity-50 flex items-center justify-center gap-1"
                                    >
                                      <X size={16} />
                                      Cancelar
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleRenameCategory(cat)
                                      }
                                      disabled={
                                        isSavingCategory ||
                                        !editingCategoryName.trim()
                                      }
                                      className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-1"
                                    >
                                      {isSavingCategory ? (
                                        <Loader2
                                          size={16}
                                          className="animate-spin"
                                        />
                                      ) : (
                                        <Save size={16} />
                                      )}
                                      Guardar
                                    </button>
                                  </div>
                                </div>

                                <p className="text-[11px] text-indigo-600">
                                  Al guardar, el nuevo nombre se actualizará
                                  también en todos los productos que tengan
                                  esta categoría.
                                </p>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium text-slate-800 min-w-0 truncate">
                                  {cat.name}
                                </span>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      startEditCategory(cat)
                                    }
                                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors p-1.5 rounded"
                                    title="Modificar categoría"
                                  >
                                    <Edit2 size={18} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteCategory(cat.id)
                                    }
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors p-1.5 rounded"
                                    title="Eliminar categoría"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {categoryMessage && (
                  <div
                    className={`rounded-lg px-3 py-2 text-sm ${
                      categoryMessage.toLowerCase().includes('no se pudo') ||
                      categoryMessage.toLowerCase().includes('ya existe') ||
                      categoryMessage.toLowerCase().includes('vacío')
                        ? 'bg-red-50 border border-red-200 text-red-700'
                        : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    }`}
                  >
                    {categoryMessage}
                  </div>
                )}

                <p className="text-[11px] text-slate-400">
                  Modificar una categoría actualiza automáticamente todos los
                  productos que la tengan asignada. Si eliminás una categoría,
                  los productos existentes conservan el texto que ya tenían.
                </p>
              </div>

              <div
                className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4"
                style={{
                  paddingBottom:
                    'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* PROVIDER MANAGEMENT */}
      <ProviderManagementModal
        open={isProviderModalOpen}
        providers={providers}
        onClose={() => setIsProviderModalOpen(false)}
        onSaved={loadLists}
      />
    </div>
  );
};

export default Inventory;
