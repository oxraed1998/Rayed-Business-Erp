import { Building2 } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext } from "@/lib/context";
import { createActivityAction, toggleActivityAction, updateCompanyAction } from "@/server/actions/companies";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { FormDialog } from "@/components/forms/form-dialog";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Grid, MoneyField, SelectField, TextField } from "@/components/forms/fields";
import { SettingsNav } from "@/components/settings/settings-nav";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "إعدادات الشركة" };

const ACTIVITY_LABELS = { VEHICLES: "سيارات", LIVESTOCK: "مواشي", CLOTHING: "ملابس", GENERAL: "عام" } as const;

export default async function SettingsPage() {
  const ctx = await pageCompanyContext("companies.read");
  const c = ctx.company;
  const canManage = ctx.permissions.has("companies.manage");
  const activities = await db.businessActivity.findMany({ where: { tenantId: ctx.tenant.id, companyId: c.id }, orderBy: { createdAt: "asc" } });

  return (
    <div>
      <PageHeader title="الإعدادات" description={ctx.tenant.name} icon={Building2} />
      <SettingsNav active="/settings" />
      <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
        <Card>
          <CardHeader><CardTitle>بيانات الشركة الحالية</CardTitle><CardDescription>العملة الأساسية: {c.baseCurrency} (لا يمكن تغييرها بعد إنشاء الشركة لأن القيود مسجلة بها)</CardDescription></CardHeader>
          <CardContent>
            {canManage ? (
              <ActionForm action={updateCompanyAction} resetOnSuccess={false}>
                <Grid>
                  <TextField name="name" label="اسم الشركة" required defaultValue={c.name} />
                  <TextField name="legalName" label="الاسم القانوني" defaultValue={c.legalName ?? ""} />
                  <TextField name="taxNumber" label="الرقم الضريبي" dir="ltr" defaultValue={c.taxNumber ?? ""} placeholder="3XXXXXXXXXXXXX3" />
                  <TextField name="crNumber" label="السجل التجاري" dir="ltr" defaultValue={c.crNumber ?? ""} />
                  <TextField name="phone" label="الهاتف" dir="ltr" defaultValue={c.phone ?? ""} />
                  <TextField name="email" label="البريد الإلكتروني" type="email" dir="ltr" defaultValue={c.email ?? ""} />
                  <TextField name="address" label="العنوان" defaultValue={c.address ?? ""} className="sm:col-span-2" />
                  <MoneyField name="vatRate" label="نسبة ضريبة القيمة المضافة الافتراضية %" required defaultValue={c.vatRate.toString()} />
                </Grid>
                <SubmitButton>حفظ التغييرات</SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted-foreground">لا تملك صلاحية تعديل بيانات الشركة.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle>الأنشطة التجارية</CardTitle><CardDescription>تُستخدم لتصنيف القيود ومقارنة الأداء</CardDescription></div>
            {canManage && (
              <FormDialog title="إضافة نشاط" trigger="نشاط" triggerSize="sm" action={createActivityAction}>
                <TextField name="name" label="اسم النشاط" required placeholder="مثال: معرض الرياض" />
                <SelectField name="type" label="نوع النشاط" required options={Object.entries(ACTIVITY_LABELS).map(([value, label]) => ({ value, label }))} />
              </FormDialog>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead><TR><TH>النشاط</TH><TH>النوع</TH><TH>الحالة</TH><TH>أضيف</TH>{canManage && <TH />}</TR></THead>
              <TBody>
                {activities.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-semibold">{a.name}</TD>
                    <TD>{ACTIVITY_LABELS[a.type]}</TD>
                    <TD><Badge variant={a.isActive ? "success" : "muted"}>{a.isActive ? "نشط" : "موقوف"}</Badge></TD>
                    <TD>{fmtDate(a.createdAt)}</TD>
                    {canManage && (
                      <TD>
                        <ConfirmAction action={toggleActivityAction} fields={{ id: a.id }} title={a.isActive ? "إيقاف النشاط؟" : "تفعيل النشاط؟"}
                          description={a.isActive ? "لن يظهر النشاط في القوائم الجديدة، وتبقى سجلاته وقيوده كما هي." : "سيعود النشاط للظهور في القوائم."}
                          destructive={a.isActive}>{a.isActive ? "إيقاف" : "تفعيل"}</ConfirmAction>
                      </TD>
                    )}
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
