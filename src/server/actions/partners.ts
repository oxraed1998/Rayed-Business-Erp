"use server";
// Server Action entry points. Implementations live in src/server/actions-impl
// (Next.js only allows async functions in "use server" modules).
import * as impl from "@/server/actions-impl/partners";

export async function createPartnerAction(...args: Parameters<typeof impl.createPartnerAction>) {
  return impl.createPartnerAction(...args);
}

export async function createAgreementAction(...args: Parameters<typeof impl.createAgreementAction>) {
  return impl.createAgreementAction(...args);
}

export async function partnerMovementAction(...args: Parameters<typeof impl.partnerMovementAction>) {
  return impl.partnerMovementAction(...args);
}

export async function distributeProfitAction(...args: Parameters<typeof impl.distributeProfitAction>) {
  return impl.distributeProfitAction(...args);
}
