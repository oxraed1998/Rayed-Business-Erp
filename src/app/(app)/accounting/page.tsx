import Link from "next/link";
import type { AccountType } from "@prisma/client";
import { BookOpen, Landmark } from "lucide-react";
import { pageCompanyContext } from "@/lib/context";
import { accountBalances, trialBalance } from "@/lib/accounting/reports";
import { ACCOUNT_TYPE_LABELS } from "@/lib/accounting/chart";
import { sum } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { AccountingNav } from "@/components/accounting/accounting-nav";
import { NewAccountDialog } from "@/components/accounting/account-dialog";

export const metadata = { title: "دليل الحسابات" };
const ORDER: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];

export default async function AccountsPage() {
  const ctx = await pageCompanyContext("accounting.read");
  const rows = await accountBalances({ tenantId: ctx.tenant.id, companyId: ctx.company.id });
  const tb = trialBalance(rows);
  const cur = ctx.company.baseCurrency;
  const canCreate = ctx.permissions.has("accounting.create");
  const cash = sum(rows.filter((r) => r.account.isCashLike).map((r) => r.balance));
  return (
    <div>
      <PageHeader title="المحاسبة" description="نظام قيد مزدوج: كل قيد مرحّل متوازن ولا يمكن تعديله إلا بقيد عكسي" icon={BookOpen}
        actions={canCreate && <NewAccountDialog parents={rows.map((r) => ({ value: r.account.id, label: `${r.account.code} · ${r.account.name}` }))} />} />
      <AccountingNav active="/accounting" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="عدد الحسابات" value={rows.length} icon={Landmark} />
        <StatCard label="النقد في الصناديق والبنوك" value={<Money value={cash} currency={cur} />} tone="gold" />
        <StatCard label="إجمالي المدين (ميزان المراجعة)" value={<Money value={tb.totalDebit} currency={cur} />} />
        <StatCard label="حالة الميزان" value={tb.balanced ? "متوازن ✓" : "غير متوازن"} tone={tb.balanced ? "success" : "danger"} />
      </div>
      <div className="space-y-4">
        {ORDER.map((type) => {
          const list = rows.filter((r) => r.account.type === type);
          if (!list.length) return null;
          return (
            <Card key={type}>
              <CardHeader className="flex-row items-center justify-between"><CardTitle>{ACCOUNT_TYPE_LABELS[type]}</CardTitle><Money value={sum(list.map((r) => r.balance))} currency={cur} className="font-bold" /></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <THead><TR><TH>الرمز</TH><TH>الحساب</TH><TH>مدين</TH><TH>دائن</TH><TH>الرصيد</TH></TR></THead>
                  <TBody>
                    {list.map((r) => (
                      <TR key={r.account.id}>
                        <TD className="font-mono text-xs">{r.account.code}</TD>
                        <TD>
                          <Link href={`/accounting/ledger?account=${r.account.id}`} className="font-semibold hover:text-gold">{r.account.name}</Link>
                          {r.account.isCashLike && <Badge variant="gold" className="ms-2">نقدية</Badge>}
                          {r.account.iban && <span className="ms-2 font-mono text-[11px] text-muted-foreground" dir="ltr">{r.account.iban}</span>}
                          {!r.account.isActive && <Badge variant="muted" className="ms-2">موقوف</Badge>}
                        </TD>
                        <TD><Money value={r.debit} currency={cur} className="text-muted-foreground" /></TD>
                        <TD><Money value={r.credit} currency={cur} className="text-muted-foreground" /></TD>
                        <TD><Money value={r.balance} currency={cur} className="font-semibold" /></TD>
                      </TR>
                    ))}
                  </TBody>
                  <TFoot><TR><TD colSpan={4}>إجمالي {ACCOUNT_TYPE_LABELS[type]}</TD><TD><Money value={sum(list.map((r) => r.balance))} currency={cur} /></TD></TR></TFoot>
                </Table>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
