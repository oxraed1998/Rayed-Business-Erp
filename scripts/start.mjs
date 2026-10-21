// Production entrypoint: applies migrations, then starts Next.js.
//
// The ERP lives in its own PostgreSQL schema ("erp" by default) so it never touches the
// legacy prototype tables that already exist in the "public" schema of the same database.
import { spawnSync, spawn } from "node:child_process";

function withSchema(url, schema) {
  if (!url) return url;
  const u = new URL(url);
  if (!u.searchParams.has("schema")) u.searchParams.set("schema", schema);
  return u.toString();
}

const env = { ...process.env, DATABASE_URL: withSchema(process.env.DATABASE_URL, process.env.DB_SCHEMA || "erp") };
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const migrate = spawnSync("node_modules/.bin/prisma", ["migrate", "deploy"], { env, stdio: "inherit" });
if (migrate.status !== 0) {
  console.error("Database migration failed; refusing to start.");
  process.exit(migrate.status ?? 1);
}

const port = process.env.PORT || "3000";
const app = spawn("node_modules/.bin/next", ["start", "-H", "0.0.0.0", "-p", port], { env, stdio: "inherit" });
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => app.kill(sig));
app.on("exit", (code) => process.exit(code ?? 0));
