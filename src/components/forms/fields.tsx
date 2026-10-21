"use client";
import * as React from "react";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useFieldError } from "./action-form";

interface Base { name: string; label: string; hint?: string; required?: boolean; className?: string }

export function TextField({ name, label, hint, required, className, ...rest }: Base & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  const error = useFieldError(name);
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      <Input name={name} required={required} aria-invalid={Boolean(error)} {...rest} />
    </Field>
  );
}

export function MoneyField({ name, label, hint, required, className, ...rest }: Base & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  const error = useFieldError(name);
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      <Input name={name} required={required} inputMode="decimal" dir="ltr" className="text-right num" placeholder="0.00" pattern="-?[0-9]*[.,]?[0-9]{0,2}" {...rest} />
    </Field>
  );
}

export function NumberField({ name, label, hint, required, className, ...rest }: Base & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  const error = useFieldError(name);
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      <Input name={name} type="number" required={required} inputMode="numeric" {...rest} />
    </Field>
  );
}

export function DateField({ name, label, hint, required, className, ...rest }: Base & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  const error = useFieldError(name);
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      <Input name={name} type="date" required={required} {...rest} />
    </Field>
  );
}

export function SelectField({ name, label, hint, required, className, options, placeholder, ...rest }: Base & { options: { value: string; label: string }[]; placeholder?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  const error = useFieldError(name);
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      <NativeSelect name={name} required={required} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </NativeSelect>
    </Field>
  );
}

export function TextAreaField({ name, label, hint, required, className, ...rest }: Base & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  const error = useFieldError(name);
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      <Textarea name={name} required={required} {...rest} />
    </Field>
  );
}

export function CheckboxField({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} value="on" defaultChecked={defaultChecked} className="mt-0.5 size-4 rounded border-input accent-[hsl(var(--gold))]" />
      <span>
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export const Grid = ({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) => (
  <div className={{ 2: "grid gap-4 sm:grid-cols-2", 3: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3", 4: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4" }[cols]}>{children}</div>
);
