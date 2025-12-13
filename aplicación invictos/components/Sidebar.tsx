import React from 'react';
import { LayoutDashboard, ShoppingCart, Package, History, Sparkles, Users, X, LogOut, Settings } from 'lucide-react';
import { User } from '../types';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  currentUser: User | null;
  onLogout: () => void;
  onEditProfile: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView, isOpen, setIsOpen, currentUser, onLogout, onEditProfile }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Panel de Control', icon: LayoutDashboard, role: 'all' },
    { id: 'pos', label: 'Caja (Ventas)', icon: ShoppingCart, role: 'all' },
    { id: 'inventory', label: 'Inventario', icon: Package, role: 'all' },
    { id: 'history', label: 'Historial', icon: History, role: 'all' },
    // Changed role to 'all' but logic inside component handles content
    { id: 'team', label: 'Comisiones', icon: Users, role: 'all' }, 
    { id: 'ai', label: 'Asistente IA', icon: Sparkles, color: 'text-indigo-400', role: 'admin' },
  ];

  const filteredItems = menuItems.filter(item => {
    if (item.role === 'all') return true;
    return currentUser?.role === item.role;
  });

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed top-0 left-0 h-full bg-slate-900 text-white w-64 z-30 transform transition-transform duration-300 ease-in-out flex flex-col
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:static
      `}>
        <div className="p-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-wider italic">INVICTOS</h1>
          <button onClick={() => setIsOpen(false)} className="md:hidden">
            <X size={24} />
          </button>
        </div>

        {/* User Info Block */}
        {currentUser && (
            <div className="mx-4 p-4 bg-slate-800 rounded-xl mb-4 flex items-center justify-between border border-slate-700">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-xs shrink-0">
                      {currentUser.name.charAt(0)}
                  </div>
                  <div className="overflow-hidden">
                      <p className="text-sm font-semibold truncate">{currentUser.name}</p>
                      <p className="text-xs text-slate-400 capitalize">{currentUser.role === 'admin' ? 'Admin' : 'Vendedor'}</p>
                  </div>
                </div>
                <button 
                  onClick={onEditProfile}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                  title="Cambiar Contraseña"
                >
                  <Settings size={16} />
                </button>
            </div>
        )}

        <nav className="flex-1 px-4 overflow-y-auto">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentView(item.id);
                setIsOpen(false);
              }}
              className={`
                w-full flex items-center gap-3 px-4 py-3 mb-2 rounded-lg transition-colors
                ${currentView === item.id 
                  ? 'bg-slate-700 text-white shadow-lg' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
              `}
            >
              <item.icon size={20} className={item.color || ''} />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-4">
            <button 
                onClick={onLogout}
                className="w-full flex items-center gap-3 px-4 py-2 text-red-400 hover:bg-slate-800 hover:text-red-300 rounded-lg transition-colors text-sm"
            >
                <LogOut size={18} /> Cerrar Sesión
            </button>
            <p className="text-xs text-slate-600 text-center">v1.1.0 &bull; Sistema Local</p>
        </div>
      </div>
    </>
  );
};

export default Sidebar;