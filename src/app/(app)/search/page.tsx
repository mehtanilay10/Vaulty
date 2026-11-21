import { auth } from "@/auth";
import { SearchClient } from "@/components/search/SearchClient";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { q } = await searchParams;

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Search" }]} />
      <SearchClient initialQuery={q || ""} />
    </>
  );
}
