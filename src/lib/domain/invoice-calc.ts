import { D, money, sum, type DecimalLike } from "@/lib/money";

export interface InvoiceLineInput {
  description: string;
  quantity: DecimalLike;
  unitPrice: DecimalLike;
  discount?: DecimalLike;
  vatRate?: DecimalLike;
}

export class InvoiceCalcError extends Error {}

/** Per-line VAT rounding (ZATCA calculates VAT per line, rounded to 2 decimals). */
export function calcLine(l: InvoiceLineInput) {
  const qty = D(l.quantity);
  const price = D(l.unitPrice);
  const discount = money(l.discount ?? 0);
  const rate = D(l.vatRate ?? 15);
  if (qty.lessThanOrEqualTo(0)) throw new InvoiceCalcError("الكمية يجب أن تكون أكبر من صفر");
  if (price.isNegative()) throw new InvoiceCalcError("سعر الوحدة لا يمكن أن يكون سالبًا");
  if (rate.isNegative() || rate.greaterThan(100)) throw new InvoiceCalcError("نسبة الضريبة غير صالحة");
  const gross = money(qty.times(price));
  if (discount.isNegative() || discount.greaterThan(gross)) throw new InvoiceCalcError("الخصم غير صالح");
  const net = gross.minus(discount);
  const vat = money(net.times(rate).div(100));
  return { gross, discount, net, vat, total: net.plus(vat), rate };
}

export function calcInvoice(lines: InvoiceLineInput[]) {
  if (!lines.length) throw new InvoiceCalcError("الفاتورة تحتاج بندًا واحدًا على الأقل");
  const calc = lines.map(calcLine);
  const subtotal = sum(calc.map((c) => c.gross));
  const discountTotal = sum(calc.map((c) => c.discount));
  const vatTotal = sum(calc.map((c) => c.vat));
  const netTotal = sum(calc.map((c) => c.net));
  return { lines: calc, subtotal, discountTotal, netTotal, vatTotal, total: netTotal.plus(vatTotal) };
}

export function paymentStatus(total: DecimalLike, paid: DecimalLike, dueDate?: Date | null, today = new Date()) {
  const t = D(total), p = D(paid);
  if (p.greaterThanOrEqualTo(t) && t.gt(0)) return "PAID" as const;
  if (dueDate && dueDate < startOfDay(today)) return "OVERDUE" as const;
  return p.gt(0) ? ("PARTIAL" as const) : ("UNPAID" as const);
}

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export const PAYMENT_STATUS_LABELS = { PAID: "مدفوعة", PARTIAL: "مدفوعة جزئيًا", UNPAID: "غير مدفوعة", OVERDUE: "متأخرة" } as const;

export const INVOICE_TYPE_LABELS = {
  SALES: "فاتورة مبيعات",
  PURCHASE: "فاتورة مشتريات",
  CREDIT_NOTE: "إشعار دائن",
  DEBIT_NOTE: "إشعار مدين",
  ADVANCE: "فاتورة دفعة مقدمة",
} as const;
