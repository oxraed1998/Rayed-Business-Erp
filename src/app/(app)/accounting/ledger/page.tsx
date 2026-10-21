import Link from "next/link";
import { BookOpen } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { generalLedger } from "@/lib/accounting/reports";
import { fmtDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { AccountingNav } from "@/components/accounting/accounting-nav";
import { PrintButton } from "@/components/accounting/print-button";

export const metadata = { title: "دفتر الأستاذ" };

const parse = (v?: string) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export default async function LedgerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("accounting.read");
  const sp = await searchParams;
  const accounts = await db.account.findMany({ where: scope(ctx), orderBy: { code: "asc" } });
  const account = accounts.find((a) => a.id === sp.account);
  const from = parse(sp.from), to = parse(sp.to);
  const ledger = account ? await generalLedger({ tenantId: ctx.tenant.id, companyId: ctx.company.id, accountId: account.id, from, to }) : null;
  const cur = ctx.company.baseCurrency;
  return (
    <div>
      <PageHeader title="دفتر الأستاذ العام" description={account ? `${account.code} · ${account.name}` : "اختر حسابًا لعرض حركاته"} icon={BookOpen} actions={account && <PrintButton />} />
      <AccountingNav active="/accounting/ledger" />
      <form method="get" className="no-print mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 shadow-soft">
        <label className="space-y-1 text-xs font-semibold">الحساب
          <NativeSelect name="account" defaultValue={account?.id ?? ""} className="h-9 min-w-[240px]" required>
            <option value="">اختر الحساب</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </NativeSelect>
        </label>
        <label className="space-y-1 text-xs font-semibold">من<Input type="date" name="from" defaultValue={sp.from} className="h-9 w-40" /></label>
        <label className="space-y-1 text-xs font-semibold">إلى<Input type="date" name="to" defaultValue={sp.to} className="h-9 w-40" /></label>
        <Button size="sm" className="h-9">عرض</Button>
      </form>
      <Card className="print-card">
        <CardContent className="p-0">
          {ledger ? (
            <Table>
              <THead><TR><TH>التاريخ</TH><TH>القيد</TH><TH>البيان</TH><TH>مدين</TH><TH>دائن</TH><TH>الرصيد</TH></TR></THead>
              <TBody>
                <TR className="bg-muted/40"><TD colSpan={5} className="font-semibold">الرصيد الافتتاحي</TD><TD><Money value={ledger.opening} currency={cur} /></TD></TR>
                {ledger.rows.map(({ line, balance }) => (
                  <TR key={line.id}>
                    <TD>{fmtDate(line.entry.date)}</TD>
                    <TD><Link href={`/accounting/journal/${line.entryId}`} className="font-mono text-xs hover:text-gold">{line.entry.number}</Link></TD>
                    <TD className="max-w-md truncate">{line.description ?? line.entry.description}</TD>
                    <TD><Money value={line.debit} currency={cur} /></TD>
                    <TD><Money value={line.credit} currency={cur} /></TD>
                    <TD><Money value={balance} currency={cur} className="font-semibold" /></TD>
                  </TR>
                ))}
                {!ledger.rows.length && <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">لا توجد حركات في الفترة</TD></TR>}
              </TBody>
              <TFoot><TR><TD colSpan={5}>الرصيد الختامي</TD><TD><Money value={ledger.closing} currency={cur} /></TD></TR></TFoot>
            </Table>
          ) : <EmptyState icon={BookOpen} title="اختر حسابًا" description="يعرض دفتر الأستاذ كل الحركات المرحّلة على الحساب مع الرصيد الجاري" />}
        </CardContent>
      </Card>
      {ledger && ledger.rows.length >= 2000 && <p className="mt-2 text-xs text-warning">يعرض أول 2000 حركة فقط؛ ضيّق الفترة الزمنية.</p>}
    </div>
  );
}
