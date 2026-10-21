"use client";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { FlashToast } from "./flash-toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <FlashToast />
      <Toaster richColors position="top-center" dir="rtl" toastOptions={{ style: { fontFamily: "var(--font-cairo)" } }} />
    </ThemeProvider>
  );
}
