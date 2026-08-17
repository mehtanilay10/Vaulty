import { auth } from "@/auth";
import Link from "next/link";
import { Shield, FolderTree, FileCheck, Sparkles, ArrowRight, Lock, Users, Search, Award, EyeOff } from "lucide-react";
import { VaultLogo } from "@/components/icons/VaultLogo";

export default async function LandingPage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-bg-main text-text-primary flex flex-col justify-between selection:bg-accent-primary selection:text-white transition-colors">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 right-0 w-[40rem] h-[40rem] bg-gradient-to-br from-accent-primary/10 via-accent-primary/5 to-transparent rounded-full blur-[140px]"></div>
        <div className="absolute top-1/2 -left-40 w-[35rem] h-[35rem] bg-gradient-to-tr from-accent-primary/8 via-accent-secondary/5 to-transparent rounded-full blur-[140px]"></div>
      </div>

      <header className="relative z-10 p-6 max-w-7xl mx-auto w-full flex justify-between items-center">
        <div className="flex items-center gap-3">
          <VaultLogo size={36} />
          <div>
            <span className="font-extrabold text-2xl tracking-tighter text-text-primary">
              Vaulty
            </span>
            <span className="block text-[9px] uppercase tracking-[0.25em] text-accent-primary font-bold">
              Private Family Fortress
            </span>
          </div>
        </div>

        <div>
          {session ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl vault-btn-primary text-sm cursor-pointer"
            >
              <span>Go to Vault</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href="/auth/signin"
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl vault-btn-primary text-sm cursor-pointer"
            >
              <span>Sign In with Google</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12 md:py-20 flex-1 flex flex-col justify-center items-center text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-primary-soft border border-accent-primary/20 text-accent-primary text-xs font-bold mb-8">
          <Shield className="w-3.5 h-3.5" />
          <span>Zero Public URLs &bull; Isolated Server Authorization</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight max-w-4xl leading-[1.08] text-text-primary mb-6">
          Architectural Security for Your{" "}
          <span className="italic font-serif font-normal text-accent-primary">
            Most Essential
          </span>{" "}
          Documents.
        </h1>

        <p className="text-text-secondary text-lg md:text-xl max-w-2xl mb-10 leading-relaxed font-light">
          Government credentials, health diagnostics, education certificates, and financial records. Engineered with strict Google OAuth access, private Vercel Blob storage, and Gemini AI analysis.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
          {session ? (
            <Link
              href="/dashboard"
              className="w-full sm:w-auto px-9 py-4 rounded-2xl vault-btn-primary text-base flex items-center justify-center gap-3 cursor-pointer"
            >
              <span>Open My Private Vault</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          ) : (
            <Link
              href="/auth/signin"
              className="w-full sm:w-auto px-9 py-4 rounded-2xl vault-btn-primary text-base flex items-center justify-center gap-3 cursor-pointer"
            >
              <span>Initialize Google Vault</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-8 w-full text-left">
          <div className="vault-card vault-card-hover p-8">
            <div className="p-3.5 rounded-2xl bg-accent-primary-soft text-accent-primary w-fit mb-5">
              <EyeOff className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-extrabold text-text-primary mb-2">
              Private Blob Vault
            </h3>
            <p className="text-text-secondary text-sm leading-relaxed font-light">
              Files are stored in private storage. Raw URLs are never exposed to clients. Every view or download streams through authorized server verification.
            </p>
          </div>

          <div className="vault-card vault-card-hover p-8">
            <div className="p-3.5 rounded-2xl bg-accent-primary-soft text-accent-primary w-fit mb-5">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-extrabold text-text-primary mb-2">
              Family Folder Sharing
            </h3>
            <p className="text-text-secondary text-sm leading-relaxed font-light">
              Share folders with registered family members. Permissions are strictly read-only and automatically inherit across subfolder trees.
            </p>
          </div>

          <div className="vault-card vault-card-hover p-8">
            <div className="p-3.5 rounded-2xl bg-accent-primary-soft text-accent-primary w-fit mb-5">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-extrabold text-text-primary mb-2">
              Gemini 2.0 AI Summaries
            </h3>
            <p className="text-text-secondary text-sm leading-relaxed font-light">
              OCR text extraction, Markdown summaries, and factual interpretations generated automatically from scanned PDFs and medical or government images.
            </p>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border-subtle p-6 text-center text-xs text-text-muted font-medium">
        Vaulty Private Family Vault &bull; Built with Next.js App Router, Prisma, PostgreSQL &amp; Gemini 2.0 Flash AI.
      </footer>
    </div>
  );
}
