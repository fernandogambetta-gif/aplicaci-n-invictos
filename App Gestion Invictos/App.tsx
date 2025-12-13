
import React, { useState, useEffect } from 'react';
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
import { Menu } from 'lucide-react';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  // App State
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  // Load data on mount
  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = () => {
    setProducts(StorageService.getProducts());
    setSales(StorageService.getSales());
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    refreshData();
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('dashboard');
  };

  const handleUpdateUser = (updatedUser: User) => {
    StorageService.updateUser(updatedUser);
    setCurrentUser(updatedUser);
    alert('Contraseña actualizada correctamente.');
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard products={products} sales={sales} onNavigate={setCurrentView} currentUser={currentUser} />;
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
        return <Dashboard products={products} sales={sales} onNavigate={setCurrentView} currentUser={currentUser} />;
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
