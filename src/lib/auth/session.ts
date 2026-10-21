import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { hashToken, newToken } from "./tokens";

export const SESSION_COOKIE = "rayed_sid";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export async function clientIp(): Promise<string> {
  const h = await headers();
  // Railway's edge sets X-Forwarded-For; the left-most entry is the client.
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}

export async function createSession(userId: string, tenantId: string | null) {
  const token = newToken();
  const h = await headers();
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      tenantId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ip: await clientIp(),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** Resolves the current session (cached per request). Expired sessions are removed. */
export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt < new Date() || !session.user.isActive) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // Throttle "last seen" writes to once every 5 minutes.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return session;
});

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function updateSessionScope(sessionId: string, data: { tenantId?: string | null; companyId?: string | null }) {
  await db.session.update({ where: { id: sessionId }, data });
}
