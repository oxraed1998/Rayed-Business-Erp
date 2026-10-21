"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive"><AlertTriangle className="size-7" /></div>
      <div>
        <p className="text-lg font-bold">حدث خطأ أثناء تحميل الصفحة</p>
        <p className="mt-1 text-sm text-muted-foreground">تم تسجيل الخطأ. حاول مجددًا، وإذا تكرر تواصل مع الدعم.</p>
      </div>
      <Button onClick={reset}>إعادة المحاولة</Button>
    </div>
  );
}
