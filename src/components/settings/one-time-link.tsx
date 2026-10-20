"use client";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/forms/action-form";
import type { ActionResult } from "@/server/action";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

export function CopyBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} dir="ltr" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <Button type="button" variant="outline" size="icon" aria-label="نسخ" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); toast.success("تم النسخ"); }}>
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

/**
 * Dialog whose server action returns a secret link (invitation / password reset) that is shown
 * exactly once; it is never stored in plain text on the server.
 */
export function OneTimeLinkDialog({ title, description, trigger, action, children, submitLabel = "إنشاء الرابط", triggerVariant = "default", triggerSize, note }: {
  title: string; description?: string; trigger: React.ReactNode; action: Action; children?: React.ReactNode; submitLabel?: string;
  triggerVariant?: ButtonProps["variant"]; triggerSize?: ButtonProps["size"]; note?: string;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setKey((k) => k + 1); }}>
      <DialogTrigger asChild><Button variant={triggerVariant} size={triggerSize}>{trigger}</Button></DialogTrigger>
      <DialogContent title={title} description={description}>
        <LinkForm key={key} action={action} submitLabel={submitLabel} note={note} onClose={() => setOpen(false)}>{children}</LinkForm>
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({ action, children, submitLabel, note, onClose }: { action: Action; children?: React.ReactNode; submitLabel: string; note?: string; onClose: () => void }) {
  const [state, formAction] = useActionState(action, null);
  useEffect(() => {
    if (state && !state.ok) toast.error(state.error);
    if (state?.ok) toast.success(state.message ?? "تم");
  }, [state]);
  if (state?.ok && state.data?.link) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-gold/40 bg-gold-soft p-4 text-sm">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-accent-foreground" />
          <p>انسخ الرابط الآن وأرسله للشخص المعني بطريقة آمنة. <b>لن يظهر الرابط مرة أخرى.</b>{note ? ` ${note}` : ""}</p>
        </div>
        <CopyBox value={state.data.link} />
        <div className="flex justify-end"><Button onClick={onClose}>تم</Button></div>
      </div>
    );
  }
  return (
    <form action={formAction} className="space-y-4">
      {children}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onClose}>إلغاء</Button>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
