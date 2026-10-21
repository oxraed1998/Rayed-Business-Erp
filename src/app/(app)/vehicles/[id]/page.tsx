import Link from "next/link";
import { notFound } from "next/navigation";
import { Car } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { vehicleCost, VEHICLE_EXPENSE_CATEGORIES, VEHICLE_STATUS_LABELS, VEHICLE_TRANSITIONS } from "@/lib/domain/vehicle-cost";
import { cashAccountOptions, customerOptions, supplierOptions, toOptions } from "@/server/queries/options";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValue, PageHeader } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { VehicleStatusBadge } from "@/components/vehicles/status-badge";
import { SellVehicleDialog, VehicleExpenseDialog, VehicleStatusDialog } from "@/components/vehicles/vehicle-forms";
import { Unavailable } from "@/components/ui/misc";
import { fmtDate } from "@/lib/utils";
import { D } from "@/lib/money";

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCompanyContext("vehicles.read");
  const { id } = await params;
  const v = await db.vehicle.findFirst({ where: { id, ...scope(ctx) }, include: { expenses: { orderBy: { date: "asc" } }, supplier: true, customer: true, shipment: true } });
  if (!v) notFound();
  const showCost = ctx.permissions.has("financials.read");
  const c = vehicleCost(v);
  const cur = ctx.company.baseCurrency;
  const canUpdate = ctx.permissions.has("vehicles.update");
  const canSell = ctx.permissions.has("invoices.create") && (v.status === "IN_STOCK" || v.status === "RESERVED");
  const transitions = VEHICLE_TRANSITIONS[v.status].filter((s) => s !== "CANCELLED").map((s) => ({ value: s, label: VEHICLE_STATUS_LABELS[s as keyof typeof VEHICLE_STATUS_LABELS] }));
  const saleInvoice = v.status === "SOLD" ? await db.invoice.findFirst({ where: { ...scope(ctx), type: "SALES", lines: { some: { description: { contains: v.vin ?? `${v.manufacturer} ${v.model} ${v.year}` } } } }, orderBy: { createdAt: "desc" } }) : null;

  return (
    <div className="space-y-6">
      <PageHeader title={`${v.manufacturer} ${v.model} ${v.year}`} description={v.vin ? `VIN: ${v.vin}` : undefined} icon={Car}
        actions={<>
          <VehicleStatusBadge status={v.status} />
          {canUpdate && v.status !== "SOLD" && v.status !== "CANCELLED" && <>
            <VehicleStatusDialog vehicleId={v.id} options={transitions} />
            <VehicleExpenseDialog vehicleId={v.id} categories={toOptions(VEHICLE_EXPENSE_CATEGORIES).filter((o) => o.value !== "SHIPMENT_ALLOCATION")} cashAccounts={await cashAccountOptions(ctx)} suppliers={await supplierOptions(ctx)} />
          </>}
          {canSell && <SellVehicleDialog vehicleId={v.id} customers={await customerOptions(ctx)} cashAccounts={await cashAccountOptions(ctx)} vatRate={ctx.company.vatRate.toString()} />}
        </>} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>بيانات السيارة</CardTitle></CardHeader>
          <CardContent>
            <KeyValue items={[
              ["اللون", v.color], ["الممشى", v.mileage != null ? `${v.mileage.toLocaleString("en-US")} كم` : null], ["بلد المنشأ", v.originCountry], ["بلد الاستيراد", v.importCountry],
              ["تاريخ الشراء", fmtDate(v.purchaseDate)], ["المورد", v.supplier?.name], ["الشحنة", v.shipment ? <Link href={`/shipments/${v.shipment.id}`} className="text-gold hover:underline">{v.shipment.reference}</Link> : null],
              ["العميل", v.customer?.name], ["تاريخ البيع", v.saleDate ? fmtDate(v.saleDate) : null],
              ["فاتورة البيع", saleInvoice ? <Link href={`/invoices/${saleInvoice.id}`} className="text-gold hover:underline">{saleInvoice.number}</Link> : null],
            ]} />
            {v.notes && <p className="mt-4 rounded-lg bg-muted p-3 text-sm">{v.notes}</p>}
          </CardContent>
        </Card>
        {showCost && (
          <Card className="border-gold/40">
            <CardHeader><CardTitle>التكلفة والربحية</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label={`سعر الشراء (${D(v.purchasePrice).toFixed(2)} ${v.purchaseCurrency} × ${D(v.exchangeRate).toString()})`} value={<Money value={c.purchaseBase} currency={cur} />} />
              {Object.entries(c.byCategory).map(([k, val]) => <Row key={k} label={VEHICLE_EXPENSE_CATEGORIES[k] ?? k} value={<Money value={val} currency={cur} />} />)}
              <div className="border-t pt-2"><Row label="التكلفة الكاملة (Landed)" value={<Money value={c.landedCost} currency={cur} className="font-extrabold" />} /></div>
              {!c.recoverableVat.isZero() && <Row label="ضريبة مدخلات قابلة للاسترداد (خارج التكلفة)" value={<Money value={c.recoverableVat} currency={cur} className="text-muted-foreground" />} />}
              {v.sellingPrice && <>
                <Row label="سعر البيع (قبل الضريبة)" value={<Money value={v.sellingPrice} currency={cur} />} />
                <div className="rounded-lg bg-success/10 p-3"><Row label="صافي الربح" value={<Money value={c.profit} currency={cur} signed className="text-base font-extrabold" />} />{c.marginPct && <p className="text-xs text-muted-foreground">هامش {c.marginPct.toString()}%</p>}</div>
              </>}
            </CardContent>
          </Card>
        )}
      </div>

      {showCost && (
        <Card>
          <CardHeader><CardTitle>سجل المصروفات</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead><TR><TH>التاريخ</TH><TH>النوع</TH><TH>الوصف</TH><TH>المبلغ</TH><TH>الضريبة</TH></TR></THead>
              <TBody>
                {v.expenses.map((e) => (
                  <TR key={e.id}>
                    <TD>{fmtDate(e.date)}</TD><TD>{VEHICLE_EXPENSE_CATEGORIES[e.category] ?? e.category}</TD><TD className="max-w-xs truncate">{e.description ?? "—"}</TD>
                    <TD><Money value={e.amount} currency={cur} /></TD>
                    <TD>{D(e.vatAmount).isZero() ? "—" : <span className="flex items-center gap-1"><Money value={e.vatAmount} currency={cur} /><Badge variant={e.vatRecoverable ? "success" : "warning"}>{e.vatRecoverable ? "قابلة للاسترداد" : "ضمن التكلفة"}</Badge></span>}</TD>
                  </TR>
                ))}
                {!v.expenses.length && <TR><TD colSpan={5} className="py-8 text-center text-muted-foreground">لا توجد مصروفات بعد</TD></TR>}
              </TBody>
              {v.expenses.length > 0 && <TFoot><TR><TD colSpan={3}>إجمالي المصروفات المرسملة</TD><TD colSpan={2}><Money value={c.expensesTotal} currency={cur} /></TD></TR></TFoot>}
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Unavailable feature="رفع المستندات والصور">لم يتم ربط مزود تخزين ملفات آمن بعد. سيتم تفعيله عند ضبط التخزين.</Unavailable>
        <div className="rounded-xl border p-4 text-sm">
          <p className="font-semibold">ملكية الشركاء</p>
          <p className="mt-1 text-muted-foreground">لتوزيع ربح هذه السيارة على شركاء، أنشئ اتفاقية شراكة بنطاق &quot;سيارة&quot; من <Link href="/partners" className="text-gold hover:underline">شاشة الشركاء</Link>.</p>
        </div>
      </div>
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span>{value}</div>
);
