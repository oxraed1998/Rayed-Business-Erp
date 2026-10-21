import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext } from "@/lib/context";
import { accountBalances, balanceSheet, incomeStatement, trialBalance, type AccountBalance } from "@/lib/accounting/reports";
import { isDebitNormal } from "@/lib/accounting/chart";
import { D } from "@/lib/money";
import { cn, fmtDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { AccountingNav } from "@/components/accounting/accounting-nav";
import { PrintButton } from "@/components/accounting/print-button";

export const metadata = { title: "القوائم المالية" };

const REPORTS = { trial: "ميزان المراجعة", income: "قائمة الدخل", balance: "الميزانية العمومية" } as const;
type ReportKey = keyof typeof REPORTS;

const validDate = (v: string | undefined, fb: Date) => {
  const d = v ? new Date(v) : fb;
  return Number.isNaN(d.getTime()) ? fb : d;
};

/** Removes year-end closing entries so a closed period still shows its revenue and expenses. */
async function withoutClosing(rows: AccountBalance[], tenantId: string, companyId: string, from: Date, to: Date) {
  const closing = await db.journalLine.groupBy({
    by: ["accountId"],
    where: { tenantId, entry: { companyId, sourceType: "PERIOD_CLOSE", status: { in: ["POSTED", "REVERSED"] }, date: { gte: from, lte: to } } },
    _sum: { debit: true, credit: true },
  });
  const map = new Map(closing.map((c) => [c.accountId, c._sum]));
  return rows.map((r) => {
    const c = map.get(r.account.id);
    if (!c) return r;
    const debit = r.debit.minus(D(c.debit ?? 0)), credit = r.credit.minus(D(c.credit ?? 0));
    return { ...r, debit, credit, balance: isDebitNormal(r.account.type) ? debit.minus(credit) : credit.minus(debit) };
  });
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("accounting.read");
  const sp = await searchParams;
  const report: ReportKey = sp.report && sp.report in REPORTS ? (sp.report as ReportKey) : "trial";
  const now = new Date();
  const from = validDate(sp.from, new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));
  const to = validDate(sp.to, now);
  const activities = await db.businessActivity.findMany({ where: { tenantId: ctx.tenant.id, companyId: ctx.company.id } });
  const activityId = activities.some((a) => a.id === sp.activity) ? sp.activity : undefined;
  const base = { tenantId: ctx.tenant.id, companyId: ctx.company.id };
  const cur = ctx.company.baseCurrency;
  const qs = (r: ReportKey) => `?${new URLSearchParams({ report: r, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), ...(activityId ? { activity: activityId } : {}) })}`;

  let body: React.ReactNode;
  if (report === "trial") {
    const tb = trialBalance(await accountBalances({ ...base, from, to, activityId }));
    body = tb.lines.length ? (
      <Table>
        <THead><TR><TH>الرمز</TH><TH>الحساب</TH><TH>إجمالي مدين</TH><TH>إجمالي دائن</TH><TH>رصيد مدين</TH><TH>رصيد دائن</TH></TR></THead>
        <TBody>
          {tb.lines.map((l) => (
            <TR key={l.account.id}>
              <TD className="font-mono text-xs">{l.account.code}</TD>
              <TD><Link href={`/accounting/ledger?account=${l.account.id}&from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`} className="hover:text-gold">{l.account.name}</Link></TD>
              <TD><Money value={l.debit} currency={cur} className="text-muted-foreground" /></TD>
              <TD><Money value={l.credit} currency={cur} className="text-muted-foreground" /></TD>
              <TD><Money value={l.debitBalance} currency={cur} /></TD>
              <TD><Money value={l.creditBalance} currency={cur} /></TD>
            </TR>
          ))}
        </TBody>
        <TFoot><TR><TD colSpan={4}>الإجمالي {tb.balanced ? <Badge variant="success" className="ms-2">متوازن</Badge> : <Badge variant="destructive" className="ms-2">غير متوازن</Badge>}</TD><TD><Money value={tb.totalDebit} currency={cur} /></TD><TD><Money value={tb.totalCredit} currency={cur} /></TD></TR></TFoot>
      </Table>
    ) : <EmptyState title="لا توجد حركات في الفترة" />;
  } else if (report === "income") {
    const is = incomeStatement(await withoutClosing(await accountBalances({ ...base, from, to, activityId }), base.tenantId, base.companyId, from, to));
    const section = (title: string, rows: AccountBalance[], total: Parameters<typeof Money>[0]["value"]) => (
      <>
        <TR className="bg-muted/40"><TD colSpan={2} className="font-bold">{title}</TD></TR>
        {rows.map((r) => <TR key={r.account.id}><TD className="ps-8">{r.account.code} · {r.account.name}</TD><TD><Money value={r.balance} currency={cur} /></TD></TR>)}
        <TR><TD className="font-semibold">إجمالي {title}</TD><TD><Money value={total} currency={cur} className="font-bold" /></TD></TR>
      </>
    );
    body = (
      <Table>
        <THead><TR><TH>البند</TH><TH>المبلغ</TH></TR></THead>
        <TBody>
          {section("الإيرادات", is.revenue, is.totalRevenue)}
          {section("تكلفة المبيعات", is.cogs, is.totalCogs)}
          <TR className="bg-gold-soft"><TD className="font-extrabold">مجمل الربح</TD><TD><Money value={is.grossProfit} currency={cur} signed className="font-extrabold" /></TD></TR>
          {section("المصروفات التشغيلية", is.opex, is.totalOpex)}
        </TBody>
        <TFoot><TR><TD>صافي الربح (الخسارة)</TD><TD><Money value={is.netProfit} currency={cur} signed className="text-base" /></TD></TR></TFoot>
      </Table>
    );
  } else {
    const bs = balanceSheet(await accountBalances({ ...base, to }));
    const list = (rows: AccountBalance[]) => rows.map((r) => <TR key={r.account.id}><TD className="ps-8">{r.account.code} · {r.account.name}</TD><TD><Money value={r.balance} currency={cur} /></TD></TR>);
    body = (
      <div className="grid gap-4 lg:grid-cols-2">
        <Table>
          <THead><TR><TH>الأصول</TH><TH>المبلغ</TH></TR></THead>
          <TBody>{list(bs.assets)}</TBody>
          <TFoot><TR><TD>إجمالي الأصول</TD><TD><Money value={bs.totalAssets} currency={cur} /></TD></TR></TFoot>
        </Table>
        <Table>
          <THead><TR><TH>الخصوم وحقوق الملكية</TH><TH>المبلغ</TH></TR></THead>
          <TBody>
            <TR className="bg-muted/40"><TD colSpan={2} className="font-bold">الخصوم</TD></TR>
            {list(bs.liabilities)}
            <TR><TD className="font-semibold">إجمالي الخصوم</TD><TD><Money value={bs.totalLiabilities} currency={cur} className="font-bold" /></TD></TR>
            <TR className="bg-muted/40"><TD colSpan={2} className="font-bold">حقوق الملكية</TD></TR>
            {list(bs.equity)}
            <TR><TD className="ps-8">صافي ربح الفترة غير المقفلة</TD><TD><Money value={bs.netProfit} currency={cur} signed /></TD></TR>
            <TR><TD className="font-semibold">إجمالي حقوق الملكية</TD><TD><Money value={bs.totalEquity} currency={cur} className="font-bold" /></TD></TR>
          </TBody>
          <TFoot><TR><TD>إجمالي الخصوم وحقوق الملكية</TD><TD><Money value={bs.totalLiabilities.plus(bs.totalEquity)} currency={cur} /></TD></TR></TFoot>
        </Table>
        <p className={cn("rounded-lg p-3 text-sm lg:col-span-2", bs.balanced ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
          {bs.balanced ? "✓ الميزانية متوازنة: الأصول = الخصوم + حقوق الملكية" : "تنبيه: الميزانية غير متوازنة"}
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="القوائم المالية" description={`${ctx.company.name} · ${report === "balance" ? `كما في ${fmtDate(to)}` : `من ${fmtDate(from)} إلى ${fmtDate(to)}`}`} icon={BarChart3} actions={<PrintButton />} />
      <AccountingNav active="/accounting/reports" />
      <div className="no-print mb-4 flex flex-wrap gap-1">
        {(Object.keys(REPORTS) as ReportKey[]).map((r) => (
          <Button key={r} asChild variant={r === report ? "default" : "outline"} size="sm"><Link href={qs(r)}>{REPORTS[r]}</Link></Button>
        ))}
      </div>
      <form method="get" className="no-print mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 shadow-soft">
        <input type="hidden" name="report" value={report} />
        {report !== "balance" && <label className="space-y-1 text-xs font-semibold">من<Input type="date" name="from" defaultValue={from.toISOString().slice(0, 10)} className="h-9 w-40" /></label>}
        <label className="space-y-1 text-xs font-semibold">{report === "balance" ? "كما في" : "إلى"}<Input type="date" name="to" defaultValue={to.toISOString().slice(0, 10)} className="h-9 w-40" /></label>
        {report !== "balance" && (
          <label className="space-y-1 text-xs font-semibold">النشاط
            <NativeSelect name="activity" defaultValue={activityId ?? ""} className="h-9 w-44"><option value="">كل الأنشطة</option>{activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</NativeSelect>
          </label>
        )}
        <Button size="sm" className="h-9">عرض</Button>
      </form>
      <Card className="print-card">
        <CardHeader><CardTitle>{REPORTS[report]}</CardTitle></CardHeader>
        <CardContent className={report === "balance" ? "" : "p-0"}>{body}</CardContent>
      </Card>
    </div>
  );
}
