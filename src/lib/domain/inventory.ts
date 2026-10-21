import { D, Decimal, money, type DecimalLike } from "@/lib/money";

export interface StockState {
  quantity: Decimal;
  value: Decimal;
}

export class InventoryError extends Error {}

export const avgCost = (s: StockState) => (s.quantity.isZero() ? new Decimal(0) : s.value.div(s.quantity));

/** Receive stock at a known total cost (purchase, return-in at cost, transfer-in). */
export function receive(s: StockState, qty: DecimalLike, totalCost: DecimalLike): StockState {
  const q = D(qty);
  if (!q.gt(0)) throw new InventoryError("الكمية يجب أن تكون أكبر من صفر");
  return { quantity: s.quantity.plus(q), value: money(s.value.plus(D(totalCost))) };
}

/**
 * Issue stock at weighted-average cost. Returns the cost removed. Issuing the full
 * quantity removes the full value so no rounding residue stays in stock.
 */
export function issue(s: StockState, qty: DecimalLike): { state: StockState; cost: Decimal } {
  const q = D(qty);
  if (!q.gt(0)) throw new InventoryError("الكمية يجب أن تكون أكبر من صفر");
  if (q.greaterThan(s.quantity)) throw new InventoryError(`الكمية المطلوبة (${q}) أكبر من المتوفر (${s.quantity})`);
  const cost = q.equals(s.quantity) ? s.value : money(avgCost(s).times(q));
  return { state: { quantity: s.quantity.minus(q), value: money(s.value.minus(cost)) }, cost };
}

/** Capitalise an additional landed cost into stock already on hand. */
export function addCost(s: StockState, amount: DecimalLike): StockState {
  if (s.quantity.isZero()) throw new InventoryError("لا يمكن تحميل تكلفة على صنف رصيده صفر");
  return { quantity: s.quantity, value: money(s.value.plus(D(amount))) };
}

export const isLowStock = (qty: DecimalLike, reorderLevel: number) => reorderLevel > 0 && D(qty).lessThanOrEqualTo(reorderLevel);

export const MOVEMENT_LABELS = {
  PURCHASE: "شراء",
  SALE: "بيع",
  RETURN_IN: "مرتجع مبيعات",
  RETURN_OUT: "مرتجع مشتريات",
  ADJUSTMENT: "تسوية",
  TRANSFER_IN: "تحويل وارد",
  TRANSFER_OUT: "تحويل صادر",
  LANDED_COST: "تكلفة إضافية",
} as const;
