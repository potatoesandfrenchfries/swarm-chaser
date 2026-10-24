import { NextResponse } from "next/server";
import { errorResponse } from "~/lib/http";
import { executeRun } from "~/lib/research/runtime";

export const dynamic = "force-dynamic";
// The whole graph runs inside this request. On Vercel this caps the run time;
// move executeRun to a queue or background worker if a run can take longer.
export const maxDuration = 300;

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await executeRun(id));
  } catch (error) {
    return errorResponse(error);
  }
}
