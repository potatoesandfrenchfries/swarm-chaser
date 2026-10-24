import { NextResponse } from "next/server";
import { getState } from "~/lib/db";
import { errorResponse, parseRole } from "~/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const role = parseRole(new URL(req.url).searchParams.get("role"));
    return NextResponse.json(getState(role));
  } catch (error) {
    return errorResponse(error, 400);
  }
}
