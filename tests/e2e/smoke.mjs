// End-to-end smoke test against a running instance.
// Usage: BASE_URL=http://localhost:3000 E2E_EMAIL=... E2E_PASSWORD=... [SETUP_TOKEN=...] node tests/e2e/smoke.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "OwnerPass12345";
const OUT = process.env.E2E_OUT ?? "e2e-screens";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, locale: "ar-SA" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const step = async (name, fn) => {
  process.stdout.write(`• ${name} ... `);
  await fn();
  console.log("ok");
};

await page.goto(BASE + "/login");
if (process.env.SETUP_TOKEN && (await page.getByText("ابدأ الإعداد الأولي").count())) {
  await step("first-time setup", async () => {
    await page.goto(BASE + "/setup");
    await page.fill('input[name="token"]', process.env.SETUP_TOKEN);
    await page.fill('input[name="tenantName"]', "مؤسسة الاختبار");
    await page.fill('input[name="name"]', "مالك المنصة");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/settings\/companies/, { timeout: 20000 });
  });
} else {
  await step("login", async () => {
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  });
}
await page.screenshot({ path: `${OUT}/01-after-login.png`, fullPage: true });

const paths = (process.env.E2E_PATHS ?? "/").split(",");
for (const p of paths) {
  await step(`open ${p}`, async () => {
    const r = await page.goto(BASE + p);
    if (!r || r.status() >= 400) throw new Error(`HTTP ${r?.status()} for ${p}`);
    if (await page.getByText("حدث خطأ أثناء تحميل الصفحة").count()) throw new Error(`error boundary on ${p}`);
    await page.screenshot({ path: `${OUT}/page${p.replace(/\//g, "_") || "_home"}.png`, fullPage: true });
  });
}
await browser.close();
if (errors.length) {
  console.log("Browser errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("SMOKE OK");
