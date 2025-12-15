import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import POS from './components/POS';
import SalesHistory from './components/SalesHistory';
import AIAdvisor from './components/AIAdvisor';
import TeamCommissions from './components/TeamCommissions';
import Login from './components/Login';
import ProfileModal from './components/ProfileModal';
import { StorageService } from './services/storageService';
import { Product, Sale, User } from './types';
import { Menu, Loader2, Database, AlertTriangle } from 'lucide-react';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // App State
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // ✅ Vite envs (no process.env)
  const env = import.meta.env as any;
  const isConfigured = !!(
    env.VITE_FIREBASE_API_KEY &&
    env.VITE_FIREBASE_AUTH_DOMAIN &&
    env.VITE_FIREBASE_PROJECT_ID
  );

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [prods, sls] = await Promise.all([
        StorageService.getProducts(),
        StorageService.getSales(),
      ]);
      setProducts(prods);
      setSales(sls);
    } catch (error) {
      console.error('Error loading data from cloud', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load data on mount / login
  useEffect(() => {
    if (currentUser && isConfigured) {
      void refreshData();
    }
  }, [currentUser, isConfigured, refreshData]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    // Data refresh happens via useEffect
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('dashboard');
    setProducts([]);
    setSales([]);
  };

  const handleUpdateUser = async (updatedUser: User) => {
    await StorageService.updateUser(updatedUser);
    setCurrentUser(updatedUser);
    alert('Contraseña actualizada correctamente.');
  };

  // --- MISSING CONFIG SCREEN ---
  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-2xl p-8 border-t-4 border-amber-500">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-6 mx-auto">
            <Database size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 text-center mb-2">
            Falta Configuración de Base de Datos
          </h1>
          <p className="text-slate-500 text-center mb-6">
            La aplicación no puede conectarse a la nube porque faltan las credenciales de Firebase.
          </p>

          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm mb-6">
            <p className="font-bold text-slate-700 mb-2">
              Debes agregar estas Variables de Entorno en Vercel:
            </p>
            <ul className="space-y-2 font-mono text-slate-600">
              <li className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" /> VITE_FIREBASE_API_KEY
              </li>
              <li className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" /> VITE_FIREBASE_AUTH_DOMAIN
              </li>
              <li className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" /> VITE_FIREBASE_PROJECT_ID
              </li>
            </ul>
          </div>

          <p className="text-xs text-center text-slate-400">
            Obtén estos valores en: Firebase Console {'>'} Project Settings {'>'} Your Apps
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const renderContent = () => {
    if (isLoading && products.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="animate-spin mb-4" size={48} />
          <p>Sincronizando con la nube...</p>
        </div>
      );
    }

    switch (currentView) {
      case 'dashboard':
        return (
          <Dashboard
            products={products}
            sales={sales}
            onNavigate={setCurrentView}
            currentUser={currentUser}
          />
        );
      case 'pos':
        return <POS products={products} onSaleComplete={refreshData} currentUser={currentUser} />;
      case 'inventory':
        return <Inventory products={products} onUpdate={refreshData} />;
      case 'history':
        return <SalesHistory sales={sales} currentUser={currentUser} />;
      case 'team':
        return <TeamCommissions sales={sales} currentUser={currentUser} onUpdate={refreshData} />;
      case 'ai':
        return currentUser.role === 'admin' ? <AIAdvisor products={products} sales={sales} /> : null;
      default:
        return (
          <Dashboard
            products={products}
            sales={sales}
            onNavigate={setCurrentView}
            currentUser={currentUser}
          />
        );
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        currentView={currentView}
        setCurrentView={setCurrentView}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        currentUser={currentUser}
        onLogout={handleLogout}
        onEditProfile={() => setIsProfileOpen(true)}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden w-full relative">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between shrink-0">
          <h1 className="font-bold text-slate-800">INVICTOS</h1>
          <button onClick={() => setSidebarOpen(true)} className="text-slate-600">
            <Menu size={24} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {isLoading && products.length > 0 && (
            <div className="absolute top-4 right-4 bg-indigo-600 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 z-50 shadow-lg">
              <Loader2 className="animate-spin" size={12} /> Sync...
            </div>
          )}
          {renderContent()}
        </main>
      </div>

      {isProfileOpen && (
        <ProfileModal
          user={currentUser}
          onClose={() => setIsProfileOpen(false)}
          onUpdate={handleUpdateUser}
        />
      )}
    </div>
  );
};

export default App;

