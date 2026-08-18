"use client";

import { signIn } from "next-auth/react";
import { ArrowRight } from "lucide-react";

export function SignInButton() {
  return (
    <button
      onClick={() => signIn("google")}
      className="btn btn-primary px-5 py-2.5 text-sm whitespace-nowrap inline-flex items-center gap-2"
    >
      Sign In with Google
      <ArrowRight className="w-4 h-4" />
    </button>
  );
}
