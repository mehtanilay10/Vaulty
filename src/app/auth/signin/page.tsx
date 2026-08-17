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
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-5 flex justify-between items-center max-w-7xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-3">
          <VaultLogo size={32} />
          <div className="flex flex-col">
            <span className="font-semibold text-xl tracking-tight text-text-primary">
              Vaulty
            </span>
            <span className="text-[10px] uppercase tracking-widest text-brand font-semibold">
              Private Family Vault
            </span>
          </div>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md card p-8 flex flex-col items-center text-center">
          <div className="p-3 rounded-lg bg-brand-subtle text-brand mb-6">
            <Lock className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-text-primary mb-2">
            Access Your Private Vault
          </h1>
          <p className="text-sm text-text-secondary mb-8 leading-relaxed">
            Secure, end-to-end access control for personal and family documents. Sign in with your Google account to get started.
          </p>

          <SignInButtons callbackUrl={callbackUrl || "/dashboard"} />

          <div className="mt-8 pt-6 border-t border-border-subtle w-full grid grid-cols-3 gap-4 text-center text-xs text-text-muted">
            <div className="flex flex-col items-center gap-1">
              <Shield className="w-4 h-4 text-brand" />
              <span>Isolated Storage</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <FileText className="w-4 h-4 text-brand" />
              <span>Private Blobs</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Sparkles className="w-4 h-4 text-brand" />
              <span>Gemini AI</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="p-6 text-center text-xs text-text-muted">
        &copy; {new Date().getFullYear()} Vaulty Document Vault. All documents stay strictly private and encrypted.
      </footer>
    </div>
  );
}
