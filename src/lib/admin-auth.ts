/** Admin access is opt-in and fails closed when ADMIN_EMAILS is absent/empty. */
export function isConfiguredAdmin(user: { email?: string | null } | null | undefined): boolean {
  const configured = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length === 0 || !user?.email) return false;
  return configured.includes(user.email.trim().toLowerCase());
}
