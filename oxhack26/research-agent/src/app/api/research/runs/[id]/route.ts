import { NextResponse } from "next/server";
import { errorResponse } from "~/lib/http";
import { getRunSnapshot } from "~/lib/research/repository";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await getRunSnapshot(id));
  } catch (error) {
    return errorResponse(error, 404);
  }
}
