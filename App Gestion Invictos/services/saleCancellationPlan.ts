import { Sale } from '../types';

export type CancellationStockMode = 'automatic' | 'already_correct';

// Solo las devoluciones propias se pueden compensar sin alterar otra venta real.
export const cancellationBlockReason = (sale: Sale): string => {
  if (sale.checkoutReturns?.length || sale.operationType === 'sale_with_return' || sale.operationType === 'return_only') {
    return 'Esta operación aplica créditos de devolución de otras ventas en Caja. Hay que desvincular esos créditos antes de anularla; no se modificará otra venta automáticamente.';
  }
  if (sale.adjustments?.some(item => String(item.id).startsWith('pos-'))) {
    return 'Esta venta tiene una devolución utilizada como crédito en otra operación de Caja. Hay que revisar esa operación vinculada antes de anularla.';
  }
  return '';
};

export const cancellationSignature = (sale: Sale): string => JSON.stringify([
  sale.items, sale.adjustments || [], sale.checkoutReturns || [],
  !!sale.commissionPaid, sale.commissionPaidDate || null,
  sale.receivable || null, sale.operationType || null,
]);

export const cancellationStockPlan = (sale: Sale): Array<{ productId: string; productName: string; quantity: number }> => {
  const block = cancellationBlockReason(sale);
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
