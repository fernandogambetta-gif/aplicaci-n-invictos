import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  DollarSign,
  Edit2,
  Lock,
  PieChart,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import {
  Product,
  SocietyAsset,
  SocietyAssetType,
  SocietyContribution,
  SocietyContributionMethod,
  SocietyInstallmentPlanItem,
  SocietyPartner,
  SocietyPartnerKind,
  SocietyValuation,
  User,
} from '../types';

interface SocietyManagementProps {
  products: Product[];
  currentUser: User;
}

type SocietyTab = 'summary' | 'valuation' | 'assets' | 'partners' | 'contributions';

const money = (value: number) =>
  Number(value || 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  });

const pct = (value: number) =>
  `${Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;

const toDateInput = (timestamp?: number) => {
  const date = timestamp ? new Date(timestamp) : new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const fromDateInput = (value: string) => {
  if (!value) return Date.now();
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0).getTime();
};

const addMonthsSafe = (timestamp: number, months: number) => {
  const source = new Date(timestamp);
  const year = source.getFullYear();
  const month = source.getMonth() + months;
  const day = source.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay), 12, 0, 0, 0).getTime();
};

const newId = (prefix: string) => {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
};

const assetTypeLabel: Record<SocietyAssetType, string> = {
  furniture: 'Mobiliario',
  equipment: 'Equipamiento',
  improvement: 'Instalaciones / mejoras',
  other_asset: 'Otro activo',
  intangible: 'Fondo de comercio / intangible',
  liability: 'Pasivo / deuda',
};

const contributionMethodLabel: Record<SocietyContributionMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  other: 'Otro',
};

const generateInstallmentPlan = (
  total: number,
  count: number,
  firstDueDate: number,
): SocietyInstallmentPlanItem[] => {
  const safeCount = Math.max(1, Math.min(120, Math.floor(Number(count) || 1)));
  const safeTotal = Math.max(0, Number(total) || 0);
  const base = Math.floor((safeTotal / safeCount) * 100) / 100;
  let accumulated = 0;

  return Array.from({ length: safeCount }).map((_, index) => {
    const amount =
      index === safeCount - 1
        ? Math.max(0, Math.round((safeTotal - accumulated) * 100) / 100)
        : base;

    accumulated += amount;

    return {
      id: newId('cuota'),
      number: index + 1,
      dueDate: addMonthsSafe(firstDueDate, index),
      amount,
    };
  });
};

const SocietyManagement: React.FC<SocietyManagementProps> = ({
  products,
  currentUser,
}) => {
  const [activeTab, setActiveTab] = useState<SocietyTab>('summary');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [valuation, setValuation] = useState<SocietyValuation | null>(null);
  const [assets, setAssets] = useState<SocietyAsset[]>([]);
  const [partners, setPartners] = useState<SocietyPartner[]>([]);
  const [contributions, setContributions] = useState<SocietyContribution[]>([]);

  const inventorySuggestedNow = useMemo(
    () =>
      (Array.isArray(products) ? products : []).reduce((sum, product) => {
        const stock = Math.max(0, Number(product.stock || 0));
        const cost = Math.max(0, Number(product.cost || 0));
        return sum + stock * cost;
      }, 0),
    [products],
  );

  const inventoryUnitsWithoutCost = useMemo(
    () =>
      (Array.isArray(products) ? products : []).reduce((sum, product) => {
        const stock = Math.max(0, Number(product.stock || 0));
        const cost = Number(product.cost || 0);
        return cost <= 0 ? sum + stock : sum;
      }, 0),
    [products],
  );

  const [valuationDate, setValuationDate] = useState(toDateInput());
  const [inventorySuggestedDraft, setInventorySuggestedDraft] = useState(0);
  const [inventoryAgreedDraft, setInventoryAgreedDraft] = useState(0);
  const [valuationNotes, setValuationNotes] = useState('');

  const [assetEditingId, setAssetEditingId] = useState<string | null>(null);
  const [assetType, setAssetType] = useState<SocietyAssetType>('furniture');
  const [assetName, setAssetName] = useState('');
  const [assetQuantity, setAssetQuantity] = useState('1');
  const [assetValue, setAssetValue] = useState('');
  const [assetIncluded, setAssetIncluded] = useState(true);
  const [assetOwner, setAssetOwner] = useState('');
  const [assetNotes, setAssetNotes] = useState('');

  const [partnerEditingId, setPartnerEditingId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [partnerKind, setPartnerKind] = useState<SocietyPartnerKind>('original');
  const [partnerInitialPct, setPartnerInitialPct] = useState('100');
  const [partnerTargetPct, setPartnerTargetPct] = useState('50');
  const [partnerRequired, setPartnerRequired] = useState('');
  const [partnerInstallments, setPartnerInstallments] = useState('1');
  const [partnerFirstDueDate, setPartnerFirstDueDate] = useState(toDateInput());
  const [partnerNotes, setPartnerNotes] = useState('');

  const [contributionPartnerId, setContributionPartnerId] = useState('');
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionDate, setContributionDate] = useState(toDateInput());
  const [contributionMethod, setContributionMethod] =
    useState<SocietyContributionMethod>('transfer');
  const [contributionReceipt, setContributionReceipt] = useState('');
  const [contributionNotes, setContributionNotes] = useState('');

  const [distributionAmount, setDistributionAmount] = useState('');
  const [distributionDate, setDistributionDate] = useState(toDateInput());

  const loadData = useCallback(async () => {
    if (currentUser.role !== 'admin') return;

    setIsLoading(true);
    setError('');

    try {
      const [loadedValuation, loadedAssets, loadedPartners, loadedContributions] =
        await Promise.all([
          StorageService.getSocietyValuation(currentUser.id),
          StorageService.getSocietyAssets(currentUser.id),
          StorageService.getSocietyPartners(currentUser.id),
          StorageService.getSocietyContributions(currentUser.id),
        ]);

      setValuation(loadedValuation);
      setAssets(Array.isArray(loadedAssets) ? loadedAssets : []);
      setPartners(Array.isArray(loadedPartners) ? loadedPartners : []);
      setContributions(
        Array.isArray(loadedContributions) ? loadedContributions : [],
      );

      if (loadedValuation) {
        setValuationDate(toDateInput(loadedValuation.valuationDate));
        setInventorySuggestedDraft(
          Number(loadedValuation.inventorySuggestedValue || 0),
        );
        setInventoryAgreedDraft(
          Number(loadedValuation.inventoryAgreedValue || 0),
        );
        setValuationNotes(loadedValuation.notes || '');
      } else {
        setValuationDate(toDateInput());
        setInventorySuggestedDraft(inventorySuggestedNow);
        setInventoryAgreedDraft(inventorySuggestedNow);
        setValuationNotes('');
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar la administración societaria.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.id, currentUser.role, inventorySuggestedNow]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const valuationLocked = valuation?.status === 'locked';

  const includedAssetsValue = useMemo(
    () =>
      assets.reduce((sum, asset) => {
        if (!asset.includedInSociety || asset.type === 'liability') return sum;
        return sum + Math.max(0, Number(asset.agreedValue || 0));
      }, 0),
    [assets],
  );

  const liabilitiesValue = useMemo(
    () =>
      assets.reduce((sum, asset) => {
        if (!asset.includedInSociety || asset.type !== 'liability') return sum;
        return sum + Math.max(0, Number(asset.agreedValue || 0));
      }, 0),
    [assets],
  );

  const excludedAssetsValue = useMemo(
    () =>
      assets.reduce((sum, asset) => {
        if (asset.includedInSociety || asset.type === 'liability') return sum;
        return sum + Math.max(0, Number(asset.agreedValue || 0));
      }, 0),
    [assets],
  );

  const activeInventoryAgreed = valuationLocked
    ? Number(valuation?.inventoryAgreedValue || 0)
    : Number(inventoryAgreedDraft || 0);

  const societyValue = Math.max(
    0,
    activeInventoryAgreed + includedAssetsValue - liabilitiesValue,
  );

  const activeContributions = useMemo(
    () => contributions.filter((item) => !item.voided),
    [contributions],
  );

  const paidByPartner = useMemo(() => {
    const map = new Map<string, number>();
    activeContributions.forEach((item) => {
      map.set(item.partnerId, (map.get(item.partnerId) || 0) + Number(item.amount || 0));
    });
    return map;
  }, [activeContributions]);

  const incomingPartners = useMemo(
    () => partners.filter((partner) => partner.kind === 'incoming' && partner.active !== false),
    [partners],
  );

  const originalPartners = useMemo(
    () => partners.filter((partner) => partner.kind === 'original' && partner.active !== false),
    [partners],
  );

  useEffect(() => {
    if (!contributionPartnerId && incomingPartners.length > 0) {
      setContributionPartnerId(incomingPartners[0].id);
    }
  }, [contributionPartnerId, incomingPartners]);

  const participationRows = useMemo(() => {
    const incomingRows = incomingPartners.map((partner) => {
      const required = Math.max(0, Number(partner.requiredContribution || 0));
      const paid = Math.max(0, paidByPartner.get(partner.id) || 0);
      const progress = required > 0 ? Math.min(1, paid / required) : 0;
      const target = Math.max(0, Number(partner.targetPercentage || 0));
      const effective = target * progress;

      return {
        id: partner.id,
        name: partner.name,
        kind: partner.kind,
        target,
        required,
        paid,
        pending: Math.max(0, required - paid),
        progress,
        effective,
      };
    });

    const incomingEffective = incomingRows.reduce((sum, row) => sum + row.effective, 0);
    const residual = Math.max(0, 100 - incomingEffective);
    const initialTotal = originalPartners.reduce(
      (sum, partner) => sum + Math.max(0, Number(partner.initialOwnershipPercentage || 0)),
      0,
    );

    const originalRows = originalPartners.map((partner) => {
      const weight = Math.max(0, Number(partner.initialOwnershipPercentage || 0));
      const effective = initialTotal > 0 ? residual * (weight / initialTotal) : 0;
      return {
        id: partner.id,
        name: partner.name,
        kind: partner.kind,
        target: effective,
        required: 0,
        paid: 0,
        pending: 0,
        progress: 1,
        effective,
      };
    });

    return [...originalRows, ...incomingRows];
  }, [incomingPartners, originalPartners, paidByPartner]);

  const distributionParticipationRows = useMemo(() => {
    const cutoffDate = new Date(fromDateInput(distributionDate));
    cutoffDate.setHours(23, 59, 59, 999);
    const cutoff = cutoffDate.getTime();

    const paidMap = new Map<string, number>();
    contributions
      .filter((item) => !item.voided && Number(item.date || 0) <= cutoff)
      .forEach((item) => {
        paidMap.set(
          item.partnerId,
          (paidMap.get(item.partnerId) || 0) + Number(item.amount || 0),
        );
      });

    const incomingRows = incomingPartners.map((partner) => {
      const required = Math.max(0, Number(partner.requiredContribution || 0));
      const paid = Math.max(0, paidMap.get(partner.id) || 0);
      const progress = required > 0 ? Math.min(1, paid / required) : 0;
      const target = Math.max(0, Number(partner.targetPercentage || 0));
      const effective = target * progress;

      return {
        id: partner.id,
        name: partner.name,
        kind: partner.kind,
        target,
        required,
        paid,
        pending: Math.max(0, required - paid),
        progress,
        effective,
      };
    });

    const incomingEffective = incomingRows.reduce(
      (sum, row) => sum + row.effective,
      0,
    );
    const residual = Math.max(0, 100 - incomingEffective);
    const initialTotal = originalPartners.reduce(
      (sum, partner) =>
        sum + Math.max(0, Number(partner.initialOwnershipPercentage || 0)),
      0,
    );

    const originalRows = originalPartners.map((partner) => {
      const weight = Math.max(
        0,
        Number(partner.initialOwnershipPercentage || 0),
      );
      const effective = initialTotal > 0 ? residual * (weight / initialTotal) : 0;

      return {
        id: partner.id,
        name: partner.name,
        kind: partner.kind,
        target: effective,
        required: 0,
        paid: 0,
        pending: 0,
        progress: 1,
        effective,
      };
    });

    return [...originalRows, ...incomingRows];
  }, [contributions, distributionDate, incomingPartners, originalPartners]);

  const resetAssetForm = () => {
    setAssetEditingId(null);
    setAssetType('furniture');
    setAssetName('');
    setAssetQuantity('1');
    setAssetValue('');
    setAssetIncluded(true);
    setAssetOwner('');
    setAssetNotes('');
  };

  const resetPartnerForm = () => {
    setPartnerEditingId(null);
    setPartnerName('');
    setPartnerKind('original');
    setPartnerInitialPct('100');
    setPartnerTargetPct('50');
    setPartnerRequired('');
    setPartnerInstallments('1');
    setPartnerFirstDueDate(toDateInput());
    setPartnerNotes('');
  };

  const saveValuationDraft = async () => {
    setIsSaving(true);
    setError('');
    setMessage('');

    try {
      const payload: SocietyValuation = {
        id: 'main',
        status: 'draft',
        valuationDate: fromDateInput(valuationDate),
        inventorySuggestedValue: Number(inventorySuggestedDraft || 0),
        inventoryAgreedValue: Number(inventoryAgreedDraft || 0),
        notes: valuationNotes.trim() || undefined,
      };

      await StorageService.saveSocietyValuationDraft(payload, currentUser.id);
      setMessage('Valuación guardada como borrador.');
      await loadData();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar la valuación.');
    } finally {
      setIsSaving(false);
    }
  };

  const refreshInventorySuggestion = () => {
    setInventorySuggestedDraft(inventorySuggestedNow);
    if (!valuation) setInventoryAgreedDraft(inventorySuggestedNow);
  };

  const lockValuation = async () => {
    if (
      !window.confirm(
        'Al cerrar la valuación se congela la foto inicial: inventario, bienes, pasivos y valores acordados ya no podrán modificarse. ¿Confirmar?',
      )
    ) {
      return;
    }

    setIsSaving(true);
    setError('');
    setMessage('');

    try {
      await StorageService.saveSocietyValuationDraft(
        {
          id: 'main',
          status: 'draft',
          valuationDate: fromDateInput(valuationDate),
          inventorySuggestedValue: Number(inventorySuggestedDraft || 0),
          inventoryAgreedValue: Number(inventoryAgreedDraft || 0),
          notes: valuationNotes.trim() || undefined,
        },
        currentUser.id,
      );
      await StorageService.lockSocietyValuation(currentUser.id);
      setMessage('Valuación inicial cerrada y congelada correctamente.');
      await loadData();
    } catch (e: any) {
      setError(e?.message || 'No se pudo cerrar la valuación.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveAsset = async () => {
    setIsSaving(true);
    setError('');
    setMessage('');

    try {
      const asset: SocietyAsset = {
        id: assetEditingId || newId('bien'),
        type: assetType,
        name: assetName.trim(),
        quantity: Number(assetQuantity || 0),
        agreedValue: Number(assetValue || 0),
        includedInSociety: assetIncluded,
        ownerName: assetIncluded ? undefined : assetOwner.trim() || undefined,
        notes: assetNotes.trim() || undefined,
      };

      await StorageService.saveSocietyAsset(asset, currentUser.id);
      resetAssetForm();
      setMessage('Bien / pasivo guardado correctamente.');
      await loadData();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar el bien.');
    } finally {
      setIsSaving(false);
    }
  };

  const editAsset = (asset: SocietyAsset) => {
    setAssetEditingId(asset.id);
    setAssetType(asset.type);
    setAssetName(asset.name || '');
    setAssetQuantity(String(asset.quantity || 1));
    setAssetValue(String(asset.agreedValue || 0));
    setAssetIncluded(asset.includedInSociety !== false);
    setAssetOwner(asset.ownerName || '');
    setAssetNotes(asset.notes || '');
    setActiveTab('assets');
  };

  const deleteAsset = async (asset: SocietyAsset) => {
    if (!window.confirm(`¿Eliminar "${asset.name}" de la valuación?`)) return;

    setIsSaving(true);
    try {
      await StorageService.deleteSocietyAsset(asset.id, currentUser.id);
      setMessage('Bien eliminado.');
      await loadData();
    } catch (e: any) {
      setError(e?.message || 'No se pudo eliminar el bien.');
    } finally {
      setIsSaving(false);
    }
  };

  const savePartner = async () => {
    setIsSaving(true);
    setError('');
    setMessage('');

    try {
      const required = Math.max(0, Number(partnerRequired || 0));
      const installmentCount = Math.max(1, Math.floor(Number(partnerInstallments || 1)));
      const firstDue = fromDateInput(partnerFirstDueDate);

      const existing = partnerEditingId
        ? partners.find((item) => item.id === partnerEditingId)
        : undefined;

      const partner: SocietyPartner = {
        id: partnerEditingId || newId('socio'),
        name: partnerName.trim(),
        kind: partnerKind,
        initialOwnershipPercentage:
          partnerKind === 'original' ? Number(partnerInitialPct || 0) : undefined,
        targetPercentage:
          partnerKind === 'incoming' ? Number(partnerTargetPct || 0) : undefined,
        requiredContribution: partnerKind === 'incoming' ? required : undefined,
        installmentPlan:
          partnerKind === 'incoming'
            ? generateInstallmentPlan(required, installmentCount, firstDue)
            : undefined,
        notes: partnerNotes.trim() || undefined,
        active: existing?.active !== false,
      };

      await StorageService.saveSocietyPartner(partner, currentUser.id);
      resetPartnerForm();
      setMessage('Socio / acuerdo guardado correctamente.');
      await loadData();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar el socio.');
    } finally {
      setIsSaving(false);
    }
  };

  const editPartner = (partner: SocietyPartner) => {
    setPartnerEditingId(partner.id);
    setPartnerName(partner.name || '');
    setPartnerKind(partner.kind);
    setPartnerInitialPct(String(partner.initialOwnershipPercentage || 100));
    setPartnerTargetPct(String(partner.targetPercentage || 50));
    setPartnerRequired(String(partner.requiredContribution || ''));
    setPartnerInstallments(String(partner.installmentPlan?.length || 1));
    setPartnerFirstDueDate(
      toDateInput(partner.installmentPlan?.[0]?.dueDate || Date.now()),
    );
    setPartnerNotes(partner.notes || '');
    setActiveTab('partners');
  };

  const deletePartner = async (partner: SocietyPartner) => {
    if (!window.confirm(`¿Eliminar a "${partner.name}" del acuerdo societario?`)) return;

    setIsSaving(true);
    try {
      await StorageService.deleteSocietyPartner(partner.id, currentUser.id);
      setMessage('Socio eliminado.');
      await loadData();
    } catch (e: any) {
      setError(e?.message || 'No se pudo eliminar el socio.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveContribution = async () => {
    const partner = partners.find((item) => item.id === contributionPartnerId);
    if (!partner) {
      setError('Seleccioná un socio entrante.');
      return;
    }

    setIsSaving(true);
    setError('');
    setMessage('');

    try {
      const contribution: SocietyContribution = {
        id: newId('aporte'),
        partnerId: partner.id,
        partnerName: partner.name,
        amount: Number(contributionAmount || 0),
        date: fromDateInput(contributionDate),
        method: contributionMethod,
        receiptNumber: contributionReceipt.trim() || undefined,
        notes: contributionNotes.trim() || undefined,
        recordedAt: Date.now(),
        recordedByUserId: currentUser.id,
        recordedByUserName: currentUser.name,
        voided: false,
      };

      await StorageService.saveSocietyContribution(contribution, currentUser.id);
      setContributionAmount('');
      setContributionReceipt('');
      setContributionNotes('');
      setContributionDate(toDateInput());
      setMessage('Aporte registrado. La participación efectiva fue recalculada.');
      await loadData();
    } catch (e: any) {
      setError(e?.message || 'No se pudo registrar el aporte.');
    } finally {
      setIsSaving(false);
    }
  };

  const voidContribution = async (contribution: SocietyContribution) => {
    const reason = window.prompt(
      `Motivo de anulación del aporte de ${money(contribution.amount)} de ${contribution.partnerName}:`,
    );
    if (!reason?.trim()) return;

    if (!window.confirm('El aporte no se borrará: quedará marcado como ANULADO en el historial. ¿Continuar?')) {
      return;
    }

    setIsSaving(true);
    try {
      await StorageService.voidSocietyContribution(
        contribution.id,
        reason,
        currentUser.id,
      );
      setMessage('Aporte anulado con trazabilidad.');
      await loadData();
    } catch (e: any) {
      setError(e?.message || 'No se pudo anular el aporte.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedContributionPartner = partners.find(
    (item) => item.id === contributionPartnerId,
  );
  const selectedPaid = selectedContributionPartner
    ? paidByPartner.get(selectedContributionPartner.id) || 0
    : 0;
  const selectedRequired = Number(selectedContributionPartner?.requiredContribution || 0);
  const selectedPending = Math.max(0, selectedRequired - selectedPaid);

  const tabs: Array<{ id: SocietyTab; label: string }> = [
    { id: 'summary', label: 'Resumen' },
    { id: 'valuation', label: 'Valuación' },
    { id: 'assets', label: 'Bienes' },
    { id: 'partners', label: 'Socios / Acuerdo' },
    { id: 'contributions', label: 'Aportes' },
  ];

  if (currentUser.role !== 'admin') {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-red-700">
        Esta sección es exclusiva para administradores.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[420px] flex items-center justify-center text-slate-500">
        <RefreshCw className="animate-spin mr-2" size={20} />
        Cargando administración societaria...
      </div>
    );
  }

  const distributionValue = Number(distributionAmount || 0);

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="text-indigo-600" size={28} />
            <h2 className="text-2xl font-bold text-slate-900">Sociedad / Participaciones</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Valuación inicial, bienes incluidos/excluidos, socios y aportes de integración.
          </p>
        </div>

        <div className={`px-3 py-2 rounded-lg text-sm font-bold border ${
          valuationLocked
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          {valuationLocked ? 'Valuación inicial cerrada' : 'Valuación en borrador'}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>{error}</div>
          <button className="ml-auto" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}

      {message && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-3 flex items-start gap-2">
          <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
          <div>{message}</div>
          <button className="ml-auto" onClick={() => setMessage('')}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-2 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'summary' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="text-xs uppercase font-bold text-slate-500">Valor societario</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{money(societyValue)}</div>
              <div className="text-xs text-slate-500 mt-1">
                Mercadería + activos incluidos − pasivos.
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="text-xs uppercase font-bold text-slate-500">Mercadería acordada</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{money(activeInventoryAgreed)}</div>
              <div className="text-xs text-slate-500 mt-1">
                Sugerido por costo: {money(valuationLocked ? Number(valuation?.inventorySuggestedValue || 0) : inventorySuggestedDraft)}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="text-xs uppercase font-bold text-slate-500">Otros activos incluidos</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{money(includedAssetsValue)}</div>
              <div className="text-xs text-slate-500 mt-1">Pasivos: {money(liabilitiesValue)}</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="text-xs uppercase font-bold text-slate-500">Bienes particulares excluidos</div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{money(excludedAssetsValue)}</div>
              <div className="text-xs text-slate-500 mt-1">Registrados, pero no integran la sociedad.</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <PieChart size={20} className="text-indigo-600" />
              <h3 className="font-bold text-slate-900">Participación efectiva actual</h3>
            </div>

            {participationRows.length === 0 ? (
              <div className="text-sm text-slate-500">
                Cargá primero los socios y el acuerdo para calcular las participaciones.
              </div>
            ) : (
              <div className="space-y-4">
                {participationRows.map((row) => (
                  <div key={row.id}>
                    <div className="flex items-center justify-between gap-3 text-sm mb-1">
                      <div className="font-semibold text-slate-800">
                        {row.name}
                        {row.kind === 'incoming' && (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            objetivo {pct(row.target)}
                          </span>
                        )}
                      </div>
                      <div className="font-bold text-indigo-700">{pct(row.effective)}</div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(0, row.effective))}%` }}
                      />
                    </div>
                    {row.kind === 'incoming' && (
                      <div className="text-xs text-slate-500 mt-1">
                        Aportado {money(row.paid)} de {money(row.required)} · integración {pct(row.progress * 100)} · pendiente {money(row.pending)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign size={20} className="text-indigo-600" />
              <h3 className="font-bold text-slate-900">Simulador de ganancias / pérdidas</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Usa la participación efectiva actual. Un importe negativo representa una pérdida.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Resultado a distribuir
                </label>
                <input
                  type="number"
                  value={distributionAmount}
                  onChange={(e) => setDistributionAmount(e.target.value)}
                  placeholder="Ej.: 1000000 o -500000"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Participación vigente al
                </label>
                <input
                  type="date"
                  value={distributionDate}
                  onChange={(e) => setDistributionDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {distributionValue !== 0 && distributionParticipationRows.length > 0 && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {distributionParticipationRows.map((row) => (
                  <div key={row.id} className="border border-slate-200 rounded-xl p-3 flex justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-800">{row.name}</div>
                      <div className="text-xs text-slate-500">{pct(row.effective)} efectivo</div>
                    </div>
                    <div className={`font-bold ${distributionValue >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {money(distributionValue * (row.effective / 100))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'valuation' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Valuación inicial</h3>
                <p className="text-sm text-slate-500 mt-1">
                  La mercadería se propone a costo de compra, pero el valor acordado puede modificarse antes de cerrar.
                </p>
              </div>
              {valuationLocked && (
                <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                  <Lock size={17} /> Cerrada
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Fecha de valuación</label>
                <input
                  type="date"
                  value={valuationDate}
                  disabled={valuationLocked}
                  onChange={(e) => setValuationDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Inventario sugerido por costo</label>
                <input
                  type="number"
                  value={inventorySuggestedDraft}
                  disabled
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 bg-slate-100 text-slate-700"
                />
                {!valuationLocked && (
                  <button
                    type="button"
                    onClick={refreshInventorySuggestion}
                    className="text-xs text-indigo-600 font-semibold mt-1 hover:underline"
                  >
                    Actualizar desde inventario actual ({money(inventorySuggestedNow)})
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Inventario: valor acordado</label>
                <input
                  type="number"
                  value={inventoryAgreedDraft}
                  disabled={valuationLocked}
                  onChange={(e) => setInventoryAgreedDraft(Number(e.target.value || 0))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 disabled:bg-slate-100"
                />
                <div className="text-xs text-slate-500 mt-1">
                  Diferencia: {money(Number(inventoryAgreedDraft || 0) - Number(inventorySuggestedDraft || 0))}
                </div>
              </div>
            </div>

            {inventoryUnitsWithoutCost > 0 && !valuationLocked && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex gap-2">
                <AlertTriangle size={18} className="shrink-0" />
                Hay {inventoryUnitsWithoutCost} unidad(es) con stock y costo $0. No aportan valor al cálculo automático.
              </div>
            )}

            <div className="mt-4">
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Observaciones</label>
              <textarea
                value={valuationNotes}
                disabled={valuationLocked}
                onChange={(e) => setValuationNotes(e.target.value)}
                rows={3}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 disabled:bg-slate-100"
                placeholder="Criterios acordados, aclaraciones, etc."
              />
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div>
                <div className="text-xs text-slate-500">Mercadería</div>
                <div className="font-bold text-slate-900">{money(activeInventoryAgreed)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Otros activos</div>
                <div className="font-bold text-slate-900">{money(includedAssetsValue)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Pasivos</div>
                <div className="font-bold text-red-700">− {money(liabilitiesValue)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Valor societario</div>
                <div className="font-bold text-indigo-700 text-lg">{money(societyValue)}</div>
              </div>
            </div>

            {!valuationLocked && (
              <div className="mt-5 flex flex-col sm:flex-row gap-3 justify-end">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveValuationDraft()}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold flex items-center justify-center gap-2"
                >
                  <Save size={17} /> Guardar borrador
                </button>
                <button
                  type="button"
                  disabled={isSaving || societyValue <= 0}
                  onClick={() => void lockValuation()}
                  className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold flex items-center justify-center gap-2"
                >
                  <Lock size={17} /> Cerrar valuación inicial
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'assets' && (
        <div className="space-y-5">
          {!valuationLocked && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-bold text-slate-900">
                  {assetEditingId ? 'Editar bien / pasivo' : 'Agregar bien / pasivo'}
                </h3>
                {assetEditingId && (
                  <button type="button" onClick={resetAssetForm} className="text-sm text-slate-500 hover:text-slate-800">
                    Cancelar edición
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Tipo</label>
                  <select value={assetType} onChange={(e) => setAssetType(e.target.value as SocietyAssetType)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white">
                    {Object.entries(assetTypeLabel).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="xl:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Descripción</label>
                  <input value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="Ej.: Aire acondicionado, mostrador, deuda proveedor..." className="w-full border border-slate-300 rounded-lg px-3 py-2.5" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Cantidad</label>
                  <input type="number" min="1" value={assetQuantity} onChange={(e) => setAssetQuantity(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Valor total acordado</label>
                  <input type="number" min="0" value={assetValue} onChange={(e) => setAssetValue(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" />
                </div>
                <div className="flex items-center gap-2 md:col-span-1 xl:col-span-1 pt-5">
                  <input id="asset-included" type="checkbox" checked={assetIncluded} onChange={(e) => setAssetIncluded(e.target.checked)} className="w-4 h-4" />
                  <label htmlFor="asset-included" className="text-sm font-semibold text-slate-700">Integra la sociedad</label>
                </div>
                {!assetIncluded && (
                  <div className="xl:col-span-2">
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Propietario particular</label>
                    <input value={assetOwner} onChange={(e) => setAssetOwner(e.target.value)} placeholder="Dueña original / nombre del propietario" className="w-full border border-slate-300 rounded-lg px-3 py-2.5" />
                  </div>
                )}
              </div>

              <div className="mt-3">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Observaciones</label>
                <input value={assetNotes} onChange={(e) => setAssetNotes(e.target.value)} placeholder={!assetIncluded ? 'Ej.: Puede ser retirado por su propietaria.' : 'Observaciones opcionales'} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" />
              </div>

              <div className="mt-4 flex justify-end">
                <button type="button" disabled={isSaving} onClick={() => void saveAsset()} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center gap-2">
                  {assetEditingId ? <Save size={17} /> : <Plus size={17} />}
                  {assetEditingId ? 'Guardar cambios' : 'Agregar'}
                </button>
              </div>
            </div>
          )}

          {valuationLocked && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800 text-sm flex gap-2">
              <Lock size={18} className="shrink-0" />
              Estos bienes forman parte de la foto inicial cerrada y ya no pueden editarse ni eliminarse.
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 font-bold text-slate-900">Bienes, activos y pasivos registrados</div>
            {assets.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">Todavía no hay bienes ni pasivos cargados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-4 py-3">Descripción</th>
                      <th className="text-left px-4 py-3">Tipo</th>
                      <th className="text-right px-4 py-3">Cant.</th>
                      <th className="text-right px-4 py-3">Valor</th>
                      <th className="text-left px-4 py-3">Sociedad</th>
                      <th className="text-left px-4 py-3">Propietario</th>
                      <th className="text-right px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assets.map((asset) => (
                      <tr key={asset.id} className={asset.includedInSociety ? '' : 'bg-amber-50/40'}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{asset.name}</div>
                          {asset.notes && <div className="text-xs text-slate-500 mt-1">{asset.notes}</div>}
                        </td>
                        <td className="px-4 py-3">{assetTypeLabel[asset.type]}</td>
                        <td className="px-4 py-3 text-right">{asset.quantity}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${asset.type === 'liability' ? 'text-red-700' : ''}`}>{money(asset.agreedValue)}</td>
                        <td className="px-4 py-3">
                          {asset.includedInSociety ? (
                            <span className="text-emerald-700 font-semibold">Sí</span>
                          ) : (
                            <span className="text-amber-700 font-semibold">No</span>
                          )}
                        </td>
                        <td className="px-4 py-3">{asset.includedInSociety ? 'Sociedad' : asset.ownerName || 'Particular'}</td>
                        <td className="px-4 py-3">
                          {!valuationLocked && (
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => editAsset(asset)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" title="Editar"><Edit2 size={16} /></button>
                              <button type="button" onClick={() => void deleteAsset(asset)} className="p-2 rounded-lg hover:bg-red-50 text-red-600" title="Eliminar"><Trash2 size={16} /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'partners' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users size={20} className="text-indigo-600" />
              <h3 className="font-bold text-slate-900">{partnerEditingId ? 'Editar socio' : 'Agregar socio / acuerdo'}</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="xl:col-span-2">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Nombre</label>
                <input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" placeholder="Nombre y apellido / Razón social" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Tipo</label>
                <select value={partnerKind} onChange={(e) => setPartnerKind(e.target.value as SocietyPartnerKind)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white">
                  <option value="original">Socio / dueño original</option>
                  <option value="incoming">Socio entrante</option>
                </select>
              </div>

              {partnerKind === 'original' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Peso de propiedad inicial %</label>
                  <input type="number" min="0" max="100" value={partnerInitialPct} onChange={(e) => setPartnerInitialPct(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Participación objetivo %</label>
                  <input type="number" min="0" max="100" value={partnerTargetPct} onChange={(e) => setPartnerTargetPct(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" />
                </div>
              )}
            </div>

            {partnerKind === 'incoming' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Aporte total acordado</label>
                  <input type="number" min="0" value={partnerRequired} onChange={(e) => setPartnerRequired(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" placeholder={societyValue > 0 ? `Ej.: ${Math.round(societyValue)}` : 'Importe acordado'} />
                  <div className="text-xs text-slate-500 mt-1">El importe puede diferir del valor societario según el acuerdo real.</div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Cantidad de cuotas</label>
                  <input type="number" min="1" max="120" value={partnerInstallments} onChange={(e) => setPartnerInstallments(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Primera cuota</label>
                  <input type="date" value={partnerFirstDueDate} onChange={(e) => setPartnerFirstDueDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" />
                </div>
              </div>
            )}

            <div className="mt-3">
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Observaciones del acuerdo</label>
              <input value={partnerNotes} onChange={(e) => setPartnerNotes(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" placeholder="Condiciones particulares, referencia al contrato, etc." />
            </div>

            {partnerKind === 'incoming' && Number(partnerRequired || 0) > 0 && (
              <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-xs font-bold text-slate-600 uppercase mb-2">Vista previa de cuotas</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                  {generateInstallmentPlan(
                    Number(partnerRequired || 0),
                    Number(partnerInstallments || 1),
                    fromDateInput(partnerFirstDueDate),
                  ).map((item) => (
                    <div key={item.id} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs">
                      <div className="font-semibold text-slate-700">Cuota {item.number}</div>
                      <div>{new Date(item.dueDate).toLocaleDateString('es-AR')} · {money(item.amount)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              {partnerEditingId && (
                <button type="button" onClick={resetPartnerForm} className="px-4 py-2.5 border border-slate-300 rounded-lg font-bold text-slate-700">Cancelar</button>
              )}
              <button type="button" disabled={isSaving} onClick={() => void savePartner()} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center gap-2">
                <Save size={17} /> Guardar socio
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {partners.length === 0 ? (
              <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-500">Todavía no hay socios cargados.</div>
            ) : (
              partners.map((partner) => {
                const row = participationRows.find((item) => item.id === partner.id);
                const hasContributions = contributions.some((item) => item.partnerId === partner.id);
                return (
                  <div key={partner.id} className="bg-white border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900 text-lg">{partner.name}</div>
                        <div className="text-xs text-slate-500 mt-1">{partner.kind === 'original' ? 'Socio / dueño original' : 'Socio entrante'}</div>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => editPartner(partner)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" title="Editar"><Edit2 size={16} /></button>
                        {!hasContributions && (
                          <button type="button" onClick={() => void deletePartner(partner)} className="p-2 rounded-lg hover:bg-red-50 text-red-600" title="Eliminar"><Trash2 size={16} /></button>
                        )}
                      </div>
                    </div>

                    {partner.kind === 'incoming' ? (
                      <div className="mt-4 space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-slate-500">Objetivo</span><b>{pct(Number(partner.targetPercentage || 0))}</b></div>
                        <div className="flex justify-between"><span className="text-slate-500">Aporte acordado</span><b>{money(Number(partner.requiredContribution || 0))}</b></div>
                        <div className="flex justify-between"><span className="text-slate-500">Aportado</span><b>{money(row?.paid || 0)}</b></div>
                        <div className="flex justify-between"><span className="text-slate-500">Participación efectiva</span><b className="text-indigo-700">{pct(row?.effective || 0)}</b></div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
                          <div className="h-full bg-indigo-600" style={{ width: `${Math.min(100, (row?.progress || 0) * 100)}%` }} />
                        </div>
                        <div className="text-xs text-slate-500">Integración del aporte: {pct((row?.progress || 0) * 100)}</div>
                      </div>
                    ) : (
                      <div className="mt-4 text-sm">
                        <div className="flex justify-between"><span className="text-slate-500">Peso inicial</span><b>{pct(Number(partner.initialOwnershipPercentage || 0))}</b></div>
                        <div className="flex justify-between mt-2"><span className="text-slate-500">Participación efectiva actual</span><b className="text-indigo-700">{pct(row?.effective || 0)}</b></div>
                      </div>
                    )}

                    {partner.notes && <div className="mt-3 text-xs text-slate-500 border-t border-slate-100 pt-3">{partner.notes}</div>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === 'contributions' && (
        <div className="space-y-5">
          {!valuationLocked && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm flex gap-2">
              <AlertTriangle size={18} className="shrink-0" />
              Primero cerrá la valuación inicial. Los aportes societarios se habilitan una vez congelado el valor base del acuerdo.
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wallet size={20} className="text-indigo-600" />
              <h3 className="font-bold text-slate-900">Registrar aporte / cuota</h3>
            </div>

            {incomingPartners.length === 0 ? (
              <div className="text-sm text-slate-500">Cargá primero al socio entrante y su aporte total acordado.</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Socio</label>
                    <select value={contributionPartnerId} onChange={(e) => setContributionPartnerId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white">
                      {incomingPartners.map((partner) => (
                        <option key={partner.id} value={partner.id}>{partner.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Importe</label>
                    <input type="number" min="0" value={contributionAmount} onChange={(e) => setContributionAmount(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" placeholder={selectedPending > 0 ? `Pendiente ${Math.round(selectedPending)}` : '0'} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Fecha</label>
                    <input type="date" value={contributionDate} onChange={(e) => setContributionDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Medio</label>
                    <select value={contributionMethod} onChange={(e) => setContributionMethod(e.target.value as SocietyContributionMethod)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white">
                      {Object.entries(contributionMethodLabel).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Comprobante (opcional)</label>
                    <input value={contributionReceipt} onChange={(e) => setContributionReceipt(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" placeholder="Número / referencia" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Observaciones</label>
                    <input value={contributionNotes} onChange={(e) => setContributionNotes(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" placeholder="Observación opcional" />
                  </div>
                </div>

                <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div><span className="text-slate-500">Acordado:</span> <b>{money(selectedRequired)}</b></div>
                  <div><span className="text-slate-500">Aportado:</span> <b>{money(selectedPaid)}</b></div>
                  <div><span className="text-slate-500">Pendiente:</span> <b>{money(selectedPending)}</b></div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button type="button" disabled={isSaving || !valuationLocked || selectedPending <= 0} onClick={() => void saveContribution()} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg font-bold flex items-center gap-2">
                    <Plus size={17} /> Registrar aporte
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 font-bold text-slate-900">Historial de aportes</div>
            {contributions.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">Todavía no hay aportes registrados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-4 py-3">Fecha</th>
                      <th className="text-left px-4 py-3">Socio</th>
                      <th className="text-right px-4 py-3">Importe</th>
                      <th className="text-left px-4 py-3">Medio</th>
                      <th className="text-left px-4 py-3">Comprobante</th>
                      <th className="text-left px-4 py-3">Registró</th>
                      <th className="text-right px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contributions.map((item) => (
                      <tr key={item.id} className={item.voided ? 'bg-red-50/40 text-slate-500' : ''}>
                        <td className="px-4 py-3">{new Date(item.date).toLocaleDateString('es-AR')}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{item.partnerName}</div>
                          {item.notes && <div className="text-xs text-slate-500 mt-1">{item.notes}</div>}
                          {item.voided && item.voidReason && <div className="text-xs text-red-600 mt-1">Anulado: {item.voidReason}</div>}
                        </td>
                        <td className="px-4 py-3 text-right font-bold">{money(item.amount)}</td>
                        <td className="px-4 py-3">{contributionMethodLabel[item.method] || item.method}</td>
                        <td className="px-4 py-3">{item.receiptNumber || '—'}</td>
                        <td className="px-4 py-3">{item.recordedByUserName}</td>
                        <td className="px-4 py-3 text-right">
                          {item.voided ? (
                            <span className="text-red-700 font-bold">ANULADO</span>
                          ) : (
                            <button type="button" onClick={() => void voidContribution(item)} className="text-red-600 hover:underline font-semibold">Anular</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SocietyManagement;
