import Link from "next/link";
import { FileQuestion, Home, FileText, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function AppNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center border-border-subtle shadow-fluent-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <FileQuestion className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-text-primary">Not Found</h1>
        <p className="mt-2 text-sm text-text-muted leading-relaxed">
          The requested document, folder, or account could not be found. It may have been moved,
          deleted, or you may not have access to it.
        </p>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link href="/dashboard" className="w-full sm:w-auto">
            <Button variant="primary" className="w-full justify-center">
              <Home className="h-4 w-4 mr-1.5" />
              Dashboard
            </Button>
          </Link>
          <Link href="/documents" className="w-full sm:w-auto">
            <Button variant="secondary" className="w-full justify-center">
              <FileText className="h-4 w-4 mr-1.5" />
              Documents
            </Button>
          </Link>
          <Link href="/wealth" className="w-full sm:w-auto">
            <Button variant="ghost" className="w-full justify-center">
              <Wallet className="h-4 w-4 mr-1.5" />
              Wealth
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
