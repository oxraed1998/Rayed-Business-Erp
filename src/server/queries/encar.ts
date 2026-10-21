import "server-only";
import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/context";

/** Latest KRW → base-currency rate saved by the company (from previous imports), if any. */
export async function latestKrwRate(ctx: CompanyContext): Promise<string | null> {
  if (ctx.company.baseCurrency === "KRW") return "1";
  const r = await db.exchangeRate.findFirst({ where: { tenantId: ctx.tenant.id, companyId: ctx.company.id, currency: "KRW" }, orderBy: { date: "desc" } });
  return r ? r.rate.toString() : null;
}

/** Encar listing ids already imported into this company's inventory → vehicle id. */
export async function importedListings(ctx: CompanyContext, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db.vehicle.findMany({
    where: { tenantId: ctx.tenant.id, companyId: ctx.company.id, sourceRef: { in: ids.map((i) => `encar:${i}`) } },
    select: { id: true, sourceRef: true },
  });
  return new Map(rows.map((r) => [r.sourceRef!.slice(6), r.id]));
}
