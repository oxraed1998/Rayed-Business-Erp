import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Printer } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { sum } from "@/lib/money";
import { fmtDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KeyValue, PageHeader } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { PrintButton } from "@/components/accounting/print-button";
import { AccountingNav } from "@/components/accounting/accounting-nav";
import { JOURNAL_STATUS_LABELS, SOURCE_LABELS } from "@/components/accounting/labels";
import { deleteJournalEntryAction, postJournalEntryAction, reverseJournalEntryAction } from "@/server/actions/accounting";

export default async function JournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCompanyContext("accounting.read");
  const { id } = await params;
  const e = await db.journalEntry.findFirst({
    where: { id, ...scope(ctx) },
    include: { lines: { include: { account: true } }, reversalOf: true, reversedBy: true },
  });
  if (!e) notFound();
  const [activities, customers, suppliers, partners, users] = await Promise.all([
    db.businessActivity.findMany({ where: scope(ctx), select: { id: true, name: true } }),
    db.customer.findMany({ where: { ...scope(ctx), id: { in: e.lines.map((l) => l.customerId).filter(Boolean) as string[] } }, select: { id: true, name: true } }),
    db.supplier.findMany({ where: { ...scope(ctx), id: { in: e.lines.map((l) => l.supplierId).filter(Boolean) as string[] } }, select: { id: true, name: true } }),
    db.partner.findMany({ where: { tenantId: ctx.tenant.id, id: { in: e.lines.map((l) => l.partnerId).filter(Boolean) as string[] } }, select: { id: true, name: true } }),
    db.user.findMany({ where: { id: { in: [e.createdById, e.postedById].filter(Boolean) as string[] }, memberships: { some: { tenantId: ctx.tenant.id } } }, select: { id: true, name: true } }),
  ]);
  const name = (list: { id: string; name: string }[], id: string | null) => (id ? list.find((x) => x.id === id)?.name ?? "—" : null);
  const cur = ctx.company.baseCurrency;
  const canApprove = ctx.permissions.has("accounting.approve");
  const canCreate = ctx.permissions.has("accounting.create");
  const reversible = e.status === "POSTED" && !e.reversedBy && (!e.sourceType || e.sourceType === "MANUAL" || e.sourceType === "PARTNER");
  const sourceLink =
    e.sourceType === "INVOICE" && e.sourceId ? `/invoices/${e.sourceId}`
    : e.sourceType === "PAYMENT" && e.sourceId ? `/payments?q=${encodeURIComponent(e.description.split(" ")[0])}`
    : e.sourceType?.startsWith("VEHICLE") && e.sourceId ? `/vehicles/${e.sourceId}`
    : e.sourceType?.startsWith("HERD") && e.sourceId ? `/livestock/${e.sourceId}`
    : e.sourceType === "PARTNER" && e.sourceId ? `/partners/${e.sourceId}`
    : null;

  return (
    <div className="space-y-6">
      <PageHeader title={`قيد ${e.number}`} description={e.description} icon={BookOpen}
        actions={<div className="no-print flex flex-wrap gap-2">
          <Badge variant={e.status === "POSTED" ? "success" : e.status === "DRAFT" ? "warning" : "muted"}>{JOURNAL_STATUS_LABELS[e.status]}</Badge>
          {e.status === "DRAFT" && canApprove && <ConfirmAction action={postJournalEntryAction} fields={{ id: e.id }} title="ترحيل القيد" description="بعد الترحيل لا يمكن تعديل القيد أو حذفه، ويمكن فقط عكسه بقيد عكسي." confirmLabel="ترحيل" variant="default">ترحيل</ConfirmAction>}
          {e.status === "DRAFT" && canCreate && <ConfirmAction action={deleteJournalEntryAction} fields={{ id: e.id }} title="حذف المسودة" description="سيتم حذف القيد المسودة نهائيًا." confirmLabel="حذف" destructive>حذف</ConfirmAction>}
          {reversible && canApprove && <ConfirmAction action={reverseJournalEntryAction} fields={{ id: e.id }} title="عكس القيد" description="سيُنشأ قيد عكسي مرحّل بتاريخ اليوم يلغي أثر هذا القيد، ويبقى القيد الأصلي في السجل للتدقيق." confirmLabel="إنشاء قيد عكسي">قيد عكسي</ConfirmAction>}
          <PrintButton />
        </div>} />
      <AccountingNav active="/accounting/journal" />
      <Card className="print-card">
        <CardContent className="space-y-5 pt-5">
          <KeyValue items={[
            ["التاريخ", fmtDate(e.date)],
            ["المصدر", sourceLink ? <Link href={sourceLink} className="text-gold hover:underline">{SOURCE_LABELS[e.sourceType ?? "MANUAL"] ?? e.sourceType}</Link> : SOURCE_LABELS[e.sourceType ?? "MANUAL"] ?? e.sourceType],
            ["أنشأه", name(users, e.createdById)],
            ["رحّله", e.postedAt ? `${name(users, e.postedById) ?? "—"} · ${fmtDate(e.postedAt)}` : null],
            ["عكس للقيد", e.reversalOf ? <Link href={`/accounting/journal/${e.reversalOf.id}`} className="text-gold hover:underline">{e.reversalOf.number}</Link> : null],
            ["معكوس بالقيد", e.reversedBy ? <Link href={`/accounting/journal/${e.reversedBy.id}`} className="text-gold hover:underline">{e.reversedBy.number}</Link> : null],
          ]} />
          <Table>
            <THead><TR><TH>الحساب</TH><TH>البيان</TH><TH>النشاط</TH><TH>الطرف</TH><TH>العملة الأصلية</TH><TH>مدين</TH><TH>دائن</TH></TR></THead>
            <TBody>
              {e.lines.map((l) => (
                <TR key={l.id}>
                  <TD><Link href={`/accounting/ledger?account=${l.accountId}`} className="font-semibold hover:text-gold"><span className="font-mono text-xs text-muted-foreground">{l.account.code}</span> {l.account.name}</Link></TD>
                  <TD className="max-w-xs truncate">{l.description ?? "—"}</TD>
                  <TD>{name(activities, l.activityId) ?? "—"}</TD>
                  <TD>{name(customers, l.customerId) ?? name(suppliers, l.supplierId) ?? name(partners, l.partnerId) ?? "—"}</TD>
                  <TD className="text-xs text-muted-foreground">{l.currency !== cur ? <span className="num">{l.fxAmount.toFixed(2)} {l.currency} @ {l.fxRate.toString()}</span> : "—"}</TD>
                  <TD><Money value={l.debit} currency={cur} /></TD>
                  <TD><Money value={l.credit} currency={cur} /></TD>
                </TR>
              ))}
            </TBody>
            <TFoot><TR><TD colSpan={5}>الإجمالي</TD><TD><Money value={sum(e.lines.map((l) => l.debit))} currency={cur} /></TD><TD><Money value={sum(e.lines.map((l) => l.credit))} currency={cur} /></TD></TR></TFoot>
          </Table>
        </CardContent>
      </Card>
      <p className="no-print flex items-center gap-1 text-xs text-muted-foreground"><Printer className="size-3" /> للحفظ بصيغة PDF استخدم زر الطباعة ثم اختر &quot;حفظ كـ PDF&quot;.</p>
    </div>
  );
}
