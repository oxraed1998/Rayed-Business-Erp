import "server-only";
import { db } from "@/lib/db";
import { D, Decimal } from "@/lib/money";

type Party = { kind: "customer"; id?: string } | { kind: "supplier"; id?: string };

/**
 * Sub-ledger balances from the ledger itself: AR lines tagged with customerId
 * (debit − credit) or AP lines tagged with supplierId (credit − debit).
 */
export async function partyBalances(tenantId: string, companyId: string, party: Party) {
  const key = party.kind === "customer" ? "AR" : "AP";
  const field = party.kind === "customer" ? "customerId" : "supplierId";
  const rows = await db.journalLine.groupBy({
    by: [field],
    where: {
      tenantId,
      account: { companyId, systemKey: key },
      entry: { companyId, status: { in: ["POSTED", "REVERSED"] } },
      [field]: party.id ? party.id : { not: null },
    },
    _sum: { debit: true, credit: true },
  });
  const map = new Map<string, Decimal>();
  for (const r of rows as unknown as ({ customerId?: string; supplierId?: string; _sum: { debit: unknown; credit: unknown } })[]) {
    const id = (r.customerId ?? r.supplierId) as string;
    const dr = D((r._sum.debit as string | null) ?? 0), cr = D((r._sum.credit as string | null) ?? 0);
    map.set(id, party.kind === "customer" ? dr.minus(cr) : cr.minus(dr));
  }
  return map;
}

export async function partyStatement(tenantId: string, companyId: string, party: Required<Party>, from?: Date, to?: Date) {
  const key = party.kind === "customer" ? "AR" : "AP";
  const field = party.kind === "customer" ? "customerId" : "supplierId";
  const base = { tenantId, account: { companyId, systemKey: key }, [field]: party.id };
  const sign = (debit: unknown, credit: unknown) => (party.kind === "customer" ? D(debit as string).minus(D(credit as string)) : D(credit as string).minus(D(debit as string)));
  let opening = new Decimal(0);
  if (from) {
    const prior = await db.journalLine.aggregate({ where: { ...base, entry: { companyId, status: { in: ["POSTED", "REVERSED"] }, date: { lt: from } } }, _sum: { debit: true, credit: true } });
    opening = sign(prior._sum.debit ?? 0, prior._sum.credit ?? 0);
  }
  const lines = await db.journalLine.findMany({
    where: { ...base, entry: { companyId, status: { in: ["POSTED", "REVERSED"] }, date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } },
    include: { entry: true },
    orderBy: [{ entry: { date: "asc" } }, { entry: { number: "asc" } }],
    take: 2000,
  });
  let running = opening;
  const rows = lines.map((l) => {
    running = running.plus(sign(l.debit, l.credit));
    return { id: l.id, date: l.entry.date, number: l.entry.number, description: l.entry.description, sourceType: l.entry.sourceType, sourceId: l.entry.sourceId, debit: D(l.debit), credit: D(l.credit), balance: running };
  });
  return { opening, rows, closing: running };
}
