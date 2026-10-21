import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { config } from "@/lib/config";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Wraps a route handler so every failure is structured JSON, never a stack trace. */
export async function api<T>(
  req: Request,
  fn: () => Promise<T>,
): Promise<Response> {
  try {
    const result = await fn();
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? { ok: true });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details ?? null } },
        { status: err.status },
      );
    }
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "validation_failed",
            message: "Request body failed validation.",
            details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          },
        },
        { status: 422 },
      );
    }
    // Database driver errors (connection refused, constraint violations…) get
    // logged server-side and surfaced as a safe 503/409, never leaked as HTML.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[facewise] unhandled API error:", message);
    if (message.includes("23505") || message.toLowerCase().includes("duplicate key")) {
      return NextResponse.json(
        { error: { code: "conflict", message: "That record already exists." } },
        { status: 409 },
      );
    }
    if (message.includes("ECONNREFUSED") || message.includes("connection") || message.includes("timeout")) {
      return NextResponse.json(
        { error: { code: "db_unreachable", message: "Database is unreachable. Check DATABASE_URL and that PostgreSQL is running." } },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: { code: "internal", message: "Internal server error." } },
      { status: 500 },
    );
  }
}

export async function readJson<T>(req: Request, schema: { parse: (v: unknown) => T }): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Body must be valid JSON.");
  }
  return schema.parse(raw);
}

// ---------------------------------------------------------------------------
// Tiny in-memory login rate limiter (per IP+email). Sufficient for a single
// classroom server; swap for Redis when horizontally scaling.
// ---------------------------------------------------------------------------
const attempts = new Map<string, { count: number; resetAt: number }>();

export function consumeRateLimit(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + config.loginWindowSeconds * 1000 });
    return;
  }
  entry.count += 1;
  if (entry.count > config.loginMaxAttempts) {
    throw new ApiError(429, "too_many_attempts", "Too many failed attempts. Try again later.");
  }
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() ?? "local";
}
