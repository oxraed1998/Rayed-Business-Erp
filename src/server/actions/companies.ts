"use server";
// Server Action entry points. Implementations live in src/server/actions-impl
// (Next.js only allows async functions in "use server" modules).
import * as impl from "@/server/actions-impl/companies";

export async function createCompanyAction(...args: Parameters<typeof impl.createCompanyAction>) {
  return impl.createCompanyAction(...args);
}

export async function updateCompanyAction(...args: Parameters<typeof impl.updateCompanyAction>) {
  return impl.updateCompanyAction(...args);
}

export async function createActivityAction(...args: Parameters<typeof impl.createActivityAction>) {
  return impl.createActivityAction(...args);
}

export async function toggleActivityAction(...args: Parameters<typeof impl.toggleActivityAction>) {
  return impl.toggleActivityAction(...args);
}
