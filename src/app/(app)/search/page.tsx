import { auth } from "@/auth";
import { SearchClient } from "@/components/search/SearchClient";

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
      <SearchClient initialQuery={q || ""} />
    </>
  );
}
