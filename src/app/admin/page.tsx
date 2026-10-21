import { Building2, ShieldCheck, Users } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/context";
import { ensurePlans } from "@/server/services/tenancy";
import { createTenantAction, toggleTenantAction } from "@/server/actions/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard, Unavailable } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination, pageParam } from "@/components/data/filter-bar";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { SelectField, TextField } from "@/components/forms/fields";
import { OneTimeLinkDialog } from "@/components/settings/one-time-link";
import { PlanDialog, SubscriptionDialog } from "@/components/admin/admin-forms";
import { PLAN_OPTS, STATUS_OPTS } from "@/components/admin/plan-options";
import { fmtDate, isoDate } from "@/lib/utils";

const PAGE = 30;
const STATUS_LABEL = Object.fromEntries(STATUS_OPTS.map((o) => [o.value, o.label]));

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSuperAdmin();
  await ensurePlans();
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const where: Prisma.TenantWhereInput = {
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { slug: { contains: sp.q, mode: "insensitive" } }] } : {}),
    ...(sp.plan ? { subscription: { plan: { code: sp.plan as never } } } : {}),
  };
  // Platform view: tenant metadata and counts only — never tenant business or financial data.
  const [tenants, total, plans, tenantCount, userCount, activeSubs] = await Promise.all([
    db.tenant.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE,
      include: { subscription: { include: { plan: true } }, _count: { select: { companies: true, memberships: { where: { isActive: true } } } } },
    }),
    db.tenant.count({ where }),
    db.subscriptionPlan.findMany({ orderBy: { monthlyPrice: "asc" } }),
    db.tenant.count(),
    db.user.count(),
    db.subscription.count({ where: { status: { in: ["ACTIVE", "TRIALING"] } } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="عملاء المنصة (المنشآت)" description="إدارة الاشتراكات والمنشآت دون الاطلاع على بياناتها التجارية" icon={ShieldCheck}
        actions={
          <OneTimeLinkDialog title="منشأة جديدة" description="تُنشأ المنشأة مع دعوة لمالكها. لن تُضاف كعضو فيها." trigger="منشأة جديدة" action={createTenantAction} submitLabel="إنشاء">
            <TextField name="name" label="اسم المنشأة" required />
            <TextField name="ownerEmail" label="بريد المالك" type="email" dir="ltr" required />
            <SelectField name="plan" label="الباقة" options={PLAN_OPTS} defaultValue="STARTER" required />
          </OneTimeLinkDialog>
        } />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="المنشآت" value={tenantCount} icon={Building2} />
        <StatCard label="اشتراكات نشطة" value={activeSubs} tone="success" />
        <StatCard label="المستخدمون" value={userCount} icon={Users} />
      </div>
      <Card>
        <FilterBar q={sp.q} values={sp} placeholder="ابحث باسم المنشأة" filters={[{ name: "plan", label: "الباقة", options: PLAN_OPTS }]} />
        {tenants.length ? (
          <Table>
            <THead><TR><TH>المنشأة</TH><TH>الإنشاء</TH><TH>الباقة</TH><TH>حالة الاشتراك</TH><TH>الانتهاء</TH><TH>الشركات</TH><TH>الأعضاء</TH><TH>الحالة</TH><TH /></TR></THead>
            <TBody>
              {tenants.map((t) => (
                <TR key={t.id}>
                  <TD><p className="font-bold">{t.name}</p><p className="font-mono text-[10px] text-muted-foreground" dir="ltr">{t.slug}</p></TD>
                  <TD>{fmtDate(t.createdAt)}</TD>
                  <TD>{t.subscription?.plan.nameAr ?? "—"}</TD>
                  <TD>{t.subscription ? <Badge variant={["ACTIVE", "TRIALING"].includes(t.subscription.status) ? "success" : "warning"}>{STATUS_LABEL[t.subscription.status]}</Badge> : "—"}</TD>
                  <TD>{t.subscription?.expiresAt ? fmtDate(t.subscription.expiresAt) : "—"}</TD>
                  <TD>{t._count.companies}</TD>
                  <TD>{t._count.memberships}</TD>
                  <TD><Badge variant={t.isActive ? "success" : "destructive"}>{t.isActive ? "مفعّلة" : "معلّقة"}</Badge></TD>
                  <TD>
                    <div className="flex gap-1">
                      <SubscriptionDialog tenantId={t.id} tenantName={t.name} plan={t.subscription?.plan.code ?? "FREE"} status={t.subscription?.status ?? "ACTIVE"} expiresAt={isoDate(t.subscription?.expiresAt)} note={t.subscription?.billingNote ?? ""} />
                      <ConfirmAction action={toggleTenantAction} fields={{ tenantId: t.id }} destructive={t.isActive} variant="ghost"
                        title={t.isActive ? "تعليق المنشأة؟" : "تفعيل المنشأة؟"} description={t.isActive ? "سيُمنع جميع أعضائها من الدخول وتُنهى جلساتهم. البيانات تبقى محفوظة." : "سيتمكن الأعضاء من الدخول مجددًا."}>
                        {t.isActive ? "تعليق" : "تفعيل"}
                      </ConfirmAction>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={Building2} title="لا توجد منشآت" />}
        <Pagination page={page} pageSize={PAGE} total={total} params={sp} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader><CardTitle>باقات الاشتراك</CardTitle><CardDescription>الحدود مطبّقة على الخادم عند إنشاء الشركات ودعوة المستخدمين</CardDescription></CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead><TR><TH>الباقة</TH><TH>الشركات</TH><TH>المستخدمون</TH><TH>السعر الشهري</TH><TH /></TR></THead>
              <TBody>
                {plans.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-bold">{p.nameAr} <span className="text-xs text-muted-foreground">{p.code}</span></TD>
                    <TD>{p.maxCompanies}</TD><TD>{p.maxUsers}</TD><TD><Money value={p.monthlyPrice} currency={p.currency} /></TD>
                    <TD><PlanDialog code={p.code} name={p.nameAr} maxCompanies={p.maxCompanies} maxUsers={p.maxUsers} price={p.monthlyPrice.toFixed(2)} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Unavailable feature="الفوترة والتحصيل">لم يتم ربط مزود دفع بعد، لذلك لا تُصدر فواتير اشتراك ولا يتم تحصيل أي مبالغ. تغيير الباقة هنا يدوي ويُسجَّل في سجل التدقيق.</Unavailable>
      </div>
    </div>
  );
}
