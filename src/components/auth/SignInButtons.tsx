"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Mail } from "lucide-react";

export function SignInButtons({
  callbackUrl = "/dashboard",
  showDevLogin = false,
}: {
  callbackUrl?: string;
  showDevLogin?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signIn("google", { callbackUrl });
    } catch (err) {
      console.error("Sign in error:", err);
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailLoading(true);
    setError(null);

    try {
      const result = await signIn("resend", {
        email,
        redirect: false,
      });

      if (result?.error) {
        setError("Failed to send login link. Please try again.");
        setEmailLoading(false);
      } else {
        setEmailSent(true);
        setEmailLoading(false);
      }
    } catch {
      setError("Failed to send login link. Please try again.");
      setEmailLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="flex flex-col items-center gap-4 w-full max-w-sm">
        <div className="p-3 rounded-lg bg-success-subtle text-success">
          <Mail className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary">Check your email</h2>
        <p className="text-sm text-text-secondary text-center">
          We sent a sign-in link to <span className="font-semibold">{email}</span>. The link expires
          in 15 minutes.
        </p>
        <button
          onClick={() => {
            setEmailSent(false);
            setEmail("");
          }}
          className="text-sm text-brand hover:underline font-medium"
        >
          Send to a different email
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-sm">
      {showDevLogin && (
        <a
          href="/api/dev-login"
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-brand bg-brand/5 px-4 text-sm font-semibold text-brand transition-colors hover:bg-brand/15 shadow-sm"
        >
          <span>⚡ Dev Quick Sign In</span>
        </a>
      )}

      <Button
        onClick={handleGoogleSignIn}
        disabled={loading || emailLoading}
        className="h-10 w-full px-4"
        variant="secondary"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>{loading ? "Setting up Google & Drive..." : "Continue with Google"}</span>
      </Button>

      <div className="flex items-center gap-2 w-full">
        <div className="h-px bg-border-subtle flex-1" />
        <span className="text-xs text-text-muted uppercase tracking-wider">or</span>
        <div className="h-px bg-border-subtle flex-1" />
      </div>

      <form onSubmit={handleEmailSignIn} className="w-full space-y-2.5">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email address"
          required
          disabled={loading || emailLoading}
          className="w-full"
        />
        <Button
          type="submit"
          disabled={loading || emailLoading || !email}
          className="h-10 w-full px-4"
        >
          {emailLoading ? (
            <>
              <LoadingSpinner className="h-4 w-4" />
              Sending link...
            </>
          ) : (
            <>
              <Mail className="w-4 h-4" />
              Email me a login link
            </>
          )}
        </Button>
      </form>

      {error && <p className="text-xs text-danger text-center">{error}</p>}

      <div className="flex items-center gap-1.5 text-xs text-text-muted">
        <svg
          className="w-4 h-4 text-success"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        <span>Passwordless authentication via email</span>
      </div>
    </div>
  );
}
