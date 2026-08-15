import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Product, CategoryItem, ProviderItem } from '../types';
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
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import BarcodeScannerModal from './BarcodeScannerModal';
import BarcodeLabelModal from './BarcodeLabelModal';
import ProviderManagementModal from './ProviderManagementModal';
import VariantLookupModal from './VariantLookupModal';

interface InventoryProps {
  products: Product[];
  onUpdate: () => void | Promise<void>;
}

/**
 * Portal fuera del componente:
 * evita que el modal se desmonte/monte en cada render y pierda el foco.
 */
const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

const Inventory: React.FC<InventoryProps> = ({ products, onUpdate }) => {
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
  const [isVariantLookupOpen, setIsVariantLookupOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterSize, setFilterSize] = useState<string>('ALL');

  // Lists
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [providers, setProviders] = useState<ProviderItem[]>([]);

  // Input states for managers
  const [newCategoryName, setNewCategoryName] = useState('');

  const [formError, setFormError] = useState('');

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
    active: true,
    commissionPercentage: undefined,
  });

  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      code: '',
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
      active: true,
      commissionPercentage: undefined,
    });
    setFormError('');
  }, [categories, providers]);

  const handleOpenNewProduct = () => {
    setFormError('');
    setFormData(buildEmptyForm());
    setIsModalOpen(true);
  };

  // ===============================
  // Guardado de producto
  // ===============================

  const handleSave = async () => {
    const name = (formData.name || '').trim();
    const code = (formData.code || '').trim();
    const barcodeValue = (formData.barcode || '').trim();
    const category = formData.category || '';
    const provider = formData.provider || '';

    const price = Number(formData.price);
    const cost = Number(formData.cost ?? 0);
    const stock = Number(formData.stock ?? 0);
    const minStock = Number(formData.minStock ?? 0);

    setFormError('');

    if (!name || !category || !provider) {
      setFormError('Completá nombre, categoría y proveedor.');
      return;
    }

    if (!code) {
      setFormError('El producto debe tener un código / SKU.');
      return;
    }

    if (!barcodeValue) {
      setFormError('El producto debe tener un código de barras.');
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

    if (!Number.isFinite(stock) || stock < 0) {
      setFormError('El stock no puede ser negativo.');
      return;
    }

    if (!Number.isFinite(minStock) || minStock < 0) {
      setFormError('El stock mínimo no puede ser negativo.');
      return;
    }

    const duplicateCode = products.find(
      (p) =>
        p.id !== formData.id &&
        (p.code || '').trim().toLowerCase() === code.toLowerCase(),
    );

    if (duplicateCode) {
      setFormError(`El SKU "${code}" ya está usado por "${duplicateCode.name}".`);
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
      // En edición no permitimos cambiar stock desde la ficha.
      // El stock se modifica desde "Ingresar Mercadería".
      const currentProduct = formData.id
        ? products.find((p) => p.id === formData.id)
        : undefined;

      const finalStock = formData.id
        ? Number(currentProduct?.stock ?? 0)
        : stock;

      const newProduct: Product = {
        id: formData.id || Date.now().toString(),
        code,
        barcode: barcodeValue,
        parentProductId: formData.parentProductId,
        name,
        category,
        provider,
        price,
        cost,
        stock: finalStock,
        minStock,
        size: (formData.size || '').trim(),
        color: (formData.color || '').trim(),
        gender: (formData.gender || '').trim(),
        description: (formData.description as string) || '',
        active: formData.active !== false,
        createdAt: formData.createdAt,
        updatedAt: formData.updatedAt,
        commissionPercentage: formData.commissionPercentage,
      };

      await StorageService.saveProduct(newProduct);
      await Promise.resolve(onUpdate());

      setIsModalOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Error guardando producto:', error);
      setFormError(error?.message || 'No se pudo guardar el producto.');
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
    setFormData({
      ...product,
      minStock: product.minStock ?? 3,
      barcode: product.barcode || '',
      size: product.size || '',
      color: product.color || '',
      gender: product.gender || '',
    });
    setIsModalOpen(true);
  };

  // ===============================
  // Restock
  // ===============================

  const handleOpenRestock = (product?: Product) => {
    setRestockSearch('');
    setRestockQuantity(0);

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

      if (product) {
        if (restockNewCost > 0 && restockNewCost !== product.cost) {
          await StorageService.updateProductCost(product.id, restockNewCost);
        }

        await StorageService.updateStock(product.id, restockQuantity);
      }

      await Promise.resolve(onUpdate());
      setIsRestockModalOpen(false);
      setRestockQuantity(0);
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
      p.barcode,
      p.provider,
      p.category,
      p.size,
      p.color,
      p.gender,
      p.description,
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
                          onClick={() => setLabelProduct(product)}
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
        products={products}
        onClose={() => setIsVariantLookupOpen(false)}
      />

      <BarcodeLabelModal
        open={Boolean(labelProduct)}
        product={labelProduct}
        onClose={() => setLabelProduct(null)}
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
                      setLabelProduct(product);
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
                      placeholder="Filtrar por nombre, SKU, barcode, talle o color..."
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
          <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full overflow-hidden animate-fade-in-up">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    {formData.id ? 'Editar Producto' : 'Nuevo Producto'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cada combinación de talle/color debe tener su propio SKU y código de barras.
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

              <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
                {formError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* IDENTIFICACIÓN */}
                <div className="border border-slate-200 rounded-xl p-4">
                  <h4 className="font-semibold text-slate-800 flex items-center gap-2 mb-4">
                    <Barcode size={18} className="text-indigo-600" />
                    Identificación
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                {/* VARIANTE */}
                <div className="border border-slate-200 rounded-xl p-4">
                  <h4 className="font-semibold text-slate-800 mb-1">
                    Variante
                  </h4>

                  <p className="text-xs text-slate-500 mb-4">
                    Para prendas, cada talle y color se controla como una unidad de stock independiente.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                        <Shirt size={14} />
                        Talle
                      </label>

                      <input
                        type="text"
                        placeholder="Ej.: S, M, L, XL, 40..."
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
                        placeholder="Ej.: Negro, Azul Francia..."
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

                {/* PRECIOS Y STOCK */}
                <div className="border border-slate-200 rounded-xl p-4">
                  <h4 className="font-semibold text-slate-800 mb-4">
                    Precio y Stock
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                            cost:
                              parseFloat(e.target.value) || 0,
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
                            price:
                              parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        {formData.id ? 'Stock actual' : 'Stock inicial'}
                      </label>

                      <input
                        type="number"
                        min="0"
                        disabled={Boolean(formData.id)}
                        className={`w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                          formData.id
                            ? 'bg-slate-100 text-slate-500 cursor-not-allowed'
                            : ''
                        }`}
                        value={Number(formData.stock ?? 0)}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            stock:
                              parseInt(e.target.value, 10) || 0,
                          })
                        }
                      />

                      {formData.id && (
                        <p className="text-[11px] text-slate-400 mt-1">
                          Para cambiar stock usá “Ingresar Mercadería”.
                        </p>
                      )}
                    </div>
                  </div>
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
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
                <div className="text-xs text-slate-400 self-center">
                  {formData.id
                    ? 'Editar la ficha no modifica el stock.'
                    : 'SKU y código de barras se generan automáticamente, pero pueden editarse.'}
                </div>

                <div className="flex justify-end gap-3">
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
                    Guardar
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
          <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden animate-fade-in-up">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
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

              <div className="p-6 space-y-4">
                <div className="flex gap-2">
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

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  {categories.length === 0 ? (
                    <div className="p-4 text-sm text-slate-500">
                      No hay categorías cargadas.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {categories.map((cat) => (
                        <div
                          key={cat.id}
                          className="flex items-center justify-between p-3 hover:bg-slate-50"
                        >
                          <span className="text-sm font-medium text-slate-800">
                            {cat.name}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteCategory(cat.id)
                            }
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors p-1.5 rounded"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-400">
                  Si eliminás una categoría usada por productos, los productos conservarán el texto guardado.
                </p>
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
