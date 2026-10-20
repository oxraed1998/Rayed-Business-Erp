"use server";
// Server Action entry points. Implementations live in src/server/actions-impl
// (Next.js only allows async functions in "use server" modules).
import * as impl from "@/server/actions-impl/session";

export async function loginAction(...args: Parameters<typeof impl.loginAction>) {
  return impl.loginAction(...args);
}

export async function logoutAction(...args: Parameters<typeof impl.logoutAction>) {
  return impl.logoutAction(...args);
}

export async function switchCompanyAction(...args: Parameters<typeof impl.switchCompanyAction>) {
  return impl.switchCompanyAction(...args);
}

export async function setupAction(...args: Parameters<typeof impl.setupAction>) {
  return impl.setupAction(...args);
}

export async function acceptInviteAction(...args: Parameters<typeof impl.acceptInviteAction>) {
  return impl.acceptInviteAction(...args);
}

export async function resetPasswordAction(...args: Parameters<typeof impl.resetPasswordAction>) {
  return impl.resetPasswordAction(...args);
}

export async function updateProfileAction(...args: Parameters<typeof impl.updateProfileAction>) {
  return impl.updateProfileAction(...args);
}
