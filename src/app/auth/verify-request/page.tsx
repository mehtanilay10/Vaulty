import Link from "next/link";
import { Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";

export default async function VerifyRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <AuthShell
      icon={<Mail className="h-6 w-6" />}
      title="Check your email"
      description={
        <>
          We sent a sign-in link to{" "}
          <span className="font-semibold text-text-primary">{email || "your inbox"}</span>. The link
          expires in 15 minutes.
        </>
      }
      footer={
        <Link
          href="/auth/signin"
          className="text-[12px] font-medium text-brand transition-colors hover:text-brand-hover hover:underline"
        >
          &larr; Back to sign in
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border-subtle bg-surface-muted p-4 text-[12px] leading-relaxed text-text-secondary">
          <p className="font-semibold text-text-primary">What happens next?</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-text-muted">
            <li>Open the email from Vaulty.</li>
            <li>Click the secure sign-in link.</li>
            <li>You will be returned to your private vault.</li>
          </ol>
        </div>

        <Link href="/auth/signin" className="btn btn-secondary h-10 w-full text-[13px]">
          Use a different method
        </Link>
      </div>
    </AuthShell>
  );
}
