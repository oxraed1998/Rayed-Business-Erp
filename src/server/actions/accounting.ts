"use server";
// Server Action entry points. Implementations live in src/server/actions-impl
// (Next.js only allows async functions in "use server" modules).
import * as impl from "@/server/actions-impl/accounting";

export async function createAccountAction(...args: Parameters<typeof impl.createAccountAction>) {
  return impl.createAccountAction(...args);
}

export async function createJournalEntryAction(...args: Parameters<typeof impl.createJournalEntryAction>) {
  return impl.createJournalEntryAction(...args);
}

export async function postJournalEntryAction(...args: Parameters<typeof impl.postJournalEntryAction>) {
  return impl.postJournalEntryAction(...args);
}

export async function deleteJournalEntryAction(...args: Parameters<typeof impl.deleteJournalEntryAction>) {
  return impl.deleteJournalEntryAction(...args);
}

export async function reverseJournalEntryAction(...args: Parameters<typeof impl.reverseJournalEntryAction>) {
  return impl.reverseJournalEntryAction(...args);
}

export async function createPeriodAction(...args: Parameters<typeof impl.createPeriodAction>) {
  return impl.createPeriodAction(...args);
}

export async function closePeriodAction(...args: Parameters<typeof impl.closePeriodAction>) {
  return impl.closePeriodAction(...args);
}
