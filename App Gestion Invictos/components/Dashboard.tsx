
import React, { useMemo, useState } from 'react';
import { Product, Sale, User } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import { 
  DollarSign, ShoppingBag, TrendingUp, Calendar, Users, 
  Package, AlertCircle, ArrowUpRight, ArrowDownRight, Award 
} from 'lucide-react';

interface DashboardProps {
  products: Product[];
  sales: Sale[];
  onNavigate: (view: string) => void;
  currentUser: User;
}

type TimeRange = 'today' | 'week' | 'month' | 'year';
type TabView = 'overview' | 'sellers' | 'products';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const Dashboard: React.FC<DashboardProps> = ({ products, sales, onNavigate, currentUser }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [activeTab, setActiveTab] = useState<TabView>('overview');

  const isAdmin = currentUser.role === 'admin';

  // --- FILTERING LOGIC (Role Based) ---
  const roleFilteredSales = useMemo(() => {
     if (!Array.isArray(sales)) return [];
     if (isAdmin) return sales;
     // Sellers only see their own sales
     return sales.filter(s => s.userId === currentUser.id);
  }, [sales, isAdmin, currentUser.id]);

  // --- FILTERING LOGIC (Time Based) ---
  const filteredSales = useMemo(() => {
    const now = new Date();
    const start = new Date();

    // Reset hours to start of day
    start.setHours(0, 0, 0, 0);

    if (timeRange === 'week') {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
      start.setDate(diff);
    } else if (timeRange === 'month') {
      start.setDate(1);
    } else if (timeRange === 'year') {
      start.setMonth(0, 1);
    }
    // 'today' is already set to start of today

    return roleFilteredSales.filter(s => s.timestamp >= start.getTime());
  }, [roleFilteredSales, timeRange]);

  // --- STATS CALCULATION ---
  const stats = useMemo(() => {
    const totalRevenue = filteredSales.reduce((acc, s) => acc + (s.total || 0), 0);
    const totalSalesCount = filteredSales.length;
    // Defensive check: ensure s.items exists
    const totalItemsSold = filteredSales.reduce((acc, s) => acc + (s.items || []).reduce((sum, i) => sum + (i.quantity || 0), 0), 0);
    
    let grossProfit = 0;
    
    // Only calculate profit for admin
    if (isAdmin) {
        let totalCost = 0;
        filteredSales.forEach(sale => {
            if (Array.isArray(sale.items)) {
                sale.items.forEach(item => {
                    const product = products.find(p => p.id === item.productId);
                    if (product) {
                        totalCost += (product.cost || 0) * (item.quantity || 0);
                    }
                });
            }
        });
        grossProfit = totalRevenue - totalCost;
    }

    return { totalRevenue, totalSalesCount, totalItemsSold, grossProfit };
  }, [filteredSales, products, isAdmin]);

  // --- SELLER STATS ---
  const sellerStats = useMemo(() => {
    const sellerMap: Record<string, { name: string; total: number; count: number; items: number }> = {};

    // Use full sales history for ranking, but respect role filter (seller sees only themselves)
    roleFilteredSales.forEach(sale => {
      const userId = sale.userId || 'unknown';
      if (!sellerMap[userId]) {
        sellerMap[userId] = { name: sale.userName || 'Desconocido', total: 0, count: 0, items: 0 };
      }
      sellerMap[userId].total += (sale.total || 0);
      sellerMap[userId].count += 1;
      if (Array.isArray(sale.items)) {
          sellerMap[userId].items += sale.items.reduce((acc, i) => acc + (i.quantity || 0), 0);
      }
    });

    return Object.values(sellerMap).sort((a, b) => b.total - a.total);
  }, [roleFilteredSales]);

  // --- PRODUCT STATS ---
  const productStats = useMemo(() => {
    const prodMap: Record<string, { id: string; name: string; category: string; qty: number; revenue: number }> = {};
    
    // Initialize with all products to track those with 0 sales
    if (Array.isArray(products)) {
        products.forEach(p => {
            prodMap[p.id] = { id: p.id, name: p.name, category: p.category, qty: 0, revenue: 0 };
        });
    }

    // Fill with sales data
    filteredSales.forEach(sale => {
        if (Array.isArray(sale.items)) {
            sale.items.forEach(item => {
                if (prodMap[item.productId]) {
                    prodMap[item.productId].qty += (item.quantity || 0);
                    prodMap[item.productId].revenue += (item.subtotal || 0);
                }
            });
        }
    });

    const allStats = Object.values(prodMap);
    const withSales = allStats.filter(p => p.qty > 0).sort((a, b) => b.qty - a.qty);
    const noSales = allStats.filter(p => p.qty === 0);

    return { withSales, noSales };
  }, [filteredSales, products]);

  // --- CHART DATA (Revenue by day/group) ---
  const chartData = useMemo(() => {
    const grouped: Record<string, number> = {};
    filteredSales.forEach(sale => {
        const date = new Date(sale.timestamp);
        let key = '';
        if (timeRange === 'today') key = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        else if (timeRange === 'year') key = date.toLocaleDateString('es-ES', { month: 'short' });
        else key = date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        
        grouped[key] = (grouped[key] || 0) + (sale.total || 0);
    });

    return Object.entries(grouped).map(([name, value]) => ({ name, value }));
  }, [filteredSales, timeRange]);

  // --- HELPER UI COMPONENTS ---
  const TabButton = ({ id, label, icon: Icon }: { id: TabView, label: string, icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
        ${activeTab === id 
            ? 'bg-indigo-600 text-white shadow-md' 
            : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}
      `}
    >
      <Icon size={18} /> {label}
    </button>
  );

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      
      {/* Header & Global Filters */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">
                {isAdmin ? 'Panel de Control (Global)' : 'Mis Ventas'}
           </h2>
           <p className="text-slate-500 text-sm flex items-center gap-1">
             <Calendar size={14} /> {isAdmin ? 'Reportes y Análisis del Negocio' : 'Resumen de mi actividad'}
           </p>
        </div>

        <div className="flex flex-wrap gap-2">
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                {(['today', 'week', 'month', 'year'] as const).map(tr => (
                    <button
                        key={tr}
                        onClick={() => setTimeRange(tr)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${timeRange === tr ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        {tr === 'today' ? 'Hoy' : tr === 'week' ? 'Semana' : tr === 'month' ? 'Mes' : 'Año'}
                    </button>
                ))}
            </div>
            
            <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block"></div>

            <button 
              onClick={() => onNavigate('pos')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold shadow-sm transition-colors"
            >
                <ShoppingBag size={16} /> Nueva Venta
            </button>
        </div>
      </div>

      {/* Tabs - Only show Overview and Products for sellers, hide Sellers tab */}
      <div className="flex gap-2 overflow-x-auto pb-2">
         <TabButton id="overview" label="Resumen" icon={TrendingUp} />
         {isAdmin && <TabButton id="sellers" label="Rendimiento Vendedores" icon={Users} />}
         <TabButton id="products" label="Productos" icon={Package} />
      </div>

      {/* --- VIEW: OVERVIEW --- */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
            {/* KPI Cards */}
            <div className={`grid grid-cols-1 md:grid-cols-2 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-500">{isAdmin ? 'Ingresos Globales' : 'Mis Ingresos'} ({timeRange})</p>
                            <p className="text-2xl font-bold text-slate-800 mt-1">${stats.totalRevenue.toLocaleString()}</p>
                        </div>
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <DollarSign size={20} />
                        </div>
                    </div>
                </div>
                
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-500">{isAdmin ? 'Ventas Totales' : 'Mis Ventas Cerradas'}</p>
                            <p className="text-2xl font-bold text-slate-800 mt-1">{stats.totalSalesCount}</p>
                        </div>
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <ShoppingBag size={20} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Artículos Vendidos</p>
                            <p className="text-2xl font-bold text-slate-800 mt-1">{stats.totalItemsSold}</p>
                        </div>
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                            <Package size={20} />
                        </div>
                    </div>
                </div>

                {isAdmin && (
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-sm font-medium text-slate-500">Ganancia Bruta Est.</p>
                                <p className="text-2xl font-bold text-emerald-600 mt-1">${stats.grossProfit.toLocaleString()}</p>
                            </div>
                            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                <TrendingUp size={20} />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Main Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-80">
                <h3 className="text-lg font-bold text-slate-700 mb-4">{isAdmin ? 'Evolución de Ingresos Globales' : 'Mi Evolución de Ventas'}</h3>
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" stroke="#64748b" tick={{fontSize: 12}} />
                            <YAxis stroke="#64748b" tick={{fontSize: 12}} tickFormatter={(val) => `$${val}`} />
                            <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(value: number) => [`$${value.toLocaleString()}`, 'Ventas']}
                            />
                            <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <p>No hay datos para este periodo.</p>
                    </div>
                )}
            </div>
        </div>
      )}

      {/* --- VIEW: SELLERS (Admin Only) --- */}
      {activeTab === 'sellers' && isAdmin && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-700 mb-4">Tabla de Líderes</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold">
                            <tr>
                                <th className="px-4 py-3">Puesto</th>
                                <th className="px-4 py-3">Vendedor</th>
                                <th className="px-4 py-3 text-right">Transacciones</th>
                                <th className="px-4 py-3 text-right">Total Vendido</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sellerStats.map((seller, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                    <td className="px-4 py-3">
                                        {idx === 0 ? <Award className="text-yellow-500" size={20} /> : <span className="text-slate-400 font-mono ml-1">#{idx + 1}</span>}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-800">{seller.name}</td>
                                    <td className="px-4 py-3 text-right text-slate-600">{seller.count}</td>
                                    <td className="px-4 py-3 text-right font-bold text-indigo-600">${seller.total.toLocaleString()}</td>
                                </tr>
                            ))}
                            {sellerStats.length === 0 && (
                                <tr><td colSpan={4} className="text-center py-8 text-slate-400">Sin ventas en este periodo.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
             </div>

             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-80">
                 <h3 className="text-lg font-bold text-slate-700 mb-4">Participación de Mercado</h3>
                 {sellerStats.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={sellerStats}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="total"
                            >
                                {sellerStats.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                        </PieChart>
                    </ResponsiveContainer>
                 ) : (
                    <div className="h-full flex items-center justify-center text-slate-400">Sin datos</div>
                 )}
             </div>
         </div>
      )}

      {/* --- VIEW: PRODUCTS --- */}
      {activeTab === 'products' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
              {/* TOP PERFORMERS */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 bg-green-50 border-b border-green-100 flex items-center justify-between">
                      <h3 className="font-bold text-green-800 flex items-center gap-2">
                          <ArrowUpRight size={20} /> Más Vendidos {isAdmin ? '(Global)' : '(Mis Ventas)'}
                      </h3>
                      <span className="text-xs text-green-700 bg-white px-2 py-1 rounded-full border border-green-200">Ranking</span>
                  </div>
                  <div className="overflow-y-auto max-h-[500px]">
                      <table className="w-full text-left">
                          <thead className="bg-slate-50 text-xs text-slate-500 uppercase sticky top-0">
                              <tr>
                                  <th className="px-4 py-3">Producto</th>
                                  <th className="px-4 py-3 text-right">Cant.</th>
                                  <th className="px-4 py-3 text-right">Ingresos</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {productStats.withSales.slice(0, 10).map((p, idx) => (
                                  <tr key={p.id} className="hover:bg-slate-50">
                                      <td className="px-4 py-3">
                                          <div className="font-medium text-slate-800">{p.name}</div>
                                          <div className="text-xs text-slate-400">{p.category}</div>
                                      </td>
                                      <td className="px-4 py-3 text-right font-bold text-slate-700">{p.qty}</td>
                                      <td className="px-4 py-3 text-right text-green-600 font-medium">${p.revenue.toLocaleString()}</td>
                                  </tr>
                              ))}
                               {productStats.withSales.length === 0 && (
                                  <tr><td colSpan={3} className="text-center py-8 text-slate-400">No hay ventas registradas.</td></tr>
                              )}
                          </tbody>
                      </table>
                  </div>
              </div>

              {/* ZERO MOVEMENT */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 bg-red-50 border-b border-red-100 flex items-center justify-between">
                      <h3 className="font-bold text-red-800 flex items-center gap-2">
                          <ArrowDownRight size={20} /> Sin Movimiento {isAdmin ? '' : '(En mis ventas)'}
                      </h3>
                      <span className="text-xs text-red-700 bg-white px-2 py-1 rounded-full border border-red-200">
                          {productStats.noSales.length} artículos
                      </span>
                  </div>
                  <div className="overflow-y-auto max-h-[500px]">
                      <table className="w-full text-left">
                          <thead className="bg-slate-50 text-xs text-slate-500 uppercase sticky top-0">
                              <tr>
                                  <th className="px-4 py-3">Producto</th>
                                  <th className="px-4 py-3">Categoría</th>
                                  <th className="px-4 py-3 text-right">Stock Actual</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {productStats.noSales.map((p) => {
                                  // Find current stock from original product list
                                  const original = products.find(prod => prod.id === p.id);
                                  return (
                                    <tr key={p.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-medium text-slate-700">{p.name}</td>
                                        <td className="px-4 py-3 text-sm text-slate-500">{p.category}</td>
                                        <td className="px-4 py-3 text-right text-sm">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${original && (original.stock || 0) > 0 ? 'bg-slate-100 text-slate-700' : 'bg-red-100 text-red-700'}`}>
                                                {original?.stock || 0}
                                            </span>
                                        </td>
                                    </tr>
                                  );
                              })}
                              {productStats.noSales.length === 0 && (
                                  <tr><td colSpan={3} className="text-center py-8 text-green-500 font-medium">¡Increíble! Todo el catálogo tiene ventas.</td></tr>
                              )}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default Dashboard;
