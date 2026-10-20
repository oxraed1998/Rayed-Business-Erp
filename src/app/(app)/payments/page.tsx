import Link from "next/link";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { Banknote } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { D, sum } from "@/lib/money";
import { cashAccountOptions, customerOptions, supplierOptions, toOptions } from "@/server/queries/options";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination, pageParam } from "@/components/data/filter-bar";
import { PaymentDialog } from "@/components/payments/payment-dialog";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "سندات القبض والصرف" };
const PAGE = 30;
const METHOD_LABELS: Record<PaymentMethod, string> = { CASH: "نقدًا", BANK_TRANSFER: "تحويل بنكي", CARD: "بطاقة", CHEQUE: "شيك", OTHER: "أخرى" };
const parse = (v?: string) => (v && !Number.isNaN(new Date(v).getTime()) ? new Date(v) : undefined);

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("payments.read");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const direction = sp.direction === "IN" || sp.direction === "OUT" ? sp.direction : undefined;
  const method = sp.method && sp.method in METHOD_LABELS ? (sp.method as PaymentMethod) : undefined;
  const from = parse(sp.from), to = parse(sp.to);
  const where: Prisma.PaymentWhereInput = {
    ...scope(ctx),
    ...(direction ? { direction } : {}),
    ...(method ? { method } : {}),
    ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(sp.q ? { OR: [{ number: { contains: sp.q, mode: "insensitive" } }, { reference: { contains: sp.q, mode: "insensitive" } }, { customer: { name: { contains: sp.q, mode: "insensitive" } } }, { supplier: { name: { contains: sp.q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total, totals, accounts] = await Promise.all([
    db.payment.findMany({ where, include: { customer: true, supplier: true, allocations: { include: { invoice: true } } }, orderBy: [{ date: "desc" }, { number: "desc" }], skip: (page - 1) * PAGE, take: PAGE }),
    db.payment.count({ where }),
    db.payment.groupBy({ by: ["direction"], where, _sum: { amount: true } }),
    db.account.findMany({ where: { ...scope(ctx), isCashLike: true } }),
  ]);
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const tIn = D(totals.find((t) => t.direction === "IN")?._sum.amount ?? 0);
  const tOut = D(totals.find((t) => t.direction === "OUT")?._sum.amount ?? 0);
  const cur = ctx.company.baseCurrency;
  const canCreate = ctx.permissions.has("payments.create");
  const [cash, customers, suppliers] = canCreate ? await Promise.all([cashAccountOptions(ctx), customerOptions(ctx), supplierOptions(ctx)]) : [[], [], []];
  return (
    <div>
      <PageHeader title="سندات القبض والصرف" description="المقبوضات من العملاء والمدفوعات للموردين والمبالغ المستردة" icon={Banknote}
        actions={canCreate && <>
          <PaymentDialog direction="IN" cashAccounts={cash} customers={customers} suppliers={suppliers} />
          <PaymentDialog direction="OUT" cashAccounts={cash} customers={customers} suppliers={suppliers} />
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="إجمالي المقبوضات (حسب التصفية)" value={<Money value={tIn} currency={cur} />} tone="success" />
        <StatCard label="إجمالي المدفوعات (حسب التصفية)" value={<Money value={tOut} currency={cur} />} tone="danger" />
        <StatCard label="صافي الحركة" value={<Money value={sum([tIn, tOut.neg()])} currency={cur} signed />} />
      </div>
      <Card>
        <FilterBar q={sp.q} values={sp} dates placeholder="رقم السند أو المرجع أو اسم الطرف" filters={[
          { name: "direction", label: "النوع", options: [{ value: "IN", label: "قبض" }, { value: "OUT", label: "صرف" }] },
          { name: "method", label: "الطريقة", options: toOptions(METHOD_LABELS) },
        ]} />
        {rows.length ? (
          <Table>
            <THead><TR><TH>الرقم</TH><TH>التاريخ</TH><TH>النوع</TH><TH>الطرف</TH><TH>الحساب</TH><TH>الطريقة</TH><TH>المبلغ</TH><TH>الفواتير</TH><TH>المرجع</TH></TR></THead>
            <TBody>
              {rows.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-xs font-bold">{p.number}</TD>
                  <TD>{fmtDate(p.date)}</TD>
                  <TD><Badge variant={p.direction === "IN" ? "success" : "warning"}>{p.direction === "IN" ? "قبض" : "صرف"}{p.isRefund ? " · استرداد" : ""}</Badge></TD>
                  <TD>{p.customer ? <Link href={`/customers/${p.customer.id}`} className="hover:text-gold">{p.customer.name}</Link> : p.supplier ? <Link href={`/suppliers/${p.supplier.id}`} className="hover:text-gold">{p.supplier.name}</Link> : "—"}</TD>
                  <TD className="text-xs">{accName.get(p.accountId) ?? "—"}</TD>
                  <TD className="text-xs">{METHOD_LABELS[p.method]}</TD>
                  <TD><Money value={p.amount} currency={p.currency} /></TD>
                  <TD className="text-xs">{[...new Map(p.allocations.map((a) => [a.invoiceId, a.invoice])).values()].map((i) => <Link key={i.id} href={`/invoices/${i.id}`} className="me-1 font-mono hover:text-gold">{i.number}</Link>)}{!p.allocations.length && <span className="text-muted-foreground">غير مخصص</span>}</TD>
                  <TD className="text-xs">{p.reference ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={Banknote} title="لا توجد سندات" description={sp.q || direction || method ? "لا نتائج مطابقة للتصفية" : "سجّل أول سند قبض أو صرف"} />}
        <Pagination page={page} pageSize={PAGE} total={total} params={sp} />
      </Card>
    </div>
  );
}
