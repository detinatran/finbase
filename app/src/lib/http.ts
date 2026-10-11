import { NextResponse } from "next/server";

/** JSON response that serialises bigint as string. */
export function json(data: unknown, init?: ResponseInit) {
  const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  return new NextResponse(body, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
}

export function errorJson(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
  return json({ error: message }, { status });
}
