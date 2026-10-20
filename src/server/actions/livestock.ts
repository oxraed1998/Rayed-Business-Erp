"use server";
// Server Action entry points. Implementations live in src/server/actions-impl
// (Next.js only allows async functions in "use server" modules).
import * as impl from "@/server/actions-impl/livestock";

export async function createHerdAction(...args: Parameters<typeof impl.createHerdAction>) {
  return impl.createHerdAction(...args);
}

export async function herdPurchaseAction(...args: Parameters<typeof impl.herdPurchaseAction>) {
  return impl.herdPurchaseAction(...args);
}

export async function herdExpenseAction(...args: Parameters<typeof impl.herdExpenseAction>) {
  return impl.herdExpenseAction(...args);
}

export async function herdBirthAction(...args: Parameters<typeof impl.herdBirthAction>) {
  return impl.herdBirthAction(...args);
}

export async function herdDeathAction(...args: Parameters<typeof impl.herdDeathAction>) {
  return impl.herdDeathAction(...args);
}

export async function herdWeighingAction(...args: Parameters<typeof impl.herdWeighingAction>) {
  return impl.herdWeighingAction(...args);
}

export async function herdSaleAction(...args: Parameters<typeof impl.herdSaleAction>) {
  return impl.herdSaleAction(...args);
}
