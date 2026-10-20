"use server";
// Server Action entry points. Implementations live in src/server/actions-impl
// (Next.js only allows async functions in "use server" modules).
import * as impl from "@/server/actions-impl/admin";

export async function createTenantAction(...args: Parameters<typeof impl.createTenantAction>) {
  return impl.createTenantAction(...args);
}

export async function updateSubscriptionAction(...args: Parameters<typeof impl.updateSubscriptionAction>) {
  return impl.updateSubscriptionAction(...args);
}

export async function toggleTenantAction(...args: Parameters<typeof impl.toggleTenantAction>) {
  return impl.toggleTenantAction(...args);
}

export async function updatePlanAction(...args: Parameters<typeof impl.updatePlanAction>) {
  return impl.updatePlanAction(...args);
}
