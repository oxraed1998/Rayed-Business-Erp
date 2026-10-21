"use client";
import { useState } from "react";
import { SelectField } from "./fields";
import type { Option } from "@/server/queries/options";

/**
 * How a purchase/expense is settled: from a cash/bank account, or on credit with a supplier
 * (posted to accounts payable on that supplier's statement). Posts `settlement.accountId`
 * and `settlement.supplierId`.
 */
export function SettlementField({ cashAccounts, suppliers, label = "طريقة السداد", defaultSupplierId }: { cashAccounts: Option[]; suppliers: Option[]; label?: string; defaultSupplierId?: string }) {
  const [value, setValue] = useState(cashAccounts[0]?.value ?? "AP");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField name="settlement.accountId" label={label} required value={value} onChange={(e) => setValue(e.target.value)}
        options={[...cashAccounts.map((o) => ({ ...o, label: `نقدًا من: ${o.label}` })), { value: "AP", label: "آجل (على حساب المورد)" }]} />
      {value === "AP" && <SelectField name="settlement.supplierId" label="المورد" required options={suppliers} placeholder="اختر المورد" defaultValue={defaultSupplierId} />}
    </div>
  );
}
