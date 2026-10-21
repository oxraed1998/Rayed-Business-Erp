import * as React from "react";
import { cn } from "@/lib/utils";

export const Table = ({ className, ...p }: React.HTMLAttributes<HTMLTableElement>) => (
  <div className="relative w-full overflow-x-auto">
    <table className={cn("w-full caption-bottom text-sm", className)} {...p} />
  </div>
);
export const THead = ({ className, ...p }: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className={cn("bg-muted/60 [&_tr]:border-b", className)} {...p} />;
export const TBody = ({ className, ...p }: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className={cn("[&_tr:last-child]:border-0", className)} {...p} />;
export const TFoot = ({ className, ...p }: React.HTMLAttributes<HTMLTableSectionElement>) => <tfoot className={cn("border-t-2 bg-muted/40 font-bold", className)} {...p} />;
export const TR = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => <tr className={cn("border-b transition-colors hover:bg-muted/40", className)} {...p} />;
export const TH = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th className={cn("h-10 whitespace-nowrap px-3 text-start align-middle text-xs font-bold text-muted-foreground", className)} {...p} />;
export const TD = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn("whitespace-nowrap px-3 py-2.5 align-middle", className)} {...p} />;
