import { db } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import type { Permission } from "@/lib/permissions";
import { accountBalances, incomeStatement, trialBalance } from "@/lib/accounting/reports";
import { ACCOUNT_TYPE_LABELS } from "@/lib/accounting/chart";
import { vehicleCost, VEHICLE_STATUS_LABELS } from "@/lib/domain/vehicle-cost";
import { herdSummary } from "@/lib/domain/livestock";
import { partnerBalance } from "@/lib/domain/partners";
import { D, Decimal } from "@/lib/money";

export const dynamic = "force-dynamic";

type Cell = string | number | Decimal | Date | null | undefined;
type Table = { headers: string[]; rows: Cell[][] };

const cell = (v: Cell) => {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : v instanceof Decimal ? v.toFixed(2) : String(v);
  // Quote, and neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

const toCsv = (t: Table) => "﻿" + [t.headers, ...t.rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

const REPORTS: Record<string, { permission: Permission; title: string }> = {
  "trial-balance": { permission: "accounting.read", title: "ميزان المراجعة" },
  "income-statement": { permission: "accounting.read", title: "قائمة الدخل" },
  vehicles: { permission: "financials.read", title: "ربحية السيارات" },
  livestock: { permission: "livestock.read", title: "تكلفة المواشي" },
  inventory: { permission: "inventory.read", title: "المخزون" },
  sales: { permission: "invoices.read", title: "المبيعات" },
  purchases: { permission: "invoices.read", title: "المشتريات" },
  "customers-balances": { permission: "customers.read", title: "أرصدة العملاء" },
  "suppliers-balances": { permission: "suppliers.read", title: "أرصدة الموردين" },
  partners: { permission: "partners.read", title: "أرصدة الشركاء" },
  employees: { permission: "employees.read", title: "الموظفون" },
};

function dateParam(v: string | null) {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(v + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  const def = REPORTS[report];
  if (!def) return Response.json({ error: "Unknown report" }, { status: 404 });
  const ctx = await getTenantContext();
  if (!ctx) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!ctx.permissions.has(def.permission)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!ctx.company) return Response.json({ error: "No company selected" }, { status: 400 });

  const url = new URL(req.url);
  const from = dateParam(url.searchParams.get("from"));
  const to = dateParam(url.searchParams.get("to"));
  const base = { tenantId: ctx.tenant.id, companyId: ctx.company.id };
  const dateRange = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
  let t: Table;

  switch (report) {
    case "trial-balance": {
      const tb = trialBalance(await accountBalances({ ...base, from, to }));
      t = { headers: ["الرمز", "الحساب", "النوع", "مجموع المدين", "مجموع الدائن", "رصيد مدين", "رصيد دائن"], rows: tb.lines.map((l) => [l.account.code, l.account.name, ACCOUNT_TYPE_LABELS[l.account.type], l.debit, l.credit, l.debitBalance, l.creditBalance]) };
      t.rows.push(["", "الإجمالي", "", "", "", tb.totalDebit, tb.totalCredit]);
      break;
    }
    case "income-statement": {
      // Exclude period-closing entries so closed periods still show their results.
      const rows = await accountBalances({ ...base, from, to });
      const closing = await db.journalLine.groupBy({ by: ["accountId"], where: { tenantId: ctx.tenant.id, entry: { companyId: ctx.company.id, sourceType: "PERIOD_CLOSE", ...(dateRange ? { date: dateRange } : {}) } }, _sum: { debit: true, credit: true } });
      const cm = new Map(closing.map((c) => [c.accountId, c._sum]));
      const adj = rows.map((r) => {
        const c = cm.get(r.account.id);
        if (!c) return r;
        const debit = r.debit.minus(D(c.debit ?? 0)), credit = r.credit.minus(D(c.credit ?? 0));
        return { ...r, debit, credit, balance: r.account.type === "EXPENSE" ? debit.minus(credit) : credit.minus(debit) };
      });
      const is = incomeStatement(adj);
      t = { headers: ["البند", "الحساب", "المبلغ"], rows: [
        ...is.revenue.map((r) => ["الإيرادات", r.account.name, r.balance] as Cell[]),
        ["إجمالي الإيرادات", "", is.totalRevenue],
        ...is.cogs.map((r) => ["تكلفة المبيعات", r.account.name, r.balance] as Cell[]),
        ["مجمل الربح", "", is.grossProfit],
        ...is.opex.map((r) => ["المصروفات التشغيلية", r.account.name, r.balance] as Cell[]),
        ["صافي الربح", "", is.netProfit],
      ] };
      break;
    }
    case "vehicles": {
      const vs = await db.vehicle.findMany({ where: { ...base, ...(dateRange ? { purchaseDate: dateRange } : {}) }, include: { expenses: true, customer: true, supplier: true }, orderBy: { createdAt: "asc" } });
      t = { headers: ["الشركة المصنعة", "الطراز", "السنة", "VIN", "الحالة", "تاريخ الشراء", "عملة الشراء", "سعر الشراء", "سعر الصرف", "الشراء بالعملة الأساسية", "المصروفات", "التكلفة الكاملة", "سعر البيع", "الربح", "المورد", "العميل"], rows: vs.map((v) => {
        const c = vehicleCost(v);
        return [v.manufacturer, v.model, v.year, v.vin, VEHICLE_STATUS_LABELS[v.status], v.purchaseDate, v.purchaseCurrency, D(v.purchasePrice), D(v.exchangeRate).toString(), c.purchaseBase, c.expensesTotal, c.landedCost, v.sellingPrice ? D(v.sellingPrice) : null, c.profit, v.supplier?.name, v.customer?.name];
      }) };
      break;
    }
    case "livestock": {
      const hs = await db.livestockHerd.findMany({ where: base, include: { events: true, expenses: true }, orderBy: { createdAt: "asc" } });
      const fin = ctx.permissions.has("financials.read");
      t = { headers: ["القطيع", "النوع", "السلالة", "المشترى", "المواليد", "المباع", "النافق", "المتبقي", ...(fin ? ["تكلفة الشراء", "تكاليف الرعاية", "قيمة القطيع", "تكلفة الرأس", "إيراد المبيعات", "تكلفة المباع", "الربح المحقق"] : [])], rows: hs.map((h) => {
        const s = herdSummary(h.events, h.expenses);
        return [h.name, h.species, h.breed, s.purchased, s.born, s.sold, s.deceased, s.remaining, ...(fin ? [s.acquisitionCost, s.careCost, s.valuation, s.costPerHead, s.saleRevenue, s.soldCost, s.realizedProfit] : [])];
      }) };
      break;
    }
    case "inventory": {
      const vs = await db.productVariant.findMany({ where: { tenantId: ctx.tenant.id, product: { companyId: ctx.company.id } }, include: { product: true }, orderBy: { sku: "asc" } });
      const fin = ctx.permissions.has("financials.read");
      t = { headers: ["SKU", "الباركود", "المنتج", "الفئة", "العلامة", "المقاس", "اللون", "الكمية", "حد إعادة الطلب", "سعر البيع", ...(fin ? ["متوسط التكلفة", "قيمة المخزون"] : [])], rows: vs.map((v) => {
        const q = D(v.quantityOnHand);
        return [v.sku, v.barcode, v.product.name, v.product.category, v.product.brand, v.size, v.color, q.toString(), v.reorderLevel, D(v.sellingPrice), ...(fin ? [q.isZero() ? D(0) : D(v.stockValue).div(q).toDecimalPlaces(2), D(v.stockValue)] : [])];
      }) };
      break;
    }
    case "sales":
    case "purchases": {
      const types = report === "sales" ? (["SALES", "CREDIT_NOTE", "DEBIT_NOTE", "ADVANCE"] as const) : (["PURCHASE"] as const);
      const inv = await db.invoice.findMany({ where: { ...base, status: "POSTED", type: { in: [...types] }, ...(dateRange ? { issueDate: dateRange } : {}) }, include: { customer: true, supplier: true }, orderBy: { issueDate: "asc" } });
      t = { headers: ["الرقم", "النوع", "التاريخ", "الاستحقاق", "الطرف", "العملة", "المجموع", "الخصم", "الضريبة", "الإجمالي", "المدفوع", "المتبقي"], rows: inv.map((i) => [i.number, i.type, i.issueDate, i.dueDate, i.customer?.name ?? i.supplier?.name, i.currency, D(i.subtotal), D(i.discountTotal), D(i.vatTotal), D(i.total), D(i.amountPaid), D(i.total).minus(i.amountPaid)]) };
      break;
    }
    case "customers-balances":
    case "suppliers-balances": {
      const isCust = report === "customers-balances";
      const parties = isCust ? await db.customer.findMany({ where: base, orderBy: { name: "asc" } }) : await db.supplier.findMany({ where: base, orderBy: { name: "asc" } });
      const g = await db.journalLine.groupBy({
        by: [isCust ? "customerId" : "supplierId"],
        where: { tenantId: ctx.tenant.id, [isCust ? "customerId" : "supplierId"]: { not: null }, entry: { companyId: ctx.company.id, status: { in: ["POSTED", "REVERSED"] }, ...(to ? { date: { lte: to } } : {}) } },
        _sum: { debit: true, credit: true },
      });
      const m = new Map(g.map((x) => [(isCust ? x.customerId : x.supplierId) as string, x._sum]));
      t = { headers: ["الاسم", "الهاتف", "البريد", "الرقم الضريبي", "مدين", "دائن", "الرصيد"], rows: parties.map((p) => {
        const s = m.get(p.id), dr = D(s?.debit ?? 0), cr = D(s?.credit ?? 0);
        return [p.name, p.phone, p.email, p.taxNumber, dr, cr, isCust ? dr.minus(cr) : cr.minus(dr)];
      }) };
      break;
    }
    case "partners": {
      const txns = await db.partnerTransaction.findMany({ where: { tenantId: ctx.tenant.id, agreement: { companyId: ctx.company.id }, ...(dateRange ? { date: dateRange } : {}) }, include: { partner: true, agreement: true } });
      const groups = new Map<string, { partner: string; agreement: string; t: typeof txns }>();
      for (const x of txns) {
        const k = `${x.agreementId}|${x.partnerId}`;
        const g = groups.get(k) ?? { partner: x.partner.name, agreement: x.agreement.name, t: [] };
        g.t.push(x);
        groups.set(k, g);
      }
      t = { headers: ["الشريك", "الاتفاقية", "المساهمات", "الأرباح الموزعة", "المسحوبات", "الخسائر", "الصافي"], rows: [...groups.values()].map((g) => {
        const b = partnerBalance(g.t);
        return [g.partner, g.agreement, b.capital, b.distributed, b.withdrawn, b.losses, b.net];
      }) };
      break;
    }
    case "employees": {
      const showSalary = ctx.permissions.has("employees.manage");
      const es = await db.employee.findMany({ where: base, orderBy: { name: "asc" } });
      t = { headers: ["الاسم", "الهاتف", "البريد", "القسم", "المسمى", "تاريخ التعيين", "الحالة", ...(showSalary ? ["الراتب", "العملة"] : [])], rows: es.map((e) => [e.name, e.phone, e.email, e.department, e.jobTitle, e.hireDate, e.status, ...(showSalary ? [e.salary ? D(e.salary) : null, e.salaryCurrency] : [])]) };
      break;
    }
    default:
      return Response.json({ error: "Unknown report" }, { status: 404 });
  }

  await db.auditLog.create({ data: { tenantId: ctx.tenant.id, companyId: ctx.company.id, userId: ctx.user.id, action: "export", entity: "Report", entityId: report, data: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, rows: t.rows.length } } });
  const filename = `${report}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(toCsv(t), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(`${def.title}-${new Date().toISOString().slice(0, 10)}.csv`)}`,
      "cache-control": "no-store",
    },
  });
}
