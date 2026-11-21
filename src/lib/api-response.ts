import { NextResponse } from "next/server";

type ResponseOptions = { status?: number; headers?: HeadersInit };

/** Consistent JSON response defaults for authenticated API routes. */
export function apiSuccess<T>(data: T, options: ResponseOptions = {}) {
  return NextResponse.json(data, {
    status: options.status ?? 200,
    headers: { "Cache-Control": "private, no-store", ...options.headers },
  });
}

export function apiError(message: string, status: number, code?: string, headers?: HeadersInit) {
  return NextResponse.json(
    { error: message, ...(code ? { code } : {}) },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}
