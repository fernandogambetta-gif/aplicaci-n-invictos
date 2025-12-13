import React, { useState } from 'react';
import { User } from '../types';
import { X, Lock, Check, AlertCircle } from 'lucide-react';

interface ProfileModalProps {
  user: User;
  onClose: () => void;
  onUpdate: (user: User) => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ user, onClose, onUpdate }) => {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (currentPin !== user.pin) {
      setError('El PIN actual es incorrecto.');
      return;
    }

    if (newPin.length < 4) {
      setError('El nuevo PIN debe tener al menos 4 dígitos.');
      return;
    }

    if (newPin !== confirmPin) {
      setError('Los nuevos PINs no coinciden.');
      return;
    }

    onUpdate({ ...user, pin: newPin });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-fade-in-up">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Lock size={18} /> Cambiar Contraseña
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">PIN Actual</label>
            <input 
              type="password" 
              inputMode="numeric"
              maxLength={4}
              className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              value={currentPin}
              onChange={e => setCurrentPin(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nuevo PIN</label>
            <input 
              type="password" 
              inputMode="numeric"
              maxLength={4}
              className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              value={newPin}
              onChange={e => setNewPin(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar Nuevo PIN</label>
            <input 
              type="password" 
              inputMode="numeric"
              maxLength={4}
              className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              value={confirmPin}
              onChange={e => setConfirmPin(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm flex items-center gap-2 bg-red-50 p-2 rounded">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div className="pt-2">
            <button 
              type="submit"
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-100"
            >
              <Check size={18} /> Guardar Nuevo PIN
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileModal;