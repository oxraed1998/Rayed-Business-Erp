// Full business walk-through through the real UI (Playwright).
// Usage: BASE_URL=... SETUP_TOKEN=... [CHROMIUM_PATH=...] [E2E_OUT=dir] node tests/e2e/flow.mjs
// Runs against an EMPTY database: performs first-time setup, then exercises every module.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.E2E_OUT ?? "e2e-screens";
const EMAIL = process.env.E2E_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "OwnerPass12345";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "ar-SA" });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => { pageErrors.push(e.message); console.log("\n  [pageerror]", e.message, (e.stack || "").split("\n").slice(1, 3).join(" ")); });
if (process.env.DEBUG_NET) {
  const t0 = Date.now();
  const ts = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  page.on("request", (r) => r.method() === "POST" && console.log(`\n  [${ts()}] POST start ${r.url()}`));
  page.on("response", (r) => r.request().method() === "POST" && console.log(`  [${ts()}] POST resp ${r.status()} redirect=${r.headers()["x-action-redirect"] ?? "-"}`));
  page.on("requestfinished", (r) => r.method() === "POST" && console.log(`  [${ts()}] POST done`));
  page.on("requestfailed", (r) => console.log(`  [${ts()}] FAILED ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
}
let n = 0;
const shot = (name) => page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true });

async function step(name, fn) {
  process.stdout.write(`• ${name} ... `);
  try {
    await fn();
    console.log("ok");
  } catch (e) {
    console.log("FAILED");
    await shot(`FAILED-${name.replace(/\s+/g, "_")}`);
    throw e;
  }
}

const go = async (path) => {
  const r = await page.goto(BASE + path);
  if (!r || r.status() >= 400) throw new Error(`HTTP ${r?.status()} at ${path}`);
  if (await page.getByText("حدث خطأ أثناء تحميل الصفحة").count()) throw new Error(`error boundary at ${path}`);
  await page.waitForLoadState("networkidle");
};
const dialog = () => page.locator('[role="dialog"]').last();
const openDialog = async (name) => {
  await page.waitForLoadState("networkidle");
  await page.locator("main").getByRole("button", { name, exact: false }).first().click();
  await dialog().waitFor();
};
async function fill(name, value, scope = dialog()) {
  const el = scope.locator(`:is(input,select,textarea)[name="${name}"]`).first();
  const tag = await el.evaluate((e) => e.tagName);
  if (tag === "SELECT") {
    if (typeof value === "number") {
      const opts = await el.locator("option").evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
      if (!opts[value - 1]) throw new Error(`select ${name} has no option #${value}`);
      await el.selectOption(opts[value - 1]);
    } else await el.selectOption(value);
  } else await el.fill(String(value));
}
// Toasts are owned by React (sonner): never remove them from the DOM, only mark the ones already seen.
const markToasts = () => page.locator("[data-sonner-toast]").evaluateAll((ts) => ts.forEach((t) => t.setAttribute("data-seen", "1")));
async function nextToast() {
  const toast = page.locator("[data-sonner-toast]:not([data-seen])").first();
  await toast.waitFor({ timeout: 20000 });
  const type = await toast.getAttribute("data-type");
  const text = (await toast.innerText()).trim();
  await toast.evaluate((t) => t.setAttribute("data-seen", "1"));
  if (type !== "success") throw new Error(`action failed: ${text}`);
  await page.waitForLoadState("networkidle");
  return text;
}
async function submit(scope = dialog(), buttonName) {
  await page.waitForLoadState("networkidle");
  await markToasts();
  const btn = buttonName ? scope.getByRole("button", { name: buttonName }) : scope.locator('button[type="submit"]').last();
  await btn.click();
  return nextToast();
}
async function confirm(buttonName, confirmName) {
  await page.locator("main").getByRole("button", { name: buttonName }).first().click();
  const d = page.locator('[role="alertdialog"]');
  await d.waitFor();
  await markToasts();
  await d.getByRole("button", { name: confirmName ?? /تأكيد|ترحيل|إقفال|اعتماد|عكس|توزيع/ }).last().click();
  await nextToast();
}
const today = new Date().toISOString().slice(0, 10);

// ───────────── Setup & company ─────────────
await step("first-time setup", async () => {
  await go("/setup");
  await fill("token", process.env.SETUP_TOKEN, page);
  await fill("tenantName", "مؤسسة رائد التجارية", page);
  await fill("name", "ماجد العبدلي", page);
  await fill("email", EMAIL, page);
  await fill("password", PASSWORD, page);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/settings\/companies/, { timeout: 30000 });
});
await step("create company with three activities", async () => {
  const form = page.locator("main form").last();
  await fill("name", "شركة رائد للتجارة", form);
  await form.locator('[name="LIVESTOCK"]').check();
  await form.locator('[name="CLOTHING"]').check();
  await submit(form);
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  await shot("dashboard-empty");
});

// ───────────── Parties ─────────────
await step("create customer", async () => {
  await go("/customers");
  await openDialog(/عميل/);
  await fill("name", "محمد الشمري");
  await fill("phone", "0500000000");
  await submit();
});
await step("create supplier", async () => {
  await go("/suppliers");
  await openDialog(/مورد/);
  await fill("name", "Korea Auto Export");
  await fill("country", "كوريا الجنوبية");
  await submit();
});

// ───────────── Vehicles ─────────────
let vehicleUrl;
await step("add imported vehicle in USD on credit", async () => {
  await go("/vehicles");
  await openDialog("سيارة جديدة");
  await fill("manufacturer", "Hyundai");
  await fill("model", "Sonata");
  await fill("vin", "KMHE341DBNA000001");
  await fill("purchaseCurrency", "USD");
  await fill("purchasePrice", "20000");
  await fill("exchangeRate", "3.75");
  await fill("settlement.accountId", "AP");
  await fill("settlement.supplierId", 1);
  await submit();
  await page.waitForURL(/vehicles\/.+/);
  vehicleUrl = page.url();
});
await step("add vehicle expenses (recoverable + non-recoverable VAT)", async () => {
  await openDialog("مصروف");
  await fill("category", "SHIPPING");
  await fill("amount", "4500");
  await fill("settlement.accountId", 1);
  await submit();
  await openDialog("مصروف");
  await fill("category", "REPAIR");
  await fill("amount", "800");
  await fill("vatAmount", "120");
  await dialog().locator('[name="vatRecoverable"]').uncheck();
  await fill("settlement.accountId", 1);
  await submit();
});
await step("move vehicle to stock", async () => {
  await openDialog("تغيير الحالة");
  await fill("status", "IN_STOCK");
  await submit();
});
await step("sell vehicle with down payment and installments", async () => {
  await openDialog("بيع");
  await fill("customerId", 1);
  await fill("price", "95000");
  await fill("paidAmount", "20000");
  await fill("paidAccountId", 1);
  await dialog().getByText("تقسيط المبلغ المتبقي").click();
  await fill("installmentCount", "6");
  await fill("firstDueDate", "2026-12-01");
  await submit();
  await page.waitForURL(/invoices\/.+/);
  await shot("vehicle-invoice");
});
await step("vehicle detail shows profit", async () => {
  await page.goto(vehicleUrl);
  await page.getByText("صافي الربح").first().waitFor();
  await shot("vehicle-detail");
});

// ───────────── Encar market (live provider) ─────────────
if (!process.env.E2E_SKIP_ENCAR) {
  await step("Encar market: search, open listing, import to inventory", async () => {
    await go("/vehicles/market?manufacturer=Kia");
    const card = page.locator("main a[href^='/vehicles/market/']").first();
    await card.waitFor({ timeout: 30000 });
    await card.click();
    await page.waitForURL(/vehicles\/market\/\d+/);
    await page.waitForLoadState("networkidle");
    await shot("encar-listing");
    await openDialog("استيراد إلى المخزون");
    await fill("exchangeRate", "0.0027");
    await fill("settlement.accountId", 1);
    await submit();
    await page.waitForURL(/\/vehicles\/(?!market)[a-z0-9]+$/, { timeout: 20000 });
    await page.getByText("مستورد من Encar").first().waitFor();
    await page.goBack();
    await page.getByText("موجودة في المخزون").first().waitFor({ timeout: 20000 });
  });
}

// ───────────── Livestock ─────────────
await step("livestock: herd, purchase 100, feed, sell 20, 3 deaths", async () => {
  await go("/livestock");
  await openDialog("قطيع جديد");
  await fill("name", "دفعة نعيمي 1");
  await fill("species", "أغنام");
  await submit();
  if (!/livestock\/.+/.test(page.url())) await page.locator("main a[href^='/livestock/']").first().click();
  await page.waitForURL(/livestock\/.+/);
  await openDialog("شراء");
  await fill("quantity", "100");
  await fill("amount", "80000");
  await fill("settlement.accountId", 1);
  await submit();
  await openDialog("مصروف");
  await fill("category", "FEED");
  await fill("amount", "5000");
  await fill("settlement.accountId", 1);
  await submit();
  await openDialog("بيع");
  await fill("customerId", 1);
  await fill("quantity", "20");
  await fill("unitPrice", "1200");
  await submit();
  if (/invoices\//.test(page.url())) await page.goBack();
  await openDialog("نفوق");
  await fill("quantity", "3");
  await submit();
  await page.getByText("77").first().waitFor();
  await shot("herd");
});

// ───────────── Clothing ─────────────
await step("clothing: product, receive, sell", async () => {
  await go("/clothing");
  await openDialog("منتج جديد");
  await fill("name", "ثوب رجالي");
  await fill("variants.0.sku", "THB-M-WHT");
  await fill("variants.0.size", "M");
  await fill("variants.0.sellingPrice", "150");
  await fill("variants.0.reorderLevel", "5");
  await submit();
  if (!/clothing\/.+/.test(page.url())) await page.locator("main a[href^='/clothing/']").first().click();
  await page.waitForURL(/clothing\/.+/);
  await openDialog("استلام");
  await fill("variantId", 1);
  await fill("warehouseId", 1);
  await fill("quantity", "30");
  await fill("unitCost", "40");
  await fill("settlement.accountId", 1);
  await submit();
  await openDialog("بيع");
  await fill("customerId", 1);
  await fill("warehouseId", 1);
  await fill("lines.0.variantId", 1);
  await fill("lines.0.quantity", "6");
  await fill("lines.0.unitPrice", "150");
  await submit();
  await shot("clothing");
});

// ───────────── Payments, invoices ─────────────
await step("receipt voucher auto-allocates to oldest invoices", async () => {
  await go("/payments");
  await openDialog(/قبض/);
  await fill("customerId", 1);
  await fill("amount", "10000");
  await fill("accountId", 1);
  await submit();
});
await step("manual draft invoice → post", async () => {
  await go("/invoices/new");
  await fill("customerId", 1, page);
  await fill("lines.0.description", "خدمة نقل", page);
  await fill("lines.0.quantity", "1", page);
  await fill("lines.0.unitPrice", "500", page);
  await submit(page.locator("main form").first());
  await page.waitForURL(/invoices\/(?!new).+/, { timeout: 20000 });
  if (await page.locator("main").getByRole("button", { name: /ترحيل/ }).count()) await confirm(/ترحيل/);
  await shot("invoice");
});

// ───────────── Accounting ─────────────
await step("manual journal entry (capital) posted", async () => {
  await go("/accounting/journal/new");
  await fill("description", "إيداع رأس مال", page);
  await fill("lines.0.accountId", 2, page);
  await fill("lines.0.debit", "60000", page);
  const capital = await page.locator('[name="lines.1.accountId"] option').filter({ hasText: "رأس المال" }).first().getAttribute("value");
  await fill("lines.1.accountId", capital, page);
  await fill("lines.1.credit", "60000", page);
  await submit(page.locator("main form").first(), /ترحيل/);
});
await step("financial reports render and balance", async () => {
  for (const r of ["trial", "income", "balance"]) {
    await go(`/accounting/reports?report=${r}`);
    await shot(`report-${r}`);
  }
  await go("/accounting/reports?report=trial");
  const txt = await page.locator("main").innerText();
  if (/غير متوازن/.test(txt)) throw new Error("trial balance not balanced");
});

// ───────────── Partners, contracts, employees ─────────────
await step("partners: two partners, agreement 35k/25k, distribute 12k", async () => {
  await go("/partners");
  for (const name of ["الشريك أ", "الشريك ب"]) {
    await openDialog("شريك جديد");
    await fill("name", name);
    await submit();
  }
  await openDialog("اتفاقية جديدة");
  await fill("name", "شراكة السيارات");
  await fill("scope", "COMPANY");
  await fill("shares.0.partnerId", 1);
  await fill("shares.0.capitalAmount", "35000");
  const addRow = dialog().getByRole("button", { name: /إضافة شريك|شريك/ }).first();
  if (!(await dialog().locator('[name="shares.1.partnerId"]').count())) await addRow.click();
  await fill("shares.1.partnerId", 2);
  await fill("shares.1.capitalAmount", "25000");
  await submit();
  if (!/partners\/.+/.test(page.url())) await page.locator("main a[href^='/partners/']").first().click();
  await page.waitForURL(/partners\/.+/);
  await openDialog("توزيع");
  await fill("amount", "12000");
  await submit();
  await page.getByText("7,000").first().waitFor();
  await shot("partners");
});
await step("contract: create → submit → approve", async () => {
  await go("/contracts");
  await openDialog(/عقد/);
  await fill("type", "SALES");
  await fill("title", "عقد بيع سيارة");
  await fill("parties", "شركة رائد / محمد الشمري");
  await fill("startDate", today);
  await fill("value", "95000");
  await submit();
  if (!/contracts\/.+/.test(page.url())) await page.locator("main a[href^='/contracts/']").first().click();
  await page.waitForURL(/contracts\/.+/);
  await confirm("إرسال للاعتماد", "إرسال");
  await confirm(/^اعتماد$/, "اعتماد");
  await page.getByText(/نشط|ساري/).first().waitFor();
  await shot("contract");
});
await step("employee", async () => {
  await go("/employees");
  await openDialog(/موظف/);
  await fill("name", "خالد المحاسب");
  await fill("jobTitle", "محاسب");
  await submit();
});

// ───────────── Settings, admin, exports ─────────────
await step("invite a member and get one-time link", async () => {
  await go("/settings/users");
  await openDialog("دعوة عضو");
  await fill("email", "accountant@example.com");
  await fill("role", "ACCOUNTANT");
  await dialog().locator('button[type="submit"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value.includes("/invite/")), null, { timeout: 20000 });
  await shot("invite-link");
  await dialog().getByRole("button", { name: "تم" }).click();
});
await step("pages load", async () => {
  for (const p of ["/", "/shipments", "/inventory", "/installments", "/accounting", "/accounting/journal", "/accounting/periods", "/reports", "/settings", "/settings/subscription", "/settings/audit", "/profile", "/admin"]) {
    await go(p);
    await shot(`page${p.replace(/\//g, "_")}`);
  }
});
await step("CSV export", async () => {
  const r = await page.request.get(BASE + "/api/export/trial-balance");
  if (r.status() !== 200) throw new Error(`export HTTP ${r.status()}`);
  const body = await r.text();
  if (!body.startsWith("﻿")) throw new Error("CSV missing BOM");
});
await step("mobile layout", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go("/");
  await shot("mobile-dashboard");
  await page.getByRole("button", { name: "فتح القائمة" }).click();
  await shot("mobile-menu");
});
await step("dark mode", async () => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await go("/");
  await page.getByRole("button", { name: "تبديل الوضع الليلي" }).click();
  await page.waitForTimeout(300);
  await shot("dashboard-dark");
});
await step("logout and anonymous access blocked", async () => {
  await ctx.clearCookies();
  const r = await page.request.get(BASE + "/api/export/trial-balance", { maxRedirects: 0 });
  if (r.status() !== 401) throw new Error(`expected 401, got ${r.status()}`);
  await page.goto(BASE + "/vehicles");
  await page.waitForURL(/login/);
});

await browser.close();
if (pageErrors.length) {
  console.log("Browser page errors:\n" + pageErrors.join("\n"));
  process.exit(1);
}
console.log("FLOW OK");
