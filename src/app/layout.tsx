import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { FeedbackProvider } from "@/components/providers/FeedbackProvider";
import { SiteFooter } from "@/components/shell/SiteFooter";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#090d16" },
  ],
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  title: "Vaulty - Private Family Document Vault",
  description:
    "Secure, private personal and family document storage with AI-powered summaries and granular recursive folder sharing.",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full bg-background text-text-primary flex flex-col antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(!t){t=window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"}if(t==="dark"){document.documentElement.classList.add("dark")}else{document.documentElement.classList.remove("dark")}var m=document.querySelector('meta[name="color-scheme"]');if(m){m.content=t==="dark"?"dark":"light"}}catch(e){}})();`,
          }}
        />
        <ThemeProvider>
          <SessionProvider>
            <FeedbackProvider>
              <div className="flex min-h-screen flex-col">
                <div className="flex-1">{children}</div>
                <SiteFooter />
              </div>
            </FeedbackProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
