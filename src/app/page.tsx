import Link from "next/link";
import { Shield, FolderTree, FileCheck, Sparkles, ArrowRight, Lock, Users, EyeOff } from "lucide-react";
import { VaultLogo } from "@/components/icons/VaultLogo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function LandingPage() {
  const session = await import("@/auth").then(m => m.auth());
  const isLoggedIn = !!session?.user;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="relative z-10 px-6 py-5 max-w-7xl mx-auto w-full flex justify-between items-center">
        <Link href="/" className="flex items-center gap-3">
          <VaultLogo size={36} />
          <div>
            <span className="font-semibold text-xl tracking-tight text-text-primary">
              Vaulty
            </span>
            <span className="block text-[10px] uppercase tracking-widest text-brand font-semibold">
              Private Family Fortress
            </span>
          </div>
        </Link>

        <div>
          <Link
            href={isLoggedIn ? "/dashboard" : "/auth/signin"}
            className="btn-primary px-5 py-2.5 text-sm whitespace-nowrap"
          >
            {isLoggedIn ? "Go to Vault" : "Sign In with Google"}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center items-center text-center px-6 py-16 md:py-24">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-subtle border border-brand/20 text-brand text-xs font-semibold">
            <Shield className="w-3.5 h-3.5" />
            <span>Zero Public URLs &bull; Isolated Server Authorization</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1] text-text-primary">
            Architectural Security for Your{" "}
            <span className="text-brand">
              Most Essential
            </span>{" "}
            Documents.
          </h1>

          <p className="text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed">
            Government credentials, health diagnostics, education certificates, and financial records. Engineered with strict Google OAuth access, private Vercel Blob storage, and Gemini AI analysis.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={isLoggedIn ? "/dashboard" : "/auth/signin"}
              className="btn-primary px-8 py-3 text-base w-full sm:w-auto whitespace-nowrap"
            >
              {isLoggedIn ? "Open My Private Vault" : "Initialize Google Vault"}
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-6 text-left pt-8">
            <Card hover className="p-6">
              <div className="p-3 rounded-lg bg-brand-subtle text-brand w-fit mb-4">
                <EyeOff className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                Private Blob Vault
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Files are stored in private storage. Raw URLs are never exposed to clients. Every view or download streams through authorized server verification.
              </p>
            </Card>

            <Card hover className="p-6">
              <div className="p-3 rounded-lg bg-brand-subtle text-brand w-fit mb-4">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                Family Folder Sharing
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Share folders with registered family members. Permissions are strictly read-only and automatically inherit across subfolder trees.
              </p>
            </Card>

            <Card hover className="p-6">
              <div className="p-3 rounded-lg bg-brand-subtle text-brand w-fit mb-4">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                Gemini 2.0 AI Summaries
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                OCR text extraction, Markdown summaries, and factual interpretations generated automatically from scanned PDFs and medical or government images.
              </p>
            </Card>
          </div>
        </div>
      </main>

      <footer className="border-t border-border-subtle p-6 text-center text-xs text-text-muted">
        Vaulty Private Family Vault &bull; Built with Next.js App Router, Prisma, PostgreSQL &amp; Gemini 2.0 Flash AI.
      </footer>
    </div>
  );
}
