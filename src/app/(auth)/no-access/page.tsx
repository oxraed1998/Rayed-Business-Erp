import { AuthShell } from "@/components/auth/auth-shell";
import { LogoutButton } from "@/components/auth/logout-button";

export default function NoAccess() {
  return (
    <AuthShell title="لا توجد منشأة مرتبطة بحسابك" subtitle="اطلب من مدير المنشأة إرسال دعوة إلى بريدك الإلكتروني، أو تفعيل عضويتك.">
      <LogoutButton />
    </AuthShell>
  );
}
