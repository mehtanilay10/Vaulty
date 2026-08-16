import { auth } from "@/auth";
import { SettingsClient } from "@/components/settings/SettingsClient";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  return <SettingsClient user={session.user} />;
}
