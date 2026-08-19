import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  X,
} from 'lucide-react';
import { User } from '../types';

interface ProfileModalProps {
  user: User;
  onClose: () => void;
  onUpdate: (updatedUser: User) => void | Promise<void>;
  forceChange?: boolean;
}

const EMPTY_SECURITY = {
  failedAttempts: 0,
  lockoutUntil: null,
  consecutiveLockouts: 0,
  isPermanentlyBlocked: false,
};

const ProfileModal: React.FC<ProfileModalProps> = ({
  user,
  onClose,
  onUpdate,
  forceChange = false,
}) => {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [repeatPin, setRepeatPin] = useState('');

  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showRepeatPin, setShowRepeatPin] = useState(false);

  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCurrentPin('');
    setNewPin('');
    setRepeatPin('');
    setShowCurrentPin(false);
    setShowNewPin(false);
    setShowRepeatPin(false);
    setError('');
  }, [user.id, forceChange]);

  const onlyDigits = (value: string) =>
    value.replace(/\D/g, '').slice(0, 4);

  const validate = (): string | null => {
    if (!/^\d{4}$/.test(currentPin)) {
      return 'Ingresá tu PIN actual de 4 dígitos.';
    }

    if (currentPin !== (user.pin || '').trim()) {
      return 'El PIN actual es incorrecto.';
    }

    if (!/^\d{4}$/.test(newPin)) {
      return 'El nuevo PIN debe tener exactamente 4 números.';
    }

    if (newPin === currentPin) {
      return 'El nuevo PIN debe ser diferente del PIN actual.';
    }

    if (repeatPin !== newPin) {
      return 'La repetición del nuevo PIN no coincide.';
    }

    return null;
  };

  const handleSave = async () => {
    setError('');

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);

    try {
      const updatedUser: User = {
        ...user,
        pin: newPin,
        mustChangePin: false,
        pinUpdatedAt: Date.now(),
        security: { ...EMPTY_SECURITY },
      };

      await Promise.resolve(onUpdate(updatedUser));

      if (!forceChange) {
        onClose();
      }
    } catch (e: any) {
      console.error('Error actualizando PIN:', e);
      setError(e?.message || 'No se pudo actualizar el PIN.');
    } finally {
      setIsSaving(false);
    }
  };

  const canClose = !forceChange && !isSaving;

  const PinInput = ({
    label,
    value,
    setValue,
    visible,
    setVisible,
    autoFocus = false,
  }: {
    label: string;
    value: string;
    setValue: (value: string) => void;
    visible: boolean;
    setVisible: (value: boolean) => void;
    autoFocus?: boolean;
  }) => (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
        {label}
      </label>

      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          inputMode="numeric"
          maxLength={4}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            setValue(onlyDigits(e.target.value));
            setError('');
          }}
          className="w-full border border-slate-300 rounded-xl px-4 py-3 pr-12 text-center text-2xl font-bold tracking-[0.45em] focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="••••"
        />

        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
          title={visible ? 'Ocultar PIN' : 'Mostrar PIN'}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[10040] bg-black/55 sm:flex sm:items-center sm:justify-center sm:p-4">
      <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[94dvh] sm:max-w-md sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div
          className={`shrink-0 px-4 sm:px-6 py-4 border-b flex items-start justify-between gap-4 ${
            forceChange
              ? 'bg-amber-50 border-amber-200'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div>
            <div
              className={`text-xs uppercase tracking-wide font-bold ${
                forceChange ? 'text-amber-600' : 'text-indigo-600'
              }`}
            >
              {forceChange ? 'Cambio obligatorio' : 'Seguridad de la cuenta'}
            </div>

            <h3 className="text-xl font-bold text-slate-900 mt-1 flex items-center gap-2">
              <KeyRound size={21} />
              Cambiar PIN / contraseña
            </h3>
          </div>

          {canClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-700"
            >
              <X size={21} />
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5">
          {forceChange && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm text-amber-800">
              <ShieldCheck size={19} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Tu PIN fue blanqueado por un administrador.</div>
                <div className="mt-1">
                  Ingresaste con un PIN temporal. Debés elegir uno nuevo antes de continuar.
                </div>
              </div>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Usuario</div>
            <div className="font-bold text-slate-900 mt-0.5">{user.name}</div>
            <div className="text-xs text-slate-400 mt-1">
              {user.role === 'admin' ? 'Administrador' : 'Vendedor'}
            </div>
          </div>

          <PinInput
            label={forceChange ? 'PIN temporal actual' : 'PIN actual'}
            value={currentPin}
            setValue={setCurrentPin}
            visible={showCurrentPin}
            setVisible={setShowCurrentPin}
            autoFocus
          />

          <PinInput
            label="Nuevo PIN"
            value={newPin}
            setValue={setNewPin}
            visible={showNewPin}
            setVisible={setShowNewPin}
          />

          <PinInput
            label="Repetir nuevo PIN"
            value={repeatPin}
            setValue={setRepeatPin}
            visible={showRepeatPin}
            setVisible={setShowRepeatPin}
          />

          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-xs text-indigo-700 flex gap-2">
            <LockKeyhole size={16} className="shrink-0 mt-0.5" />
            <span>
              El PIN debe tener exactamente 4 números. Para cambiarlo se exige conocer el PIN actual.
            </span>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex gap-2">
              <AlertTriangle size={17} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

        </div>

        <div
          className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4"
          style={{
            paddingBottom:
              'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div className={`grid gap-3 ${canClose ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {canClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold disabled:opacity-50"
              >
                Cancelar
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={
                isSaving ||
                currentPin.length !== 4 ||
                newPin.length !== 4 ||
                repeatPin.length !== 4
              }
              className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <CheckCircle2 size={18} />
              )}

              {isSaving ? 'Guardando...' : 'Guardar nuevo PIN'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
