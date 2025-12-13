
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { StorageService } from '../services/storageService';
import { Users, Lock, ChevronRight, RefreshCw, AlertTriangle, Clock, Ban, Mail } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  
  // Security State
  const [lockoutTimer, setLockoutTimer] = useState<number | null>(null);
  const [isPermanentlyBlocked, setIsPermanentlyBlocked] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryStep, setRecoveryStep] = useState(0); // 0: input, 1: code

  // Reset
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    loadUsers();
    // Check for active timer every second
    const interval = setInterval(() => {
        if (selectedUser && selectedUser.security?.lockoutUntil) {
            const remaining = selectedUser.security.lockoutUntil - Date.now();
            if (remaining > 0) {
                setLockoutTimer(Math.ceil(remaining / 1000));
            } else {
                setLockoutTimer(null);
                // Auto refresh user to clear old lock state visually if needed, 
                // though logic handles it on submit
            }
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedUser]);

  const loadUsers = () => {
      try {
        const loadedUsers = StorageService.getUsers();
        setUsers(loadedUsers);
        // Refresh selected user if exists
        if (selectedUser) {
            const updated = loadedUsers.find(u => u.id === selectedUser.id);
            if (updated) setSelectedUser(updated);
        }
      } catch (e) {
        console.error("Failed to load users", e);
        StorageService.resetData();
      }
  };

  const handleUserSelect = (user: User) => {
      setSelectedUser(user);
      setError('');
      setPin('');
      
      // Check initial security state
      if (user.security?.isPermanentlyBlocked) {
          setIsPermanentlyBlocked(true);
      } else {
          setIsPermanentlyBlocked(false);
      }

      if (user.security?.lockoutUntil && user.security.lockoutUntil > Date.now()) {
          setLockoutTimer(Math.ceil((user.security.lockoutUntil - Date.now()) / 1000));
      } else {
          setLockoutTimer(null);
      }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    // Check Lockout
    if (selectedUser.security?.isPermanentlyBlocked) {
        setIsPermanentlyBlocked(true);
        return;
    }

    if (selectedUser.security?.lockoutUntil && selectedUser.security.lockoutUntil > Date.now()) {
        setError('Usuario bloqueado temporalmente.');
        return;
    }

    // Verify PIN
    if (pin.trim() === selectedUser.pin.trim()) {
      // Success
      StorageService.resetAttempts(selectedUser.id);
      onLogin(selectedUser);
    } else {
      // Fail
      const updatedUser = StorageService.recordFailedAttempt(selectedUser.id);
      if (updatedUser) {
          setSelectedUser(updatedUser); // Update local state immediately
          
          if (updatedUser.security?.isPermanentlyBlocked) {
             setIsPermanentlyBlocked(true);
             setError('Cuenta bloqueada definitivamente.');
          } else if (updatedUser.security?.lockoutUntil && updatedUser.security.lockoutUntil > Date.now()) {
             setLockoutTimer(300); // 5 mins
             setError('Demasiados intentos. Espere 5 minutos.');
          } else {
             const left = 3 - (updatedUser.security?.failedAttempts || 0);
             setError(`PIN Incorrecto. ${left} intentos restantes.`);
          }
      }
      setPin('');
    }
  };

  const handleAdminRecovery = () => {
      if (recoveryStep === 0) {
          // Simulate sending email
          setRecoveryStep(1);
          alert(`[SIMULACIÓN] Se ha enviado un código de recuperación a ffernando.gambetta@gmail.com. \n\nCódigo: 9999`);
      } else {
          if (recoveryCode === '9999') {
              if (selectedUser) {
                StorageService.unlockUser(selectedUser.id);
                loadUsers();
                setIsPermanentlyBlocked(false);
                setLockoutTimer(null);
                setRecoveryMode(false);
                setRecoveryStep(0);
                setRecoveryCode('');
                alert('Cuenta desbloqueada exitosamente.');
              }
          } else {
              alert('Código incorrecto');
          }
      }
  };

  // --- SVG Logo Component ---
  const InvictosLogo = () => (
    <div className="flex flex-col items-center justify-center mb-6">
        <svg viewBox="0 0 400 120" className="w-full max-w-[280px] h-auto" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style={{stopColor: '#4f46e5', stopOpacity: 1}} />
                    <stop offset="100%" style={{stopColor: '#818cf8', stopOpacity: 1}} />
                </linearGradient>
            </defs>
            {/* Running Icon */}
            <path d="M70,30 L90,30 L100,50 L90,80 L70,80" fill="none" stroke="url(#logoGradient)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" className="opacity-20"/>
            <path d="M50,100 L80,90 L95,60 L120,50" fill="none" stroke="url(#logoGradient)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="95" cy="30" r="10" fill="url(#logoGradient)" />
            
            {/* Text */}
            <text x="140" y="85" fontFamily="'Inter', sans-serif" fontSize="60" fontWeight="900" fill="#1e293b" letterSpacing="2">
                INVICTOS
            </text>
            <rect x="140" y="95" width="220" height="4" fill="#4f46e5" rx="2" />
        </svg>
        <p className="text-slate-500 text-sm font-medium tracking-widest uppercase mt-2">Sistema de Gestión</p>
    </div>
  );

  if (!selectedUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 bg-white text-center shrink-0 border-b border-slate-100">
                <InvictosLogo />
            </div>
            <div className="p-8 overflow-y-auto">
                <h2 className="text-center text-xl font-semibold text-slate-700 mb-6">Seleccione Usuario</h2>
                <div className="space-y-3">
                    {users.map(user => (
                        <button
                            key={user.id}
                            onClick={() => handleUserSelect(user)}
                            className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-indigo-200 group-hover:text-indigo-700 transition-colors">
                                    <Users size={20} />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-slate-800">{user.name}</p>
                                    <p className="text-xs text-slate-500 uppercase">{user.role === 'admin' ? 'Dueño / Admin' : 'Vendedor'}</p>
                                </div>
                            </div>
                            {user.security?.isPermanentlyBlocked ? (
                                <Ban size={18} className="text-red-500" />
                            ) : user.security?.lockoutUntil && user.security.lockoutUntil > Date.now() ? (
                                <Clock size={18} className="text-amber-500" />
                            ) : (
                                <ChevronRight className="text-slate-300 group-hover:text-indigo-500" />
                            )}
                        </button>
                    ))}
                    {users.length === 0 && (
                        <div className="text-center p-4 text-slate-500">
                            Cargando usuarios...
                        </div>
                    )}
                </div>
            </div>
            <div className="bg-slate-50 p-4 text-center text-xs text-slate-400 shrink-0">
                INVICTOS v1.3.0
            </div>
        </div>
        
        {/* Emergency Reset Button */}
        <button 
            onClick={() => setShowResetConfirm(!showResetConfirm)}
            className="absolute bottom-4 right-4 text-slate-700 hover:text-white text-xs flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity"
        >
            <RefreshCw size={12} /> Problemas de acceso?
        </button>
        
        {showResetConfirm && (
            <div className="absolute bottom-10 right-4 bg-white p-4 rounded-lg shadow-xl border border-red-200 w-64 animate-fade-in-up">
                <p className="text-red-600 font-bold text-xs mb-2 flex items-center gap-1">
                    <AlertTriangle size={14} /> ZONA DE PELIGRO
                </p>
                <p className="text-slate-600 text-xs mb-3">
                    Restablecer datos de fábrica borrará toda la información.
                </p>
                <button 
                    onClick={StorageService.resetData}
                    className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded"
                >
                    Restablecer Todo
                </button>
            </div>
        )}
      </div>
    );
  }

  // BLOCKED SCREEN
  if (isPermanentlyBlocked || lockoutTimer) {
      return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
              <div className="max-w-sm w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                      {isPermanentlyBlocked ? <Ban size={32} /> : <Clock size={32} />}
                  </div>
                  
                  <h2 className="text-xl font-bold text-slate-800 mb-2">
                      {isPermanentlyBlocked ? 'Cuenta Bloqueada' : 'Bloqueo Temporal'}
                  </h2>
                  
                  <p className="text-slate-500 text-sm mb-6">
                      {isPermanentlyBlocked 
                        ? 'Se han excedido los intentos de seguridad. Contacte al administrador.' 
                        : `Demasiados intentos fallidos. Intente nuevamente en:`}
                  </p>

                  {lockoutTimer && !isPermanentlyBlocked && (
                      <div className="text-4xl font-mono font-bold text-slate-800 mb-6">
                          {Math.floor(lockoutTimer / 60)}:{(lockoutTimer % 60).toString().padStart(2, '0')}
                      </div>
                  )}

                  {selectedUser.role === 'admin' && isPermanentlyBlocked && !recoveryMode && (
                      <button 
                          onClick={() => setRecoveryMode(true)}
                          className="mb-4 text-indigo-600 font-bold text-sm hover:underline"
                      >
                          Recuperar por Email
                      </button>
                  )}

                  {recoveryMode && (
                      <div className="mb-4 bg-slate-50 p-4 rounded-lg animate-fade-in">
                          {recoveryStep === 0 ? (
                             <div className="text-left">
                                 <p className="text-xs text-slate-600 mb-2">Se enviará un código a ffernando.gambetta@gmail.com</p>
                                 <button onClick={handleAdminRecovery} className="w-full bg-indigo-600 text-white py-2 rounded text-xs font-bold flex items-center justify-center gap-2">
                                     <Mail size={14} /> Enviar Código
                                 </button>
                             </div>
                          ) : (
                             <div className="text-left">
                                 <label className="text-xs font-bold text-slate-700">Ingrese Código:</label>
                                 <input 
                                    type="text" 
                                    className="w-full border rounded p-2 mb-2"
                                    value={recoveryCode}
                                    onChange={e => setRecoveryCode(e.target.value)}
                                 />
                                 <button onClick={handleAdminRecovery} className="w-full bg-green-600 text-white py-2 rounded text-xs font-bold">
                                     Validar
                                 </button>
                             </div>
                          )}
                      </div>
                  )}

                  <button 
                      onClick={() => {
                          setSelectedUser(null);
                          setRecoveryMode(false);
                      }}
                      className="w-full py-3 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200 transition-colors"
                  >
                      Volver
                  </button>
              </div>
          </div>
      );
  }

  // PIN ENTRY SCREEN
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
             <div className="p-8 text-center">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
                    <Lock size={32} />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Hola, {selectedUser.name}</h2>
                <p className="text-slate-500 text-sm mb-6">Ingrese su PIN de seguridad</p>

                <form onSubmit={handlePinSubmit} className="space-y-4">
                    <input 
                        type="password" 
                        inputMode="numeric"
                        autoFocus
                        maxLength={4}
                        className="w-full text-center text-4xl tracking-[1em] font-bold text-slate-800 border-b-2 border-slate-200 focus:border-indigo-600 focus:outline-none py-2 placeholder-slate-200"
                        placeholder="••••"
                        value={pin}
                        onChange={(e) => {
                            setPin(e.target.value);
                            setError('');
                        }}
                    />
                    {error && <p className="text-red-500 text-sm font-medium animate-pulse">{error}</p>}
                    
                    {/* Hint for demo purposes */}
                    {selectedUser.id === 'u1' && (
                        <p className="text-[10px] text-slate-400">PIN por defecto: 1234</p>
                    )}
                    
                    <div className="pt-4 flex gap-3">
                         <button 
                            type="button" 
                            onClick={() => {
                                setSelectedUser(null);
                                setPin('');
                                setError('');
                            }}
                            className="flex-1 py-3 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition-colors"
                        >
                            Atrás
                        </button>
                        <button 
                            type="submit" 
                            disabled={pin.length < 1}
                            className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Ingresar
                        </button>
                    </div>
                </form>
             </div>
        </div>
    </div>
  );
};

export default Login;
