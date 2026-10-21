import { Users } from "lucide-react";
import { db } from "@/lib/db";
import { pageContext } from "@/lib/context";
import { canAssignRole, ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/permissions";
import { planLimits } from "@/server/services/tenancy";
import { inviteMemberAction, resetLinkAction, revokeInvitationAction, toggleMemberAction } from "@/server/actions/users";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { SelectField, TextField } from "@/components/forms/fields";
import { SettingsNav } from "@/components/settings/settings-nav";
import { OneTimeLinkDialog } from "@/components/settings/one-time-link";
import { EditMemberDialog } from "@/components/settings/member-dialog";
import { permissionGroups } from "@/components/settings/permission-labels";
import { fmtDate } from "@/lib/utils";
import type { Role } from "@prisma/client";

export const metadata = { title: "المستخدمون والصلاحيات" };

export default async function UsersPage() {
  const ctx = await pageContext("users.manage");
  const [members, invitations, companies, { plan }] = await Promise.all([
    db.membership.findMany({ where: { tenantId: ctx.tenant.id }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    db.invitation.findMany({ where: { tenantId: ctx.tenant.id, acceptedAt: null }, orderBy: { createdAt: "desc" } }),
    db.company.findMany({ where: { tenantId: ctx.tenant.id }, orderBy: { createdAt: "asc" } }),
    planLimits(db, ctx.tenant.id),
  ]);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const assignable = (Object.keys(ROLE_LABELS) as Role[]).filter((r) => canAssignRole(ctx.role, r)).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  const companyOpts = companies.map((c) => ({ value: c.id, label: c.name }));
  const groups = permissionGroups();
  const now = new Date();
  const pending = invitations.filter((i) => i.expiresAt > now);
  const manageable = (role: Role, userId: string) => userId !== ctx.user.id && (ctx.role === "TENANT_OWNER" || canAssignRole(ctx.role, role));

  return (
    <div>
      <PageHeader title="الإعدادات" description={ctx.tenant.name} icon={Users}
        actions={
          <OneTimeLinkDialog title="دعوة عضو جديد" description="يُنشأ رابط دعوة صالح 7 أيام. إرسال البريد الإلكتروني غير متاح حاليًا، لذا انسخ الرابط وأرسله بنفسك." trigger="دعوة عضو" action={inviteMemberAction} submitLabel="إنشاء الدعوة">
            <TextField name="email" label="البريد الإلكتروني" type="email" dir="ltr" required />
            <SelectField name="role" label="الدور" options={assignable} defaultValue="EMPLOYEE" required />
            {companyOpts.length > 1 && (
              <div className="rounded-xl border p-3">
                <p className="mb-2 text-xs font-bold">الشركات (بدون تحديد = الكل)</p>
                {companyOpts.map((c) => <label key={c.value} className="flex items-center gap-2 text-sm"><input type="checkbox" name="companyIds" value={c.value} className="accent-[hsl(var(--gold))]" />{c.label}</label>)}
              </div>
            )}
          </OneTimeLinkDialog>
        } />
      <SettingsNav active="/settings/users" />

      <Card className="mb-6">
        <CardHeader><CardTitle>الأعضاء</CardTitle><CardDescription>{members.filter((m) => m.isActive).length} عضو نشط + {pending.length} دعوة معلقة من {plan.maxUsers} مسموح في باقة {plan.nameAr}</CardDescription></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>الاسم</TH><TH>البريد</TH><TH>الدور</TH><TH>الشركات</TH><TH>تخصيص</TH><TH>الحالة</TH><TH>آخر دخول</TH><TH /></TR></THead>
            <TBody>
              {members.map((m) => (
                <TR key={m.id}>
                  <TD className="font-semibold">{m.user.name}{m.userId === ctx.user.id && <Badge variant="gold" className="ms-2">أنت</Badge>}</TD>
                  <TD dir="ltr" className="text-right text-xs">{m.user.email}</TD>
                  <TD><Badge>{ROLE_LABELS[m.role]}</Badge></TD>
                  <TD className="text-xs">{m.companyIds.length ? m.companyIds.map((id) => companyName.get(id) ?? "؟").join("، ") : "كل الشركات"}</TD>
                  <TD className="text-xs">{m.grants.length || m.denials.length ? `+${m.grants.length} / −${m.denials.length}` : "—"}</TD>
                  <TD><Badge variant={m.isActive ? "success" : "muted"}>{m.isActive ? "نشط" : "موقوف"}</Badge></TD>
                  <TD className="text-xs">{m.user.lastLoginAt ? fmtDate(m.user.lastLoginAt) : "—"}</TD>
                  <TD>
                    {manageable(m.role, m.userId) && (
                      <div className="flex gap-1">
                        <EditMemberDialog member={{ id: m.id, name: m.user.name, role: m.role, companyIds: m.companyIds, grants: m.grants, denials: m.denials }}
                          roles={ctx.role === "TENANT_OWNER" ? assignable : assignable.filter((r) => r.value !== "TENANT_OWNER")} companies={companyOpts} groups={groups} roleDefaults={ROLE_PERMISSIONS[m.role]} />
                        <OneTimeLinkDialog title={`رابط إعادة تعيين كلمة المرور`} description={`لـ ${m.user.name} — صالح لساعة واحدة ولمرة واحدة`} trigger="رابط استعادة" triggerVariant="ghost" triggerSize="sm" action={resetLinkAction} note="إرسال البريد الإلكتروني غير متاح حاليًا.">
                          <input type="hidden" name="membershipId" value={m.id} />
                          <p className="text-sm text-muted-foreground">سيُلغى أي رابط سابق غير مستخدم لهذا المستخدم.</p>
                        </OneTimeLinkDialog>
                        <ConfirmAction action={toggleMemberAction} fields={{ membershipId: m.id }} destructive={m.isActive} variant="ghost"
                          title={m.isActive ? "إيقاف العضو؟" : "تفعيل العضو؟"} description={m.isActive ? "سيُمنع من الدخول لهذه المنشأة وتُنهى جلساته فورًا." : "سيتمكن من الدخول مجددًا."}>
                          {m.isActive ? "إيقاف" : "تفعيل"}
                        </ConfirmAction>
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>الدعوات المعلقة</CardTitle></CardHeader>
        <CardContent className="p-0">
          {invitations.length ? (
            <Table>
              <THead><TR><TH>البريد</TH><TH>الدور</TH><TH>تنتهي</TH><TH>الحالة</TH><TH /></TR></THead>
              <TBody>
                {invitations.map((i) => (
                  <TR key={i.id}>
                    <TD dir="ltr" className="text-right">{i.email}</TD>
                    <TD>{ROLE_LABELS[i.role]}</TD>
                    <TD>{fmtDate(i.expiresAt)}</TD>
                    <TD><Badge variant={i.expiresAt > now ? "warning" : "muted"}>{i.expiresAt > now ? "بانتظار القبول" : "منتهية"}</Badge></TD>
                    <TD><ConfirmAction action={revokeInvitationAction} fields={{ invitationId: i.id }} title="إلغاء الدعوة؟" description="لن يعمل رابط الدعوة بعد الإلغاء." destructive variant="ghost">إلغاء</ConfirmAction></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <EmptyState title="لا توجد دعوات معلقة" />}
        </CardContent>
      </Card>
    </div>
  );
}
