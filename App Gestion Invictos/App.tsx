import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import POS from './components/POS';
import SalesHistory from './components/SalesHistory';
import AIAdvisor from './components/AIAdvisor';
import TeamCommissions from './components/TeamCommissions';
import UserManagement from './components/UserManagement';
import Login from './components/Login';
import ProfileModal from './components/ProfileModal';
import { StorageService } from './services/storageService';
import { Product, Sale, User } from './types';
import { Menu, Loader2, Database, AlertTriangle, CheckCircle2 } from 'lucide-react';

const SESSION_STORAGE_KEY = 'invictos_authenticated_session_v1';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

interface StoredSession {
  userId: string;
  expiresAt: number;
  currentView?: string;
}

const readStoredSession = (): StoredSession | null => {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredSession;

    if (
      !parsed?.userId ||
      !Number.isFinite(Number(parsed.expiresAt)) ||
      Number(parsed.expiresAt) <= Date.now()
    ) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return {
      userId: String(parsed.userId),
      expiresAt: Number(parsed.expiresAt),
      currentView: parsed.currentView || 'dashboard',
    };
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // La sesión se persiste para sobrevivir recargas del navegador
  // (por ejemplo, cuando Android abre la cámara nativa y luego restaura la pestaña).
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [sessionRestoreError, setSessionRestoreError] = useState('');
  const [sessionRestoreNonce, setSessionRestoreNonce] = useState(0);

  // App State
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // ✅ Vite envs (siempre import.meta.env)
  const env = import.meta.env as any;

  // ✅ Lista de env vars requeridas
  const REQUIRED_ENV = useMemo(
    () => [
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_APP_ID',
    ] as const,
    []
  );

  // ✅ Calcula cuáles faltan (solo nombres, no valores)
  const missing = useMemo(() => {
    return REQUIRED_ENV.filter((k) => !env[k]);
  }, [REQUIRED_ENV, env]);

  const isConfigured = missing.length === 0;

  // ✅ Log de diagnóstico (sin mostrar secretos)
  useEffect(() => {
    const mode = import.meta.env.MODE;
    console.groupCollapsed('🧪 Firebase Config Check');
    console.log('mode:', mode);
    console.log('missing env:', missing);
    console.log('hasProjectId:', !!env.VITE_FIREBASE_PROJECT_ID, 'projectId:', env.VITE_FIREBASE_PROJECT_ID);
    console.log('hasAuthDomain:', !!env.VITE_FIREBASE_AUTH_DOMAIN, 'authDomain:', env.VITE_FIREBASE_AUTH_DOMAIN);
    console.groupEnd();
    // Nota: en StrictMode puede ejecutarse 2 veces en dev (normal).
    // En Vercel (prod) lo verás 1 vez.
  }, [missing.join('|')]);

  // Restaurar una sesión válida al cargar la aplicación.
  // Se reintenta varias veces porque, después de que Android mata una pestaña
  // por memoria, Firestore puede tardar unos instantes en quedar operativo.
  useEffect(() => {
    let cancelled = false;

    const wait = (ms: number) =>
      new Promise((resolve) => window.setTimeout(resolve, ms));

    const restoreSession = async () => {
      const stored = readStoredSession();

      setSessionRestoreError('');

      if (!stored) {
        if (!cancelled) setIsRestoringSession(false);
        return;
      }

      if (!cancelled) setIsRestoringSession(true);

      const delays = [0, 400, 1000, 2000];

      for (let attempt = 0; attempt < delays.length; attempt += 1) {
        if (cancelled) return;

        if (delays[attempt] > 0) {
          await wait(delays[attempt]);
        }

        try {
          const users = await StorageService.getUsers();

          /*
           * Una lista vacía inmediatamente después de una reconstrucción de
           * Chrome puede ser transitoria. No eliminamos la sesión por eso.
           */
          if (users.length === 0) {
            throw new Error('Lista de usuarios temporalmente vacía.');
          }

          const freshUser =
            users.find((user) => user.id === stored.userId) || null;

          if (!freshUser) {
            // Firestore respondió correctamente y el usuario realmente ya no existe.
            window.localStorage.removeItem(SESSION_STORAGE_KEY);

            if (!cancelled) {
              setCurrentUser(null);
              setSessionExpiresAt(null);
              setIsRestoringSession(false);
            }
            return;
          }

          if (!cancelled) {
            setCurrentUser(freshUser);
            setCurrentView(stored.currentView || 'dashboard');
            setSessionExpiresAt(stored.expiresAt);
            setSessionRestoreError('');
            setIsRestoringSession(false);

            if (freshUser.mustChangePin) {
              setIsProfileOpen(true);
            }
          }

          return;
        } catch (error) {
          console.error(
            `❌ Intento ${attempt + 1} de restaurar sesión`,
            error,
          );
        }
      }

      /*
       * Muy importante:
       * NO borramos la sesión ni mandamos directamente al login.
       * El usuario puede reintentar cuando Firestore se recupere.
       */
      if (!cancelled) {
        setIsRestoringSession(false);
        setSessionRestoreError(
          'INVICTOS no pudo recuperar tu sesión todavía. Tu sesión sigue guardada.',
        );
      }
    };

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [sessionRestoreNonce]);


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
      console.error('❌ Error loading data from cloud', error);
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
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    setCurrentUser(user);
    setSessionExpiresAt(expiresAt);

    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        userId: user.id,
        expiresAt,
        currentView: 'dashboard',
      } satisfies StoredSession),
    );

    // Si el administrador blanqueó su PIN, obligamos al usuario
    // a cambiar la clave temporal antes de seguir usando INVICTOS.
    if (user.mustChangePin) {
      setIsProfileOpen(true);
    }

    // refreshData corre por useEffect
  };

  const handleLogout = () => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionExpiresAt(null);
    setCurrentUser(null);
    setCurrentView('dashboard');
    setProducts([]);
    setSales([]);
  };

  // Mantener la vista actual dentro de la sesión.
  // Si Android recarga la pestaña después de usar la cámara, vuelve a la misma sección.
  useEffect(() => {
    if (!currentUser || !sessionExpiresAt) return;

    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        userId: currentUser.id,
        expiresAt: sessionExpiresAt,
        currentView,
      } satisfies StoredSession),
    );
  }, [currentUser?.id, currentView, sessionExpiresAt]);

  // Cierre automático al cumplirse las 8 horas.
  useEffect(() => {
    if (!currentUser || !sessionExpiresAt) return;

    const remaining = sessionExpiresAt - Date.now();

    if (remaining <= 0) {
      handleLogout();
      return;
    }

    const timer = window.setTimeout(() => {
      handleLogout();
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [currentUser?.id, sessionExpiresAt]);

  const handleUpdateUser = async (updatedUser: User) => {
    await StorageService.updateUser(updatedUser);
    setCurrentUser(updatedUser);
    setIsProfileOpen(false);
    alert('PIN / contraseña actualizada correctamente.');
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
            La aplicación no puede conectarse a la nube porque faltan credenciales de Firebase en el build.
          </p>

          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm mb-6">
            <p className="font-bold text-slate-700 mb-3">
              Variables de Entorno en Vercel (Production / Preview):
            </p>

            <ul className="space-y-2 font-mono text-slate-700">
              {REQUIRED_ENV.map((key) => {
                const ok = !missing.includes(key);

                return (
                  <li key={key} className="flex items-center gap-2">
                    {ok ? (
                      <CheckCircle2 size={14} className="text-green-600" />
                    ) : (
                      <AlertTriangle size={14} className="text-amber-500" />
                    )}
                    <span className={ok ? 'text-slate-500 line-through' : ''}>{key}</span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 text-xs text-slate-500">
              <div className="font-semibold text-slate-700 mb-1">Faltan:</div>
              <div className="text-red-600 font-mono break-words">
                {missing.join(', ')}
              </div>
            </div>
          </div>

          <p className="text-xs text-center text-slate-400">
            Firebase Console → Project Settings → Your Apps → “Firebase SDK snippet (Config)”.
            <br />
            Luego en Vercel: Project → Settings → Environment Variables → redeploy.
          </p>
        </div>
      </div>
    );
  }

  // --- RESTAURANDO SESIÓN ---
  if (isRestoringSession) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-indigo-600" size={34} />
          <div className="font-bold text-slate-800">Restaurando sesión...</div>
          <div className="text-xs text-slate-500 text-center">
            Recuperando tu usuario de INVICTOS. Puede demorar unos segundos
            después de que Android haya cerrado la página.
          </div>
        </div>
      </div>
    );
  }

  // Si había una sesión válida pero Firestore no respondió, no expulsamos al usuario.
  if (!currentUser && sessionRestoreError && readStoredSession()) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-2xl p-7 text-center">
          <AlertTriangle
            size={38}
            className="mx-auto text-amber-500 mb-3"
          />

          <h2 className="text-xl font-bold text-slate-800">
            No se pudo restaurar la sesión
          </h2>

          <p className="text-sm text-slate-500 mt-2">
            {sessionRestoreError}
          </p>

          <button
            type="button"
            onClick={() => {
              setIsRestoringSession(true);
              setSessionRestoreNonce((value) => value + 1);
            }}
            className="w-full mt-5 py-3 rounded-xl bg-indigo-600 text-white font-bold"
          >
            Reintentar sesión
          </button>

          <button
            type="button"
            onClick={() => {
              window.localStorage.removeItem(SESSION_STORAGE_KEY);
              setSessionRestoreError('');
              setCurrentUser(null);
            }}
            className="w-full mt-2 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold"
          >
            Ir al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  // --- LOGIN ---
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

      case 'users':
        return currentUser.role === 'admin' ? (
          <UserManagement
            currentUser={currentUser}
            onCurrentUserUpdate={setCurrentUser}
            salesCount={sales.length}
            onDataReset={refreshData}
          />
        ) : (
          <Dashboard
            products={products}
            sales={sales}
            onNavigate={setCurrentView}
            currentUser={currentUser}
          />
        );

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
          forceChange={Boolean(currentUser.mustChangePin)}
          onClose={() => {
            if (!currentUser.mustChangePin) {
              setIsProfileOpen(false);
            }
          }}
          onUpdate={handleUpdateUser}
        />
      )}
    </div>
  );
};

export default App;
