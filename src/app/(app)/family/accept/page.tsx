import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getFamilyInvitationByToken, FamilyServiceError } from "@/lib/family-service";
import { FamilyAcceptClient } from "@/components/family/FamilyAcceptClient";

function InvalidInvitation({ title, message }: { title: string; message: string }) {
  return (
    <FamilyAcceptClient
      token=""
      invitation={null}
      currentEmail={null}
      emailMatches={false}
      error={{ title, message }}
    />
  );
}

export default async function FamilyAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const session = await auth();
  const { token } = await searchParams;

  if (!token) {
    return (
      <InvalidInvitation
        title="Invitation link missing"
        message="Open the link from your invitation email, or ask the owner to send it again."
      />
    );
  }

  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/family/accept?token=${token}`)}`);
  }

  let result: Awaited<ReturnType<typeof getFamilyInvitationByToken>> | null = null;
  let loadError: { title: string; message: string } | null = null;

  try {
    result = await getFamilyInvitationByToken(session.user.id, session.user.email, token);
  } catch (error) {
    if (error instanceof FamilyServiceError) {
      loadError = {
        title:
          error.code === "OWN_INVITATION" ? "This is your invitation" : "Invitation unavailable",
        message: error.message,
      };
    } else {
      console.error("Failed to load family invitation:", error);
      loadError = {
        title: "Invitation unavailable",
        message: "We could not load this invitation. Please try again.",
      };
    }
  }

  if (loadError) {
    return <InvalidInvitation title={loadError.title} message={loadError.message} />;
  }

  return (
    <FamilyAcceptClient
      token={token}
      invitation={result!.invitation}
      currentEmail={session.user.email ?? null}
      emailMatches={result!.emailMatches}
      error={null}
    />
  );
}
