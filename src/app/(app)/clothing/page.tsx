import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Shirt } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { isLowStock } from "@/lib/domain/inventory";
import { D, sum } from "@/lib/money";
import { activityOptions } from "@/server/queries/options";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination, pageParam } from "@/components/data/filter-bar";
import { NewProductDialog } from "@/components/clothing/product-forms";

export const metadata = { title: "الملابس" };
const PAGE = 25;

export default async function ClothingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("clothing.read");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const q = sp.q;
  const where: Prisma.ProductWhereInput = {
    ...scope(ctx),
    ...(sp.category ? { category: sp.category } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }, { variants: { some: { OR: [{ sku: { contains: q, mode: "insensitive" } }, { barcode: { contains: q } }] } } }] } : {}),
  };
  const [products, total, categories, allVariants] = await Promise.all([
    db.product.findMany({ where, include: { variants: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.product.count({ where }),
    db.product.findMany({ where: { ...scope(ctx), category: { not: null } }, distinct: ["category"], select: { category: true } }),
    db.productVariant.findMany({ where: { tenantId: ctx.tenant.id, product: { companyId: ctx.company.id } }, select: { quantityOnHand: true, stockValue: true, reorderLevel: true } }),
  ]);
  const showCost = ctx.permissions.has("financials.read");
  const cur = ctx.company.baseCurrency;
  const lowCount = allVariants.filter((v) => isLowStock(v.quantityOnHand, v.reorderLevel)).length;
  return (
    <div>
      <PageHeader title="الملابس" description="المنتجات، المقاسات والألوان، المخزون والمبيعات" icon={Shirt}
        actions={ctx.permissions.has("clothing.create") && <NewProductDialog activities={await activityOptions(ctx, "CLOTHING")} />} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="المنتجات" value={total} />
        <StatCard label="إجمالي القطع" value={sum(allVariants.map((v) => D(v.quantityOnHand))).toFixed(0)} />
        <StatCard label="أصناف منخفضة المخزون" value={lowCount} tone={lowCount ? "danger" : "default"} />
        {showCost && <StatCard label="قيمة المخزون" value={<Money value={sum(allVariants.map((v) => D(v.stockValue)))} currency={cur} />} tone="gold" />}
      </div>
      <Card>
        <FilterBar q={q} values={sp} placeholder="ابحث بالاسم أو العلامة أو SKU أو الباركود"
          filters={[{ name: "category", label: "الفئة", options: categories.map((c) => ({ value: c.category!, label: c.category! })) }]} />
        {products.length ? (
          <Table>
            <THead><TR><TH>المنتج</TH><TH>الفئة</TH><TH>العلامة</TH><TH>عدد الأصناف</TH><TH>الكمية</TH>{showCost && <TH>قيمة المخزون</TH>}<TH>التنبيه</TH></TR></THead>
            <TBody>
              {products.map((p) => {
                const qty = sum(p.variants.map((v) => D(v.quantityOnHand)));
                const low = p.variants.filter((v) => isLowStock(v.quantityOnHand, v.reorderLevel)).length;
                return (
                  <TR key={p.id}>
                    <TD><Link href={`/clothing/${p.id}`} className="font-bold hover:text-gold">{p.name}</Link></TD>
                    <TD>{p.category ?? "—"}</TD><TD>{p.brand ?? "—"}</TD><TD>{p.variants.length}</TD>
                    <TD className="num font-semibold">{qty.toString()}</TD>
                    {showCost && <TD><Money value={sum(p.variants.map((v) => D(v.stockValue)))} currency={cur} /></TD>}
                    <TD>{low ? <Badge variant="destructive">{low} منخفض</Badge> : <Badge variant="success">جيد</Badge>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : <EmptyState icon={Shirt} title="لا توجد منتجات" description={q || sp.category ? "لا نتائج مطابقة" : "أضف منتجًا بمقاساته وألوانه ثم سجّل استلام البضاعة"} />}
        <Pagination page={page} pageSize={PAGE} total={total} params={sp} />
      </Card>
    </div>
  );
}
