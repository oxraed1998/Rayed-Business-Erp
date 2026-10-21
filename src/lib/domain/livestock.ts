import type { HerdEventType } from "@prisma/client";
import { D, Decimal, money, sum, type DecimalLike } from "@/lib/money";
import { capitalisedCost, type CostLine } from "./vehicle-cost";

export interface HerdEventLike {
  type: HerdEventType;
  quantity: number;
  amount: DecimalLike;
  costRemoved: DecimalLike;
}

export class LivestockError extends Error {}

/**
 * Herd valuation using the weighted-average cost method.
 * Cost pool = acquisition + capitalised care costs − cost already removed by sales/deaths.
 * Each expense is counted exactly once: it enters the pool when recorded and leaves only
 * through the frozen `costRemoved` of later sale/death events.
 */
export function herdSummary(events: HerdEventLike[], expenses: CostLine[]) {
  const count = (t: HerdEventType) => events.filter((e) => e.type === t).reduce((a, e) => a + e.quantity, 0);
  const purchased = count("PURCHASE");
  const born = count("BIRTH");
  const sold = count("SALE");
  const deceased = count("DEATH");
  const remaining = purchased + born - sold - deceased;

  const acquisitionCost = sum(events.filter((e) => e.type === "PURCHASE").map((e) => D(e.amount)));
  const careCost = sum(expenses.map(capitalisedCost));
  const costRemoved = sum(events.filter((e) => e.type === "SALE" || e.type === "DEATH").map((e) => D(e.costRemoved)));
  const saleRevenue = sum(events.filter((e) => e.type === "SALE").map((e) => D(e.amount)));
  const soldCost = sum(events.filter((e) => e.type === "SALE").map((e) => D(e.costRemoved)));
  const mortalityCost = sum(events.filter((e) => e.type === "DEATH").map((e) => D(e.costRemoved)));

  const valuation = money(acquisitionCost.plus(careCost).minus(costRemoved));
  const costPerHead = remaining > 0 ? valuation.div(remaining).toDecimalPlaces(2) : new Decimal(0);
  return {
    purchased, born, sold, deceased, remaining,
    acquisitionCost, careCost, valuation, costPerHead,
    saleRevenue, soldCost, mortalityCost,
    realizedProfit: saleRevenue.minus(soldCost),
  };
}

/** Cost leaving the herd when `quantity` animals are sold or die. The last animal takes the full residual. */
export function costOfRemoval(summary: { remaining: number; valuation: Decimal }, quantity: number): Decimal {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new LivestockError("الكمية يجب أن تكون عددًا صحيحًا موجبًا");
  if (quantity > summary.remaining) throw new LivestockError(`الكمية (${quantity}) أكبر من المتبقي في القطيع (${summary.remaining})`);
  if (quantity === summary.remaining) return summary.valuation;
  return money(summary.valuation.times(quantity).div(summary.remaining));
}

export const LIVESTOCK_EXPENSE_CATEGORIES: Record<string, string> = {
  FEED: "الأعلاف",
  VETERINARY: "الرعاية البيطرية",
  VACCINATION: "التطعيمات",
  LABOR: "العمالة",
  HOUSING: "الحظائر والسكن",
  SHIPPING: "الشحن",
  CUSTOMS: "الجمارك",
  TRANSPORT: "النقل",
  OTHER: "أخرى",
};

export const HERD_EVENT_LABELS: Record<HerdEventType, string> = {
  PURCHASE: "شراء / استيراد",
  BIRTH: "ولادة",
  SALE: "بيع",
  DEATH: "نفوق",
  WEIGHING: "وزن",
  VACCINATION: "تطعيم",
};
