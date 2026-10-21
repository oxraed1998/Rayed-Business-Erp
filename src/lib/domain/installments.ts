import { D, Decimal, money, type DecimalLike } from "@/lib/money";

export class InstallmentError extends Error {}

export function addMonths(date: Date, n: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return d;
}

/** Equal monthly installments; the last one absorbs the rounding difference. */
export function buildSchedule(total: DecimalLike, downPayment: DecimalLike, count: number, firstDue: Date) {
  const T = money(total), dp = money(downPayment);
  if (!Number.isInteger(count) || count < 1 || count > 360) throw new InstallmentError("عدد الأقساط يجب أن يكون بين 1 و 360");
  if (dp.isNegative() || dp.greaterThanOrEqualTo(T)) throw new InstallmentError("الدفعة المقدمة يجب أن تكون أقل من الإجمالي");
  const financed = T.minus(dp);
  const each = financed.div(count).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  return Array.from({ length: count }, (_, i) => ({
    seq: i + 1,
    dueDate: addMonths(firstDue, i),
    amount: i === count - 1 ? financed.minus(each.times(count - 1)) : each,
  }));
}

export function installmentStatus(i: { amount: DecimalLike; paidAmount: DecimalLike; dueDate: Date }, today = new Date()) {
  const remaining = D(i.amount).minus(D(i.paidAmount));
  if (!remaining.gt(0)) return "PAID" as const;
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (i.dueDate < t) return "OVERDUE" as const;
  return D(i.paidAmount).gt(0) ? ("PARTIAL" as const) : ("DUE" as const);
}

/** Applies a payment to installments oldest-first; returns per-installment amounts and any excess. */
export function allocateToInstallments(
  installments: { id: string; amount: DecimalLike; paidAmount: DecimalLike }[],
  payment: DecimalLike,
) {
  let left = money(payment);
  const applied: { id: string; amount: Decimal }[] = [];
  for (const i of installments) {
    if (!left.gt(0)) break;
    const open = D(i.amount).minus(D(i.paidAmount));
    if (!open.gt(0)) continue;
    const take = Decimal.min(open, left);
    applied.push({ id: i.id, amount: take });
    left = left.minus(take);
  }
  return { applied, excess: left };
}
