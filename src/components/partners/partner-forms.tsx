"use client";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { FormDialog } from "@/components/forms/form-dialog";
import { CheckboxField, DateField, Grid, MoneyField, SelectField, TextAreaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { createAgreementAction, createPartnerAction, distributeProfitAction, partnerMovementAction } from "@/server/actions/partners";
import type { Option } from "@/server/queries/options";
import { today } from "@/lib/utils";

export function NewPartnerDialog() {
  return (
    <FormDialog title="إضافة شريك / مستثمر" description="الشركاء على مستوى المنشأة ويمكن إشراكهم في اتفاقيات أي شركة" trigger="شريك جديد" triggerVariant="outline" action={createPartnerAction}>
      <Grid>
        <TextField name="name" label="الاسم" required />
        <TextField name="phone" label="الجوال" dir="ltr" />
        <TextField name="email" label="البريد الإلكتروني" dir="ltr" type="email" />
        <TextField name="nationalId" label="رقم الهوية / السجل" dir="ltr" />
      </Grid>
      <CheckboxField name="isInvestor" label="مستثمر (ممول دون إدارة)" />
      <TextAreaField name="notes" label="ملاحظات" rows={2} />
    </FormDialog>
  );
}

const SCOPES: Option[] = [
  { value: "COMPANY", label: "الشركة بالكامل" }, { value: "ACTIVITY", label: "نشاط تجاري" }, { value: "SHIPMENT", label: "شحنة استيراد" },
  { value: "VEHICLE", label: "سيارة محددة" }, { value: "TRANSACTION", label: "صفقة تجارية" },
];

export function NewAgreementDialog({ partners, refs }: { partners: Option[]; refs: { ACTIVITY: Option[]; SHIPMENT: Option[]; VEHICLE: Option[] } }) {
  const [scope, setScope] = useState("COMPANY");
  const [rows, setRows] = useState([{ key: 1 }, { key: 2 }]);
  const [k, setK] = useState(3);
  const refOptions = scope in refs ? refs[scope as keyof typeof refs] : null;
  return (
    <FormDialog title="اتفاقية شراكة جديدة" description="اترك نسب الربح فارغة لجميع الشركاء لتُحسب حسب رأس المال، أو حددها للجميع (مجموعها 100%)" trigger="اتفاقية جديدة" action={createAgreementAction} wide>
      <Grid cols={3}>
        <TextField name="name" label="اسم الاتفاقية" required placeholder="شراكة شحنة السيارات 2026" />
        <SelectField name="scope" label="نطاق الشراكة" options={SCOPES} value={scope} onChange={(e) => setScope(e.target.value)} />
        {refOptions && <SelectField name="scopeRefId" label="المرجع" options={refOptions} placeholder="اختر" required />}
      </Grid>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="p-2 text-start">الشريك</th><th className="p-2 text-start">رأس المال</th><th className="p-2 text-start">نسبة الربح %</th><th className="p-2 text-start">نسبة الخسارة %</th><th className="w-10" /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-t">
                <td className="p-1.5"><NativeSelect name={`shares.${i}.partnerId`} required defaultValue="" className="h-9 min-w-[180px]"><option value="">اختر الشريك</option>{partners.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</NativeSelect></td>
                <td className="p-1.5"><Input name={`shares.${i}.capitalAmount`} inputMode="decimal" dir="ltr" className="num h-9 text-right" placeholder="0.00" /></td>
                <td className="p-1.5"><Input name={`shares.${i}.profitSharePct`} inputMode="decimal" dir="ltr" className="num h-9 text-right" placeholder="حسب رأس المال" /></td>
                <td className="p-1.5"><Input name={`shares.${i}.lossSharePct`} inputMode="decimal" dir="ltr" className="num h-9 text-right" placeholder="= نسبة الربح" /></td>
                <td className="p-1.5"><Button type="button" variant="ghost" size="icon" disabled={rows.length <= 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="حذف"><Trash2 className="text-destructive" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t p-2"><Button type="button" variant="outline" size="sm" onClick={() => { setRows((rs) => [...rs, { key: k }]); setK(k + 1); }}><Plus /> شريك</Button></div>
      </div>
      {!partners.length && <p className="text-xs text-destructive">أضف الشركاء أولًا من زر &quot;شريك جديد&quot;.</p>}
      <TextAreaField name="notes" label="ملاحظات / شروط" rows={2} />
    </FormDialog>
  );
}

export function PartnerMovementDialog({ agreementId, partners, cashAccounts, type }: { agreementId: string; partners: Option[]; cashAccounts: Option[]; type: "CONTRIBUTION" | "WITHDRAWAL" }) {
  return (
    <FormDialog title={type === "CONTRIBUTION" ? "مساهمة رأس مال" : "سحب شريك"} description={type === "CONTRIBUTION" ? "يُرحّل: مدين الصندوق/البنك، دائن رأس المال أو جاري الشريك" : "يُرحّل: مدين جاري الشريك، دائن الصندوق/البنك"}
      trigger={type === "CONTRIBUTION" ? "مساهمة" : "سحب"} triggerVariant="outline" triggerSize="sm" action={partnerMovementAction}>
      <input type="hidden" name="agreementId" value={agreementId} />
      <input type="hidden" name="type" value={type} />
      <Grid>
        <SelectField name="partnerId" label="الشريك" options={partners} required />
        <MoneyField name="amount" label="المبلغ" required />
        <SelectField name="accountId" label={type === "CONTRIBUTION" ? "إيداع في" : "صرف من"} options={cashAccounts} required />
        <DateField name="date" label="التاريخ" required defaultValue={today()} />
      </Grid>
      <TextField name="note" label="ملاحظة" />
    </FormDialog>
  );
}

interface Share { partnerId: string; name: string; capital: string; profitPct: string | null; lossPct: string | null }

/** Client-side preview mirrors the server's largest-remainder split; the server recomputes on submit. */
function preview(shares: Share[], amount: Decimal) {
  const neg = amount.isNegative();
  const pcts = shares.map((s) => (neg ? s.lossPct ?? s.profitPct : s.profitPct));
  const weights = pcts.every((p) => p !== null) ? pcts.map((p) => new Decimal(p as string)) : shares.map((s) => new Decimal(s.capital));
  const wSum = weights.reduce((a, w) => a.plus(w), new Decimal(0));
  if (wSum.isZero()) return shares.map(() => new Decimal(0));
  const cents = amount.times(100);
  const raw = weights.map((w) => cents.times(w).div(wSum));
  const floors = raw.map((r) => (neg ? r.ceil() : r.floor()));
  let rem = cents.minus(floors.reduce((a, f) => a.plus(f), new Decimal(0))).toNumber();
  const order = raw.map((r, i) => ({ i, f: r.minus(floors[i]).abs() })).sort((a, b) => b.f.comparedTo(a.f) || a.i - b.i);
  const step = rem >= 0 ? 1 : -1;
  for (let j = 0; rem !== 0 && order.length; j = (j + 1) % order.length) { floors[order[j].i] = floors[order[j].i].plus(step); rem -= step; }
  return floors.map((f) => f.div(100));
}

export function DistributeDialog({ agreementId, shares, canPost, suggested }: { agreementId: string; shares: Share[]; canPost: boolean; suggested?: string }) {
  const [amount, setAmount] = useState(suggested ?? "");
  const parsed = useMemo(() => {
    try { return new Decimal(amount.replace(/,/g, "") || "0"); } catch { return new Decimal(0); }
  }, [amount]);
  const parts = useMemo(() => preview(shares, parsed), [shares, parsed]);
  return (
    <FormDialog title="توزيع الأرباح / تحميل الخسائر" description="أدخل مبلغًا موجبًا للربح أو سالبًا للخسارة" trigger="توزيع" triggerVariant="gold" icon={false} action={distributeProfitAction}>
      <input type="hidden" name="agreementId" value={agreementId} />
      <Grid>
        <MoneyField name="amount" label="المبلغ" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        <DateField name="date" label="التاريخ" required defaultValue={today()} />
      </Grid>
      <div className="rounded-xl border">
        <p className="border-b p-2 text-xs font-bold text-muted-foreground">معاينة التوزيع</p>
        <ul className="divide-y text-sm">
          {shares.map((s, i) => (
            <li key={s.partnerId} className="flex items-center justify-between p-2">
              <span>{s.name}</span>
              <span className={`num font-semibold ${parts[i]?.isNegative() ? "text-destructive" : ""}`}>{parts[i]?.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>
      {canPost ? <CheckboxField name="post" label="ترحيل للدفاتر" defaultChecked hint="مدين الأرباح المبقاة ودائن جاري كل شريك (أو العكس للخسارة)" />
        : <p className="text-xs text-muted-foreground">سيُسجّل التوزيع في سجل الشراكة دون ترحيل محاسبي (يتطلب صلاحية إنشاء قيود).</p>}
      <TextField name="note" label="ملاحظة" />
    </FormDialog>
  );
}
