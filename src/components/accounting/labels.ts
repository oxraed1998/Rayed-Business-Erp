export const JOURNAL_STATUS_LABELS = { DRAFT: "مسودة", POSTED: "مرحّل", REVERSED: "معكوس" } as const;

export const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "قيد يدوي",
  INVOICE: "فاتورة",
  PAYMENT: "سند قبض/صرف",
  REVERSAL: "قيد عكسي",
  PERIOD_CLOSE: "قيد إقفال",
  PARTNER: "شركاء",
  VEHICLE_PURCHASE: "شراء سيارة",
  VEHICLE_EXPENSE: "مصروف سيارة",
  VEHICLE_SALE: "تكلفة بيع سيارة",
  SHIPMENT_EXPENSE: "مصروف شحنة",
  SHIPMENT_ALLOCATION: "توزيع مصاريف شحنة",
  HERD_PURCHASE: "شراء مواشي",
  HERD_EXPENSE: "مصروف مواشي",
  HERD_DEATH: "نفوق",
  HERD_SALE: "تكلفة بيع مواشي",
  STOCK_PURCHASE: "شراء مخزون",
  STOCK_SALE: "تكلفة مبيعات مخزون",
  STOCK_RETURN: "مرتجع مخزون",
  STOCK_ADJUSTMENT: "تسوية مخزون",
};
