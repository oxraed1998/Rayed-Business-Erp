"use server";
// Server Action entry points. Implementations live in src/server/actions-impl
// (Next.js only allows async functions in "use server" modules).
import * as impl from "@/server/actions-impl/parties";

export async function saveCustomerAction(...args: Parameters<typeof impl.saveCustomerAction>) {
  return impl.saveCustomerAction(...args);
}

export async function saveSupplierAction(...args: Parameters<typeof impl.saveSupplierAction>) {
  return impl.saveSupplierAction(...args);
}
