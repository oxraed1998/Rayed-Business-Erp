"use client";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckboxField, DateField, Grid, SelectField, TextAreaField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { calcLine, INVOICE_TYPE_LABELS } from "@/lib/domain/invoice-calc";
import { formatMoney, sum } from "@/lib/money";
import { createInvoiceAction } from "@/server/actions/invoices";
import type { Option } from "@/server/queries/options";
import { today } from "@/lib/utils";

type InvoiceType = keyof typeof INVOICE_TYPE_LABELS;
type Line = { key: number; description: string; quantity: string; unitPrice: string; discount: string; vatRate: string };

const num = (v: string) => (/^-?\d*\.?\d*$/.test(v.trim()) && v.trim() !== "" ? v.trim() : "0");

export function InvoiceEditor(p: {
  defaultType: InvoiceType; defaultCustomerId?: string; defaultSupplierId?: string; defaultRelatedId?: string;
  customers: Option[]; suppliers: Option[]; activities: Option[]; currencies: Option[]; postedSales: (Option & { customerId: string | null })[];
  vatRate: string; baseCurrency: string; canApprove: boolean;
}) {
  const [type, setType] = useState<InvoiceType>(p.defaultType);
  const [currency, setCurrency] = useState(p.baseCurrency);
  const nextKey = useRef(2);
  const blank = (): Line => ({ key: nextKey.current++, description: "", quantity: "1", unitPrice: "", discount: "", vatRate: p.vatRate });
  const [lines, setLines] = useState<Line[]>([{ key: 1, description: "", quantity: "1", unitPrice: "", discount: "", vatRate: p.vatRate }]);
  const supplierSide = type === "PURCHASE";

  const update = (key: number, field: keyof Line, value: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));

  const totals = useMemo(() => {
    const calc = lines.map((l) => {
      try {
        return { ok: true as const, ...calcLine({ description: l.description, quantity: num(l.quantity), unitPrice: num(l.unitPrice), discount: num(l.discount), vatRate: num(l.vatRate) }) };
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      }
    });
    const ok = calc.filter((c) => c.ok) as Extract<(typeof calc)[number], { ok: true }>[];
    return {
      calc,
      subtotal: sum(ok.map((c) => c.gross)), discount: sum(ok.map((c) => c.discount)), vat: sum(ok.map((c) => c.vat)), total: sum(ok.map((c) => c.total)),
    };
  }, [lines]);

  const m = (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, currency);

  return (
    <ActionForm action={createInvoiceAction} resetOnSuccess={false}>
      <Card>
        <CardHeader><CardTitle>بيانات الفاتورة</CardTitle></CardHeader>
        <CardContent>
          <Grid cols={3}>
            <SelectField name="type" label="نوع المستند" required value={type} onChange={(e) => setType(e.target.value as InvoiceType)}
              options={Object.entries(INVOICE_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
            {supplierSide
              ? <SelectField key="s" name="supplierId" label="المورد" required options={p.suppliers} placeholder="اختر المورد" defaultValue={p.defaultSupplierId} />
              : <SelectField key="c" name="customerId" label="العميل" required options={p.customers} placeholder="اختر العميل" defaultValue={p.defaultCustomerId} />}
            <SelectField name="activityId" label="النشاط التجاري" options={p.activities} placeholder="غير محدد" hint="يُحدد حساب الإيراد الافتراضي ويُستخدم في تقارير الأنشطة" />
            <DateField name="issueDate" label="تاريخ الإصدار" required defaultValue={today()} />
            <DateField name="dueDate" label="تاريخ الاستحقاق" />
            {type === "CREDIT_NOTE" || type === "DEBIT_NOTE"
              ? <SelectField name="relatedInvoiceId" label="الفاتورة الأصلية" options={p.postedSales} placeholder="اختر الفاتورة" defaultValue={p.defaultRelatedId} hint={type === "CREDIT_NOTE" ? "يُخفض الإشعار الدائن المستحق على الفاتورة الأصلية" : undefined} />
              : <div className="hidden sm:block" />}
            <SelectField name="currency" label="العملة" options={p.currencies} value={currency} onChange={(e) => setCurrency(e.target.value)} />
            {currency !== p.baseCurrency
              ? <Field label={`سعر الصرف إلى ${p.baseCurrency}`} required hint="يُحوّل القيد إلى العملة الأساسية بهذا السعر"><Input name="fxRate" required inputMode="decimal" dir="ltr" className="num text-right" placeholder="3.75" /></Field>
              : <input type="hidden" name="fxRate" value="1" />}
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between"><CardTitle>البنود</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, blank()])}><Plus /> إضافة بند</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="hidden grid-cols-[2.5fr_.8fr_1fr_.9fr_.7fr_1fr_36px] gap-2 px-1 text-xs font-bold text-muted-foreground lg:grid">
            <span>الوصف</span><span>الكمية</span><span>سعر الوحدة</span><span>الخصم</span><span>الضريبة %</span><span className="text-left">الإجمالي</span><span />
          </div>
          {lines.map((l, i) => {
            const c = totals.calc[i];
            return (
              <div key={l.key} className="grid grid-cols-2 gap-2 rounded-xl border p-3 lg:grid-cols-[2.5fr_.8fr_1fr_.9fr_.7fr_1fr_36px] lg:items-center lg:border-0 lg:p-0">
                <Input name={`lines.${i}.description`} value={l.description} onChange={(e) => update(l.key, "description", e.target.value)} placeholder="وصف البند" required className="col-span-2 lg:col-span-1" aria-label="الوصف" />
                <Input name={`lines.${i}.quantity`} value={l.quantity} onChange={(e) => update(l.key, "quantity", e.target.value)} inputMode="decimal" dir="ltr" className="num text-right" aria-label="الكمية" required />
                <Input name={`lines.${i}.unitPrice`} value={l.unitPrice} onChange={(e) => update(l.key, "unitPrice", e.target.value)} inputMode="decimal" dir="ltr" className="num text-right" placeholder="0.00" aria-label="سعر الوحدة" required />
                <Input name={`lines.${i}.discount`} value={l.discount} onChange={(e) => update(l.key, "discount", e.target.value)} inputMode="decimal" dir="ltr" className="num text-right" placeholder="0.00" aria-label="الخصم" />
                <Input name={`lines.${i}.vatRate`} value={l.vatRate} onChange={(e) => update(l.key, "vatRate", e.target.value)} inputMode="decimal" dir="ltr" className="num text-right" aria-label="نسبة الضريبة" />
                <span className={`num text-left text-sm font-bold ${c && !c.ok ? "text-destructive text-xs" : ""}`}>{c?.ok ? m(c.total) : c?.error}</span>
                <Button type="button" variant="ghost" size="icon" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} disabled={lines.length === 1} aria-label="حذف البند"><Trash2 className="text-destructive" /></Button>
              </div>
            );
          })}
          <div className="mr-auto mt-4 w-full max-w-sm space-y-1.5 rounded-xl bg-muted/50 p-4 text-sm">
            <Row label="المجموع قبل الخصم" value={m(totals.subtotal)} />
            <Row label="الخصم" value={m(totals.discount)} />
            <Row label="الصافي قبل الضريبة" value={m(totals.subtotal.minus(totals.discount))} />
            <Row label="ضريبة القيمة المضافة" value={m(totals.vat)} />
            <div className="border-t pt-2"><Row label="الإجمالي" value={m(totals.total)} bold /></div>
            {currency !== p.baseCurrency && <p className="text-xs text-muted-foreground">سيتم التحويل إلى {p.baseCurrency} بسعر الصرف المُدخل عند الترحيل.</p>}
          </div>
          <p className="text-xs text-muted-foreground">الحسابات معاينة فقط؛ الخادم يعيد احتساب الضريبة والإجماليات عند الحفظ.</p>
        </CardContent>
      </Card>

      <Card><CardContent className="space-y-4 pt-5">
        <TextAreaField name="notes" label="ملاحظات" rows={2} />
        {p.canApprove
          ? <CheckboxField name="postNow" label="ترحيل الفاتورة مباشرة إلى دفتر الأستاذ" defaultChecked hint="بدون تحديد تُحفظ كمسودة قابلة للمراجعة قبل الترحيل" />
          : <p className="text-xs text-muted-foreground">ستُحفظ الفاتورة كمسودة؛ يتطلب الترحيل صلاحية اعتماد الفواتير.</p>}
        <div className="flex justify-end"><SubmitButton size="lg">حفظ الفاتورة</SubmitButton></div>
      </CardContent></Card>
    </ActionForm>
  );
}

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className={`flex items-center justify-between ${bold ? "text-base font-extrabold" : ""}`}><span className={bold ? "" : "text-muted-foreground"}>{label}</span><span className="num">{value}</span></div>
);
