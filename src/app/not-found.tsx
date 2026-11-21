import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function RootNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-surface text-text-primary">
      <div className="max-w-md w-full p-8 text-center rounded-2xl border border-border-subtle bg-surface-elevated shadow-fluent-16">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <FileQuestion className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          404 - Page Not Found
        </h1>
        <p className="mt-2 text-sm text-text-muted leading-relaxed">
          The page or resource you are looking for doesn&apos;t exist or has been relocated.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/">
            <Button variant="primary">
              <Home className="h-4 w-4 mr-1.5" />
              Return Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
