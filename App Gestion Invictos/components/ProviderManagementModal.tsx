import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Briefcase,
  Building2,
  Edit2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Save,
  Search,
  Star,
  Trash2,
  UserRound,
  X,
  Globe,
  Loader2,
} from 'lucide-react';
import { ProviderContact, ProviderItem } from '../types';
import { StorageService } from '../services/storageService';

interface ProviderManagementModalProps {
  open: boolean;
  providers: ProviderItem[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

interface ProviderForm {
  id?: string;
  name: string;
  taxId: string;
  address: string;
  city: string;
  province: string;
  website: string;
  notes: string;
  contacts: ProviderContact[];
  createdAt?: number;
}

const emptyContact = (): ProviderContact => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: '',
  role: '',
  phone: '',
  whatsapp: '',
  email: '',
  isPrimary: false,
  notes: '',
});

const emptyForm = (): ProviderForm => ({
  name: '',
  taxId: '',
  address: '',
  city: '',
  province: '',
  website: '',
  notes: '',
  contacts: [emptyContact()],
});

const ProviderManagementModal: React.FC<ProviderManagementModalProps> = ({
  open,
  providers,
  onClose,
  onSaved,
}) => {
  const [form, setForm] = useState<ProviderForm>(emptyForm());
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setError('');
    setSuccess('');
  }, [open]);

  const resetForm = () => {
    setForm(emptyForm());
    setError('');
    setSuccess('');
  };

  const handleEdit = (provider: ProviderItem) => {
    const existingContacts =
      Array.isArray(provider.contacts) && provider.contacts.length > 0
        ? provider.contacts.map((contact) => ({
            id:
              contact.id ||
              `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: contact.name || '',
            role: contact.role || '',
            phone: contact.phone || '',
            whatsapp: contact.whatsapp || '',
            email: contact.email || '',
            isPrimary: Boolean(contact.isPrimary),
            notes: contact.notes || '',
          }))
        : [
            {
              ...emptyContact(),
              name: provider.contact || '',
              isPrimary: Boolean(provider.contact),
            },
          ];

    setForm({
      id: provider.id,
      name: provider.name || '',
      taxId: provider.taxId || '',
      address: provider.address || '',
      city: provider.city || '',
      province: provider.province || '',
      website: provider.website || '',
      notes: provider.notes || '',
      contacts: existingContacts,
      createdAt: provider.createdAt,
    });

    setError('');
    setSuccess('');
  };

  const updateContact = (
    id: string,
    field: keyof ProviderContact,
    value: string | boolean,
  ) => {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((contact) =>
        contact.id === id ? { ...contact, [field]: value } : contact,
      ),
    }));
  };

  const setPrimaryContact = (id: string) => {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((contact) => ({
        ...contact,
        isPrimary: contact.id === id,
      })),
    }));
  };

  const addContact = () => {
    setForm((prev) => ({
      ...prev,
      contacts: [...prev.contacts, emptyContact()],
    }));
  };

  const removeContact = (id: string) => {
    setForm((prev) => {
      const remaining = prev.contacts.filter((contact) => contact.id !== id);

      return {
        ...prev,
        contacts: remaining.length > 0 ? remaining : [emptyContact()],
      };
    });
  };

  const normalizeWebsite = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const handleSave = async () => {
    const name = form.name.trim();

    setError('');
    setSuccess('');

    if (!name) {
      setError('Ingresá el nombre de la empresa / proveedor.');
      return;
    }

    const duplicate = providers.find(
      (provider) =>
        provider.id !== form.id &&
        (provider.name || '').trim().toLowerCase() === name.toLowerCase(),
    );

    if (duplicate) {
      setError(`Ya existe un proveedor llamado "${duplicate.name}".`);
      return;
    }

    const cleanContacts = form.contacts
      .map((contact) => ({
        id:
          contact.id ||
          `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: (contact.name || '').trim(),
        role: (contact.role || '').trim(),
        phone: (contact.phone || '').trim(),
        whatsapp: (contact.whatsapp || '').trim(),
        email: (contact.email || '').trim(),
        isPrimary: Boolean(contact.isPrimary),
        notes: (contact.notes || '').trim(),
      }))
      .filter(
        (contact) =>
          contact.name ||
          contact.role ||
          contact.phone ||
          contact.whatsapp ||
          contact.email ||
          contact.notes,
      );

    if (
      cleanContacts.length > 0 &&
      !cleanContacts.some((contact) => contact.isPrimary)
    ) {
      cleanContacts[0].isPrimary = true;
    }

    const now = Date.now();

    const provider: ProviderItem = {
      id: form.id || now.toString(),
      name,
      taxId: form.taxId.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      province: form.province.trim(),
      website: form.website.trim(),
      notes: form.notes.trim(),
      contacts: cleanContacts,
      createdAt: form.createdAt || now,
      updatedAt: now,
    };

    setIsSaving(true);

    try {
      await StorageService.saveProvider(provider);
      await Promise.resolve(onSaved());

      setSuccess(form.id ? 'Proveedor actualizado.' : 'Proveedor agregado.');
      resetForm();
    } catch (e: any) {
      console.error('Error guardando proveedor:', e);
      setError(e?.message || 'No se pudo guardar el proveedor.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (provider: ProviderItem) => {
    const usedByProducts = false;

    const confirmed = window.confirm(
      `¿Eliminar el proveedor "${provider.name}"?\n\n` +
        'Los productos que ya lo tengan asignado conservarán el nombre guardado.',
    );

    if (!confirmed) return;

    try {
      await StorageService.deleteProvider(provider.id);
      await Promise.resolve(onSaved());

      if (form.id === provider.id) {
        resetForm();
      }
    } catch (e: any) {
      console.error('Error eliminando proveedor:', e);
      setError(e?.message || 'No se pudo eliminar el proveedor.');
    }
  };

  const filteredProviders = useMemo(() => {
    const term = search.trim().toLowerCase();

    return [...providers]
      .filter((provider) => {
        if (!term) return true;

        const contactsText = (provider.contacts || [])
          .map((contact) =>
            [
              contact.name,
              contact.role,
              contact.phone,
              contact.whatsapp,
              contact.email,
            ]
              .filter(Boolean)
              .join(' '),
          )
          .join(' ');

        const searchable = [
          provider.name,
          provider.taxId,
          provider.address,
          provider.city,
          provider.province,
          provider.website,
          provider.notes,
          provider.contact,
          contactsText,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchable.includes(term);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [providers, search]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[9999] sm:flex sm:items-center sm:justify-center sm:p-4">
      <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[94dvh] sm:max-w-6xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Briefcase size={22} />
              Administración de Proveedores
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Empresa, datos comerciales y uno o varios contactos.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
          >
            <X size={21} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div
            className="p-4 sm:p-6 space-y-6"
            style={{
              paddingBottom:
                'calc(5.5rem + env(safe-area-inset-bottom, 0px))',
            }}
          >
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm">
                {success}
              </div>
            )}

            {/* FORMULARIO EMPRESA */}
            <section className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="font-bold text-slate-800 flex items-center gap-2">
                  <Building2 size={18} className="text-indigo-600" />
                  {form.id ? 'Editar proveedor' : 'Nuevo proveedor'}
                </div>

                {form.id && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>

              <div className="p-4 sm:p-5 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <div className="xl:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nombre de la empresa / proveedor *
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="Ej.: Deportes Andinos S.A."
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      CUIT / Identificación fiscal
                    </label>
                    <input
                      type="text"
                      value={form.taxId}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, taxId: e.target.value }))
                      }
                      placeholder="30-XXXXXXXX-X"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Dirección
                    </label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          address: e.target.value,
                        }))
                      }
                      placeholder="Calle, número, local..."
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Ciudad
                    </label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, city: e.target.value }))
                      }
                      placeholder="Ciudad"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Provincia
                    </label>
                    <input
                      type="text"
                      value={form.province}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          province: e.target.value,
                        }))
                      }
                      placeholder="Provincia"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Sitio web / tienda mayorista
                    </label>
                    <input
                      type="text"
                      value={form.website}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          website: e.target.value,
                        }))
                      }
                      placeholder="www.proveedor.com"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* CONTACTOS */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-slate-800">
                        Personas de contacto
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Podés cargar más de una persona para la misma empresa.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={addContact}
                      className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-semibold flex items-center gap-2"
                    >
                      <Plus size={16} />
                      Agregar contacto
                    </button>
                  </div>

                  <div className="space-y-3">
                    {form.contacts.map((contact, index) => (
                      <div
                        key={contact.id}
                        className={`border rounded-xl p-4 ${
                          contact.isPrimary
                            ? 'border-amber-300 bg-amber-50/30'
                            : 'border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <UserRound size={17} className="text-slate-500" />
                            <span className="font-semibold text-slate-700">
                              Contacto {index + 1}
                            </span>

                            {contact.isPrimary && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold">
                                <Star size={11} />
                                Principal
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setPrimaryContact(contact.id)}
                              title="Marcar como contacto principal"
                              className={`p-2 rounded-lg ${
                                contact.isPrimary
                                  ? 'text-amber-600 bg-amber-100'
                                  : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                              }`}
                            >
                              <Star size={16} />
                            </button>

                            <button
                              type="button"
                              onClick={() => removeContact(contact.id)}
                              title="Eliminar contacto"
                              className="p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">
                              Nombre
                            </label>
                            <input
                              type="text"
                              value={contact.name || ''}
                              onChange={(e) =>
                                updateContact(contact.id, 'name', e.target.value)
                              }
                              placeholder="Nombre y apellido"
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">
                              Cargo / Área
                            </label>
                            <input
                              type="text"
                              value={contact.role || ''}
                              onChange={(e) =>
                                updateContact(contact.id, 'role', e.target.value)
                              }
                              placeholder="Ventas, dueño, compras..."
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">
                              Teléfono
                            </label>
                            <input
                              type="tel"
                              value={contact.phone || ''}
                              onChange={(e) =>
                                updateContact(contact.id, 'phone', e.target.value)
                              }
                              placeholder="264..."
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">
                              WhatsApp
                            </label>
                            <input
                              type="tel"
                              value={contact.whatsapp || ''}
                              onChange={(e) =>
                                updateContact(
                                  contact.id,
                                  'whatsapp',
                                  e.target.value,
                                )
                              }
                              placeholder="+54 9..."
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">
                              Email
                            </label>
                            <input
                              type="email"
                              value={contact.email || ''}
                              onChange={(e) =>
                                updateContact(contact.id, 'email', e.target.value)
                              }
                              placeholder="ventas@..."
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Observaciones del proveedor
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    rows={3}
                    placeholder="Horarios, condiciones de compra, vendedor habitual, observaciones..."
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-y"
                  />
                </div>

                <div
                  className="sticky bottom-0 z-20 -mx-4 sm:-mx-5 px-4 sm:px-5 py-3 bg-white/95 backdrop-blur border-t border-slate-200 flex gap-3 justify-end"
                  style={{
                    paddingBottom:
                      'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
                  }}
                >
                  {form.id && (
                    <button
                      type="button"
                      onClick={resetForm}
                      disabled={isSaving}
                      className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Save size={18} />
                    )}
                    {form.id ? 'Guardar cambios' : 'Guardar proveedor'}
                  </button>
                </div>
              </div>
            </section>

            {/* LISTADO */}
            <section className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-slate-800">
                    Proveedores cargados
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {providers.length} proveedor(es)
                  </p>
                </div>

                <div className="relative w-full md:max-w-sm">
                  <Search
                    size={17}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar empresa, contacto, teléfono..."
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
                  />
                </div>
              </div>

              <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                {filteredProviders.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">
                    No se encontraron proveedores.
                  </div>
                ) : (
                  filteredProviders.map((provider) => {
                    const contacts = provider.contacts || [];
                    const primary =
                      contacts.find((contact) => contact.isPrimary) ||
                      contacts[0];

                    const location = [
                      provider.address,
                      provider.city,
                      provider.province,
                    ]
                      .filter(Boolean)
                      .join(' · ');

                    return (
                      <div key={provider.id} className="p-4 hover:bg-slate-50">
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h5 className="font-bold text-slate-900">
                                {provider.name}
                              </h5>

                              {provider.taxId && (
                                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">
                                  CUIT {provider.taxId}
                                </span>
                              )}
                            </div>

                            {location && (
                              <div className="text-xs text-slate-500 mt-1 flex items-start gap-1.5">
                                <MapPin size={13} className="mt-0.5 shrink-0" />
                                <span>{location}</span>
                              </div>
                            )}

                            {primary && (
                              <div className="mt-3 bg-white border border-slate-200 rounded-lg p-3">
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                  <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                                    <UserRound size={15} />
                                    {primary.name || 'Contacto'}
                                    {primary.role && (
                                      <span className="font-normal text-slate-400">
                                        · {primary.role}
                                      </span>
                                    )}
                                  </div>

                                  {primary.phone && (
                                    <div className="flex items-center gap-1 text-xs text-slate-600">
                                      <Phone size={13} />
                                      {primary.phone}
                                    </div>
                                  )}

                                  {primary.whatsapp && (
                                    <div className="flex items-center gap-1 text-xs text-emerald-700">
                                      <MessageCircle size={13} />
                                      {primary.whatsapp}
                                    </div>
                                  )}

                                  {primary.email && (
                                    <a
                                      href={`mailto:${primary.email}`}
                                      className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                                    >
                                      <Mail size={13} />
                                      {primary.email}
                                    </a>
                                  )}
                                </div>

                                {contacts.length > 1 && (
                                  <div className="text-[11px] text-slate-400 mt-2">
                                    + {contacts.length - 1} contacto(s) adicional(es)
                                  </div>
                                )}
                              </div>
                            )}

                            {provider.website && (
                              <a
                                href={normalizeWebsite(provider.website)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-2"
                              >
                                <Globe size={13} />
                                {provider.website}
                              </a>
                            )}

                            {provider.notes && (
                              <p className="text-xs text-slate-500 mt-2">
                                {provider.notes}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEdit(provider)}
                              className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
                              title="Editar proveedor"
                            >
                              <Edit2 size={18} />
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleDelete(provider)}
                              className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                              title="Eliminar proveedor"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ProviderManagementModal;
