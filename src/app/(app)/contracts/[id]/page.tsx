import { notFound } from "next/navigation";
import { BellRing, FileSignature } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { fmtDate, isoDate } from "@/lib/utils";
import { CONTRACT_TEMPLATES, CONTRACT_TYPE_LABELS, effectiveStatus, renewalDue } from "@/server/services/contracts";
import { currencyOptions, toOptions } from "@/server/queries/options";
import { approveContractAction, rejectContractAction, submitContractAction, terminateContractAction } from "@/server/actions/contracts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Unavailable } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { ContractDialog } from "@/components/contracts/contract-form";
import { ContractStatusBadge } from "@/components/contracts/status-badge";
import { PrintButton } from "@/components/accounting/print-button";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCompanyContext("contracts.read");
  const { id } = await params;
  const c = await db.contract.findFirst({ where: { id, ...scope(ctx) } });
  if (!c) notFound();
  const users = await db.user.findMany({ where: { id: { in: [c.createdById, c.approvedById].filter(Boolean) as string[] }, memberships: { some: { tenantId: ctx.tenant.id } } }, select: { id: true, name: true } });
  const uname = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? "—";
  const status = effectiveStatus(c);
  const canManage = ctx.permissions.has("contracts.manage");
  const canApprove = ctx.permissions.has("contracts.approve");
  const showValue = ctx.permissions.has("financials.read") || canManage;
  return (
    <div className="space-y-6">
      <PageHeader title={c.title} description={`${c.number} · ${CONTRACT_TYPE_LABELS[c.type]}`} icon={FileSignature}
        actions={<div className="no-print flex flex-wrap items-center gap-2">
          <ContractStatusBadge status={status} />
          {renewalDue(c) && <Badge variant="warning"><BellRing className="size-3" /> ينتهي خلال {c.renewalReminderDays} يومًا أو أقل</Badge>}
          {c.status === "DRAFT" && canManage && <>
            <ContractDialog types={toOptions(CONTRACT_TYPE_LABELS)} currencies={currencyOptions} templates={CONTRACT_TEMPLATES}
              initial={{ id: c.id, type: c.type, title: c.title, parties: c.parties, startDate: isoDate(c.startDate), endDate: isoDate(c.endDate), value: c.value.toFixed(2), currency: c.currency, paymentTerms: c.paymentTerms ?? "", body: c.body ?? "", renewalReminderDays: c.renewalReminderDays }} />
            <ConfirmAction action={submitContractAction} fields={{ id: c.id }} title="إرسال للاعتماد" description="لن يمكن تعديل العقد بعد الإرسال إلا إذا أعاده المعتمد إلى مسودة." confirmLabel="إرسال" variant="default">إرسال للاعتماد</ConfirmAction>
          </>}
          {c.status === "PENDING_APPROVAL" && canApprove && <>
            <ConfirmAction action={approveContractAction} fields={{ id: c.id }} title="اعتماد العقد" description="سيصبح العقد نافذًا ويُسجّل اسمك كمعتمد." confirmLabel="اعتماد" variant="default">اعتماد</ConfirmAction>
            <ConfirmAction action={rejectContractAction} fields={{ id: c.id }} title="إعادة إلى مسودة" description="سيعود العقد إلى مسودة لتعديله." confirmLabel="إعادة">إعادة للتعديل</ConfirmAction>
          </>}
          {c.status === "ACTIVE" && canManage && <ConfirmAction action={terminateContractAction} fields={{ id: c.id }} title="إنهاء العقد" description="سيُعلّم العقد كمنتهٍ ولا يمكن إعادته نافذًا." confirmLabel="إنهاء" destructive>إنهاء</ConfirmAction>}
          <PrintButton />
        </div>} />
      <Card className="print-card">
        <CardContent className="space-y-6 p-6 sm:p-10">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
            <div>
              <p className="text-xl font-extrabold">{ctx.company.legalName ?? ctx.company.name}</p>
              {ctx.company.crNumber && <p className="text-xs text-muted-foreground">سجل تجاري: {ctx.company.crNumber}</p>}
              {ctx.company.taxNumber && <p className="text-xs text-muted-foreground">الرقم الضريبي: {ctx.company.taxNumber}</p>}
            </div>
            <div className="text-end text-sm">
              <p className="font-mono font-bold">{c.number}</p>
              <p className="text-muted-foreground">{CONTRACT_TYPE_LABELS[c.type]}</p>
            </div>
          </div>
          <h2 className="text-center text-2xl font-extrabold">{c.title}</h2>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">الأطراف</dt><dd className="mt-1 whitespace-pre-line font-semibold">{c.parties}</dd></div>
            <div><dt className="text-xs text-muted-foreground">تاريخ البداية</dt><dd className="font-semibold">{fmtDate(c.startDate)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">تاريخ النهاية</dt><dd className="font-semibold">{fmtDate(c.endDate)}</dd></div>
            {showValue && <div><dt className="text-xs text-muted-foreground">قيمة العقد</dt><dd className="font-semibold"><Money value={c.value} currency={c.currency} /></dd></div>}
            {c.paymentTerms && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">شروط الدفع</dt><dd className="mt-1 whitespace-pre-line">{c.paymentTerms}</dd></div>}
          </dl>
          {c.body && <div className="whitespace-pre-line rounded-xl border bg-muted/30 p-5 text-sm leading-8">{c.body}</div>}
          <div className="grid gap-8 pt-8 text-sm sm:grid-cols-2">
            <div className="border-t pt-2 text-center text-muted-foreground">توقيع الطرف الأول</div>
            <div className="border-t pt-2 text-center text-muted-foreground">توقيع الطرف الثاني</div>
          </div>
          <p className="text-xs text-muted-foreground">أنشأه: {uname(c.createdById)} · {fmtDate(c.createdAt)}{c.approvedAt && ` · اعتمده: ${uname(c.approvedById)} · ${fmtDate(c.approvedAt)}`}</p>
        </CardContent>
      </Card>
      <div className="no-print">
        <Unavailable feature="إرفاق ملفات العقد الموقّعة">لم يتم ربط مزود تخزين ملفات آمن بعد. لحفظ العقد بصيغة PDF استخدم زر الطباعة ثم &quot;حفظ كـ PDF&quot;.</Unavailable>
      </div>
    </div>
  );
}
