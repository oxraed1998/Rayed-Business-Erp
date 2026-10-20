import Decimal from "decimal.js";

// All monetary arithmetic goes through decimal.js — never JS floats.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export type DecimalLike = Decimal.Value | { toString(): string };

export const D = (v: DecimalLike | null | undefined): Decimal =>
  v === null || v === undefined || v === "" ? new Decimal(0) : new Decimal(v.toString());

/** Round to 2 decimal places (halala). */
export const money = (v: DecimalLike): Decimal => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export const sum = (values: DecimalLike[]): Decimal => values.reduce<Decimal>((a, v) => a.plus(D(v)), new Decimal(0));

/** Fixed string with 2 decimals for persistence (Prisma accepts decimal strings). */
export const toDb = (v: DecimalLike): string => money(v).toFixed(2);

export function formatMoney(v: DecimalLike, currency = "SAR", locale = "ar-SA"): string {
  const n = money(v);
  const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    numberingSystem: "latn",
  }).format(Number(n.toFixed(2)));
  return `${formatted} ${currencyLabel(currency)}`;
}

export function currencyLabel(code: string): string {
  return ({ SAR: "ر.س", USD: "$", EUR: "€", AED: "د.إ", KRW: "₩", CNY: "¥", JPY: "¥", GBP: "£" } as Record<string, string>)[code] ?? code;
}

export const CURRENCIES = ["SAR", "USD", "EUR", "AED", "KRW", "CNY", "JPY", "GBP", "AUD", "TRY", "SDG"] as const;

/**
 * Split `total` into parts proportional to `weights`, rounded to cents, so the parts
 * sum exactly to `total`. Rounding remainders go to the largest fractional parts
 * (largest-remainder method), ties broken by order.
 */
export function allocateProportionally(total: DecimalLike, weights: DecimalLike[]): Decimal[] {
  const T = money(total);
  const W = weights.map(D);
  const wSum = sum(W);
  if (W.length === 0) return [];
  if (wSum.isZero()) {
    // Equal split when no weights are available.
    return allocateProportionally(T, W.map(() => 1));
  }
  const cents = T.times(100);
  const raw = W.map((w) => cents.times(w).div(wSum));
  const floors = raw.map((r) => (cents.isNegative() ? r.ceil() : r.floor()));
  let remainder = cents.minus(sum(floors)).toNumber();
  const order = raw
    .map((r, i) => ({ i, frac: r.minus(floors[i]).abs() }))
    .sort((a, b) => b.frac.comparedTo(a.frac) || a.i - b.i);
  const step = remainder >= 0 ? 1 : -1;
  for (let k = 0; remainder !== 0; k = (k + 1) % order.length) {
    floors[order[k].i] = floors[order[k].i].plus(step);
    remainder -= step;
  }
  return floors.map((c) => c.div(100));
}
