import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";

export default function Forbidden() {
  return (
    <AuthShell title="ليست لديك صلاحية" subtitle="دورك الحالي لا يسمح بالوصول إلى هذه الصفحة. تواصل مع مدير المنشأة لطلب الصلاحية.">
      <Link href="/" className="font-bold text-primary underline dark:text-gold">العودة للوحة التحكم</Link>
    </AuthShell>
  );
}
