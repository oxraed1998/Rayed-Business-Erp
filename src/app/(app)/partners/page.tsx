import Link from "next/link";
import { Handshake } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { partnerBalance } from "@/lib/domain/partners";
import { sum } from "@/lib/money";
import { activityOptions, partnerOptions, shipmentOptions } from "@/server/queries/options";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { NewAgreementDialog, NewPartnerDialog } from "@/components/partners/partner-forms";
import { SCOPE_LABELS } from "@/components/partners/labels";

export const metadata = { title: "الشركاء والمستثمرون" };

export default async function PartnersPage() {
  const ctx = await pageCompanyContext("partners.read");
  const [partners, agreements] = await Promise.all([
    db.partner.findMany({ where: { tenantId: ctx.tenant.id }, include: { transactions: { where: { agreement: { companyId: ctx.company.id } } } }, orderBy: { name: "asc" } }),
    db.partnershipAgreement.findMany({ where: scope(ctx), include: { shares: { include: { partner: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const canManage = ctx.permissions.has("partners.manage");
  const cur = ctx.company.baseCurrency;
  const vehicles = canManage ? await db.vehicle.findMany({ where: { ...scope(ctx), status: { not: "CANCELLED" } }, select: { id: true, manufacturer: true, model: true, year: true, vin: true }, orderBy: { createdAt: "desc" }, take: 500 }) : [];
  return (
    <div className="space-y-6">
      <PageHeader title="الشركاء والمستثمرون" description="اتفاقيات على مستوى الشركة أو النشاط أو الشحنة أو السيارة أو الصفقة؛ نسب الربح قد تختلف عن نسب رأس المال" icon={Handshake}
        actions={canManage && <>
          <NewPartnerDialog />
          <NewAgreementDialog partners={await partnerOptions(ctx)} refs={{ ACTIVITY: await activityOptions(ctx), SHIPMENT: await shipmentOptions(ctx), VEHICLE: vehicles.map((v) => ({ value: v.id, label: `${v.manufacturer} ${v.model} ${v.year}${v.vin ? ` · ${v.vin}` : ""}` })) }} />
        </>} />
      <Card>
        <CardHeader><CardTitle>اتفاقيات الشراكة — {ctx.company.name}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {agreements.length ? (
            <Table>
              <THead><TR><TH>الاتفاقية</TH><TH>النطاق</TH><TH>الشركاء</TH><TH>رأس المال</TH></TR></THead>
              <TBody>
                {agreements.map((a) => (
                  <TR key={a.id}>
                    <TD><Link href={`/partners/${a.id}`} className="font-bold hover:text-gold">{a.name}</Link></TD>
                    <TD><Badge variant="muted">{SCOPE_LABELS[a.scope]}</Badge></TD>
                    <TD className="text-sm">{a.shares.map((s) => s.partner.name).join("، ")}</TD>
                    <TD><Money value={sum(a.shares.map((s) => s.capitalAmount))} currency={cur} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <EmptyState icon={Handshake} title="لا توجد اتفاقيات" description="أنشئ اتفاقية لتسجيل مساهمات الشركاء وتوزيع الأرباح" />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>الشركاء والمستثمرون</CardTitle></CardHeader>
        <CardContent className="p-0">
          {partners.length ? (
            <Table>
              <THead><TR><TH>الاسم</TH><TH>النوع</TH><TH>الجوال</TH><TH>المساهمات</TH><TH>الأرباح الموزعة</TH><TH>المسحوبات</TH><TH>صافي الرصيد</TH></TR></THead>
              <TBody>
                {partners.map((p) => {
                  const b = partnerBalance(p.transactions);
                  return (
                    <TR key={p.id}>
                      <TD className="font-semibold">{p.name}</TD>
                      <TD><Badge variant={p.isInvestor ? "gold" : "default"}>{p.isInvestor ? "مستثمر" : "شريك"}</Badge></TD>
                      <TD dir="ltr" className="text-right">{p.phone ?? "—"}</TD>
                      <TD><Money value={b.capital} currency={cur} /></TD>
                      <TD><Money value={b.distributed.minus(b.losses)} currency={cur} signed /></TD>
                      <TD><Money value={b.withdrawn} currency={cur} /></TD>
                      <TD><Money value={b.net} currency={cur} className="font-bold" /></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          ) : <EmptyState title="لا يوجد شركاء بعد" />}
        </CardContent>
      </Card>
    </div>
  );
}
