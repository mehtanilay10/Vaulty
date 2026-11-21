import { Lock } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignInButtons } from "@/components/auth/SignInButtons";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  const isDevLoginAvailable =
    process.env.NODE_ENV === "development" && Boolean(process.env.DEV_LOGIN_EMAIL);

  return (
    <AuthShell
      icon={<Lock className="h-6 w-6" />}
      title="Sign in to Vaulty"
      description="Access your personal documents, credentials, wealth records, and family shares."
      footer={
        <p className="text-[12px] text-text-muted">
          Your information is protected with isolated server authorization and client-side
          encryption.
        </p>
      }
    >
      <SignInButtons callbackUrl={callbackUrl || "/dashboard"} showDevLogin={isDevLoginAvailable} />
    </AuthShell>
  );
}
