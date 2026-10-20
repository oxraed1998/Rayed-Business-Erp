"use server";
// Server Action entry points. Implementations live in src/server/actions-impl
// (Next.js only allows async functions in "use server" modules).
import * as impl from "@/server/actions-impl/payments";

export async function recordPaymentAction(...args: Parameters<typeof impl.recordPaymentAction>) {
  return impl.recordPaymentAction(...args);
}
