"use client";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { DateField, Grid, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { createJournalEntryAction } from "@/server/actions/accounting";
import type { Option } from "@/server/queries/options";
import { cn, today } from "@/lib/utils";

interface Line { key: number; debit: string; credit: string }

const toDec = (v: string) => {
  try {
    return new Decimal(v.replace(/,/g, "").trim() || "0");
  } catch {
    return new Decimal(0);
  }
};

export function JournalEditor({ accounts, activities, customers, suppliers, canPost }: { accounts: Option[]; activities: Option[]; customers: Option[]; suppliers: Option[]; canPost: boolean }) {
  const [lines, setLines] = useState<Line[]>([{ key: 1, debit: "", credit: "" }, { key: 2, debit: "", credit: "" }]);
  const [nextKey, setNextKey] = useState(3);
  const totals = useMemo(() => {
    const d = lines.reduce((a, l) => a.plus(toDec(l.debit)), new Decimal(0));
    const c = lines.reduce((a, l) => a.plus(toDec(l.credit)), new Decimal(0));
    return { d, c, diff: d.minus(c), balanced: d.equals(c) && d.gt(0) };
  }, [lines]);
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <ActionForm action={createJournalEntryAction} resetOnSuccess={false}>
      <Grid>
        <DateField name="date" label="تاريخ القيد" required defaultValue={today()} />
        <TextField name="description" label="البيان" required placeholder="مثال: إيداع رأس المال في البنك" />
      </Grid>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="p-2 text-start">الحساب</th><th className="w-32 p-2 text-start">مدين</th><th className="w-32 p-2 text-start">دائن</th>
              <th className="p-2 text-start">البيان</th><th className="p-2 text-start">النشاط</th><th className="p-2 text-start">العميل / المورد</th><th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key} className="border-t">
                <td className="p-1.5">
                  <NativeSelect name={`lines.${i}.accountId`} required className="h-9 min-w-[200px]" defaultValue="">
                    <option value="">اختر الحساب</option>
                    {accounts.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </NativeSelect>
                </td>
                <td className="p-1.5"><Input name={`lines.${i}.debit`} inputMode="decimal" dir="ltr" className="num h-9 text-right" value={l.debit} onChange={(e) => update(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} placeholder="0.00" /></td>
                <td className="p-1.5"><Input name={`lines.${i}.credit`} inputMode="decimal" dir="ltr" className="num h-9 text-right" value={l.credit} onChange={(e) => update(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} placeholder="0.00" /></td>
                <td className="p-1.5"><Input name={`lines.${i}.description`} className="h-9 min-w-[140px]" /></td>
                <td className="p-1.5">
                  <NativeSelect name={`lines.${i}.activityId`} className="h-9 min-w-[130px]" defaultValue="">
                    <option value="">—</option>
                    {activities.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </NativeSelect>
                </td>
                <td className="p-1.5">
                  <PartySelect index={i} customers={customers} suppliers={suppliers} />
                </td>
                <td className="p-1.5">
                  <Button type="button" variant="ghost" size="icon" disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="حذف السطر"><Trash2 className="text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 bg-muted/40 font-bold">
            <tr>
              <td className="p-2">
                <Button type="button" variant="outline" size="sm" onClick={() => { setLines((ls) => [...ls, { key: nextKey, debit: "", credit: "" }]); setNextKey((k) => k + 1); }}><Plus /> سطر</Button>
              </td>
              <td className="num p-2">{totals.d.toFixed(2)}</td>
              <td className="num p-2">{totals.c.toFixed(2)}</td>
              <td colSpan={4} className="p-2">
                <span className={cn("rounded-full px-3 py-1 text-xs", totals.balanced ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                  {totals.balanced ? "القيد متوازن ✓" : `الفرق: ${totals.diff.abs().toFixed(2)}`}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">عند اختيار عميل أو مورد يظهر السطر في كشف حسابه. استخدم ذلك مع حسابات الذمم فقط.</p>
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="mode" value="draft" variant="outline">حفظ كمسودة</SubmitButton>
        {canPost && <SubmitButton name="mode" value="post" disabled={!totals.balanced}>ترحيل القيد</SubmitButton>}
      </div>
    </ActionForm>
  );
}

function PartySelect({ index, customers, suppliers }: { index: number; customers: Option[]; suppliers: Option[] }) {
  const [v, setV] = useState("");
  const [kind, id] = v.split(":");
  return (
    <>
      <NativeSelect className="h-9 min-w-[150px]" value={v} onChange={(e) => setV(e.target.value)} aria-label="الطرف">
        <option value="">—</option>
        {customers.length > 0 && <optgroup label="العملاء">{customers.map((c) => <option key={c.value} value={`c:${c.value}`}>{c.label}</option>)}</optgroup>}
        {suppliers.length > 0 && <optgroup label="الموردون">{suppliers.map((s) => <option key={s.value} value={`s:${s.value}`}>{s.label}</option>)}</optgroup>}
      </NativeSelect>
      {kind === "c" && <input type="hidden" name={`lines.${index}.customerId`} value={id} />}
      {kind === "s" && <input type="hidden" name={`lines.${index}.supplierId`} value={id} />}
    </>
  );
}
