import { notFound } from "next/navigation";
import { Shirt } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { isLowStock, MOVEMENT_LABELS } from "@/lib/domain/inventory";
import { D } from "@/lib/money";
import { cashAccountOptions, currencyOptions, customerOptions, shipmentOptions, supplierOptions, warehouseOptions } from "@/server/queries/options";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KeyValue, PageHeader } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AdjustStockDialog, ReceiveStockDialog, ReturnStockDialog, SellStockDialog, TransferStockDialog } from "@/components/clothing/product-forms";
import { fmtDate } from "@/lib/utils";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCompanyContext("clothing.read");
  const { id } = await params;
  const p = await db.product.findFirst({ where: { id, ...scope(ctx) }, include: { variants: { orderBy: { sku: "asc" } } } });
  if (!p) notFound();
  const variantIds = p.variants.map((v) => v.id);
  const [byWh, warehouses, movements] = await Promise.all([
    db.inventoryMovement.groupBy({ by: ["variantId", "warehouseId"], where: { tenantId: ctx.tenant.id, companyId: ctx.company.id, variantId: { in: variantIds } }, _sum: { quantity: true } }),
    warehouseOptions(ctx),
    db.inventoryMovement.findMany({ where: { tenantId: ctx.tenant.id, companyId: ctx.company.id, variantId: { in: variantIds } }, include: { variant: true, warehouse: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 50 }),
  ]);
  const qtyAt = (v: string, w: string) => D(byWh.find((x) => x.variantId === v && x.warehouseId === w)?._sum.quantity ?? 0);
  const showCost = ctx.permissions.has("financials.read");
  const cur = ctx.company.baseCurrency;
  const canManage = ctx.permissions.has("inventory.manage");
  const canSell = ctx.permissions.has("invoices.create");
  const variantOpts = p.variants.map((v) => ({ value: v.id, label: `${v.sku}${v.size || v.color ? ` · ${[v.size, v.color].filter(Boolean).join(" / ")}` : ""}`, price: D(v.sellingPrice).toFixed(2) }));
  const [cash, suppliers] = canManage || canSell ? await Promise.all([cashAccountOptions(ctx), supplierOptions(ctx)]) : [[], []];
  // Posted sales invoices that sold one of this product's variants (sale movements carry the invoice number).
  const soldNumbers = canSell
    ? (await db.inventoryMovement.findMany({ where: { tenantId: ctx.tenant.id, companyId: ctx.company.id, variantId: { in: variantIds }, type: "SALE", note: { not: null } }, select: { note: true }, distinct: ["note"] })).map((m) => m.note!)
    : [];
  const saleInvoices = soldNumbers.length
    ? await db.invoice.findMany({ where: { ...scope(ctx), type: "SALES", status: "POSTED", number: { in: soldNumbers } }, include: { customer: true }, orderBy: { issueDate: "desc" }, take: 200 })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader title={p.name} description={[p.category, p.brand].filter(Boolean).join(" · ") || undefined} icon={Shirt}
        actions={<>
          {canManage && <ReceiveStockDialog variants={variantOpts} warehouses={warehouses} shipments={await shipmentOptions(ctx, "CLOTHING")} currencies={currencyOptions} cashAccounts={cash} suppliers={suppliers} />}
          {canSell && <SellStockDialog variants={variantOpts} warehouses={warehouses} customers={await customerOptions(ctx)} cashAccounts={cash} vatRate={ctx.company.vatRate.toString()} />}
          {canSell && <ReturnStockDialog invoices={saleInvoices.map((i) => ({ value: i.id, label: `${i.number} · ${i.customer?.name ?? ""} · ${fmtDate(i.issueDate)}` }))} variants={variantOpts} warehouses={warehouses} vatRate={ctx.company.vatRate.toString()} />}
          {canManage && <AdjustStockDialog variants={variantOpts} warehouses={warehouses} />}
          {canManage && warehouses.length > 1 && <TransferStockDialog variants={variantOpts} warehouses={warehouses} />}
        </>} />

      <Card>
        <CardHeader><CardTitle>الأصناف والأرصدة</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>SKU</TH><TH>الباركود</TH><TH>المقاس</TH><TH>اللون</TH><TH>سعر البيع</TH>{warehouses.map((w) => <TH key={w.value}>{w.label}</TH>)}<TH>الإجمالي</TH>{showCost && <><TH>متوسط التكلفة</TH><TH>القيمة</TH></>}</TR></THead>
            <TBody>
              {p.variants.map((v) => {
                const q = D(v.quantityOnHand);
                const low = isLowStock(v.quantityOnHand, v.reorderLevel);
                return (
                  <TR key={v.id}>
                    <TD className="font-mono text-xs font-bold" dir="ltr">{v.sku}</TD>
                    <TD className="font-mono text-xs" dir="ltr">{v.barcode ?? "—"}</TD>
                    <TD>{v.size ?? "—"}</TD><TD>{v.color ?? "—"}</TD>
                    <TD><Money value={v.sellingPrice} currency={cur} /></TD>
                    {warehouses.map((w) => <TD key={w.value} className="num">{qtyAt(v.id, w.value).toString()}</TD>)}
                    <TD className="num font-bold">{q.toString()} {low && <Badge variant="destructive" className="ms-1">منخفض (حد {v.reorderLevel})</Badge>}</TD>
                    {showCost && <><TD><Money value={q.isZero() ? 0 : D(v.stockValue).div(q)} currency={cur} /></TD><TD><Money value={v.stockValue} currency={cur} /></TD></>}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>آخر حركات المخزون</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>التاريخ</TH><TH>الحركة</TH><TH>الصنف</TH><TH>المستودع</TH><TH>الكمية</TH>{showCost && <><TH>أثر التكلفة</TH><TH>الإيراد</TH></>}<TH>المرجع</TH></TR></THead>
            <TBody>
              {movements.map((m) => (
                <TR key={m.id}>
                  <TD>{fmtDate(m.date)}</TD>
                  <TD><Badge variant={D(m.quantity).isNegative() ? "warning" : "default"}>{MOVEMENT_LABELS[m.type]}</Badge></TD>
                  <TD className="font-mono text-xs" dir="ltr">{m.variant.sku}</TD><TD>{m.warehouse.name}</TD>
                  <TD className="num">{D(m.quantity).toString()}</TD>
                  {showCost && <><TD><Money value={m.totalCost} currency={cur} signed /></TD><TD>{D(m.revenue).isZero() ? "—" : <Money value={m.revenue} currency={cur} />}</TD></>}
                  <TD className="max-w-[160px] truncate text-muted-foreground">{m.note ?? "—"}</TD>
                </TR>
              ))}
              {!movements.length && <TR><TD colSpan={8} className="py-8 text-center text-muted-foreground">لا توجد حركات — سجّل استلام البضاعة أولًا</TD></TR>}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card><CardContent className="pt-5"><KeyValue items={[["طريقة التقييم", "المتوسط المرجح المتحرك"], ["عدد المستودعات", warehouses.length]]} /></CardContent></Card>
    </div>
  );
}
