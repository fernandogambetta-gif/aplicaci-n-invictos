import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Search,
  Shirt,
  Palette,
  Package,
  CheckCircle,
  Plus,
} from 'lucide-react';
import { Product } from '../types';

interface VariantLookupModalProps {
  open: boolean;
  products: Product[];
  onClose: () => void;
  onSelectProduct?: (product: Product) => void;
  closeOnSelect?: boolean;
}

interface ProductGroup {
  key: string;
  name: string;
  category: string;
  provider: string;
  variants: Product[];
}

const normalize = (value: string): string =>
  (value || '').trim().toLowerCase();

const sizeOrder: Record<string, number> = {
  XXS: 1,
  XS: 2,
  S: 3,
  M: 4,
  L: 5,
  XL: 6,
  XXL: 7,
  XXXL: 8,
  '2XL': 7,
  '3XL': 8,
};

const sortSizes = (a: string, b: string): number => {
  const au = a.toUpperCase();
  const bu = b.toUpperCase();

  const an = Number(a.replace(',', '.'));
  const bn = Number(b.replace(',', '.'));

  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;

  const ao = sizeOrder[au] ?? 999;
  const bo = sizeOrder[bu] ?? 999;

  if (ao !== bo) return ao - bo;

  return a.localeCompare(b, 'es', { numeric: true });
};

const VariantLookupModal: React.FC<VariantLookupModalProps> = ({
  open,
  products,
  onClose,
  onSelectProduct,
  closeOnSelect = false,
}) => {
  const [search, setSearch] = useState('');
  const [selectedGroupKey, setSelectedGroupKey] = useState('');
  const [onlyWithStock, setOnlyWithStock] = useState(true);
  const [matchedVariant, setMatchedVariant] = useState<Product | null>(null);

  useEffect(() => {
    if (!open) return;

    setSearch('');
    setSelectedGroupKey('');
    setOnlyWithStock(true);
    setMatchedVariant(null);
  }, [open]);

  const groups = useMemo<ProductGroup[]>(() => {
    const map = new Map<string, ProductGroup>();

    products.forEach((product) => {
      const name = (product.name || '').trim();
      if (!name) return;

      /*
       * Agrupamos por nombre de producto/modelo.
       * Cada talle/color sigue siendo una variante independiente,
       * pero para la consulta se ve como una sola familia.
       */
      const key = normalize(name);

      const existing = map.get(key);

      if (existing) {
        existing.variants.push(product);
      } else {
        map.set(key, {
          key,
          name,
          category: product.category || '',
          provider: product.provider || '',
          variants: [product],
        });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'es'),
    );
  }, [products]);

  const findExactVariant = (value: string): Product | null => {
    const term = value.trim().toLowerCase();
    if (!term) return null;

    return (
      products.find((product) => {
        const shortCode = (product.shortCode || '').trim().toLowerCase();
        const code = (product.code || '').trim().toLowerCase();
        const barcode = (product.barcode || '').trim().toLowerCase();

        return shortCode === term || code === term || barcode === term;
      }) || null
    );
  };

  const selectGroupForVariant = (variant: Product) => {
    const key = normalize(variant.name || '');

    if (key) {
      setSelectedGroupKey(key);
      setMatchedVariant(variant);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);

    const exact = findExactVariant(value);

    if (exact) {
      selectGroupForVariant(exact);
    } else {
      setMatchedVariant(null);
    }
  };

  const handleSearchEnter = () => {
    const exact = findExactVariant(search);

    if (exact) {
      selectGroupForVariant(exact);
      return;
    }

    // Si la búsqueda deja un solo modelo visible, lo abrimos automáticamente.
    if (filteredGroups.length === 1) {
      setSelectedGroupKey(filteredGroups[0].key);
    }
  };

  const filteredGroups = useMemo(() => {
    const term = normalize(search);

    if (!term) return groups;

    return groups.filter((group) => {
      const variantsText = group.variants
        .map((variant) =>
          [
            variant.name,
            variant.shortCode,
            variant.code,
            variant.barcode,
            variant.size,
            variant.color,
            variant.category,
            variant.provider,
          ]
            .filter(Boolean)
            .join(' '),
        )
        .join(' ');

      return normalize(
        [
          group.name,
          group.category,
          group.provider,
          variantsText,
        ]
          .filter(Boolean)
          .join(' '),
      ).includes(term);
    });
  }, [groups, search]);

  const selectedGroup =
    groups.find((group) => group.key === selectedGroupKey) || null;

  const selectedVariants = useMemo(() => {
    if (!selectedGroup) return [];

    return selectedGroup.variants.filter((variant) => {
      if (!onlyWithStock) return true;
      return Number(variant.stock || 0) > 0;
    });
  }, [selectedGroup, onlyWithStock]);

  const sizes = useMemo(() => {
    const result = Array.from(
      new Set(
        selectedVariants.map((variant) =>
          (variant.size || '').trim() || 'Único',
        ),
      ),
    );

    return result.sort(sortSizes);
  }, [selectedVariants]);

  const colors = useMemo(() => {
    return Array.from(
      new Set(
        selectedVariants.map((variant) =>
          (variant.color || '').trim() || 'Sin color',
        ),
      ),
    ).sort((a, b) => a.localeCompare(b, 'es'));
  }, [selectedVariants]);

  const availableSizes = useMemo(() => {
    return Array.from(
      new Set(
        (selectedGroup?.variants || [])
          .filter((variant) => Number(variant.stock || 0) > 0)
          .map((variant) => (variant.size || '').trim() || 'Único'),
      ),
    ).sort(sortSizes);
  }, [selectedGroup]);

  const availableColors = useMemo(() => {
    return Array.from(
      new Set(
        (selectedGroup?.variants || [])
          .filter((variant) => Number(variant.stock || 0) > 0)
          .map((variant) => (variant.color || '').trim() || 'Sin color'),
      ),
    ).sort((a, b) => a.localeCompare(b, 'es'));
  }, [selectedGroup]);

  const totalStock = (selectedGroup?.variants || []).reduce(
    (acc, variant) => acc + Number(variant.stock || 0),
    0,
  );

  const findVariantsForCell = (color: string, size: string): Product[] => {
    return (selectedGroup?.variants || []).filter((variant) => {
      const variantColor = (variant.color || '').trim() || 'Sin color';
      const variantSize = (variant.size || '').trim() || 'Único';

      return variantColor === color && variantSize === size;
    });
  };

  const handleSelectVariant = (product: Product) => {
    if (!onSelectProduct || Number(product.stock || 0) <= 0) return;

    onSelectProduct(product);

    if (closeOnSelect) {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[10030] flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="text-xs uppercase tracking-wide font-semibold text-indigo-600">
              Consulta rápida
            </div>
            <h3 className="text-xl font-bold text-slate-900 mt-1 flex items-center gap-2">
              <Shirt size={22} />
              Talles, colores y stock por producto
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Buscá un modelo y mirá todas sus variantes en una sola pantalla.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
          >
            <X size={21} />
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[340px_1fr]">
          {/* COLUMNA DE BUSQUEDA */}
          <div className="border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col min-h-0">
            <div className="p-4 border-b border-slate-200">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearchEnter();
                    }
                  }}
                  autoFocus
                  placeholder="Nombre, código corto QR, SKU o código de barras..."
                  className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="text-xs text-slate-400 mt-2">
                {filteredGroups.length} producto(s) encontrado(s)
              </div>

              <div className="text-[11px] text-slate-400 mt-1">
                También podés escribir el código corto QR, el SKU o el código de barras y presionar Enter.
              </div>
            </div>

            <div className="overflow-y-auto max-h-[260px] lg:max-h-none lg:flex-1">
              {filteredGroups.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">
                  No se encontraron productos.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredGroups.map((group) => {
                    const stock = group.variants.reduce(
                      (acc, variant) => acc + Number(variant.stock || 0),
                      0,
                    );

                    const variantsWithStock = group.variants.filter(
                      (variant) => Number(variant.stock || 0) > 0,
                    ).length;

                    return (
                      <button
                        key={group.key}
                        type="button"
                        onClick={() => {
                          setSelectedGroupKey(group.key);
                          setMatchedVariant(null);
                        }}
                        className={`w-full p-4 text-left transition-colors ${
                          selectedGroupKey === group.key
                            ? 'bg-indigo-50 border-l-4 border-indigo-600'
                            : 'hover:bg-slate-50 border-l-4 border-transparent'
                        }`}
                      >
                        <div className="font-semibold text-slate-900">
                          {group.name}
                        </div>

                        <div className="text-xs text-slate-500 mt-1">
                          {group.category || 'Sin categoría'}
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-2">
                          <span className="text-[11px] text-slate-400">
                            {variantsWithStock} variante(s) con stock
                          </span>

                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded ${
                              stock > 0
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {stock} u.
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* DETALLE DEL PRODUCTO */}
          <div className="overflow-y-auto min-h-0">
            {!selectedGroup ? (
              <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center">
                  <Search size={28} />
                </div>

                <h4 className="font-bold text-slate-800 mt-4">
                  Seleccioná un producto
                </h4>

                <p className="text-sm text-slate-500 mt-1 max-w-md">
                  Vas a ver los talles, colores y cantidades disponibles de todas sus variantes.
                </p>
              </div>
            ) : (
              <div className="p-5 sm:p-6 space-y-5">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div>
                    <h4 className="text-2xl font-bold text-slate-900">
                      {selectedGroup.name}
                    </h4>

                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedGroup.category && (
                        <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-medium">
                          {selectedGroup.category}
                        </span>
                      )}

                      {selectedGroup.provider && (
                        <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-medium">
                          {selectedGroup.provider}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 min-w-[135px]">
                    <div className="text-[10px] uppercase font-bold text-indigo-500">
                      Stock total
                    </div>
                    <div className="text-2xl font-bold text-indigo-700 mt-0.5">
                      {totalStock} u.
                    </div>
                  </div>
                </div>

                {matchedVariant && selectedGroupKey === normalize(matchedVariant.name || '') && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="text-xs uppercase font-bold tracking-wide text-emerald-600">
                      Código encontrado
                    </div>

                    <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900">
                          {matchedVariant.name}
                        </div>

                        <div className="text-sm text-slate-600 mt-1">
                          {[
                            matchedVariant.color,
                            matchedVariant.size ? `Talle ${matchedVariant.size}` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Sin variante'}
                        </div>

                        <div className="text-xs text-slate-500 font-mono mt-1">
                          QR: {matchedVariant.shortCode || '—'}
                          {matchedVariant.code
                            ? ` · SKU: ${matchedVariant.code}`
                            : ''}
                          {matchedVariant.barcode
                            ? ` · Código de barras: ${matchedVariant.barcode}`
                            : ''}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-slate-400">
                          Stock de esta variante
                        </div>
                        <div
                          className={`text-2xl font-bold ${
                            Number(matchedVariant.stock || 0) > 0
                              ? 'text-emerald-700'
                              : 'text-red-600'
                          }`}
                        >
                          {Number(matchedVariant.stock || 0)} u.
                        </div>
                      </div>
                    </div>

                    {onSelectProduct && Number(matchedVariant.stock || 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => handleSelectVariant(matchedVariant)}
                        className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
                      >
                        <Plus size={15} />
                        Agregar esta variante
                      </button>
                    )}
                  </div>
                )}

                {/* RESUMEN */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Shirt size={17} className="text-indigo-500" />
                      Talles disponibles
                    </div>

                    <div className="flex flex-wrap gap-2 mt-3">
                      {availableSizes.length > 0 ? (
                        availableSizes.map((size) => (
                          <span
                            key={size}
                            className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 text-sm font-bold"
                          >
                            {size}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400">
                          Sin talles con stock.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Palette size={17} className="text-indigo-500" />
                      Colores disponibles
                    </div>

                    <div className="flex flex-wrap gap-2 mt-3">
                      {availableColors.length > 0 ? (
                        availableColors.map((color) => (
                          <span
                            key={color}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-sm font-semibold"
                          >
                            {color}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400">
                          Sin colores con stock.
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* FILTRO */}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h5 className="font-bold text-slate-800">
                      Matriz de variantes
                    </h5>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Filas = colores · Columnas = talles · Número = stock.
                    </p>
                  </div>

                  <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyWithStock}
                      onChange={(e) => setOnlyWithStock(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Solo con stock
                  </label>
                </div>

                {/* MATRIZ */}
                {colors.length === 0 || sizes.length === 0 ? (
                  <div className="border border-slate-200 rounded-xl p-8 text-center text-slate-400">
                    No hay variantes para mostrar con este filtro.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[620px]">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 text-xs uppercase font-semibold text-slate-500">
                              Color
                            </th>

                            {sizes.map((size) => (
                              <th
                                key={size}
                                className="px-3 py-3 text-xs uppercase font-semibold text-slate-500 text-center"
                              >
                                {size}
                              </th>
                            ))}
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100">
                          {colors.map((color) => (
                            <tr key={color}>
                              <td className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">
                                {color}
                              </td>

                              {sizes.map((size) => {
                                const variants = findVariantsForCell(color, size);
                                const stock = variants.reduce(
                                  (acc, variant) =>
                                    acc + Number(variant.stock || 0),
                                  0,
                                );

                                const selectable =
                                  Boolean(onSelectProduct) && stock > 0;

                                const preferredVariant =
                                  variants.find(
                                    (variant) => Number(variant.stock || 0) > 0,
                                  ) || variants[0];

                                return (
                                  <td key={`${color}-${size}`} className="px-2 py-2 text-center">
                                    {variants.length === 0 ? (
                                      <span className="text-slate-300">—</span>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={!selectable}
                                        onClick={() => {
                                          if (preferredVariant) {
                                            handleSelectVariant(preferredVariant);
                                          }
                                        }}
                                        className={`min-w-[62px] rounded-lg px-2 py-2 transition-colors ${
                                          stock > 0
                                            ? selectable
                                              ? 'bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 cursor-pointer'
                                              : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                                            : 'bg-red-50 border border-red-100 text-red-400'
                                        }`}
                                      >
                                        <div className="font-bold text-base">
                                          {stock}
                                        </div>

                                        {selectable && (
                                          <div className="text-[10px] font-semibold mt-0.5 flex items-center justify-center gap-1">
                                            <Plus size={10} />
                                            Agregar
                                          </div>
                                        )}
                                      </button>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* LISTADO DETALLADO */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-sm text-slate-700 flex items-center gap-2">
                    <Package size={16} />
                    Detalle de variantes
                  </div>

                  <div className="divide-y divide-slate-100 max-h-[260px] overflow-y-auto">
                    {(selectedGroup.variants || [])
                      .slice()
                      .sort((a, b) => {
                        const colorCompare = (a.color || '').localeCompare(
                          b.color || '',
                          'es',
                        );

                        if (colorCompare !== 0) return colorCompare;

                        return sortSizes(a.size || '', b.size || '');
                      })
                      .map((variant) => {
                        const stock = Number(variant.stock || 0);

                        return (
                          <div
                            key={variant.id}
                            className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div>
                              <div className="font-semibold text-slate-800">
                                {(variant.color || '').trim() || 'Sin color'}
                                {' · '}
                                {(variant.size || '').trim()
                                  ? `Talle ${variant.size}`
                                  : 'Talle único'}
                              </div>

                              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                {variant.shortCode ? `QR ${variant.shortCode} · ` : ''}
                                {variant.code}
                                {variant.barcode ? ` · ${variant.barcode}` : ''}
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span
                                className={`px-2.5 py-1 rounded text-xs font-bold ${
                                  stock > 0
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {stock} u.
                              </span>

                              {onSelectProduct && stock > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleSelectVariant(variant)}
                                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                                >
                                  <Plus size={14} />
                                  Agregar
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {onSelectProduct && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm text-indigo-800 flex items-start gap-2">
                    <CheckCircle size={17} className="mt-0.5 shrink-0" />
                    En Caja podés tocar una combinación con stock para agregar directamente esa variante a la venta.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VariantLookupModal;
