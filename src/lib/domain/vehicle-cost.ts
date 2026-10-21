import { D, money, sum, type DecimalLike } from "@/lib/money";

export interface CostLine {
  amount: DecimalLike;
  vatAmount?: DecimalLike;
  vatRecoverable?: boolean;
}

/**
 * Cost of a single expense line to capitalise into inventory.
 * Recoverable input VAT is a receivable from ZATCA, not a cost; only
 * non-recoverable VAT increases the landed cost.
 */
export const capitalisedCost = (l: CostLine) =>
  money(D(l.amount).plus(l.vatRecoverable === false ? D(l.vatAmount) : 0));

export interface VehicleCostInput {
  purchasePrice: DecimalLike;
  exchangeRate: DecimalLike;
  expenses: (CostLine & { category: string })[];
  sellingPrice?: DecimalLike | null;
}

export function vehicleCost(v: VehicleCostInput) {
  const purchaseBase = money(D(v.purchasePrice).times(D(v.exchangeRate)));
  const byCategory: Record<string, string> = {};
  for (const e of v.expenses) byCategory[e.category] = D(byCategory[e.category] ?? 0).plus(capitalisedCost(e)).toFixed(2);
  const expensesTotal = sum(v.expenses.map(capitalisedCost));
  const recoverableVat = sum(v.expenses.filter((e) => e.vatRecoverable !== false).map((e) => D(e.vatAmount)));
  const landedCost = money(purchaseBase.plus(expensesTotal));
  const selling = v.sellingPrice === null || v.sellingPrice === undefined ? null : money(v.sellingPrice);
  const profit = selling ? selling.minus(landedCost) : null;
  const marginPct = selling && !selling.isZero() && profit ? profit.div(selling).times(100).toDecimalPlaces(2) : null;
  return { purchaseBase, expensesTotal, recoverableVat, landedCost, byCategory, profit, marginPct };
}

export const VEHICLE_EXPENSE_CATEGORIES: Record<string, string> = {
  SHIPPING: "الشحن",
  CUSTOMS_DUTY: "الرسوم الجمركية",
  CLEARANCE: "التخليص الجمركي",
  INSPECTION: "الفحص",
  TRANSPORT: "النقل",
  REPAIR: "الإصلاح",
  MAINTENANCE: "الصيانة",
  REGISTRATION: "التسجيل واللوحات",
  OTHER: "مصروفات أخرى",
  SHIPMENT_ALLOCATION: "حصة من مصاريف الشحنة",
};

export const VEHICLE_STATUS_LABELS = {
  PURCHASED: "تم الشراء",
  IN_TRANSIT: "في الطريق",
  CUSTOMS: "في الجمارك",
  IN_STOCK: "في المخزون",
  RESERVED: "محجوزة",
  SOLD: "مباعة",
  CANCELLED: "ملغاة",
} as const;

/** Allowed status transitions; SOLD/CANCELLED are terminal and handled by dedicated actions. */
export const VEHICLE_TRANSITIONS: Record<string, string[]> = {
  PURCHASED: ["IN_TRANSIT", "CUSTOMS", "IN_STOCK", "CANCELLED"],
  IN_TRANSIT: ["CUSTOMS", "IN_STOCK", "CANCELLED"],
  CUSTOMS: ["IN_STOCK", "CANCELLED"],
  IN_STOCK: ["RESERVED", "CANCELLED"],
  RESERVED: ["IN_STOCK"],
  SOLD: [],
  CANCELLED: [],
};
