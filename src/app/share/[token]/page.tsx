import { Metadata } from "next";
import { ShareClient } from "@/components/share/ShareClient";

interface SharePageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  await params;
  return {
    title: "Shared Document | Vaulty",
    description: "View a shared document from Vaulty",
  };
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  return <ShareClient token={token} />;
}
