import { NextResponse } from "next/server";
import { errorResponse } from "~/lib/http";
import { ingestFile } from "~/lib/research/ingest";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return errorResponse(new Error("No file provided."), 400);
    return NextResponse.json(await ingestFile(file), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
