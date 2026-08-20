import Link from "next/link";
import { Shield, Sparkles, ArrowRight, Users, EyeOff, Cloud, Zap, LockIcon } from "lucide-react";
import { VaultLogo } from "@/components/icons/VaultLogo";
import { Card } from "@/components/ui/Card";
import { SignInButton } from "@/components/auth/SignInButton";

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
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="btn btn-primary px-5 py-2.5 text-sm whitespace-nowrap rounded-md"
            >
              Go to Vault
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <SignInButton />
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center items-center text-center px-6 py-16 md:py-24">
        <div className="max-w-5xl mx-auto space-y-8">
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

          <p className="text-lg text-text-secondary max-w-3xl mx-auto leading-relaxed">
            Engineered with strict Google OAuth access, Google Drive storage, and Gemini AI analysis.
            Government credentials, health diagnostics, education certificates, and financial records.
            Every file is encrypted, permission-verified, and streamed through authorized server proxies.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="btn btn-primary px-8 py-3 text-base w-full sm:w-auto whitespace-nowrap rounded-md"
              >
                Open My Private Vault
                <ArrowRight className="w-5 h-5" />
              </Link>
            ) : (
              <SignInButton />
            )}
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
                Files are stored in private Google Drive with strict access control. Raw URLs are never exposed to clients. Every view or download streams through authorized server verification.
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
                Share folders with registered family members. Permissions are strictly read-only and automatically inherit across subfolder trees. Owner maintains full control.
              </p>
            </Card>

            <Card hover className="p-6">
              <div className="p-3 rounded-lg bg-brand-subtle text-brand w-fit mb-4">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                Gemini 3.6 AI Summaries
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                OCR text extraction, Markdown summaries, and factual interpretations generated automatically from scanned PDFs and medical or government images.
              </p>
            </Card>
          </div>

          <div className="grid md:grid-cols-3 gap-6 text-left pt-4">
            <Card hover className="p-6">
              <div className="p-3 rounded-lg bg-brand-subtle text-brand w-fit mb-4">
                <LockIcon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                Zero Public Exposure
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                No public URLs. No client-side tokens. All files served through strict server-side permission checks against PostgreSQL.
              </p>
            </Card>

            <Card hover className="p-6">
              <div className="p-3 rounded-lg bg-brand-subtle text-brand w-fit mb-4">
                <Cloud className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                Google Drive Integration
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Seamless two-way sync with your Google Drive. Vaulty creates a dedicated folder structure with Docs, Summary, and Text subfolders.
              </p>
            </Card>

            <Card hover className="p-6">
              <div className="p-3 rounded-lg bg-brand-subtle text-brand w-fit mb-4">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                AI-Powered Analysis
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Automatic OCR, summarization, and interpretation using Google Gemini 2.0 Flash. Extract insights from scanned documents in seconds.
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
