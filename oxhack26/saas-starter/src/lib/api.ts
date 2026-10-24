import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "./logger";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
export const apiError = (message: string, status: number) => json({ error: message }, status);

/** Run a route handler body; turn thrown validation and unexpected errors into JSON. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError(error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 400);
    }
    logger.error("Unhandled route error", {}, error);
    return apiError("Something went wrong.", 500);
  }
}
