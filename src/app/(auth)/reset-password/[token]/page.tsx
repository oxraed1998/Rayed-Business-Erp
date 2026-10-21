import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/forms";

export const metadata = { title: "إعادة تعيين كلمة المرور" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell title="تعيين كلمة مرور جديدة" subtitle="سيتم تسجيل خروجك من جميع الأجهزة بعد التغيير">
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
