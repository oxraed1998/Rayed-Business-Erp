"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "طباعة / PDF" }: { label?: string }) {
  return <Button type="button" variant="outline" size="sm" className="no-print" onClick={() => window.print()}><Printer /> {label}</Button>;
}
