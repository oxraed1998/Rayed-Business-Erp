import { UserRound } from "lucide-react";
import { db } from "@/lib/db";
import { pageContext } from "@/lib/context";
import { updateProfileAction } from "@/server/actions/session";
import { signOutOtherSessionsAction } from "@/server/actions/users";
import { ROLE_LABELS } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValue, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Grid, TextField } from "@/components/forms/fields";

export const metadata = { title: "الملف الشخصي" };

const fmtTime = (d: Date) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(d);

function device(ua: string | null) {
  if (!ua) return "غير معروف";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "متصفح";
  return [br, os].filter(Boolean).join(" · ");
}

export default async function ProfilePage() {
  const ctx = await pageContext();
  const sessions = await db.session.findMany({ where: { userId: ctx.user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } });
  return (
    <div className="space-y-6">
      <PageHeader title="الملف الشخصي" description={ctx.user.email} icon={UserRound} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>بياناتي وكلمة المرور</CardTitle><CardDescription>اترك حقول كلمة المرور فارغة إذا لم ترغب في تغييرها</CardDescription></CardHeader>
          <CardContent>
            <KeyValue className="mb-5" items={[["المنشأة", ctx.tenant.name], ["الدور", ROLE_LABELS[ctx.role]], ["البريد", <span key="e" dir="ltr">{ctx.user.email}</span>]]} />
            <ActionForm action={updateProfileAction}>
              <TextField name="name" label="الاسم" required defaultValue={ctx.user.name} />
              <Grid>
                <TextField name="current" label="كلمة المرور الحالية" type="password" autoComplete="current-password" dir="ltr" />
                <span className="hidden sm:block" />
                <TextField name="password" label="كلمة المرور الجديدة" type="password" autoComplete="new-password" dir="ltr" hint="10 أحرف على الأقل وتحتوي على أحرف وأرقام" />
                <TextField name="confirm" label="تأكيد كلمة المرور" type="password" autoComplete="new-password" dir="ltr" />
              </Grid>
              <SubmitButton>حفظ</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle>الجلسات النشطة</CardTitle><CardDescription>الأجهزة المسجّل دخولها بحسابك</CardDescription></div>
            {sessions.length > 1 && (
              <ConfirmAction action={signOutOtherSessionsAction} fields={{}} title="إنهاء الجلسات الأخرى؟" description="سيتم تسجيل خروجك من جميع الأجهزة الأخرى، وتبقى هذه الجلسة." destructive>إنهاء الجلسات الأخرى</ConfirmAction>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead><TR><TH>الجهاز</TH><TH>IP</TH><TH>آخر نشاط</TH><TH /></TR></THead>
              <TBody>
                {sessions.map((s) => (
                  <TR key={s.id}>
                    <TD>{device(s.userAgent)}</TD>
                    <TD className="font-mono text-xs" dir="ltr">{s.ip ?? "—"}</TD>
                    <TD className="text-xs num">{fmtTime(s.lastSeenAt)}</TD>
                    <TD>{s.id === ctx.sessionId && <Badge variant="success">الجلسة الحالية</Badge>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
