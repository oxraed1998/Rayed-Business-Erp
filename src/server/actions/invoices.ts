"use server";
// Server Action entry points. Implementations live in src/server/actions-impl
// (Next.js only allows async functions in "use server" modules).
import * as impl from "@/server/actions-impl/invoices";

export async function createInvoiceAction(...args: Parameters<typeof impl.createInvoiceAction>) {
  return impl.createInvoiceAction(...args);
}

export async function postInvoiceAction(...args: Parameters<typeof impl.postInvoiceAction>) {
  return impl.postInvoiceAction(...args);
}

export async function voidInvoiceAction(...args: Parameters<typeof impl.voidInvoiceAction>) {
  return impl.voidInvoiceAction(...args);
}

export async function createInstallmentPlanAction(...args: Parameters<typeof impl.createInstallmentPlanAction>) {
  return impl.createInstallmentPlanAction(...args);
}
