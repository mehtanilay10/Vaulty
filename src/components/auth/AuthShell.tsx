import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { VaultLogo } from "@/components/icons/VaultLogo";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { AppFooter } from "@/components/shell/AppFooter";

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
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-border hover:text-text-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to home
            </Link>
          </div>
        </div>
      </header>

      <main className="atelier-grid-bg mx-auto flex w-full flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-fluent-16 sm:p-8">
          <div className="mb-6 flex flex-col items-start">
            <div className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-muted text-brand">
              {icon}
            </div>
            <h1 className="text-[1.4rem] font-semibold tracking-tight text-text-primary">
              {title}
            </h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">{description}</p>
          </div>

          {children}

          {footer && (
            <div className="mt-6 border-t border-border-subtle pt-4 text-left">{footer}</div>
          )}
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
