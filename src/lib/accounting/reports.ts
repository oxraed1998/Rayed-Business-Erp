import type { Account, AccountType } from "@prisma/client";
import { db } from "@/lib/db";
import { D, Decimal, sum } from "@/lib/money";
import { isDebitNormal } from "./chart";

// REVERSED entries stay in the ledger: they are offset by their reversal entry.
export const POSTED_STATUSES = ["POSTED", "REVERSED"] as const;

export interface BalanceFilter {
  tenantId: string;
  companyId: string;
  from?: Date;
  to?: Date;
  activityId?: string;
}

export interface AccountBalance {
  account: Account;
  debit: Decimal;
  credit: Decimal;
  /** Balance on the account's normal side (positive = normal). */
  balance: Decimal;
}

export async function accountBalances(f: BalanceFilter): Promise<AccountBalance[]> {
  const [accounts, grouped] = await Promise.all([
    db.account.findMany({ where: { tenantId: f.tenantId, companyId: f.companyId }, orderBy: { code: "asc" } }),
    db.journalLine.groupBy({
      by: ["accountId"],
      where: {
        tenantId: f.tenantId,
        ...(f.activityId ? { activityId: f.activityId } : {}),
        entry: {
          companyId: f.companyId,
          status: { in: [...POSTED_STATUSES] },
          date: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) },
        },
      },
      _sum: { debit: true, credit: true },
    }),
  ]);
  const byId = new Map(grouped.map((g) => [g.accountId, g._sum]));
  return accounts.map((account) => {
    const s = byId.get(account.id);
    const debit = D(s?.debit ?? 0);
    const credit = D(s?.credit ?? 0);
    const balance = isDebitNormal(account.type) ? debit.minus(credit) : credit.minus(debit);
    return { account, debit, credit, balance };
  });
}

export function trialBalance(rows: AccountBalance[]) {
  const lines = rows
    .filter((r) => !r.debit.isZero() || !r.credit.isZero())
    .map((r) => {
      const net = r.debit.minus(r.credit);
      return { ...r, debitBalance: net.gt(0) ? net : new Decimal(0), creditBalance: net.isNegative() ? net.neg() : new Decimal(0) };
    });
  const totalDebit = sum(lines.map((l) => l.debitBalance));
  const totalCredit = sum(lines.map((l) => l.creditBalance));
  return { lines, totalDebit, totalCredit, balanced: totalDebit.equals(totalCredit) };
}

const byType = (rows: AccountBalance[], t: AccountType) => rows.filter((r) => r.account.type === t && !r.balance.isZero());

export function incomeStatement(rows: AccountBalance[]) {
  const revenue = byType(rows, "REVENUE");
  const expenses = byType(rows, "EXPENSE");
  const cogs = expenses.filter((r) => r.account.systemKey?.startsWith("COGS_"));
  const opex = expenses.filter((r) => !r.account.systemKey?.startsWith("COGS_"));
  const totalRevenue = sum(revenue.map((r) => r.balance));
  const totalCogs = sum(cogs.map((r) => r.balance));
  const totalOpex = sum(opex.map((r) => r.balance));
  const grossProfit = totalRevenue.minus(totalCogs);
  return { revenue, cogs, opex, totalRevenue, totalCogs, totalOpex, grossProfit, netProfit: grossProfit.minus(totalOpex) };
}

/** Balance sheet as of `to`: current-year profit is shown inside equity until closed. */
export function balanceSheet(rows: AccountBalance[]) {
  const assets = byType(rows, "ASSET");
  const liabilities = byType(rows, "LIABILITY");
  const equity = byType(rows, "EQUITY");
  const { netProfit } = incomeStatement(rows);
  const totalAssets = sum(assets.map((r) => r.balance));
  const totalLiabilities = sum(liabilities.map((r) => r.balance));
  const totalEquity = sum(equity.map((r) => r.balance)).plus(netProfit);
  return {
    assets, liabilities, equity, netProfit, totalAssets, totalLiabilities, totalEquity,
    balanced: totalAssets.equals(totalLiabilities.plus(totalEquity)),
  };
}

export async function generalLedger(f: BalanceFilter & { accountId: string }) {
  const lines = await db.journalLine.findMany({
    where: {
      tenantId: f.tenantId,
      accountId: f.accountId,
      entry: {
        companyId: f.companyId,
        status: { in: [...POSTED_STATUSES] },
        date: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) },
      },
    },
    include: { entry: true },
    orderBy: [{ entry: { date: "asc" } }, { entry: { number: "asc" } }],
    take: 2000,
  });
  const account = await db.account.findFirstOrThrow({ where: { id: f.accountId, tenantId: f.tenantId, companyId: f.companyId } });
  let opening = new Decimal(0);
  if (f.from) {
    const prior = await db.journalLine.aggregate({
      where: { tenantId: f.tenantId, accountId: f.accountId, entry: { companyId: f.companyId, status: { in: [...POSTED_STATUSES] }, date: { lt: f.from } } },
      _sum: { debit: true, credit: true },
    });
    const dr = D(prior._sum.debit ?? 0), cr = D(prior._sum.credit ?? 0);
    opening = isDebitNormal(account.type) ? dr.minus(cr) : cr.minus(dr);
  }
  let running = opening;
  const rows = lines.map((l) => {
    const delta = isDebitNormal(account.type) ? D(l.debit).minus(l.credit) : D(l.credit).minus(l.debit);
    running = running.plus(delta);
    return { line: l, balance: running };
  });
  return { account, opening, rows, closing: running };
}

/** Monthly revenue/expense series for charts. */
export async function monthlyPerformance(f: BalanceFilter) {
  const rows = await db.$queryRaw<{ month: Date; type: AccountType; debit: string; credit: string }[]>`
    SELECT date_trunc('month', e."date") AS month, a."type", SUM(l."debit")::text AS debit, SUM(l."credit")::text AS credit
    FROM "JournalLine" l
    JOIN "JournalEntry" e ON e."id" = l."entryId"
    JOIN "Account" a ON a."id" = l."accountId"
    WHERE l."tenantId" = ${f.tenantId} AND e."companyId" = ${f.companyId}
      AND e."status" IN ('POSTED','REVERSED')
      AND a."type" IN ('REVENUE','EXPENSE')
      AND (${f.from ?? null}::date IS NULL OR e."date" >= ${f.from ?? null}::date)
      AND (${f.to ?? null}::date IS NULL OR e."date" <= ${f.to ?? null}::date)
      AND (${f.activityId ?? null}::text IS NULL OR l."activityId" = ${f.activityId ?? null}::text)
    GROUP BY 1, 2 ORDER BY 1`;
  const months = new Map<string, { month: string; revenue: Decimal; expenses: Decimal }>();
  for (const r of rows) {
    const key = r.month.toISOString().slice(0, 7);
    const m = months.get(key) ?? { month: key, revenue: new Decimal(0), expenses: new Decimal(0) };
    if (r.type === "REVENUE") m.revenue = m.revenue.plus(D(r.credit).minus(r.debit));
    else m.expenses = m.expenses.plus(D(r.debit).minus(r.credit));
    months.set(key, m);
  }
  return [...months.values()].map((m) => ({ ...m, profit: m.revenue.minus(m.expenses) }));
}

/** Revenue / expense / profit per business activity (lines tagged with activityId). */
export async function activityPerformance(f: BalanceFilter) {
  const rows = await db.$queryRaw<{ activityId: string | null; type: AccountType; debit: string; credit: string }[]>`
    SELECT l."activityId", a."type", SUM(l."debit")::text AS debit, SUM(l."credit")::text AS credit
    FROM "JournalLine" l
    JOIN "JournalEntry" e ON e."id" = l."entryId"
    JOIN "Account" a ON a."id" = l."accountId"
    WHERE l."tenantId" = ${f.tenantId} AND e."companyId" = ${f.companyId}
      AND e."status" IN ('POSTED','REVERSED') AND a."type" IN ('REVENUE','EXPENSE')
      AND (${f.from ?? null}::date IS NULL OR e."date" >= ${f.from ?? null}::date)
      AND (${f.to ?? null}::date IS NULL OR e."date" <= ${f.to ?? null}::date)
    GROUP BY 1, 2`;
  const map = new Map<string, { activityId: string | null; revenue: Decimal; expenses: Decimal }>();
  for (const r of rows) {
    const key = r.activityId ?? "";
    const m = map.get(key) ?? { activityId: r.activityId, revenue: new Decimal(0), expenses: new Decimal(0) };
    if (r.type === "REVENUE") m.revenue = m.revenue.plus(D(r.credit).minus(r.debit));
    else m.expenses = m.expenses.plus(D(r.debit).minus(r.credit));
    map.set(key, m);
  }
  return [...map.values()].map((m) => ({ ...m, profit: m.revenue.minus(m.expenses) }));
}
