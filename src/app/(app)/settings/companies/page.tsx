import { Building2 } from "lucide-react";
import { pageContext } from "@/lib/context";
import { db } from "@/lib/db";
import { planLimits } from "@/server/services/tenancy";
import { currencyOptions } from "@/server/queries/options";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SettingsNav } from "@/components/settings/settings-nav";
import { NewCompanyForm } from "@/components/settings/company-form";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "الشركات" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const ctx = await pageContext("companies.read");
  const { first } = await searchParams;
  const [companies, { plan }] = await Promise.all([
    db.company.findMany({ where: { tenantId: ctx.tenant.id }, include: { activities: true }, orderBy: { createdAt: "asc" } }),
    planLimits(db, ctx.tenant.id),
  ]);
  const canManage = ctx.permissions.has("companies.manage");
  return (
    <div>
      <PageHeader title="الإعدادات" description={ctx.tenant.name} icon={Building2} />
      <SettingsNav active="/settings/companies" />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader><CardTitle>شركات المنشأة</CardTitle><CardDescription>{companies.length} من {plan.maxCompanies} شركة متاحة في باقة {plan.nameAr}</CardDescription></CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead><TR><TH>الشركة</TH><TH>العملة</TH><TH>الأنشطة</TH><TH>تاريخ الإنشاء</TH></TR></THead>
              <TBody>
                {companies.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-semibold">{c.name}{c.id === ctx.company?.id && <Badge variant="gold" className="ms-2">الحالية</Badge>}</TD>
                    <TD>{c.baseCurrency}</TD>
                    <TD><div className="flex flex-wrap gap-1">{c.activities.map((a) => <Badge key={a.id} variant={a.isActive ? "default" : "muted"}>{a.name}</Badge>)}</div></TD>
                    <TD>{fmtDate(c.createdAt)}</TD>
                  </TR>
                ))}
                {!companies.length && <TR><TD colSpan={4} className="py-10 text-center text-muted-foreground">لا توجد شركات بعد</TD></TR>}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        {canManage && (
          <Card className={first ? "ring-2 ring-gold" : ""}>
            <CardHeader><CardTitle>{first ? "أنشئ شركتك الأولى" : "إضافة شركة"}</CardTitle><CardDescription>يُنشأ دليل حسابات سعودي افتراضي ومستودع رئيسي وفترة مالية للسنة الحالية تلقائيًا.</CardDescription></CardHeader>
            <CardContent><NewCompanyForm currencies={currencyOptions} /></CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
