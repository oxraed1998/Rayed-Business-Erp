import Link from "next/link";
import { notFound } from "next/navigation";
import { Beef } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { herdSummary, HERD_EVENT_LABELS, LIVESTOCK_EXPENSE_CATEGORIES } from "@/lib/domain/livestock";
import { D } from "@/lib/money";
import { cashAccountOptions, customerOptions, supplierOptions, toOptions } from "@/server/queries/options";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValue, PageHeader, StatCard } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { HerdBirthDialog, HerdDeathDialog, HerdExpenseDialog, HerdPurchaseDialog, HerdSaleDialog, HerdWeighingDialog } from "@/components/livestock/herd-forms";
import { fmtDate } from "@/lib/utils";

const EVENT_VARIANT = { PURCHASE: "default", BIRTH: "success", SALE: "gold", DEATH: "destructive", WEIGHING: "muted", VACCINATION: "muted" } as const;

export default async function HerdPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCompanyContext("livestock.read");
  const { id } = await params;
  const h = await db.livestockHerd.findFirst({
    where: { id, ...scope(ctx) },
    include: { events: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] }, expenses: { orderBy: { date: "desc" } }, shipment: true },
  });
  if (!h) notFound();
  const s = herdSummary(h.events, h.expenses);
  const showCost = ctx.permissions.has("financials.read");
  const cur = ctx.company.baseCurrency;
  const canCreate = ctx.permissions.has("livestock.create");
  const canUpdate = ctx.permissions.has("livestock.update");
  const canSell = ctx.permissions.has("invoices.create") && s.remaining > 0;
  const [cash, suppliers] = canCreate || canUpdate || canSell ? await Promise.all([cashAccountOptions(ctx), supplierOptions(ctx)]) : [[], []];
  const lastWeight = h.events.find((e) => e.type === "WEIGHING" && e.avgWeightKg);

  return (
    <div className="space-y-6">
      <PageHeader title={h.name} description={`${h.species}${h.breed ? ` · ${h.breed}` : ""}${h.location ? ` · ${h.location}` : ""}`} icon={Beef}
        actions={<>
          {canCreate && <HerdPurchaseDialog herdId={h.id} cashAccounts={cash} suppliers={suppliers} />}
          {canUpdate && <>
            <HerdExpenseDialog herdId={h.id} categories={toOptions(LIVESTOCK_EXPENSE_CATEGORIES)} cashAccounts={cash} suppliers={suppliers} />
            <HerdBirthDialog herdId={h.id} />
            {s.remaining > 0 && <HerdDeathDialog herdId={h.id} remaining={s.remaining} />}
            <HerdWeighingDialog herdId={h.id} />
          </>}
          {canSell && <HerdSaleDialog herdId={h.id} remaining={s.remaining} customers={await customerOptions(ctx)} cashAccounts={cash} vatRate={ctx.company.vatRate.toString()} />}
        </>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="مشترى / مستورد" value={s.purchased} />
        <StatCard label="مواليد" value={s.born} tone="success" />
        <StatCard label="مباع" value={s.sold} tone="gold" />
        <StatCard label="نافق" value={s.deceased} tone="danger" />
        <StatCard label="المتبقي" value={s.remaining} hint={lastWeight ? `آخر متوسط وزن ${D(lastWeight.avgWeightKg!).toString()} كجم` : undefined} />
      </div>

      {showCost && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="تكلفة الاقتناء" value={<Money value={s.acquisitionCost} currency={cur} />} />
          <StatCard label="تكاليف الرعاية المتراكمة" value={<Money value={s.careCost} currency={cur} />} />
          <StatCard label="قيمة القطيع الحالية" value={<Money value={s.valuation} currency={cur} />} tone="gold" />
          <StatCard label="تكلفة الرأس" value={<Money value={s.costPerHead} currency={cur} />} hint="متوسط مرجح" />
          <StatCard label="الربح المحقق من البيع" value={<Money value={s.realizedProfit} currency={cur} signed />} tone="success" hint={`إيراد ${s.saleRevenue.toFixed(2)} − تكلفة ${s.soldCost.toFixed(2)}`} />
        </div>
      )}

      {h.shipment && (
        <Card><CardContent className="pt-5"><KeyValue items={[["شحنة الاستيراد", <Link key="s" href={`/shipments/${h.shipment.id}`} className="text-gold hover:underline">{h.shipment.reference}</Link>], ["خسائر النفوق المحمّلة", showCost ? <Money key="m" value={s.mortalityCost} currency={cur} /> : "—"]]} /></CardContent></Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>سجل الحركات</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead><TR><TH>التاريخ</TH><TH>الحركة</TH><TH>العدد</TH>{showCost && <><TH>المبلغ</TH><TH>التكلفة المزالة</TH></>}<TH>ملاحظة</TH></TR></THead>
              <TBody>
                {h.events.map((e) => (
                  <TR key={e.id}>
                    <TD>{fmtDate(e.date)}</TD>
                    <TD><Badge variant={EVENT_VARIANT[e.type]}>{HERD_EVENT_LABELS[e.type]}</Badge></TD>
                    <TD className="num">{e.type === "WEIGHING" ? `${e.quantity} · ${e.avgWeightKg ? D(e.avgWeightKg).toString() : "—"} كجم` : e.quantity}</TD>
                    {showCost && <><TD>{D(e.amount).isZero() ? "—" : <Money value={e.amount} currency={cur} />}</TD><TD>{D(e.costRemoved).isZero() ? "—" : <Money value={e.costRemoved} currency={cur} />}</TD></>}
                    <TD className="max-w-[180px] truncate text-muted-foreground">{e.note ?? "—"}</TD>
                  </TR>
                ))}
                {!h.events.length && <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">لا توجد حركات بعد — ابدأ بتسجيل الشراء</TD></TR>}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        {showCost && (
          <Card>
            <CardHeader><CardTitle>مصاريف الرعاية</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>التاريخ</TH><TH>النوع</TH><TH>الوصف</TH><TH>المبلغ</TH><TH>الضريبة</TH></TR></THead>
                <TBody>
                  {h.expenses.map((e) => (
                    <TR key={e.id}>
                      <TD>{fmtDate(e.date)}</TD><TD>{LIVESTOCK_EXPENSE_CATEGORIES[e.category] ?? e.category}</TD><TD className="max-w-[160px] truncate">{e.description ?? "—"}</TD>
                      <TD><Money value={e.amount} currency={cur} /></TD>
                      <TD>{D(e.vatAmount).isZero() ? "—" : <span className="flex items-center gap-1"><Money value={e.vatAmount} currency={cur} /><Badge variant={e.vatRecoverable ? "success" : "warning"}>{e.vatRecoverable ? "مستردة" : "ضمن التكلفة"}</Badge></span>}</TD>
                    </TR>
                  ))}
                  {!h.expenses.length && <TR><TD colSpan={5} className="py-8 text-center text-muted-foreground">لا توجد مصاريف</TD></TR>}
                </TBody>
                {h.expenses.length > 0 && <TFoot><TR><TD colSpan={3}>إجمالي تكاليف الرعاية المرسملة</TD><TD colSpan={2}><Money value={s.careCost} currency={cur} /></TD></TR></TFoot>}
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
