import React, { useState, useEffect } from 'react';
import { Product, CategoryItem } from '../types';
import { Plus, Search, Trash2, Edit2, Save, X, Percent, Tag, Truck, Barcode, FolderCog } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface InventoryProps {
  products: Product[];
  onUpdate: () => void;
}

const Inventory: React.FC<InventoryProps> = ({ products, onUpdate }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [categories, setCategories] = useState<CategoryItem[]>([]);

  // Category Management State
  const [newCategoryName, setNewCategoryName] = useState('');

  // Form State
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

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = () => {
    setCategories(StorageService.getCategories());
  };

  const handleSave = () => {
    if (!formData.name || !formData.price || !formData.category) return;

    const newProduct: Product = {
      id: formData.id || Date.now().toString(),
      code: formData.code || 'S/C',
      name: formData.name,
      category: formData.category,
      provider: formData.provider || '',
      price: Number(formData.price),
      cost: Number(formData.cost),
      stock: Number(formData.stock),
      description: formData.description,
      commissionPercentage: formData.commissionPercentage ? Number(formData.commissionPercentage) : undefined
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
        provider: '', 
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

  // Category Logic
  const handleAddCategory = () => {
    if(!newCategoryName.trim()) return;
    const newCat: CategoryItem = { id: Date.now().toString(), name: newCategoryName.trim() };
    StorageService.saveCategory(newCat);
    setNewCategoryName('');
    loadCategories();
  };

  const handleDeleteCategory = (id: string) => {
      if(confirm('¿Eliminar categoría? Los productos asociados mantendrán el nombre pero no estarán vinculados.')) {
          StorageService.deleteCategory(id);
          loadCategories();
      }
  }

  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term) || p.provider.toLowerCase().includes(term);
    const matchesCategory = filterCategory === 'ALL' || p.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-800">Inventario</h2>
        <div className="flex gap-2">
            <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium shadow-sm"
            >
            <FolderCog size={20} /> Categorías
            </button>
            <button 
            onClick={() => {
                resetForm();
                // Ensure we set a valid category if possible
                if(categories.length > 0) {
                     setFormData(prev => ({...prev, category: categories[0].name}));
                }
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
                    {product.commissionPercentage && (
                        <div className="text-xs text-indigo-500 font-medium mt-1">Comisión: {product.commissionPercentage}%</div>
                    )}
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
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => handleEdit(product)} className="text-blue-600 hover:text-blue-800 transition-colors p-1">
                      <Edit2 size={18} />
                    </button>
                    <button onClick={() => handleDelete(product.id)} className="text-red-500 hover:text-red-700 transition-colors p-1">
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
                    <input 
                      type="text" 
                      placeholder="Ejp: Distribuidora Central"
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      value={formData.provider}
                      onChange={e => setFormData({...formData, provider: e.target.value})}
                    />
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stock</label>
                  <input 
                    type="number" 
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={formData.stock}
                    onChange={e => setFormData({...formData, stock: parseInt(e.target.value)})}
                  />
                </div>
              </div>

              {/* Row 4: Commission and Desc */}
              <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <label className="block text-sm font-medium text-indigo-700 mb-1 flex items-center gap-1">
                        <Percent size={14} /> Comisión (%)
                    </label>
                    <input 
                        type="number" 
                        placeholder="Auto"
                        className="w-full border border-indigo-200 bg-indigo-50 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        value={formData.commissionPercentage || ''}
                        onChange={e => setFormData({...formData, commissionPercentage: e.target.value ? Number(e.target.value) : undefined})}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Deja vacío para usar valor global</p>
                  </div>
                  <div className="col-span-2">
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
    </div>
  );
};

export default Inventory;