import type { AllocationMethod } from "@prisma/client";
import { allocateProportionally, D, type DecimalLike, Decimal } from "@/lib/money";

export interface AllocationItem {
  id: string;
  quantity?: DecimalLike;
  value?: DecimalLike;
  weight?: DecimalLike;
  volume?: DecimalLike;
}

export class AllocationError extends Error {}

/**
 * Distributes a shared cost (shipping, customs, ...) across shipment items using the
 * selected landed-cost method. The parts always sum exactly to `total`.
 */
export function allocateLandedCost(total: DecimalLike, items: AllocationItem[], method: AllocationMethod): Map<string, Decimal> {
  if (!items.length) throw new AllocationError("لا توجد بنود في الشحنة لتوزيع التكلفة عليها");
  const weightOf = (i: AllocationItem) => {
    switch (method) {
      case "QUANTITY": return D(i.quantity);
      case "VALUE": return D(i.value);
      case "WEIGHT": return D(i.weight);
      case "VOLUME": return D(i.volume);
    }
  };
  const weights = items.map(weightOf);
  if (weights.some((w) => w.isNegative())) throw new AllocationError("قيم التوزيع لا يمكن أن تكون سالبة");
  if (weights.every((w) => w.isZero()) && method !== "QUANTITY") {
    throw new AllocationError("لا توجد قيم (وزن/حجم/قيمة) لبنود الشحنة لهذه الطريقة");
  }
  const parts = allocateProportionally(total, weights);
  return new Map(items.map((i, idx) => [i.id, parts[idx]]));
}

export const ALLOCATION_LABELS: Record<AllocationMethod, string> = {
  QUANTITY: "حسب الكمية",
  VALUE: "حسب قيمة الشراء",
  WEIGHT: "حسب الوزن",
  VOLUME: "حسب الحجم",
};
