import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parliament of Ghana · Event & Protocol Platform",
  description: "Official Protocol and Event Operations Platform - Parliament of Ghana",
  icons: {
    icon: { url: "/favicon.svg", type: "image/svg+xml" },
  },
};

export const viewport: Viewport = {
  themeColor: "#ECEEF1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/outfit-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body className="min-h-screen bg-brand-canvas text-brand-ink antialiased">{children}</body>
    </html>
  );
}
