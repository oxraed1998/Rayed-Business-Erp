import { execSync } from "node:child_process";

/** Integration tests run against a real PostgreSQL schema that is rebuilt from migrations. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://rayed:rayed@localhost:5432/rayed_test?schema=erp";
  const needsDb = process.argv.some((a) => a.includes("integration")) || !process.argv.some((a) => a.includes("tests/unit"));
  if (!needsDb) return;
  const u = new URL(url);
  const schema = u.searchParams.get("schema") ?? "public";
  const { PrismaClient } = await import("@prisma/client");
  const admin = new PrismaClient({ datasourceUrl: url });
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
