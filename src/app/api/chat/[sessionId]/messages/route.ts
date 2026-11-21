import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId: user.id },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, referencedDocs: true, createdAt: true },
    });

    const parsedMessages = messages.map((m) => {
      let referencedDocs = [];
      if (m.referencedDocs) {
        try {
          referencedDocs = JSON.parse(m.referencedDocs);
        } catch (parseError) {
          console.warn(
            `[chat/messages] Malformed referencedDocs JSON in message ${m.id}:`,
            parseError,
          );
          referencedDocs = [];
        }
      }
      return {
        ...m,
        referencedDocs,
      };
    });

    return NextResponse.json({ messages: parsedMessages });
  } catch (error) {
    console.error("GET /api/chat/[sessionId]/messages error:", error);
    return NextResponse.json({ error: "Failed to fetch messages." }, { status: 500 });
  }
}
