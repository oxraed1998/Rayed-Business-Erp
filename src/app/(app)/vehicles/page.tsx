import Link from "next/link";
import type { Prisma, VehicleStatus } from "@prisma/client";
import { Car } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { vehicleCost, VEHICLE_STATUS_LABELS } from "@/lib/domain/vehicle-cost";
import { activityOptions, cashAccountOptions, currencyOptions, shipmentOptions, supplierOptions, toOptions } from "@/server/queries/options";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination, pageParam } from "@/components/data/filter-bar";
import { VehicleStatusBadge } from "@/components/vehicles/status-badge";
import { NewVehicleDialog } from "@/components/vehicles/vehicle-forms";
import { sum } from "@/lib/money";

export const metadata = { title: "السيارات" };
const PAGE = 25;

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("vehicles.read");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const status = sp.status && sp.status in VEHICLE_STATUS_LABELS ? (sp.status as VehicleStatus) : undefined;
  const where: Prisma.VehicleWhereInput = {
    ...scope(ctx),
    ...(status ? { status } : {}),
    ...(sp.q ? { OR: [{ manufacturer: { contains: sp.q, mode: "insensitive" } }, { model: { contains: sp.q, mode: "insensitive" } }, { vin: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [vehicles, total, stock] = await Promise.all([
    db.vehicle.findMany({ where, include: { expenses: true, customer: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.vehicle.count({ where }),
    db.vehicle.findMany({ where: { ...scope(ctx), status: { notIn: ["SOLD", "CANCELLED"] } }, include: { expenses: true } }),
  ]);
  const showCost = ctx.permissions.has("financials.read");
  const stockValue = sum(stock.map((v) => vehicleCost(v).landedCost));
  const canCreate = ctx.permissions.has("vehicles.create");
  const cur = ctx.company.baseCurrency;

  return (
    <div>
      <PageHeader title="تجارة السيارات" description="الاستيراد، التكاليف، الحجز والبيع" icon={Car}
        actions={canCreate && <NewVehicleDialog activities={await activityOptions(ctx, "VEHICLES")} shipments={await shipmentOptions(ctx, "VEHICLES")} suppliers={await supplierOptions(ctx)} cashAccounts={await cashAccountOptions(ctx)} currencies={currencyOptions} />} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="في المخزون والطريق" value={stock.length} />
        <StatCard label="في الطريق / الجمارك" value={stock.filter((v) => v.status === "IN_TRANSIT" || v.status === "CUSTOMS").length} />
        <StatCard label="محجوزة" value={stock.filter((v) => v.status === "RESERVED").length} />
        {showCost && <StatCard label="تكلفة المخزون" value={<Money value={stockValue} currency={cur} />} tone="gold" />}
      </div>
      <Card>
        <FilterBar q={sp.q} values={sp} placeholder="ابحث بالشركة أو الطراز أو رقم الهيكل" filters={[{ name: "status", label: "الحالة", options: toOptions(VEHICLE_STATUS_LABELS) }]} />
        {vehicles.length ? (
          <Table>
            <THead><TR><TH>السيارة</TH><TH>VIN</TH><TH>الحالة</TH>{showCost && <><TH>التكلفة الكاملة</TH><TH>سعر البيع</TH><TH>الربح</TH></>}<TH>العميل</TH></TR></THead>
            <TBody>
              {vehicles.map((v) => {
                const c = vehicleCost(v);
                return (
                  <TR key={v.id}>
                    <TD><Link href={`/vehicles/${v.id}`} className="font-bold hover:text-gold">{v.manufacturer} {v.model} <span className="text-muted-foreground">{v.year}</span></Link></TD>
                    <TD className="font-mono text-xs" dir="ltr">{v.vin ?? "—"}</TD>
                    <TD><VehicleStatusBadge status={v.status} /></TD>
                    {showCost && <><TD><Money value={c.landedCost} currency={cur} /></TD><TD><Money value={v.sellingPrice} currency={cur} /></TD><TD>{c.profit ? <Money value={c.profit} currency={cur} signed /> : "—"}</TD></>}
                    <TD>{v.customer?.name ?? "—"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : <EmptyState icon={Car} title="لا توجد سيارات" description={sp.q || status ? "لا نتائج مطابقة للتصفية" : "أضف أول سيارة لبدء تتبع التكاليف والأرباح"} />}
        <Pagination page={page} pageSize={PAGE} total={total} params={sp} />
      </Card>
    </div>
  );
}
