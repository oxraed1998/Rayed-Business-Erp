import Link from "next/link";
import type { Prisma, ShipmentStatus } from "@prisma/client";
import { Ship } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { ALLOCATION_LABELS } from "@/lib/domain/allocation";
import { capitalisedCost } from "@/lib/domain/vehicle-cost";
import { sum } from "@/lib/money";
import { SHIPMENT_STATUS_LABELS } from "@/server/services/shipments";
import { activityOptions, toOptions } from "@/server/queries/options";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination, pageParam } from "@/components/data/filter-bar";
import { NewShipmentDialog } from "@/components/shipments/shipment-forms";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "شحنات الاستيراد" };
const PAGE = 25;
const TYPE_LABELS = { VEHICLES: "سيارات", LIVESTOCK: "مواشي", CLOTHING: "ملابس", GENERAL: "عام" } as const;
const STATUS_VARIANT: Record<ShipmentStatus, "muted" | "warning" | "default" | "success"> = { ORDERED: "muted", IN_TRANSIT: "warning", CUSTOMS: "warning", ARRIVED: "default", CLOSED: "success" };

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("inventory.read");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const status = sp.status && sp.status in SHIPMENT_STATUS_LABELS ? (sp.status as ShipmentStatus) : undefined;
  const where: Prisma.ImportShipmentWhereInput = {
    ...scope(ctx), ...(status ? { status } : {}),
    ...(sp.q ? { OR: [{ reference: { contains: sp.q, mode: "insensitive" } }, { originCountry: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [shipments, total] = await Promise.all([
    db.importShipment.findMany({ where, include: { expenses: true, _count: { select: { vehicles: true, herds: true, movements: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.importShipment.count({ where }),
  ]);
  const showCost = ctx.permissions.has("financials.read");
  const cur = ctx.company.baseCurrency;
  return (
    <div>
      <PageHeader title="شحنات الاستيراد" description="المصاريف المشتركة وتوزيع التكلفة على السيارات والمواشي والملابس" icon={Ship}
        actions={ctx.permissions.has("inventory.manage") && <NewShipmentDialog activities={await activityOptions(ctx)} methods={toOptions(ALLOCATION_LABELS)} />} />
      <Card>
        <FilterBar q={sp.q} values={sp} placeholder="ابحث بالمرجع أو بلد المنشأ" filters={[{ name: "status", label: "الحالة", options: toOptions(SHIPMENT_STATUS_LABELS) }]} />
        {shipments.length ? (
          <Table>
            <THead><TR><TH>المرجع</TH><TH>النوع</TH><TH>المنشأ</TH><TH>الحالة</TH><TH>التوزيع</TH><TH>البنود</TH>{showCost && <><TH>المصاريف</TH><TH>غير موزعة</TH></>}<TH>تاريخ الشحن</TH></TR></THead>
            <TBody>
              {shipments.map((s) => {
                const items = s._count.vehicles + s._count.herds + s._count.movements;
                const unallocated = sum(s.expenses.filter((e) => !e.allocatedAt).map(capitalisedCost));
                return (
                  <TR key={s.id}>
                    <TD><Link href={`/shipments/${s.id}`} className="font-mono font-bold hover:text-gold" dir="ltr">{s.reference}</Link></TD>
                    <TD>{TYPE_LABELS[s.type]}</TD><TD>{s.originCountry ?? "—"}</TD>
                    <TD><Badge variant={STATUS_VARIANT[s.status]}>{SHIPMENT_STATUS_LABELS[s.status]}</Badge></TD>
                    <TD className="text-xs">{ALLOCATION_LABELS[s.allocationMethod]}</TD>
                    <TD>{items}</TD>
                    {showCost && <><TD><Money value={sum(s.expenses.map(capitalisedCost))} currency={cur} /></TD><TD>{unallocated.isZero() ? "—" : <Money value={unallocated} currency={cur} className="text-warning" />}</TD></>}
                    <TD>{fmtDate(s.shippedAt)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : <EmptyState icon={Ship} title="لا توجد شحنات" description={sp.q || status ? "لا نتائج مطابقة" : "أنشئ شحنة واربط بها السيارات أو القطعان أو استلامات الملابس"} />}
        <Pagination page={page} pageSize={PAGE} total={total} params={sp} />
      </Card>
    </div>
  );
}
