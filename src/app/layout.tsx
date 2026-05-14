import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { ErrorBoundary } from "@/components/error-boundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Design Studio — Laser Engrave Concept Manager",
  description: "Project management and design workflow tool for laser-engraved product concepts",
  appleWebApp: { capable: true, statusBarStyle: "default" },
};

/**
 * Next.js 16 moved viewport / themeColor / colorScheme out of `metadata`
 * into a dedicated `viewport` export. viewport-fit=cover lets us paint
 * under the iOS notch + home indicator; the global CSS adds safe-area
 * insets so content stays out of those regions.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f1ea",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ErrorBoundary scope="root">
          <AppShell>{children}</AppShell>
        </ErrorBoundary>
      </body>
    </html>
  );
}
