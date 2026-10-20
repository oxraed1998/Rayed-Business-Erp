"use client";
import * as React from "react";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import type { ActionResult } from "@/server/action";
import { ActionForm, SubmitButton } from "./action-form";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/** A button that opens a dialog containing a server-action form; closes on success. */
export function FormDialog({
  title, description, trigger, triggerVariant = "default", action, children, submitLabel = "حفظ", wide, icon = true, triggerSize,
}: {
  title: string; description?: string; trigger: React.ReactNode; triggerVariant?: ButtonProps["variant"]; triggerSize?: ButtonProps["size"];
  action: Action; children: React.ReactNode; submitLabel?: string; wide?: boolean; icon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          {icon && <Plus />}
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={description} wide={wide}>
        <ActionForm action={action} onSuccess={() => setOpen(false)}>
          {children}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
