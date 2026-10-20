import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Users } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { sum } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination, pageParam } from "@/components/data/filter-bar";
import { CustomerDialog } from "@/components/parties/party-forms";
import { partyBalances } from "@/components/parties/queries";

export const metadata = { title: "العملاء" };
const PAGE = 30;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("customers.read");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const where: Prisma.CustomerWhereInput = {
    ...scope(ctx),
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q } }, { email: { contains: sp.q, mode: "insensitive" } }, { taxNumber: { contains: sp.q } }] } : {}),
  };
  const showBalance = ctx.permissions.has("financials.read") || ctx.permissions.has("invoices.read");
  const [customers, total, balances] = await Promise.all([
    db.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { _count: { select: { invoices: true } } } }),
    db.customer.count({ where }),
    showBalance ? partyBalances(ctx.tenant.id, ctx.company.id, { kind: "customer" }) : Promise.resolve(new Map()),
  ]);
  const cur = ctx.company.baseCurrency;
  const receivable = sum([...balances.values()].filter((b) => b.gt(0)));
  return (
    <div>
      <PageHeader title="العملاء" description="بيانات العملاء وكشوف الحساب والأرصدة المستحقة" icon={Users} actions={ctx.permissions.has("customers.manage") && <CustomerDialog />} />
      {showBalance && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="عدد العملاء" value={total} />
          <StatCard label="إجمالي المستحق على العملاء" value={<Money value={receivable} currency={cur} />} tone="gold" />
          <StatCard label="عملاء لديهم رصيد مستحق" value={[...balances.values()].filter((b) => b.gt(0)).length} />
        </div>
      )}
      <Card>
        <FilterBar q={sp.q} values={sp} placeholder="ابحث بالاسم أو الجوال أو البريد أو الرقم الضريبي" />
        {customers.length ? (
          <Table>
            <THead><TR><TH>العميل</TH><TH>الجوال</TH><TH>البريد</TH><TH>الرقم الضريبي</TH><TH>الفواتير</TH>{showBalance && <TH>الرصيد المستحق</TH>}</TR></THead>
            <TBody>
              {customers.map((c) => (
                <TR key={c.id}>
                  <TD><Link href={`/customers/${c.id}`} className="font-bold hover:text-gold">{c.name}</Link>{c.companyName && <span className="block text-xs text-muted-foreground">{c.companyName}</span>}</TD>
                  <TD dir="ltr" className="text-right">{c.phone ?? "—"}</TD>
                  <TD dir="ltr" className="text-right text-xs">{c.email ?? "—"}</TD>
                  <TD dir="ltr" className="text-right font-mono text-xs">{c.taxNumber ?? "—"}</TD>
                  <TD>{c._count.invoices}</TD>
                  {showBalance && <TD><Money value={balances.get(c.id) ?? 0} currency={cur} /></TD>}
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={Users} title="لا يوجد عملاء" description={sp.q ? "لا نتائج مطابقة للبحث" : "أضف أول عميل لإصدار الفواتير وتتبع المستحقات"} />}
        <Pagination page={page} pageSize={PAGE} total={total} params={sp} />
      </Card>
    </div>
  );
}
