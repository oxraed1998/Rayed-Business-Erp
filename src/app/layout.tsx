import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo", display: "swap", weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Rayed Business ERP", template: "%s | Rayed ERP" },
  description: "منصة رائد لإدارة الأعمال: السيارات، المواشي، الملابس، المحاسبة والشركاء",
  manifest: "/manifest.webmanifest",
  applicationName: "Rayed ERP",
  appleWebApp: { capable: true, title: "Rayed ERP", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#101f39" }, { media: "(prefers-color-scheme: dark)", color: "#070d1a" }],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning className={cairo.variable}>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
