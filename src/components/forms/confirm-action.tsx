"use client";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionResult } from "@/server/action";
import { navigateWithFlash } from "@/components/flash-toast";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/** Confirmation dialog in front of a destructive or irreversible server action. */
export function ConfirmAction({
  action, fields, title, description, confirmLabel = "تأكيد", children, variant = "outline", size = "sm", destructive,
}: {
  action: Action; fields: Record<string, string>; title: string; description: string; confirmLabel?: string;
  children: React.ReactNode; variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = () =>
    start(async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      const r = await action(null, fd);
      if (r.ok) {
        setOpen(false);
        if (r.redirect) return navigateWithFlash(r.redirect, r.message);
        toast.success(r.message ?? "تم بنجاح");
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger asChild>
        <Button variant={variant} size={size}>{children}</Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-navy-deep/60 backdrop-blur-sm" />
        <AlertDialog.Content dir="rtl" className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-card p-6 shadow-lift">
          <AlertDialog.Title className="text-lg font-bold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">{description}</AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild><Button variant="ghost">إلغاء</Button></AlertDialog.Cancel>
            <Button variant={destructive ? "destructive" : "default"} onClick={run} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
