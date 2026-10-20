import { describe, expect, it } from "vitest";
import { compactLines, validateLines } from "@/lib/accounting/journal";
import { balanceSheet, incomeStatement, trialBalance, type AccountBalance } from "@/lib/accounting/reports";
import { D } from "@/lib/money";
import type { Account, AccountType } from "@prisma/client";

describe("journal validation", () => {
  it("accepts balanced entries", () => {
    const r = validateLines([{ accountId: "a", debit: "100.10" }, { accountId: "b", credit: "60.05" }, { accountId: "c", credit: "40.05" }]);
    expect(r.total.toFixed(2)).toBe("100.10");
  });
  it("rejects unbalanced entries", () => {
    expect(() => validateLines([{ accountId: "a", debit: 100 }, { accountId: "b", credit: 99.99 }])).toThrow(/غير متوازن/);
  });
  it("rejects a line with both sides or negatives", () => {
    expect(() => validateLines([{ accountId: "a", debit: 10, credit: 10 }, { accountId: "b", credit: 0 }])).toThrow();
    expect(() => validateLines([{ accountId: "a", debit: -10 }, { accountId: "b", credit: -10 }])).toThrow(/سالبة/);
  });
  it("rejects single-line or zero entries", () => {
    expect(() => validateLines([{ accountId: "a", debit: 0 }, { accountId: "b", credit: 0 }])).toThrow();
  });
  it("compacts duplicate lines", () => {
    const c = compactLines([{ accountId: "a", debit: 10 }, { accountId: "a", debit: 5 }, { accountId: "b", credit: 15 }]);
    expect(c).toHaveLength(2);
    expect(D(c[0].debit).toFixed(2)).toBe("15.00");
  });
});

const acc = (id: string, type: AccountType, systemKey: string | null = null) => ({ id, type, systemKey, code: id, name: id }) as Account;
const bal = (a: Account, debit: number, credit: number): AccountBalance => {
  const dn = a.type === "ASSET" || a.type === "EXPENSE";
  return { account: a, debit: D(debit), credit: D(credit), balance: dn ? D(debit - credit) : D(credit - debit) };
};

describe("financial statements", () => {
  // Capital 60,000 in cash; bought a car for 40,000; sold for 52,000 on credit; paid 2,000 rent.
  const rows = [
    bal(acc("cash", "ASSET"), 60000, 42000),
    bal(acc("ar", "ASSET"), 52000, 0),
    bal(acc("inv", "ASSET"), 40000, 40000),
    bal(acc("cap", "EQUITY"), 0, 60000),
    bal(acc("sales", "REVENUE", "SALES_VEHICLES"), 0, 52000),
    bal(acc("cogs", "EXPENSE", "COGS_VEHICLES"), 40000, 0),
    bal(acc("rent", "EXPENSE", "RENT"), 2000, 0),
  ];
  it("trial balance balances", () => {
    const tb = trialBalance(rows);
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit.toFixed(2)).toBe("112000.00");
  });
  it("income statement", () => {
    const is = incomeStatement(rows);
    expect(is.grossProfit.toFixed(2)).toBe("12000.00");
    expect(is.netProfit.toFixed(2)).toBe("10000.00");
  });
  it("balance sheet balances with current profit in equity", () => {
    const bs = balanceSheet(rows);
    expect(bs.totalAssets.toFixed(2)).toBe("70000.00");
    expect(bs.totalEquity.toFixed(2)).toBe("70000.00");
    expect(bs.balanced).toBe(true);
  });
});
