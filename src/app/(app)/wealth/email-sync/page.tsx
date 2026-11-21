import { redirect } from "next/navigation";

export default async function LegacyWealthEmailSyncRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(resolved)) {
    if (typeof v === "string") {
      params.set(k, v);
    }
  }
  const queryString = params.toString();
  redirect(queryString ? `/email-sync?${queryString}` : "/email-sync");
}
