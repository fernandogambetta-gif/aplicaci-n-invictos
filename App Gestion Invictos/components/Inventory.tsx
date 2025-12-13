
import React, { useState, useEffect } from 'react';
import { Product, CategoryItem, ProviderItem } from '../types';
import { Plus, Search, Trash2, Edit2, Save, X, Tag, Truck, Barcode, FolderCog, Briefcase, PackagePlus, ArrowRight, Download } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface InventoryProps {
  products: Product[];
  onUpdate: () => void;
}

const Inventory: React.FC<InventoryProps> = ({ products, onUpdate }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Management Modals
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  
  // Lists
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [providers, setProviders] = useState<ProviderItem[]>([]);

  // Input states for managers
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newProviderName, setNewProviderName] = useState('');

  // Form State for Products
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    code: '',
    category: '',
    provider: '',
    price: 0,
    cost: 0,
    stock: 0,
    description: '',
    commissionPercentage: undefined 
  });

  // State for Restock
  const [restockProductId, setRestockProductId] = useState<string>('');
  const [restockSearch, setRestockSearch] = useState('');
  const [restockQuantity, setRestockQuantity] = useState<number>(0);
  const [restockNewCost, setRestockNewCost] = useState<number>(0); // Optional cost update

  useEffect(() => {
    loadLists();
  }, []);

  const loadLists = () => {
    setCategories(StorageService.getCategories());
    setProviders(StorageService.getProviders());
  };

  const handleSave = () => {
    if (!formData.name || !formData.price || !formData.category || !formData.provider) return;

    const newProduct: Product = {
      id: formData.id || Date.now().toString(),
      code: formData.code || 'S/C',
      name: formData.name,
      category: formData.category,
      provider: formData.provider,
      price: Number(formData.price),
      cost: Number(formData.cost),
      stock: Number(formData.stock),
      description: formData.description,
      commissionPercentage: undefined 
    };

    StorageService.saveProduct(newProduct);
    onUpdate();
    setIsModalOpen(false);
    resetForm();
  };

  const resetForm = () => {
     setFormData({ 
        name: '', 
        code: '', 
        category: categories.length > 0 ? categories[0].name : '', 
        provider: providers.length > 0 ? providers[0].name : '', 
        price: 0, 
        cost: 0, 
        stock: 0, 
        description: '', 
        commissionPercentage: undefined 
    });
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Estás seguro de eliminar este producto?')) {
      StorageService.deleteProduct(id);
      onUpdate();
    }
  };

  const handleEdit = (product: Product) => {
    setFormData({ ...product });
    setIsModalOpen(true);
  };

  // --- Restock Logic ---
  const handleOpenRestock = (product?: Product) => {
      setRestockSearch('');
      setRestockQuantity(0);
      if (product) {
          setRestockProductId(product.id);
          setRestockNewCost(product.cost); // Pre-fill current cost
      } else {
          setRestockProductId('');
          setRestockNewCost(0);
      }
      setIsRestockModalOpen(true);
  };

  const handleSubmitRestock = () => {
      if (!restockProductId || restockQuantity <= 0) return;

      const product = products.find(p => p.id === restockProductId);
      if (!product) return;

      // Update Stock
      StorageService.updateStock(product.id, restockQuantity);
      
      // Update Cost if changed (Optional, but useful if new batch has different cost)
      if (restockNewCost > 0 && restockNewCost !== product.cost) {
          const updatedProduct = { ...product, cost: restockNewCost, stock: product.stock + restockQuantity };
          StorageService.saveProduct(updatedProduct);
      }

      onUpdate();
      setIsRestockModalOpen(false);
      setRestockQuantity(0);
  };

  // Category Logic
  const handleAddCategory = () => {
    if(!newCategoryName.trim()) return;
    const newCat: CategoryItem = { id: Date.now().toString(), name: newCategoryName.trim() };
    StorageService.saveCategory(newCat);
    setNewCategoryName('');
    loadLists();
  };

  const handleDeleteCategory = (id: string) => {
      if(confirm('¿Eliminar categoría? Los productos asociados mantendrán el nombre pero no estarán vinculados.')) {
          StorageService.deleteCategory(id);
          loadLists();
      }
  }

  // Provider Logic
  const handleAddProvider = () => {
    if(!newProviderName.trim()) return;
    const newProv: ProviderItem = { id: Date.now().toString(), name: newProviderName.trim() };
    StorageService.saveProvider(newProv);
    setNewProviderName('');
    loadLists();
  };

  const handleDeleteProvider = (id: string) => {
      if(confirm('¿Eliminar proveedor?')) {
          StorageService.deleteProvider(id);
          loadLists();
      }
  }

  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term) || p.provider.toLowerCase().includes(term);
    const matchesCategory = filterCategory === 'ALL' || p.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Filter for Restock Modal Search
  const restockFilteredProducts = products.filter(p => 
      p.name.toLowerCase().includes(restockSearch.toLowerCase()) || 
      p.code.toLowerCase().includes(restockSearch.toLowerCase())
  );
  
  const selectedProductForRestock = products.find(p => p.id === restockProductId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-800">Inventario</h2>
        <div className="flex flex-wrap gap-2">
            <button 
                onClick={() => StorageService.exportInventoryToCSV(products)}
                className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-medium"
                title="Descargar listado en Excel/CSV"
            >
                <Download size={20} /> <span className="hidden sm:inline">Exportar</span>
            </button>
            <button 
                onClick={() => handleOpenRestock()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-medium"
            >
                <PackagePlus size={20} /> Ingresar Mercadería
            </button>
            <div className="w-px bg-slate-300 mx-1 hidden md:block"></div>
            <button 
                onClick={() => setIsProviderModalOpen(true)}
                className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium shadow-sm"
            >
                <Briefcase size={18} /> Proveedores
            </button>
            <button 
                onClick={() => setIsCategoryModalOpen(true)}
                className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium shadow-sm"
            >
                <FolderCog size={18} /> Categorías
            </button>
            <button 
                onClick={() => {
                    resetForm();
                    setFormData(prev => ({
                        ...prev, 
                        category: categories.length > 0 ? categories[0].name : '',
                        provider: providers.length > 0 ? providers[0].name : ''
                    }));
                    setIsModalOpen(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-medium"
            >
                <Plus size={20} /> Nuevo Producto
            </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por nombre, código, proveedor..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select 
          className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="ALL">Todas las Categorías</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.name}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Código</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Producto</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Categoría / Proveedor</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Costo</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Precio</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Stock</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-xs font-mono text-slate-500">{product.code}</td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{product.name}</div>
                    {product.description && <div className="text-xs text-slate-500">{product.description}</div>}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 mb-1">
                      {product.category}
                    </span>
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                        <Truck size={12} /> {product.provider || 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-500">${product.cost}</td>
                  <td className="px-6 py-4 text-right font-medium text-slate-900">${product.price}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-bold ${
                      product.stock < 5 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {product.stock}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2 flex justify-end">
                    <button 
                        onClick={() => handleOpenRestock(product)} 
                        className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 transition-colors p-1.5 rounded"
                        title="Ingresar Stock"
                    >
                      <PackagePlus size={18} />
                    </button>
                    <button onClick={() => handleEdit(product)} className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors p-1.5 rounded">
                      <Edit2 size={18} />
                    </button>
                    <button onClick={() => handleDelete(product.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors p-1.5 rounded">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    No se encontraron productos con estos criterios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- RESTOCK MODAL --- */}
      {isRestockModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden animate-fade-in-up">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                 <PackagePlus size={20} className="text-emerald-600" /> Ingresar Mercadería
              </h3>
              <button onClick={() => setIsRestockModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
                 {/* Product Selection */}
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Producto</label>
                    <select 
                        className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-medium"
                        value={restockProductId}
                        onChange={(e) => {
                            setRestockProductId(e.target.value);
                            const p = products.find(prod => prod.id === e.target.value);
                            if(p) setRestockNewCost(p.cost);
                        }}
                    >
                        <option value="">-- Seleccionar Producto --</option>
                        {/* Optional: Limit list if too long or use search filter above */}
                        {restockFilteredProducts.map(p => (
                            <option key={p.id} value={p.id}>
                                {p.name} ({p.code})
                            </option>
                        ))}
                    </select>
                    
                    {/* Inline Search for the select */}
                    <div className="mt-2 flex items-center gap-2">
                        <Search size={14} className="text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Filtrar lista por nombre..."
                            className="text-xs border-b border-slate-200 focus:border-indigo-500 focus:outline-none w-full py-1"
                            value={restockSearch}
                            onChange={(e) => setRestockSearch(e.target.value)}
                        />
                    </div>
                 </div>

                 {selectedProductForRestock && (
                     <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                         <div className="flex justify-between items-center mb-2">
                             <span className="text-sm text-slate-500">Stock Actual:</span>
                             <span className="font-bold text-slate-800 text-lg">{selectedProductForRestock.stock} u.</span>
                         </div>
                         <div className="flex justify-between items-center">
                             <span className="text-sm text-slate-500">Costo Actual:</span>
                             <span className="font-medium text-slate-700">${selectedProductForRestock.cost}</span>
                         </div>
                     </div>
                 )}

                 <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Cantidad a Ingresar</label>
                        <input 
                            type="number" 
                            min="1"
                            className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-lg font-bold text-emerald-600"
                            value={restockQuantity}
                            onChange={(e) => setRestockQuantity(parseInt(e.target.value) || 0)}
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nuevo Costo (Unit.)</label>
                        <input 
                            type="number" 
                            min="0"
                            className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            value={restockNewCost}
                            onChange={(e) => setRestockNewCost(parseFloat(e.target.value) || 0)}
                            disabled={!selectedProductForRestock}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Opcional. Modifica el costo base.</p>
                     </div>
                 </div>
                 
                 {selectedProductForRestock && restockQuantity > 0 && (
                     <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 p-2 rounded justify-center">
                         <span>Nuevo Stock Total:</span>
                         <span className="font-bold">{selectedProductForRestock.stock + restockQuantity} unidades</span>
                     </div>
                 )}

                 <button 
                    onClick={handleSubmitRestock}
                    disabled={!selectedProductForRestock || restockQuantity <= 0}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                 >
                    <ArrowRight size={20} /> Confirmar Ingreso
                 </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full overflow-hidden animate-fade-in-up">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">
                {formData.id ? 'Editar Producto' : 'Nuevo Producto'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                {/* Row 1: Code and Provider */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                        <Barcode size={14}/> Código / SKU
                    </label>
                    <input 
                      type="text" 
                      placeholder="Ejp: A-100"
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      value={formData.code}
                      onChange={e => setFormData({...formData, code: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                        <Truck size={14}/> Proveedor
                    </label>
                    <select 
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                      value={formData.provider}
                      onChange={e => setFormData({...formData, provider: e.target.value})}
                    >
                      <option value="">Seleccionar Proveedor</option>
                      {providers.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                </div>
              </div>

              {/* Row 2: Name and Category */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Producto</label>
                    <input 
                    type="text" 
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                      <Tag size={14} /> Categoría
                  </label>
                  <select 
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                  >
                    {categories.length === 0 && <option value="">Sin Categorías</option>}
                    {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                  </select>
                </div>
              </div>
              
              {/* Row 3: Prices and Stock */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Costo ($)</label>
                  <input 
                    type="number" 
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={formData.cost}
                    onChange={e => setFormData({...formData, cost: parseInt(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Precio ($)</label>
                  <input 
                    type="number" 
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={formData.price}
                    onChange={e => setFormData({...formData, price: parseInt(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stock Inicial</label>
                  <input 
                    type="number" 
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={formData.stock}
                    onChange={e => setFormData({...formData, stock: parseInt(e.target.value)})}
                  />
                </div>
              </div>

              {/* Row 4: Desc */}
              <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                    <input 
                    type="text"
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={formData.description || ''}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    />
                  </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSave}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium flex items-center gap-2"
              >
                <Save size={18} /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Manager Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden animate-fade-in-up">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                 <FolderCog size={18} /> Gestionar Categorías
              </h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
                <div className="flex gap-2 mb-4">
                    <input 
                        type="text" 
                        placeholder="Nueva categoría..."
                        className="flex-1 border border-slate-300 rounded-lg p-2 text-sm focus:outline-none focus:border-indigo-500"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                    <button 
                        onClick={handleAddCategory}
                        disabled={!newCategoryName.trim()}
                        className="bg-indigo-600 text-white p-2 rounded-lg disabled:opacity-50"
                    >
                        <Plus size={20} />
                    </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {categories.map(cat => (
                        <div key={cat.id} className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-100">
                            <span className="text-sm font-medium text-slate-700">{cat.name}</span>
                            <button 
                                onClick={() => handleDeleteCategory(cat.id)}
                                className="text-slate-400 hover:text-red-500"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                    {categories.length === 0 && (
                        <p className="text-center text-xs text-slate-400 py-4">No hay categorías definidas</p>
                    )}
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Provider Manager Modal */}
      {isProviderModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden animate-fade-in-up">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                 <Briefcase size={18} /> Gestionar Proveedores
              </h3>
              <button onClick={() => setIsProviderModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
                <div className="flex gap-2 mb-4">
                    <input 
                        type="text" 
                        placeholder="Nuevo proveedor..."
                        className="flex-1 border border-slate-300 rounded-lg p-2 text-sm focus:outline-none focus:border-indigo-500"
                        value={newProviderName}
                        onChange={(e) => setNewProviderName(e.target.value)}
                    />
                    <button 
                        onClick={handleAddProvider}
                        disabled={!newProviderName.trim()}
                        className="bg-indigo-600 text-white p-2 rounded-lg disabled:opacity-50"
                    >
                        <Plus size={20} />
                    </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {providers.map(p => (
                        <div key={p.id} className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-100">
                            <span className="text-sm font-medium text-slate-700">{p.name}</span>
                            <button 
                                onClick={() => handleDeleteProvider(p.id)}
                                className="text-slate-400 hover:text-red-500"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                    {providers.length === 0 && (
                        <p className="text-center text-xs text-slate-400 py-4">No hay proveedores definidos</p>
                    )}
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
