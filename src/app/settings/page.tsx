import { auth } from "@/auth";
import { SettingsClient } from "@/components/settings/SettingsClient";
import Link from "next/link";
import { HardDrive, User, Shield, Cpu, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = session.user;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <User className="w-7 h-7 text-indigo-400" />
              <span>Account &amp; Vault Settings</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              User identity details, security parameters, and storage allocation
            </p>
          </div>

          <div className="max-w-3xl space-y-6">
            {/* User Info Card */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800/80 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-400" />
                <span>Google OAuth Identity</span>
              </h2>

              <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                {user?.image ? (
                  <img src={user.image} alt="" className="w-14 h-14 rounded-2xl ring-2 ring-indigo-500/30" />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 text-indigo-400 font-bold text-xl flex items-center justify-center">
                    {user?.name?.[0] || user?.email?.[0]}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-lg text-white">{user?.name || "Standard User"}</h3>
                  <p className="text-sm text-slate-400">{user?.email}</p>
                  <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Authenticated Standard User
                  </span>
                </div>
              </div>
            </div>

            {/* Storage Settings Link */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800/80 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-blue-400" />
                <span>Storage</span>
              </h2>

              <p className="text-xs text-slate-400">
                Manage your Google Drive connection and default storage provider.
              </p>

              <Link
                href="/settings/storage"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors cursor-pointer"
              >
                <HardDrive className="w-4 h-4" />
                <span>Storage Settings</span>
              </Link>
            </div>

            {/* Application Parameters */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800/80 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-blue-400" />
                <span>Storage &amp; AI Configuration</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <span className="text-slate-400 font-medium">Blob Storage Mode</span>
                  <p className="font-bold text-white text-sm">Vercel Private Blob</p>
                  <p className="text-slate-500">Authorized server streaming proxy active.</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <span className="text-slate-400 font-medium">Max File Limit</span>
                  <p className="font-bold text-white text-sm">50 MB per document</p>
                  <p className="text-slate-500">Supports PDF, JPEG, PNG, WebP.</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <span className="text-slate-400 font-medium">AI Engine</span>
                  <p className="font-bold text-white text-sm">Google Gemini 2.5 Flash</p>
                  <p className="text-slate-500">OCR text extraction &amp; Markdown summary.</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <span className="text-slate-400 font-medium">Database Engine</span>
                  <p className="font-bold text-white text-sm">Supabase / Neon PostgreSQL</p>
                  <p className="text-slate-500">Prisma ORM with recursive permissions.</p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
