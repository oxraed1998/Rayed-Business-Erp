import type { Tx } from "@/lib/db";

const PREFIX: Record<string, string> = {
  JE: "JE-",
  INV_SALES: "INV-",
  INV_PURCHASE: "PINV-",
  INV_CREDIT_NOTE: "CN-",
  INV_DEBIT_NOTE: "DN-",
  INV_ADVANCE: "ADV-",
  PAY_IN: "RV-",
  PAY_OUT: "PV-",
  CONTRACT: "CT-",
};

/** Gap-free per-company document numbering; must run inside the caller's transaction. */
export async function nextNumber(tx: Tx, tenantId: string, companyId: string, key: string): Promise<string> {
  const prefix = PREFIX[key] ?? `${key}-`;
  const seq = await tx.documentSequence.upsert({
    where: { companyId_key: { companyId, key } },
    create: { tenantId, companyId, key, prefix, next: 2 },
    update: { next: { increment: 1 } },
  });
  const n = seq.next - 1;
  return `${seq.prefix}${String(n).padStart(5, "0")}`;
}
