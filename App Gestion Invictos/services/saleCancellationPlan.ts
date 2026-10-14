import { Sale } from '../types';

export type CancellationStockMode = 'automatic' | 'already_correct';

// Se permite cancelar devoluciones puras de esta venta, nunca otra compra real.
export const cancellationBlockReason = (sale: Sale, linkedSales: Sale[] = []): string => {
  if (sale.checkoutReturns?.length || sale.operationType === 'sale_with_return' || sale.operationType === 'return_only') {
    return 'Esta es una operación de devolución de Caja. Abrí Anular venta desde la venta original para revisar y anular ambos registros juntos.';
  }
  const posAdjustments = (sale.adjustments || []).filter(item => String(item.id).startsWith('pos-'));
  const matched = new Set<string>();
  const relatedIds = new Set<string>();
  for (const linked of linkedSales) {
    if (!linked.id || linked.id === sale.id || relatedIds.has(linked.id)) return 'Vínculo de devolución inválido o repetido.';
    relatedIds.add(linked.id);
    if (linked.cancellation || linked.operationType !== 'return_only' || !Array.isArray(linked.items) || linked.items.length ||
        Number(linked.total) !== 0 || linked.receivable || linked.adjustments?.length || !linked.checkoutReturns?.length) {
      return `La operación ${linked.id} contiene una compra, otros ajustes o datos incompatibles. No se anulará otra venta automáticamente.`;
    }
    for (const credit of linked.checkoutReturns) {
      if (credit.origin !== 'registered' || credit.originalSaleId !== sale.id) return `La devolución ${linked.id} incluye otras ventas. Requiere revisar esos vínculos.`;
      const adjustment = posAdjustments.find(item => item.id === `pos-${credit.id}`);
      if (!adjustment || matched.has(adjustment.id)) return 'No coincide el vínculo entre la venta y su devolución de Caja.';
      const original = adjustment.returnedItem;
      const returned = credit.returnedItem;
      if (!original || !returned || original.productId !== returned.productId ||
          Number(original.quantity) !== Number(returned.quantity) ||
          Boolean(original.returnToStock) !== Boolean(returned.returnToStock) ||
          Math.abs(Number(original.totalAmount) - Number(returned.totalAmount)) > 0.01 ||
          !Number.isFinite(Number(original.totalAmount)) || !Number.isFinite(Number(returned.totalAmount))) {
        return 'Los productos o importes de la devolución no coinciden con la venta original.';
      }
      matched.add(adjustment.id);
    }
  }
  if (posAdjustments.some(item => !matched.has(item.id))) {
    return 'No se encontró una devolución pura de Caja para todos los créditos vinculados. No se modificó ningún registro.';
  }
  return '';
};

export const cancellationSignature = (sale: Sale): string => JSON.stringify([
  sale.items, sale.adjustments || [], sale.checkoutReturns || [],
  !!sale.commissionPaid, sale.commissionPaidDate || null,
  sale.receivable || null, sale.operationType || null,
  sale.total, sale.settlementTotal, sale.settlementDirection, sale.payments, sale.refundMethod, sale.refundReceiptNumber, sale.cancellation || null,
]);

export const cancellationStockPlan = (sale: Sale, linkedSales: Sale[] = []): Array<{ productId: string; productName: string; quantity: number }> => {
  const block = cancellationBlockReason(sale, linkedSales);
  if (block) throw new Error(block);
  if (!Array.isArray(sale.items) || !sale.items.length) throw new Error('La operación no contiene productos válidos.');
  const result = new Map<string, { productId: string; productName: string; quantity: number }>();
  const add = (id: string, name: string, amount: number, sign = 1) => {
    const qty = Number(amount);
    if (!id || !Number.isInteger(qty) || qty <= 0) throw new Error('La operación tiene productos o cantidades inválidas.');
    const previous = result.get(id);
    result.set(id, { productId: id, productName: name || id, quantity: (previous?.quantity || 0) + sign * qty });
  };
  for (const item of sale.items) add(item.productId, item.productName, item.quantity);
  for (const adjustment of sale.adjustments || []) {
    if (!adjustment.returnedItem) throw new Error('Una devolución no tiene detalle válido.');
    const returned = adjustment.returnedItem;
    // Solo se descuenta lo que efectivamente reingresó al inventario.
    if (returned.returnToStock) add(returned.productId, returned.productName, returned.quantity, -1);
    if (adjustment.replacementItem) {
      const replacement = adjustment.replacementItem;
      add(replacement.productId, replacement.productName, replacement.quantity);
    }
  }
  const rows = [...result.values()];
  if (rows.some(item => item.quantity < 0)) throw new Error('Las devoluciones superan las salidas registradas de un producto. Revisá sus movimientos antes de anular.');
  return rows.filter(item => item.quantity > 0);
};
