import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { StorageService } from '../services/storageService';
import { Users, Lock, ChevronRight } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setUsers(StorageService.getUsers());
  }, []);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (pin === selectedUser.pin) {
      onLogin(selectedUser);
    } else {
      setError('PIN Incorrecto');
      setPin('');
    }
  };

  if (!selectedUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-8 bg-indigo-600 text-white text-center">
                <h1 className="text-3xl font-bold tracking-widest italic mb-2">INVICTOS</h1>
                <p className="text-indigo-200 text-sm">Sistema de Gestión Deportiva</p>
            </div>
            <div className="p-8">
                <h2 className="text-center text-xl font-semibold text-slate-700 mb-6">Seleccione Usuario</h2>
                <div className="space-y-3">
                    {users.map(user => (
                        <button
                            key={user.id}
                            onClick={() => {
                                setSelectedUser(user);
                                setError('');
                            }}
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
                            <ChevronRight className="text-slate-300 group-hover:text-indigo-500" />
                        </button>
                    ))}
                </div>
            </div>
            <div className="bg-slate-50 p-4 text-center text-xs text-slate-400">
                INVICTOS v1.1
            </div>
        </div>
      </div>
    );
  }

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