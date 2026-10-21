"use client";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { FormDialog } from "@/components/forms/form-dialog";
import { DateField, Grid, MoneyField, SelectField, TextField } from "@/components/forms/fields";
import { SettlementField } from "@/components/forms/settlement-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adjustStockAction, createProductAction, receiveStockAction, returnStockAction, sellStockAction, transferStockAction,
} from "@/server/actions/inventory";
import type { Option } from "@/server/queries/options";
import { today } from "@/lib/utils";

/** Repeatable rows keyed by a stable id so removing a row doesn't shift input state. */
function useRows(initial = 1) {
  const [rows, setRows] = useState(() => Array.from({ length: initial }, (_, i) => i));
  const [next, setNext] = useState(initial);
  return {
    rows,
    add: () => { setRows((r) => [...r, next]); setNext((n) => n + 1); },
    remove: (k: number) => setRows((r) => (r.length > 1 ? r.filter((x) => x !== k) : r)),
  };
}

export function NewProductDialog({ activities }: { activities: Option[] }) {
  const { rows, add, remove } = useRows(1);
  return (
    <FormDialog title="منتج جديد" description="أضف المنتج ومقاساته وألوانه (لكل تركيبة رمز SKU مستقل)" trigger="منتج جديد" action={createProductAction} wide>
      <Grid>
        <TextField name="name" label="اسم المنتج" required placeholder="ثوب رجالي قطن" />
        <TextField name="category" label="الفئة" placeholder="رجالي" />
        <TextField name="brand" label="العلامة التجارية" />
        <SelectField name="activityId" label="النشاط" options={activities} />
      </Grid>
      <div className="space-y-2 rounded-xl border p-3">
        <div className="flex items-center justify-between"><p className="text-sm font-bold">المقاسات والألوان</p><Button type="button" size="sm" variant="outline" onClick={add}><Plus /> إضافة</Button></div>
        {rows.map((k, i) => (
          <div key={k} className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2 sm:grid-cols-4 lg:grid-cols-8">
            <Input name={`variants.${i}.sku`} placeholder="SKU *" required dir="ltr" aria-label="SKU" />
            <Input name={`variants.${i}.barcode`} placeholder="الباركود" dir="ltr" aria-label="الباركود" />
            <Input name={`variants.${i}.size`} placeholder="المقاس" aria-label="المقاس" />
            <Input name={`variants.${i}.color`} placeholder="اللون" aria-label="اللون" />
            <Input name={`variants.${i}.sellingPrice`} placeholder="سعر البيع" inputMode="decimal" dir="ltr" aria-label="سعر البيع" />
            <Input name={`variants.${i}.reorderLevel`} placeholder="حد إعادة الطلب" type="number" min={0} aria-label="حد إعادة الطلب" />
            <Input name={`variants.${i}.weightKg`} placeholder="الوزن كجم" inputMode="decimal" dir="ltr" aria-label="الوزن" />
            <div className="flex gap-1">
              <Input name={`variants.${i}.volumeM3`} placeholder="الحجم م³" inputMode="decimal" dir="ltr" aria-label="الحجم" />
              <Button type="button" size="icon" variant="ghost" onClick={() => remove(k)} aria-label="حذف السطر" disabled={rows.length === 1}><Trash2 /></Button>
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">الوزن والحجم يُستخدمان لتوزيع مصاريف الشحن حسب الوزن/الحجم.</p>
      </div>
    </FormDialog>
  );
}

export function ReceiveStockDialog(p: { variants: Option[]; warehouses: Option[]; shipments: Option[]; currencies: Option[]; cashAccounts: Option[]; suppliers: Option[] }) {
  const [currency, setCurrency] = useState("SAR");
  return (
    <FormDialog title="استلام بضاعة (شراء)" description="تدخل الكمية بتكلفة الشراء المحوّلة للعملة الأساسية (متوسط مرجح)" trigger="استلام" triggerSize="sm" action={receiveStockAction} wide>
      <Grid cols={3}>
        <SelectField name="variantId" label="الصنف" options={p.variants} required />
        <SelectField name="warehouseId" label="المستودع" options={p.warehouses} required />
        <DateField name="date" label="التاريخ" required defaultValue={today()} />
        <MoneyField name="quantity" label="الكمية" required pattern="[0-9]*[.,]?[0-9]{0,3}" />
        <SelectField name="currency" label="العملة" options={p.currencies} value={currency} onChange={(e) => setCurrency(e.target.value)} />
        <MoneyField name="unitCost" label={`تكلفة الوحدة (${currency})`} required />
        <MoneyField name="fxRate" label="سعر الصرف" required defaultValue={currency === "SAR" ? "1" : ""} key={currency} pattern="[0-9]*[.,]?[0-9]{0,6}" />
        <SelectField name="shipmentId" label="شحنة الاستيراد" options={p.shipments} placeholder="بدون شحنة" />
        <TextField name="note" label="ملاحظة" />
      </Grid>
      <SettlementField cashAccounts={p.cashAccounts} suppliers={p.suppliers} />
    </FormDialog>
  );
}

export function SellStockDialog({ variants, warehouses, customers, cashAccounts, vatRate }: { variants: (Option & { price: string })[]; warehouses: Option[]; customers: Option[]; cashAccounts: Option[]; vatRate: string }) {
  const { rows, add, remove } = useRows(1);
  const [prices, setPrices] = useState<Record<number, string>>({});
  return (
    <FormDialog title="بيع أصناف" description="فاتورة مبيعات مرحّلة وتكلفة المبيعات بمتوسط التكلفة" trigger="بيع" triggerVariant="gold" triggerSize="sm" icon={false} action={sellStockAction} submitLabel="تأكيد البيع" wide>
      <Grid cols={4}>
        <SelectField name="customerId" label="العميل" options={customers} required placeholder="اختر العميل" />
        <SelectField name="warehouseId" label="من مستودع" options={warehouses} required />
        <DateField name="date" label="التاريخ" required defaultValue={today()} />
        <MoneyField name="vatRate" label="الضريبة %" required defaultValue={vatRate} />
      </Grid>
      <div className="space-y-2 rounded-xl border p-3">
        <div className="flex items-center justify-between"><p className="text-sm font-bold">البنود</p><Button type="button" size="sm" variant="outline" onClick={add}><Plus /> بند</Button></div>
        {rows.map((k, i) => (
          <div key={k} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <select name={`lines.${i}.variantId`} required className="col-span-2 h-10 rounded-lg border border-input bg-card px-2 text-sm sm:col-span-1" aria-label="الصنف"
              onChange={(e) => setPrices((p) => ({ ...p, [k]: variants.find((v) => v.value === e.target.value)?.price ?? "" }))} defaultValue="">
              <option value="" disabled>اختر الصنف</option>
              {variants.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
            <Input name={`lines.${i}.quantity`} placeholder="الكمية" inputMode="decimal" dir="ltr" required aria-label="الكمية" />
            <Input name={`lines.${i}.unitPrice`} placeholder="السعر" inputMode="decimal" dir="ltr" required aria-label="السعر" value={prices[k] ?? ""} onChange={(e) => setPrices((p) => ({ ...p, [k]: e.target.value }))} />
            <Input name={`lines.${i}.discount`} placeholder="خصم" inputMode="decimal" dir="ltr" aria-label="الخصم" />
            <Button type="button" size="icon" variant="ghost" onClick={() => remove(k)} disabled={rows.length === 1} aria-label="حذف البند"><Trash2 /></Button>
          </div>
        ))}
      </div>
      <Grid><MoneyField name="paidAmount" label="المبلغ المستلم الآن (اختياري)" /><SelectField name="paidAccountId" label="إلى حساب" options={cashAccounts} placeholder="اختر" /></Grid>
    </FormDialog>
  );
}

export function ReturnStockDialog({ invoices, variants, warehouses, vatRate }: { invoices: Option[]; variants: Option[]; warehouses: Option[]; vatRate: string }) {
  return (
    <FormDialog title="مرتجع من عميل" description="يُصدر إشعار دائن وتعود الكمية للمخزون بتكلفة بيعها الأصلية" trigger="مرتجع" triggerVariant="outline" triggerSize="sm" icon={false} action={returnStockAction}>
      <Grid>
        <SelectField name="invoiceId" label="فاتورة البيع" options={invoices} required placeholder={invoices.length ? "اختر الفاتورة" : "لا توجد فواتير بيع لهذا المنتج"} />
        <SelectField name="variantId" label="الصنف" options={variants} required />
        <SelectField name="warehouseId" label="إلى مستودع" options={warehouses} required />
        <DateField name="date" label="التاريخ" required defaultValue={today()} />
        <MoneyField name="quantity" label="الكمية المرتجعة" required pattern="[0-9]*[.,]?[0-9]{0,3}" />
        <MoneyField name="unitPrice" label="سعر الوحدة المسترد (قبل الضريبة)" required />
        <MoneyField name="vatRate" label="الضريبة %" required defaultValue={vatRate} />
      </Grid>
    </FormDialog>
  );
}

export function AdjustStockDialog({ variants, warehouses }: { variants: Option[]; warehouses: Option[] }) {
  return (
    <FormDialog title="تسوية جرد" description="كمية موجبة للزيادة وسالبة للنقص/التالف؛ يُرحّل الفرق إلى حساب تسويات المخزون" trigger="تسوية" triggerVariant="outline" triggerSize="sm" icon={false} action={adjustStockAction}>
      <Grid>
        <SelectField name="variantId" label="الصنف" options={variants} required />
        <SelectField name="warehouseId" label="المستودع" options={warehouses} required />
        <MoneyField name="quantity" label="الكمية (+/−)" required placeholder="-2" pattern="-?[0-9]*[.,]?[0-9]{0,3}" />
        <MoneyField name="unitCost" label="تكلفة الوحدة (للزيادة فقط)" hint="اتركها فارغة لاستخدام متوسط التكلفة" />
        <DateField name="date" label="التاريخ" required defaultValue={today()} />
        <TextField name="note" label="السبب" required placeholder="جرد دوري / تالف" />
      </Grid>
    </FormDialog>
  );
}

export function TransferStockDialog({ variants, warehouses }: { variants: Option[]; warehouses: Option[] }) {
  return (
    <FormDialog title="تحويل بين المستودعات" description="تنتقل الكمية بمتوسط تكلفتها؛ لا يتغير إجمالي قيمة المخزون" trigger="تحويل" triggerVariant="outline" triggerSize="sm" icon={false} action={transferStockAction}>
      <Grid>
        <SelectField name="variantId" label="الصنف" options={variants} required />
        <MoneyField name="quantity" label="الكمية" required pattern="[0-9]*[.,]?[0-9]{0,3}" />
        <SelectField name="fromWarehouseId" label="من" options={warehouses} required />
        <SelectField name="toWarehouseId" label="إلى" options={warehouses} required defaultValue={warehouses[1]?.value} />
        <DateField name="date" label="التاريخ" required defaultValue={today()} />
        <TextField name="note" label="ملاحظة" />
      </Grid>
    </FormDialog>
  );
}
