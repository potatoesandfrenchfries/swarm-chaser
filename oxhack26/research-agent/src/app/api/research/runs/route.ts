import { NextResponse } from "next/server";
import { errorResponse } from "~/lib/http";
import { createRun, listRuns } from "~/lib/research/repository";
import { createRunInput } from "~/lib/research/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ runs: await listRuns() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const input = createRunInput.parse(await req.json());
    const run = await createRun(input);
    return NextResponse.json({ runId: run.id, run }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
