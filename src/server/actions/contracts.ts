"use server";
// Server Action entry points. Implementations live in src/server/actions-impl
// (Next.js only allows async functions in "use server" modules).
import * as impl from "@/server/actions-impl/contracts";

export async function createContractAction(...args: Parameters<typeof impl.createContractAction>) {
  return impl.createContractAction(...args);
}

export async function updateContractAction(...args: Parameters<typeof impl.updateContractAction>) {
  return impl.updateContractAction(...args);
}

export async function submitContractAction(...args: Parameters<typeof impl.submitContractAction>) {
  return impl.submitContractAction(...args);
}

export async function approveContractAction(...args: Parameters<typeof impl.approveContractAction>) {
  return impl.approveContractAction(...args);
}

export async function rejectContractAction(...args: Parameters<typeof impl.rejectContractAction>) {
  return impl.rejectContractAction(...args);
}

export async function terminateContractAction(...args: Parameters<typeof impl.terminateContractAction>) {
  return impl.terminateContractAction(...args);
}
