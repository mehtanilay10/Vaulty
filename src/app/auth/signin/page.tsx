import { SignInButtons } from "@/components/auth/SignInButtons";
import { Shield, Lock, FileText, Sparkles } from "lucide-react";
import Link from "next/link";
import { VaultLogo } from "@/components/icons/VaultLogo";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="min-h-screen bg-bg-main text-text-primary flex flex-col justify-between selection:bg-accent-primary selection:text-white transition-colors">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-accent-primary/15 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-accent-primary/10 rounded-full blur-3xl"></div>
      </div>

      <header className="relative z-10 p-6 flex justify-between items-center max-w-7xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-3 group">
          <VaultLogo size={32} />
          <div className="flex flex-col">
            <span className="font-bold text-xl tracking-tight text-text-primary">
              Vaulty
            </span>
            <span className="text-[10px] uppercase tracking-widest text-accent-primary font-semibold">
              Private Family Vault
            </span>
          </div>
        </Link>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md vault-card p-8 flex flex-col items-center text-center">
          <div className="p-3.5 rounded-2xl bg-accent-primary-soft border border-accent-primary/20 text-accent-primary mb-6">
            <Lock className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-2">
            Access Your Private Vault
          </h1>
          <p className="text-text-secondary text-sm mb-8 leading-relaxed">
            Secure, end-to-end access control for personal and family documents. Sign in with your Google account to get started.
          </p>

          <SignInButtons callbackUrl={callbackUrl || "/dashboard"} />

          <div className="mt-8 pt-6 border-t border-border-subtle w-full grid grid-cols-3 gap-2 text-center text-xs text-text-muted">
            <div className="flex flex-col items-center gap-1">
              <Shield className="w-4 h-4 text-accent-primary" />
              <span>Isolated Storage</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <FileText className="w-4 h-4 text-accent-primary" />
              <span>Private Blobs</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Sparkles className="w-4 h-4 text-accent-primary" />
              <span>Gemini AI</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 p-6 text-center text-xs text-text-muted">
        &copy; {new Date().getFullYear()} Vaulty Document Vault. All documents stay strictly private and encrypted.
      </footer>
    </div>
  );
}
