import React, { useState, useEffect, useMemo } from 'react';
import { Sale, User, AppConfig, UserRole } from '../types';
import { StorageService } from '../services/storageService';
import { Users, DollarSign, Edit2, Check, X, Calendar, Eye, CheckCircle, Square, CheckSquare, Wallet, Percent, UserPlus, Trash2, Lock, Loader2 } from 'lucide-react';

interface TeamCommissionsProps {
  sales: Sale[];
  currentUser: User;
  onUpdate?: () => void;
}

type DateFilterType = 'today' | 'week' | 'month' | 'all';

const TeamCommissions: React.FC<TeamCommissionsProps> = ({ sales, currentUser, onUpdate }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [config, setConfig] = useState<AppConfig>({ commissionPercentage: 0 });
  
  // Commission Config States
  const [globalPercentage, setGlobalPercentage] = useState(0);
  const [editingGlobal, setEditingGlobal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [tempUserCommission, setTempUserCommission] = useState<string>('');

  // User Management State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [newUser, setNewUser] = useState<{name: string, pin: string, role: UserRole}>({ name: '', pin: '', role: 'seller' });

  // Date Filter States
  const [filterType, setFilterType] = useState<DateFilterType>('month');
  
  // Detail Modal State
  const [selectedUserForDetail, setSelectedUserForDetail] = useState<User | null>(null);

  useEffect(() => {
    setUsers(StorageService.getUsers());
    const loadedConfig = StorageService.getConfig();
    setConfig(loadedConfig);
    setGlobalPercentage(loadedConfig.commissionPercentage);
  }, [sales]);

  // --- Configuration Handlers ---
  const handleSaveGlobalConfig = () => {
    const updated = { ...config, commissionPercentage: globalPercentage };
    StorageService.saveConfig(updated);
    setConfig(updated);
    setEditingGlobal(false);
  };

  const handleSaveUserCommission = (user: User) => {
    const val = tempUserCommission === '' ? undefined : Number(tempUserCommission);
    const updatedUser = { ...user, commissionPercentage: val };
    StorageService.updateUser(updatedUser);
    setUsers(users.map(u => u.id === user.id ? updatedUser : u));
    setEditingUserId(null);
  };

  // --- User Management Handlers ---
  const handleAddUser = () => {
      if(!newUser.name || !newUser.pin) return;
      if(newUser.pin.length < 4) { alert('El PIN debe tener 4 dígitos'); return; }

      const userToAdd: User = {
          id: Date.now().toString(),
          name: newUser.name,
          role: newUser.role,
          pin: newUser.pin
      };
      
      StorageService.addUser(userToAdd);
      setUsers(StorageService.getUsers());
      setIsUserModalOpen(false);
      setNewUser({ name: '', pin: '', role: 'seller' });
  };

  const handleDeleteUser = (userId: string) => {
      if(userId === currentUser.id) return;
      if(confirm('¿Estás seguro de eliminar a este vendedor? Su historial de ventas permanecerá, pero no podrá ingresar al sistema.')) {
          StorageService.deleteUser(userId);
          setUsers(StorageService.getUsers());
      }
  };

  // --- Date Logic ---
  const dateRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    
    // Reset hours
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);

    if (filterType === 'today') {
       // already set
    } else if (filterType === 'week') {
       // Monday of current week
       const day = start.getDay(); 
       const diff = start.getDate() - day + (day === 0 ? -6 : 1);
       start.setDate(diff);
    } else if (filterType === 'month') {
       start.setDate(1);
    } else if (filterType === 'all') {
       start.setFullYear(2000); 
    }

    return { start: start.getTime(), end: end.getTime() };
  }, [filterType]);

  const getDateLabel = () => {
      switch(filterType) {
          case 'today': return 'Hoy';
          case 'week': return 'Esta Semana';
          case 'month': return 'Este Mes';
          case 'all': return 'Todo el Historial';
      }
  };

  // --- Calculation Helper ---
  const calculateCommissionAmount = (item: any, user: User | undefined) => {
      if (item.commissionAmount !== undefined) return item.commissionAmount;
      const rate = user?.commissionPercentage ?? config.commissionPercentage;
      return item.subtotal * (rate / 100);
  };

  const getUserStats = (userId: string) => {
      const user = users.find(u => u.id === userId);
      const userSales = sales.filter(s => s.userId === userId);
      
      // 1. Pending Balance (All Time Unpaid)
      const pendingSales = userSales.filter(s => !s.commissionPaid);
      const pendingBalance = pendingSales.reduce((acc, sale) => {
          return acc + sale.items.reduce((sum, item) => sum + calculateCommissionAmount(item, user), 0);
      }, 0);

      // 2. Generated in Range (Filtered by date, regardless of paid status)
      const salesInRange = userSales.filter(s => s.timestamp >= dateRange.start && s.timestamp <= dateRange.end);
      const generatedInRange = salesInRange.reduce((acc, sale) => {
          return acc + sale.items.reduce((sum, item) => sum + calculateCommissionAmount(item, user), 0);
      }, 0);

      const salesCountInRange = salesInRange.length;

      return { pendingBalance, generatedInRange, salesCountInRange };
  };

  // --- Payment Handler ---
  const handleMarkAsPaid = (saleIds: string[]) => {
      StorageService.markCommissionsAsPaid(saleIds);
      if (onUpdate) {
        onUpdate();
      }
  };

  // Filter users based on role
  const displayedUsers = currentUser.role === 'admin' 
    ? users 
    : users.filter(u => u.id === currentUser.id);

  const totalPendingDebt = displayedUsers.reduce((acc, u) => acc + getUserStats(u.id).pendingBalance, 0);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">
             {currentUser.role === 'admin' ? 'Gestión de Equipo' : 'Mi Rendimiento'}
           </h2>
           <p className="text-slate-500 text-sm">
             {currentUser.role === 'admin' ? 'Administra vendedores y comisiones' : 'Visualiza tus ganancias'}
           </p>
        </div>
        
        <div className="flex gap-2">
            {currentUser.role === 'admin' && (
                <button 
                    onClick={() => setIsUserModalOpen(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg shadow-sm text-xs font-bold transition-colors"
                >
                    <UserPlus size={16} /> Nuevo Vendedor
                </button>
            )}
            {/* Date Filters */}
            <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                {(['today', 'week', 'month', 'all'] as const).map(ft => (
                    <button
                        key={ft}
                        onClick={() => setFilterType(ft)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filterType === ft ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        {ft === 'today' ? 'Hoy' : ft === 'week' ? 'Semana' : ft === 'month' ? 'Mes' : 'Todo'}
                    </button>
                ))}
            </div>
        </div>
      </div>

      {/* Admin Global Config & Total Debt */}
      {currentUser.role === 'admin' && (
           <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 text-white shadow-lg flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/10 rounded-full">
                        <DollarSign size={24} className="text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-slate-300 text-sm font-medium">Deuda Total Pendiente (Global)</p>
                        <p className="text-3xl font-bold text-white">${totalPendingDebt.toLocaleString()}</p>
                    </div>
                </div>

                <div className="bg-white/10 p-4 rounded-lg flex items-center gap-4 backdrop-blur-sm border border-white/10">
                    <div className="flex flex-col">
                         <span className="text-xs text-slate-300 uppercase font-bold">Comisión Base Global</span>
                         <span className="text-[10px] text-slate-400">Si no hay % específico</span>
                    </div>
                    {editingGlobal ? (
                        <div className="flex items-center gap-2">
                            <input 
                                type="number" 
                                className="w-16 border rounded p-1 text-sm text-slate-900 focus:outline-indigo-500"
                                value={globalPercentage}
                                onChange={(e) => setGlobalPercentage(Number(e.target.value))}
                            />
                            <button onClick={handleSaveGlobalConfig} className="bg-green-500 text-white p-1 rounded hover:bg-green-600">
                                <Check size={16} />
                            </button>
                            <button onClick={() => setEditingGlobal(false)} className="bg-white/20 text-white p-1 rounded hover:bg-white/30">
                                <X size={16} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold text-indigo-300">{config.commissionPercentage}%</span>
                            <button onClick={() => setEditingGlobal(true)} className="text-slate-400 hover:text-white transition-colors">
                                <Edit2 size={16} />
                            </button>
                        </div>
                    )}
                </div>
           </div>
      )}

      {/* User Cards Grid */}
      <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2">
          <Calendar size={18} /> Resumen: {getDateLabel()}
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayedUsers.map(user => {
            const stats = getUserStats(user.id);
            const isEditingThisUser = editingUserId === user.id;

            return (
                <div key={user.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full transition-all hover:shadow-md relative">
                    {/* Delete Button (Top Right) */}
                    {currentUser.role === 'admin' && currentUser.id !== user.id && (
                        <button 
                            onClick={() => handleDeleteUser(user.id)}
                            className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors z-10"
                            title="Eliminar usuario"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}

                    {/* Card Header */}
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                                {user.name.charAt(0)}
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800">{user.name}</h3>
                                <p className="text-xs text-slate-500 uppercase">{user.role}</p>
                            </div>
                        </div>
                        {currentUser.role === 'admin' && (
                             <div className="flex items-center gap-1 mr-6">
                                {isEditingThisUser ? (
                                    <>
                                        <input 
                                            type="number" 
                                            placeholder="Global"
                                            className="w-14 text-sm border rounded p-1"
                                            value={tempUserCommission}
                                            onChange={(e) => setTempUserCommission(e.target.value)}
                                        />
                                        <button onClick={() => handleSaveUserCommission(user)} className="text-green-600 p-1 hover:bg-green-50 rounded"><Check size={16}/></button>
                                        <button onClick={() => setEditingUserId(null)} className="text-red-500 p-1 hover:bg-red-50 rounded"><X size={16}/></button>
                                    </>
                                ) : (
                                    <div className="flex items-center gap-2 text-xs bg-white px-2 py-1 rounded border border-slate-200" title="Comisión por defecto del usuario">
                                        <Percent size={12} className="text-slate-400"/>
                                        <span className={`font-semibold ${user.commissionPercentage ? 'text-indigo-600' : 'text-slate-400'}`}>
                                            {user.commissionPercentage ?? 'Auto'}
                                        </span>
                                        <button 
                                            onClick={() => {
                                                setEditingUserId(user.id);
                                                setTempUserCommission(user.commissionPercentage?.toString() || '');
                                            }}
                                            className="text-slate-400 hover:text-indigo-600"
                                        >
                                            <Edit2 size={12} />
                                        </button>
                                    </div>
                                )}
                             </div>
                        )}
                    </div>

                    {/* Card Body */}
                    <div className="p-5 space-y-4 flex-1">
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Generado ({getDateLabel()})</p>
                                <p className="text-2xl font-bold text-slate-800">${stats.generatedInRange.toLocaleString()}</p>
                            </div>
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{stats.salesCountInRange} ventas</span>
                        </div>
                        
                        <div className="h-px bg-slate-100 w-full" />

                        <div className={`flex justify-between items-center p-3 rounded-lg border ${stats.pendingBalance > 0 ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100'}`}>
                             <div className="flex items-center gap-2">
                                {stats.pendingBalance > 0 ? <AlertIcon /> : <CheckCircle size={16} className="text-green-600"/>}
                                <span className={`text-sm font-medium ${stats.pendingBalance > 0 ? 'text-amber-900' : 'text-green-900'}`}>
                                    {stats.pendingBalance > 0 ? 'Pendiente de Pago' : 'Al día'}
                                </span>
                             </div>
                             <span className={`font-bold ${stats.pendingBalance > 0 ? 'text-amber-700' : 'text-green-700'}`}>${stats.pendingBalance.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Card Footer */}
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                        {currentUser.role === 'admin' && stats.pendingBalance > 0 && (
                             <button 
                                onClick={() => setSelectedUserForDetail(user)}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
                            >
                                <Wallet size={16} /> PAGAR
                            </button>
                        )}
                        <button 
                            onClick={() => setSelectedUserForDetail(user)}
                            className={`flex-1 flex items-center justify-center gap-2 text-sm font-medium border border-slate-200 bg-white py-2 rounded-lg transition-colors hover:bg-slate-50 ${currentUser.role !== 'admin' || stats.pendingBalance === 0 ? 'w-full' : ''}`}
                        >
                            <Eye size={16} /> {currentUser.role === 'admin' ? 'Detalle' : 'Ver Mis Pagos'}
                        </button>
                    </div>
                </div>
            );
        })}
      </div>

      {/* DETAIL MODAL */}
      {selectedUserForDetail && (
          <CommissionDetailModal 
            user={selectedUserForDetail}
            usersList={users}
            config={config}
            sales={sales}
            onClose={() => setSelectedUserForDetail(null)}
            onPay={handleMarkAsPaid}
            isOwner={currentUser.role === 'admin'}
          />
      )}

      {/* ADD USER MODAL */}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full animate-fade-in-up overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <UserPlus size={20} /> Nuevo Integrante
                    </h3>
                    <button onClick={() => setIsUserModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                        <input 
                            type="text" 
                            className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            placeholder="Ej: Juan Pérez"
                            value={newUser.name}
                            onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">PIN de Acceso (4 dígitos)</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                            <input 
                                type="text" 
                                inputMode="numeric"
                                maxLength={4}
                                className="w-full border border-slate-300 rounded-lg p-2 pl-9 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                                placeholder="0000"
                                value={newUser.pin}
                                onChange={(e) => setNewUser({...newUser, pin: e.target.value})}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                        <select 
                            className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                            value={newUser.role}
                            onChange={(e) => setNewUser({...newUser, role: e.target.value as UserRole})}
                        >
                            <option value="seller">Vendedor</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </div>
                    <button 
                        onClick={handleAddUser}
                        disabled={!newUser.name || newUser.pin.length < 4}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                    >
                        Registrar Vendedor
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

// --- Helper Components ---

const AlertIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
);

interface CommissionDetailModalProps {
    user: User;
    usersList: User[];
    config: AppConfig;
    sales: Sale[];
    onClose: () => void;
    onPay: (ids: string[]) => void;
    isOwner: boolean;
}

const CommissionDetailModal: React.FC<CommissionDetailModalProps> = ({ user, usersList, config, sales, onClose, onPay, isOwner }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isPaying, setIsPaying] = useState(false);

    // Sort to show newest first
    const userSales = sales.filter(s => s.userId === user.id).sort((a,b) => b.timestamp - a.timestamp);
    const unpaidSales = userSales.filter(s => !s.commissionPaid);
    
    const calculateCommission = (sale: Sale) => {
         const fullUser = usersList.find(u => u.id === user.id);
         return sale.items.reduce((sum, item) => {
             if (item.commissionAmount !== undefined) return sum + item.commissionAmount;
             const rate = fullUser?.commissionPercentage ?? config.commissionPercentage;
             return sum + (item.subtotal * (rate / 100));
         }, 0);
    };

    const totalUnpaid = unpaidSales.reduce((acc, s) => acc + calculateCommission(s), 0);
    
    // Calculate total selected
    const totalSelectedAmount = unpaidSales
        .filter(s => selectedIds.has(s.id))
        .reduce((acc, s) => acc + calculateCommission(s), 0);

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === unpaidSales.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(unpaidSales.map(s => s.id)));
        }
    };

    const handlePayAction = () => {
        if (selectedIds.size === 0) return;
        
        // Remove confirm if user finds it annoying, or keep it standard
        if(window.confirm(`¿Pagar $${totalSelectedAmount.toLocaleString()} de las ventas seleccionadas?`)) {
            setIsPaying(true);
            
            const idsToPay = Array.from(selectedIds);
            
            // Execute payment
            onPay(idsToPay);

            // Cleanup
            setSelectedIds(new Set());
            setIsPaying(false);
            // No optimistics, just let the parent update flow down
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col animate-fade-in-up overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">Detalle de Comisiones: {user.name}</h3>
                        <p className="text-sm text-slate-500">Historial completo de ventas y comisiones</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {/* Summary for Modal */}
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                         <div className="flex-1 bg-amber-50 border border-amber-100 p-4 rounded-lg flex justify-between items-center">
                             <div>
                                 <p className="text-amber-800 text-sm font-medium">Deuda Total Pendiente</p>
                                 <p className="text-2xl font-bold text-amber-700">${totalUnpaid.toLocaleString()}</p>
                             </div>
                         </div>
                         
                         {isOwner && (
                            <div className="flex-1 bg-green-50 border border-green-100 p-4 rounded-lg flex justify-between items-center">
                                <div>
                                    <p className="text-green-800 text-sm font-medium">Seleccionado para Pagar</p>
                                    <p className="text-2xl font-bold text-green-700">${totalSelectedAmount.toLocaleString()}</p>
                                </div>
                                <button 
                                   type="button"
                                   onClick={handlePayAction}
                                   disabled={selectedIds.size === 0 || isPaying}
                                   className={`px-6 py-2 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2 
                                     ${selectedIds.size > 0 
                                        ? 'bg-green-600 hover:bg-green-700 text-white cursor-pointer' 
                                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                                >
                                    {isPaying ? <Loader2 className="animate-spin" size={18} /> : <Wallet size={18} />}
                                    {isPaying ? 'PROCESANDO...' : (selectedIds.size > 0 ? 'PAGAR SELECCIÓN' : 'SELECCIONA VENTAS')}
                                </button>
                            </div>
                         )}
                    </div>

                    <p className="text-sm text-slate-500 mb-2">
                        {isOwner ? 'Selecciona las ventas que deseas pagar (Pago Parcial o Total):' : 'Historial de tus ventas:'}
                    </p>

                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                            <tr>
                                {isOwner && totalUnpaid > 0 && (
                                    <th className="px-4 py-3 text-center w-12">
                                        <button onClick={toggleSelectAll} className="text-slate-500 hover:text-indigo-600">
                                            {selectedIds.size === unpaidSales.length && unpaidSales.length > 0 ? <CheckSquare size={18}/> : <Square size={18}/>}
                                        </button>
                                    </th>
                                )}
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total Venta</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Comisión</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {userSales.map(sale => {
                                const comm = calculateCommission(sale);
                                const isSelected = selectedIds.has(sale.id);
                                const isPaid = sale.commissionPaid;

                                return (
                                    <tr key={sale.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-indigo-50/50' : ''}`}>
                                        {isOwner && totalUnpaid > 0 && (
                                            <td className="px-4 py-3 text-center">
                                                {!isPaid ? (
                                                    <button onClick={() => toggleSelect(sale.id)} className={`${isSelected ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-400'}`}>
                                                        {isSelected ? <CheckSquare size={18}/> : <Square size={18}/>}
                                                    </button>
                                                ) : (
                                                    <span className="text-slate-200"><CheckSquare size={18} className="opacity-0"/></span> 
                                                )}
                                            </td>
                                        )}
                                        <td className="px-4 py-3 text-sm text-slate-600">
                                            {new Date(sale.timestamp).toLocaleDateString()} <span className="text-xs text-slate-400">{new Date(sale.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        </td>
                                        <td className="px-4 py-3 text-sm font-medium text-slate-800">${sale.total}</td>
                                        <td className="px-4 py-3 text-sm font-bold text-indigo-600">${comm.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-center">
                                            {isPaid ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 animate-fade-in">
                                                    <CheckCircle size={12} /> Pagado
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                                    Pendiente
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export default TeamCommissions;