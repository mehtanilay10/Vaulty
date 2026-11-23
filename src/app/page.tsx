"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Check,
  Cloud,
  FileText,
  Lock,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  Bot,
  Search,
  Download,
} from "lucide-react";
import { VaultLogo } from "@/components/icons/VaultLogo";
import { SignInButton } from "@/components/auth/SignInButton";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

const capabilities = [
  {
    number: "01",
    icon: FileText,
    title: "Documents & Google Drive Sync",
    description:
      "Keep important PDFs, receipts, and images organized in nested folders with tags, full-text preview, and direct bidirectional Google Drive backup.",
    detail: "Nested Folders · Tags · File Preview · Google Drive Sync · Secure Share Links",
  },
  {
    number: "02",
    icon: Sparkles,
    title: "Document AI & Grounded Chat",
    description:
      "Gemini extraction generates structured Markdown summaries and surfaces expiry dates. Ask natural questions grounded strictly in your uploaded documents.",
    detail: "Structured Extraction · Markdown Summaries · Grounded AI Chat · Date Discovery",
  },
  {
    number: "03",
    icon: Lock,
    title: "Client-Side Encrypted Credentials",
    description:
      "Store app logins and banking credentials protected by version 2 envelope encryption (AES-256-GCM / PBKDF2), PIN/passkey App Lock, and zero-knowledge offline recovery.",
    detail: "Version 2 Envelope Encryption · App Lock PIN/Passkey · Offline Recovery Re-key",
  },
  {
    number: "04",
    icon: Wallet,
    title: "Wealth & Multi-Currency Accounts",
    description:
      "Track multi-currency bank accounts, credit cards, mutual funds, loans, and investments with real-time net-worth summaries and historical transaction ledgers.",
    detail: "Multi-Currency · Bank & Credit Accounts · Net Worth Summary · Transaction Ledgers",
  },
  {
    number: "05",
    icon: Mail,
    title: "Inbound Email & Statement Decryption",
    description:
      "Forward receipts and statements to your private inbound address (<username>+<token>@vaulty.mnilay.com) or sync Gmail and Outlook with automated PDF password unlocking.",
    detail: "Inbound Forwarding · PDF Password Unlocking · Gmail & Outlook Sync · Receipt Staging",
  },
  {
    number: "06",
    icon: BellRing,
    title: "Reminders & Smart Notifications",
    description:
      "Never miss a document expiry, passport renewal, insurance payment, or credit card due date. Receive alerts in the notification center, via email, or opt-in Web Push.",
    detail: "Document Expiries · Credit Card Dues · Recurring Alerts · Email & Web Push",
  },
  {
    number: "07",
    icon: Users,
    title: "Granular Family Sharing",
    description:
      "Invite family members by email and grant granular, module-level read-only access to documents, wealth summaries, or credentials without sacrificing data ownership.",
    detail: "Email Invitations · Granular Module Flags · Read-Only Access · Instant Revocation",
  },
  {
    number: "08",
    icon: Search,
    title: "Universal Omnibox & One-Click Takeout",
    description:
      "Instantly search across documents, folders, wealth accounts, credentials, and reminders with Ctrl + K. Export your complete account data as a structured offline ZIP anytime.",
    detail: "Universal Command Palette (Ctrl + K) · Complete Account Takeout (.zip) · Audit Logs",
  },
];

const principles = [
  "Google OAuth & email magic links",
  "Zero-knowledge credential encryption",
  "Google Drive storage backend",
  "Inbound email forwarding (@vaulty.mnilay.com)",
  "Isolated server authorization checks",
  "Offline recovery & data takeout",
];

export default function LandingPage() {
  const { data: session, status } = useSession();
  const isLoggedIn = !!session?.user;
  const cta = isLoggedIn ? (
    <Link href="/dashboard" className="landing-cta">
      Open your vault <ArrowUpRight className="h-4 w-4" />
    </Link>
  ) : (
    <SignInButton />
  );

  return (
    <div className="landing-page">
      <header className="command-bar sticky top-0 z-40">
        <div className="landing-header__inner">
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2.5"
            aria-label="Vaulty home"
          >
            <VaultLogo size={28} className="shrink-0 text-brand" />
            <span className="text-[15px] font-semibold leading-4 tracking-tight text-text-primary">
              Vaulty
            </span>
          </Link>

          <nav
            className="hidden items-center gap-7 text-[13px] font-medium text-text-secondary md:flex"
            aria-label="Main navigation"
          >
            <a href="#your-space" className="transition-colors hover:text-text-primary">
              Your Space
            </a>
            <a href="#features" className="transition-colors hover:text-text-primary">
              Capabilities
            </a>
            <a href="#privacy" className="transition-colors hover:text-text-primary">
              Security & Privacy
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            {isLoggedIn ? (
              <Link href="/dashboard" className="landing-header__link">
                Go to Vault <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : status !== "loading" ? (
              <Link href="/auth/signin" className="landing-header__link">
                Sign in <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="landing-hero">
          <div className="landing-hero__copy">
            <div className="landing-kicker">
              <span className="landing-kicker__dot" /> Personal & Family Information Space
            </div>
            <h1>
              The important things in your life, <em>kept together.</em>
            </h1>
            <p className="landing-hero__description">
              Documents, credentials, wealth records, and deadline reminders — unified in one secure
              space backed by Google Drive, client-side encryption, and AI-assisted understanding.
            </p>
            <div className="landing-hero__actions">
              {cta}
              <a href="#your-space" className="landing-secondary-link">
                Explore your space <ArrowDownRight className="h-4 w-4" />
              </a>
            </div>
            <div className="landing-principles" aria-label="Product principles">
              {principles.map((principle) => (
                <span key={principle}>
                  <Check className="h-3.5 w-3.5" />
                  {principle}
                </span>
              ))}
            </div>
          </div>

          <div
            id="your-space"
            className="landing-preview-wrap"
            aria-label="Illustration of the Vaulty space"
          >
            <div className="landing-preview-note">
              <span className="landing-preview-note__dot" /> PRIVATE & ENCRYPTED SPACE
            </div>
            <div className="landing-preview">
              <div className="landing-preview__topbar">
                <div className="flex items-center gap-2">
                  <VaultLogo size={24} className="text-brand shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-text-primary">Your Vault</p>
                    <p className="text-[10px] text-text-muted">Universal overview</p>
                  </div>
                </div>
                <span className="landing-preview__secure">
                  <LockKeyhole className="h-3 w-3" /> Zero-Knowledge
                </span>
              </div>
              <div className="landing-preview__body">
                <div className="landing-preview__welcome">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                      Your Space pillars
                    </p>
                    <p className="mt-1 text-[20px] font-semibold tracking-[-0.04em] text-text-primary">
                      Everything, organized & protected.
                    </p>
                  </div>
                  <span className="landing-preview__avatar">V</span>
                </div>
                <div className="landing-preview__modules">
                  <div className="landing-module landing-module--documents">
                    <span className="landing-module__icon">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div>
                      <p>Documents & AI</p>
                      <span>Drive sync & AI summaries</span>
                    </div>
                    <ArrowUpRight className="ml-auto h-4 w-4 text-text-muted" />
                  </div>
                  <div className="landing-module landing-module--credentials">
                    <span className="landing-module__icon">
                      <Lock className="h-4 w-4" />
                    </span>
                    <div>
                      <p>Credentials Vault</p>
                      <span>Envelope encrypted & App Lock</span>
                    </div>
                    <ArrowUpRight className="ml-auto h-4 w-4 text-text-muted" />
                  </div>
                  <div className="landing-module landing-module--wealth">
                    <span className="landing-module__icon">
                      <Wallet className="h-4 w-4" />
                    </span>
                    <div>
                      <p>Wealth & Statements</p>
                      <span>Multi-currency & PDF imports</span>
                    </div>
                    <ArrowUpRight className="ml-auto h-4 w-4 text-text-muted" />
                  </div>
                  <div className="landing-module">
                    <span className="landing-module__icon">
                      <Mail className="h-4 w-4" />
                    </span>
                    <div>
                      <p>Inbound Forwarding</p>
                      <span>Forward receipts & statements</span>
                    </div>
                    <ArrowUpRight className="ml-auto h-4 w-4 text-text-muted" />
                  </div>
                  <div className="landing-module">
                    <span className="landing-module__icon">
                      <BellRing className="h-4 w-4" />
                    </span>
                    <div>
                      <p>Reminders & Push</p>
                      <span>Renewals, dues & Web Push</span>
                    </div>
                    <ArrowUpRight className="ml-auto h-4 w-4 text-text-muted" />
                  </div>
                  <div className="landing-module">
                    <span className="landing-module__icon">
                      <Bot className="h-4 w-4" />
                    </span>
                    <div>
                      <p>Grounded AI Chat</p>
                      <span>Answers from your documents</span>
                    </div>
                    <ArrowUpRight className="ml-auto h-4 w-4 text-text-muted" />
                  </div>
                </div>
                <div className="landing-preview__bottom">
                  <div className="flex items-center gap-2">
                    <span className="landing-preview__shield">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold text-text-primary">
                        Family sharing & full takeout
                      </p>
                      <p className="text-[10px] text-text-muted">
                        Granular permissions · One-click ZIP export
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-brand">
                    CONTROL <ArrowUpRight className="inline h-3 w-3" />
                  </span>
                </div>
              </div>
            </div>
            <div className="landing-float-card">
              <span className="landing-float-card__icon">
                <Cloud className="h-4 w-4" />
              </span>
              <div>
                <p>Google Drive Connected</p>
                <span>Direct user storage</span>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Capabilities Breakdown */}
        <section id="features" className="landing-section">
          <div className="landing-section__heading">
            <p className="landing-overline">Built for peace of mind</p>
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <h2>
                Eight core capabilities.
                <br />
                <em>Zero compromise on privacy.</em>
              </h2>
              <p>
                Designed for the records that matter most — backed by architectural authorization
                and device-level cryptographic protection.
              </p>
            </div>
          </div>

          <div className="landing-capabilities">
            {capabilities.map(({ number, icon: Icon, title, description, detail }) => (
              <article className="landing-capability" key={number}>
                <div className="landing-capability__top">
                  <span>{number}</span>
                  <Icon className="h-[19px] w-[19px]" strokeWidth={1.7} />
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
                <div className="landing-capability__detail">{detail}</div>
              </article>
            ))}
          </div>
        </section>

        {/* Security & Privacy Section */}
        <section id="privacy" className="landing-privacy">
          <div className="landing-privacy__mark">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="landing-privacy__copy">
            <p className="landing-overline">Privacy is an architectural rule</p>
            <h2>
              Your information.
              <br />
              <em>Your sovereign data.</em>
            </h2>
            <p className="landing-privacy__description">
              Vaulty blends private Google Drive storage, isolated server-side checks, client-side
              version 2 envelope encryption, and zero-knowledge recovery. Plaintext passwords never
              reach the database, and your data can be taken out at any time.
            </p>
            <div className="landing-privacy__list">
              <div>
                <Check className="h-4 w-4" />
                <span>
                  Documents are stored in your Google Drive and accessed only via authorized routes.
                </span>
              </div>
              <div>
                <Check className="h-4 w-4" />
                <span>
                  Passwords and PINs are encrypted client-side using AES-256-GCM and PBKDF2 (600,000
                  iterations).
                </span>
              </div>
              <div>
                <Check className="h-4 w-4" />
                <span>
                  Master password reset preserves credentials using an offline 64-character recovery
                  key.
                </span>
              </div>
              <div>
                <Check className="h-4 w-4" />
                <span>
                  Inbound forwarding delivers receipts and statements without giving external access
                  to your main mailbox.
                </span>
              </div>
              <div>
                <Check className="h-4 w-4" />
                <span>
                  Family members only receive read-only access to the specific modules you choose.
                </span>
              </div>
              <div>
                <Check className="h-4 w-4" />
                <span>
                  Instant full account takeout downloads all documents, CSV transactions, and
                  encrypted vaults in one click.
                </span>
              </div>
            </div>
          </div>
          <div className="landing-privacy__aside">
            <div className="landing-privacy__aside-line">
              <span>Document storage</span>
              <strong>Google Drive</strong>
              <Cloud className="h-4 w-4" />
            </div>
            <div className="landing-privacy__aside-line">
              <span>Credentials</span>
              <strong>Client encrypted</strong>
              <Lock className="h-4 w-4" />
            </div>
            <div className="landing-privacy__aside-line">
              <span>App Lock</span>
              <strong>PIN & Passkey</strong>
              <LockKeyhole className="h-4 w-4" />
            </div>
            <div className="landing-privacy__aside-line">
              <span>Data takeout</span>
              <strong>Offline .zip</strong>
              <Download className="h-4 w-4" />
            </div>
            <div className="landing-privacy__aside-note">
              <Sparkles className="h-4 w-4" /> Document AI processing is user-triggered and private
              to your account.
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="landing-final-cta">
          <div>
            <p className="landing-overline">Get started in seconds</p>
            <h2>
              Keep what matters safe,
              <br />
              <em>organized, and accessible.</em>
            </h2>
          </div>
          <div className="landing-final-cta__action">
            {cta}
            <p>Sign in with Google or email to enter your vault.</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle bg-surface/50 py-12 text-sm text-text-muted">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="space-y-3">
              <Link href="/" className="group flex items-center gap-2.5">
                <VaultLogo size={26} className="text-brand shrink-0" />
                <span className="text-[15px] font-semibold tracking-tight text-text-primary">
                  Vaulty
                </span>
              </Link>
              <p className="text-xs text-text-secondary leading-relaxed">
                Private personal & family space for documents, credentials, wealth records, and
                deadline reminders.
              </p>
            </div>

            <div>
              <p className="font-semibold text-xs text-text-primary uppercase tracking-wider">
                Your Space
              </p>
              <ul className="mt-3 space-y-2 text-xs">
                <li>
                  <Link href="/documents" className="hover:text-text-primary transition-colors">
                    Documents & Drive
                  </Link>
                </li>
                <li>
                  <Link href="/credentials" className="hover:text-text-primary transition-colors">
                    Encrypted Credentials
                  </Link>
                </li>
                <li>
                  <Link href="/wealth" className="hover:text-text-primary transition-colors">
                    Wealth Accounts
                  </Link>
                </li>
                <li>
                  <Link href="/email-sync" className="hover:text-text-primary transition-colors">
                    Inbound Forwarding
                  </Link>
                </li>
                <li>
                  <Link href="/reminders" className="hover:text-text-primary transition-colors">
                    Smart Reminders
                  </Link>
                </li>
                <li>
                  <Link href="/family" className="hover:text-text-primary transition-colors">
                    Family Sharing
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-xs text-text-primary uppercase tracking-wider">
                Security Architecture
              </p>
              <ul className="mt-3 space-y-2 text-xs">
                <li>
                  <span className="text-text-secondary">v2 Envelope Encryption (AES-256-GCM)</span>
                </li>
                <li>
                  <span className="text-text-secondary">
                    PBKDF2 Key Derivation (600,000 iterations)
                  </span>
                </li>
                <li>
                  <span className="text-text-secondary">Zero-Knowledge Offline Recovery</span>
                </li>
                <li>
                  <span className="text-text-secondary">App Lock PIN & Passkey</span>
                </li>
                <li>
                  <span className="text-text-secondary">One-Click Account Takeout (.zip)</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 border-t border-border-subtle pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <p>© {new Date().getFullYear()} Vaulty. All rights reserved.</p>
            <p className="flex items-center gap-1.5 text-text-secondary">
              <span>Made with</span>
              <span className="text-rose-500 inline-block animate-pulse" aria-label="love">
                ❤️
              </span>
              <span>for private sovereign data</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
