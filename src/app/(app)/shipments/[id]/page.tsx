import Link from "next/link";
import { notFound } from "next/navigation";
import { Ship } from "lucide-react";
import type { ShipmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { ALLOCATION_LABELS } from "@/lib/domain/allocation";
import { capitalisedCost, VEHICLE_STATUS_LABELS } from "@/lib/domain/vehicle-cost";
import { herdSummary } from "@/lib/domain/livestock";
import { D, sum } from "@/lib/money";
import { SHIPMENT_STATUS_LABELS } from "@/server/services/shipments";
import { allocateShipmentAction } from "@/server/actions/shipments";
import { cashAccountOptions, supplierOptions } from "@/server/queries/options";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KeyValue, PageHeader, StatCard } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { ShipmentExpenseDialog, ShipmentStatusDialog } from "@/components/shipments/shipment-forms";
import { fmtDate } from "@/lib/utils";

const ORDER: ShipmentStatus[] = ["ORDERED", "IN_TRANSIT", "CUSTOMS", "ARRIVED", "CLOSED"];
const CATEGORIES = [
  { value: "SHIPPING", label: "الشحن البحري/الجوي" }, { value: "CUSTOMS_DUTY", label: "الرسوم الجمركية" }, { value: "CLEARANCE", label: "التخليص الجمركي" },
  { value: "INSURANCE", label: "التأمين" }, { value: "INSPECTION", label: "الفحص" }, { value: "TRANSPORT", label: "النقل الداخلي" },
  { value: "PORT_FEES", label: "رسوم الميناء" }, { value: "OTHER", label: "أخرى" },
];
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCompanyContext("inventory.read");
  const { id } = await params;
  const s = await db.importShipment.findFirst({
    where: { id, ...scope(ctx) },
    include: {
      expenses: { orderBy: { date: "asc" } },
      vehicles: { include: { expenses: { where: { category: "SHIPMENT_ALLOCATION" } } } },
      herds: { include: { events: true, expenses: true } },
      movements: { include: { variant: { include: { product: true } }, warehouse: true }, orderBy: { date: "asc" } },
    },
  });
  if (!s) notFound();
  const showCost = ctx.permissions.has("financials.read");
  const canManage = ctx.permissions.has("inventory.manage");
  const cur = ctx.company.baseCurrency;
  const unallocated = s.expenses.filter((e) => !e.allocatedAt);
  const totalExp = sum(s.expenses.map(capitalisedCost));
  const unallocatedTotal = sum(unallocated.map(capitalisedCost));
  const next = ORDER.slice(ORDER.indexOf(s.status) + 1).filter((x) => x !== "ORDERED").map((x) => ({ value: x, label: SHIPMENT_STATUS_LABELS[x] }));
  const purchases = s.movements.filter((m) => m.type === "PURCHASE");
  const landed = s.movements.filter((m) => m.type === "LANDED_COST");
  const hasItems = s.vehicles.length + s.herds.length + purchases.length > 0;
  const [cash, suppliers] = canManage ? await Promise.all([cashAccountOptions(ctx), supplierOptions(ctx)]) : [[], []];

  return (
    <div className="space-y-6">
      <PageHeader title={`شحنة ${s.reference}`} description={[s.originCountry, ALLOCATION_LABELS[s.allocationMethod]].filter(Boolean).join(" · ")} icon={Ship}
        actions={<>
          <Badge variant={s.status === "CLOSED" ? "success" : "default"}>{SHIPMENT_STATUS_LABELS[s.status]}</Badge>
          {canManage && s.status !== "CLOSED" && <>
            <ShipmentStatusDialog shipmentId={s.id} options={next} />
            <ShipmentExpenseDialog shipmentId={s.id} categories={CATEGORIES} cashAccounts={cash} suppliers={suppliers} />
            {unallocated.length > 0 && hasItems && (
              <ConfirmAction action={allocateShipmentAction} fields={{ shipmentId: s.id }} variant="gold" title="توزيع مصاريف الشحنة"
                description={`سيتم توزيع ${unallocated.length} مصروف (${unallocatedTotal.toFixed(2)} ${cur}) على بنود الشحنة ${ALLOCATION_LABELS[s.allocationMethod]}، ونقلها من بضاعة في الطريق إلى المخزون. لا يمكن التراجع إلا بقيد تسوية.`}
                confirmLabel="توزيع الآن">توزيع المصاريف</ConfirmAction>
            )}
          </>}
        </>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="بنود الشحنة" value={s.vehicles.length + s.herds.length + purchases.length} hint={`${s.vehicles.length} سيارة · ${s.herds.length} قطيع · ${purchases.length} استلام`} />
        <StatCard label="عدد المصاريف" value={s.expenses.length} />
        {showCost && <StatCard label="إجمالي المصاريف المرسملة" value={<Money value={totalExp} currency={cur} />} />}
        {showCost && <StatCard label="غير موزعة" value={<Money value={unallocatedTotal} currency={cur} />} tone={unallocatedTotal.isZero() ? "success" : "danger"} />}
      </div>
      <Card><CardContent className="pt-5"><KeyValue items={[["تاريخ الشحن", fmtDate(s.shippedAt)], ["تاريخ الوصول", fmtDate(s.arrivedAt)], ["ملاحظات", s.notes]]} /></CardContent></Card>
      {unallocated.length > 0 && !hasItems && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">اربط سيارات أو قطعانًا أو استلامات ملابس بهذه الشحنة (عند إنشائها) قبل توزيع المصاريف.</p>}

      {showCost && (
        <Card>
          <CardHeader><CardTitle>المصاريف المشتركة</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead><TR><TH>التاريخ</TH><TH>النوع</TH><TH>الوصف</TH><TH>المبلغ</TH><TH>الضريبة</TH><TH>التوزيع</TH></TR></THead>
              <TBody>
                {s.expenses.map((e) => (
                  <TR key={e.id}>
                    <TD>{fmtDate(e.date)}</TD><TD>{CAT[e.category] ?? e.category}</TD><TD className="max-w-[200px] truncate">{e.description ?? "—"}</TD>
                    <TD><Money value={e.amount} currency={cur} /></TD>
                    <TD>{D(e.vatAmount).isZero() ? "—" : <span className="flex items-center gap-1"><Money value={e.vatAmount} currency={cur} /><Badge variant={e.vatRecoverable ? "success" : "warning"}>{e.vatRecoverable ? "مستردة" : "ضمن التكلفة"}</Badge></span>}</TD>
                    <TD>{e.allocatedAt ? <Badge variant="success">موزع {fmtDate(e.allocatedAt)}</Badge> : <Badge variant="warning">غير موزع</Badge>}</TD>
                  </TR>
                ))}
                {!s.expenses.length && <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">لا توجد مصاريف بعد</TD></TR>}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {s.vehicles.length > 0 && (
        <Card>
          <CardHeader><CardTitle>السيارات</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead><TR><TH>السيارة</TH><TH>VIN</TH><TH>الحالة</TH>{showCost && <><TH>سعر الشراء</TH><TH>حصتها من المصاريف</TH></>}</TR></THead>
              <TBody>
                {s.vehicles.map((v) => (
                  <TR key={v.id}>
                    <TD><Link href={`/vehicles/${v.id}`} className="font-bold hover:text-gold">{v.manufacturer} {v.model} {v.year}</Link></TD>
                    <TD className="font-mono text-xs" dir="ltr">{v.vin ?? "—"}</TD>
                    <TD>{VEHICLE_STATUS_LABELS[v.status]}</TD>
                    {showCost && <><TD><Money value={D(v.purchasePrice).times(D(v.exchangeRate))} currency={cur} /></TD><TD><Money value={sum(v.expenses.map((e) => D(e.amount)))} currency={cur} /></TD></>}
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {s.herds.length > 0 && (
        <Card>
          <CardHeader><CardTitle>القطعان</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead><TR><TH>القطيع</TH><TH>الرؤوس المتبقية</TH>{showCost && <TH>القيمة الحالية</TH>}</TR></THead>
              <TBody>
                {s.herds.map((h) => {
                  const hs = herdSummary(h.events, h.expenses);
                  return <TR key={h.id}><TD><Link href={`/livestock/${h.id}`} className="font-bold hover:text-gold">{h.name}</Link></TD><TD>{hs.remaining}</TD>{showCost && <TD><Money value={hs.valuation} currency={cur} /></TD>}</TR>;
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {purchases.length > 0 && (
        <Card>
          <CardHeader><CardTitle>استلامات الملابس</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead><TR><TH>التاريخ</TH><TH>المنتج</TH><TH>SKU</TH><TH>المستودع</TH><TH>الكمية</TH>{showCost && <><TH>تكلفة الشراء</TH><TH>تكلفة إضافية محمّلة</TH></>}</TR></THead>
              <TBody>
                {purchases.map((m) => (
                  <TR key={m.id}>
                    <TD>{fmtDate(m.date)}</TD>
                    <TD><Link href={`/clothing/${m.variant.productId}`} className="hover:text-gold">{m.variant.product.name}</Link></TD>
                    <TD className="font-mono text-xs" dir="ltr">{m.variant.sku}</TD><TD>{m.warehouse.name}</TD>
                    <TD className="num">{D(m.quantity).toString()}</TD>
                    {showCost && <><TD><Money value={m.totalCost} currency={cur} /></TD><TD><Money value={sum(landed.filter((l) => l.variantId === m.variantId && l.warehouseId === m.warehouseId).map((l) => D(l.totalCost)))} currency={cur} /></TD></>}
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
