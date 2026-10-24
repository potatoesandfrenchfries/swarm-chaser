import { NextResponse } from "next/server";
import { errorResponse } from "~/lib/http";
import { listDocuments } from "~/lib/research/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ documents: await listDocuments() });
  } catch (error) {
    return errorResponse(error);
  }
}
