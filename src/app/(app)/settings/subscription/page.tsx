import { CheckCircle2, CreditCard } from "lucide-react";
import type { PlanCode } from "@prisma/client";
import { db } from "@/lib/db";
import { pageContext } from "@/lib/context";
import { planLimits, PLAN_DEFAULTS } from "@/server/services/tenancy";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, StatCard, Unavailable } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SettingsNav } from "@/components/settings/settings-nav";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "الاشتراك" };

const STATUS_LABELS = { TRIALING: "تجريبي", ACTIVE: "نشط", PAST_DUE: "متأخر السداد", CANCELLED: "ملغى", EXPIRED: "منتهي" } as const;
const FEATURE_LABELS: Record<string, string> = { core: "الأساسيات (سيارات، مواشي، ملابس، عملاء)", inventory: "المخزون والمستودعات", invoices: "الفواتير والمدفوعات", accounting: "المحاسبة والقوائم المالية", partners: "الشركاء والمستثمرون", reports: "التقارير والتصدير", audit: "سجل التدقيق المتقدم" };

export default async function SubscriptionPage() {
  const ctx = await pageContext("subscription.read");
  const [{ sub, plan, active }, companies, users, plans] = await Promise.all([
    planLimits(db, ctx.tenant.id),
    db.company.count({ where: { tenantId: ctx.tenant.id } }),
    db.membership.count({ where: { tenantId: ctx.tenant.id, isActive: true } }),
    db.subscriptionPlan.findMany({ orderBy: { monthlyPrice: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="الإعدادات" description={ctx.tenant.name} icon={CreditCard} />
      <SettingsNav active="/settings/subscription" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="الباقة الحالية" value={plan.nameAr} tone="gold" />
        <StatCard label="حالة الاشتراك" value={<Badge variant={active ? "success" : "destructive"} className="text-sm">{STATUS_LABELS[sub.status]}</Badge>} hint={sub.expiresAt ? `ينتهي ${fmtDate(sub.expiresAt)}` : "بدون تاريخ انتهاء"} />
        <StatCard label="الشركات" value={`${companies} / ${plan.maxCompanies}`} />
        <StatCard label="المستخدمون" value={`${users} / ${plan.maxUsers}`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader><CardTitle>مقارنة الباقات</CardTitle><CardDescription>الأسعار شهرية وقابلة للتعديل من إدارة المنصة</CardDescription></CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead><TR><TH>الباقة</TH><TH>الشركات</TH><TH>المستخدمون</TH><TH>السعر الشهري</TH><TH>المزايا</TH></TR></THead>
              <TBody>
                {plans.map((p) => (
                  <TR key={p.id} className={p.id === plan.id ? "bg-gold-soft/60" : ""}>
                    <TD className="font-bold">{p.nameAr}{p.id === plan.id && <Badge variant="gold" className="ms-2">باقتك</Badge>}</TD>
                    <TD>{p.maxCompanies}</TD><TD>{p.maxUsers}</TD>
                    <TD><Money value={p.monthlyPrice} currency={p.currency} /></TD>
                    <TD className="whitespace-normal text-xs">{(p.features.length ? p.features : PLAN_DEFAULTS[p.code as PlanCode].features).map((f) => FEATURE_LABELS[f] ?? f).join("، ")}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>مزايا باقتك</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {plan.features.map((f) => <p key={f} className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-success" />{FEATURE_LABELS[f] ?? f}</p>)}
            </CardContent>
          </Card>
          <Unavailable feature="الدفع الإلكتروني">الدفع الإلكتروني غير مفعّل — لم يتم ربط مزود دفع. الترقية أو التخفيض تتم حاليًا عبر إدارة المنصة، ولا يتم تحصيل أي مبالغ تلقائيًا.</Unavailable>
          <p className="text-xs text-muted-foreground">ملاحظة: حدود الشركات والمستخدمين مطبّقة فعليًا على الخادم. تقييد الوصول حسب مزايا الباقة غير مطبّق بعد.</p>
        </div>
      </div>
    </div>
  );
}
