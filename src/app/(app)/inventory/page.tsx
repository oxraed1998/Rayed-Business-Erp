import Link from "next/link";
import type { MovementType } from "@prisma/client";
import { AlertTriangle, Warehouse } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { isLowStock, MOVEMENT_LABELS } from "@/lib/domain/inventory";
import { D } from "@/lib/money";
import { toOptions } from "@/server/queries/options";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination, pageParam } from "@/components/data/filter-bar";
import { NewWarehouseDialog } from "@/components/inventory/warehouse-form";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "المخزون والمستودعات" };
const PAGE = 30;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("inventory.read");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const type = sp.type && sp.type in MOVEMENT_LABELS ? (sp.type as MovementType) : undefined;
  const mWhere = {
    tenantId: ctx.tenant.id, companyId: ctx.company.id,
    ...(type ? { type } : {}),
    ...(sp.warehouse ? { warehouseId: sp.warehouse } : {}),
    ...(sp.q ? { variant: { OR: [{ sku: { contains: sp.q, mode: "insensitive" as const } }, { product: { name: { contains: sp.q, mode: "insensitive" as const } } }] } } : {}),
  };
  const [warehouses, byWh, movements, total, variants] = await Promise.all([
    db.warehouse.findMany({ where: scope(ctx), orderBy: { createdAt: "asc" } }),
    db.inventoryMovement.groupBy({ by: ["warehouseId"], where: { tenantId: ctx.tenant.id, companyId: ctx.company.id }, _sum: { quantity: true, totalCost: true } }),
    db.inventoryMovement.findMany({ where: mWhere, include: { variant: { include: { product: true } }, warehouse: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE, take: PAGE }),
    db.inventoryMovement.count({ where: mWhere }),
    db.productVariant.findMany({ where: { tenantId: ctx.tenant.id, product: { companyId: ctx.company.id }, reorderLevel: { gt: 0 } }, include: { product: true } }),
  ]);
  const low = variants.filter((v) => isLowStock(v.quantityOnHand, v.reorderLevel));
  const showCost = ctx.permissions.has("financials.read");
  const cur = ctx.company.baseCurrency;
  return (
    <div className="space-y-6">
      <PageHeader title="المخزون والمستودعات" description="أرصدة المستودعات وحركات المخزون وتنبيهات النقص" icon={Warehouse}
        actions={ctx.permissions.has("inventory.manage") && <NewWarehouseDialog />} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>المستودعات</CardTitle><CardDescription>الأرصدة الكمية لأصناف الملابس حسب المستودع</CardDescription></CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead><TR><TH>المستودع</TH><TH>الموقع</TH><TH>الكمية</TH>{showCost && <TH>القيمة التقريبية</TH>}</TR></THead>
              <TBody>
                {warehouses.map((w) => {
                  const s = byWh.find((x) => x.warehouseId === w.id)?._sum;
                  return (
                    <TR key={w.id}>
                      <TD className="font-semibold"><Link href={`?warehouse=${w.id}`} className="hover:text-gold">{w.name}</Link></TD>
                      <TD>{w.location ?? "—"}</TD>
                      <TD className="num font-bold">{D(s?.quantity ?? 0).toString()}</TD>
                      {showCost && <TD><Money value={s?.totalCost ?? 0} currency={cur} /></TD>}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {showCost && <p className="p-3 text-[11px] text-muted-foreground">القيمة حسب المستودع مبنية على تكلفة الحركات؛ القيمة الدقيقة لكل صنف تظهر في صفحة المنتج (متوسط مرجح).</p>}
          </CardContent>
        </Card>
        <Card className={low.length ? "border-destructive/40" : ""}>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-destructive" /> تنبيهات انخفاض المخزون</CardTitle></CardHeader>
          <CardContent>
            {low.length ? (
              <ul className="space-y-2">
                {low.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                    <Link href={`/clothing/${v.productId}`} className="min-w-0 truncate font-semibold hover:text-gold">{v.product.name} <span className="font-mono text-xs text-muted-foreground" dir="ltr">{v.sku}</span></Link>
                    <Badge variant="destructive">{D(v.quantityOnHand).toString()} / {v.reorderLevel}</Badge>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">لا توجد أصناف تحت حد إعادة الطلب.</p>}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>حركات المخزون</CardTitle></CardHeader>
        <FilterBar q={sp.q} values={sp} placeholder="ابحث بالمنتج أو SKU"
          filters={[{ name: "type", label: "الحركة", options: toOptions(MOVEMENT_LABELS) }, { name: "warehouse", label: "المستودع", options: warehouses.map((w) => ({ value: w.id, label: w.name })) }]} />
        {movements.length ? (
          <Table>
            <THead><TR><TH>التاريخ</TH><TH>الحركة</TH><TH>المنتج</TH><TH>SKU</TH><TH>المستودع</TH><TH>الكمية</TH>{showCost && <TH>أثر التكلفة</TH>}<TH>المرجع</TH></TR></THead>
            <TBody>
              {movements.map((m) => (
                <TR key={m.id}>
                  <TD>{fmtDate(m.date)}</TD>
                  <TD><Badge variant={D(m.quantity).isNegative() ? "warning" : "default"}>{MOVEMENT_LABELS[m.type]}</Badge></TD>
                  <TD><Link href={`/clothing/${m.variant.productId}`} className="hover:text-gold">{m.variant.product.name}</Link></TD>
                  <TD className="font-mono text-xs" dir="ltr">{m.variant.sku}</TD>
                  <TD>{m.warehouse.name}</TD>
                  <TD className="num">{D(m.quantity).toString()}</TD>
                  {showCost && <TD><Money value={m.totalCost} currency={cur} signed /></TD>}
                  <TD className="max-w-[160px] truncate text-muted-foreground">{m.note ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={Warehouse} title="لا توجد حركات" description="تظهر هنا حركات الشراء والبيع والتحويل والتسويات" />}
        <Pagination page={page} pageSize={PAGE} total={total} params={sp} />
      </Card>
    </div>
  );
}
