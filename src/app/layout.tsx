import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parliamentary Event & Protocol Management Platform",
  description: "Official Protocol and Event Operations Platform - Parliament of Ghana",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F7F5F0] text-[#202A38] antialiased">
        {children}
      </body>
    </html>
  );
}
