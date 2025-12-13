import React, { useMemo } from 'react';
import { Product, Sale } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { DollarSign, AlertTriangle, TrendingUp, ShoppingBag, PlusCircle, ArrowRight } from 'lucide-react';

interface DashboardProps {
  products: Product[];
  sales: Sale[];
  onNavigate: (view: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ products, sales, onNavigate }) => {
  
  const stats = useMemo(() => {
    const totalRevenue = sales.reduce((acc, curr) => acc + curr.total, 0);
    const totalSalesCount = sales.length;
    const lowStockCount = products.filter(p => p.stock < 5).length;
    
    // Calculate top category
    const categoryCounts: Record<string, number> = {};
    sales.forEach(sale => {
      sale.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          // Use product category if available, otherwise 'Desconocido'
          const catName = product.category || 'Varios';
          categoryCounts[catName] = (categoryCounts[catName] || 0) + item.quantity;
        }
      });
    });
    
    // Sort by count desc
    const sortedCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
    const topCategory = sortedCategories.length > 0 ? sortedCategories[0][0] : 'N/A';

    return {
      totalRevenue,
      totalSalesCount,
      lowStockCount,
      topCategory
    };
  }, [products, sales]);

  // Prepare chart data (Sales by Date - Last 7 entries or grouped by day)
  const chartData = useMemo(() => {
    // Group sales by date (DD/MM)
    const grouped = sales.reduce((acc, sale) => {
      const date = new Date(sale.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
      acc[date] = (acc[date] || 0) + sale.total;
      return acc;
    }, {} as Record<string, number>);

    // Ensure we have at least some data points for visual appeal, even if 0
    return Object.entries(grouped).map(([date, total]) => ({ date, total })).slice(-7); 
  }, [sales]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">Panel de Control</h2>
           <p className="text-slate-500 text-sm">Resumen de actividad de INVICTOS</p>
        </div>
        <div className="flex gap-2">
            <button 
              onClick={() => onNavigate('pos')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
            >
                <ShoppingBag size={18} /> Nueva Venta
            </button>
            <button 
              onClick={() => onNavigate('inventory')}
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
            >
                <PlusCircle size={18} /> Producto
            </button>
        </div>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-sm font-medium text-slate-500">Ingresos Totales</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">${stats.totalRevenue.toLocaleString()}</p>
            </div>
            <div className="p-2 bg-green-100 rounded-lg text-green-600">
              <DollarSign size={20} />
            </div>
          </div>
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-green-50 rounded-full z-0 opacity-50" />
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-sm font-medium text-slate-500">Ventas Realizadas</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{stats.totalSalesCount}</p>
            </div>
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <ShoppingBag size={20} />
            </div>
          </div>
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-blue-50 rounded-full z-0 opacity-50" />
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-sm font-medium text-slate-500">Bajo Stock</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{stats.lowStockCount}</p>
            </div>
            <div className="p-2 bg-red-100 rounded-lg text-red-600">
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-red-50 rounded-full z-0 opacity-50" />
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-sm font-medium text-slate-500">Cat. Más Vendida</p>
              <p className="text-2xl font-bold text-slate-800 mt-1 truncate">{stats.topCategory}</p>
            </div>
            <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-purple-50 rounded-full z-0 opacity-50" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-96">
            <h3 className="text-lg font-semibold text-slate-700 mb-4">Evolución de Ingresos (Últimos 7 días)</h3>
            {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#64748b" tick={{fontSize: 12}} />
                <YAxis stroke="#64748b" tick={{fontSize: 12}} tickFormatter={(val) => `$${val}`} />
                <Tooltip 
                    formatter={(value: number) => [`$${value}`, 'Ingresos']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="total" stroke="#4f46e5" strokeWidth={3} activeDot={{ r: 8 }} dot={{ r: 4 }} />
                </LineChart>
            </ResponsiveContainer>
            ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                <TrendingUp size={32} className="opacity-20"/>
                <p>Registra tu primera venta para ver estadísticas.</p>
            </div>
            )}
        </div>

        {/* Quick Actions / Tips */}
        <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg flex flex-col justify-between">
            <div>
                <h3 className="text-xl font-bold mb-2">Consejo del Día</h3>
                <p className="text-slate-300 text-sm mb-6">
                    Mantener el inventario actualizado es clave para no perder ventas. Revisa los productos con bajo stock.
                </p>
                <div className="bg-slate-800 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-400 text-xs uppercase font-bold">Estado del Sistema</span>
                        <span className="w-2 h-2 bg-green-400 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.5)]"></span>
                    </div>
                    <div className="text-2xl font-mono">{products.length} <span className="text-sm text-slate-500 font-sans">Productos</span></div>
                </div>
            </div>
            <button 
                onClick={() => onNavigate('ai')}
                className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
            >
                Consultar con IA <ArrowRight size={16} />
            </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;