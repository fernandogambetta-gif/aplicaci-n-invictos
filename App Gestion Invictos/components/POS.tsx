
import React, { useState, useMemo, useEffect } from 'react';
import { Product, SaleItem, Sale, User, AppConfig, CategoryItem } from '../types';
import { ShoppingCart, Minus, Plus, Trash, CheckCircle, Percent, DollarSign } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface POSProps {
  products: Product[];
  onSaleComplete: () => void;
  currentUser: User;
}

const POS: React.FC<POSProps> = ({ products, onSaleComplete, currentUser }) => {
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [successMsg, setSuccessMsg] = useState('');
  const [config, setConfig] = useState<AppConfig>({ commissionPercentage: 0 });

  // Discount States
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState<string>('');

  useEffect(() => {
    setConfig(StorageService.getConfig());
    setCategories(StorageService.getCategories());
  }, []);

  const addToCart = (product: Product) => {
    if (product.stock <= 0) return;

    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev; // Cannot add more than stock
        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.priceAtSale }
            : item
        );
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        priceAtSale: product.price,
        subtotal: product.price
      }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      
      const product = products.find(p => p.id === productId);
      const maxStock = product ? product.stock : 0;
      const newQuantity = item.quantity + delta;

      if (newQuantity < 1) return item;
      if (newQuantity > maxStock) return item;

      return {
        ...item,
        quantity: newQuantity,
        subtotal: newQuantity * item.priceAtSale
      };
    }));
  };

  const cartSubtotal = cart.reduce((acc, item) => acc + item.subtotal, 0);

  const calculateDiscount = (): number => {
    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) return 0;

    if (discountType === 'percent') {
        return Math.min(cartSubtotal, cartSubtotal * (val / 100));
    } else {
        return Math.min(cartSubtotal, val);
    }
  };

  const discountAmount = calculateDiscount();
  const finalTotal = cartSubtotal - discountAmount;

  const handleCheckout = () => {
    if (cart.length === 0) return;

    // Calculate effective discount ratio to scale commissions
    // If we discount 10% of total, commission should reduce by 10%
    const discountRatio = cartSubtotal > 0 ? (finalTotal / cartSubtotal) : 1;

    // Calculate commissions with hierarchy: User > Global (Product commission removed)
    // AND apply the discount ratio
    const itemsWithCommission = cart.map(item => {
      let commissionRate = config.commissionPercentage; // Base level
      
      if (currentUser.commissionPercentage !== undefined) {
        commissionRate = currentUser.commissionPercentage; // User level overrides Global
      }
      
      // Base commission based on original item price
      const baseCommission = item.subtotal * (commissionRate / 100);
      
      // Adjusted commission based on discount given
      const commissionAmount = baseCommission * discountRatio;

      return {
        ...item,
        commissionAmount
      };
    });

    const sale: Sale = {
      id: Date.now().toString(),
      items: itemsWithCommission,
      subtotal: cartSubtotal,
      discount: discountAmount,
      total: finalTotal,
      timestamp: Date.now(),
      paymentMethod,
      userId: currentUser.id,
      userName: currentUser.name
    };

    StorageService.addSale(sale);
    setCart([]);
    setDiscountValue('');
    onSaleComplete();
    setSuccessMsg('Venta registrada correctamente!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCat = selectedCategory === 'ALL' || p.category === selectedCategory;
      const searchLower = search.toLowerCase();
      const matchesSearch = p.name.toLowerCase().includes(searchLower) || p.code.toLowerCase().includes(searchLower);
      return matchesCat && matchesSearch;
    });
  }, [products, selectedCategory, search]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
      {/* Product Grid */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Search & Filter */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-3">
          <input 
            type="text" 
            placeholder="Buscar por nombre o código..." 
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select 
            className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none bg-white"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="ALL">Todas las Categorías</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.name}>{cat.name}</option>
            ))}
          </select>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 content-start">
          {filteredProducts.map(product => (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
              disabled={product.stock <= 0}
              className={`
                flex flex-col items-start p-4 rounded-xl border transition-all text-left relative
                ${product.stock > 0 
                  ? 'bg-white border-slate-200 hover:border-indigo-500 hover:shadow-md cursor-pointer' 
                  : 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'}
              `}
            >
              <div className="flex justify-between w-full">
                  <span className="text-xs font-semibold text-slate-400 uppercase truncate">{product.category}</span>
                  <span className="text-[10px] font-mono text-slate-300">{product.code}</span>
              </div>
              <h3 className="font-semibold text-slate-800 leading-tight mb-2 min-h-[2.5rem] line-clamp-2">
                {product.name}
              </h3>
              <div className="mt-auto w-full flex justify-between items-end">
                <span className="text-lg font-bold text-indigo-600">${product.price}</span>
                <span className={`text-xs px-2 py-1 rounded ${product.stock < 3 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                  Stock: {product.stock}
                </span>
              </div>
            </button>
          ))}
          {filteredProducts.length === 0 && (
             <div className="col-span-full flex flex-col items-center justify-center text-slate-400 py-10">
                 <p>No se encontraron productos.</p>
             </div>
          )}
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-full lg:w-96 bg-white rounded-xl shadow-lg border border-slate-200 flex flex-col h-full">
        <div className="p-5 border-b border-slate-100 bg-slate-50 rounded-t-xl">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ShoppingCart size={24} /> Resumen de Venta
          </h2>
          <p className="text-xs text-slate-500 mt-1">Vendedor: {currentUser.name}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
              <ShoppingCart size={48} className="opacity-20" />
              <p>El carrito está vacío</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.productId} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
                <div className="flex-1 min-w-0 pr-2">
                  <p className="font-medium text-slate-800 truncate">{item.productName}</p>
                  <p className="text-sm text-indigo-600 font-semibold">${item.subtotal}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQuantity(item.productId, -1)} className="p-1 hover:bg-slate-200 rounded">
                    <Minus size={16} />
                  </button>
                  <span className="w-6 text-center font-medium">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.productId, 1)} className="p-1 hover:bg-slate-200 rounded">
                    <Plus size={16} />
                  </button>
                  <button onClick={() => removeFromCart(item.productId)} className="p-1 text-red-400 hover:text-red-600 ml-1">
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-5 border-t border-slate-100 bg-slate-50 rounded-b-xl space-y-4">
          
          {/* Discount Section */}
          <div className="bg-white p-3 rounded-lg border border-slate-200">
             <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Descuento</label>
             <div className="flex gap-2">
                 <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
                    <button 
                        onClick={() => setDiscountType('percent')}
                        className={`p-1.5 rounded ${discountType === 'percent' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Percent size={16} />
                    </button>
                    <button 
                        onClick={() => setDiscountType('amount')}
                        className={`p-1.5 rounded ${discountType === 'amount' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <DollarSign size={16} />
                    </button>
                 </div>
                 <input 
                    type="number" 
                    placeholder={discountType === 'percent' ? '0%' : '$0'}
                    className="flex-1 border border-slate-300 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right font-medium"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                 />
             </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Método de Pago</label>
            <div className="grid grid-cols-3 gap-2">
              <button 
                onClick={() => setPaymentMethod('cash')}
                className={`text-xs font-medium py-2 rounded-lg border ${paymentMethod === 'cash' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-300 text-slate-600'}`}
              >
                Efectivo
              </button>
              <button 
                onClick={() => setPaymentMethod('card')}
                className={`text-xs font-medium py-2 rounded-lg border ${paymentMethod === 'card' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-300 text-slate-600'}`}
              >
                Tarjeta
              </button>
              <button 
                onClick={() => setPaymentMethod('transfer')}
                className={`text-xs font-medium py-2 rounded-lg border ${paymentMethod === 'transfer' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-300 text-slate-600'}`}
              >
                Transf.
              </button>
            </div>
          </div>

          <div className="space-y-1 pt-2">
            <div className="flex justify-between items-center text-sm text-slate-500">
                <span>Subtotal</span>
                <span>${cartSubtotal}</span>
            </div>
            {discountAmount > 0 && (
                <div className="flex justify-between items-center text-sm text-green-600 font-medium">
                    <span>Descuento</span>
                    <span>-${discountAmount.toFixed(2)}</span>
                </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <span className="text-lg font-medium text-slate-800">Total</span>
                <span className="text-3xl font-bold text-indigo-600">${finalTotal}</span>
            </div>
          </div>

          <button 
            onClick={handleCheckout}
            disabled={cart.length === 0}
            className={`
              w-full py-4 rounded-xl font-bold text-lg shadow-md transition-all
              ${cart.length > 0 
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200' 
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'}
            `}
          >
            Confirmar Venta
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-4 rounded-xl shadow-lg z-50 flex items-center gap-3 animate-fade-in-up">
          <CheckCircle size={24} />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}
    </div>
  );
};

export default POS;
