import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Truck } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { sum } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination, pageParam } from "@/components/data/filter-bar";
import { SupplierDialog } from "@/components/parties/party-forms";
import { partyBalances } from "@/components/parties/queries";

export const metadata = { title: "الموردون" };
const PAGE = 30;

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("suppliers.read");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const where: Prisma.SupplierWhereInput = {
    ...scope(ctx),
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { country: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q } }, { email: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const showBalance = ctx.permissions.has("financials.read") || ctx.permissions.has("invoices.read");
  const [suppliers, total, balances] = await Promise.all([
    db.supplier.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { _count: { select: { invoices: true, vehicles: true } } } }),
    db.supplier.count({ where }),
    showBalance ? partyBalances(ctx.tenant.id, ctx.company.id, { kind: "supplier" }) : Promise.resolve(new Map()),
  ]);
  const cur = ctx.company.baseCurrency;
  const payable = sum([...balances.values()].filter((b) => b.gt(0)));
  return (
    <div>
      <PageHeader title="الموردون" description="موردو الاستيراد والمشتريات وأرصدتهم" icon={Truck} actions={ctx.permissions.has("suppliers.manage") && <SupplierDialog />} />
      {showBalance && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="عدد الموردين" value={total} />
          <StatCard label="إجمالي المستحق للموردين" value={<Money value={payable} currency={cur} />} tone="danger" />
          <StatCard label="موردون لهم رصيد" value={[...balances.values()].filter((b) => b.gt(0)).length} />
        </div>
      )}
      <Card>
        <FilterBar q={sp.q} values={sp} placeholder="ابحث بالاسم أو الدولة أو الهاتف" />
        {suppliers.length ? (
          <Table>
            <THead><TR><TH>المورد</TH><TH>الدولة</TH><TH>الهاتف</TH><TH>البنك</TH><TH>فواتير / سيارات</TH>{showBalance && <TH>المستحق له</TH>}</TR></THead>
            <TBody>
              {suppliers.map((s) => (
                <TR key={s.id}>
                  <TD><Link href={`/suppliers/${s.id}`} className="font-bold hover:text-gold">{s.name}</Link></TD>
                  <TD>{s.country ?? "—"}</TD>
                  <TD dir="ltr" className="text-right">{s.phone ?? "—"}</TD>
                  <TD className="text-xs">{s.bankName ?? "—"}</TD>
                  <TD>{s._count.invoices} / {s._count.vehicles}</TD>
                  {showBalance && <TD><Money value={balances.get(s.id) ?? 0} currency={cur} /></TD>}
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={Truck} title="لا يوجد موردون" description={sp.q ? "لا نتائج مطابقة للبحث" : "أضف موردي السيارات والمواشي والملابس"} />}
        <Pagination page={page} pageSize={PAGE} total={total} params={sp} />
      </Card>
    </div>
  );
}
