import { auth } from "@/auth";
import Link from "next/link";
import { Shield, FolderTree, FileCheck, Sparkles, ArrowRight, Lock, Users, Search } from "lucide-react";

export default async function LandingPage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Background ambient light */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[30rem] h-[30rem] bg-indigo-600/15 rounded-full blur-[120px]"></div>
        <div className="absolute top-1/3 -left-40 w-[30rem] h-[30rem] bg-blue-600/15 rounded-full blur-[120px]"></div>
      </div>

      {/* Navigation Header */}
      <header className="relative z-10 p-6 max-w-7xl mx-auto w-full flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-500/25">
            <VaultIcon className="w-6 h-6" />
          </div>
          <div>
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
              Vaulty
            </span>
            <span className="block text-[10px] uppercase tracking-widest text-indigo-400 font-semibold">
              Private Family Vault
            </span>
          </div>
        </div>

        <div>
          {session ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href="/auth/signin"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-white font-medium transition-all cursor-pointer"
            >
              <span>Sign In</span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-16 flex-1 flex flex-col justify-center items-center text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium mb-8 backdrop-blur-md">
          <Shield className="w-3.5 h-3.5 text-indigo-400" />
          <span>Zero Public Access &bull; Isolated Private Blob Storage</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight max-w-4xl leading-tight bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent mb-6">
          Your Personal & Family Documents, <span className="text-indigo-400">Strictly Private.</span>
        </h1>

        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mb-10 leading-relaxed">
          Store government IDs, medical records, education certificates, and financial documents with confidence. Secured with Google authentication, Vercel Blob private storage, and intelligent Gemini AI summaries.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
          {session ? (
            <Link
              href="/dashboard"
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold text-base shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-3 cursor-pointer"
            >
              <span>Open My Vault</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          ) : (
            <Link
              href="/auth/signin"
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold text-base shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-3 cursor-pointer"
            >
              <span>Get Started with Google</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          )}
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-3 gap-6 w-full text-left">
          <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md">
            <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 w-fit mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Private Blob Access</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Files are stored in private storage. Raw blob URLs are never exposed. Access is strictly authorized server-side per user request.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md">
            <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-400 w-fit mb-4">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Granular Folder Sharing</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Share nested folders with other registered family members with strict read-only permissions. Recursive folder access control.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 w-fit mb-4">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Gemini AI Understanding</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Automatic structured AI summaries, factual interpretations, and OCR text extraction for PDFs and medical or government images.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/60 p-6 text-center text-xs text-slate-500">
        Vaulty Private Family Document Vault &bull; Built with Next.js App Router, Prisma, PostgreSQL &amp; Gemini AI.
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
