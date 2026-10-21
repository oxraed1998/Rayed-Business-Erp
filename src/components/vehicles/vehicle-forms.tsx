"use client";
import { useState } from "react";
import { FormDialog } from "@/components/forms/form-dialog";
import { CheckboxField, DateField, Grid, MoneyField, NumberField, SelectField, TextAreaField, TextField } from "@/components/forms/fields";
import { SettlementField } from "@/components/forms/settlement-field";
import { addVehicleExpenseAction, createVehicleAction, sellVehicleAction, setVehicleStatusAction } from "@/server/actions/vehicles";
import type { Option } from "@/server/queries/options";
import { today } from "@/lib/utils";

export function NewVehicleDialog(p: { activities: Option[]; shipments: Option[]; suppliers: Option[]; cashAccounts: Option[]; currencies: Option[] }) {
  const [currency, setCurrency] = useState("SAR");
  return (
    <FormDialog title="إضافة سيارة" description="يُرحّل قيد الشراء تلقائيًا إلى مخزون السيارات" trigger="سيارة جديدة" action={createVehicleAction} wide>
      <Grid cols={3}>
        <TextField name="manufacturer" label="الشركة المصنعة" required placeholder="Hyundai" />
        <TextField name="model" label="الطراز" required placeholder="Sonata" />
        <NumberField name="year" label="سنة الصنع" required min={1950} max={2100} defaultValue={new Date().getFullYear()} />
        <TextField name="vin" label="رقم الهيكل VIN" dir="ltr" maxLength={32} />
        <TextField name="color" label="اللون" />
        <NumberField name="mileage" label="الممشى (كم)" min={0} />
        <TextField name="originCountry" label="بلد المنشأ" placeholder="كوريا الجنوبية" />
        <TextField name="importCountry" label="بلد الاستيراد" placeholder="كوريا الجنوبية" />
        <DateField name="purchaseDate" label="تاريخ الشراء" required defaultValue={today()} />
        <SelectField name="purchaseCurrency" label="عملة الشراء" options={p.currencies} value={currency} onChange={(e) => setCurrency(e.target.value)} />
        <MoneyField name="purchasePrice" label={`سعر الشراء (${currency})`} required />
        <MoneyField name="exchangeRate" label="سعر الصرف إلى العملة الأساسية" required defaultValue={currency === "SAR" ? "1" : ""} key={currency} hint="مثال: 3.75 للدولار" pattern="[0-9]*[.,]?[0-9]{0,6}" />
        <SelectField name="activityId" label="النشاط" options={p.activities} />
        <SelectField name="shipmentId" label="شحنة الاستيراد" options={p.shipments} placeholder="بدون شحنة" />
        <SelectField name="supplierId" label="المورد" options={p.suppliers} placeholder="بدون" />
      </Grid>
      <SettlementField cashAccounts={p.cashAccounts} suppliers={p.suppliers} label="سداد قيمة الشراء" />
      <TextAreaField name="notes" label="ملاحظات" rows={2} />
    </FormDialog>
  );
}

export function VehicleExpenseDialog({ vehicleId, categories, cashAccounts, suppliers }: { vehicleId: string; categories: Option[]; cashAccounts: Option[]; suppliers: Option[] }) {
  return (
    <FormDialog title="إضافة مصروف للسيارة" description="يُرسمَل المصروف ضمن تكلفة السيارة؛ ضريبة المدخلات القابلة للاسترداد لا تدخل في التكلفة" trigger="مصروف" triggerVariant="outline" triggerSize="sm" action={addVehicleExpenseAction}>
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <Grid>
        <SelectField name="category" label="نوع المصروف" options={categories} required />
        <DateField name="date" label="التاريخ" required defaultValue={today()} />
        <MoneyField name="amount" label="المبلغ قبل الضريبة" required />
        <MoneyField name="vatAmount" label="ضريبة القيمة المضافة" />
      </Grid>
      <CheckboxField name="vatRecoverable" label="الضريبة قابلة للاسترداد (ضريبة مدخلات)" defaultChecked hint="ألغِ التحديد إذا كانت الضريبة غير قابلة للاسترداد لتُضاف إلى تكلفة السيارة" />
      <TextField name="description" label="الوصف" />
      <SettlementField cashAccounts={cashAccounts} suppliers={suppliers} />
    </FormDialog>
  );
}

export function VehicleStatusDialog({ vehicleId, options }: { vehicleId: string; options: Option[] }) {
  const [status, setStatus] = useState(options[0]?.value ?? "");
  if (!options.length) return null;
  return (
    <FormDialog title="تغيير حالة السيارة" trigger="تغيير الحالة" triggerVariant="outline" triggerSize="sm" icon={false} action={setVehicleStatusAction}>
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <SelectField name="status" label="الحالة الجديدة" options={options} value={status} onChange={(e) => setStatus(e.target.value)} />
      {status === "RESERVED" && <MoneyField name="deposit" label="عربون الحجز (للمعلومية)" hint="سجّل العربون المستلم كسند قبض من شاشة السندات" />}
    </FormDialog>
  );
}

export function SellVehicleDialog({ vehicleId, customers, cashAccounts, vatRate, suggestedPrice }: { vehicleId: string; customers: Option[]; cashAccounts: Option[]; vatRate: string; suggestedPrice?: string }) {
  const [inst, setInst] = useState(false);
  return (
    <FormDialog title="بيع السيارة" description="تُصدر فاتورة مبيعات مرحّلة ويُنقل التكلفة إلى تكلفة المبيعات" trigger="بيع" triggerVariant="gold" icon={false} action={sellVehicleAction} submitLabel="تأكيد البيع" wide>
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <Grid>
        <SelectField name="customerId" label="العميل" options={customers} required placeholder="اختر العميل" hint={customers.length ? undefined : "أضف عميلًا أولًا من شاشة العملاء"} />
        <DateField name="saleDate" label="تاريخ البيع" required defaultValue={today()} />
        <MoneyField name="price" label="سعر البيع قبل الضريبة" required defaultValue={suggestedPrice} />
        <MoneyField name="vatRate" label="نسبة الضريبة %" required defaultValue={vatRate} />
      </Grid>
      <div className="rounded-xl border p-4">
        <p className="mb-3 text-sm font-bold">الدفعة المستلمة الآن (اختياري)</p>
        <Grid cols={3}>
          <MoneyField name="paidAmount" label="المبلغ" />
          <SelectField name="paidAccountId" label="إلى حساب" options={cashAccounts} placeholder="اختر" />
          <SelectField name="method" label="الطريقة" options={[{ value: "CASH", label: "نقدًا" }, { value: "BANK_TRANSFER", label: "تحويل بنكي" }, { value: "CARD", label: "بطاقة" }, { value: "CHEQUE", label: "شيك" }]} />
        </Grid>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={inst} onChange={(e) => setInst(e.target.checked)} className="size-4 accent-[hsl(var(--gold))]" /> تقسيط المبلغ المتبقي</label>
      {inst && (
        <Grid>
          <NumberField name="installmentCount" label="عدد الأقساط الشهرية" min={1} max={120} required defaultValue={12} />
          <DateField name="firstDueDate" label="تاريخ أول قسط" required />
        </Grid>
      )}
    </FormDialog>
  );
}
