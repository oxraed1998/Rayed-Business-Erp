"use client";
import { useState } from "react";
import { FormDialog } from "@/components/forms/form-dialog";
import { DateField, Grid, MoneyField, SelectField, TextAreaField } from "@/components/forms/fields";
import { SettlementField } from "@/components/forms/settlement-field";
import { importEncarVehicleAction } from "@/server/actions/encar";
import type { Option } from "@/server/queries/options";
import { today } from "@/lib/utils";

const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

export function ImportEncarDialog(p: {
  listingId: string; priceKrw: string | null; defaultRate: string | null; baseCurrency: string;
  activities: Option[]; suppliers: Option[]; cashAccounts: Option[];
}) {
  const [price, setPrice] = useState(p.priceKrw ?? "");
  const [rate, setRate] = useState(p.defaultRate ?? "");
  const base = Number(price) > 0 && Number(rate) > 0 ? Number(price) * Number(rate) : null;
  return (
    <FormDialog title="استيراد إلى مخزون السيارات" description="تُنشأ السيارة بعملة الوون الكوري ويُرحّل قيد الشراء إلى مخزون السيارات" trigger="استيراد إلى المخزون" triggerVariant="gold" action={importEncarVehicleAction} submitLabel="استيراد" wide>
      <input type="hidden" name="listingId" value={p.listingId} />
      <Grid>
        <MoneyField name="purchasePrice" label="سعر الشراء الفعلي (KRW)" required value={price} onChange={(e) => setPrice(e.target.value)} hint="افتراضيًا سعر الإعلان؛ عدّله إلى السعر المتفق عليه" pattern="[0-9]*" />
        <MoneyField name="exchangeRate" label={`سعر صرف الوون إلى ${p.baseCurrency}`} required value={rate} onChange={(e) => setRate(e.target.value)} pattern="[0-9]*[.,]?[0-9]{0,6}" hint={p.defaultRate ? "آخر سعر مستخدم في الشركة" : "مثال: 0.0027 (ريال لكل وون)"} />
      </Grid>
      <div className="rounded-lg bg-gold-soft p-3 text-sm">
        التكلفة بالعملة الأساسية: <b className="num">{base !== null ? `${fmt(base)} ${p.baseCurrency}` : "—"}</b>
        <span className="block text-xs text-muted-foreground">أضف الشحن والجمارك والتخليص لاحقًا من صفحة السيارة أو كمصاريف شحنة مشتركة.</span>
      </div>
      <Grid>
        <DateField name="purchaseDate" label="تاريخ الشراء" required defaultValue={today()} />
        <SelectField name="activityId" label="النشاط" options={p.activities} />
        <SelectField name="supplierId" label="المورد (البائع/الوكيل في كوريا)" options={p.suppliers} placeholder="بدون" />
      </Grid>
      <SettlementField cashAccounts={p.cashAccounts} suppliers={p.suppliers} label="سداد قيمة الشراء" />
      <TextAreaField name="notes" label="ملاحظات إضافية" rows={2} />
    </FormDialog>
  );
}
