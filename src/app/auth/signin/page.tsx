import { SignInButtons } from "@/components/auth/SignInButtons";
import { Shield, Lock, FileText, Sparkles } from "lucide-react";
import Link from "next/link";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl"></div>
      </div>

      {/* Header logo */}
      <header className="relative z-10 p-6 flex justify-between items-center max-w-7xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-transform">
            <VaultIcon className="w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
              Vaulty
            </span>
            <span className="text-[10px] uppercase tracking-widest text-indigo-400 font-semibold">
              Private Family Vault
            </span>
          </div>
        </Link>
      </header>

      {/* Main card */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center">
          <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-6">
            <Lock className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
            Access Your Private Vault
          </h1>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            Secure, end-to-end access control for personal and family documents. Sign in with your Google account to get started.
          </p>

          <SignInButtons callbackUrl={callbackUrl || "/dashboard"} />

          <div className="mt-8 pt-6 border-t border-slate-800/80 w-full grid grid-cols-3 gap-2 text-center text-xs text-slate-400">
            <div className="flex flex-col items-center gap-1">
              <Shield className="w-4 h-4 text-indigo-400" />
              <span>Isolated Storage</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <FileText className="w-4 h-4 text-indigo-400" />
              <span>Private Blobs</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Gemini AI</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 p-6 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} Vaulty Document Vault. All documents stay strictly private and encrypted.
      </footer>
    </div>
  );
}

function VaultIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 9v3l2 1" />
    </svg>
  );
}
