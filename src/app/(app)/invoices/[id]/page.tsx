import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, FileText } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { INVOICE_TYPE_LABELS, paymentStatus } from "@/lib/domain/invoice-calc";
import { installmentStatus } from "@/lib/domain/installments";
import { D, formatMoney } from "@/lib/money";
import { cashAccountOptions } from "@/server/queries/options";
import { postInvoiceAction, voidInvoiceAction } from "@/server/actions/invoices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { InvoiceStatusBadges } from "@/components/invoices/status-badges";
import { InstallmentPlanDialog, PrintButton } from "@/components/invoices/invoice-actions";
import { PaymentDialog } from "@/components/payments/payment-dialog";
import { fmtDate } from "@/lib/utils";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCompanyContext("invoices.read");
  const { id } = await params;
  const inv = await db.invoice.findFirst({
    where: { id, ...scope(ctx) },
    include: {
      lines: { orderBy: { sortOrder: "asc" } }, customer: true, supplier: true,
      allocations: { include: { payment: true }, orderBy: { payment: { date: "asc" } } },
      installmentPlan: { include: { installments: { orderBy: { seq: "asc" } } } },
    },
  });
  if (!inv) notFound();
  const [entry, related, notes, activity] = await Promise.all([
    inv.journalEntryId ? db.journalEntry.findFirst({ where: { id: inv.journalEntryId, tenantId: ctx.tenant.id } }) : null,
    inv.relatedInvoiceId ? db.invoice.findFirst({ where: { id: inv.relatedInvoiceId, ...scope(ctx) } }) : null,
    db.invoice.findMany({ where: { ...scope(ctx), relatedInvoiceId: inv.id }, orderBy: { issueDate: "asc" } }),
    inv.activityId ? db.businessActivity.findFirst({ where: { id: inv.activityId, ...scope(ctx) } }) : null,
  ]);
  const c = ctx.company;
  const cur = inv.currency;
  const m = (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, cur);
  const remaining = D(inv.total).minus(inv.amountPaid);
  const party = inv.customer ?? inv.supplier;
  const pay = inv.status === "POSTED" ? paymentStatus(inv.total, inv.amountPaid, inv.dueDate) : null;
  const canApprove = ctx.permissions.has("invoices.approve");
  const payable = inv.status === "POSTED" && remaining.gt(0) && inv.type !== "CREDIT_NOTE";
  const canPay = payable && ctx.permissions.has("payments.create") && cur === c.baseCurrency;
  const canPlan = inv.type === "SALES" && inv.status === "POSTED" && remaining.gt(0) && !inv.installmentPlan && ctx.permissions.has("invoices.create");

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-navy text-gold dark:bg-gold/15"><FileText className="size-5" /></div>
          <div><h1 className="text-2xl font-extrabold">{INVOICE_TYPE_LABELS[inv.type]} <span className="font-mono">{inv.number}</span></h1><InvoiceStatusBadges status={inv.status} payment={pay} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          {inv.status === "DRAFT" && canApprove && (
            <ConfirmAction action={postInvoiceAction} fields={{ id: inv.id }} title="ترحيل الفاتورة" description="سيتم إنشاء قيد محاسبي مرحّل ولا يمكن تعديل الفاتورة بعد ذلك (يمكن إلغاؤها بقيد عكسي)." confirmLabel="ترحيل" variant="default" size="default">ترحيل</ConfirmAction>
          )}
          {canPay && (
            <PaymentDialog direction={inv.type === "PURCHASE" ? "OUT" : "IN"} cashAccounts={await cashAccountOptions(ctx)} triggerLabel="تسجيل دفعة" triggerVariant="gold"
              invoice={{ id: inv.id, number: inv.number, remaining: remaining.toFixed(2), customerId: inv.customerId, supplierId: inv.supplierId }} />
          )}
          {canPlan && <InstallmentPlanDialog invoiceId={inv.id} remaining={m(remaining)} />}
          {inv.type === "SALES" && inv.status === "POSTED" && ctx.permissions.has("invoices.create") && (
            <Button asChild variant="outline"><Link href={`/invoices/new?type=CREDIT_NOTE&customerId=${inv.customerId ?? ""}&relatedInvoiceId=${inv.id}`}>إشعار دائن</Link></Button>
          )}
          {inv.status !== "VOID" && canApprove && inv.allocations.length === 0 && (
            <ConfirmAction action={voidInvoiceAction} fields={{ id: inv.id }} title="إلغاء الفاتورة" description={inv.status === "POSTED" ? "سيتم إنشاء قيد عكسي يلغي أثر الفاتورة في الدفاتر. لا يمكن التراجع عن هذا الإجراء." : "سيتم إلغاء المسودة."} confirmLabel="إلغاء الفاتورة" destructive size="default">إلغاء</ConfirmAction>
          )}
        </div>
      </div>

      {payable && cur !== c.baseCurrency && <p className="no-print rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">الفاتورة بعملة {cur}؛ تسجيل الدفعات متاح حاليًا بالعملة الأساسية ({c.baseCurrency}) فقط.</p>}

      <div className="no-print flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <p>هذه الفاتورة ليست فاتورة إلكترونية معتمدة من هيئة الزكاة والضريبة والجمارك (ZATCA) — الربط مع منصة فاتورة غير مفعّل بعد.</p>
      </div>

      <Card className="print-card">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 border-b pb-6 sm:flex-row">
            <div>
              <p className="text-xl font-extrabold">{c.legalName ?? c.name}</p>
              {c.taxNumber && <p className="text-sm text-muted-foreground">الرقم الضريبي: <span dir="ltr" className="font-mono">{c.taxNumber}</span></p>}
              {c.crNumber && <p className="text-sm text-muted-foreground">السجل التجاري: <span dir="ltr" className="font-mono">{c.crNumber}</span></p>}
              {c.address && <p className="text-sm text-muted-foreground">{c.address}</p>}
            </div>
            <div className="text-sm sm:text-left">
              <p className="text-lg font-extrabold text-gold">{INVOICE_TYPE_LABELS[inv.type]}</p>
              <p>رقم: <span className="font-mono font-bold">{inv.number}</span></p>
              <p>تاريخ الإصدار: {fmtDate(inv.issueDate)}</p>
              {inv.dueDate && <p>تاريخ الاستحقاق: {fmtDate(inv.dueDate)}</p>}
              {related && <p>مرتبطة بالفاتورة: <Link href={`/invoices/${related.id}`} className="font-mono text-gold">{related.number}</Link></p>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-muted/50 p-4 text-sm">
              <p className="mb-1 text-xs font-bold text-muted-foreground">{inv.supplier ? "المورد" : "العميل"}</p>
              {party ? (
                <>
                  <Link href={inv.customer ? `/customers/${inv.customer.id}` : `/suppliers/${inv.supplier!.id}`} className="font-bold hover:text-gold">{party.name}</Link>
                  {party.taxNumber && <p>الرقم الضريبي: <span dir="ltr" className="font-mono">{party.taxNumber}</span></p>}
                  {party.address && <p>{party.address}</p>}
                  {party.phone && <p dir="ltr" className="text-right">{party.phone}</p>}
                </>
              ) : "—"}
            </div>
            <div className="rounded-xl bg-muted/50 p-4 text-sm">
              <p className="mb-1 text-xs font-bold text-muted-foreground">تفاصيل</p>
              <p>العملة: {cur}{cur !== c.baseCurrency && ` · سعر الصرف ${D(inv.fxRate).toString()}`}</p>
              {activity && <p>النشاط: {activity.name}</p>}
              {entry && ctx.permissions.has("accounting.read") && <p className="no-print">القيد المحاسبي: <Link href={`/accounting/journal/${entry.id}`} className="font-mono text-gold">{entry.number}</Link></p>}
            </div>
          </div>

          <Table>
            <THead><TR><TH>#</TH><TH>الوصف</TH><TH>الكمية</TH><TH>سعر الوحدة</TH><TH>الخصم</TH><TH>الصافي</TH><TH>الضريبة</TH><TH>الإجمالي</TH></TR></THead>
            <TBody>
              {inv.lines.map((l, i) => (
                <TR key={l.id}>
                  <TD>{i + 1}</TD><TD className="whitespace-normal">{l.description}</TD><TD className="num">{D(l.quantity).toString()}</TD>
                  <TD className="num">{m(l.unitPrice)}</TD><TD className="num">{D(l.discount).isZero() ? "—" : m(l.discount)}</TD>
                  <TD className="num">{m(l.lineNet)}</TD><TD className="num">{m(l.lineVat)} <span className="text-xs text-muted-foreground">({D(l.vatRate).toString()}%)</span></TD>
                  <TD className="num font-bold">{m(l.lineTotal)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>

          <div className="mr-auto w-full max-w-sm space-y-1.5 text-sm">
            <Row label="المجموع" value={m(inv.subtotal)} />
            {!D(inv.discountTotal).isZero() && <Row label="الخصم" value={`- ${m(inv.discountTotal)}`} />}
            <Row label="الصافي قبل الضريبة" value={m(D(inv.subtotal).minus(inv.discountTotal))} />
            <Row label="ضريبة القيمة المضافة" value={m(inv.vatTotal)} />
            <div className="border-t pt-2"><Row label="الإجمالي" value={m(inv.total)} bold /></div>
            {inv.status === "POSTED" && <>
              <Row label={inv.type === "CREDIT_NOTE" ? "المطبّق على الفاتورة الأصلية" : "المدفوع"} value={m(inv.amountPaid)} />
              {inv.type !== "CREDIT_NOTE" && <Row label="المتبقي" value={m(remaining)} bold />}
            </>}
          </div>
          {inv.notes && <p className="rounded-lg border p-3 text-sm">{inv.notes}</p>}
        </CardContent>
      </Card>

      <div className="no-print grid gap-6 xl:grid-cols-2">
        {inv.allocations.length > 0 && (
          <Card>
            <CardHeader><CardTitle>الدفعات المخصصة</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>السند</TH><TH>التاريخ</TH><TH>المبلغ المخصص</TH><TH>القسط</TH></TR></THead>
                <TBody>{inv.allocations.map((a) => {
                  const ins = inv.installmentPlan?.installments.find((x) => x.id === a.installmentId);
                  return <TR key={a.id}><TD className="font-mono text-xs">{a.payment.number}</TD><TD>{fmtDate(a.payment.date)}</TD><TD><Money value={a.amount} currency={cur} /></TD><TD>{ins ? (ins.seq === 0 ? "دفعة مقدمة" : `#${ins.seq}`) : "—"}</TD></TR>;
                })}</TBody>
              </Table>
            </CardContent>
          </Card>
        )}
        {inv.installmentPlan && (
          <Card>
            <CardHeader><CardTitle>جدول الأقساط</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>القسط</TH><TH>الاستحقاق</TH><TH>المبلغ</TH><TH>المدفوع</TH><TH>الحالة</TH></TR></THead>
                <TBody>{inv.installmentPlan.installments.map((i) => {
                  const st = installmentStatus(i);
                  const cls = { PAID: "text-success", OVERDUE: "text-destructive", PARTIAL: "text-warning", DUE: "text-muted-foreground" }[st];
                  const label = { PAID: "مدفوع", OVERDUE: "متأخر", PARTIAL: "جزئي", DUE: "مستحق" }[st];
                  return <TR key={i.id}><TD>{i.seq === 0 ? "دفعة مقدمة" : i.seq}</TD><TD>{fmtDate(i.dueDate)}</TD><TD><Money value={i.amount} currency={cur} /></TD><TD><Money value={i.paidAmount} currency={cur} /></TD><TD className={`text-xs font-bold ${cls}`}>{label}</TD></TR>;
                })}</TBody>
              </Table>
            </CardContent>
          </Card>
        )}
        {notes.length > 0 && (
          <Card>
            <CardHeader><CardTitle>الإشعارات المرتبطة</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>الرقم</TH><TH>النوع</TH><TH>التاريخ</TH><TH>الإجمالي</TH></TR></THead>
                <TBody>{notes.map((n) => <TR key={n.id}><TD><Link href={`/invoices/${n.id}`} className="font-mono text-xs hover:text-gold">{n.number}</Link></TD><TD className="text-xs">{INVOICE_TYPE_LABELS[n.type]}</TD><TD>{fmtDate(n.issueDate)}</TD><TD><Money value={n.total} currency={n.currency} /></TD></TR>)}</TBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className={`flex items-center justify-between ${bold ? "text-base font-extrabold" : ""}`}><span className={bold ? "" : "text-muted-foreground"}>{label}</span><span className="num">{value}</span></div>
);
