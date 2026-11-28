import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Newsreader, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { FeedbackProvider } from "@/components/providers/FeedbackProvider";
import { SiteFooter } from "@/components/shell/SiteFooter";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-serif-loaded",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e14" },
  ],
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  title: "Vaulty — Personal & Family Information Vault",
  description:
    "Private personal and family workspace for Google Drive documents & scans, zero-knowledge credentials & 2FA authenticator, multi-currency wealth ledgers, markdown notes, email auto-sync, reminders, and Gemini AI.",
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
    <html
      lang="en"
      suppressHydrationWarning
      className={`h-full antialiased ${plusJakarta.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-full bg-background text-text-primary flex flex-col antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(!t){t="dark"}else if(t==="system"){t=window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"}if(t==="dark"){document.documentElement.classList.add("dark")}else{document.documentElement.classList.remove("dark")}var m=document.querySelector('meta[name="color-scheme"]');if(m){m.content=t==="dark"?"dark":"light"}}catch(e){}})();`,
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
        <Analytics />
      </body>
    </html>
  );
}
