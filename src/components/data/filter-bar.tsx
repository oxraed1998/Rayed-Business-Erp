import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";

export interface FilterDef { name: string; label: string; options: { value: string; label: string }[] }

/** GET-form filter bar: works without JS and keeps filters in the URL (shareable, back-button friendly). */
export function FilterBar({ q, values, filters = [], placeholder = "بحث..." , dates }: { q?: string; values: Record<string, string | undefined>; filters?: FilterDef[]; placeholder?: string; dates?: boolean }) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-2 border-b p-3">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder={placeholder} className="h-9 pr-9" />
      </div>
      {filters.map((f) => (
        <NativeSelect key={f.name} name={f.name} defaultValue={values[f.name] ?? ""} className="h-9 w-auto min-w-[140px]" aria-label={f.label}>
          <option value="">{f.label}: الكل</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </NativeSelect>
      ))}
      {dates && (
        <>
          <Input type="date" name="from" defaultValue={values.from} className="h-9 w-40" aria-label="من تاريخ" />
          <Input type="date" name="to" defaultValue={values.to} className="h-9 w-40" aria-label="إلى تاريخ" />
        </>
      )}
      <Button size="sm" variant="secondary" className="h-9">تصفية</Button>
    </form>
  );
}

export function Pagination({ page, pageSize, total, params }: { page: number; pageSize: number; total: number; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="p-3 text-xs text-muted-foreground">{total} سجل</p>;
  const href = (p: number) => "?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>, page: String(p) }).toString();
  return (
    <div className="flex items-center justify-between p-3 text-xs text-muted-foreground">
      <span>{total} سجل · صفحة {page} من {pages}</span>
      <div className="flex gap-1">
        <Button asChild variant="outline" size="sm" className={page <= 1 ? "pointer-events-none opacity-50" : ""}><a href={href(page - 1)}>السابق</a></Button>
        <Button asChild variant="outline" size="sm" className={page >= pages ? "pointer-events-none opacity-50" : ""}><a href={href(page + 1)}>التالي</a></Button>
      </div>
    </div>
  );
}

export const pageParam = (v: string | undefined) => Math.max(1, Number.parseInt(v ?? "1", 10) || 1);
