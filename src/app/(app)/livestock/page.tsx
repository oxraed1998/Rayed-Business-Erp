import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Beef } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { herdSummary } from "@/lib/domain/livestock";
import { sum } from "@/lib/money";
import { activityOptions, shipmentOptions } from "@/server/queries/options";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination, pageParam } from "@/components/data/filter-bar";
import { NewHerdDialog } from "@/components/livestock/herd-forms";

export const metadata = { title: "المواشي" };
const PAGE = 25;

export default async function LivestockPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("livestock.read");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const where: Prisma.LivestockHerdWhereInput = {
    ...scope(ctx),
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { species: { contains: sp.q, mode: "insensitive" } }, { breed: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [herds, total, all] = await Promise.all([
    db.livestockHerd.findMany({ where, include: { events: true, expenses: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.livestockHerd.count({ where }),
    db.livestockHerd.findMany({ where: scope(ctx), include: { events: true, expenses: true } }),
  ]);
  const showCost = ctx.permissions.has("financials.read");
  const cur = ctx.company.baseCurrency;
  const totals = all.map((h) => herdSummary(h.events, h.expenses));
  return (
    <div>
      <PageHeader title="المواشي" description="القطعان، الاستيراد، الرعاية، النفوق والبيع" icon={Beef}
        actions={ctx.permissions.has("livestock.create") && <NewHerdDialog activities={await activityOptions(ctx, "LIVESTOCK")} shipments={await shipmentOptions(ctx, "LIVESTOCK")} />} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="عدد القطعان" value={all.length} />
        <StatCard label="الرؤوس المتبقية" value={totals.reduce((a, t) => a + t.remaining, 0)} />
        <StatCard label="النفوق" value={totals.reduce((a, t) => a + t.deceased, 0)} tone="danger" />
        {showCost && <StatCard label="قيمة المواشي" value={<Money value={sum(totals.map((t) => t.valuation))} currency={cur} />} tone="gold" />}
      </div>
      <Card>
        <FilterBar q={sp.q} values={sp} placeholder="ابحث بالاسم أو النوع أو السلالة" />
        {herds.length ? (
          <Table>
            <THead><TR><TH>القطيع</TH><TH>النوع / السلالة</TH><TH>المتبقي</TH><TH>المباع</TH><TH>النافق</TH>{showCost && <><TH>القيمة</TH><TH>تكلفة الرأس</TH><TH>الربح المحقق</TH></>}</TR></THead>
            <TBody>
              {herds.map((h) => {
                const s = herdSummary(h.events, h.expenses);
                return (
                  <TR key={h.id}>
                    <TD><Link href={`/livestock/${h.id}`} className="font-bold hover:text-gold">{h.name}</Link>{h.location && <span className="block text-xs text-muted-foreground">{h.location}</span>}</TD>
                    <TD>{h.species}{h.breed ? ` · ${h.breed}` : ""}</TD>
                    <TD className="font-bold">{s.remaining}</TD><TD>{s.sold}</TD><TD>{s.deceased}</TD>
                    {showCost && <><TD><Money value={s.valuation} currency={cur} /></TD><TD><Money value={s.costPerHead} currency={cur} /></TD><TD><Money value={s.realizedProfit} currency={cur} signed /></TD></>}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : <EmptyState icon={Beef} title="لا توجد قطعان" description={sp.q ? "لا نتائج مطابقة" : "أنشئ قطيعًا ثم سجّل الشراء والمصاريف"} />}
        <Pagination page={page} pageSize={PAGE} total={total} params={sp} />
      </Card>
    </div>
  );
}
