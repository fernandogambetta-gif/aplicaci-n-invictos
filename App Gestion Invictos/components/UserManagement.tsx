import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Edit2,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unlock,
  UserRound,
  Users,
  X,
  RotateCcw,
  ShoppingCart,
  Eye,
  EyeOff,
} from 'lucide-react';
import { User, UserRole } from '../types';
import { StorageService } from '../services/storageService';

interface UserManagementProps {
  currentUser: User;
  onCurrentUserUpdate: (user: User) => void;
  salesCount: number;
  onDataReset: () => void | Promise<void>;
}

interface UserFormState {
  name: string;
  role: UserRole;
  pin: string;
  commissionPercentage: string;
}

const EMPTY_FORM: UserFormState = {
  name: '',
  role: 'seller',
  pin: '',
  commissionPercentage: '5',
};

const UserManagement: React.FC<UserManagementProps> = ({
  currentUser,
  onCurrentUserUpdate,
  salesCount,
  onDataReset,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [showPin, setShowPin] = useState(false);

  // Reset administrativo de ventas / historial
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetPin, setResetPin] = useState('');
  const [showResetPin, setShowResetPin] = useState(false);
  const [isResettingSales, setIsResettingSales] = useState(false);
  const [resetError, setResetError] = useState('');

  const loadUsers = async () => {
    setIsLoading(true);
    setError('');

    try {
      const loaded = await StorageService.getUsers();
      setUsers(loaded);
    } catch (e: any) {
      console.error('Error cargando usuarios:', e);
      setError(e?.message || 'No se pudieron cargar los usuarios.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const adminCount = useMemo(
    () => users.filter((user) => user.role === 'admin').length,
    [users],
  );

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const openNewUser = () => {
    clearMessages();
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setShowPin(false);
    setIsModalOpen(true);
  };

  const openEditUser = (user: User) => {
    clearMessages();
    setEditingUser(user);
    setForm({
      name: user.name,
      role: user.role,
      pin: '',
      commissionPercentage: String(user.commissionPercentage ?? (user.role === 'seller' ? 5 : 0)),
    });
    setShowPin(false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setShowPin(false);
    setError('');
  };

  const validateForm = (): string | null => {
    const name = form.name.trim();

    if (!name) return 'Ingresá el nombre del usuario.';

    const duplicate = users.find(
      (user) =>
        user.id !== editingUser?.id &&
        user.name.trim().toLowerCase() === name.toLowerCase(),
    );

    if (duplicate) return `Ya existe un usuario llamado “${duplicate.name}”.`;

    if (!editingUser && !/^\d{4}$/.test(form.pin)) {
      return 'El PIN del nuevo usuario debe tener exactamente 4 números.';
    }

    if (editingUser && form.pin && !/^\d{4}$/.test(form.pin)) {
      return 'El nuevo PIN debe tener exactamente 4 números.';
    }

    const commission = Number(form.commissionPercentage);
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      return 'La comisión debe estar entre 0 y 100%.';
    }

    if (editingUser?.id === currentUser.id && form.role !== 'admin') {
      return 'No podés quitarte a vos mismo el rol de administrador mientras estás conectado.';
    }

    if (
      editingUser?.role === 'admin' &&
      form.role !== 'admin' &&
      adminCount <= 1
    ) {
      return 'Debe existir al menos un administrador en el sistema.';
    }

    return null;
  };

  const handleSave = async () => {
    clearMessages();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);

    try {
      const commission = Number(form.commissionPercentage);

      if (editingUser) {
        const updatedUser: User = {
          ...editingUser,
          name: form.name.trim(),
          role: form.role,
          pin: form.pin ? form.pin : editingUser.pin,
          commissionPercentage: commission,
        };

        await StorageService.updateUser(updatedUser);

        if (updatedUser.id === currentUser.id) {
          onCurrentUserUpdate(updatedUser);
        }

        setSuccess(`Usuario “${updatedUser.name}” actualizado.`);
      } else {
        const newUser: User = {
          id: `usr-${Date.now()}`,
          name: form.name.trim(),
          role: form.role,
          pin: form.pin,
          commissionPercentage: commission,
        };

        await StorageService.addUser(newUser);
        setSuccess(`Usuario “${newUser.name}” creado correctamente.`);
      }

      await loadUsers();
      setIsModalOpen(false);
      setEditingUser(null);
      setForm(EMPTY_FORM);
      setShowPin(false);
    } catch (e: any) {
      console.error('Error guardando usuario:', e);
      setError(e?.message || 'No se pudo guardar el usuario.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnlock = async (user: User) => {
    clearMessages();

    try {
      await StorageService.unlockUser(user.id);
      await loadUsers();
      setSuccess(`Usuario “${user.name}” desbloqueado.`);
    } catch (e: any) {
      console.error('Error desbloqueando usuario:', e);
      setError(e?.message || 'No se pudo desbloquear el usuario.');
    }
  };

  const handleDelete = async (user: User) => {
    clearMessages();

    if (user.id === currentUser.id) {
      setError('No podés eliminar el usuario con el que estás conectado.');
      return;
    }

    if (user.role === 'admin' && adminCount <= 1) {
      setError('No se puede eliminar el último administrador del sistema.');
      return;
    }

    if (!confirm(`¿Eliminar definitivamente al usuario “${user.name}”?`)) return;

    try {
      await StorageService.deleteUser(user.id);
      await loadUsers();
      setSuccess(`Usuario “${user.name}” eliminado.`);
    } catch (e: any) {
      console.error('Error eliminando usuario:', e);
      setError(e?.message || 'No se pudo eliminar el usuario.');
    }
  };

  const openResetSales = () => {
    clearMessages();
    setResetStep(1);
    setResetPin('');
    setShowResetPin(false);
    setResetError('');
    setIsResetModalOpen(true);
  };

  const closeResetSales = () => {
    if (isResettingSales) return;

    setIsResetModalOpen(false);
    setResetStep(1);
    setResetPin('');
    setShowResetPin(false);
    setResetError('');
  };

  const handleResetSales = async () => {
    setResetError('');

    if (currentUser.role !== 'admin') {
      setResetError('Acceso denegado. Solo un administrador puede realizar esta acción.');
      return;
    }

    if (!/^\d{4}$/.test(resetPin.trim())) {
      setResetError('Ingresá nuevamente tu PIN de administrador de 4 dígitos.');
      return;
    }

    if (resetPin.trim() !== (currentUser.pin || '').trim()) {
      setResetError('PIN de administrador incorrecto. El reseteo fue cancelado.');
      setResetPin('');
      return;
    }

    setIsResettingSales(true);

    try {
      const result = await StorageService.resetSalesAndRestoreStock(
        currentUser,
        resetPin,
      );

      await Promise.resolve(onDataReset());

      setIsResetModalOpen(false);
      setResetStep(1);
      setResetPin('');
      setShowResetPin(false);

      if (result.salesDeleted === 0) {
        setSuccess('No había ventas registradas para resetear.');
        return;
      }

      const missingWarning =
        result.missingProducts > 0
          ? ` Atención: ${result.missingProducts} producto(s) de ventas anteriores ya no existían y no pudieron recuperar stock.`
          : '';

      setSuccess(
        `Reset completado: ${result.salesDeleted} venta(s) eliminada(s) del historial y ` +
          `${result.unitsRestored} unidad(es) devuelta(s) al stock en ` +
          `${result.productsAdjusted} producto(s).${missingWarning}`,
      );
    } catch (e: any) {
      console.error('Error reseteando ventas:', e);
      setResetError(
        e?.message ||
          'No se pudieron resetear las ventas. No se realizaron cambios.',
      );
    } finally {
      setIsResettingSales(false);
    }
  };

  const getStatus = (user: User) => {
    if (user.security?.isPermanentlyBlocked) {
      return {
        label: 'Bloqueado',
        className: 'bg-red-100 text-red-700',
        icon: Ban,
      };
    }

    if (user.security?.lockoutUntil && user.security.lockoutUntil > Date.now()) {
      return {
        label: 'Bloqueo temporal',
        className: 'bg-amber-100 text-amber-700',
        icon: Clock,
      };
    }

    return {
      label: 'Activo',
      className: 'bg-emerald-100 text-emerald-700',
      icon: CheckCircle2,
    };
  };

  if (currentUser.role !== 'admin') {
    return (
      <div className="max-w-xl mx-auto bg-white border border-red-200 rounded-2xl p-8 text-center shadow-sm">
        <ShieldCheck size={42} className="mx-auto text-red-500 mb-3" />
        <h2 className="text-xl font-bold text-slate-800">Acceso restringido</h2>
        <p className="text-slate-500 mt-2">
          Solo un administrador puede gestionar usuarios.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users size={26} className="text-indigo-600" />
            Administración de Usuarios
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Altas, permisos, PIN, comisiones y desbloqueo de cuentas.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadUsers()}
            className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium flex items-center gap-2"
          >
            <RefreshCw size={18} /> Actualizar
          </button>

          <button
            type="button"
            onClick={openNewUser}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-2 shadow-sm"
          >
            <Plus size={19} /> Nuevo Usuario
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span className="text-sm flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} className="font-bold">×</button>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 flex items-start gap-2">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <span className="text-sm flex-1">{success}</span>
          <button type="button" onClick={() => setSuccess('')} className="font-bold">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase font-semibold text-slate-400">Usuarios</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{users.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase font-semibold text-slate-400">Administradores</div>
          <div className="text-2xl font-bold text-indigo-600 mt-1">{adminCount}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase font-semibold text-slate-400">Bloqueados</div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            {users.filter((user) =>
              Boolean(
                user.security?.isPermanentlyBlocked ||
                (user.security?.lockoutUntil && user.security.lockoutUntil > Date.now()),
              ),
            ).length}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="animate-spin mb-3" size={32} />
            Cargando usuarios...
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            No hay usuarios cargados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Usuario</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Rol</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-center">Comisión</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Acciones</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {users.map((user) => {
                  const status = getStatus(user);
                  const StatusIcon = status.icon;
                  const isCurrent = user.id === currentUser.id;
                  const blocked =
                    Boolean(user.security?.isPermanentlyBlocked) ||
                    Boolean(user.security?.lockoutUntil && user.security.lockoutUntil > Date.now());

                  return (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-2">
                              {user.name}
                              {isCurrent && (
                                <span className="text-[10px] uppercase font-bold bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                                  Vos
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-mono">{user.id}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          user.role === 'admin'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {user.role === 'admin' ? <ShieldCheck size={13} /> : <UserRound size={13} />}
                          {user.role === 'admin' ? 'Administrador' : 'Vendedor'}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-center font-semibold text-slate-700">
                        {Number(user.commissionPercentage ?? 0).toLocaleString('es-AR')}%
                      </td>

                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${status.className}`}>
                          <StatusIcon size={13} />
                          {status.label}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          {blocked && (
                            <button
                              type="button"
                              title="Desbloquear usuario"
                              onClick={() => void handleUnlock(user)}
                              className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50"
                            >
                              <Unlock size={18} />
                            </button>
                          )}

                          <button
                            type="button"
                            title="Editar usuario / cambiar PIN"
                            onClick={() => openEditUser(user)}
                            className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
                          >
                            <Edit2 size={18} />
                          </button>

                          <button
                            type="button"
                            title={isCurrent ? 'No podés eliminar tu propio usuario' : 'Eliminar usuario'}
                            disabled={isCurrent}
                            onClick={() => void handleDelete(user)}
                            className="p-2 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MANTENIMIENTO - SOLO ADMINISTRADOR */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <RotateCcw size={19} className="text-red-600" />
            Mantenimiento
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Acciones administrativas sobre datos de prueba.
          </p>
        </div>

        <div className="p-5">
          <div className="border border-red-200 bg-red-50 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex gap-3">
              <div className="w-11 h-11 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <ShoppingCart size={22} />
              </div>

              <div>
                <div className="font-semibold text-slate-900">
                  Resetear Ventas e Historial
                </div>

                <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                  Elimina todas las ventas registradas y deja vacío el Historial.
                  Las unidades descontadas por esas ventas se devuelven automáticamente
                  al stock. No se eliminan productos, usuarios, categorías ni proveedores.
                </p>

                <div className="mt-2 text-xs font-bold text-red-700">
                  Ventas actualmente registradas: {salesCount.toLocaleString('es-AR')}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={openResetSales}
              disabled={salesCount === 0}
              className="shrink-0 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw size={18} />
              Resetear ventas
            </button>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex gap-3">
        <KeyRound size={20} className="shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">Los PIN existentes no se muestran.</div>
          <div className="text-amber-700 mt-0.5">
            Para cambiar un PIN, editá el usuario y escribí uno nuevo de 4 dígitos. Si dejás el campo vacío, conserva el actual.
          </div>
        </div>
      </div>

      {isResetModalOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 bg-red-50 border-b border-red-200 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-red-800 flex items-center gap-2">
                  <AlertTriangle size={20} />
                  Resetear Ventas e Historial
                </h3>
                <p className="text-xs text-red-600 mt-1">
                  Acción administrativa irreversible sobre el historial de ventas.
                </p>
              </div>

              <button
                type="button"
                onClick={closeResetSales}
                disabled={isResettingSales}
                className="p-1 text-red-400 hover:text-red-700 disabled:opacity-40"
              >
                <X size={21} />
              </button>
            </div>

            {resetStep === 1 ? (
              <div className="p-6 space-y-5">
                <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                  <RotateCcw size={30} />
                </div>

                <div className="text-center">
                  <h4 className="text-xl font-bold text-slate-900">
                    Primera confirmación
                  </h4>
                  <p className="text-sm text-slate-600 mt-2">
                    Se eliminarán <b>{salesCount.toLocaleString('es-AR')} venta(s)</b>
                    {' '}y el Historial de Ventas quedará vacío.
                  </p>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-2">
                  <div className="font-semibold">Antes de continuar:</div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Se borrarán todas las ventas registradas.</li>
                    <li>Se eliminará también el historial derivado de esas ventas.</li>
                    <li>Las unidades vendidas se devolverán automáticamente al stock.</li>
                    <li>No se borrarán productos, usuarios, categorías ni proveedores.</li>
                  </ul>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={closeResetSales}
                    className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setResetError('');
                      setResetStep(2);
                    }}
                    className="py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold"
                  >
                    Sí, continuar
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-5">
                <div>
                  <div className="text-xs uppercase font-bold tracking-wide text-red-500">
                    Segunda confirmación
                  </div>
                  <h4 className="text-xl font-bold text-slate-900 mt-1">
                    Reingresá tu contraseña / PIN
                  </h4>
                  <p className="text-sm text-slate-500 mt-1">
                    Por seguridad, confirmá nuevamente tu identidad como administrador.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Administrador conectado</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {currentUser.name}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    PIN de administrador
                  </label>

                  <div className="relative">
                    <input
                      type={showResetPin ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={4}
                      autoFocus
                      value={resetPin}
                      onChange={(e) => {
                        const onlyNumbers = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setResetPin(onlyNumbers);
                        setResetError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && resetPin.length === 4) {
                          e.preventDefault();
                          void handleResetSales();
                        }
                      }}
                      placeholder="••••"
                      className="w-full text-center text-3xl tracking-[0.5em] font-bold border border-slate-300 rounded-xl px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-red-500"
                    />

                    <button
                      type="button"
                      onClick={() => setShowResetPin((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      title={showResetPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                    >
                      {showResetPin ? <EyeOff size={19} /> : <Eye size={19} />}
                    </button>
                  </div>
                </div>

                {resetError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm flex gap-2">
                    <AlertTriangle size={17} className="shrink-0 mt-0.5" />
                    <span>{resetError}</span>
                  </div>
                )}

                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
                  Al confirmar, la eliminación se ejecutará inmediatamente.
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isResettingSales}
                    onClick={() => {
                      setResetError('');
                      setResetPin('');
                      setResetStep(1);
                    }}
                    className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold disabled:opacity-50"
                  >
                    Volver
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleResetSales()}
                    disabled={isResettingSales || resetPin.length !== 4}
                    className="py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isResettingSales ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <RotateCcw size={18} />
                    )}
                    {isResettingSales ? 'Reseteando...' : 'Confirmar reset definitivo'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingUser ? 'Modificá permisos, comisión o PIN.' : 'Creá una nueva cuenta de acceso.'}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={21} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex gap-2">
                  <AlertTriangle size={17} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Nombre del usuario"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                  <select
                    value={form.role}
                    onChange={(e) => {
                      const role = e.target.value as UserRole;
                      setForm((prev) => ({
                        ...prev,
                        role,
                        commissionPercentage:
                          role === 'admin' && prev.commissionPercentage === '5'
                            ? '0'
                            : prev.commissionPercentage,
                      }));
                    }}
                    disabled={editingUser?.id === currentUser.id}
                    className="w-full border border-slate-300 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                  >
                    <option value="seller">Vendedor</option>
                    <option value="admin">Administrador</option>
                  </select>
                  {editingUser?.id === currentUser.id && (
                    <p className="text-[11px] text-slate-400 mt-1">Tu propio rol queda protegido.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Comisión (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={form.commissionPercentage}
                    onChange={(e) => setForm((prev) => ({ ...prev, commissionPercentage: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {editingUser ? 'Nuevo PIN (opcional)' : 'PIN de acceso'}
                </label>

                <div className="flex gap-2">
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={4}
                    value={form.pin}
                    onChange={(e) => {
                      const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setForm((prev) => ({ ...prev, pin: onlyDigits }));
                    }}
                    className="flex-1 border border-slate-300 rounded-lg p-2.5 font-mono tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder={editingUser ? 'Dejar vacío para conservar' : '0000'}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPin((value) => !value)}
                    className="px-3 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                  >
                    {showPin ? 'Ocultar' : 'Ver'}
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 mt-1">
                  Exactamente 4 números.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={isSaving}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-2 disabled:opacity-60"
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
