"use client";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = (p: TabsPrimitive.TabsProps) => <TabsPrimitive.Root dir="rtl" {...p} />;
export const TabsList = ({ className, ...p }: TabsPrimitive.TabsListProps) => (
  <TabsPrimitive.List className={cn("inline-flex h-10 max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1", className)} {...p} />
);
export const TabsTrigger = ({ className, ...p }: TabsPrimitive.TabsTriggerProps) => (
  <TabsPrimitive.Trigger className={cn("rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-all data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm", className)} {...p} />
);
export const TabsContent = ({ className, ...p }: TabsPrimitive.TabsContentProps) => <TabsPrimitive.Content className={cn("mt-4 focus-visible:outline-none", className)} {...p} />;
