"use server";
// Server Action entry points. Implementations live in src/server/actions-impl
// (Next.js only allows async functions in "use server" modules).
import * as impl from "@/server/actions-impl/users";

export async function updateMemberAction(...args: Parameters<typeof impl.updateMemberAction>) {
  return impl.updateMemberAction(...args);
}

export async function toggleMemberAction(...args: Parameters<typeof impl.toggleMemberAction>) {
  return impl.toggleMemberAction(...args);
}

export async function inviteMemberAction(...args: Parameters<typeof impl.inviteMemberAction>) {
  return impl.inviteMemberAction(...args);
}

export async function revokeInvitationAction(...args: Parameters<typeof impl.revokeInvitationAction>) {
  return impl.revokeInvitationAction(...args);
}

export async function resetLinkAction(...args: Parameters<typeof impl.resetLinkAction>) {
  return impl.resetLinkAction(...args);
}

export async function signOutOtherSessionsAction(...args: Parameters<typeof impl.signOutOtherSessionsAction>) {
  return impl.signOutOtherSessionsAction(...args);
}
