import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord } from "@/lib/api-validation";
import { getCurrentUser } from "@/auth";
import { parseCSVStatement, parseTextStatementWithAiFallback } from "@/lib/statement-parser";
import { validateCSRFRequest } from "@/lib/csrf";
import { userRateLimitResponse } from "@/lib/security-rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = await userRateLimitResponse({
      userId: user.id,
      ...RATE_LIMITS.statementsParse,
    });
    if (rateLimited) return rateLimited;

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const body = await readJsonRecord(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    const { content, format } = body;

    if (!content) {
      return NextResponse.json({ error: "Statement content is required." }, { status: 400 });
    }

    if (!format || !["csv", "text"].includes(format)) {
      return NextResponse.json({ error: "Format must be 'csv' or 'text'." }, { status: 400 });
    }

    let result;
    try {
      if (format === "csv") {
        result = parseCSVStatement(content);
      } else {
        result = await parseTextStatementWithAiFallback(content);
      }
    } catch (parseError) {
      console.error("Statement parsing error:", parseError);
      const detail =
        parseError instanceof Error ? parseError.message : "Malformed statement content.";
      return NextResponse.json(
        { error: `Failed to parse ${format.toUpperCase()} statement: ${detail}` },
        { status: 400 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/wealth/statements/parse error:", error);
    const message = error instanceof Error ? error.message : "Failed to parse statement.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
