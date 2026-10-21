import Link from "next/link";
import { notFound } from "next/navigation";
import { UserRound } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { D, sum } from "@/lib/money";
import { installmentStatus } from "@/lib/domain/installments";
import { INVOICE_TYPE_LABELS, paymentStatus } from "@/lib/domain/invoice-calc";
import { cashAccountOptions } from "@/server/queries/options";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValue, PageHeader, StatCard } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CustomerDialog } from "@/components/parties/party-forms";
import { StatementTable } from "@/components/parties/statement-table";
import { partyStatement } from "@/components/parties/queries";
import { PaymentDialog } from "@/components/payments/payment-dialog";
import { InvoiceStatusBadges } from "@/components/invoices/status-badges";
import { VehicleStatusBadge } from "@/components/vehicles/status-badge";
import { fmtDate } from "@/lib/utils";

const parse = (v?: string) => (v && !Number.isNaN(new Date(v).getTime()) ? new Date(v) : undefined);

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await pageCompanyContext("customers.read");
  const { id } = await params;
  const sp = await searchParams;
  const c = await db.customer.findFirst({ where: { id, ...scope(ctx) } });
  if (!c) notFound();
  const cur = ctx.company.baseCurrency;
  const canFinance = ctx.permissions.has("invoices.read");
  const from = parse(sp.from), to = parse(sp.to);
  const [statement, invoices, payments, installments, vehicles] = await Promise.all([
    canFinance ? partyStatement(ctx.tenant.id, ctx.company.id, { kind: "customer", id: c.id }, from, to) : null,
    canFinance ? db.invoice.findMany({ where: { ...scope(ctx), customerId: c.id }, orderBy: { issueDate: "desc" }, take: 100 }) : [],
    ctx.permissions.has("payments.read") ? db.payment.findMany({ where: { ...scope(ctx), customerId: c.id }, orderBy: { date: "desc" }, take: 100 }) : [],
    canFinance ? db.installment.findMany({ where: { tenantId: ctx.tenant.id, plan: { companyId: ctx.company.id, customerId: c.id } }, include: { plan: { include: { invoice: true } } }, orderBy: { dueDate: "asc" } }) : [],
    ctx.permissions.has("vehicles.read") ? db.vehicle.findMany({ where: { ...scope(ctx), customerId: c.id }, orderBy: { saleDate: "desc" } }) : [],
  ]);
  const balance = statement ? (from || to ? (await partyStatement(ctx.tenant.id, ctx.company.id, { kind: "customer", id: c.id })).closing : statement.closing) : null;
  const openInstallments = installments.filter((i) => installmentStatus(i) !== "PAID");
  const overdue = installments.filter((i) => installmentStatus(i) === "OVERDUE");

  return (
    <div className="space-y-6">
      <PageHeader title={c.name} description={c.companyName ?? "عميل"} icon={UserRound}
        actions={<>
          {ctx.permissions.has("customers.manage") && <CustomerDialog customer={c} />}
          {ctx.permissions.has("payments.create") && <PaymentDialog direction="IN" cashAccounts={await cashAccountOptions(ctx)} customers={[{ value: c.id, label: c.name }]} allowRefund={false} triggerLabel="سند قبض" />}
          {ctx.permissions.has("invoices.create") && <Button asChild size="default"><Link href={`/invoices/new?type=SALES&customerId=${c.id}`}>فاتورة جديدة</Link></Button>}
        </>} />

      <Card><CardContent className="pt-5">
        <KeyValue items={[["الجوال", c.phone], ["البريد الإلكتروني", c.email], ["الرقم الضريبي", c.taxNumber], ["العنوان", c.address], ["تاريخ الإضافة", fmtDate(c.createdAt)], ["ملاحظات", c.notes]]} />
      </CardContent></Card>

      {canFinance && balance && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="الرصيد المستحق" value={<Money value={balance} currency={cur} />} tone={balance.gt(0) ? "gold" : "default"} />
          <StatCard label="عدد الفواتير" value={invoices.filter((i) => i.status === "POSTED").length} />
          <StatCard label="أقساط مفتوحة" value={<Money value={sum(openInstallments.map((i) => D(i.amount).minus(i.paidAmount)))} currency={cur} />} />
          <StatCard label="أقساط متأخرة" value={overdue.length} tone={overdue.length ? "danger" : "default"} />
        </div>
      )}

      {statement && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
            <CardTitle>كشف حساب العميل</CardTitle>
            <form method="get" className="flex flex-wrap items-center gap-2 no-print">
              <Input type="date" name="from" defaultValue={sp.from} className="h-9 w-40" aria-label="من" />
              <Input type="date" name="to" defaultValue={sp.to} className="h-9 w-40" aria-label="إلى" />
              <Button size="sm" variant="secondary" className="h-9">عرض</Button>
            </form>
          </CardHeader>
          <CardContent className="p-0"><StatementTable {...statement} currency={cur} from={sp.from} /></CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {canFinance && (
          <Card>
            <CardHeader><CardTitle>الفواتير</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>الرقم</TH><TH>النوع</TH><TH>التاريخ</TH><TH>الإجمالي</TH><TH>الحالة</TH></TR></THead>
                <TBody>
                  {invoices.map((i) => (
                    <TR key={i.id}>
                      <TD><Link href={`/invoices/${i.id}`} className="font-mono text-xs font-bold hover:text-gold">{i.number}</Link></TD>
                      <TD className="text-xs">{INVOICE_TYPE_LABELS[i.type]}</TD><TD>{fmtDate(i.issueDate)}</TD>
                      <TD><Money value={i.total} currency={i.currency} /></TD>
                      <TD><InvoiceStatusBadges status={i.status} payment={i.status === "POSTED" ? paymentStatus(i.total, i.amountPaid, i.dueDate) : null} /></TD>
                    </TR>
                  ))}
                  {!invoices.length && <TR><TD colSpan={5} className="py-8 text-center text-muted-foreground">لا توجد فواتير</TD></TR>}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        )}
        {payments.length > 0 && (
          <Card>
            <CardHeader><CardTitle>السندات</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>الرقم</TH><TH>التاريخ</TH><TH>المبلغ</TH><TH>المرجع</TH></TR></THead>
                <TBody>{payments.map((p) => <TR key={p.id}><TD className="font-mono text-xs">{p.number}{p.isRefund && <span className="ms-1 text-warning">(استرداد)</span>}</TD><TD>{fmtDate(p.date)}</TD><TD><Money value={p.amount} currency={p.currency} /></TD><TD className="text-xs">{p.reference ?? "—"}</TD></TR>)}</TBody>
              </Table>
            </CardContent>
          </Card>
        )}
        {installments.length > 0 && (
          <Card>
            <CardHeader><CardTitle>جدول الأقساط</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>الفاتورة</TH><TH>القسط</TH><TH>الاستحقاق</TH><TH>المبلغ</TH><TH>المتبقي</TH><TH>الحالة</TH></TR></THead>
                <TBody>{installments.map((i) => { const st = installmentStatus(i); return (
                  <TR key={i.id}>
                    <TD><Link href={`/invoices/${i.plan.invoiceId}`} className="font-mono text-xs hover:text-gold">{i.plan.invoice.number}</Link></TD>
                    <TD>{i.seq === 0 ? "دفعة مقدمة" : i.seq}</TD><TD>{fmtDate(i.dueDate)}</TD>
                    <TD><Money value={i.amount} currency={cur} /></TD><TD><Money value={D(i.amount).minus(i.paidAmount)} currency={cur} /></TD>
                    <TD><InstallmentBadge status={st} /></TD>
                  </TR>); })}</TBody>
              </Table>
            </CardContent>
          </Card>
        )}
        {vehicles.length > 0 && (
          <Card>
            <CardHeader><CardTitle>السيارات المشتراة</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>السيارة</TH><TH>تاريخ البيع</TH><TH>السعر</TH><TH>الحالة</TH></TR></THead>
                <TBody>{vehicles.map((v) => <TR key={v.id}><TD><Link href={`/vehicles/${v.id}`} className="font-bold hover:text-gold">{v.manufacturer} {v.model} {v.year}</Link></TD><TD>{fmtDate(v.saleDate)}</TD><TD><Money value={v.sellingPrice} currency={cur} /></TD><TD><VehicleStatusBadge status={v.status} /></TD></TR>)}</TBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function InstallmentBadge({ status }: { status: ReturnType<typeof installmentStatus> }) {
  const map = { PAID: ["مدفوع", "bg-success/12 text-success"], OVERDUE: ["متأخر", "bg-destructive/10 text-destructive"], PARTIAL: ["مدفوع جزئيًا", "bg-warning/15 text-warning"], DUE: ["مستحق", "bg-muted text-muted-foreground"] } as const;
  const [label, cls] = map[status];
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span>;
}
