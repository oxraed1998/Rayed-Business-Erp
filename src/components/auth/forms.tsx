"use client";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Field, Input } from "@/components/ui/input";
import { PasswordInput } from "./password-input";
import { acceptInviteAction, loginAction, resetPasswordAction, setupAction } from "@/server/actions/session";

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={loginAction} resetOnSuccess={false}>
      <input type="hidden" name="next" value={next ?? "/"} />
      <Field label="البريد الإلكتروني"><Input name="email" type="email" autoComplete="username" required dir="ltr" className="h-11 text-right" placeholder="name@company.com" /></Field>
      <Field label="كلمة المرور"><PasswordInput name="password" autoComplete="current-password" required /></Field>
      <div className="flex justify-end"><Link href="/forgot-password" className="text-xs font-semibold text-muted-foreground hover:text-foreground">نسيت كلمة المرور؟</Link></div>
      <SubmitButton size="lg" className="w-full">تسجيل الدخول</SubmitButton>
    </ActionForm>
  );
}

export function SetupForm() {
  return (
    <ActionForm action={setupAction} resetOnSuccess={false}>
      <Field label="رمز الإعداد" hint="القيمة المضبوطة في متغير SETUP_TOKEN على الخادم"><PasswordInput name="token" required autoComplete="off" /></Field>
      <Field label="اسم المنشأة"><Input name="tenantName" required placeholder="مؤسسة رائد التجارية" className="h-11" /></Field>
      <Field label="اسمك الكامل"><Input name="name" required className="h-11" /></Field>
      <Field label="البريد الإلكتروني"><Input name="email" type="email" required dir="ltr" className="h-11 text-right" autoComplete="username" /></Field>
      <Field label="كلمة المرور" hint="10 أحرف على الأقل وتحتوي على أحرف وأرقام"><PasswordInput name="password" required autoComplete="new-password" /></Field>
      <SubmitButton size="lg" className="w-full">إنشاء حساب المالك</SubmitButton>
    </ActionForm>
  );
}

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  return (
    <ActionForm action={acceptInviteAction} resetOnSuccess={false}>
      <input type="hidden" name="token" value={token} />
      <Field label="البريد الإلكتروني"><Input value={email} disabled dir="ltr" className="h-11 text-right" /></Field>
      <Field label="اسمك الكامل"><Input name="name" required className="h-11" /></Field>
      <Field label="كلمة المرور" hint="10 أحرف على الأقل وتحتوي على أحرف وأرقام"><PasswordInput name="password" required autoComplete="new-password" /></Field>
      <SubmitButton size="lg" className="w-full">قبول الدعوة</SubmitButton>
    </ActionForm>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  return (
    <ActionForm action={resetPasswordAction} resetOnSuccess={false}>
      <input type="hidden" name="token" value={token} />
      <Field label="كلمة المرور الجديدة" hint="10 أحرف على الأقل وتحتوي على أحرف وأرقام"><PasswordInput name="password" required autoComplete="new-password" /></Field>
      <Field label="تأكيد كلمة المرور"><PasswordInput name="confirm" required autoComplete="new-password" /></Field>
      <SubmitButton size="lg" className="w-full">تعيين كلمة المرور</SubmitButton>
    </ActionForm>
  );
}
