import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ChatClient } from "@/components/chat/ChatClient";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = session.user;

  const chatSessions = await prisma.chatSession.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, title: true, updatedAt: true },
  });

  const serializedSessions = chatSessions.map((s) => ({
    id: s.id,
    title: s.title,
    updatedAt: s.updatedAt.toISOString(),
  }));

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "AI Chat" }]} />
      <ChatClient sessions={serializedSessions} />
    </>
  );
}
