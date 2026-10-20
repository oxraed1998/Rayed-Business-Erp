import Link from "next/link";
import { notFound } from "next/navigation";
import { Handshake } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { activityPerformance } from "@/lib/accounting/reports";
import { capitalOwnership, partnerBalance } from "@/lib/domain/partners";
import { D, sum } from "@/lib/money";
import { fmtDate } from "@/lib/utils";
import { cashAccountOptions } from "@/server/queries/options";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KeyValue, PageHeader, StatCard } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { DistributeDialog, PartnerMovementDialog } from "@/components/partners/partner-forms";
import { PARTNER_TXN_LABELS, SCOPE_LABELS } from "@/components/partners/labels";

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCompanyContext("partners.read");
  const { id } = await params;
  const a = await db.partnershipAgreement.findFirst({
    where: { id, ...scope(ctx) },
    include: { shares: { include: { partner: true } }, transactions: { include: { partner: true }, orderBy: { date: "desc" } } },
  });
  if (!a) notFound();
  const cur = ctx.company.baseCurrency;
  const canManage = ctx.permissions.has("partners.manage");

  // Resolve the scope reference and, for activity/vehicle scopes, a suggested profit figure from the books.
  let scopeLabel: React.ReactNode = null;
  let suggested: string | undefined;
  if (a.scope === "ACTIVITY" && a.scopeRefId) {
    const act = await db.businessActivity.findFirst({ where: { id: a.scopeRefId, ...scope(ctx) } });
    scopeLabel = act?.name;
    if (act && ctx.permissions.has("financials.read")) {
      const perf = await activityPerformance({ tenantId: ctx.tenant.id, companyId: ctx.company.id });
      const p = perf.find((x) => x.activityId === act.id);
      if (p) suggested = p.profit.toFixed(2);
    }
  } else if (a.scope === "SHIPMENT" && a.scopeRefId) {
    const s = await db.importShipment.findFirst({ where: { id: a.scopeRefId, ...scope(ctx) } });
    scopeLabel = s ? <Link href={`/shipments/${s.id}`} className="text-gold hover:underline">{s.reference}</Link> : null;
  } else if (a.scope === "VEHICLE" && a.scopeRefId) {
    const v = await db.vehicle.findFirst({ where: { id: a.scopeRefId, ...scope(ctx) }, include: { expenses: true } });
    scopeLabel = v ? <Link href={`/vehicles/${v.id}`} className="text-gold hover:underline">{v.manufacturer} {v.model} {v.year}</Link> : null;
    if (v?.sellingPrice && ctx.permissions.has("financials.read")) {
      const { vehicleCost } = await import("@/lib/domain/vehicle-cost");
      suggested = vehicleCost(v).profit?.toFixed(2);
    }
  }

  const ownership = capitalOwnership(a.shares);
  const allExplicit = a.shares.every((s) => s.profitSharePct !== null);
  const totalCapital = sum(a.shares.map((s) => s.capitalAmount));
  const partnerOpts = a.shares.map((s) => ({ value: s.partnerId, label: s.partner.name }));

  return (
    <div className="space-y-6">
      <PageHeader title={a.name} description={`اتفاقية شراكة · ${SCOPE_LABELS[a.scope]}`} icon={Handshake}
        actions={canManage && <>
          <PartnerMovementDialog agreementId={a.id} partners={partnerOpts} cashAccounts={await cashAccountOptions(ctx)} type="CONTRIBUTION" />
          <PartnerMovementDialog agreementId={a.id} partners={partnerOpts} cashAccounts={await cashAccountOptions(ctx)} type="WITHDRAWAL" />
          <DistributeDialog agreementId={a.id} canPost={ctx.permissions.has("accounting.create")} suggested={suggested}
            shares={a.shares.map((s) => ({ partnerId: s.partnerId, name: s.partner.name, capital: s.capitalAmount.toString(), profitPct: s.profitSharePct?.toString() ?? null, lossPct: s.lossSharePct?.toString() ?? null }))} />
        </>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="رأس المال المتفق عليه" value={<Money value={totalCapital} currency={cur} />} tone="gold" />
        <StatCard label="عدد الشركاء" value={a.shares.length} />
        <StatCard label="المساهمات المسجلة" value={<Money value={sum(a.transactions.filter((t) => t.type === "CONTRIBUTION").map((t) => t.amount))} currency={cur} />} />
        <StatCard label="الأرباح الموزعة" value={<Money value={sum(a.transactions.filter((t) => t.type === "PROFIT_DISTRIBUTION").map((t) => t.amount))} currency={cur} />} tone="success" />
      </div>
      <Card>
        <CardHeader><CardTitle>الحصص والنسب</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <KeyValue items={[["النطاق", SCOPE_LABELS[a.scope]], ["المرجع", scopeLabel], ["أساس توزيع الربح", allExplicit ? "نسب متفق عليها" : "حسب نسب رأس المال"], ["تاريخ الإنشاء", fmtDate(a.createdAt)]]} />
          {a.notes && <p className="rounded-lg bg-muted p-3 text-sm">{a.notes}</p>}
          <Table>
            <THead><TR><TH>الشريك</TH><TH>رأس المال</TH><TH>نسبة الملكية</TH><TH>نسبة الربح</TH><TH>نسبة الخسارة</TH><TH>المساهمات</TH><TH>الأرباح/الخسائر</TH><TH>المسحوبات</TH><TH>الرصيد</TH></TR></THead>
            <TBody>
              {a.shares.map((s) => {
                const own = ownership.find((o) => o.partnerId === s.partnerId)!.pct;
                const b = partnerBalance(a.transactions.filter((t) => t.partnerId === s.partnerId));
                return (
                  <TR key={s.id}>
                    <TD className="font-semibold">{s.partner.name}{s.partner.isInvestor && <Badge variant="gold" className="ms-2">مستثمر</Badge>}</TD>
                    <TD><Money value={s.capitalAmount} currency={cur} /></TD>
                    <TD className="num">{own.toFixed(2)}%</TD>
                    <TD className="num">{s.profitSharePct ? `${D(s.profitSharePct).toFixed(2)}%` : `${own.toFixed(2)}% (رأس المال)`}</TD>
                    <TD className="num">{s.lossSharePct ? `${D(s.lossSharePct).toFixed(2)}%` : "= الربح"}</TD>
                    <TD><Money value={b.capital} currency={cur} /></TD>
                    <TD><Money value={b.distributed.minus(b.losses)} currency={cur} signed /></TD>
                    <TD><Money value={b.withdrawn} currency={cur} /></TD>
                    <TD><Money value={b.net} currency={cur} className="font-bold" /></TD>
                  </TR>
                );
              })}
            </TBody>
            <TFoot><TR><TD>الإجمالي</TD><TD><Money value={totalCapital} currency={cur} /></TD><TD colSpan={7} /></TR></TFoot>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>سجل الحركات</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>التاريخ</TH><TH>الشريك</TH><TH>النوع</TH><TH>المبلغ</TH><TH>القيد</TH><TH>ملاحظة</TH></TR></THead>
            <TBody>
              {a.transactions.map((t) => (
                <TR key={t.id}>
                  <TD>{fmtDate(t.date)}</TD>
                  <TD>{t.partner.name}</TD>
                  <TD><Badge variant={t.type === "LOSS_ALLOCATION" || t.type === "WITHDRAWAL" ? "warning" : "success"}>{PARTNER_TXN_LABELS[t.type]}</Badge></TD>
                  <TD><Money value={t.amount} currency={cur} /></TD>
                  <TD>{t.journalEntryId ? <Link href={`/accounting/journal/${t.journalEntryId}`} className="text-xs text-gold hover:underline">عرض القيد</Link> : <span className="text-xs text-muted-foreground">غير مرحّل</span>}</TD>
                  <TD className="max-w-xs truncate text-muted-foreground">{t.note ?? "—"}</TD>
                </TR>
              ))}
              {!a.transactions.length && <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">لا توجد حركات بعد</TD></TR>}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
