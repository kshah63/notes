import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "MathVision Parent Notes",
  description:
    "A lightweight CRM for parent conversations — capture, tidy, and recall.",
  manifest: "/manifest.webmanifest",
  applicationName: "Parent Notes",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Parent Notes",
  },
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
