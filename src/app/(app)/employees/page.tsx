import type { EmploymentStatus, Prisma } from "@prisma/client";
import { IdCard } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { ROLE_LABELS } from "@/lib/permissions";
import { fmtDate, isoDate } from "@/lib/utils";
import { EMPLOYMENT_STATUS_LABELS } from "@/server/services/employees";
import { currencyOptions, toOptions } from "@/server/queries/options";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination, pageParam } from "@/components/data/filter-bar";
import { EmployeeDialog } from "@/components/employees/employee-dialog";
import { sum } from "@/lib/money";

export const metadata = { title: "الموظفون" };
const PAGE = 30;
const STATUS_VARIANT = { ACTIVE: "success", ON_LEAVE: "warning", TERMINATED: "muted" } as const;

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("employees.read");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const status = sp.status && sp.status in EMPLOYMENT_STATUS_LABELS ? (sp.status as EmploymentStatus) : undefined;
  const where: Prisma.EmployeeWhereInput = {
    ...scope(ctx), ...(status ? { status } : {}),
    ...(sp.department ? { department: sp.department } : {}),
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { jobTitle: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q } }, { nationalId: { contains: sp.q } }] } : {}),
  };
  const canManage = ctx.permissions.has("employees.manage");
  const showSalary = canManage || ctx.permissions.has("financials.read");
  const [employees, total, all, members] = await Promise.all([
    db.employee.findMany({ where, include: { membership: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { name: "asc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.employee.count({ where }),
    db.employee.findMany({ where: scope(ctx), select: { status: true, department: true, salary: true, salaryCurrency: true } }),
    canManage ? db.membership.findMany({ where: { tenantId: ctx.tenant.id, isActive: true }, include: { user: { select: { name: true, email: true } } } }) : Promise.resolve([]),
  ]);
  const memberOptions = members.map((m) => ({ value: m.id, label: `${m.user.name} · ${m.user.email}` }));
  const departments = [...new Set(all.map((e) => e.department).filter(Boolean) as string[])].sort();
  const cur = ctx.company.baseCurrency;
  const payroll = sum(all.filter((e) => e.status !== "TERMINATED" && e.salaryCurrency === cur && e.salary).map((e) => e.salary!));
  return (
    <div>
      <PageHeader title="الموظفون" description={ctx.company.name} icon={IdCard}
        actions={canManage && <EmployeeDialog members={memberOptions} currencies={currencyOptions} showSalary={showSalary} />} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="على رأس العمل" value={all.filter((e) => e.status === "ACTIVE").length} tone="success" />
        <StatCard label="في إجازة" value={all.filter((e) => e.status === "ON_LEAVE").length} tone="gold" />
        <StatCard label="الأقسام" value={departments.length} />
        {showSalary && <StatCard label={`الرواتب الشهرية (${cur})`} value={<Money value={payroll} currency={cur} />} />}
      </div>
      <Card>
        <FilterBar q={sp.q} values={sp} placeholder="الاسم أو المسمى أو الجوال" filters={[
          { name: "status", label: "الحالة", options: toOptions(EMPLOYMENT_STATUS_LABELS) },
          ...(departments.length ? [{ name: "department", label: "القسم", options: departments.map((d) => ({ value: d, label: d })) }] : []),
        ]} />
        {employees.length ? (
          <Table>
            <THead><TR><TH>الموظف</TH><TH>القسم</TH><TH>المسمى</TH><TH>تاريخ التعيين</TH>{showSalary && <TH>الراتب</TH>}<TH>الحساب والدور</TH><TH>الحالة</TH>{canManage && <TH />}</TR></THead>
            <TBody>
              {employees.map((e) => (
                <TR key={e.id}>
                  <TD><p className="font-semibold">{e.name}</p>{e.phone && <p className="text-xs text-muted-foreground" dir="ltr">{e.phone}</p>}</TD>
                  <TD>{e.department ?? "—"}</TD>
                  <TD>{e.jobTitle ?? "—"}</TD>
                  <TD>{fmtDate(e.hireDate)}</TD>
                  {showSalary && <TD><Money value={e.salary} currency={e.salaryCurrency} /></TD>}
                  <TD className="text-xs">{e.membership ? <><span className="block">{e.membership.user.email}</span><Badge variant="default">{ROLE_LABELS[e.membership.role]}</Badge></> : <span className="text-muted-foreground">بدون حساب</span>}</TD>
                  <TD><Badge variant={STATUS_VARIANT[e.status]}>{EMPLOYMENT_STATUS_LABELS[e.status]}</Badge></TD>
                  {canManage && <TD><EmployeeDialog members={memberOptions} currencies={currencyOptions} showSalary={showSalary}
                    initial={{ id: e.id, name: e.name, phone: e.phone ?? "", email: e.email ?? "", nationalId: e.nationalId ?? "", department: e.department ?? "", jobTitle: e.jobTitle ?? "", hireDate: isoDate(e.hireDate), salary: e.salary?.toFixed(2) ?? "", salaryCurrency: e.salaryCurrency, membershipId: e.membershipId ?? "", status: e.status }} /></TD>}
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={IdCard} title="لا يوجد موظفون" description={sp.q || status ? "لا نتائج مطابقة" : "أضف الموظفين وربطهم بحسابات المستخدمين"} />}
        <Pagination page={page} pageSize={PAGE} total={total} params={sp} />
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">عقود العمل تُدار من شاشة العقود (نوع: عقد عمل). مسيرات الرواتب الشهرية غير متاحة حاليًا؛ سجّل الرواتب المدفوعة كقيد يدوي على حساب الرواتب والأجور.</p>
    </div>
  );
}
