import { AppShell } from "@/components/shell/AppShell";
import { UploadProvider } from "@/app/contexts/UploadContext";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { AppLockProvider } from "@/components/app-lock/AppLockProvider";
import { AppLockScreen } from "@/components/app-lock/AppLockScreen";
import { PasswordVaultProvider } from "@/lib/password-context";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLockProvider>
      <PasswordVaultProvider>
        <UploadProvider>
          <AppShell>
            <ErrorBoundary>{children}</ErrorBoundary>
          </AppShell>
        </UploadProvider>
        <AppLockScreen />
      </PasswordVaultProvider>
    </AppLockProvider>
  );
}
