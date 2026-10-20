import Link from "next/link";
import type { InvoiceStatus, InvoiceType, Prisma } from "@prisma/client";
import { FileText, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { INVOICE_TYPE_LABELS, PAYMENT_STATUS_LABELS, paymentStatus } from "@/lib/domain/invoice-calc";
import { D, sum } from "@/lib/money";
import { toOptions } from "@/server/queries/options";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination, pageParam } from "@/components/data/filter-bar";
import { InvoiceStatusBadges } from "@/components/invoices/status-badges";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "الفواتير" };
const PAGE = 30;
const STATUS_LABELS: Record<InvoiceStatus, string> = { DRAFT: "مسودة", POSTED: "مرحّلة", VOID: "ملغاة" };
const parse = (v?: string) => (v && !Number.isNaN(new Date(v).getTime()) ? new Date(v) : undefined);

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("invoices.read");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const type = sp.type && sp.type in INVOICE_TYPE_LABELS ? (sp.type as InvoiceType) : undefined;
  const status = sp.status && sp.status in STATUS_LABELS ? (sp.status as InvoiceStatus) : undefined;
  const pay = sp.pay && sp.pay in PAYMENT_STATUS_LABELS ? (sp.pay as keyof typeof PAYMENT_STATUS_LABELS) : undefined;
  const from = parse(sp.from), to = parse(sp.to);
  const where: Prisma.InvoiceWhereInput = {
    ...scope(ctx),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(from || to ? { issueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(sp.q ? { OR: [{ number: { contains: sp.q, mode: "insensitive" } }, { customer: { name: { contains: sp.q, mode: "insensitive" } } }, { supplier: { name: { contains: sp.q, mode: "insensitive" } } }] } : {}),
  };
  const today = new Date();
  // Payment status depends on today's date, so it is filtered in memory on the matching set.
  const all = pay
    ? (await db.invoice.findMany({ where: { ...where, status: "POSTED" }, include: { customer: true, supplier: true }, orderBy: [{ issueDate: "desc" }, { number: "desc" }], take: 5000 })).filter((i) => paymentStatus(i.total, i.amountPaid, i.dueDate, today) === pay)
    : null;
  const [rows, total] = all
    ? [all.slice((page - 1) * PAGE, page * PAGE), all.length]
    : await Promise.all([
        db.invoice.findMany({ where, include: { customer: true, supplier: true }, orderBy: [{ issueDate: "desc" }, { number: "desc" }], skip: (page - 1) * PAGE, take: PAGE }),
        db.invoice.count({ where }),
      ]);
  const openSales = await db.invoice.findMany({ where: { ...scope(ctx), status: "POSTED", type: { in: ["SALES", "DEBIT_NOTE", "ADVANCE"] } }, select: { total: true, amountPaid: true, dueDate: true } });
  const openPurch = await db.invoice.findMany({ where: { ...scope(ctx), status: "POSTED", type: "PURCHASE" }, select: { total: true, amountPaid: true } });
  const cur = ctx.company.baseCurrency;
  return (
    <div>
      <PageHeader title="الفواتير" description="مبيعات، مشتريات، إشعارات دائنة ومدينة، ودفعات مقدمة" icon={FileText}
        actions={ctx.permissions.has("invoices.create") && <Button asChild><Link href="/invoices/new"><Plus /> فاتورة جديدة</Link></Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="مستحق من العملاء" value={<Money value={sum(openSales.map((i) => D(i.total).minus(i.amountPaid)))} currency={cur} />} tone="gold" />
        <StatCard label="فواتير مبيعات متأخرة" value={openSales.filter((i) => paymentStatus(i.total, i.amountPaid, i.dueDate, today) === "OVERDUE").length} tone="danger" />
        <StatCard label="مستحق للموردين" value={<Money value={sum(openPurch.map((i) => D(i.total).minus(i.amountPaid)))} currency={cur} />} />
        <StatCard label="مسودات" value={await db.invoice.count({ where: { ...scope(ctx), status: "DRAFT" } })} />
      </div>
      <Card>
        <FilterBar q={sp.q} values={sp} dates placeholder="رقم الفاتورة أو اسم العميل/المورد" filters={[
          { name: "type", label: "النوع", options: toOptions(INVOICE_TYPE_LABELS) },
          { name: "status", label: "الحالة", options: toOptions(STATUS_LABELS) },
          { name: "pay", label: "السداد", options: toOptions(PAYMENT_STATUS_LABELS) },
        ]} />
        {rows.length ? (
          <Table>
            <THead><TR><TH>الرقم</TH><TH>النوع</TH><TH>الطرف</TH><TH>التاريخ</TH><TH>الاستحقاق</TH><TH>الإجمالي</TH><TH>المدفوع</TH><TH>الحالة</TH></TR></THead>
            <TBody>
              {rows.map((i) => (
                <TR key={i.id}>
                  <TD><Link href={`/invoices/${i.id}`} className="font-mono text-xs font-bold hover:text-gold">{i.number}</Link></TD>
                  <TD className="text-xs">{INVOICE_TYPE_LABELS[i.type]}</TD>
                  <TD>{i.customer?.name ?? i.supplier?.name ?? "—"}</TD>
                  <TD>{fmtDate(i.issueDate)}</TD>
                  <TD>{fmtDate(i.dueDate)}</TD>
                  <TD><Money value={i.total} currency={i.currency} /></TD>
                  <TD><Money value={i.amountPaid} currency={i.currency} /></TD>
                  <TD><InvoiceStatusBadges status={i.status} payment={i.status === "POSTED" ? paymentStatus(i.total, i.amountPaid, i.dueDate, today) : null} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={FileText} title="لا توجد فواتير" description={sp.q || type || status || pay ? "لا نتائج مطابقة للتصفية" : "أنشئ أول فاتورة، أو بِع سيارة/مواشي/ملابس لإصدار الفاتورة تلقائيًا"} />}
        <Pagination page={page} pageSize={PAGE} total={total} params={sp} />
      </Card>
    </div>
  );
}
