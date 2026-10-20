import { FileText } from "lucide-react";
import { db } from "@/lib/db";
import { pageCompanyContext, scope } from "@/lib/context";
import { INVOICE_TYPE_LABELS } from "@/lib/domain/invoice-calc";
import { activityOptions, currencyOptions, customerOptions, supplierOptions } from "@/server/queries/options";
import { PageHeader } from "@/components/ui/misc";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";

export const metadata = { title: "فاتورة جديدة" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("invoices.create");
  const sp = await searchParams;
  const type = (sp.type && sp.type in INVOICE_TYPE_LABELS ? sp.type : "SALES") as keyof typeof INVOICE_TYPE_LABELS;
  const [customers, suppliers, activities, sales] = await Promise.all([
    customerOptions(ctx), supplierOptions(ctx), activityOptions(ctx),
    db.invoice.findMany({ where: { ...scope(ctx), type: "SALES", status: "POSTED" }, include: { customer: true }, orderBy: { issueDate: "desc" }, take: 300 }),
  ]);
  return (
    <div>
      <PageHeader title="فاتورة جديدة" description="فواتير المبيعات والمشتريات والإشعارات الدائنة والمدينة والدفعات المقدمة" icon={FileText} />
      <InvoiceEditor
        defaultType={type} defaultCustomerId={sp.customerId} defaultSupplierId={sp.supplierId} defaultRelatedId={sp.relatedInvoiceId}
        customers={customers} suppliers={suppliers} activities={activities} currencies={currencyOptions}
        postedSales={sales.map((i) => ({ value: i.id, label: `${i.number} · ${i.customer?.name ?? ""}`, customerId: i.customerId }))}
        vatRate={ctx.company.vatRate.toString()} baseCurrency={ctx.company.baseCurrency} canApprove={ctx.permissions.has("invoices.approve")}
      />
    </div>
  );
}
