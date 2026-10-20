import type { Prisma } from "@prisma/client";
import { ScrollText } from "lucide-react";
import { db } from "@/lib/db";
import { pageContext } from "@/lib/context";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination, pageParam } from "@/components/data/filter-bar";
import { SettingsNav } from "@/components/settings/settings-nav";

export const metadata = { title: "سجل التدقيق" };
const PAGE = 50;

const fmtTime = (d: Date) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(d);

function compact(data: Prisma.JsonValue | null): string {
  if (data === null || data === undefined) return "";
  const s = JSON.stringify(data);
  return s.length > 160 ? s.slice(0, 157) + "…" : s;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageContext("audit.read");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const [entities, actions] = await Promise.all([
    db.auditLog.findMany({ where: { tenantId: ctx.tenant.id }, distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
    db.auditLog.findMany({ where: { tenantId: ctx.tenant.id }, distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);
  const where: Prisma.AuditLogWhereInput = {
    tenantId: ctx.tenant.id,
    ...(sp.entity ? { entity: sp.entity } : {}),
    ...(sp.action ? { action: sp.action } : {}),
    ...(sp.q ? { OR: [{ entityId: { contains: sp.q } }, { entity: { contains: sp.q, mode: "insensitive" } }] } : {}),
    ...(sp.from || sp.to ? { createdAt: { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lte: new Date(sp.to + "T23:59:59Z") } : {}) } } : {}),
  };
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.auditLog.count({ where }),
  ]);
  const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean))] as string[];
  const users = new Map((await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  return (
    <div>
      <PageHeader title="الإعدادات" description={ctx.tenant.name} icon={ScrollText} />
      <SettingsNav active="/settings/audit" />
      <Card>
        <FilterBar q={sp.q} values={sp} dates placeholder="ابحث بمعرف السجل"
          filters={[
            { name: "entity", label: "الكيان", options: entities.map((e) => ({ value: e.entity, label: e.entity })) },
            { name: "action", label: "الإجراء", options: actions.map((a) => ({ value: a.action, label: a.action })) },
          ]} />
        {logs.length ? (
          <Table>
            <THead><TR><TH>الوقت</TH><TH>المستخدم</TH><TH>الإجراء</TH><TH>الكيان</TH><TH>التفاصيل</TH></TR></THead>
            <TBody>
              {logs.map((l) => (
                <TR key={l.id}>
                  <TD className="text-xs num">{fmtTime(l.createdAt)}</TD>
                  <TD>{l.userId ? users.get(l.userId) ?? "—" : "النظام"}</TD>
                  <TD><Badge variant={l.action.includes("fail") || l.action.includes("delete") || l.action.includes("void") ? "destructive" : "default"}>{l.action}</Badge></TD>
                  <TD className="text-xs">{l.entity}{l.entityId && <span className="block font-mono text-[10px] text-muted-foreground" dir="ltr">{l.entityId}</span>}</TD>
                  <TD className="max-w-md truncate font-mono text-[11px] text-muted-foreground" dir="ltr" title={l.data ? JSON.stringify(l.data) : undefined}>{compact(l.data)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={ScrollText} title="لا توجد سجلات مطابقة" />}
        <Pagination page={page} pageSize={PAGE} total={total} params={sp} />
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">سجل التدقيق للإضافة فقط: قاعدة البيانات تمنع تعديل أي سجل.</p>
    </div>
  );
}
