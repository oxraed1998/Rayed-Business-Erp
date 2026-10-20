import Link from "next/link";
import { Money } from "@/components/ui/money";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { fmtDate } from "@/lib/utils";
import type { Decimal } from "@/lib/money";

type Row = { id: string; date: Date; number: string; description: string; sourceType: string | null; sourceId: string | null; debit: Decimal; credit: Decimal; balance: Decimal };

const SOURCE: Record<string, string> = { INVOICE: "فاتورة", PAYMENT: "سند", REVERSAL: "عكس قيد", MANUAL: "قيد يدوي", VEHICLE_PURCHASE: "شراء سيارة", VEHICLE_EXPENSE: "مصروف سيارة", HERD_PURCHASE: "شراء مواشي", HERD_EXPENSE: "مصروف مواشي", STOCK_PURCHASE: "شراء مخزون", SHIPMENT_EXPENSE: "مصروف شحنة" };

export function StatementTable({ opening, rows, closing, currency, from }: { opening: Decimal; rows: Row[]; closing: Decimal; currency: string; from?: string }) {
  const link = (r: Row) => (r.sourceType === "INVOICE" && r.sourceId ? `/invoices/${r.sourceId}` : null);
  return (
    <Table>
      <THead><TR><TH>التاريخ</TH><TH>القيد</TH><TH>البيان</TH><TH>النوع</TH><TH>مدين</TH><TH>دائن</TH><TH>الرصيد</TH></TR></THead>
      <TBody>
        {from && <TR className="bg-muted/30"><TD colSpan={6} className="font-semibold">رصيد افتتاحي حتى {from}</TD><TD><Money value={opening} currency={currency} /></TD></TR>}
        {rows.map((r) => {
          const href = link(r);
          return (
            <TR key={r.id}>
              <TD>{fmtDate(r.date)}</TD>
              <TD className="font-mono text-xs">{r.number}</TD>
              <TD className="max-w-xs truncate">{href ? <Link href={href} className="hover:text-gold">{r.description}</Link> : r.description}</TD>
              <TD className="text-xs text-muted-foreground">{SOURCE[r.sourceType ?? ""] ?? r.sourceType ?? "—"}</TD>
              <TD>{r.debit.isZero() ? "—" : <Money value={r.debit} currency={currency} />}</TD>
              <TD>{r.credit.isZero() ? "—" : <Money value={r.credit} currency={currency} />}</TD>
              <TD><Money value={r.balance} currency={currency} className="font-semibold" /></TD>
            </TR>
          );
        })}
        {!rows.length && <TR><TD colSpan={7} className="py-8 text-center text-muted-foreground">لا توجد حركات في الفترة</TD></TR>}
      </TBody>
      <TFoot><TR><TD colSpan={6}>الرصيد الختامي</TD><TD><Money value={closing} currency={currency} /></TD></TR></TFoot>
    </Table>
  );
}
