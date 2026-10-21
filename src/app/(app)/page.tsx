import Link from "next/link";
import {
  ArrowDownRight, ArrowUpRight, Banknote, Beef, Car, CalendarClock, FileSignature, HandCoins, Landmark, Package, Receipt, Shirt, TrendingUp, Wallet,
} from "lucide-react";
import { db } from "@/lib/db";
import { pageContext } from "@/lib/context";
import { accountBalances, activityPerformance, balanceSheet, incomeStatement, monthlyPerformance } from "@/lib/accounting/reports";
import { herdSummary } from "@/lib/domain/livestock";
import { D, formatMoney, sum } from "@/lib/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { NativeSelect, Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActivityChart, ExpenseBreakdown, MonthlyChart } from "@/components/dashboard/charts";

export const metadata = { title: "لوحة التحكم" };

function parseDate(v: string | undefined, fallback: Date) {
  const d = v ? new Date(v) : fallback;
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; activity?: string }> }) {
  const ctx = await pageContext();
  const company = ctx.company;
  if (!company) {
    return (
      <Card className="mt-10"><EmptyState icon={Landmark} title="ابدأ بإنشاء شركتك الأولى" description="أنشئ شركة وحدد أنشطتها (سيارات، مواشي، ملابس) ليتم تجهيز دليل الحسابات تلقائيًا."
        action={ctx.permissions.has("companies.manage") ? <Button asChild><Link href="/settings/companies?first=1">إنشاء شركة</Link></Button> : undefined} /></Card>
    );
  }
  const sp = await searchParams;
  const now = new Date();
  const from = parseDate(sp.from, new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));
  const to = parseDate(sp.to, now);
  const activities = await db.businessActivity.findMany({ where: { tenantId: ctx.tenant.id, companyId: company.id }, orderBy: { createdAt: "asc" } });
  const activityId = activities.some((a) => a.id === sp.activity) ? sp.activity : undefined;
  const showFinance = ctx.permissions.has("financials.read");
  const base = { tenantId: ctx.tenant.id, companyId: company.id };
  const cur = company.baseCurrency;
  const m = (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, cur);

  // Operational counts (visible to everyone who can see the dashboard).
  const [vehiclesInStock, herds, variants, activeContracts, installments] = await Promise.all([
    db.vehicle.count({ where: { ...base, status: { notIn: ["SOLD", "CANCELLED"] } } }),
    db.livestockHerd.findMany({ where: base, include: { events: true, expenses: true } }),
    db.productVariant.aggregate({ where: { tenantId: ctx.tenant.id, product: { companyId: company.id } }, _sum: { quantityOnHand: true } }),
    db.contract.count({ where: { ...base, status: "ACTIVE" } }),
    showFinance ? db.installment.findMany({ where: { tenantId: ctx.tenant.id, plan: { companyId: company.id } } }) : Promise.resolve([]),
  ]);
  const heads = herds.reduce((a, h) => a + herdSummary(h.events, h.expenses).remaining, 0);

  let fin: null | {
    is: ReturnType<typeof incomeStatement>; bs: ReturnType<typeof balanceSheet>; cash: string; inventory: string; ar: string; ap: string; capital: string;
    monthly: Awaited<ReturnType<typeof monthlyPerformance>>; byActivity: Awaited<ReturnType<typeof activityPerformance>>;
    expenses: { name: string; value: number }[]; installmentsDue: string; overdue: number;
  } = null;

  if (showFinance) {
    const [periodRows, asOfRows, monthly, byActivity] = await Promise.all([
      accountBalances({ ...base, from, to, activityId }),
      accountBalances({ ...base, to }),
      monthlyPerformance({ ...base, from, to, activityId }),
      activityPerformance({ ...base, from, to }),
    ]);
    // Period P&L excludes year-end closing entries so closed periods still show their results.
    const closing = await db.journalLine.groupBy({
      by: ["accountId"],
      where: { tenantId: ctx.tenant.id, entry: { companyId: company.id, sourceType: "PERIOD_CLOSE", date: { gte: from, lte: to } } },
      _sum: { debit: true, credit: true },
    });
    const closeMap = new Map(closing.map((c) => [c.accountId, c._sum]));
    const plRows = periodRows.map((r) => {
      const c = closeMap.get(r.account.id);
      if (!c) return r;
      const debit = r.debit.minus(D(c.debit ?? 0)), credit = r.credit.minus(D(c.credit ?? 0));
      return { ...r, debit, credit, balance: r.account.type === "EXPENSE" ? debit.minus(credit) : credit.minus(debit) };
    });
    const is = incomeStatement(plRows);
    const bs = balanceSheet(asOfRows);
    const byKey = (pred: (k: string | null, cash: boolean) => boolean) => sum(asOfRows.filter((r) => pred(r.account.systemKey, r.account.isCashLike)).map((r) => r.balance));
    const due = sum(installments.map((i) => D(i.amount).minus(i.paidAmount)));
    const today0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    fin = {
      is, bs, monthly, byActivity,
      cash: m(byKey((_, c) => c)),
      inventory: m(byKey((k) => Boolean(k?.startsWith("INV_") || k === "GOODS_IN_TRANSIT"))),
      ar: m(byKey((k) => k === "AR")),
      ap: m(byKey((k) => k === "AP")),
      capital: m(byKey((k) => k === "CAPITAL" || k === "PARTNER_CURRENT")),
      expenses: [...is.cogs, ...is.opex].sort((a, b) => b.balance.comparedTo(a.balance)).slice(0, 7).map((r) => ({ name: r.account.name, value: Number(r.balance.toFixed(2)) })),
      installmentsDue: m(due),
      overdue: installments.filter((i) => i.dueDate < today0 && D(i.amount).greaterThan(i.paidAmount)).length,
    };
  }

  const monthlyData = fin?.monthly.map((x) => ({ month: x.month, revenue: Number(x.revenue.toFixed(2)), expenses: Number(x.expenses.toFixed(2)), profit: Number(x.profit.toFixed(2)) })) ?? [];
  const activityData = fin?.byActivity.map((a) => ({
    name: activities.find((x) => x.id === a.activityId)?.name ?? "غير مصنف",
    revenue: Number(a.revenue.toFixed(2)), expenses: Number(a.expenses.toFixed(2)),
  })) ?? [];
  const net = fin?.is.netProfit;

  return (
    <div className="space-y-6">
      <PageHeader title={`مرحبًا، ${ctx.user.name.split(" ")[0]}`} description={`${company.name} · المبالغ بعملة الشركة الأساسية (${cur})`} />

      <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 shadow-soft" method="get">
        <label className="space-y-1 text-xs font-semibold">من<Input type="date" name="from" defaultValue={from.toISOString().slice(0, 10)} className="h-9 w-40" /></label>
        <label className="space-y-1 text-xs font-semibold">إلى<Input type="date" name="to" defaultValue={to.toISOString().slice(0, 10)} className="h-9 w-40" /></label>
        <label className="space-y-1 text-xs font-semibold">النشاط
          <NativeSelect name="activity" defaultValue={activityId ?? ""} className="h-9 w-44">
            <option value="">كل الأنشطة</option>
            {activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </NativeSelect>
        </label>
        <Button size="sm" className="h-9">تطبيق</Button>
        <p className="ms-auto text-[11px] text-muted-foreground">الشركة: من القائمة العلوية · العملة: {cur} (لا يتوفر تحويل عرض لعملة أخرى حاليًا)</p>
      </form>

      {fin ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="إجمالي الإيرادات" value={m(fin.is.totalRevenue)} icon={TrendingUp} />
            <StatCard label="إجمالي المصروفات" value={m(fin.is.totalCogs.plus(fin.is.totalOpex))} icon={Receipt} tone="danger" />
            <StatCard label="صافي الربح" value={m(fin.is.netProfit)} icon={net && net.isNegative() ? ArrowDownRight : ArrowUpRight} tone={net && net.isNegative() ? "danger" : "success"}
              hint={fin.is.totalRevenue.isZero() ? undefined : `هامش ${fin.is.netProfit.div(fin.is.totalRevenue).times(100).toFixed(1)}%`} />
            <StatCard label="النقد المتاح" value={fin.cash} icon={Wallet} tone="gold" hint="الصندوق والبنوك" />
            <StatCard label="رأس المال وجاري الشركاء" value={fin.capital} icon={Landmark} />
            <StatCard label="قيمة المخزون" value={fin.inventory} icon={Package} hint="سيارات، مواشي، ملابس، بضاعة بالطريق" />
            <StatCard label="ذمم العملاء" value={fin.ar} icon={HandCoins} />
            <StatCard label="ذمم الموردين" value={fin.ap} icon={Banknote} tone="danger" />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader><CardTitle>الأداء الشهري</CardTitle><CardDescription>الإيرادات والمصروفات وصافي الربح من القيود المرحّلة</CardDescription></CardHeader>
              <CardContent>
                {monthlyData.length ? (
                  <>
                    <MonthlyChart data={monthlyData} currency={cur} />
                    <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">عرض البيانات كجدول</summary>
                      <Table><THead><TR><TH>الشهر</TH><TH>الإيرادات</TH><TH>المصروفات</TH><TH>صافي الربح</TH></TR></THead>
                        <TBody>{monthlyData.map((r) => <TR key={r.month}><TD>{r.month}</TD><TD className="num">{m(r.revenue)}</TD><TD className="num">{m(r.expenses)}</TD><TD className="num">{m(r.profit)}</TD></TR>)}</TBody></Table>
                    </details>
                  </>
                ) : <EmptyState icon={TrendingUp} title="لا توجد حركات في الفترة" description="ستظهر الرسوم عند تسجيل المبيعات والمصروفات." />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>توزيع المصروفات</CardTitle><CardDescription>أكبر بنود التكلفة في الفترة</CardDescription></CardHeader>
              <CardContent>{fin.expenses.length ? <ExpenseBreakdown data={fin.expenses} currency={cur} /> : <EmptyState title="لا توجد مصروفات" />}</CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader><CardTitle>مقارنة الأنشطة التجارية</CardTitle><CardDescription>الإيرادات والمصروفات لكل نشاط</CardDescription></CardHeader>
              <CardContent>{activityData.length ? <ActivityChart data={activityData} currency={cur} /> : <EmptyState title="لا توجد بيانات أنشطة في الفترة" />}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>الأقساط والعقود</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Link href="/installments" className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted"><span className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4 text-gold" /> الأقساط المستحقة</span><span className="num font-bold">{fin.installmentsDue}</span></Link>
                <Link href="/installments?status=overdue" className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted"><span className="text-sm font-semibold">أقساط متأخرة</span><span className={fin.overdue ? "font-bold text-destructive" : "font-bold"}>{fin.overdue}</span></Link>
                <Link href="/contracts" className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted"><span className="flex items-center gap-2 text-sm font-semibold"><FileSignature className="size-4 text-gold" /> العقود النشطة</span><span className="font-bold">{activeContracts}</span></Link>
                <p className={`rounded-lg p-3 text-xs ${fin.bs.balanced ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>{fin.bs.balanced ? "✓ الميزانية متوازنة (الأصول = الخصوم + حقوق الملكية)" : "تنبيه: الميزانية غير متوازنة"}</p>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card><CardContent className="pt-5 text-sm text-muted-foreground">المؤشرات المالية مخفية لأن دورك لا يتضمن صلاحية الاطلاع على البيانات المالية.</CardContent></Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/vehicles"><StatCard label="مخزون السيارات" value={`${vehiclesInStock} سيارة`} icon={Car} tone="gold" hint="غير مباعة" /></Link>
        <Link href="/livestock"><StatCard label="مخزون المواشي" value={`${heads} رأس`} icon={Beef} tone="gold" hint={`${herds.length} قطيع`} /></Link>
        <Link href="/clothing"><StatCard label="مخزون الملابس" value={`${D(variants._sum.quantityOnHand ?? 0).toFixed(0)} قطعة`} icon={Shirt} tone="gold" /></Link>
      </div>
    </div>
  );
}
