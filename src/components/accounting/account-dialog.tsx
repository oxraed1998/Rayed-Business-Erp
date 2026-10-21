"use client";
import { useState } from "react";
import { FormDialog } from "@/components/forms/form-dialog";
import { Grid, SelectField, TextField } from "@/components/forms/fields";
import { createAccountAction } from "@/server/actions/accounting";
import type { Option } from "@/server/queries/options";

const TYPES: Option[] = [
  { value: "ASSET", label: "أصول" }, { value: "LIABILITY", label: "خصوم" }, { value: "EQUITY", label: "حقوق ملكية" },
  { value: "REVENUE", label: "إيرادات" }, { value: "EXPENSE", label: "مصروفات" },
];

export function NewAccountDialog({ parents }: { parents: Option[] }) {
  const [type, setType] = useState("ASSET");
  const [cash, setCash] = useState(false);
  return (
    <FormDialog title="إضافة حساب" description="مثال: حساب بنكي جديد، أو بند مصروفات تفصيلي" trigger="حساب جديد" action={createAccountAction}>
      <Grid>
        <TextField name="code" label="رمز الحساب" required dir="ltr" placeholder="1103" />
        <TextField name="name" label="اسم الحساب" required placeholder="بنك الراجحي" />
        <SelectField name="type" label="نوع الحساب" options={TYPES} value={type} onChange={(e) => setType(e.target.value)} required />
        <SelectField name="parentId" label="الحساب الأب (اختياري)" options={parents} placeholder="بدون" />
      </Grid>
      {type === "ASSET" && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="isCashLike" value="on" checked={cash} onChange={(e) => setCash(e.target.checked)} className="mt-0.5 size-4 accent-[hsl(var(--gold))]" />
          <span><span className="font-semibold">حساب صندوق أو بنك</span><span className="block text-xs text-muted-foreground">يظهر في سندات القبض والصرف وطرق السداد</span></span>
        </label>
      )}
      {type === "ASSET" && cash && (
        <Grid>
          <TextField name="bankName" label="اسم البنك" />
          <TextField name="iban" label="IBAN" dir="ltr" placeholder="SA0000000000000000000000" />
        </Grid>
      )}
    </FormDialog>
  );
}
