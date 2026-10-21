"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionResult } from "@/server/action";
import { cn } from "@/lib/utils";
import { navigateWithFlash } from "@/components/flash-toast";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

const FieldErrorsContext = React.createContext<Record<string, string>>({});
export const useFieldError = (name: string) => React.useContext(FieldErrorsContext)[name];

export function ActionForm({
  action, children, className, onSuccess, resetOnSuccess = true, successMessage,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  onSuccess?: (r: Extract<ActionResult, { ok: true }>) => void;
  resetOnSuccess?: boolean;
  successMessage?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      onSuccess?.(state);
      // Full navigation: always renders the target fresh (the message arrives via the flash cookie).
      if (state.redirect) return navigateWithFlash(state.redirect, state.message ?? successMessage);
      toast.success(state.message ?? successMessage ?? "تم الحفظ بنجاح");
      if (resetOnSuccess) ref.current?.reset();
      // Re-render server components with the new data (fresh request).
      router.refresh();
    } else toast.error(state.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <FieldErrorsContext.Provider value={state && !state.ok ? state.fieldErrors ?? {} : {}}>
      <form ref={ref} action={formAction} className={cn("space-y-4", className)} noValidate={false}>
        {children}
      </form>
    </FieldErrorsContext.Provider>
  );
}

export function SubmitButton({ children, className, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} className={className} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}
