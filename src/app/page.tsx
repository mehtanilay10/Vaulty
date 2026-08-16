import { auth } from "@/auth";
import Link from "next/link";
import { Shield, FolderTree, FileCheck, Sparkles, ArrowRight, Lock, Users, Search, Award, EyeOff } from "lucide-react";

export default async function LandingPage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#07090e] text-slate-900 dark:text-slate-100 flex flex-col justify-between selection:bg-amber-500 selection:text-slate-950 transition-colors duration-300">
      {/* Art-directed background ambient geometry */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 right-0 w-[40rem] h-[40rem] bg-gradient-to-br from-amber-500/10 via-indigo-600/10 to-transparent rounded-full blur-[140px]"></div>
        <div className="absolute top-1/2 -left-40 w-[35rem] h-[35rem] bg-gradient-to-tr from-blue-600/10 via-amber-500/5 to-transparent rounded-full blur-[140px]"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 p-6 max-w-7xl mx-auto w-full flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-indigo-600 text-slate-950 font-extrabold shadow-lg shadow-amber-500/20">
            <VaultIcon className="w-6 h-6" />
          </div>
          <div>
            <span className="font-extrabold text-2xl tracking-tighter bg-gradient-to-r from-slate-900 via-amber-700 to-indigo-900 dark:from-white dark:via-amber-200 dark:to-indigo-300 bg-clip-text text-transparent">
              Vaulty
            </span>
            <span className="block text-[9px] uppercase tracking-[0.25em] text-amber-600 dark:text-amber-400 font-bold">
              Private Family Fortress
            </span>
          </div>
        </div>

        <div>
          {session ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-bold text-sm shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
            >
              <span>Go to Vault</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href="/auth/signin"
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-bold text-sm shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
            >
              <span>Sign In with Google</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12 md:py-20 flex-1 flex flex-col justify-center items-center text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold mb-8 backdrop-blur-md">
          <Shield className="w-3.5 h-3.5 text-amber-500" />
          <span>Zero Public URLs &bull; Isolated Server Authorization</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight max-w-4xl leading-[1.08] bg-gradient-to-b from-slate-900 via-slate-800 to-slate-600 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent mb-6">
          Architectural Security for Your <span className="italic font-serif font-normal text-amber-600 dark:text-amber-400">Most Essential</span> Documents.
        </h1>

        <p className="text-slate-600 dark:text-slate-400 text-lg md:text-xl max-w-2xl mb-10 leading-relaxed font-light">
          Government credentials, health diagnostics, education certificates, and financial records. Engineered with strict Google OAuth access, private Vercel Blob storage, and Gemini AI analysis.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
          {session ? (
            <Link
              href="/dashboard"
              className="w-full sm:w-auto px-9 py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-slate-950 font-bold text-base shadow-xl shadow-amber-500/25 hover:shadow-2xl hover:scale-[1.02] transition-all flex items-center justify-center gap-3 cursor-pointer"
            >
              <span>Open My Private Vault</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          ) : (
            <Link
              href="/auth/signin"
              className="w-full sm:w-auto px-9 py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-slate-950 font-bold text-base shadow-xl shadow-amber-500/25 hover:shadow-2xl hover:scale-[1.02] transition-all flex items-center justify-center gap-3 cursor-pointer"
            >
              <span>Initialize Google Vault</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          )}
        </div>

        {/* Asymmetric Material Cards Grid */}
        <div className="grid md:grid-cols-3 gap-8 w-full text-left">
          <div className="p-8 rounded-3xl bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 backdrop-blur-xl shadow-xl hover:border-amber-500/40 transition-all">
            <div className="p-3.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 w-fit mb-5">
              <EyeOff className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-2">
              Private Blob Vault
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed font-light">
              Files are stored in private storage. Raw URLs are never exposed to clients. Every view or download streams through authorized server verification.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 backdrop-blur-xl shadow-xl hover:border-amber-500/40 transition-all">
            <div className="p-3.5 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 w-fit mb-5">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-2">
              Family Folder Sharing
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed font-light">
              Share folders with registered family members. Permissions are strictly read-only and automatically inherit across subfolder trees.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 backdrop-blur-xl shadow-xl hover:border-amber-500/40 transition-all">
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 w-fit mb-5">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-2">
              Gemini 2.0 AI Summaries
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed font-light">
              OCR text extraction, Markdown summaries, and factual interpretations generated automatically from scanned PDFs and medical or government images.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200 dark:border-slate-800/60 p-6 text-center text-xs text-slate-500 dark:text-slate-500 font-medium">
        Vaulty Private Family Vault &bull; Built with Next.js App Router, Prisma, PostgreSQL &amp; Gemini 2.0 Flash AI.
      </footer>
    </div>
  );
}

function VaultIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 9v3l2 1" />
    </svg>
  );
}
