
import React, { useState, useMemo } from 'react';
import { Sale, User } from '../types';
import { Search, Filter, Calendar, User as UserIcon, DollarSign, Download } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface SalesHistoryProps {
  sales: Sale[];
  currentUser: User;
}

const SalesHistory: React.FC<SalesHistoryProps> = ({ sales, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeller, setSelectedSeller] = useState<string>('ALL');

  const isAdmin = currentUser.role === 'admin';

  // Extract unique sellers from sales for the filter dropdown
  const sellersList = useMemo(() => {
    const sellersMap = new Map();
    sales.forEach(s => {
      if (s.userId && s.userName) {
        sellersMap.set(s.userId, s.userName);
      }
    });
    return Array.from(sellersMap.entries()).map(([id, name]) => ({ id, name }));
  }, [sales]);

  // Filter Sales Logic
  const filteredSales = useMemo(() => {
    let result = sales;

    // 1. Role Security Filter
    if (!isAdmin) {
      // Sellers can ONLY see their own sales
      result = result.filter(s => s.userId === currentUser.id);
    } else {
      // Admins can filter by specific seller using the dropdown
      if (selectedSeller !== 'ALL') {
        result = result.filter(s => s.userId === selectedSeller);
      }
    }

    // 2. Search Filter (applies to everyone)
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(s => 
        (s.userName && s.userName.toLowerCase().includes(lower)) ||
        s.items.some(i => i.productName.toLowerCase().includes(lower))
      );
    }

    // 3. Sort by Date Descending
    return result.sort((a, b) => b.timestamp - a.timestamp);
  }, [sales, currentUser.id, isAdmin, selectedSeller, searchTerm]);

  // Calculate totals for the current view
  const viewTotals = useMemo(() => {
    return filteredSales.reduce((acc, curr) => ({
      amount: acc.amount + curr.total,
      count: acc.count + 1
    }), { amount: 0, count: 0 });
  }, [filteredSales]);

  const formatPayment = (method: string) => {
    switch(method) {
      case 'cash': return 'Efectivo';
      case 'card': return 'Tarjeta';
      case 'transfer': return 'Transferencia';
      default: return method;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">
             {isAdmin ? 'Historial Global de Ventas' : 'Mis Ventas Realizadas'}
           </h2>
           <p className="text-slate-500 text-sm">
             {isAdmin 
               ? 'Supervisa todas las transacciones del negocio' 
               : `Registro personal de ventas - ${currentUser.name}`}
           </p>
        </div>
        
        <div className="flex items-center gap-2">
            {/* Quick Stats for current view */}
            <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex flex-col items-end border-r border-slate-200 pr-4">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Total Vista</span>
                    <span className="text-lg font-bold text-indigo-600">${viewTotals.amount.toLocaleString()}</span>
                </div>
                <div className="flex flex-col items-start pl-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Ventas</span>
                    <span className="text-lg font-bold text-slate-700">{viewTotals.count}</span>
                </div>
            </div>
            {isAdmin && (
                <button 
                    onClick={() => StorageService.exportSalesToCSV(filteredSales)}
                    className="bg-slate-800 hover:bg-slate-900 text-white p-3 rounded-lg shadow-sm"
                    title="Exportar ventas filtradas a CSV"
                >
                    <Download size={20} />
                </button>
            )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por producto o vendedor..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Admin Specific Filter */}
        {isAdmin && (
          <div className="flex items-center gap-2 min-w-[250px]">
            <div className="bg-slate-100 p-2 rounded-lg text-slate-500">
               <UserIcon size={20} />
            </div>
            <select 
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
              value={selectedSeller}
              onChange={(e) => setSelectedSeller(e.target.value)}
            >
              <option value="ALL">Todos los Vendedores</option>
              {sellersList.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Fecha / Hora</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vendedor</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Items</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Método</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                    <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-slate-400" />
                        {new Date(sale.timestamp).toLocaleString('es-ES')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium px-2 py-1 rounded-full ${sale.userId === currentUser.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-800 bg-slate-100'}`}>
                        {sale.userName || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <ul className="text-sm text-slate-800 space-y-1">
                      {sale.items.map((item, idx) => (
                        <li key={idx} className="flex justify-between gap-4 max-w-md border-b border-slate-100 last:border-0 pb-1 last:pb-0">
                          <span className="font-medium text-slate-700">{item.quantity}x {item.productName}</span>
                          <span className="text-slate-400 text-xs font-mono">${item.subtotal}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 capitalize border border-slate-200">
                      {formatPayment(sale.paymentMethod)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-bold text-indigo-600">${sale.total}</div>
                    {sale.discount > 0 && (
                        <div className="text-xs text-green-600 font-medium whitespace-nowrap">
                            Desc: -${sale.discount.toFixed(0)}
                        </div>
                    )}
                  </td>
                </tr>
              ))}
              {filteredSales.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                        <Filter size={32} className="text-slate-300" />
                        <p>No se encontraron ventas con los filtros actuales.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SalesHistory;
