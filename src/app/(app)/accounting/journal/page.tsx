import Link from "next/link";
import type { JournalStatus, Prisma } from "@prisma/client";
import { BookOpen, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { sum } from "@/lib/money";
import { fmtDate } from "@/lib/utils";
import { toOptions } from "@/server/queries/options";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination, pageParam } from "@/components/data/filter-bar";
import { AccountingNav } from "@/components/accounting/accounting-nav";
import { JOURNAL_STATUS_LABELS, SOURCE_LABELS } from "@/components/accounting/labels";

export const metadata = { title: "القيود اليومية" };
const PAGE = 30;
const STATUS_VARIANT = { DRAFT: "warning", POSTED: "success", REVERSED: "muted" } as const;

export default async function JournalPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("accounting.read");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const status = sp.status && sp.status in JOURNAL_STATUS_LABELS ? (sp.status as JournalStatus) : undefined;
  const source = sp.source && sp.source in SOURCE_LABELS ? sp.source : undefined;
  const from = sp.from ? new Date(sp.from) : undefined;
  const to = sp.to ? new Date(sp.to) : undefined;
  const where: Prisma.JournalEntryWhereInput = {
    ...scope(ctx),
    ...(status ? { status } : {}),
    ...(source ? { sourceType: source } : {}),
    ...(from && !Number.isNaN(from.getTime()) ? { date: { gte: from, ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}) } } : to && !Number.isNaN(to.getTime()) ? { date: { lte: to } } : {}),
    ...(sp.q ? { OR: [{ number: { contains: sp.q, mode: "insensitive" } }, { description: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [entries, total] = await Promise.all([
    db.journalEntry.findMany({ where, include: { lines: { select: { debit: true } } }, orderBy: [{ date: "desc" }, { number: "desc" }], skip: (page - 1) * PAGE, take: PAGE }),
    db.journalEntry.count({ where }),
  ]);
  const cur = ctx.company.baseCurrency;
  return (
    <div>
      <PageHeader title="القيود اليومية" description="كل العمليات المالية تُسجّل هنا آليًا أو يدويًا" icon={BookOpen}
        actions={ctx.permissions.has("accounting.create") && <Button asChild><Link href="/accounting/journal/new"><Plus /> قيد يدوي</Link></Button>} />
      <AccountingNav active="/accounting/journal" />
      <Card>
        <FilterBar q={sp.q} values={sp} dates placeholder="رقم القيد أو البيان" filters={[{ name: "status", label: "الحالة", options: toOptions(JOURNAL_STATUS_LABELS) }, { name: "source", label: "المصدر", options: toOptions(SOURCE_LABELS) }]} />
        {entries.length ? (
          <Table>
            <THead><TR><TH>الرقم</TH><TH>التاريخ</TH><TH>البيان</TH><TH>المصدر</TH><TH>المبلغ</TH><TH>الحالة</TH></TR></THead>
            <TBody>
              {entries.map((e) => (
                <TR key={e.id}>
                  <TD><Link href={`/accounting/journal/${e.id}`} className="font-mono text-xs font-bold hover:text-gold">{e.number}</Link></TD>
                  <TD>{fmtDate(e.date)}</TD>
                  <TD className="max-w-md truncate">{e.description}</TD>
                  <TD className="text-xs text-muted-foreground">{SOURCE_LABELS[e.sourceType ?? "MANUAL"] ?? e.sourceType}</TD>
                  <TD><Money value={sum(e.lines.map((l) => l.debit))} currency={cur} /></TD>
                  <TD><Badge variant={STATUS_VARIANT[e.status]}>{JOURNAL_STATUS_LABELS[e.status]}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={BookOpen} title="لا توجد قيود" description="ستظهر القيود عند تسجيل العمليات أو إضافة قيد يدوي" />}
        <Pagination page={page} pageSize={PAGE} total={total} params={sp} />
      </Card>
    </div>
  );
}
