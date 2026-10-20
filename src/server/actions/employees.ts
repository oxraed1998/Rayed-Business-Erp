"use server";
// Server Action entry points. Implementations live in src/server/actions-impl
// (Next.js only allows async functions in "use server" modules).
import * as impl from "@/server/actions-impl/employees";

export async function createEmployeeAction(...args: Parameters<typeof impl.createEmployeeAction>) {
  return impl.createEmployeeAction(...args);
}

export async function updateEmployeeAction(...args: Parameters<typeof impl.updateEmployeeAction>) {
  return impl.updateEmployeeAction(...args);
}
