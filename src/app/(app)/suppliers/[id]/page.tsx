import Link from "next/link";
import { notFound } from "next/navigation";
import { Truck } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { INVOICE_TYPE_LABELS, paymentStatus } from "@/lib/domain/invoice-calc";
import { cashAccountOptions } from "@/server/queries/options";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValue, PageHeader, StatCard } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SupplierDialog } from "@/components/parties/party-forms";
import { StatementTable } from "@/components/parties/statement-table";
import { partyStatement } from "@/components/parties/queries";
import { PaymentDialog } from "@/components/payments/payment-dialog";
import { InvoiceStatusBadges } from "@/components/invoices/status-badges";
import { VehicleStatusBadge } from "@/components/vehicles/status-badge";
import { fmtDate } from "@/lib/utils";

const parse = (v?: string) => (v && !Number.isNaN(new Date(v).getTime()) ? new Date(v) : undefined);

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await pageCompanyContext("suppliers.read");
  const { id } = await params;
  const sp = await searchParams;
  const s = await db.supplier.findFirst({ where: { id, ...scope(ctx) } });
  if (!s) notFound();
  const cur = ctx.company.baseCurrency;
  const canFinance = ctx.permissions.has("invoices.read");
  const from = parse(sp.from), to = parse(sp.to);
  const [statement, full, invoices, payments, vehicles] = await Promise.all([
    canFinance ? partyStatement(ctx.tenant.id, ctx.company.id, { kind: "supplier", id: s.id }, from, to) : null,
    canFinance ? partyStatement(ctx.tenant.id, ctx.company.id, { kind: "supplier", id: s.id }) : null,
    canFinance ? db.invoice.findMany({ where: { ...scope(ctx), supplierId: s.id }, orderBy: { issueDate: "desc" }, take: 100 }) : [],
    ctx.permissions.has("payments.read") ? db.payment.findMany({ where: { ...scope(ctx), supplierId: s.id }, orderBy: { date: "desc" }, take: 100 }) : [],
    ctx.permissions.has("vehicles.read") ? db.vehicle.findMany({ where: { ...scope(ctx), supplierId: s.id }, orderBy: { createdAt: "desc" }, take: 100 }) : [],
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={s.name} description={s.country ? `مورد · ${s.country}` : "مورد"} icon={Truck}
        actions={<>
          {ctx.permissions.has("suppliers.manage") && <SupplierDialog supplier={s} />}
          {ctx.permissions.has("payments.create") && <PaymentDialog direction="OUT" cashAccounts={await cashAccountOptions(ctx)} suppliers={[{ value: s.id, label: s.name }]} allowRefund={false} triggerLabel="سند صرف" triggerVariant="default" />}
          {ctx.permissions.has("invoices.create") && <Button asChild variant="outline"><Link href={`/invoices/new?type=PURCHASE&supplierId=${s.id}`}>فاتورة مشتريات</Link></Button>}
        </>} />

      <Card><CardContent className="pt-5">
        <KeyValue items={[
          ["الدولة", s.country], ["الهاتف", s.phone], ["البريد الإلكتروني", s.email], ["العنوان", s.address], ["الرقم الضريبي", s.taxNumber],
          ["البنك", s.bankName], ["IBAN", s.iban ? <span dir="ltr" className="font-mono text-xs">{s.iban}</span> : null], ["ملاحظات", s.notes],
        ]} />
      </CardContent></Card>

      {full && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="الرصيد المستحق للمورد" value={<Money value={full.closing} currency={cur} />} tone={full.closing.gt(0) ? "danger" : "default"} />
          <StatCard label="فواتير المشتريات" value={invoices.filter((i) => i.status === "POSTED").length} />
          <StatCard label="السيارات المشتراة" value={vehicles.length} />
        </div>
      )}

      {statement && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
            <CardTitle>كشف حساب المورد</CardTitle>
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
        {vehicles.length > 0 && (
          <Card>
            <CardHeader><CardTitle>سيارات من هذا المورد</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>السيارة</TH><TH>تاريخ الشراء</TH><TH>سعر الشراء</TH><TH>الحالة</TH></TR></THead>
                <TBody>{vehicles.map((v) => <TR key={v.id}><TD><Link href={`/vehicles/${v.id}`} className="font-bold hover:text-gold">{v.manufacturer} {v.model} {v.year}</Link></TD><TD>{fmtDate(v.purchaseDate)}</TD><TD><Money value={v.purchasePrice} currency={v.purchaseCurrency} /></TD><TD><VehicleStatusBadge status={v.status} /></TD></TR>)}</TBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
