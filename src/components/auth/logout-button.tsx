"use client";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/session";

export function LogoutButton() {
  const [pending, start] = useTransition();
  return <Button variant="outline" disabled={pending} onClick={() => start(async () => { await logoutAction(); window.location.assign("/login"); })}>تسجيل الخروج</Button>;
}
