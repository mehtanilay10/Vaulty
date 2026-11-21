import { NextResponse } from "next/server";
import { FamilyServiceError } from "@/lib/family-service";
import { z } from "zod";

export function familyErrorResponse(error: unknown) {
  if (error instanceof FamilyServiceError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }

  console.error("Family API error:", error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export function parseJsonBody<T>(value: unknown, schema: z.ZodSchema<T>): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new FamilyServiceError("INVALID_REQUEST", "Invalid request body", 400);
  }
  return parsed.data;
}
