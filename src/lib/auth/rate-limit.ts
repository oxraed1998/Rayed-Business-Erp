import { db } from "@/lib/db";

/**
 * Fixed-window rate limiter stored in PostgreSQL so it holds across restarts and replicas.
 * Returns true when the action is allowed.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING "count"`;
  return rows[0].count <= limit;
}

export const clearRateLimit = (key: string) => db.rateLimit.deleteMany({ where: { key } });
