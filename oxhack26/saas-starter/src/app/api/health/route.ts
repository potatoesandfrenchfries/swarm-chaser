import { NextResponse } from "next/server";
import { prisma } from "~/lib/db";

export const dynamic = "force-dynamic";

// For uptime checks and deploy smoke tests.
export async function GET() {
  const checks: Record<string, "ok" | "fail"> = { api: "ok" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "fail";
  }
  const healthy = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json(
    { status: healthy ? "healthy" : "degraded", checks, time: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  );
}
