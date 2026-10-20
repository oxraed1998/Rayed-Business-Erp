import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext } from "@/lib/context";
import { installmentStatus } from "@/lib/domain/installments";
import { D, sum } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, StatCard, Unavailable } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination, pageParam } from "@/components/data/filter-bar";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "الأقساط" };
const PAGE = 50;
const STATUS = { overdue: "OVERDUE", due: "DUE", partial: "PARTIAL", paid: "PAID" } as const;
const LABELS = { OVERDUE: ["متأخر", "destructive"], DUE: ["مستحق", "muted"], PARTIAL: ["مدفوع جزئيًا", "warning"], PAID: ["مدفوع", "success"] } as const;

export default async function InstallmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("invoices.read");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const wanted = sp.status && sp.status in STATUS ? STATUS[sp.status as keyof typeof STATUS] : undefined;
  const all = await db.installment.findMany({
    where: {
      tenantId: ctx.tenant.id,
      plan: {
        companyId: ctx.company.id,
        invoice: { status: "POSTED" },
        ...(sp.q ? { OR: [{ customer: { name: { contains: sp.q, mode: "insensitive" } } }, { invoice: { number: { contains: sp.q, mode: "insensitive" } } }] } : {}),
      },
    },
    include: { plan: { include: { invoice: true, customer: true } } },
    orderBy: [{ dueDate: "asc" }, { seq: "asc" }],
  });
  const today = new Date();
  const withStatus = all.map((i) => ({ ...i, status: installmentStatus(i, today), remaining: D(i.amount).minus(i.paidAmount) }));
  const rows = wanted ? withStatus.filter((i) => i.status === wanted) : withStatus;
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
  const cur = ctx.company.baseCurrency;
  const open = withStatus.filter((i) => i.status !== "PAID");
  const overdue = withStatus.filter((i) => i.status === "OVERDUE");
  const in30 = open.filter((i) => i.status !== "OVERDUE" && i.dueDate.getTime() - today.getTime() <= 30 * 86400000);

  return (
    <div className="space-y-4">
      <PageHeader title="الأقساط" description="جداول أقساط فواتير المبيعات الآجلة ومتابعة المتأخرات" icon={CalendarClock} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="إجمالي المتبقي" value={<Money value={sum(open.map((i) => i.remaining))} currency={cur} />} tone="gold" />
        <StatCard label="متأخرات" value={<Money value={sum(overdue.map((i) => i.remaining))} currency={cur} />} tone="danger" hint={`${overdue.length} قسط`} />
        <StatCard label="مستحق خلال 30 يومًا" value={<Money value={sum(in30.map((i) => i.remaining))} currency={cur} />} hint={`${in30.length} قسط`} />
        <StatCard label="أقساط مسددة" value={withStatus.filter((i) => i.status === "PAID").length} tone="success" />
      </div>
      <Card>
        <FilterBar q={sp.q} values={sp} placeholder="اسم العميل أو رقم الفاتورة" filters={[{ name: "status", label: "الحالة", options: [
          { value: "overdue", label: "متأخر" }, { value: "due", label: "مستحق" }, { value: "partial", label: "مدفوع جزئيًا" }, { value: "paid", label: "مدفوع" },
        ] }]} />
        {pageRows.length ? (
          <Table>
            <THead><TR><TH>العميل</TH><TH>الفاتورة</TH><TH>القسط</TH><TH>تاريخ الاستحقاق</TH><TH>المبلغ</TH><TH>المدفوع</TH><TH>المتبقي</TH><TH>الحالة</TH></TR></THead>
            <TBody>
              {pageRows.map((i) => {
                const [label, variant] = LABELS[i.status];
                const days = Math.floor((today.getTime() - i.dueDate.getTime()) / 86400000);
                return (
                  <TR key={i.id}>
                    <TD>{i.plan.customer ? <Link href={`/customers/${i.plan.customer.id}`} className="font-semibold hover:text-gold">{i.plan.customer.name}</Link> : "—"}{i.plan.customer?.phone && <span dir="ltr" className="block text-right text-xs text-muted-foreground">{i.plan.customer.phone}</span>}</TD>
                    <TD><Link href={`/invoices/${i.plan.invoiceId}`} className="font-mono text-xs hover:text-gold">{i.plan.invoice.number}</Link></TD>
                    <TD>{i.seq === 0 ? "دفعة مقدمة" : `${i.seq} / ${i.plan.count}`}</TD>
                    <TD>{fmtDate(i.dueDate)}{i.status === "OVERDUE" && <span className="block text-xs text-destructive">متأخر {days} يوم</span>}</TD>
                    <TD><Money value={i.amount} currency={cur} /></TD>
                    <TD><Money value={i.paidAmount} currency={cur} /></TD>
                    <TD><Money value={i.remaining} currency={cur} className="font-bold" /></TD>
                    <TD><Badge variant={variant}>{label}</Badge></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : <EmptyState icon={CalendarClock} title="لا توجد أقساط" description={wanted || sp.q ? "لا نتائج مطابقة للتصفية" : "أنشئ خطة تقسيط من صفحة فاتورة مبيعات مرحّلة أو عند بيع سيارة"} />}
        <Pagination page={page} pageSize={PAGE} total={rows.length} params={sp} />
      </Card>
      <p className="text-xs text-muted-foreground">لتحصيل قسط: سجّل سند قبض من صفحة الفاتورة أو العميل؛ تُخصص الدفعة تلقائيًا على أقدم قسط مستحق.</p>
      <Unavailable feature="إرسال التذكيرات">إرسال التذكيرات غير متاح (لم يتم ربط مزود رسائل).</Unavailable>
    </div>
  );
}
