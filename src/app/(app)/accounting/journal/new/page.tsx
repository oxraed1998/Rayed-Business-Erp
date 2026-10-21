import { BookOpen } from "lucide-react";
import { pageCompanyContext } from "@/lib/context";
import { accountOptions, activityOptions, customerOptions, supplierOptions } from "@/server/queries/options";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { AccountingNav } from "@/components/accounting/accounting-nav";
import { JournalEditor } from "@/components/accounting/journal-editor";

export const metadata = { title: "قيد يومية جديد" };

export default async function NewJournalPage() {
  const ctx = await pageCompanyContext("accounting.create");
  const [accounts, activities, customers, suppliers] = await Promise.all([accountOptions(ctx), activityOptions(ctx), customerOptions(ctx), supplierOptions(ctx)]);
  return (
    <div>
      <PageHeader title="قيد يومية جديد" description="مجموع المدين يجب أن يساوي مجموع الدائن قبل الترحيل" icon={BookOpen} />
      <AccountingNav active="/accounting/journal" />
      <Card><CardContent className="pt-5"><JournalEditor accounts={accounts} activities={activities} customers={customers} suppliers={suppliers} canPost={ctx.permissions.has("accounting.approve")} /></CardContent></Card>
    </div>
  );
}
