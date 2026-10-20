"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/session";

export function LogoutButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <Button variant="outline" disabled={pending} onClick={() => start(async () => { await logoutAction(); router.push("/login"); })}>تسجيل الخروج</Button>;
}
