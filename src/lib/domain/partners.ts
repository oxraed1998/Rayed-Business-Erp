import { allocateProportionally, D, Decimal, sum, type DecimalLike } from "@/lib/money";

export interface ShareInput {
  partnerId: string;
  capitalAmount: DecimalLike;
  /** 0..100, or null to follow the capital ratio. */
  profitSharePct?: DecimalLike | null;
  lossSharePct?: DecimalLike | null;
}

export class PartnerError extends Error {}

function ratios(shares: ShareInput[], kind: "profit" | "loss"): Decimal[] {
  const explicit = shares.map((s) => (kind === "profit" ? s.profitSharePct : s.lossSharePct ?? s.profitSharePct));
  const allExplicit = explicit.every((p) => p !== null && p !== undefined && p !== "");
  const noneExplicit = explicit.every((p) => p === null || p === undefined || p === "");
  if (!allExplicit && !noneExplicit) throw new PartnerError("يجب تحديد نسبة الربح لجميع الشركاء أو تركها لجميعهم لتتبع رأس المال");
  if (allExplicit) {
    const pcts = explicit.map((p) => D(p as DecimalLike));
    const total = sum(pcts);
    if (!total.equals(100)) throw new PartnerError(`مجموع النسب يجب أن يساوي 100% (الحالي ${total.toFixed(2)}%)`);
    return pcts;
  }
  const caps = shares.map((s) => D(s.capitalAmount));
  if (sum(caps).isZero()) throw new PartnerError("لا يوجد رأس مال لحساب النسب");
  return caps;
}

/** Ownership percentage by capital contributed. */
export function capitalOwnership(shares: ShareInput[]) {
  const total = sum(shares.map((s) => D(s.capitalAmount)));
  return shares.map((s) => ({
    partnerId: s.partnerId,
    pct: total.isZero() ? new Decimal(0) : D(s.capitalAmount).div(total).times(100).toDecimalPlaces(4),
  }));
}

/**
 * Splits a profit (positive) or loss (negative) between partners. Profit uses the
 * profit-sharing ratio; a loss uses the loss ratio (falling back to the profit ratio,
 * then capital). Parts always sum exactly to the input amount.
 */
export function distribute(shares: ShareInput[], amount: DecimalLike) {
  if (!shares.length) throw new PartnerError("لا يوجد شركاء في الاتفاقية");
  const a = D(amount);
  const parts = allocateProportionally(a, ratios(shares, a.isNegative() ? "loss" : "profit"));
  return shares.map((s, i) => ({ partnerId: s.partnerId, amount: parts[i] }));
}

/** Partner balance = contributions + profit share − withdrawals − distributions paid − losses. */
export function partnerBalance(txns: { type: string; amount: DecimalLike }[]) {
  let capital = new Decimal(0), withdrawn = new Decimal(0), distributed = new Decimal(0), losses = new Decimal(0);
  for (const t of txns) {
    const v = D(t.amount);
    if (t.type === "CONTRIBUTION") capital = capital.plus(v);
    else if (t.type === "WITHDRAWAL") withdrawn = withdrawn.plus(v);
    else if (t.type === "PROFIT_DISTRIBUTION") distributed = distributed.plus(v);
    else if (t.type === "LOSS_ALLOCATION") losses = losses.plus(v);
  }
  return { capital, withdrawn, distributed, losses, net: capital.plus(distributed).minus(withdrawn).minus(losses) };
}
