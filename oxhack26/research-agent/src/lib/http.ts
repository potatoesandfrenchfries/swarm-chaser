import { NextResponse } from "next/server";

/** One error shape for every route: `{ error: string }` with a status. */
export function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status });
}
