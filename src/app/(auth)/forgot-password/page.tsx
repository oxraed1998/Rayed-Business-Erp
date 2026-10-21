import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata = { title: "نسيت كلمة المرور" };

export default function ForgotPage() {
  return (
    <AuthShell title="نسيت كلمة المرور؟" subtitle="استعادة الوصول إلى حسابك">
      <div className="space-y-4 text-sm leading-relaxed">
        <p>اطلب من مالك المنشأة أو مدير الشركة إنشاء <b>رابط إعادة تعيين</b> لحسابك من: الإعدادات ← المستخدمون. الرابط صالح لمدة ساعة ولمرة واحدة.</p>
        <p className="rounded-lg border border-dashed bg-muted/50 p-3 text-muted-foreground">إرسال رابط الاستعادة عبر البريد الإلكتروني غير متاح حاليًا لأنه لم يتم ربط مزود بريد إلكتروني بعد.</p>
        <Link href="/login" className="inline-block font-bold text-primary underline dark:text-gold">العودة لتسجيل الدخول</Link>
      </div>
    </AuthShell>
  );
}
