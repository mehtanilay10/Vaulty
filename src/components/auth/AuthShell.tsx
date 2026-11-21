import Link from "next/link";
import { Lock, Cloud, Sparkles } from "lucide-react";
import { VaultLogo } from "@/components/icons/VaultLogo";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { AppFooter } from "@/components/shell/AppFooter";

const highlights = [
  { icon: Lock, label: "Isolated server authorization" },
  { icon: Cloud, label: "Private Google Drive storage" },
  { icon: Sparkles, label: "Gemini-powered document AI" },
];

interface AuthShellProps {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthShell({ icon, title, description, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="command-bar sticky top-0 z-40 shrink-0">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5">
            <VaultLogo size={28} className="shrink-0 text-brand" />
            <span className="text-[15px] font-semibold leading-4 tracking-tight text-text-primary">
              Vaulty
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/"
              className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full">
          <div className="card p-5 sm:p-6">
            <div className="mb-4 flex flex-col items-center text-center">
              <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-xl border border-brand/15 bg-brand-subtle text-brand shadow-fluent-2">
                {icon}
              </div>
              <h1 className="text-[1.25rem] font-semibold tracking-tight text-text-primary">
                {title}
              </h1>
              <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
                {description}
              </p>
            </div>

            {children}
          </div>

          {footer && <div className="mt-3 text-center">{footer}</div>}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-text-muted">
            {highlights.map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <Icon className="h-3 w-3 text-brand" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
