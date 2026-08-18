import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export const metadata: Metadata = {
  title: "Vaulty - Private Family Document Vault",
  description: "Secure, private personal and family document storage with AI-powered summaries and granular recursive folder sharing.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Vaulty",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/vaulty-icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className={`${inter.className} min-h-full bg-background text-text-primary flex flex-col`}>
        <ThemeProvider>
          <SessionProvider>{children}</SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
