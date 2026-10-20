import Link from "next/link";
import type { ContractStatus, ContractType, Prisma } from "@prisma/client";
import { BellRing, FileSignature } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { fmtDate } from "@/lib/utils";
import { CONTRACT_STATUS_LABELS, CONTRACT_TEMPLATES, CONTRACT_TYPE_LABELS, effectiveStatus, renewalDue } from "@/server/services/contracts";
import { currencyOptions, toOptions } from "@/server/queries/options";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination, pageParam } from "@/components/data/filter-bar";
import { ContractDialog } from "@/components/contracts/contract-form";
import { ContractStatusBadge } from "@/components/contracts/status-badge";

export const metadata = { title: "العقود" };
const PAGE = 25;

export default async function ContractsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("contracts.read");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const type = sp.type && sp.type in CONTRACT_TYPE_LABELS ? (sp.type as ContractType) : undefined;
  const status = sp.status && sp.status in CONTRACT_STATUS_LABELS ? (sp.status as ContractStatus) : undefined;
  const today = new Date();
  const statusWhere: Prisma.ContractWhereInput =
    status === "EXPIRED" ? { OR: [{ status: "EXPIRED" }, { status: "ACTIVE", endDate: { lt: today } }] }
    : status === "ACTIVE" ? { status: "ACTIVE", OR: [{ endDate: null }, { endDate: { gte: today } }] }
    : status ? { status } : {};
  const where: Prisma.ContractWhereInput = {
    ...scope(ctx), ...(type ? { type } : {}), ...statusWhere,
    ...(sp.q ? { AND: [{ OR: [{ number: { contains: sp.q, mode: "insensitive" } }, { title: { contains: sp.q, mode: "insensitive" } }, { parties: { contains: sp.q, mode: "insensitive" } }] }] } : {}),
  };
  const [contracts, total, active] = await Promise.all([
    db.contract.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.contract.count({ where }),
    db.contract.findMany({ where: { ...scope(ctx), status: { in: ["ACTIVE", "PENDING_APPROVAL"] } }, select: { status: true, endDate: true, renewalReminderDays: true } }),
  ]);
  const showValue = ctx.permissions.has("financials.read") || ctx.permissions.has("contracts.manage");
  return (
    <div>
      <PageHeader title="العقود" description="عقود الاستيراد والشراء والبيع والشراكة والاستثمار والتوريد والعمل" icon={FileSignature}
        actions={ctx.permissions.has("contracts.manage") && <ContractDialog types={toOptions(CONTRACT_TYPE_LABELS)} currencies={currencyOptions} templates={CONTRACT_TEMPLATES} />} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="عقود نافذة" value={active.filter((c) => effectiveStatus(c) === "ACTIVE").length} tone="success" />
        <StatCard label="بانتظار الاعتماد" value={active.filter((c) => c.status === "PENDING_APPROVAL").length} tone="gold" />
        <StatCard label="تحتاج تجديدًا قريبًا" value={active.filter((c) => renewalDue(c)).length} icon={BellRing} tone="danger" />
      </div>
      <Card>
        <FilterBar q={sp.q} values={sp} placeholder="رقم العقد أو العنوان أو الأطراف" filters={[{ name: "type", label: "النوع", options: toOptions(CONTRACT_TYPE_LABELS) }, { name: "status", label: "الحالة", options: toOptions(CONTRACT_STATUS_LABELS) }]} />
        {contracts.length ? (
          <Table>
            <THead><TR><TH>الرقم</TH><TH>العنوان</TH><TH>النوع</TH><TH>البداية</TH><TH>النهاية</TH>{showValue && <TH>القيمة</TH>}<TH>الحالة</TH></TR></THead>
            <TBody>
              {contracts.map((c) => (
                <TR key={c.id}>
                  <TD><Link href={`/contracts/${c.id}`} className="font-mono text-xs font-bold hover:text-gold">{c.number}</Link></TD>
                  <TD className="max-w-xs truncate font-semibold"><Link href={`/contracts/${c.id}`} className="hover:text-gold">{c.title}</Link></TD>
                  <TD>{CONTRACT_TYPE_LABELS[c.type]}</TD>
                  <TD>{fmtDate(c.startDate)}</TD>
                  <TD>{fmtDate(c.endDate)}{renewalDue(c) && <Badge variant="warning" className="ms-2"><BellRing className="size-3" /> تجديد</Badge>}</TD>
                  {showValue && <TD><Money value={c.value} currency={c.currency} /></TD>}
                  <TD><ContractStatusBadge status={effectiveStatus(c)} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={FileSignature} title="لا توجد عقود" description={sp.q || type || status ? "لا نتائج مطابقة" : "أنشئ أول عقد من قالب جاهز"} />}
        <Pagination page={page} pageSize={PAGE} total={total} params={sp} />
      </Card>
    </div>
  );
}
