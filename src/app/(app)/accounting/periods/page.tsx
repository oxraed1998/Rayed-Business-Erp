import { CalendarRange, Lock } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { fmtDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { AccountingNav } from "@/components/accounting/accounting-nav";
import { NewPeriodDialog } from "@/components/accounting/period-dialog";
import { closePeriodAction } from "@/server/actions/accounting";

export const metadata = { title: "الفترات المالية" };

export default async function PeriodsPage() {
  const ctx = await pageCompanyContext("accounting.read");
  const periods = await db.financialPeriod.findMany({ where: scope(ctx), orderBy: { startDate: "desc" } });
  const closers = await db.user.findMany({ where: { id: { in: periods.map((p) => p.closedById).filter(Boolean) as string[] }, memberships: { some: { tenantId: ctx.tenant.id } } }, select: { id: true, name: true } });
  const canClose = ctx.permissions.has("accounting.close");
  return (
    <div>
      <PageHeader title="الفترات المالية" description="إقفال الفترة يرحّل قيد إقفال الإيرادات والمصروفات إلى الأرباح المبقاة ويمنع أي ترحيل لاحق بتاريخ داخلها" icon={CalendarRange} actions={canClose && <NewPeriodDialog />} />
      <AccountingNav active="/accounting/periods" />
      <Card>
        <CardContent className="p-0">
          {periods.length ? (
            <Table>
              <THead><TR><TH>الفترة</TH><TH>من</TH><TH>إلى</TH><TH>الحالة</TH><TH>أُقفلت بواسطة</TH><TH /></TR></THead>
              <TBody>
                {periods.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-semibold">{p.name}</TD>
                    <TD>{fmtDate(p.startDate)}</TD>
                    <TD>{fmtDate(p.endDate)}</TD>
                    <TD>{p.isClosed ? <Badge variant="muted"><Lock className="size-3" /> مقفلة</Badge> : <Badge variant="success">مفتوحة</Badge>}</TD>
                    <TD className="text-xs text-muted-foreground">{p.isClosed ? `${closers.find((u) => u.id === p.closedById)?.name ?? "—"} · ${fmtDate(p.closedAt)}` : "—"}</TD>
                    <TD>
                      {!p.isClosed && canClose && (
                        <ConfirmAction action={closePeriodAction} fields={{ id: p.id }} title={`إقفال ${p.name}`} destructive confirmLabel="إقفال الفترة"
                          description="سيتم ترحيل قيد إقفال يصفّر حسابات الإيرادات والمصروفات للفترة ويحوّل صافي الربح إلى الأرباح المبقاة، ثم تُقفل الفترة نهائيًا ولن يُسمح بأي ترحيل بتاريخ داخلها. يجب ترحيل أو حذف المسودات أولًا. لا يمكن التراجع عن هذا الإجراء.">
                          إقفال
                        </ConfirmAction>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <EmptyState icon={CalendarRange} title="لا توجد فترات مالية" />}
        </CardContent>
      </Card>
    </div>
  );
}
